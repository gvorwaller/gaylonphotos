<script>
	/**
	 * Travel collection map showing itinerary stops and photo locations.
	 * Props: photos (with GPS), stops, apiKey
	 */
	import Map from '$lib/components/common/Map.svelte';

	let { photos = [], stops = [], apiKey = '' } = $props();

	let markers = $derived.by(() => {
		const m = [];

		// Stop markers (numbered, green)
		for (let i = 0; i < stops.length; i++) {
			const s = stops[i];
			if (s.lat && s.lng) {
				m.push({
					lat: s.lat,
					lng: s.lng,
					id: `stop-${s.id}`,
					label: `${i + 1}. ${s.city}`,
					color: '#28a745'
				});
			}
		}

		// Photo markers (blue, smaller)
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

		return m;
	});

	let polylinePath = $derived(
		stops.filter((s) => s.lat && s.lng).map((s) => ({ lat: s.lat, lng: s.lng }))
	);
</script>

<div class="itinerary-map">
	<Map
		{apiKey}
		center={{ lat: 55, lng: 15 }}
		zoom={4}
		markers={markers}
		polyline={polylinePath}
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
