<script>
	let { data } = $props();
</script>

<div>
	<h1>Admin Dashboard</h1>
	<p style="color: var(--color-text-muted); margin-top: 4px;">
		Logged in as <strong>{data.user?.username}</strong>
	</p>

	<div class="stats-grid">
		{#each data.collections as c (c.slug)}
			<a href="/admin/{c.slug}" class="stat-card">
				<div class="stat-header">
					<h3>{c.name}</h3>
					<span class="type-badge type-badge-{c.type}">{c.type}</span>
				</div>
				<div class="stat-numbers">
					<div class="stat-item">
						<span class="stat-value">{c.photoCount}</span>
						<span class="stat-label">Photos</span>
					</div>
					<div class="stat-item">
						<span class="stat-value" class:warning={c.untaggedCount > 0}>{c.untaggedCount}</span>
						<span class="stat-label">Untagged</span>
					</div>
				</div>
				{#if c.untaggedCount > 0}
					<span class="geotag-link">Geo-tag &rarr;</span>
				{/if}
			</a>
		{/each}
	</div>

	{#if data.collections.length === 0}
		<div style="text-align: center; padding: 48px 0;">
			<p style="color: var(--color-text-muted);">No collections yet.</p>
			<a href="/admin/collections" class="btn btn-primary" style="margin-top: 16px;">
				Create Collection
			</a>
		</div>
	{/if}
</div>

<style>
	h1 {
		font-size: 1.5rem;
		font-weight: 800;
	}
	.stats-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 16px;
		margin-top: 24px;
	}
	.stat-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: 20px;
		text-decoration: none;
		color: inherit;
		transition: border-color 0.15s;
	}
	.stat-card:hover {
		border-color: var(--color-primary);
	}
	.stat-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 16px;
	}
	.stat-header h3 {
		font-size: 1rem;
		font-weight: 700;
	}
	.stat-numbers {
		display: flex;
		gap: 32px;
	}
	.stat-item {
		display: flex;
		flex-direction: column;
	}
	.stat-value {
		font-size: 1.5rem;
		font-weight: 800;
		color: var(--color-text);
	}
	.stat-value.warning {
		color: var(--color-warning, #f0ad4e);
	}
	.stat-label {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}
	.geotag-link {
		display: inline-block;
		margin-top: 12px;
		font-size: 0.8rem;
		color: var(--color-primary);
		font-weight: 600;
	}
</style>
