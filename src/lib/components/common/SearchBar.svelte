<script>
	/**
	 * AI-powered semantic photo search.
	 * Calls /api/search with optional collection and GPS bounds filters.
	 *
	 * Props:
	 *   collection  — limit search to one collection slug (optional)
	 *   bounds      — GPS bounding box { north, south, east, west } (optional)
	 *   compact     — smaller variant for embedding in other UIs (optional)
	 */
	let { collection = undefined, bounds = undefined, compact = false } = $props();

	let query = $state('');
	let results = $state(null);
	let loading = $state(false);
	let error = $state(null);
	let debounceTimer;

	function handleInput() {
		const q = query.trim();
		if (q.length < 2) {
			results = null;
			error = null;
			return;
		}
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => doSearch(q), 300);
	}

	async function doSearch(q) {
		loading = true;
		error = null;
		try {
			const params = new URLSearchParams({ q });
			if (collection) params.set('collection', collection);
			if (bounds) params.set('bounds', JSON.stringify(bounds));
			params.set('limit', '24');

			const resp = await fetch(`/api/search?${params}`);
			const data = await resp.json();

			if (!resp.ok) {
				error = data.error || 'Search failed';
				results = null;
			} else {
				results = data.results;
			}
		} catch (err) {
			error = err.message;
			results = null;
		} finally {
			loading = false;
		}
	}

	function clear() {
		query = '';
		results = null;
		error = null;
	}

	function handleKeydown(e) {
		if (e.key === 'Escape') clear();
	}
</script>

<div class="search-bar" class:search-bar-compact={compact}>
	<div class="search-input-wrap">
		<svg class="search-icon" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
			<path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd" />
		</svg>
		<input
			type="search"
			placeholder="Search photos with AI..."
			bind:value={query}
			oninput={handleInput}
			onkeydown={handleKeydown}
			class="search-input"
		/>
		{#if loading}
			<span class="search-spinner"></span>
		{/if}
		{#if query && !loading}
			<button class="search-clear" onclick={clear} aria-label="Clear search">&times;</button>
		{/if}
	</div>

	{#if error}
		<p class="search-error">{error}</p>
	{/if}

	{#if results && results.length === 0 && !loading}
		<p class="search-empty">No photos found for "{query}"</p>
	{/if}

	{#if results && results.length > 0}
		<div class="search-results">
			{#each results as result (result.id + result.collection)}
				<a href="/{result.collection}/photo/{result.id}" class="search-result-card">
					<img src={result.thumbnail} alt="" loading="lazy" class="search-thumb" />
					<div class="search-result-info">
						{#if !collection}
							<span class="search-collection-tag">{result.collection}</span>
						{/if}
						{#if result.aiDescription}
							<p class="search-desc">{result.aiDescription.slice(0, 120)}{result.aiDescription.length > 120 ? '...' : ''}</p>
						{/if}
					</div>
				</a>
			{/each}
		</div>
	{/if}
</div>

<style>
	.search-bar {
		position: relative;
		margin-bottom: 24px;
	}
	.search-bar-compact {
		margin-bottom: 12px;
	}
	.search-input-wrap {
		position: relative;
		display: flex;
		align-items: center;
	}
	.search-icon {
		position: absolute;
		left: 12px;
		color: var(--color-text-muted, #6c757d);
		pointer-events: none;
	}
	.search-input {
		width: 100%;
		padding: 10px 40px 10px 36px;
		border: 1px solid var(--color-border, #e9ecef);
		border-radius: 8px;
		font-size: 0.95rem;
		font-family: inherit;
		background: var(--color-surface, #fff);
		color: inherit;
		outline: none;
		transition: border-color 0.15s;
	}
	.search-bar-compact .search-input {
		padding: 7px 36px 7px 32px;
		font-size: 0.85rem;
	}
	.search-input:focus {
		border-color: var(--color-primary, #007bff);
		box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.15);
	}
	.search-spinner {
		position: absolute;
		right: 12px;
		width: 16px;
		height: 16px;
		border: 2px solid var(--color-border, #e9ecef);
		border-top-color: var(--color-primary, #007bff);
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}
	@keyframes spin {
		to { transform: rotate(360deg); }
	}
	.search-clear {
		position: absolute;
		right: 10px;
		background: none;
		border: none;
		font-size: 1.2rem;
		color: var(--color-text-muted, #6c757d);
		cursor: pointer;
		padding: 2px 6px;
		line-height: 1;
	}
	.search-clear:hover {
		color: var(--color-text, #333);
	}
	.search-error {
		color: #dc3545;
		font-size: 0.85rem;
		margin-top: 8px;
	}
	.search-empty {
		color: var(--color-text-muted, #6c757d);
		font-size: 0.85rem;
		margin-top: 8px;
	}
	.search-results {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
		gap: 12px;
		margin-top: 16px;
	}
	.search-bar-compact .search-results {
		grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
		gap: 8px;
		margin-top: 10px;
	}
	.search-result-card {
		background: var(--color-surface, #fff);
		border: 1px solid var(--color-border, #e9ecef);
		border-radius: 8px;
		overflow: hidden;
		text-decoration: none;
		color: inherit;
		transition: transform 0.15s, box-shadow 0.15s;
	}
	.search-result-card:hover {
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
	}
	.search-thumb {
		width: 100%;
		aspect-ratio: 1;
		object-fit: cover;
		display: block;
	}
	.search-result-info {
		padding: 8px;
	}
	.search-bar-compact .search-result-info {
		padding: 6px;
	}
	.search-collection-tag {
		display: inline-block;
		font-size: 0.65rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-text-muted, #6c757d);
		background: var(--color-bg, #f8f9fa);
		padding: 1px 6px;
		border-radius: 4px;
		margin-bottom: 4px;
	}
	.search-desc {
		font-size: 0.75rem;
		color: var(--color-text-muted, #6c757d);
		line-height: 1.35;
		margin: 0;
	}
	.search-bar-compact .search-desc {
		font-size: 0.7rem;
	}

	@media (max-width: 768px) {
		.search-results {
			grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
		}
	}
</style>
