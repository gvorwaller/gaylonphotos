<script>
	import PhotoUploader from '$lib/components/admin/PhotoUploader.svelte';
	import PhotoEditor from '$lib/components/admin/PhotoEditor.svelte';
	import AdminPhotoLightbox from '$lib/components/admin/AdminPhotoLightbox.svelte';
	import { apiPost, apiDelete } from '$lib/api.js';
	import { invalidateAll } from '$app/navigation';
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

	// --- Photo lightbox preview ---
	let previewPhoto = $state(null);

	function handlePreview(photo) {
		previewPhoto = photo;
	}

	function handleLightboxDeleted(photoId) {
		handleDeleted(photoId);
		previewPhoto = null;
	}

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

	// --- Auto-Locate (AI geolocation) ---
	let unlocatedPhotos = $derived(photos.filter((p) => !p.gps || p.gps.lat == null || p.gps.lng == null));
	let showAutoLocateConfirm = $state(false);
	let autoLocateProgress = $state(null);
	let autoLocateCancelled = false;
	let autoLocateResults = $state(null); // array of results from API
	let showAutoLocateReview = $state(false);
	let autoLocateApprovals = $state(new Set()); // photoIds approved for saving
	let autoLocateSaving = $state(false);

	let locatedResults = $derived(
		autoLocateResults?.filter((r) => r.status === 'located') ?? []
	);
	let approvedCount = $derived(autoLocateApprovals.size);

	async function bulkAutoLocate() {
		showAutoLocateConfirm = false;
		if (autoLocateProgress) return;
		const targets = [...unlocatedPhotos];
		if (targets.length === 0) return;

		autoLocateCancelled = false;
		autoLocateResults = [];
		autoLocateProgress = { current: 0, total: targets.length, located: 0, errors: 0 };

		for (let i = 0; i < targets.length; i++) {
			if (autoLocateCancelled) break;

			const result = await apiPost('/api/geovision', {
				collection: data.collection.slug,
				photoIds: [targets[i].id]
			});

			if (result.ok && result.data.results?.length > 0) {
				const r = result.data.results[0];
				autoLocateResults = [...autoLocateResults, r];
				if (r.status === 'located') {
					autoLocateProgress.located++;
				} else if (r.status === 'rate-limited') {
					autoLocateProgress.errors++;
					autoLocateProgress.current = i + 1;
					autoLocateCancelled = true;
					autoLocateProgress.rateLimited = true;
					break;
				}
			} else {
				autoLocateResults = [...autoLocateResults, {
					photoId: targets[i].id,
					status: 'failed',
					reason: result.error || 'API error',
					thumbnail: targets[i].thumbnail,
					filename: targets[i].filename
				}];
				autoLocateProgress.errors++;
			}
			autoLocateProgress.current = i + 1;
		}

		// Processing done — auto-approve high-confidence results by default
		const approved = new Set();
		for (const r of autoLocateResults) {
			if (r.status === 'located' && r.confidence === 'high') {
				approved.add(r.photoId);
			}
		}
		autoLocateApprovals = approved;

		autoLocateProgress = null;
		if (autoLocateResults.some((r) => r.status === 'located')) {
			showAutoLocateReview = true;
		}
	}

	function cancelAutoLocate() {
		autoLocateCancelled = true;
	}

	function toggleLocateApproval(photoId) {
		const next = new Set(autoLocateApprovals);
		if (next.has(photoId)) next.delete(photoId);
		else next.add(photoId);
		autoLocateApprovals = next;
	}

	function approveAllLocations() {
		autoLocateApprovals = new Set(locatedResults.map((r) => r.photoId));
	}

	function rejectAllLocations() {
		autoLocateApprovals = new Set();
	}

	let _saveLock = false;
	async function saveApprovedLocations() {
		if (_saveLock || approvedCount === 0) return;
		_saveLock = true;
		autoLocateSaving = true;

		const approvals = locatedResults
			.filter((r) => autoLocateApprovals.has(r.photoId))
			.map((r) => ({
				photoId: r.photoId,
				lat: r.lat,
				lng: r.lng,
				placeName: r.placeName
			}));

		const result = await apiPost('/api/geovision', {
			collection: data.collection.slug,
			photoIds: approvals.map((a) => a.photoId),
			action: 'apply',
			approvals
		});

		if (result.ok) {
			// Update local photo state for each saved photo
			for (const r of result.data.results) {
				if (r.status === 'saved' && r.photo) {
					handleUpdated(r.photo);
				}
			}
			// Invalidate page data so SvelteKit re-fetches from server
			await invalidateAll();
		} else {
			console.error('[geovision] Save failed:', result.error);
		}

		autoLocateSaving = false;
		_saveLock = false;
		showAutoLocateReview = false;
		autoLocateResults = null;
		autoLocateApprovals = new Set();
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
			{#if unlocatedPhotos.length > 0 && !autoLocateProgress}
				<button class="btn btn-outline btn-sm" onclick={() => showAutoLocateConfirm = true}>
					Auto-locate {unlocatedPhotos.length} photo{unlocatedPhotos.length !== 1 ? 's' : ''}
				</button>
			{/if}
			{#if autoLocateProgress}
				<span class="auto-id-progress">
					{#if autoLocateProgress.rateLimited}
						Rate limited — quota exceeded. Wait or enable billing.
					{:else}
						Locating... {autoLocateProgress.current}/{autoLocateProgress.total}
						({autoLocateProgress.located} located)
					{/if}
				</span>
				{#if !autoLocateProgress.rateLimited}
					<button class="btn btn-outline btn-sm" onclick={cancelAutoLocate}>Stop</button>
				{/if}
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
									onpreview={handlePreview}
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
							onpreview={handlePreview}
						/>
					{/if}
				{/each}
			</div>
		{/if}
	</section>
</div>

{#if previewPhoto}
	<AdminPhotoLightbox
		photo={previewPhoto}
		{photos}
		collectionSlug={data.collection.slug}
		onclose={() => previewPhoto = null}
		ondeleted={handleLightboxDeleted}
	/>
{/if}

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

<Modal title="Auto-Locate Photos" show={showAutoLocateConfirm} onclose={() => showAutoLocateConfirm = false}>
	<p>Use AI vision (Gemini) to identify locations for <strong>{unlocatedPhotos.length}</strong>
		photo{unlocatedPhotos.length !== 1 ? 's' : ''} without GPS data.</p>
	<p class="cost-estimate">Estimated cost: ~${(unlocatedPhotos.length * 0.002).toFixed(3)}</p>
	<p style="font-size: 0.8rem; color: var(--color-text-muted);">
		Results will be shown for your review before saving. Photos with existing GPS will be skipped.
	</p>
	{#snippet actions()}
		<button class="btn btn-outline btn-sm" onclick={() => showAutoLocateConfirm = false}>Cancel</button>
		<button class="btn btn-primary btn-sm" onclick={bulkAutoLocate}>
			Locate {unlocatedPhotos.length} Photos
		</button>
	{/snippet}
</Modal>

{#if showAutoLocateReview && autoLocateResults}
	<div class="review-overlay" role="dialog" aria-modal="true" aria-label="Review AI Locations">
		<div class="review-panel">
			<div class="review-header">
				<h3>Review AI Locations</h3>
				<button class="modal-close" onclick={() => { showAutoLocateReview = false; autoLocateResults = null; }} aria-label="Close">&times;</button>
			</div>

			<div class="review-summary">
				<span class="review-stat">{locatedResults.length} located</span>
				<span class="review-stat">{autoLocateResults.filter((r) => r.status !== 'located').length} failed</span>
				<span class="review-divider">|</span>
				<button class="btn btn-outline btn-xs" onclick={approveAllLocations}>Approve All</button>
				<button class="btn btn-outline btn-xs" onclick={rejectAllLocations}>Reject All</button>
			</div>

			<div class="review-list">
				{#each locatedResults as result (result.photoId)}
					<div class="review-item" class:approved={autoLocateApprovals.has(result.photoId)}>
						<button class="review-toggle" onclick={() => toggleLocateApproval(result.photoId)}>
							<span class="check-box" class:checked={autoLocateApprovals.has(result.photoId)}>
								{#if autoLocateApprovals.has(result.photoId)}&#10003;{/if}
							</span>
						</button>
						<img class="review-thumb" src={result.thumbnail} alt={result.filename} />
						<div class="review-info">
							<div class="review-filename">{result.filename}</div>
							<div class="review-place">{result.placeName || 'Unknown'}</div>
							<div class="review-reasoning">{result.reasoning}</div>
						</div>
						<span class="confidence-badge confidence-{result.confidence}">{result.confidence}</span>
					</div>
				{/each}

				{#each autoLocateResults.filter((r) => r.status !== 'located') as result (result.photoId)}
					<div class="review-item review-failed">
						<span class="review-toggle-placeholder"></span>
						<img class="review-thumb" src={result.thumbnail} alt={result.filename || result.photoId} />
						<div class="review-info">
							<div class="review-filename">{result.filename || result.photoId}</div>
							<div class="review-reasoning">{result.reason || 'Could not determine location'}</div>
						</div>
						<span class="confidence-badge confidence-none">none</span>
					</div>
				{/each}
			</div>

			<div class="review-actions">
				<button class="btn btn-outline btn-sm" onclick={() => { showAutoLocateReview = false; autoLocateResults = null; }}>
					Cancel
				</button>
				<button
					class="btn btn-primary btn-sm"
					disabled={approvedCount === 0 || autoLocateSaving}
					onclick={saveApprovedLocations}
				>
					{#if autoLocateSaving}
						Saving...
					{:else}
						Save {approvedCount} Location{approvedCount !== 1 ? 's' : ''}
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}

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

	/* --- Auto-locate review panel --- */
	.review-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}
	.review-panel {
		background: #fff;
		border-radius: var(--radius-lg);
		width: 90vw;
		max-width: 720px;
		max-height: 85vh;
		display: flex;
		flex-direction: column;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
	}
	.review-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 20px;
		border-bottom: 1px solid var(--color-border);
	}
	.review-header h3 {
		font-size: 1.1rem;
		font-weight: 700;
		margin: 0;
	}
	.review-summary {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 20px;
		background: #f8f9fa;
		border-bottom: 1px solid var(--color-border);
		font-size: 0.8rem;
	}
	.review-stat {
		font-weight: 600;
		color: var(--color-text-muted);
	}
	.review-divider {
		color: #dee2e6;
	}
	.review-list {
		overflow-y: auto;
		padding: 12px 20px;
		flex: 1;
	}
	.review-item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 0;
		border-bottom: 1px solid #f0f0f0;
	}
	.review-item:last-child {
		border-bottom: none;
	}
	.review-item.approved {
		background: #f0faf0;
		margin: 0 -20px;
		padding: 8px 20px;
	}
	.review-item.review-failed {
		opacity: 0.5;
	}
	.review-toggle {
		background: none;
		border: none;
		cursor: pointer;
		padding: 2px;
		flex-shrink: 0;
	}
	.review-toggle-placeholder {
		width: 22px;
		flex-shrink: 0;
	}
	.review-thumb {
		width: 48px;
		height: 48px;
		object-fit: cover;
		border-radius: 4px;
		flex-shrink: 0;
	}
	.review-info {
		flex: 1;
		min-width: 0;
	}
	.review-filename {
		font-size: 0.8rem;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.review-place {
		font-size: 0.85rem;
		color: var(--color-text);
	}
	.review-reasoning {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.confidence-badge {
		font-size: 0.65rem;
		font-weight: 700;
		text-transform: uppercase;
		padding: 2px 6px;
		border-radius: 3px;
		flex-shrink: 0;
	}
	.confidence-high {
		background: #d4edda;
		color: #155724;
	}
	.confidence-medium {
		background: #fff3cd;
		color: #856404;
	}
	.confidence-low {
		background: #f8d7da;
		color: #721c24;
	}
	.confidence-none {
		background: #e9ecef;
		color: #6c757d;
	}
	.review-actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 8px;
		padding: 12px 20px;
		border-top: 1px solid var(--color-border);
	}
</style>
