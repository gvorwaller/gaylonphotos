<script>
	import GeoTagger from '$lib/components/admin/GeoTagger.svelte';

	let { data } = $props();
</script>

<div>
	<div class="page-header">
		<h1>Geo-Tag: {data.collection.name}</h1>
		<a href="/admin/{data.collection.slug}" class="btn btn-outline btn-sm">&larr; Back to Photos</a>
	</div>

	<div style="margin-top: 16px;">
		<GeoTagger
			collectionSlug={data.collection.slug}
			photos={data.untaggedPhotos}
			allPhotos={data.allPhotos}
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
