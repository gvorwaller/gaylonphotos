<script>
	import { apiGet, apiDelete } from '$lib/api.js';

	let { collectionSlug, onclose, ondeleted } = $props();

	let loading = $state(true);
	let error = $state(null);
	let groups = $state([]);
	let totalPhotos = $state(0);
	let hashedCount = $state(0);
	let unhashedCount = $state(0);

	// Track which photos are marked for deletion (not keepers)
	let markedForDelete = $state(new Set());
	let deleting = $state(false);
	let deleteProgress = $state(null);

	$effect(() => {
		loadDuplicates();
	});

	async function loadDuplicates() {
		loading = true;
		error = null;
		const result = await apiGet(`/api/duplicates?collection=${collectionSlug}`);
		if (result.ok) {
			groups = result.data.groups;
			totalPhotos = result.data.total;
			hashedCount = result.data.hashed;
			unhashedCount = result.data.unhashed;
		} else {
			error = result.error;
		}
		loading = false;
	}

	function toggleDelete(photoId) {
		const next = new Set(markedForDelete);
		if (next.has(photoId)) next.delete(photoId);
		else next.add(photoId);
		markedForDelete = next;
	}

	function autoSelectDuplicates() {
		// For each group, keep the first (usually earliest), mark rest for deletion
		const next = new Set();
		for (const group of groups) {
			// Sort by date (earliest first), then by favorite status (keep favorites)
			const sorted = [...group].sort((a, b) => {
				if (a.favorite && !b.favorite) return -1;
				if (!a.favorite && b.favorite) return 1;
				if (!a.date && !b.date) return 0;
				if (!a.date) return 1;
				if (!b.date) return -1;
				return a.date.localeCompare(b.date);
			});
			// Mark all except the first (keeper) for deletion
			for (let i = 1; i < sorted.length; i++) {
				next.add(sorted[i].id);
			}
		}
		markedForDelete = next;
	}

	function clearSelections() {
		markedForDelete = new Set();
	}

	let deleteCount = $derived(markedForDelete.size);

	async function deleteMarked() {
		if (deleteCount === 0) return;
		deleting = true;
		deleteProgress = { current: 0, total: deleteCount, errors: 0 };

		const ids = [...markedForDelete];
		for (let i = 0; i < ids.length; i++) {
			const result = await apiDelete('/api/photos', {
				collection: collectionSlug,
				photoId: ids[i]
			});
			if (result.ok) {
				ondeleted?.(ids[i]);
			} else {
				deleteProgress.errors++;
			}
			deleteProgress.current = i + 1;
		}

		// Remove deleted photos from groups
		const deletedSet = new Set(ids.filter(id => {
			// Only count as deleted if not in errors
			return true; // simplification — we'll just reload
		}));

		deleting = false;
		deleteProgress = null;
		markedForDelete = new Set();

		// Reload to get updated groups
		await loadDuplicates();
	}
</script>

