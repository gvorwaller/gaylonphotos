<script>
	/**
	 * THE CRITICAL FEATURE — Split-panel geo-tagging UI.
	 * Left (40%): grid of untagged photo thumbnails with multi-select
	 * Right (60%): Google Map with clickable placement
	 *
	 * Props: collectionSlug, photos (untagged), allPhotos, apiKey
	 */
	import Map from '$lib/components/common/Map.svelte';
	import { apiPost } from '$lib/api.js';

	let { collectionSlug, photos = [], allPhotos = [], apiKey = '' } = $props();

	// Working copies — photos move from untagged to tagged as they're assigned
	let untaggedPhotos = $state([...photos]);
	let selectedIds = $state(new Set());

	// Re-sync when navigating to a different collection's geotag page
	$effect(() => {
		untaggedPhotos = [...photos];
		selectedIds = new Set();
		pendingCoords = null;
	});
	let pendingCoords = $state(null);
	let assigning = $state(false);
	let error = $state('');

	// Markers: already-tagged photos (semi-transparent context) + pending preview
	let markers = $derived.by(() => {
		const m = [];

		// Already-tagged photos from the full collection
		for (const p of allPhotos) {
			if (p.gps && p.gpsSource !== null) {
				m.push({
					lat: p.gps.lat,
					lng: p.gps.lng,
					id: p.id,
					label: p.filename,
					color: '#28a745'
				});
			}
		}

		// Pending preview marker
		if (pendingCoords) {
			m.push({
				lat: pendingCoords.lat,
				lng: pendingCoords.lng,
				id: '__pending__',
				label: `Assign ${selectedIds.size} photo(s) here`,
				color: '#ff6b35'
			});
		}

		return m;
	});

	function toggleSelect(photoId) {
		const next = new Set(selectedIds);
		if (next.has(photoId)) {
			next.delete(photoId);
		} else {
			next.add(photoId);
		}
		selectedIds = next;
	}

	function selectAll() {
		selectedIds = new Set(untaggedPhotos.map((p) => p.id));
	}

	function clearSelection() {
		selectedIds = new Set();
		pendingCoords = null;
	}

	function handleMapClick(coords) {
		if (selectedIds.size === 0) return;
		pendingCoords = coords;
	}

	async function assignGps() {
		if (!pendingCoords || selectedIds.size === 0) return;

		assigning = true;
		error = '';

		const result = await apiPost('/api/geotag', {
			collection: collectionSlug,
			photoIds: [...selectedIds],
			lat: pendingCoords.lat,
			lng: pendingCoords.lng
		});

		assigning = false;

		if (result.ok) {
			// Remove assigned photos from untagged list
			untaggedPhotos = untaggedPhotos.filter((p) => !selectedIds.has(p.id));
			selectedIds = new Set();
			pendingCoords = null;
		} else {
			error = result.error;
		}
	}

	let selectedCount = $derived(selectedIds.size);
	let canAssign = $derived(selectedCount > 0 && pendingCoords !== null);
</script>

<div class="geotagger">
	<div class="geotagger-left">
		<div class="geotagger-toolbar">
			<span class="count">
				{untaggedPhotos.length} untagged, {selectedCount} selected
			</span>
			<div class="toolbar-actions">
				<button class="btn btn-outline btn-sm" onclick={selectAll}>Select All</button>
				<button class="btn btn-outline btn-sm" onclick={clearSelection}>Clear</button>
			</div>
		</div>

		{#if error}
			<div class="geotagger-error">{error}</div>
		{/if}

		{#if untaggedPhotos.length === 0}
			<div class="geotagger-done">
				All photos have been geo-tagged!
			</div>
		{:else}
			<div class="photo-grid">
				{#each untaggedPhotos as photo (photo.id)}
					<button
						class="grid-item"
						class:selected={selectedIds.has(photo.id)}
						onclick={() => toggleSelect(photo.id)}
					>
						<img src={photo.thumbnail} alt={photo.filename} loading="lazy" />
					</button>
				{/each}
			</div>
		{/if}
	</div>

	<div class="geotagger-right">
		<div class="map-area">
			<Map
				{apiKey}
				center={{ lat: 40, lng: -10 }}
				zoom={3}
				markers={markers}
				clickable={true}
				onmapclick={handleMapClick}
			/>
		</div>

		{#if canAssign}
			<div class="assign-bar">
				<span>
					{pendingCoords.lat.toFixed(4)}, {pendingCoords.lng.toFixed(4)}
				</span>
				<button
					class="btn btn-primary"
					onclick={assignGps}
					disabled={assigning}
				>
					{assigning ? 'Assigning...' : `Assign GPS to ${selectedCount} photo${selectedCount !== 1 ? 's' : ''}`}
				</button>
			</div>
		{:else if selectedCount > 0}
			<div class="assign-bar hint">
				Click on the map to set GPS location
			</div>
		{:else}
			<div class="assign-bar hint">
				Select photos on the left, then click the map
			</div>
		{/if}
	</div>
</div>

<style>
	.geotagger {
		display: flex;
		height: calc(100vh - 96px);
		gap: 0;
	}
	.geotagger-left {
		width: 40%;
		display: flex;
		flex-direction: column;
		border-right: 1px solid var(--color-border);
		overflow: hidden;
	}
	.geotagger-right {
		width: 60%;
		display: flex;
		flex-direction: column;
	}
	.geotagger-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		border-bottom: 1px solid var(--color-border);
		flex-shrink: 0;
	}
	.count {
		font-size: 0.85rem;
		color: var(--color-text-muted);
		font-weight: 600;
	}
	.toolbar-actions {
		display: flex;
		gap: 6px;
	}
	.geotagger-error {
		background: #fdf0f0;
		color: var(--color-danger);
		padding: 8px 16px;
		font-size: 0.8rem;
	}
	.geotagger-done {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: 1;
		color: var(--color-primary);
		font-weight: 600;
		font-size: 1rem;
	}
	.photo-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 6px;
		padding: 12px;
		overflow-y: auto;
		flex: 1;
	}
	.grid-item {
		aspect-ratio: 1;
		overflow: hidden;
		border-radius: var(--radius-sm);
		border: 3px solid transparent;
		cursor: pointer;
		padding: 0;
		background: var(--color-surface);
		transition: border-color 0.1s;
	}
	.grid-item.selected {
		border-color: var(--color-primary);
	}
	.grid-item img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.map-area {
		flex: 1;
		min-height: 0;
	}
	.assign-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		border-top: 1px solid var(--color-border);
		background: var(--color-surface);
		flex-shrink: 0;
	}
	.assign-bar span {
		font-size: 0.85rem;
		color: var(--color-text-muted);
		font-family: monospace;
	}
	.assign-bar.hint {
		justify-content: center;
		color: var(--color-text-muted);
		font-size: 0.85rem;
	}
</style>
