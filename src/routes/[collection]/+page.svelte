<script>
	import Gallery from '$lib/components/common/Gallery.svelte';
	import ItineraryMap from '$lib/components/travel/ItineraryMap.svelte';
	import Timeline from '$lib/components/travel/Timeline.svelte';
	import SightingMap from '$lib/components/wildlife/SightingMap.svelte';
	import SpeciesGrid from '$lib/components/wildlife/SpeciesGrid.svelte';
	import SpotGallery from '$lib/components/action/SpotGallery.svelte';

	let { data } = $props();

	let filterSpecies = $state(null);

	let displayPhotos = $derived(
		filterSpecies
			? data.photos.filter((p) => (p.species || 'Unknown') === filterSpecies)
			: data.photos
	);
</script>

<div class="container" style="padding-top: 40px;">
	<a href="/" class="back-link">&larr; All Collections</a>

	<div class="collection-header">
		<h1>{data.collection.name}</h1>
		<span class="type-badge type-badge-{data.collection.type}">
			{data.collection.type}
		</span>
	</div>

	{#if data.collection.description}
		<p class="collection-desc">{data.collection.description}</p>
	{/if}

	<!-- Type-specific sections -->
	{#if data.collection.type === 'travel'}
		{#if data.itinerary?.stops?.length > 0}
			<section style="margin-top: 32px;">
				<h2 class="section-label">Journey</h2>
				<ItineraryMap
					photos={data.photos}
					stops={data.itinerary.stops}
					apiKey={data.googleMapsApiKey}
				/>
			</section>

			<section style="margin-top: 32px;">
				<h2 class="section-label">Timeline</h2>
				<Timeline photos={data.photos} stops={data.itinerary.stops} collectionSlug={data.collection.slug} />
			</section>
		{/if}

	{:else if data.collection.type === 'wildlife'}
		<section style="margin-top: 32px;">
			<h2 class="section-label">Sightings Map</h2>
			<SightingMap photos={data.photos} apiKey={data.googleMapsApiKey} />
		</section>

		<section style="margin-top: 32px;">
			<h2 class="section-label">Species</h2>
			<SpeciesGrid
				photos={data.photos}
				onspeciesclick={(species) => filterSpecies = species}
			/>
		</section>

	{:else if data.collection.type === 'action'}
		<section style="margin-top: 32px;">
			<h2 class="section-label">Spots</h2>
			<SpotGallery photos={data.photos} apiKey={data.googleMapsApiKey} />
		</section>
	{/if}

	<!-- Photo gallery -->
	<section style="margin-top: 32px;">
		<h2 class="section-label">
			{#if filterSpecies}
				{filterSpecies} ({displayPhotos.length})
			{:else}
				All Photos ({data.photos.length})
			{/if}
		</h2>
		<Gallery photos={displayPhotos} columns={4} />
	</section>
</div>

<style>
	.back-link {
		color: var(--color-primary);
		text-decoration: none;
		font-size: 0.85rem;
		font-weight: 600;
	}
	.back-link:hover {
		text-decoration: underline;
	}
	.collection-header {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-top: 16px;
	}
	.collection-header h1 {
		font-size: 2rem;
		font-weight: 800;
	}
	.collection-desc {
		color: var(--color-text-muted);
		margin-top: 8px;
		font-size: 0.95rem;
	}
</style>
