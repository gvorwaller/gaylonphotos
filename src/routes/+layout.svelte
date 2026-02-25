<script>
	import '../styles/global.css';
	import { currentUser } from '$lib/stores.js';
	import { page } from '$app/stores';

	let { data, children } = $props();

	$effect(() => {
		currentUser.set(data.user);
	});

	let isAdmin = $derived($page.url.pathname === '/admin' || $page.url.pathname.startsWith('/admin/'));
</script>

{#if !isAdmin}
	<nav class="site-nav">
		<div class="nav-inner">
			<a href="/" class="nav-brand">Gaylon Photos</a>
			{#if data.user}
				<a href="/admin" class="nav-admin">Admin</a>
			{/if}
		</div>
	</nav>
{/if}

{@render children()}

<style>
	.site-nav {
		position: sticky;
		top: 0;
		z-index: 100;
		background: rgba(255, 255, 255, 0.8);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border-bottom: 1px solid var(--color-border);
		height: var(--nav-height);
		display: flex;
		align-items: center;
	}
	.nav-inner {
		max-width: var(--container-max);
		width: 100%;
		margin: 0 auto;
		padding: 0 24px;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.nav-brand {
		font-size: 1.05rem;
		font-weight: 700;
		color: var(--color-text);
		text-decoration: none;
	}
	.nav-admin {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--color-text-muted);
		text-decoration: none;
	}
	.nav-admin:hover {
		color: var(--color-text);
	}
</style>
