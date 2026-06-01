<script>
	import { untrack } from 'svelte';
	import { PUBLIC_GOOGLE_MAPS_MAP_ID } from '$env/static/public';
	import { loadGoogleMaps } from '$lib/google-maps.js';
	/**
	 * Base Google Maps wrapper component.
	 * Loads the Maps JavaScript API and renders an interactive map.
	 *
	 * Props:
	 *   center: { lat, lng } — initial center
	 *   zoom: number — initial zoom (default: 10)
	 *   markers: Array<{ lat, lng, id, label?, color?, shape? }> — markers to display
	 *   polyline: Array<{ lat, lng }> | null — single route line (legacy)
 *   polylines: Array<{ path: Array<{lat,lng}>, color: string, dashed?: boolean }> | null — multiple route segments
	 *   clickable: boolean — if true, dispatches onmapclick (default: false)
	 *   apiKey: string — Google Maps API key
	 *   onmapclick: ({ lat, lng }) => void
	 *   onmarkerclick: ({ id, lat, lng, label }) => { content, zoomLevel } | null
	 *   onmapready: (map) => void
	 *   onboundschange: (bounds) => void — fires on idle with { north, south, east, west }
	 *   infoWindowEnabled: boolean — if true, opens InfoWindow with onmarkerclick result
	 */

	let {
		center = { lat: 0, lng: 0 },
		zoom = 10,
		markers = [],
		polyline = null,
		polylines = null,
		clickable = false,
		apiKey = '',
		onmapclick = null,
		onmarkerclick = null,
		onmapready = null,
		onboundschange = null,
		infoWindowEnabled = false,
		searchable = false,
		gotoTarget = null
	} = $props();

	let mapContainer;
	let searchQuery = $state('');
	let searchError = $state('');
	let map = $state(null);
	let googleMarkers = []; // Array of { marker, handler } objects
	let googlePolyline = null;
	let googlePolylines = [];
	let infoWindowInstance = null;
	let markerLibrary = null;
	let apiLoaded = $state(false);
	let initialFitDone = false; // Not reactive — one-shot flag read inside effect
	let markerFallbackWarned = false;

	/**
	 * Creates a colored marker DOM element for AdvancedMarkerElement content.
	 * shape: 'circle' (default) or 'diamond' for ancestry markers.
	 */
	function createColoredMarkerElement(color, shape = 'circle') {
		const div = document.createElement('div');
		if (shape === 'diamond') {
			div.style.width = '14px';
			div.style.height = '14px';
			div.style.backgroundColor = color;
			div.style.border = '2px solid #fff';
			div.style.boxShadow = '0 1px 3px rgba(0,0,0,0.4)';
			div.style.transform = 'rotate(45deg)';
			div.style.cursor = 'pointer';
		} else {
			div.style.width = '16px';
			div.style.height = '16px';
			div.style.borderRadius = '50%';
			div.style.backgroundColor = color;
			div.style.border = '2px solid #fff';
			div.style.boxShadow = '0 1px 3px rgba(0,0,0,0.4)';
			div.style.cursor = 'pointer';
		}
		return div;
	}

	function getLegacyMarkerIcon(color, shape = 'circle') {
		if (!color) return undefined;
		const symbolPath = shape === 'diamond'
			? 'M 0,-8 8,0 0,8 -8,0 z'
			: google.maps.SymbolPath.CIRCLE;
		return {
			path: symbolPath,
			fillColor: color,
			fillOpacity: 1,
			strokeColor: '#fff',
			strokeWeight: 2,
			scale: shape === 'diamond' ? 1 : 8
		};
	}

	function clearGoogleMarker(entry) {
		const { marker, handler, contentEl, listener } = entry;
		if (marker.removeEventListener) marker.removeEventListener('gmp-click', handler);
		if (contentEl) contentEl.removeEventListener('click', handler);
		if (listener?.remove) listener.remove();
		if (typeof marker.setMap === 'function') {
			marker.setMap(null);
		} else {
			marker.map = null;
		}
	}

	// Load Google Maps API
	$effect(() => {
		if (!apiKey) return;
		let cancelled = false;

		loadGoogleMaps(apiKey, ['maps', 'marker'])
			.then(({ marker }) => {
				if (cancelled) return;
				markerLibrary = marker || window.google?.maps?.marker || null;
				apiLoaded = true;
			})
			.catch((err) => {
				if (!cancelled) console.error('Failed to load Google Maps API:', err);
			});

		return () => { cancelled = true; };
	});

	// Initialize map when API is loaded
	$effect(() => {
		if (!apiLoaded || !mapContainer) return;
		if (map) return; // already initialized

		const mapOptions = {
			center,
			zoom,
			mapTypeControl: true,
			streetViewControl: false,
			fullscreenControl: true
		};
		// AdvancedMarkerElement requires a valid Map ID or pins won't render.
		// Provided via PUBLIC_GOOGLE_MAPS_MAP_ID (.env) — must also be set in the
		// droplet's .env since `npm run build` runs server-side and inlines PUBLIC_* vars.
		if (PUBLIC_GOOGLE_MAPS_MAP_ID) mapOptions.mapId = PUBLIC_GOOGLE_MAPS_MAP_ID;
		map = new google.maps.Map(mapContainer, mapOptions);

		// InfoWindow created once at mount — infoWindowEnabled cannot change dynamically
		if (infoWindowEnabled) {
			infoWindowInstance = new google.maps.InfoWindow({ maxWidth: 320 });
		}

		if (clickable) {
			map.addListener('click', (e) => {
				if (onmapclick) {
					onmapclick({ lat: e.latLng.lat(), lng: e.latLng.lng() });
				}
			});
		}

		map.addListener('idle', () => {
			if (!onboundschange) return;
			const b = map.getBounds();
			if (!b) return;
			const ne = b.getNorthEast();
			const sw = b.getSouthWest();
			const c = map.getCenter();
			onboundschange({
				north: ne.lat(),
				south: sw.lat(),
				east: ne.lng(),
				west: sw.lng(),
				centerLat: c.lat(),
				centerLng: c.lng(),
				zoom: map.getZoom()
			});
		});

		if (onmapready) {
			onmapready(map);
		}
	});

	async function handleSearch(e) {
		e.preventDefault();
		if (!map || !apiKey || !searchQuery.trim()) return;

		searchError = '';
		try {
			const response = await fetch('/api/geocode', {
				method: 'POST',
				credentials: 'same-origin',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query: searchQuery })
			});
			const result = await response.json();
			if (!response.ok) {
				searchError = result.error || 'Search failed';
				return;
			}
			if (result.bounds) {
				const bounds = new google.maps.LatLngBounds(
					result.bounds.southwest,
					result.bounds.northeast
				);
				map.fitBounds(bounds);
			} else {
				map.setCenter({ lat: result.lat, lng: result.lng });
				map.setZoom(14);
			}
		} catch (err) {
			console.warn('Place search failed:', err);
			searchError = 'Search failed';
		}
	}

	// Sync markers (cleanup fn runs before re-execution, clearing old markers)
	$effect(() => {
		if (!map) return;
		const currentOnMarkerClick = onmarkerclick; // read synchronously for Svelte 5 dependency tracking
		if (infoWindowInstance) infoWindowInstance.close();

		// Add new markers
		for (const m of markers) {
			const contentEl = m.color ? createColoredMarkerElement(m.color, m.shape) : null;
			const AdvancedMarkerElement = markerLibrary?.AdvancedMarkerElement;
			const canUseAdvancedMarker = PUBLIC_GOOGLE_MAPS_MAP_ID && AdvancedMarkerElement;
			let marker;

			const handleClick = () => {
				if (!currentOnMarkerClick) return;
				const result = currentOnMarkerClick({ id: m.id, lat: m.lat, lng: m.lng, label: m.label });
				if (infoWindowEnabled && result?.content) {
					// Lazy-create InfoWindow (survives HMR where plain lets reset but $state map persists)
					if (!infoWindowInstance) {
						infoWindowInstance = new google.maps.InfoWindow({ maxWidth: 320 });
					}
					infoWindowInstance.setContent(result.content);
					infoWindowInstance.open({ anchor: marker, map });
					map.panTo({ lat: m.lat, lng: m.lng });
					const targetZoom = result.zoomLevel ?? 11;
					if (map.getZoom() < targetZoom) map.setZoom(targetZoom);
				}
			};

			let listener = null;
			if (canUseAdvancedMarker) {
				marker = new AdvancedMarkerElement({
					position: { lat: m.lat, lng: m.lng },
					map,
					title: m.label || '',
					...(currentOnMarkerClick ? { gmpClickable: true } : {}),
					...(contentEl ? { content: contentEl } : {})
				});
				marker.addEventListener('gmp-click', handleClick);
				if (contentEl) contentEl.addEventListener('click', handleClick);
			} else {
				if (!markerFallbackWarned) {
					console.warn('Advanced Google Maps markers unavailable; using classic Marker fallback.');
					markerFallbackWarned = true;
				}
				marker = new google.maps.Marker({
					position: { lat: m.lat, lng: m.lng },
					map,
					title: m.label || '',
					icon: getLegacyMarkerIcon(m.color, m.shape)
				});
				if (currentOnMarkerClick) {
					listener = marker.addListener('click', handleClick);
				}
			}

			googleMarkers.push({ marker, handler: handleClick, contentEl, listener });
		}

		// Auto-fit bounds only on initial load (don't fight user panning).
		// Skip if a saved position exists — the gotoTarget effect will handle centering.
		if (!initialFitDone && markers.length > 0) {
			initialFitDone = true;
			if (!untrack(() => gotoTarget)) {
				if (markers.length > 1) {
					const bounds = new google.maps.LatLngBounds();
					for (const m of markers) {
						bounds.extend({ lat: m.lat, lng: m.lng });
					}
					map.fitBounds(bounds, { padding: 50 });
				} else {
					map.setCenter({ lat: markers[0].lat, lng: markers[0].lng });
				}
			}
		}

		return () => {
			for (const markerEntry of googleMarkers) clearGoogleMarker(markerEntry);
			googleMarkers = [];
		};
	});

	// Sync polylines — supports both single `polyline` prop (legacy) and multi `polylines` prop
	$effect(() => {
		const currentMap = map;
		const currentPolyline = polyline;
		const currentPolylines = polylines;

		if (!currentMap) return;

		// Clean up old polyline(s)
		if (googlePolyline) {
			googlePolyline.setMap(null);
			googlePolyline = null;
		}
		for (const gp of googlePolylines) gp.setMap(null);
		googlePolylines = [];

		if (currentPolylines && currentPolylines.length > 0) {
			// Multi-polyline mode
			for (const seg of currentPolylines) {
				if (!seg.path || seg.path.length < 2) continue;
				const color = seg.color || '#28a745';
				const opts = {
					path: seg.path,
					geodesic: true,
					strokeColor: color,
					strokeOpacity: seg.dashed ? 0 : 0.8,
					strokeWeight: 3,
					map: currentMap
				};
				if (seg.dashed) {
					opts.icons = [{
						icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.8, strokeColor: color, scale: 3 },
						offset: '0',
						repeat: '14px'
					}, {
						icon: {
							path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
							scale: 3, strokeColor: color, strokeOpacity: 1,
							fillColor: color, fillOpacity: 0.8
						},
						offset: '50%',
						repeat: '90px'
					}];
				} else {
					opts.icons = [{
						icon: {
							path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
							scale: 3, strokeColor: color, strokeOpacity: 1,
							fillColor: color, fillOpacity: 0.8
						},
						offset: '50%',
						repeat: '90px'
					}];
				}
				googlePolylines.push(new google.maps.Polyline(opts));
			}
		} else if (currentPolyline && currentPolyline.length >= 2) {
			// Legacy single polyline mode
			googlePolyline = new google.maps.Polyline({
				path: currentPolyline,
				geodesic: true,
				strokeColor: '#28a745',
				strokeOpacity: 0.8,
				strokeWeight: 3,
				icons: [{
					icon: {
						path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
						scale: 3,
						strokeColor: '#28a745',
						strokeOpacity: 1,
						fillColor: '#28a745',
						fillOpacity: 0.8
					},
					offset: '50%',
					repeat: '90px'
				}],
				map: currentMap
			});
		}

		return () => {
			if (googlePolyline) {
				googlePolyline.setMap(null);
				googlePolyline = null;
			}
			for (const gp of googlePolylines) gp.setMap(null);
			googlePolylines = [];
		};
	});

	// Pan/zoom to a target location when gotoTarget prop changes
	$effect(() => {
		if (!map || !gotoTarget) return;
		const { lat, lng } = gotoTarget;
		const targetZoom = gotoTarget.zoom ?? 11;
		map.panTo({ lat, lng });
		map.setZoom(targetZoom);
	});

	// Component cleanup — clear map listeners and InfoWindow on destroy
	// Markers and polyline are cleaned up by their own effects above
	$effect(() => {
		const currentMap = map;
		return () => {
			if (infoWindowInstance) {
				infoWindowInstance.close();
				infoWindowInstance = null;
			}
			if (currentMap) google.maps.event.clearInstanceListeners(currentMap);
		};
	});
