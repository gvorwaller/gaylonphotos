<script>
	/**
	 * Admin photo lightbox — full-size preview with EXIF info and admin actions.
	 * Props: photo, photos (for nav), collectionSlug, onclose, ondeleted
	 */
	import { apiDelete } from '$lib/api.js';
	import Modal from '$lib/components/common/Modal.svelte';

	let { photo, photos = [], collectionSlug = '', onclose = null, ondeleted = null } = $props();

	let currentIndex = $derived(photos.findIndex((p) => p.id === photo.id));

	let navIndex = $state(null);

	$effect(() => {
		photo;
		navIndex = null;
	});

	let displayIndex = $derived(navIndex ?? currentIndex);
	let displayPhoto = $derived(
		navIndex !== null && navIndex >= 0 && navIndex < photos.length
			? photos[navIndex]
			: (currentIndex >= 0 ? photos[currentIndex] : photo)
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
		if (showDeleteConfirm) return;
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
				year: 'numeric', month: 'long', day: 'numeric',
				hour: 'numeric', minute: '2-digit'
			});
		} catch {
			return iso;
		}
	}

	function sourceLabel(src) {
		if (!src) return null;
		const labels = { exif: 'EXIF', ai: 'AI', manual: 'Manual', itinerary: 'Itinerary' };
		return labels[src] || src;
	}

	// Delete flow
	let showDeleteConfirm = $state(false);

	async function confirmDelete() {
		const result = await apiDelete('/api/photos', {
			collection: collectionSlug,
			photoId: displayPhoto.id
		});
		showDeleteConfirm = false;
		if (result.ok) {
			ondeleted?.(displayPhoto.id);
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
	class="lightbox-overlay"
	onclick={handleOverlayClick}
	role="dialog"
	aria-modal="true"
	aria-label="Photo detail"
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
			<div class="lightbox-filename">{displayPhoto.filename}</div>

			<div class="lightbox-exif">
				{#if displayPhoto.duration}
					<div class="exif-row">
						<span class="exif-label">Duration</span>
						<span class="exif-value">{Math.floor(displayPhoto.duration / 60)}:{String(displayPhoto.duration % 60).padStart(2, '0')}</span>
					</div>
				{/if}
				{#if displayPhoto.date}
					<div class="exif-row">
						<span class="exif-label">Date</span>
						<span class="exif-value">{formatDate(displayPhoto.date)}</span>
					</div>
				{/if}
				{#if displayPhoto.camera}
					<div class="exif-row">
						<span class="exif-label">Camera</span>
						<span class="exif-value">{displayPhoto.camera}</span>
					</div>
				{/if}
				{#if displayPhoto.lens}
					<div class="exif-row">
						<span class="exif-label">Lens</span>
						<span class="exif-value">{displayPhoto.lens}</span>
					</div>
				{/if}
				{#if displayPhoto.focalLength || displayPhoto.aperture || displayPhoto.shutterSpeed || displayPhoto.iso}
					<div class="exif-row">
						<span class="exif-label">Exposure</span>
						<span class="exif-value">
							{[displayPhoto.focalLength, displayPhoto.aperture, displayPhoto.shutterSpeed, displayPhoto.iso ? `ISO ${displayPhoto.iso}` : null].filter(Boolean).join('  ·  ')}
						</span>
					</div>
				{/if}
				{#if displayPhoto.gps}
					<div class="exif-row">
						<span class="exif-label">Location</span>
						<span class="exif-value">
							{displayPhoto.locationName || `${displayPhoto.gps.lat.toFixed(5)}, ${displayPhoto.gps.lng.toFixed(5)}`}
							{#if displayPhoto.gpsSource}
								<span class="source-badge">{sourceLabel(displayPhoto.gpsSource)}</span>
							{/if}
						</span>
					</div>
				{:else}
					<div class="exif-row">
						<span class="exif-label">Location</span>
						<span class="exif-value no-gps">No GPS</span>
					</div>
				{/if}
				{#if displayPhoto.species}
					<div class="exif-row">
						<span class="exif-label">Species</span>
						<span class="exif-value">{displayPhoto.species}{displayPhoto.scientificName ? ` (${displayPhoto.scientificName})` : ''}</span>
					</div>
				{/if}
				{#if displayPhoto.spot}
					<div class="exif-row">
						<span class="exif-label">Spot</span>
						<span class="exif-value">{displayPhoto.spot}</span>
					</div>
				{/if}
				{#if displayPhoto.description}
					<div class="exif-row">
						<span class="exif-label">Description</span>
						<span class="exif-value">{displayPhoto.description}</span>
					</div>
				{/if}
			</div>

			<div class="lightbox-actions">
				{#if !displayPhoto.gps}
					<a href="/admin/{collectionSlug}/geotag" class="btn btn-outline btn-sm" onclick={onclose}>
						Geo-tag
					</a>
				{/if}
				<button class="btn btn-danger btn-sm" onclick={() => showDeleteConfirm = true}>
					Delete
				</button>
			</div>
		</div>
	</div>
</div>

<Modal title="Delete Photo" show={showDeleteConfirm} onclose={() => showDeleteConfirm = false}>
	<p>Are you sure you want to delete <strong>{displayPhoto.filename}</strong>? This cannot be undone.</p>
	{#snippet actions()}
		<button class="btn btn-outline btn-sm" onclick={() => showDeleteConfirm = false}>Cancel</button>
		<button class="btn btn-danger btn-sm" onclick={confirmDelete}>Delete</button>
	{/snippet}
</Modal>

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
		align-items: flex-start;
		gap: 24px;
		max-width: 95vw;
		max-height: 90vh;
	}
	.lightbox-image {
		max-width: 70vw;
		max-height: 85vh;
		object-fit: contain;
		border-radius: 4px;
	}
	video.lightbox-image {
		outline: none;
		background: #000;
	}
	.lightbox-info {
		color: #ccc;
		width: 280px;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding-top: 8px;
	}
	.lightbox-filename {
		color: #fff;
		font-size: 0.85rem;
		font-weight: 600;
		word-break: break-all;
	}
	.lightbox-exif {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.exif-row {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.exif-label {
		font-size: 0.65rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #888;
	}
	.exif-value {
		font-size: 0.82rem;
		color: #ddd;
	}
	.no-gps {
		color: #f0ad4e;
	}
	.source-badge {
		display: inline-block;
		font-size: 0.6rem;
		font-weight: 600;
		text-transform: uppercase;
		background: rgba(255, 255, 255, 0.15);
		padding: 1px 6px;
		border-radius: 3px;
		margin-left: 6px;
		vertical-align: middle;
	}
	.lightbox-actions {
		display: flex;
		gap: 8px;
		padding-top: 8px;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
	}

	@media (max-width: 768px) {
		.lightbox-content {
			flex-direction: column;
			align-items: center;
		}
		.lightbox-image {
			max-width: 90vw;
			max-height: 60vh;
		}
		.lightbox-info {
			width: auto;
			max-width: 90vw;
		}
	}
</style>
