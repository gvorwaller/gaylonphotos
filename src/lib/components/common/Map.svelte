<script>
	/**
	 * Base Google Maps wrapper component.
	 * Loads the Maps JavaScript API and renders an interactive map.
	 *
	 * Props:
	 *   center: { lat, lng } — initial center
	 *   zoom: number — initial zoom (default: 10)
	 *   markers: Array<{ lat, lng, id, label?, color? }> — markers to display
	 *   polyline: Array<{ lat, lng }> | null — route line
	 *   clickable: boolean — if true, dispatches onmapclick (default: false)
	 *   apiKey: string — Google Maps API key
	 *   onmapclick: ({ lat, lng }) => void
	 *   onmarkerclick: ({ id }) => void
	 */

	let {
		center = { lat: 0, lng: 0 },
		zoom = 10,
		markers = [],
		polyline = null,
		clickable = false,
		apiKey = '',
		onmapclick = null,
		onmarkerclick = null
	} = $props();

	let mapContainer;
	let map = $state(null);
	let googleMarkers = [];
	let googlePolyline = null;
	let apiLoaded = $state(false);

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
		script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=marker`;
		script.async = true;
		script.onload = () => { apiLoaded = true; };
		script.onerror = () => { console.error('Failed to load Google Maps API'); };
		document.head.appendChild(script);
	});

	// Initialize map when API is loaded
	$effect(() => {
		if (!apiLoaded || !mapContainer) return;
		if (map) return; // already initialized

		map = new google.maps.Map(mapContainer, {
			center,
			zoom,
			mapTypeControl: true,
			streetViewControl: false,
			fullscreenControl: true
		});

		if (clickable) {
			map.addListener('click', (e) => {
				if (onmapclick) {
					onmapclick({ lat: e.latLng.lat(), lng: e.latLng.lng() });
				}
			});
		}
	});

	// Sync markers
	$effect(() => {
		if (!map) return;

		// Clear old markers
		for (const m of googleMarkers) {
			m.setMap(null);
		}
		googleMarkers = [];

		// Add new markers
		for (const m of markers) {
			const marker = new google.maps.Marker({
				position: { lat: m.lat, lng: m.lng },
				map,
				title: m.label || '',
				...(m.color ? {
					icon: {
						path: google.maps.SymbolPath.CIRCLE,
						scale: 8,
						fillColor: m.color,
						fillOpacity: 0.9,
						strokeColor: '#fff',
						strokeWeight: 2
					}
				} : {})
			});

			if (onmarkerclick) {
				marker.addListener('click', () => {
					onmarkerclick({ id: m.id, lat: m.lat, lng: m.lng, label: m.label });
				});
			}

			googleMarkers.push(marker);
		}

		// Auto-fit bounds if we have markers
		if (markers.length > 1) {
			const bounds = new google.maps.LatLngBounds();
			for (const m of markers) {
				bounds.extend({ lat: m.lat, lng: m.lng });
			}
			map.fitBounds(bounds, { padding: 50 });
		} else if (markers.length === 1) {
			map.setCenter({ lat: markers[0].lat, lng: markers[0].lng });
		}
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
