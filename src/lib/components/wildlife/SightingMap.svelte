<script>
	/**
	 * Wildlife map with species-colored markers.
	 * Props: photos (with GPS), apiKey
	 */
	import Map from '$lib/components/common/Map.svelte';

	let { photos = [], apiKey = '' } = $props();

	// Simple hash → hue for species coloring
	function speciesColor(species) {
		if (!species) return '#4a90d9';
		let hash = 0;
		for (let i = 0; i < species.length; i++) {
			hash = species.charCodeAt(i) + ((hash << 5) - hash);
		}
		const hue = Math.abs(hash) % 360;
		return `hsl(${hue}, 65%, 50%)`;
	}

	let markers = $derived(
		photos
			.filter((p) => p.gps)
			.map((p) => ({
				lat: p.gps.lat,
				lng: p.gps.lng,
				id: p.id,
				label: p.species || p.filename,
				color: speciesColor(p.species)
			}))
	);
</script>

<div class="sighting-map">
	<Map
		{apiKey}
		center={{ lat: 35, lng: -95 }}
		zoom={4}
		{markers}
	/>
</div>

<style>
	.sighting-map {
		height: 450px;
		border-radius: var(--radius-lg);
		overflow: hidden;
		border: 1px solid var(--color-border);
	}
</style>
