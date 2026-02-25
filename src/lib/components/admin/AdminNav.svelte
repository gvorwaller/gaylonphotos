<script>
	/**
	 * Admin sidebar navigation.
	 * Props: collections, currentPath
	 */
	import { goto } from '$app/navigation';
	import { apiDelete } from '$lib/api.js';

	let { collections = [], currentPath = '' } = $props();

	async function handleLogout() {
		await apiDelete('/api/auth');
		await goto('/');
	}

	function isActive(path) {
		return currentPath === path || currentPath.startsWith(path + '/');
	}
</script>

<nav class="admin-nav">
	<div class="nav-header">
		<a href="/" class="nav-logo">Gaylon Photos</a>
		<span class="nav-badge">Admin</span>
	</div>

	<div class="nav-section">
		<a href="/admin" class="nav-link" class:active={currentPath === '/admin'}>
			Dashboard
		</a>
		<a href="/admin/collections" class="nav-link" class:active={isActive('/admin/collections')}>
			Collections
		</a>
	</div>

	{#if collections.length > 0}
		<div class="nav-divider"></div>
		<div class="nav-section">
			<span class="nav-section-label">Collections</span>
			{#each collections as c (c.slug)}
				<div class="nav-group">
					<a href="/admin/{c.slug}" class="nav-link" class:active={currentPath === `/admin/${c.slug}`}>
						{c.name}
					</a>
					<div class="nav-sub">
						<a href="/admin/{c.slug}/geotag" class="nav-sublink" class:active={isActive(`/admin/${c.slug}/geotag`)}>
							Geo-tag
						</a>
						{#if c.type === 'travel'}
							<a href="/admin/{c.slug}/itinerary" class="nav-sublink" class:active={isActive(`/admin/${c.slug}/itinerary`)}>
								Itinerary
							</a>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<div class="nav-footer">
		<button class="btn btn-outline btn-sm" onclick={handleLogout}>
			Logout
		</button>
	</div>
</nav>

<style>
	.admin-nav {
		width: 240px;
		min-height: 100vh;
		background: var(--color-surface);
		border-right: 1px solid var(--color-border);
		padding: 20px 16px;
		display: flex;
		flex-direction: column;
	}
	.nav-header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 24px;
	}
	.nav-logo {
		font-weight: 800;
		font-size: 1rem;
		color: var(--color-text);
		text-decoration: none;
	}
	.nav-badge {
		background: var(--color-primary);
		color: #fff;
		font-size: 0.65rem;
		font-weight: 700;
		padding: 2px 6px;
		border-radius: 4px;
		text-transform: uppercase;
	}
	.nav-section {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.nav-section-label {
		font-size: 0.7rem;
		font-weight: 700;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 4px 10px;
		margin-bottom: 4px;
	}
	.nav-link {
		display: block;
		padding: 8px 10px;
		border-radius: var(--radius-sm);
		color: var(--color-text);
		text-decoration: none;
		font-size: 0.85rem;
		font-weight: 500;
	}
	.nav-link:hover {
		background: rgba(0, 0, 0, 0.04);
	}
	.nav-link.active {
		background: rgba(40, 167, 69, 0.1);
		color: var(--color-primary);
		font-weight: 600;
	}
	.nav-group {
		margin-bottom: 4px;
	}
	.nav-sub {
		padding-left: 16px;
	}
	.nav-sublink {
		display: block;
		padding: 4px 10px;
		border-radius: var(--radius-sm);
		color: var(--color-text-muted);
		text-decoration: none;
		font-size: 0.8rem;
	}
	.nav-sublink:hover {
		color: var(--color-text);
	}
	.nav-sublink.active {
		color: var(--color-primary);
		font-weight: 600;
	}
	.nav-divider {
		height: 1px;
		background: var(--color-border);
		margin: 12px 0;
	}
	.nav-footer {
		margin-top: auto;
		padding-top: 16px;
	}
</style>
