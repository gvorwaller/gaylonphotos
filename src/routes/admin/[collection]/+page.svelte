<script>
	import PhotoUploader from '$lib/components/admin/PhotoUploader.svelte';
	import PhotoEditor from '$lib/components/admin/PhotoEditor.svelte';
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();

	let photos = $state(data.photos);

	// Re-sync photos when navigating between collections
	$effect(() => {
		photos = data.photos;
	});

	function handleUploaded(photo) {
		// Add the _collection field for PhotoEditor to use
		photo._collection = data.collection.slug;
		photos = [...photos, photo];
	}

	function handleUpdated(updatedPhoto) {
		photos = photos.map((p) => p.id === updatedPhoto.id ? { ...updatedPhoto, _collection: data.collection.slug } : p);
	}

	function handleDeleted(photoId) {
		photos = photos.filter((p) => p.id !== photoId);
	}

	let untaggedCount = $derived(photos.filter((p) => p.gpsSource === null).length);
</script>

<div>
	<div class="page-header">
		<div>
			<h1>{data.collection.name}</h1>
			<span class="type-badge type-badge-{data.collection.type}">{data.collection.type}</span>
		</div>
		{#if untaggedCount > 0}
			<a href="/admin/{data.collection.slug}/geotag" class="btn btn-outline btn-sm">
				Geo-tag {untaggedCount} photo{untaggedCount !== 1 ? 's' : ''}
			</a>
		{/if}
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
						photo={{ ...photo, _collection: data.collection.slug }}
						collectionType={data.collection.type}
						onupdated={handleUpdated}
						ondeleted={() => handleDeleted(photo.id)}
					/>
				{/each}
			</div>
		{/if}
	</section>
</div>

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
	.photo-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
</style>
