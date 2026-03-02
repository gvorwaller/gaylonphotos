<script>
	import AncestryEditor from '$lib/components/admin/AncestryEditor.svelte';

	let { data } = $props();
</script>

<div>
	<div class="page-header">
		<h1>Family Heritage</h1>
		<span class="type-badge type-badge-travel">travel</span>
	</div>

	<AncestryEditor
		collectionSlug={data.collection.slug}
		ancestry={data.ancestry}
	/>
</div>

<style>
	.page-header {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	h1 {
		font-size: 1.5rem;
		font-weight: 800;
	}
</style>