<div class="dup-overlay" role="dialog" aria-modal="true" aria-label="Find Duplicates">
	<div class="dup-panel">
		<div class="dup-header">
			<h3>Find Duplicates</h3>
			<button class="modal-close" onclick={onclose} aria-label="Close">&times;</button>
		</div>

		{#if loading}
			<div class="dup-loading">Scanning {totalPhotos || '...'} photos for duplicates...</div>
		{:else if error}
			<div class="dup-error">Error: {error}</div>
		{:else if groups.length === 0}
			<div class="dup-empty">
				<p>No duplicates found among {hashedCount} hashed photos.</p>
				{#if unhashedCount > 0}
					<p class="dup-hint">{unhashedCount} photos don't have perceptual hashes yet. Run the backfill script to include them.</p>
				{/if}
			</div>
		{:else}
			<div class="dup-summary">
				<span class="dup-stat">{groups.length} duplicate group{groups.length !== 1 ? 's' : ''}</span>
				<span class="dup-stat">{groups.reduce((n, g) => n + g.length, 0)} photos involved</span>
				{#if unhashedCount > 0}
					<span class="dup-hint-inline">{unhashedCount} unhashed</span>
				{/if}
				<span class="dup-divider">|</span>
				<button class="btn btn-outline btn-xs" onclick={autoSelectDuplicates}>Auto-select duplicates</button>
				<button class="btn btn-outline btn-xs" onclick={clearSelections}>Clear</button>
			</div>

			<div class="dup-groups">
				{#each groups as group, gi (gi)}
					<div class="dup-group">
						<div class="dup-group-label">Group {gi + 1} — {group.length} photos</div>
						<div class="dup-group-photos">
							{#each group as photo (photo.id)}
								<div
									class="dup-photo"
									class:marked={markedForDelete.has(photo.id)}
									class:keeper={!markedForDelete.has(photo.id)}
								>
									<button class="dup-photo-toggle" onclick={() => toggleDelete(photo.id)}>
										<img src={photo.thumbnail} alt={photo.filename} class="dup-thumb" />
										{#if markedForDelete.has(photo.id)}
											<span class="dup-badge dup-badge-delete">DELETE</span>
										{:else}
											<span class="dup-badge dup-badge-keep">KEEP</span>
										{/if}
									</button>
									<div class="dup-photo-info">
										<div class="dup-filename">{photo.filename}</div>
										<div class="dup-meta">
											{photo.type === 'video' ? 'Video' : 'Photo'}
											{#if photo.date}
												 — {new Date(photo.date).toLocaleDateString()}
											{/if}
											{#if photo.favorite}
												 — <span class="dup-fav">Fav</span>
											{/if}
										</div>
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/each}
			</div>

			<div class="dup-actions">
				{#if deleting && deleteProgress}
					<span class="dup-progress">
						Deleting... {deleteProgress.current}/{deleteProgress.total}
						{#if deleteProgress.errors > 0}({deleteProgress.errors} failed){/if}
					</span>
				{:else}
					<button class="btn btn-outline btn-sm" onclick={onclose}>Cancel</button>
					{#if deleteCount > 0}
						<button class="btn btn-danger btn-sm" onclick={deleteMarked}>
							Delete {deleteCount} duplicate{deleteCount !== 1 ? 's' : ''}
						</button>
					{/if}
				{/if}
			</div>
		{/if}
	</div>
</div>

<style>
	.dup-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}
	.dup-panel {
		background: #fff;
		border-radius: var(--radius-lg);
		width: 92vw;
		max-width: 800px;
		max-height: 85vh;
		display: flex;
		flex-direction: column;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
	}
	.dup-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 20px;
		border-bottom: 1px solid var(--color-border);
	}
	.dup-header h3 {
		font-size: 1.1rem;
		font-weight: 700;
		margin: 0;
	}
	.dup-loading, .dup-error, .dup-empty {
		padding: 40px 20px;
		text-align: center;
		color: var(--color-text-muted);
	}
	.dup-error {
		color: var(--color-danger);
	}
	.dup-hint {
		font-size: 0.8rem;
		margin-top: 8px;
	}
	.dup-summary {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 20px;
		background: #f8f9fa;
		border-bottom: 1px solid var(--color-border);
		font-size: 0.8rem;
		flex-wrap: wrap;
	}
	.dup-stat {
		font-weight: 600;
		color: var(--color-text-muted);
	}
	.dup-hint-inline {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		font-style: italic;
	}
	.dup-divider {
		color: #dee2e6;
	}
	.dup-groups {
		overflow-y: auto;
		padding: 12px 20px;
		flex: 1;
	}
	.dup-group {
		margin-bottom: 20px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		overflow: hidden;
	}
	.dup-group-label {
		font-size: 0.75rem;
		font-weight: 700;
		text-transform: uppercase;
		color: var(--color-text-muted);
		padding: 8px 12px;
		background: #f8f9fa;
		border-bottom: 1px solid var(--color-border);
	}
	.dup-group-photos {
		display: flex;
		flex-wrap: wrap;
		gap: 0;
	}
	.dup-photo {
		flex: 1 1 180px;
		max-width: 250px;
		border-right: 1px solid var(--color-border);
		transition: background 0.15s;
	}
	.dup-photo:last-child {
		border-right: none;
	}
	.dup-photo.marked {
		background: #fff5f5;
	}
	.dup-photo.keeper {
		background: #f0faf0;
	}
	.dup-photo-toggle {
		display: block;
		width: 100%;
		border: none;
		background: none;
		cursor: pointer;
		padding: 0;
		position: relative;
	}
	.dup-thumb {
		width: 100%;
		aspect-ratio: 1;
		object-fit: cover;
		display: block;
	}
	.dup-badge {
		position: absolute;
		top: 6px;
		right: 6px;
		font-size: 0.6rem;
		font-weight: 800;
		text-transform: uppercase;
		padding: 2px 6px;
		border-radius: 3px;
		letter-spacing: 0.5px;
	}
	.dup-badge-keep {
		background: #d4edda;
		color: #155724;
	}
	.dup-badge-delete {
		background: #f8d7da;
		color: #721c24;
	}
	.dup-photo-info {
		padding: 6px 10px 8px;
	}
	.dup-filename {
		font-size: 0.75rem;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.dup-meta {
		font-size: 0.7rem;
		color: var(--color-text-muted);
	}
	.dup-fav {
		color: #e6a817;
		font-weight: 700;
	}
	.dup-actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 8px;
		padding: 12px 20px;
		border-top: 1px solid var(--color-border);
	}
	.dup-progress {
		font-size: 0.8rem;
		color: var(--color-text-muted);
	}
</style>
