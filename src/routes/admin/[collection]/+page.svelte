<script>
	import PhotoUploader from '$lib/components/admin/PhotoUploader.svelte';
	import PhotoEditor from '$lib/components/admin/PhotoEditor.svelte';
	import { apiPost } from '$lib/api.js';
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
	}

	let untaggedCount = $derived(photos.filter((p) => p.gpsSource === null).length);

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
		<h2 class="subsection-title">Photos ({photos.length})</h2>
		{#if photos.length === 0}
			<p style="color: var(--color-text-muted); padding: 24px 0;">
				No photos yet. Upload some above.
			</p>
		{:else}
			<div class="photo-list">
				{#each photos as photo (photo.id)}
					<PhotoEditor
						{photo}
						collectionSlug={data.collection.slug}
						collectionType={data.collection.type}
						apiKey={data.googleMapsApiKey}
						onupdated={handleUpdated}
						ondeleted={() => handleDeleted(photo.id)}
					/>
				{/each}
			</div>
		{/if}
	</section>
</div>

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
	.photo-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
</style>
