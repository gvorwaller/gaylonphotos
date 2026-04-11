<script>
	/**
	 * Full-screen photo viewer with prev/next navigation.
	 * Props: photo (current), photos (all, for navigation), onclose, collectionSlug
	 */
	let { photo, photos = [], onclose = null, collectionSlug = '' } = $props();

	let currentIndex = $derived(photos.findIndex((p) => p.id === photo.id));
	let currentPhoto = $derived(currentIndex >= 0 ? photos[currentIndex] : photo);
	let hasPrev = $derived(currentIndex > 0);
	let hasNext = $derived(currentIndex < photos.length - 1);

	// Internal navigation state override — reset when photo prop changes
	let navIndex = $state(null);

	$effect(() => {
		// When the parent changes the photo prop, reset internal nav
		photo; // track photo as dependency
		navIndex = null;
	});
	let displayIndex = $derived(navIndex ?? currentIndex);
	let displayPhoto = $derived(
		navIndex !== null && navIndex >= 0 && navIndex < photos.length
			? photos[navIndex]
			: currentPhoto
	);

	let videoEl = $state(null);

	function goPrev() {
		videoEl?.pause();
		const idx = navIndex ?? currentIndex;
		if (idx > 0) navIndex = idx - 1;
	}

	function goNext() {
		videoEl?.pause();
		const idx = navIndex ?? currentIndex;
		if (idx < photos.length - 1) navIndex = idx + 1;
	}

	function handleKeydown(e) {
		if (e.key === 'Escape') { videoEl?.pause(); onclose?.(); return; }
		if (e.key === 'ArrowLeft') goPrev();
		if (e.key === 'ArrowRight') goNext();
	}

	function handleOverlayClick(e) {
		if (e.target === e.currentTarget) onclose?.();
	}

	// Touch swipe support
	let touchStartX = 0;
	let touchStartY = 0;

	function handleTouchStart(e) {
		touchStartX = e.touches[0].clientX;
		touchStartY = e.touches[0].clientY;
	}

	function handleTouchEnd(e) {
		const dx = e.changedTouches[0].clientX - touchStartX;
		const dy = e.changedTouches[0].clientY - touchStartY;
		if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
			if (dx > 0) goPrev();
			else goNext();
		}
	}

	// Trackpad horizontal swipe support (debounced)
	let wheelAccum = 0;
	let wheelTimer = null;

	function handleWheel(e) {
		// Only handle horizontal-dominant gestures
		if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
		e.preventDefault();
		wheelAccum += e.deltaX;
		clearTimeout(wheelTimer);
		wheelTimer = setTimeout(() => {
			if (wheelAccum > 80) goNext();
			else if (wheelAccum < -80) goPrev();
			wheelAccum = 0;
		}, 100);
	}

	function formatDate(iso) {
		if (!iso) return null;
		try {
			return new Date(iso).toLocaleDateString('en-US', {
				year: 'numeric', month: 'long', day: 'numeric'
			});
		} catch {
			return iso;
		}
	}

	let mapLink = $derived(
		displayPhoto.gps && collectionSlug
			? `/${encodeURIComponent(collectionSlug)}?mapLat=${displayPhoto.gps.lat}&mapLng=${displayPhoto.gps.lng}`
			: null
	);
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
	class="lightbox-overlay"
	onclick={handleOverlayClick}
	ontouchstart={handleTouchStart}
	ontouchend={handleTouchEnd}
	onwheel={handleWheel}
	role="dialog"
	aria-modal="true"
	aria-label="Photo lightbox"
	tabindex="-1"
