<script>
	/**
	 * Action/surf collection: photos grouped by spot with embedded map.
	 * Props: photos, apiKey
	 */
	import GoogleMap from '$lib/components/common/Map.svelte';
	import Lightbox from '$lib/components/common/Lightbox.svelte';

	let { photos = [], apiKey = '', onboundschange = null, collectionSlug = '', gotoTarget = null } = $props();

	let lightboxPhoto = $state(null);

	function openLightbox(photo) {
		lightboxPhoto = photo;
	}

	function closeLightbox() {
		lightboxPhoto = null;
	}

	let spotGroups = $derived.by(() => {
		const groups = new Map();
		for (const p of photos) {
			const spot = p.spot || 'Unknown Spot';
			if (!groups.has(spot)) {
				groups.set(spot, { spot, photos: [], gps: p.gps });
			}
			groups.get(spot).photos.push(p);
			// Use first photo's GPS as spot location
			if (!groups.get(spot).gps && p.gps) {
				groups.get(spot).gps = p.gps;
			}
		}
		return [...groups.values()].sort((a, b) => b.photos.length - a.photos.length);
	});

	let allPhotosFlat = $derived(spotGroups.flatMap((g) => g.photos));

	let markers = $derived.by(() => {
		return spotGroups
			.filter((g) => g.gps)
			.map((g) => ({
				lat: g.gps.lat,
				lng: g.gps.lng,
				id: `spot-${g.spot}`,
				label: `${g.spot} (${g.photos.length})`,
				color: '#ff6b35'
			}));
	});

	function esc(str) {
		if (str == null) return '';
		return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
	}

	function handleMarkerClick({ id }) {
		const spotName = id.replace(/^spot-/, '');
		const group = spotGroups.find((g) => g.spot === spotName);
		if (!group) return null;

		const photo = group.photos[0];
		const thumb = photo?.thumbnail || photo?.url;
		let html = '<div style="font-family:system-ui,-apple-system,sans-serif;font-size:13px;color:#212529;line-height:1.4;">';
		html += `<div style="font-weight:700;margin-bottom:4px;">${esc(group.spot)}</div>`;
		if (thumb) {
			const href = `/${encodeURIComponent(collectionSlug)}/photo/${encodeURIComponent(photo.id)}`;
			html += `<a href="${esc(href)}" style="display:block;margin-bottom:6px;"><img src="${esc(thumb)}" alt="${esc(group.spot)}" style="width:140px;border-radius:4px;"></a>`;
		}
		html += `<div style="color:#6c757d;font-size:12px;">${group.photos.length} photo${group.photos.length !== 1 ? 's' : ''}</div>`;
		html += '</div>';

		// Also scroll to the spot section
		scrollToSpot(spotName);

		return { content: html, zoomLevel: 12 };
	}

	function scrollToSpot(spot) {
		const el = document.getElementById(`spot-${spot.replace(/\s+/g, '-')}`);
		el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}
</script>

<div class="spot-gallery">
	{#if apiKey}
		<div class="spot-map">
			<GoogleMap
				{apiKey}
				center={{ lat: 25, lng: -110 }}
				zoom={4}
				markers={markers}
				{onboundschange}
				searchable={true}
				infoWindowEnabled={true}
				onmarkerclick={handleMarkerClick}
				{gotoTarget}
			/>
		</div>
	{/if}

	<div class="spot-sections">
		{#each spotGroups as group (group.spot)}
			<section id="spot-{group.spot.replace(/\s+/g, '-')}" class="spot-section">
				<div class="spot-header">
					<h3>{group.spot}</h3>
					<span class="spot-count">{group.photos.length} photo{group.photos.length !== 1 ? 's' : ''}</span>
				</div>
				<div class="spot-photos">
					{#each group.photos as photo (photo.id)}
						<button class="spot-photo" onclick={() => openLightbox(photo)}>
							<img src={photo.thumbnail} alt={photo.description || photo.filename} loading="lazy" />
							{#if photo.conditions}
								<span class="photo-conditions">{photo.conditions}</span>
							{/if}
							{#if photo.type === 'video'}
								<span class="spot-play-badge" aria-label="Video">&#9654;</span>
							{/if}
						</button>
					{/each}
				</div>
			</section>
		{/each}
	</div>
</div>

{#if lightboxPhoto}
	<Lightbox photo={lightboxPhoto} photos={allPhotosFlat} onclose={closeLightbox} {collectionSlug} />
{/if}

<style>
	.spot-gallery {
		display: flex;
		flex-direction: column;
		gap: 24px;
	}
	.spot-map {
		height: 350px;
		border-radius: var(--radius-lg);
		overflow: hidden;
		border: 1px solid var(--color-border);
		margin-bottom: 24px;
	}
	.spot-sections {
		display: flex;
		flex-direction: column;
		gap: 32px;
	}
	.spot-header {
		display: flex;
		align-items: baseline;
		gap: 12px;
		margin-bottom: 12px;
	}
	.spot-header h3 {
		font-size: 1.1rem;
		font-weight: 700;
	}
	.spot-count {
		font-size: 0.8rem;
		color: var(--color-text-muted);
	}
	.spot-photos {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 8px;
	}
	.spot-photo {
		position: relative;
		aspect-ratio: 1;
		overflow: hidden;
		border-radius: var(--radius-sm);
		cursor: pointer;
		border: none;
		padding: 0;
		background: var(--color-surface);
	}
	.spot-photo img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		transition: transform 0.2s;
	}
	.spot-photo:hover img {
		transform: scale(1.05);
	}
	.spot-play-badge {
		position: absolute;
		bottom: 6px;
		left: 6px;
		color: #fff;
		font-size: 0.85rem;
		background: rgba(0, 0, 0, 0.55);
		width: 28px;
		height: 28px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		padding-left: 2px;
	}
	.photo-conditions {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		background: linear-gradient(transparent, rgba(0,0,0,0.7));
		color: #fff;
		font-size: 0.7rem;
		padding: 12px 8px 6px;
	}

	@media (max-width: 768px) {
		.spot-photos {
			grid-template-columns: repeat(2, 1fr);
		}
	}
</style>
