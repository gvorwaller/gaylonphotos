<script>
	import '../styles/global.css';
	import Hamburger from '$lib/components/common/Hamburger.svelte';
	import HelpScreen from '$lib/components/common/HelpScreen.svelte';
	import { currentUser } from '$lib/stores.js';
	import { page } from '$app/stores';
	import { afterNavigate } from '$app/navigation';

	let { data, children } = $props();

	let menuOpen = $state(false);
	let helpOpen = $state(false);

	$effect(() => {
		currentUser.set(data.user);
	});

	// Close menu on outside click
	function handleBackdropClick() {
		menuOpen = false;
	}

	// Close menu on navigation
	afterNavigate(() => {
		menuOpen = false;
	});

	let isAdmin = $derived($page.url.pathname === '/admin' || $page.url.pathname.startsWith('/admin/'));
	let currentPath = $derived($page.url.pathname);
</script>

{#if !isAdmin}
	<nav class="site-nav">
		<div class="nav-inner">
			<Hamburger
				open={menuOpen}
				ariaControls="nav-drawer"
				onclick={() => menuOpen = !menuOpen}
			/>
			<a href="/" class="nav-brand">Gaylon Photos</a>
			<a href="/admin" class="nav-admin">Admin</a>
		</div>
	</nav>

	<div class="menu-backdrop" class:open={menuOpen} role="presentation" onclick={handleBackdropClick}></div>
	<div id="nav-drawer" class="menu-drawer" class:open={menuOpen} inert={!menuOpen}>
		<div class="menu-section-label">Collections</div>
		{#each data.collections as col}
			<a
				href="/{col.slug}"
				class="menu-link"
				class:active={currentPath === `/${col.slug}`}
			>
				<span class="menu-link-name">{col.name}</span>
				<span class="menu-link-type">{col.type}</span>
			</a>
			{#if col.showAncestry}
				<a
					href="/{col.slug}#family-heritage"
					class="menu-link menu-sublink"
					class:active={currentPath === `/${col.slug}` && false}
				>
					<span class="menu-link-name">Family Heritage</span>
				</a>
			{/if}
		{:else}
			<div class="menu-empty">No collections yet</div>
		{/each}
		<div class="menu-divider"></div>
		<button
			class="menu-link menu-help-btn"
			onclick={() => { helpOpen = true; menuOpen = false; }}
		>
			<span class="menu-link-name">Help &amp; Tips</span>
			<span class="menu-link-type">?</span>
		</button>
	</div>

	<HelpScreen show={helpOpen} onclose={() => helpOpen = false} />
{/if}

{@render children()}

<svelte:window onkeydown={(e) => e.key === 'Escape' && !isAdmin && menuOpen && (menuOpen = false)} />

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
		gap: 16px;
	}
	.nav-brand {
		font-size: 1.05rem;
		font-weight: 700;
		color: var(--color-text);
		text-decoration: none;
		margin-right: auto;
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

	/* Backdrop */
	.menu-backdrop {
		position: fixed;
		inset: 0;
		top: var(--nav-height);
		background: rgba(0, 0, 0, 0.15);
		z-index: 90;
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.25s ease;
	}
	.menu-backdrop.open {
		opacity: 1;
		pointer-events: auto;
	}

	/* Drawer */
	.menu-drawer {
		position: fixed;
		top: var(--nav-height);
		left: 0;
		width: 280px;
		max-height: calc(100vh - var(--nav-height));
		overflow-y: auto;
		background: var(--color-surface);
		border-right: 1px solid var(--color-border);
		border-bottom: 1px solid var(--color-border);
		border-radius: 0 0 var(--radius-md) 0;
		box-shadow: var(--shadow-card-hover);
		padding: 12px 0;
		z-index: 95;
		transform: translateX(-100%);
		transition: transform 0.25s ease;
	}
	.menu-drawer.open {
		transform: translateX(0);
	}

	.menu-section-label {
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-muted);
		padding: 8px 20px 4px;
	}
	.menu-link {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 20px;
		text-decoration: none;
		color: var(--color-text);
		font-size: 0.92rem;
		font-weight: 500;
		transition: background 0.15s;
	}
	.menu-link:hover {
		background: rgba(0, 0, 0, 0.04);
	}
	.menu-link.active {
		color: var(--color-primary);
		font-weight: 600;
		background: rgba(40, 167, 69, 0.06);
	}
	.menu-link-type {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		text-transform: capitalize;
	}
	.menu-sublink {
		padding-left: 40px;
		font-size: 0.82rem;
		color: var(--color-text-muted);
	}
	.menu-sublink .menu-link-name {
		font-weight: 400;
	}
	.menu-empty {
		padding: 16px 20px;
		color: var(--color-text-muted);
		font-size: 0.875rem;
	}
	.menu-divider {
		height: 1px;
		background: var(--color-border);
		margin: 8px 20px;
	}
	.menu-help-btn {
		border: none;
		background: none;
		cursor: pointer;
		font-family: inherit;
		width: 100%;
	}
</style>
