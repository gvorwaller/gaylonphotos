<script>
	import Landing from '$lib/components/Landing.svelte';

	let { data } = $props();
</script>

<Landing collections={data.collections} photosByCollection={data.photosByCollection} photoCounts={data.photoCounts} />
