<script>
	import PhotoDetail from '$lib/components/common/PhotoDetail.svelte';

	let { data } = $props();
</script>

<div class="container" style="padding-top: 24px;">
	<PhotoDetail
		photo={data.photo}
		collection={data.collection}
		apiKey={data.googleMapsApiKey}
		photoNav={data.photoNav}
	/>
</div>
