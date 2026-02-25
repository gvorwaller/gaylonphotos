<script>
	/**
	 * Groups photos by species with representative thumbnails.
	 * Props: photos, onspeciesclick
	 */
	let { photos = [], onspeciesclick = null } = $props();

	let speciesGroups = $derived.by(() => {
		const groups = new Map();
		for (const p of photos) {
			const species = p.species || 'Unknown';
			if (!groups.has(species)) {
				groups.set(species, { species, photos: [], representative: p });
			}
			groups.get(species).photos.push(p);
		}
		// Sort by count descending
		return [...groups.values()].sort((a, b) => b.photos.length - a.photos.length);
	});

	let filterSpecies = $state(null);
	let searchQuery = $state('');

	let filteredGroups = $derived.by(() => {
		let groups = speciesGroups;
		if (searchQuery) {
			const q = searchQuery.toLowerCase();
			groups = groups.filter((g) => g.species.toLowerCase().includes(q));
		}
		return groups;
	});
</script>

<div class="species-grid-wrapper">
	<div class="species-toolbar">
		<input
			type="text"
			placeholder="Search species..."
			bind:value={searchQuery}
			class="species-search"
		/>
		{#if filterSpecies}
			<button class="btn btn-outline btn-sm" onclick={() => { filterSpecies = null; onspeciesclick?.(null); }}>
				Show All
			</button>
		{/if}
	</div>

	<div class="species-grid">
		{#each filteredGroups as group (group.species)}
			<button
				class="species-card"
				class:active={filterSpecies === group.species}
				onclick={() => { filterSpecies = group.species; onspeciesclick?.(group.species); }}
			>
				<div class="species-thumb">
					<img src={group.representative.thumbnail} alt={group.species} loading="lazy" />
				</div>
				<div class="species-info">
					<h4>{group.species}</h4>
					<span>{group.photos.length} photo{group.photos.length !== 1 ? 's' : ''}</span>
				</div>
			</button>
		{/each}
	</div>
</div>

<style>
	.species-toolbar {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 16px;
	}
	.species-search {
		padding: 8px 12px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: 0.85rem;
		font-family: inherit;
		width: 240px;
	}
	.species-search:focus {
		outline: none;
		border-color: var(--color-primary);
	}
	.species-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: 12px;
	}
	.species-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		overflow: hidden;
		cursor: pointer;
		padding: 0;
		text-align: left;
		transition: border-color 0.15s;
	}
	.species-card:hover {
		border-color: var(--color-primary);
	}
	.species-card.active {
		border-color: var(--color-primary);
		box-shadow: 0 0 0 2px rgba(40, 167, 69, 0.2);
	}
	.species-thumb {
		aspect-ratio: 4 / 3;
		overflow: hidden;
	}
	.species-thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.species-info {
		padding: 10px;
	}
	.species-info h4 {
		font-size: 0.85rem;
		font-weight: 700;
	}
	.species-info span {
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}
</style>