>
	<button class="lightbox-close" onclick={onclose} aria-label="Close">&times;</button>

	{#if photos.length > 1}
		<div class="lightbox-counter">{displayIndex + 1} of {photos.length}</div>
	{/if}

	{#if displayIndex > 0}
		<button class="lightbox-nav lightbox-prev" onclick={goPrev} aria-label="Previous photo">&#8249;</button>
	{/if}

	{#if displayIndex < photos.length - 1}
		<button class="lightbox-nav lightbox-next" onclick={goNext} aria-label="Next photo">&#8250;</button>
	{/if}

	<div class="lightbox-content">
		{#if displayPhoto.type === 'video' && displayPhoto.videoUrl}
			<!-- svelte-ignore a11y_media_has_caption -->
			<video
				bind:this={videoEl}
				src={displayPhoto.videoUrl}
				poster={displayPhoto.url}
				controls
				playsinline
				preload="metadata"
				class="lightbox-image"
			>
				Your browser does not support video playback.
			</video>
		{:else}
			<img src={displayPhoto.url} alt={displayPhoto.description || displayPhoto.filename} class="lightbox-image" />
		{/if}

		<div class="lightbox-info">
			{#if displayPhoto.description}
				<p class="lightbox-desc">{displayPhoto.description}</p>
			{/if}
			{#if displayPhoto.links?.length > 0}
				<div class="lightbox-links">
					{#each displayPhoto.links as link}
						<a href={link.url} class="lightbox-link" target="_blank" rel="noopener noreferrer">
							{link.label} &rarr;
						</a>
					{/each}
				</div>
			{/if}
			<div class="lightbox-meta">
				{#if displayPhoto.duration}
					<span>{Math.floor(displayPhoto.duration / 60)}:{String(displayPhoto.duration % 60).padStart(2, '0')}</span>
				{/if}
				{#if displayPhoto.species}
					<span class="lightbox-species">{displayPhoto.species}</span>
				{/if}
				{#if displayPhoto.locationName}
					<span>{displayPhoto.locationName}</span>
				{/if}
				{#if displayPhoto.date}
					<span>{formatDate(displayPhoto.date)}</span>
				{/if}
				{#if displayPhoto.camera}
					<span>{displayPhoto.camera}</span>
				{/if}
				{#if displayPhoto.focalLength}
					<span>{displayPhoto.focalLength}</span>
				{/if}
				{#if displayPhoto.aperture}
					<span>{displayPhoto.aperture}</span>
				{/if}
				{#if displayPhoto.shutterSpeed}
					<span>{displayPhoto.shutterSpeed}</span>
				{/if}
				{#if displayPhoto.iso}
					<span>ISO {displayPhoto.iso}</span>
				{/if}
				{#if mapLink}
					<a href={mapLink} class="lightbox-map-link" onclick={onclose}>Show on Map &rarr;</a>
				{/if}
			</div>
		</div>
	</div>
</div>

<style>
	.lightbox-overlay {
		position: fixed;
		inset: 0;
		z-index: 1000;
		background: rgba(0, 0, 0, 0.92);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.lightbox-close {
		position: absolute;
		top: 16px;
		right: 20px;
		background: none;
		border: none;
		color: #fff;
		font-size: 2rem;
		cursor: pointer;
		z-index: 1001;
		opacity: 0.7;
	}
	.lightbox-close:hover { opacity: 1; }
	.lightbox-counter {
		position: absolute;
		top: 20px;
		left: 50%;
		transform: translateX(-50%);
		background: rgba(0, 0, 0, 0.5);
		color: #fff;
		font-size: 0.8rem;
		font-weight: 600;
		padding: 4px 14px;
		border-radius: 20px;
		z-index: 1001;
	}
	.lightbox-nav {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		background: none;
		border: none;
		color: #fff;
		font-size: 3rem;
		cursor: pointer;
		z-index: 1001;
		opacity: 0.5;
		padding: 16px;
	}
	.lightbox-nav:hover { opacity: 1; }
	.lightbox-prev { left: 8px; }
	.lightbox-next { right: 8px; }
	.lightbox-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		max-width: 90vw;
		max-height: 90vh;
	}
	.lightbox-image {
		max-width: 100%;
		max-height: 80vh;
		object-fit: contain;
		border-radius: 4px;
	}
	video.lightbox-image {
		outline: none;
		background: #000;
	}
	.lightbox-info {
		color: #ccc;
		text-align: center;
		padding: 12px 0;
		max-width: 600px;
	}
	.lightbox-desc {
		color: #fff;
		margin-bottom: 8px;
		font-size: 0.95rem;
	}
	.lightbox-links {
		display: flex;
		gap: 16px;
		justify-content: center;
		margin-bottom: 8px;
	}
	.lightbox-link {
		color: #28a745;
		text-decoration: none;
		font-weight: 600;
		font-size: 0.88rem;
	}
	.lightbox-link:hover {
		text-decoration: underline;
	}
	.lightbox-meta {
		display: flex;
		gap: 16px;
		flex-wrap: wrap;
		justify-content: center;
		font-size: 0.8rem;
		opacity: 0.7;
	}
	.lightbox-species {
		color: #fff;
		font-weight: 600;
		font-style: italic;
		opacity: 1;
	}
	.lightbox-map-link {
		color: #28a745;
		text-decoration: none;
		font-weight: 600;
		opacity: 1;
	}
	.lightbox-map-link:hover {
		text-decoration: underline;
	}
</style>
