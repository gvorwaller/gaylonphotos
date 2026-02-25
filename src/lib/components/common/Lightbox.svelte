<script>
	/**
	 * Full-screen photo viewer with prev/next navigation.
	 * Props: photo (current), photos (all, for navigation), onclose
	 */
	let { photo, photos = [], onclose = null } = $props();

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
	let displayPhoto = $derived(
		navIndex !== null && navIndex >= 0 && navIndex < photos.length
			? photos[navIndex]
			: currentPhoto
	);

	function goPrev() {
		const idx = navIndex ?? currentIndex;
		if (idx > 0) navIndex = idx - 1;
	}

	function goNext() {
		const idx = navIndex ?? currentIndex;
		if (idx < photos.length - 1) navIndex = idx + 1;
	}

	function handleKeydown(e) {
		if (e.key === 'Escape') onclose?.();
		if (e.key === 'ArrowLeft') goPrev();
		if (e.key === 'ArrowRight') goNext();
	}

	function handleOverlayClick(e) {
		if (e.target === e.currentTarget) onclose?.();
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
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="lightbox-overlay" onclick={handleOverlayClick} role="dialog" aria-modal="true" aria-label="Photo lightbox" tabindex="-1">
	<button class="lightbox-close" onclick={onclose} aria-label="Close">&times;</button>

	{#if (navIndex ?? currentIndex) > 0}
		<button class="lightbox-nav lightbox-prev" onclick={goPrev} aria-label="Previous photo">&#8249;</button>
	{/if}

	{#if (navIndex ?? currentIndex) < photos.length - 1}
		<button class="lightbox-nav lightbox-next" onclick={goNext} aria-label="Next photo">&#8250;</button>
	{/if}

	<div class="lightbox-content">
		<img src={displayPhoto.url} alt={displayPhoto.description || displayPhoto.filename} class="lightbox-image" />

		<div class="lightbox-info">
			{#if displayPhoto.description}
				<p class="lightbox-desc">{displayPhoto.description}</p>
			{/if}
			<div class="lightbox-meta">
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
	.lightbox-meta {
		display: flex;
		gap: 16px;
		flex-wrap: wrap;
		justify-content: center;
		font-size: 0.8rem;
		opacity: 0.7;
	}
</style>
