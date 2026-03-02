<script>
	/**
	 * Travel collection map showing itinerary stops and photo locations.
	 * Props: photos (with GPS), stops, apiKey
	 */
	import Map from '$lib/components/common/Map.svelte';

	let {
		photos = [],
		stops = [],
		apiKey = '',
		onboundschange = null,
		ancestryPlaces = [],
		showAncestry = false
	} = $props();

	let markers = $derived.by(() => {
		const m = [];

		// Stop markers (numbered, green circles)
		for (let i = 0; i < stops.length; i++) {
			const s = stops[i];
			if (s.lat != null && s.lng != null) {
				m.push({
					lat: s.lat,
					lng: s.lng,
					id: `stop-${s.id}`,
					label: `${i + 1}. ${s.city}`,
					color: '#28a745'
				});
			}
		}

		// Photo markers (blue circles)
		for (const p of photos) {
			if (p.gps) {
				m.push({
					lat: p.gps.lat,
					lng: p.gps.lng,
					id: `photo-${p.id}`,
					label: p.description || p.filename,
					color: '#4a90d9'
				});
			}
		}

		// Ancestry markers (purple diamonds)
		if (showAncestry) {
			for (const place of ancestryPlaces) {
				if (place.lat != null && place.lng != null) {
					const count = place.events?.length || 0;
					m.push({
						lat: place.lat,
						lng: place.lng,
						id: `ancestry-${place.id}`,
						label: `${place.name} (${count} event${count !== 1 ? 's' : ''})`,
						color: '#8B5CF6',
						shape: 'diamond'
					});
				}
			}
		}

		return m;
	});

	let polylinePath = $derived(
		stops.filter((s) => s.lat != null && s.lng != null).map((s) => ({ lat: s.lat, lng: s.lng }))
	);
</script>

<div class="itinerary-map">
	<Map
		{apiKey}
		center={{ lat: 55, lng: 15 }}
		zoom={4}
		markers={markers}
		polyline={polylinePath}
		{onboundschange}
	/>
</div>

<style>
	.itinerary-map {
		height: 450px;
		border-radius: var(--radius-lg);
		overflow: hidden;
		border: 1px solid var(--color-border);
	}
</style>
