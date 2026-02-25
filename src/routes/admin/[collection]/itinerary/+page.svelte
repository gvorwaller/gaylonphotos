<script>
	import ItineraryEditor from '$lib/components/admin/ItineraryEditor.svelte';

	let { data } = $props();
</script>

<div>
	<div class="page-header">
		<h1>Itinerary: {data.collection.name}</h1>
		<a href="/admin/{data.collection.slug}" class="btn btn-outline btn-sm">&larr; Back to Photos</a>
	</div>

	<div style="margin-top: 16px;">
		<ItineraryEditor
			collectionSlug={data.collection.slug}
			itinerary={data.itinerary}
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
