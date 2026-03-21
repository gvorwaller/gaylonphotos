<script>
	/**
	 * Wildlife map with species-colored markers.
	 * Props: photos (with GPS), apiKey, collectionSlug
	 */
	import Map from '$lib/components/common/Map.svelte';

	let { photos = [], apiKey = '', onboundschange = null, collectionSlug = '', gotoTarget = null } = $props();

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

	function esc(str) {
		if (str == null) return '';
		return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
	}

	function handleMarkerClick({ id }) {
		const photo = photos.find((p) => p.id === id);
		if (!photo) return null;
		const href = `/${encodeURIComponent(collectionSlug)}/photo/${encodeURIComponent(photo.id)}`;
		const thumb = photo.thumbnail || photo.url;
		let html = '<div style="font-family:system-ui,-apple-system,sans-serif;font-size:13px;color:#212529;line-height:1.4;">';
		if (thumb) {
			html += `<a href="${esc(href)}" style="display:block;margin-bottom:6px;"><img src="${esc(thumb)}" alt="${esc(photo.description || photo.filename)}" style="width:140px;border-radius:4px;"></a>`;
		}
		if (photo.species) html += `<div style="font-weight:700;font-style:italic;margin-bottom:2px;">${esc(photo.species)}</div>`;
		if (photo.locationName) html += `<div style="color:#6c757d;font-size:12px;">${esc(photo.locationName)}</div>`;
		if (photo.date) {
			try {
				const d = new Date(photo.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
				html += `<div style="color:#6c757d;font-size:12px;">${esc(d)}</div>`;
			} catch {}
		}
		html += '</div>';
		return { content: html, zoomLevel: 13 };
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
		{onboundschange}
		searchable={true}
		infoWindowEnabled={true}
		onmarkerclick={handleMarkerClick}
		{gotoTarget}
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
