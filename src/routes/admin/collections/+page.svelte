<script>
	import CollectionEditor from '$lib/components/admin/CollectionEditor.svelte';
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();

	function handleChange() {
		invalidateAll();
	}
</script>

<CollectionEditor
	collections={data.collections}
	oncreated={handleChange}
	onupdated={handleChange}
	ondeleted={handleChange}
/>
