<script>
	import PhotoUploader from '$lib/components/admin/PhotoUploader.svelte';
	import PhotoEditor from '$lib/components/admin/PhotoEditor.svelte';
	import { apiPost, apiDelete } from '$lib/api.js';
	import Modal from '$lib/components/common/Modal.svelte';

	let { data } = $props();

	let photos = $state([]);

	// Re-sync photos when navigating between collections, sorted by date
	$effect(() => {
		const sorted = [...(data.photos ?? [])];
		sorted.sort((a, b) => {
			if (!a.date && !b.date) return 0;
			if (!a.date) return 1;
			if (!b.date) return -1;
			return a.date.localeCompare(b.date);
		});
		photos = sorted;
	});

	function handleUploaded(photo) {
		const idx = photos.findIndex((p) => p.id === photo.id);
		if (idx >= 0) {
			photos = photos.map((p) => p.id === photo.id ? photo : p);
		} else {
			photos = [...photos, photo];
		}
	}

	function handleUpdated(updatedPhoto) {
		photos = photos.map((p) => p.id === updatedPhoto.id ? updatedPhoto : p);
	}

	function handleDeleted(photoId) {
		photos = photos.filter((p) => p.id !== photoId);
		selectedPhotos.delete(photoId);
		selectedPhotos = new Set(selectedPhotos);
	}

	let untaggedCount = $derived(photos.filter((p) => p.gpsSource === null).length);

	// --- Multi-select & batch delete ---
	let selectMode = $state(false);
	let selectedPhotos = $state(new Set());
	let showBatchDeleteConfirm = $state(false);
	let batchDeleteProgress = $state(null);

	let selectedCount = $derived(selectedPhotos.size);
	let allSelected = $derived(photos.length > 0 && selectedPhotos.size === photos.length);

	function toggleSelectMode() {
		selectMode = !selectMode;
		if (!selectMode) selectedPhotos = new Set();
	}

	function togglePhoto(photoId) {
		const next = new Set(selectedPhotos);
		if (next.has(photoId)) next.delete(photoId);
		else next.add(photoId);
		selectedPhotos = next;
	}

	function selectAll() {
		selectedPhotos = new Set(photos.map((p) => p.id));
	}

	function deselectAll() {
		selectedPhotos = new Set();
	}

	async function batchDelete() {
		showBatchDeleteConfirm = false;
		const ids = [...selectedPhotos];
		batchDeleteProgress = { current: 0, total: ids.length, errors: 0 };

		for (let i = 0; i < ids.length; i++) {
			const result = await apiDelete('/api/photos', {
				collection: data.collection.slug,
				photoId: ids[i]
			});

			if (result.ok) {
				handleDeleted(ids[i]);
			} else {
				batchDeleteProgress.errors++;
			}
			batchDeleteProgress.current = i + 1;
		}

		const hadErrors = batchDeleteProgress.errors > 0;
		setTimeout(() => {
			batchDeleteProgress = null;
			if (!hadErrors) {
				selectMode = false;
				selectedPhotos = new Set();
			}
		}, hadErrors ? 5000 : 2000);
	}

	// --- Auto-ID ---
	let unidentifiedPhotos = $derived(
		data.collection.type === 'wildlife' ? photos.filter((p) => !p.species) : []
	);
	let showAutoIdConfirm = $state(false);
	let autoIdProgress = $state(null);
	let autoIdCancelled = false;

	async function bulkAutoIdentify() {
		showAutoIdConfirm = false;
		if (autoIdProgress) return; // prevent re-entry
		const targets = [...unidentifiedPhotos];
		if (targets.length === 0) return;

		autoIdCancelled = false;
		autoIdProgress = { current: 0, total: targets.length, identified: 0, errors: 0 };

		for (let i = 0; i < targets.length; i++) {
			if (autoIdCancelled) break;

			const result = await apiPost('/api/vision', {
				collection: data.collection.slug,
				photoIds: [targets[i].id]
			});

			if (result.ok && result.data.results?.[0]?.status === 'identified') {
				handleUpdated(result.data.results[0].photo);
				autoIdProgress.identified++;
			} else {
				autoIdProgress.errors++;
			}
			autoIdProgress.current = i + 1;
		}

		const delay = autoIdCancelled ? 1000 : 3000;
		setTimeout(() => { autoIdProgress = null; }, delay);
	}

	function cancelAutoId() {
		autoIdCancelled = true;
	}
