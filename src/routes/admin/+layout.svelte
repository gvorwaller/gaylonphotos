<script>
	import AdminNav from '$lib/components/admin/AdminNav.svelte';
	import { page } from '$app/state';

	let { data, children } = $props();

	// Don't show admin nav on login page
	let isLoginPage = $derived(page.url.pathname === '/admin/login');
</script>

{#if isLoginPage}
	{@render children()}
{:else}
	<div class="admin-layout">
		<AdminNav
			collections={data.navCollections || []}
			currentPath={page.url.pathname}
		/>
		<main class="admin-main">
			{@render children()}
		</main>
	</div>
{/if}

<style>
	.admin-layout {
		display: flex;
		min-height: 100vh;
	}
	.admin-main {
		flex: 1;
		padding: 32px;
		overflow-y: auto;
	}
</style>
