<script>
	/**
	 * Landing page — hero section + collection cards grid.
	 * Props: collections, photosByCollection
	 */
	let { collections = [], photosByCollection = {}, photoCounts = {} } = $props();

	function getHeroUrl(collection) {
		// Use hero image if set, otherwise first photo's thumbnail
		const photos = photosByCollection[collection.slug] || [];
		if (photos.length > 0) return photos[0].thumbnail;
		return null;
	}

	const typeLabels = {
		travel: 'Travel',
		wildlife: 'Wildlife',
		action: 'Action'
	};
</script>

<div class="landing">
	<section class="hero">
		<div class="hero-content">
			<h1>Gaylon Photos</h1>
			<p>Travel journals, wildlife encounters, and ocean action</p>
		</div>
	</section>

	<section class="collections-section container">
		<h2 class="section-label">Collections</h2>
		<div class="collections-grid">
			{#each collections as collection (collection.slug)}
				{@const heroUrl = getHeroUrl(collection)}
				{@const photoCount = photoCounts[collection.slug] ?? (photosByCollection[collection.slug] || []).length}
				<a href="/{collection.slug}" class="collection-card">
					<div class="card-image">
						{#if heroUrl}
							<img src={heroUrl} alt={collection.name} loading="lazy" />
						{:else}
							<div class="card-placeholder"></div>
						{/if}
						<span class="type-badge type-badge-{collection.type}">
							{typeLabels[collection.type] || collection.type}
						</span>
					</div>
					<div class="card-body">
						<h3>{collection.name}</h3>
						<p>{collection.description}</p>
						<span class="card-count">{photoCount} photo{photoCount !== 1 ? 's' : ''}</span>
					</div>
				</a>
			{/each}
		</div>
	</section>
</div>

<style>
	.landing {
		padding-bottom: 64px;
	}
	.hero {
		background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
		padding: 80px 24px;
		text-align: center;
	}
	.hero h1 {
		color: #fff;
		font-size: 2.5rem;
		font-weight: 800;
		margin-bottom: 12px;
	}
	.hero p {
		color: rgba(255, 255, 255, 0.7);
		font-size: 1.1rem;
	}
	.collections-section {
		padding-top: 48px;
	}
	.collections-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 24px;
		margin-top: 24px;
	}
	.collection-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		overflow: hidden;
		text-decoration: none;
		color: inherit;
		transition: transform 0.2s, box-shadow 0.2s;
	}
	.collection-card:hover {
		transform: translateY(-4px);
		box-shadow: var(--shadow-card-hover, 0 8px 24px rgba(0,0,0,0.12));
	}
	.card-image {
		position: relative;
		aspect-ratio: 16 / 10;
		overflow: hidden;
		background: var(--color-surface);
	}
	.card-image img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.card-placeholder {
		width: 100%;
		height: 100%;
		background: linear-gradient(135deg, #2d3436, #636e72);
	}
	.card-body {
		padding: 16px;
	}
	.card-body h3 {
		font-size: 1.1rem;
		font-weight: 700;
		margin-bottom: 6px;
	}
	.card-body p {
		font-size: 0.85rem;
		color: var(--color-text-muted);
		margin-bottom: 8px;
	}
	.card-count {
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}

	@media (max-width: 768px) {
		.collections-grid {
			grid-template-columns: 1fr;
		}
		.hero h1 {
			font-size: 1.8rem;
		}
	}
</style>
