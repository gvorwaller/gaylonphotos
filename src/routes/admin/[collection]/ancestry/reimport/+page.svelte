<script>
	import AncestryReimport from '$lib/components/admin/AncestryReimport.svelte';

	let { data } = $props();
</script>

<div>
	<div class="page-header">
		<a href="/admin/{data.collection.slug}/ancestry" class="back-link">&larr; Back</a>
		<h1>Re-Import GEDCOM</h1>
		<span class="type-badge type-badge-travel">travel</span>
	</div>

	<AncestryReimport
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
	.back-link {
		font-size: 0.85rem;
		color: var(--color-text-muted);
		text-decoration: none;
	}
	.back-link:hover {
		color: var(--color-primary);
	}
</style>
