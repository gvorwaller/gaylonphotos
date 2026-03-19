<script>
	import AncestryPlaceGeoTagger from '$lib/components/admin/AncestryPlaceGeoTagger.svelte';

	let { data } = $props();
</script>

<div>
	<div class="page-header">
		<h1>Geo-Tag Ancestry Places: {data.collection.name}</h1>
		<a href="/admin/{data.collection.slug}/ancestry" class="btn btn-outline btn-sm">&larr; Back to Ancestry</a>
	</div>

	<div style="margin-top: 16px;">
		<AncestryPlaceGeoTagger
			collectionSlug={data.collection.slug}
			ancestry={data.ancestry}
			apiKey={data.googleMapsApiKey}
		/>
	</div>
</div>

<style>
	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	h1 {
		font-size: 1.3rem;
		font-weight: 800;
	}
</style>
