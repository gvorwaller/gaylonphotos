<script>
	/**
	 * Base Google Maps wrapper component.
	 * Loads the Maps JavaScript API and renders an interactive map.
	 *
	 * Props:
	 *   center: { lat, lng } — initial center
	 *   zoom: number — initial zoom (default: 10)
	 *   markers: Array<{ lat, lng, id, label?, color?, shape? }> — markers to display
	 *   polyline: Array<{ lat, lng }> | null — route line
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
	let searchInput = $state(null);
	let map = $state(null);
	let googleMarkers = []; // Array of { marker, handler } objects
	let googlePolyline = null;
	let infoWindowInstance = null;
	let searchAutocomplete = null;
	let apiLoaded = $state(false);
	let initialFitDone = false; // Not reactive — one-shot flag read inside effect

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

	// Load Google Maps API
	$effect(() => {
		if (!apiKey) return;
		if (window.google?.maps) {
			apiLoaded = true;
			return;
		}

		// Check if script is already being loaded
		if (document.querySelector('script[src*="maps.googleapis.com"]')) {
			const check = setInterval(() => {
				if (window.google?.maps) {
					apiLoaded = true;
					clearInterval(check);
				}
			}, 100);
			// Safety timeout: stop polling after 30s if API never loads
			const timeout = setTimeout(() => clearInterval(check), 30000);
			return () => { clearInterval(check); clearTimeout(timeout); };
		}

		const script = document.createElement('script');
		script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=marker,places`;
		script.async = true;
		script.onload = () => { apiLoaded = true; };
		script.onerror = () => { console.error('Failed to load Google Maps API'); };
		document.head.appendChild(script);
		return () => { script.onload = null; script.onerror = null; };
	});

	// Initialize map when API is loaded
	$effect(() => {
		if (!apiLoaded || !mapContainer) return;
		if (map) return; // already initialized

		map = new google.maps.Map(mapContainer, {
			center,
			zoom,
			mapId: 'DEMO_MAP_ID',
			mapTypeControl: true,
			streetViewControl: false,
			fullscreenControl: true
		});

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
			onboundschange({
				north: ne.lat(),
				south: sw.lat(),
				east: ne.lng(),
				west: sw.lng()
			});
		});

		if (onmapready) {
			onmapready(map);
		}
	});

	// Places Autocomplete for search overlay
	$effect(() => {
		if (!searchable || !map || !searchInput || !window.google?.maps?.places) return;
		if (searchAutocomplete) return;

		searchAutocomplete = new google.maps.places.Autocomplete(searchInput, {
			fields: ['geometry', 'name']
		});
		searchAutocomplete.bindTo('bounds', map);
		searchAutocomplete.addListener('place_changed', () => {
			const place = searchAutocomplete.getPlace();
			if (!place.geometry?.location) return;
			if (place.geometry.viewport) {
				map.fitBounds(place.geometry.viewport);
			} else {
				map.setCenter(place.geometry.location);
				map.setZoom(14);
			}
		});
	});

	// Sync markers (cleanup fn runs before re-execution, clearing old markers)
	$effect(() => {
		if (!map) return;
		const currentOnMarkerClick = onmarkerclick; // read synchronously for Svelte 5 dependency tracking
		if (infoWindowInstance) infoWindowInstance.close();

		// Add new markers
		for (const m of markers) {
			const contentEl = m.color ? createColoredMarkerElement(m.color, m.shape) : null;
			const marker = new google.maps.marker.AdvancedMarkerElement({
				position: { lat: m.lat, lng: m.lng },
				map,
				title: m.label || '',
				...(currentOnMarkerClick ? { gmpClickable: true } : {}),
				...(contentEl ? { content: contentEl } : {})
			});

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

			marker.addEventListener('gmp-click', handleClick);
			if (contentEl) contentEl.addEventListener('click', handleClick);

			googleMarkers.push({ marker, handler: handleClick, contentEl });
		}

		// Auto-fit bounds only on initial load (don't fight user panning)
		if (!initialFitDone && markers.length > 0) {
			initialFitDone = true;
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

		return () => {
			for (const { marker, handler, contentEl } of googleMarkers) {
				marker.removeEventListener('gmp-click', handler);
				if (contentEl) contentEl.removeEventListener('click', handler);
				marker.map = null;
			}
			googleMarkers = [];
		};
	});

	// Sync polyline — read both deps upfront so the effect always tracks map AND polyline
	$effect(() => {
		const currentMap = map;
		const currentPolyline = polyline;

		if (!currentMap) return;

		if (googlePolyline) {
			googlePolyline.setMap(null);
			googlePolyline = null;
		}

		if (currentPolyline && currentPolyline.length >= 2) {
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
		<div class="map-search">
			<input
				bind:this={searchInput}
				type="text"
				class="map-search-input"
				placeholder="Search for a place..."
			/>
		</div>
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
	}
	.map-container {
		width: 100%;
		height: 100%;
		border-radius: var(--radius-md, 8px);
	}
	.map-search {
		position: absolute;
		top: 10px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 1;
		width: min(320px, calc(100% - 100px));
	}
	.map-search-input {
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