</script>

<div class="map-wrapper">
	{#if searchable}
		<form class="map-search" onsubmit={handleSearch}>
			<input
				bind:value={searchQuery}
				type="text"
				class="map-search-input"
				placeholder="Search for a place..."
			/>
			<button type="submit" class="map-search-button">Search</button>
			{#if searchError}
				<div class="map-search-error">{searchError}</div>
			{/if}
		</form>
	{/if}
	<div bind:this={mapContainer} class="map-container"></div>
	{#if !apiLoaded}
		<div class="map-loading">Loading map...</div>
	{/if}
</div>

<style>
	.map-wrapper {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 300px;
		display: flex;
		flex-direction: column;
	}
	.map-container {
		flex: 1;
		width: 100%;
		height: 100%;
		min-height: 300px;
		border-radius: var(--radius-md, 8px);
	}
	.map-search {
		position: absolute;
		top: 10px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 10;
		display: flex;
		gap: 6px;
		align-items: flex-start;
		width: min(420px, calc(100% - 100px));
	}
	.map-search-input {
		flex: 1 1 auto;
		min-width: 0;
		width: 100%;
		padding: 8px 12px;
		border: 1px solid var(--color-border, #e9ecef);
		border-radius: var(--radius-sm, 4px);
		font-size: 0.85rem;
		font-family: inherit;
		background: #fff;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
		outline: none;
	}
	.map-search-input:focus {
		border-color: var(--color-primary, #28a745);
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15), 0 0 0 3px rgba(40, 167, 69, 0.15);
	}
	.map-search-button {
		flex: 0 0 auto;
		padding: 8px 10px;
		border: 1px solid var(--color-border, #e9ecef);
		border-radius: var(--radius-sm, 4px);
		background: #fff;
		color: var(--color-text, #212529);
		font-size: 0.8rem;
		font-weight: 700;
		cursor: pointer;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
	}
	.map-search-error {
		position: absolute;
		top: 100%;
		left: 0;
		margin-top: 4px;
		padding: 4px 8px;
		background: #fff;
		border-radius: var(--radius-sm, 4px);
		color: var(--color-danger, #dc3545);
		font-size: 0.75rem;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
	}
	.map-loading {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--color-surface, #f8f9fa);
		color: var(--color-text-muted, #6c757d);
		border-radius: var(--radius-md, 8px);
	}
</style>
