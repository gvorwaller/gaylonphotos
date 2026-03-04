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
		infoWindowEnabled = false
	} = $props();

	let mapContainer;
	let map = $state(null);
	let googleMarkers = [];
	let googlePolyline = null;
	let infoWindowInstance = null;
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
				if (infoWindowEnabled && infoWindowInstance && result?.content) {
					infoWindowInstance.setContent(result.content);
					infoWindowInstance.open({ anchor: marker, map });
					map.panTo({ lat: m.lat, lng: m.lng });
					const targetZoom = result.zoomLevel ?? 11;
					if (map.getZoom() < targetZoom) map.setZoom(targetZoom);
				}
			};

			marker.addListener('click', handleClick);

			googleMarkers.push(marker);
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
			for (const m of googleMarkers) {
				google.maps.event.clearInstanceListeners(m);
				m.map = null;
			}
			googleMarkers = [];
		};
	});

	// Sync polyline
	$effect(() => {
		if (!map) return;

		if (googlePolyline) {
			googlePolyline.setMap(null);
			googlePolyline = null;
		}

		if (polyline && polyline.length >= 2) {
			googlePolyline = new google.maps.Polyline({
				path: polyline,
				geodesic: true,
				strokeColor: '#28a745',
				strokeOpacity: 0.8,
				strokeWeight: 3,
				map
			});
		}

		return () => {
			if (googlePolyline) {
				googlePolyline.setMap(null);
				googlePolyline = null;
			}
		};
	});

	// Component cleanup — clear all map listeners on destroy
	$effect(() => {
		const currentMap = map;
		return () => {
			if (infoWindowInstance) {
				infoWindowInstance.close();
				infoWindowInstance = null;
			}
			if (currentMap) google.maps.event.clearInstanceListeners(currentMap);
			for (const m of googleMarkers) m.map = null;
			googleMarkers = [];
			if (googlePolyline) {
				googlePolyline.setMap(null);
				googlePolyline = null;
			}
		};
	});
</script>

<div class="map-wrapper">
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
