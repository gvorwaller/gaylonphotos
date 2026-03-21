<script>
	import Gallery from '$lib/components/common/Gallery.svelte';
	import ItineraryMap from '$lib/components/travel/ItineraryMap.svelte';
	import Timeline from '$lib/components/travel/Timeline.svelte';
	import AncestryPanel from '$lib/components/travel/AncestryPanel.svelte';
	import SightingMap from '$lib/components/wildlife/SightingMap.svelte';
	import SpeciesGrid from '$lib/components/wildlife/SpeciesGrid.svelte';
	import SpotGallery from '$lib/components/action/SpotGallery.svelte';

	import { page } from '$app/state';

	let { data } = $props();

	let filterSpecies = $state(null);
	let mapBounds = $state(null);
	let mapFilterActive = $state(false);
	let showAncestryOnMap = $state(false);
	let gotoTarget = $state(null);
	let prevSlug; // Plain let, not $state — must not trigger effect re-runs

	// Reset filters when navigating between collections (not on data invalidation)
	$effect(() => {
		const slug = data.collection.slug;
		if (prevSlug !== undefined && slug !== prevSlug) {
			filterSpecies = null;
			mapBounds = null;
			mapFilterActive = false;
			showAncestryOnMap = false;
		}
		prevSlug = slug;
	});

	// Handle ?mapLat=&mapLng= query params (from "Show on Map" in photo detail)
	$effect(() => {
		const params = page.url?.searchParams;
		if (!params) return;
		const lat = parseFloat(params.get('mapLat'));
		const lng = parseFloat(params.get('mapLng'));
		if (!isNaN(lat) && !isNaN(lng)) {
			gotoTarget = { lat, lng, zoom: 13, _ts: Date.now() };
		}
	});

	let hasMapSection = $derived(
		data.googleMapsApiKey && (
			(data.collection.type === 'travel' && (data.itinerary?.stops?.length > 0 || data.photos.some((p) => p.gps))) ||
			data.collection.type === 'wildlife' ||
			data.collection.type === 'action'
		)
	);
	let hasGpsPhotos = $derived(data.photos.some((p) => p.gps));
	let hasAncestry = $derived(data.ancestry?.persons?.length > 0);

	function handleBoundsChange(bounds) {
		mapBounds = bounds;
	}

	function isInBounds(photo) {
		if (!photo.gps || !mapBounds) return false;
		const { lat, lng } = photo.gps;
		const inLat = lat >= mapBounds.south && lat <= mapBounds.north;
		if (!inLat) return false;
		// Handle antimeridian wrap (west > east when viewport crosses 180th meridian)
		if (mapBounds.west <= mapBounds.east) {
			return lng >= mapBounds.west && lng <= mapBounds.east;
		} else {
			return lng >= mapBounds.west || lng <= mapBounds.east;
		}
	}

	let displayPhotos = $derived.by(() => {
		let filtered = data.photos;

		// Apply species filter (wildlife)
		if (filterSpecies) {
			filtered = filtered.filter((p) => (p.species || 'Unknown') === filterSpecies);
		}

		// Apply map viewport filter
		if (mapFilterActive && mapBounds) {
			filtered = filtered.filter((p) => isInBounds(p));
		}

		// Sort by date (oldest first), undated photos at end
		filtered.sort((a, b) => {
			if (!a.date && !b.date) return 0;
			if (!a.date) return 1;
			if (!b.date) return -1;
			return a.date.localeCompare(b.date);
		});

		return filtered;
	});
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
		{#if data.itinerary?.stops?.length > 0 || data.photos.some((p) => p.gps)}
			<section style="margin-top: 32px;">
				<div class="journey-header">
					<h2 class="section-label">Journey</h2>
					{#if hasAncestry}
						<label class="ancestry-map-toggle">
							<input type="checkbox" bind:checked={showAncestryOnMap} />
							Show Family Heritage
						</label>
					{/if}
				</div>
				<ItineraryMap
					photos={data.photos}
					stops={data.itinerary?.stops ?? []}
					apiKey={data.googleMapsApiKey}
					onboundschange={handleBoundsChange}
					ancestryPlaces={hasAncestry ? data.ancestry.places : []}
					showAncestry={showAncestryOnMap}
					collectionSlug={data.collection.slug}
					ancestry={hasAncestry ? data.ancestry : null}
					{gotoTarget}
				/>
			</section>

			<section style="margin-top: 32px;">
				<h2 class="section-label">Timeline</h2>
				<Timeline photos={data.photos} stops={data.itinerary?.stops ?? []} collectionSlug={data.collection.slug} />
			</section>
		{/if}

		{#if hasAncestry}
			<section style="margin-top: 32px;">
				<AncestryPanel
					ancestry={data.ancestry}
					collectionSlug={data.collection.slug}
					{mapBounds}
					ongotolocation={(target) => { gotoTarget = target; showAncestryOnMap = true; }}
				/>
			</section>
		{/if}

	{:else if data.collection.type === 'wildlife'}
		<section style="margin-top: 32px;">
			<h2 class="section-label">Sightings Map</h2>
			<SightingMap photos={data.photos} apiKey={data.googleMapsApiKey} onboundschange={handleBoundsChange} collectionSlug={data.collection.slug} {gotoTarget} />
		</section>

		<section style="margin-top: 32px;">
			<SpeciesGrid
				photos={data.photos}
				onspeciesclick={(species) => filterSpecies = species}
			/>
		</section>

	{:else if data.collection.type === 'action'}
		<section style="margin-top: 32px;">
			<h2 class="section-label">Spots</h2>
			<SpotGallery photos={data.photos} apiKey={data.googleMapsApiKey} onboundschange={handleBoundsChange} collectionSlug={data.collection.slug} {gotoTarget} />
		</section>
	{/if}

	<!-- Photo gallery -->
	<section style="margin-top: 32px;">
		<div class="gallery-header">
			<h2 class="section-label">
				{#if filterSpecies && mapFilterActive && mapBounds}
					{filterSpecies} in View ({displayPhotos.length})
				{:else if filterSpecies}
					{filterSpecies} ({displayPhotos.length})
				{:else if mapFilterActive && mapBounds}
					Photos in View ({displayPhotos.length} of {data.photos.length})
				{:else}
					All Photos ({data.photos.length})
				{/if}
			</h2>
			{#if hasMapSection && hasGpsPhotos}
				<button
					class="btn btn-sm"
					class:btn-primary={mapFilterActive}
					class:btn-outline={!mapFilterActive}
					aria-pressed={mapFilterActive}
					onclick={() => mapFilterActive = !mapFilterActive}
				>
					{mapFilterActive ? 'Clear Map Filter' : 'Filter by Map'}
				</button>
			{/if}
		</div>
		{#if mapFilterActive && mapBounds}
			<p class="map-filter-hint">
				{#if displayPhotos.length === 0}
					No photos in the current map view — zoom out or pan to see more.
				{:else}
					Pan and zoom the map above to filter photos
				{/if}
			</p>
		{:else if mapFilterActive}
			<p class="map-filter-hint">Waiting for map...</p>
		{:else if filterSpecies && displayPhotos.length === 0}
			<p class="map-filter-hint">No photos found for {filterSpecies}.</p>
		{/if}
		{#if displayPhotos.length > 0 || (!mapFilterActive && !filterSpecies)}
			<Gallery photos={displayPhotos} columns={4} collectionSlug={data.collection.slug} />
		{/if}
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
	.gallery-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	.journey-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.ancestry-map-toggle {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 0.8rem;
		color: var(--color-text-muted);
		cursor: pointer;
		user-select: none;
	}
	.ancestry-map-toggle input[type='checkbox'] {
		accent-color: var(--color-line-paternal);
	}
	.map-filter-hint {
		color: var(--color-text-muted);
		font-size: 0.85rem;
		margin: 4px 0 8px;
	}
</style>