</script>

<div>
	<div class="page-header">
		<div>
			<h1>{data.collection.name}</h1>
			<span class="type-badge type-badge-{data.collection.type}">{data.collection.type}</span>
		</div>
		<div class="header-actions">
			{#if data.collection.type === 'wildlife' && unidentifiedPhotos.length > 0 && !autoIdProgress}
				<button class="btn btn-outline btn-sm" onclick={() => showAutoIdConfirm = true}>
					Auto-ID {unidentifiedPhotos.length} photo{unidentifiedPhotos.length !== 1 ? 's' : ''}
				</button>
			{/if}
			{#if autoIdProgress}
				<span class="auto-id-progress">
					Identifying... {autoIdProgress.current}/{autoIdProgress.total}
					({autoIdProgress.identified} identified)
				</span>
				<button class="btn btn-outline btn-sm" onclick={cancelAutoId}>Stop</button>
			{/if}
			{#if untaggedCount > 0}
				<a href="/admin/{data.collection.slug}/geotag" class="btn btn-outline btn-sm">
					Geo-tag {untaggedCount} photo{untaggedCount !== 1 ? 's' : ''}
				</a>
			{/if}
		</div>
	</div>

	<section style="margin-top: 24px;">
		<h2 class="subsection-title">Upload Photos</h2>
		<PhotoUploader collectionSlug={data.collection.slug} onuploaded={handleUploaded} />
	</section>

	<section style="margin-top: 32px;">
		<div class="photos-header">
			<h2 class="subsection-title">Photos ({photos.length})</h2>
			{#if photos.length > 0}
				<button class="btn btn-outline btn-sm" onclick={toggleSelectMode}>
					{selectMode ? 'Cancel Select' : 'Select'}
				</button>
			{/if}
		</div>

		{#if selectMode}
			<div class="batch-bar">
				<div class="batch-bar-left">
					<button class="btn btn-outline btn-xs" onclick={allSelected ? deselectAll : selectAll}>
						{allSelected ? 'Deselect All' : 'Select All'}
					</button>
					<span class="batch-count">{selectedCount} selected</span>
				</div>
				{#if batchDeleteProgress}
					<span class="batch-progress">
						Deleting... {batchDeleteProgress.current}/{batchDeleteProgress.total}
						{#if batchDeleteProgress.errors > 0}
							({batchDeleteProgress.errors} failed)
						{/if}
					</span>
				{:else if selectedCount > 0}
					<button class="btn btn-danger btn-sm" onclick={() => showBatchDeleteConfirm = true}>
						Delete Selected ({selectedCount})
					</button>
				{/if}
			</div>
		{/if}

		{#if photos.length === 0}
			<p style="color: var(--color-text-muted); padding: 24px 0;">
				No photos yet. Upload some above.
			</p>
		{:else}
			<div class="photo-list">
				{#each photos as photo (photo.id)}
					{#if selectMode}
						<div class="selectable-photo" class:selected={selectedPhotos.has(photo.id)}>
							<button
								class="select-checkbox"
								onclick={() => togglePhoto(photo.id)}
								aria-label="Select {photo.filename}"
							>
								<span class="check-box" class:checked={selectedPhotos.has(photo.id)}>
									{#if selectedPhotos.has(photo.id)}&#10003;{/if}
								</span>
							</button>
							<div class="selectable-photo-content">
								<PhotoEditor
									{photo}
									collectionSlug={data.collection.slug}
									collectionType={data.collection.type}
									apiKey={data.googleMapsApiKey}
									onupdated={handleUpdated}
									ondeleted={() => handleDeleted(photo.id)}
								/>
							</div>
						</div>
					{:else}
						<PhotoEditor
							{photo}
							collectionSlug={data.collection.slug}
							collectionType={data.collection.type}
							apiKey={data.googleMapsApiKey}
							onupdated={handleUpdated}
							ondeleted={() => handleDeleted(photo.id)}
						/>
					{/if}
				{/each}
			</div>
		{/if}
	</section>
</div>

<Modal title="Delete Selected Photos" show={showBatchDeleteConfirm} onclose={() => showBatchDeleteConfirm = false}>
	<p>Are you sure you want to delete <strong>{selectedCount}</strong> photo{selectedCount !== 1 ? 's' : ''}? This cannot be undone.</p>
	{#snippet actions()}
		<button class="btn btn-outline btn-sm" onclick={() => showBatchDeleteConfirm = false}>Cancel</button>
		<button class="btn btn-danger btn-sm" onclick={batchDelete}>Delete {selectedCount} Photos</button>
	{/snippet}
</Modal>

<Modal title="Auto-ID Bird Species" show={showAutoIdConfirm} onclose={() => showAutoIdConfirm = false}>
	<p>Use AI vision to identify species for <strong>{unidentifiedPhotos.length}</strong>
		photo{unidentifiedPhotos.length !== 1 ? 's' : ''}.</p>
	<p class="cost-estimate">Estimated cost: ~${(unidentifiedPhotos.length * 0.001).toFixed(3)}</p>
	<p style="font-size: 0.8rem; color: var(--color-text-muted);">
		Photos with existing species labels will not be overwritten.
	</p>
	{#snippet actions()}
		<button class="btn btn-outline btn-sm" onclick={() => showAutoIdConfirm = false}>Cancel</button>
		<button class="btn btn-primary btn-sm" onclick={bulkAutoIdentify}>
			Identify {unidentifiedPhotos.length} Photos
		</button>
	{/snippet}
</Modal>

<style>
	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.page-header div {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	h1 {
		font-size: 1.5rem;
		font-weight: 800;
	}
	.header-actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.auto-id-progress {
		font-size: 0.8rem;
		color: var(--color-text-muted);
		padding: 6px 14px;
		background: #f8f9fa;
		border-radius: var(--radius-sm);
	}
	.cost-estimate {
		font-size: 0.85rem;
		color: var(--color-text-muted);
		font-style: italic;
	}
	.photos-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.photos-header .subsection-title {
		margin: 0;
	}
	.batch-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 14px;
		margin-top: 10px;
		background: #f8f9fa;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
	}
	.batch-bar-left {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.btn-xs {
		padding: 3px 8px;
		font-size: 0.7rem;
	}
	.batch-count {
		font-size: 0.8rem;
		color: var(--color-text-muted);
		font-weight: 600;
	}
	.batch-progress {
		font-size: 0.8rem;
		color: var(--color-text-muted);
		padding: 6px 14px;
		background: #fff;
		border-radius: var(--radius-sm);
	}
	.photo-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.selectable-photo {
		display: flex;
		align-items: stretch;
		gap: 0;
		border: 2px solid transparent;
		border-radius: var(--radius-md);
		transition: border-color 0.1s;
	}
	.selectable-photo.selected {
		border-color: var(--color-primary);
		background: #f0faf0;
	}
	.select-checkbox {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		flex-shrink: 0;
		background: #f8f9fa;
		border: none;
		border-right: 1px solid var(--color-border);
		border-radius: var(--radius-md) 0 0 var(--radius-md);
		cursor: pointer;
	}
	.select-checkbox:hover {
		background: #e9ecef;
	}
	.selectable-photo.selected .select-checkbox {
		background: var(--color-primary);
	}
	.check-box {
		width: 18px;
		height: 18px;
		border: 2px solid #adb5bd;
		border-radius: 3px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.75rem;
		font-weight: 700;
		color: transparent;
		background: #fff;
		transition: all 0.1s;
	}
	.check-box.checked {
		background: var(--color-primary);
		border-color: var(--color-primary);
		color: #fff;
	}
	.selectable-photo-content {
		flex: 1;
		min-width: 0;
	}
</style>
