<script>
	import AdminNav from '$lib/components/admin/AdminNav.svelte';
	import Hamburger from '$lib/components/common/Hamburger.svelte';
	import { modalCount } from '$lib/stores.js';
	import { page } from '$app/state';
	import { afterNavigate } from '$app/navigation';

	let { data, children } = $props();

	// Don't show admin nav on login page
	let isLoginPage = $derived(page.url.pathname === '/admin/login');

	let sidebarOpen = $state(false);
	let isMobile = $state(true); // Default true: sidebar starts inert until $effect corrects on desktop

	afterNavigate(() => {
		sidebarOpen = false;
	});

	// Track mobile breakpoint for sidebar inert/scroll behavior
	$effect(() => {
		const mq = window.matchMedia('(max-width: 1024px)');
		isMobile = mq.matches;
		const handler = (e) => { isMobile = e.matches; };
		mq.addEventListener('change', handler);
		return () => mq.removeEventListener('change', handler);
	});

	// Prevent body scroll when mobile sidebar is open
	$effect(() => {
		document.body.style.overflow = sidebarOpen && isMobile ? 'hidden' : '';
		return () => { document.body.style.overflow = ''; };
	});

	let sidebarInert = $derived(isMobile && !sidebarOpen);
</script>

{#if isLoginPage}
	{@render children()}
{:else}
	<div class="admin-layout">
		<div class="admin-topbar">
			<Hamburger
				open={sidebarOpen}
				ariaControls="admin-sidebar"
				onclick={() => sidebarOpen = !sidebarOpen}
			/>
		</div>

		<div
			class="sidebar-backdrop"
			class:open={sidebarOpen}
			role="presentation"
			onclick={() => sidebarOpen = false}
		></div>

		<AdminNav
			collections={data.navCollections || []}
			currentPath={page.url.pathname}
			open={sidebarOpen}
			inert={sidebarInert}
			onlinkclick={() => sidebarOpen = false}
		/>
		<main class="admin-main">
			{@render children()}
		</main>
	</div>
{/if}

<svelte:window onkeydown={(e) => e.key === 'Escape' && sidebarOpen && $modalCount === 0 && (sidebarOpen = false)} />

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

	/* Mobile topbar — hidden on desktop */
	.admin-topbar {
		display: none;
	}

	.sidebar-backdrop {
		display: none;
	}

	@media (max-width: 1024px) {
		.admin-topbar {
			display: flex;
			align-items: center;
			position: fixed;
			top: 0;
			left: 0;
			right: 0;
			height: 52px;
			background: var(--color-surface);
			border-bottom: 1px solid var(--color-border);
			padding: 0 16px;
			z-index: 150;
		}
		.admin-main {
			padding: 16px;
			padding-top: 68px; /* 52px topbar + 16px */
		}
		.sidebar-backdrop {
			display: block;
			position: fixed;
			inset: 0;
			background: rgba(0, 0, 0, 0.2);
			z-index: 190;
			opacity: 0;
			pointer-events: none;
			transition: opacity 0.25s ease;
		}
		.sidebar-backdrop.open {
			opacity: 1;
			pointer-events: auto;
		}
	}

</style>
