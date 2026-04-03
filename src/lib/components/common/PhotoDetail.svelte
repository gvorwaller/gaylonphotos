<script>
	/**
	 * Single photo page content with metadata display.
	 * Props: photo, collection, apiKey, photoNav
	 */
	import Map from './Map.svelte';

	let { photo, collection, apiKey = '', photoNav = [] } = $props();

	function formatDate(iso) {
		if (!iso) return null;
		try {
			return new Date(iso).toLocaleDateString('en-US', {
				year: 'numeric', month: 'long', day: 'numeric',
				hour: '2-digit', minute: '2-digit'
			});
		} catch {
			return iso;
		}
	}

	// Navigation
	let currentIndex = $derived(photoNav.findIndex((p) => p.id === photo.id));
	let totalPhotos = $derived(photoNav.length);
	let prevPhoto = $derived(currentIndex > 0 ? photoNav[currentIndex - 1] : null);
	let nextPhoto = $derived(currentIndex < totalPhotos - 1 ? photoNav[currentIndex + 1] : null);

	function navUrl(navItem) {
		return `/${encodeURIComponent(collection.slug)}/photo/${encodeURIComponent(navItem.id)}`;
	}

	function handleKeydown(e) {
		if (e.key === 'ArrowLeft' && prevPhoto) {
			window.location.href = navUrl(prevPhoto);
		} else if (e.key === 'ArrowRight' && nextPhoto) {
			window.location.href = navUrl(nextPhoto);
		}
	}

	// Swipe support
	let touchStartX = 0;
	let touchStartY = 0;

	function handleTouchStart(e) {
		touchStartX = e.touches[0].clientX;
		touchStartY = e.touches[0].clientY;
	}

	function handleTouchEnd(e) {
		const dx = e.changedTouches[0].clientX - touchStartX;
		const dy = e.changedTouches[0].clientY - touchStartY;
		// Only trigger on horizontal swipe (not vertical scroll)
		if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
			if (dx > 0 && prevPhoto) {
				window.location.href = navUrl(prevPhoto);
			} else if (dx < 0 && nextPhoto) {
				window.location.href = navUrl(nextPhoto);
			}
		}
	}

	let videoEl = $state(null);

	let metaItems = $derived.by(() => {
		const items = [];
		if (photo.duration) {
			const mins = Math.floor(photo.duration / 60);
			const secs = photo.duration % 60;
			items.push({ label: 'Duration', value: `${mins}:${String(secs).padStart(2, '0')}` });
		}
		if (photo.date) items.push({ label: 'Date', value: formatDate(photo.date) });
		if (photo.camera) items.push({ label: 'Camera', value: photo.camera });
		if (photo.lens) items.push({ label: 'Lens', value: photo.lens });
		if (photo.focalLength) items.push({ label: 'Focal Length', value: photo.focalLength });
		if (photo.aperture) items.push({ label: 'Aperture', value: photo.aperture });
		if (photo.shutterSpeed) items.push({ label: 'Shutter', value: photo.shutterSpeed });
		if (photo.iso) items.push({ label: 'ISO', value: String(photo.iso) });
		if (photo.locationName) {
			items.push({ label: 'Location', value: photo.locationName });
		} else if (photo.gps) {
			items.push({ label: 'GPS', value: `${photo.gps.lat.toFixed(4)}, ${photo.gps.lng.toFixed(4)}` });
		}
		if (photo.species) items.push({ label: 'Species', value: photo.species });
		if (photo.spot) items.push({ label: 'Spot', value: photo.spot });
		if (photo.conditions) items.push({ label: 'Conditions', value: photo.conditions });
		return items;
	});

	let mapLink = $derived(
		photo.gps
			? `/${encodeURIComponent(collection.slug)}?mapLat=${photo.gps.lat}&mapLng=${photo.gps.lng}`
			: null
	);
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="photo-detail">
	<div
		class="photo-main"
		role="presentation"
		ontouchstart={handleTouchStart}
		ontouchend={handleTouchEnd}
	>
		{#if prevPhoto}
			<a href={navUrl(prevPhoto)} class="photo-nav photo-nav-prev" aria-label="Previous photo">&#8249;</a>
		{/if}
		{#if photo.type === 'video' && photo.videoUrl}
			<!-- svelte-ignore a11y_media_has_caption -->
			<video
				bind:this={videoEl}
				src={photo.videoUrl}
				poster={photo.url}
				controls
				playsinline
				preload="metadata"
				class="photo-video"
			>
				Your browser does not support video playback.
			</video>
		{:else}
			<img src={photo.url} alt={photo.description || photo.filename} />
		{/if}
		{#if nextPhoto}
			<a href={navUrl(nextPhoto)} class="photo-nav photo-nav-next" aria-label="Next photo">&#8250;</a>
		{/if}
		{#if totalPhotos > 1}
			<div class="photo-counter">{currentIndex + 1} of {totalPhotos}</div>
		{/if}
	</div>

	<div class="photo-sidebar">
		<a href="/{collection.slug}" class="back-link">&larr; {collection.name}</a>

		{#if photo.description}
			<p class="photo-description">{photo.description}</p>
		{/if}

		{#if photo.tags?.length > 0}
			<div class="photo-tags">
				{#each photo.tags as tag}
					<span class="tag">{tag}</span>
				{/each}
			</div>
		{/if}

		<div class="meta-table">
			{#each metaItems as item}
				<div class="meta-row">
					<span class="meta-label">{item.label}</span>
					<span class="meta-value">{item.value}</span>
				</div>
			{/each}
		</div>

		{#if mapLink}
			<a href={mapLink} class="show-on-map-link">Show on Map &rarr;</a>
		{/if}

		{#if photo.gps && apiKey}
			<div class="photo-map">
				<Map
					{apiKey}
					center={photo.gps}
					zoom={13}
					markers={[{ lat: photo.gps.lat, lng: photo.gps.lng, id: photo.id }]}
				/>
			</div>
		{/if}
	</div>
</div>

<style>
	.photo-detail {
		display: grid;
		grid-template-columns: 1fr 320px;
		gap: 32px;
		padding: 24px 0;
	}
	.photo-main {
		position: relative;
	}
	.photo-main img, .photo-main .photo-video {
		width: 100%;
		border-radius: var(--radius-md);
	}
	.photo-video {
		outline: none;
		background: #000;
		display: block;
	}
	.photo-nav {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		font-size: 2.5rem;
		color: #fff;
		text-decoration: none;
		background: rgba(0, 0, 0, 0.3);
		padding: 8px 12px;
		border-radius: var(--radius-sm);
		opacity: 0;
		transition: opacity 0.2s;
		line-height: 1;
		z-index: 1;
	}
	.photo-main:hover .photo-nav {
		opacity: 0.7;
	}
	.photo-nav:hover {
		opacity: 1 !important;
		background: rgba(0, 0, 0, 0.6);
	}
	.photo-nav-prev {
		left: 8px;
	}
	.photo-nav-next {
		right: 8px;
	}
	.photo-counter {
		position: absolute;
		bottom: 12px;
		left: 50%;
		transform: translateX(-50%);
		background: rgba(0, 0, 0, 0.5);
		color: #fff;
		font-size: 0.75rem;
		font-weight: 600;
		padding: 4px 12px;
		border-radius: var(--radius-pill, 20px);
		opacity: 0;
		transition: opacity 0.2s;
	}
	.photo-main:hover .photo-counter {
		opacity: 1;
	}
	.photo-sidebar {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.back-link {
		color: var(--color-primary);
		text-decoration: none;
		font-size: 0.85rem;
		font-weight: 600;
	}
	.back-link:hover {
		text-decoration: underline;
	}
	.photo-description {
		font-size: 0.95rem;
		line-height: 1.5;
		color: var(--color-text);
	}
	.photo-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.tag {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 20px;
		padding: 2px 10px;
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}
	.meta-table {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.meta-row {
		display: flex;
		justify-content: space-between;
		font-size: 0.85rem;
		padding: 4px 0;
		border-bottom: 1px solid var(--color-border);
	}
	.meta-label {
		color: var(--color-text-muted);
		font-weight: 600;
	}
	.meta-value {
		color: var(--color-text);
	}
	.show-on-map-link {
		display: inline-block;
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--color-primary);
		text-decoration: none;
	}
	.show-on-map-link:hover {
		text-decoration: underline;
	}
	.photo-map {
		height: 200px;
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	@media (max-width: 768px) {
		.photo-detail {
			grid-template-columns: 1fr;
		}
	}
</style>
