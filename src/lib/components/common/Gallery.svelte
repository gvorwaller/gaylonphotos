<script>
	/**
	 * Photo grid with lightbox on click.
	 * Props: photos, columns (default: 4)
	 */
	import Lightbox from './Lightbox.svelte';

	let { photos = [], columns = 4 } = $props();

	let lightboxPhoto = $state(null);

	function openLightbox(photo) {
		lightboxPhoto = photo;
	}

	function closeLightbox() {
		lightboxPhoto = null;
	}
</script>

<div class="gallery-grid" style="--columns: {columns}">
	{#each photos as photo (photo.id)}
		<button class="gallery-item" onclick={() => openLightbox(photo)}>
			<img
				src={photo.thumbnail}
				alt={photo.description || photo.filename}
				loading="lazy"
			/>
			{#if photo.favorite}
				<span class="gallery-fav" aria-label="Favorite">&#9733;</span>
			{/if}
		</button>
	{/each}
</div>

{#if photos.length === 0}
	<p class="gallery-empty">No photos yet</p>
{/if}

{#if lightboxPhoto}
	<Lightbox photo={lightboxPhoto} {photos} onclose={closeLightbox} />
{/if}

<style>
	.gallery-grid {
		display: grid;
		grid-template-columns: repeat(var(--columns), 1fr);
		gap: 8px;
	}
	.gallery-item {
		position: relative;
		aspect-ratio: 1;
		overflow: hidden;
		border-radius: var(--radius-sm, 6px);
		cursor: pointer;
		border: none;
		padding: 0;
		background: var(--color-surface);
	}
	.gallery-item img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		transition: transform 0.2s;
	}
	.gallery-item:hover img {
		transform: scale(1.05);
	}
	.gallery-fav {
		position: absolute;
		top: 6px;
		right: 6px;
		color: #ffc107;
		font-size: 1rem;
		text-shadow: 0 1px 3px rgba(0,0,0,0.5);
	}
	.gallery-empty {
		text-align: center;
		color: var(--color-text-muted);
		padding: 40px 0;
	}

	@media (max-width: 768px) {
		.gallery-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}
	@media (max-width: 480px) {
		.gallery-grid {
			grid-template-columns: repeat(1, 1fr);
		}
	}
</style>
