<script>
	import PhotoDetail from '$lib/components/common/PhotoDetail.svelte';

	let { data } = $props();

	// Mark that the user visited a photo detail page so the collection map can
	// restore its saved position on back-navigation instead of re-fitting bounds.
	$effect(() => {
		sessionStorage.setItem(`${data.collection.slug}_fromDetail`, '1');
	});
</script>

<div class="container" style="padding-top: 24px;">
	<PhotoDetail
		photo={data.photo}
		collection={data.collection}
		apiKey={data.googleMapsApiKey}
		photoNav={data.photoNav}
	/>
</div>
