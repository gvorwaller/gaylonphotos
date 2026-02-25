<script>
	/**
	 * Inline photo metadata editor.
	 * Props: photo, collectionType, onupdated, ondeleted
	 */
	import { apiPut, apiDelete } from '$lib/api.js';
	import Modal from '$lib/components/common/Modal.svelte';

	let { photo, collectionType = 'travel', onupdated = null, ondeleted = null } = $props();

	let description = $state('');
	let tagsStr = $state('');
	let favorite = $state(false);
	let species = $state('');
	let spot = $state('');
	let conditions = $state('');

	// Re-sync local state when photo prop changes (e.g. after save or navigation)
	$effect(() => {
		description = photo?.description ?? '';
		tagsStr = (photo?.tags || []).join(', ');
		favorite = !!photo?.favorite;
		species = photo?.species || '';
		spot = photo?.spot || '';
		conditions = photo?.conditions || '';
	});

	let saving = $state(false);
	let error = $state('');
	let showDeleteConfirm = $state(false);

	async function save() {
		saving = true;
		error = '';

		const updates = {
			description,
			tags: tagsStr.split(',').map((t) => t.trim()).filter(Boolean),
			favorite
		};

		if (collectionType === 'wildlife') updates.species = species;
		if (collectionType === 'action') {
			updates.spot = spot;
			updates.conditions = conditions;
		}

		const result = await apiPut('/api/photos', {
			collection: photo.collection || photo._collection,
			photoId: photo.id,
			updates
		});

		saving = false;
		if (result.ok) {
			onupdated?.(result.data.photo);
		} else {
			error = result.error;
		}
	}

	async function confirmDelete() {
		const result = await apiDelete('/api/photos', {
			collection: photo.collection || photo._collection,
			photoId: photo.id
		});

		showDeleteConfirm = false;
		if (result.ok) {
			ondeleted?.();
		} else {
			error = result.error;
		}
	}
</script>

<div class="editor">
	<div class="editor-preview">
		<img src={photo.thumbnail} alt={photo.filename} />
		<div class="editor-filename">{photo.filename}</div>
		<div class="editor-gps">
			{#if photo.gps}
				<span class="gps-tagged">GPS: {photo.gps.lat.toFixed(4)}, {photo.gps.lng.toFixed(4)}</span>
			{:else}
				<span class="gps-untagged">No GPS</span>
			{/if}
		</div>
	</div>

	<div class="editor-fields">
		{#if error}
			<div class="field-error">{error}</div>
		{/if}

		<label class="field">
			<span>Description</span>
			<textarea bind:value={description} rows="2"></textarea>
		</label>

		<label class="field">
			<span>Tags (comma-separated)</span>
			<input type="text" bind:value={tagsStr} placeholder="nature, landscape" />
		</label>

		<label class="field-checkbox">
			<input type="checkbox" bind:checked={favorite} />
			<span>Favorite</span>
		</label>

		{#if collectionType === 'wildlife'}
			<label class="field">
				<span>Species</span>
				<input type="text" bind:value={species} placeholder="e.g. Bald Eagle" />
			</label>
		{/if}

		{#if collectionType === 'action'}
			<label class="field">
				<span>Spot</span>
				<input type="text" bind:value={spot} placeholder="e.g. Pipeline" />
			</label>
			<label class="field">
				<span>Conditions</span>
				<input type="text" bind:value={conditions} placeholder="e.g. 6ft, offshore wind" />
			</label>
		{/if}

		<div class="editor-actions">
			<button class="btn btn-primary btn-sm" onclick={save} disabled={saving}>
				{saving ? 'Saving...' : 'Save'}
			</button>
			<button class="btn btn-danger btn-sm" onclick={() => showDeleteConfirm = true}>
				Delete
			</button>
		</div>
	</div>
</div>

<Modal title="Delete Photo" show={showDeleteConfirm} onclose={() => showDeleteConfirm = false}>
	<p>Are you sure you want to delete <strong>{photo.filename}</strong>? This cannot be undone.</p>
	{#snippet actions()}
		<button class="btn btn-outline btn-sm" onclick={() => showDeleteConfirm = false}>Cancel</button>
		<button class="btn btn-danger btn-sm" onclick={confirmDelete}>Delete</button>
	{/snippet}
</Modal>

<style>
	.editor {
		display: flex;
		gap: 16px;
		padding: 12px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}
	.editor-preview {
		flex-shrink: 0;
		width: 100px;
		text-align: center;
	}
	.editor-preview img {
		width: 100px;
		height: 100px;
		object-fit: cover;
		border-radius: var(--radius-sm);
	}
	.editor-filename {
		font-size: 0.7rem;
		color: var(--color-text-muted);
		margin-top: 4px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.editor-gps {
		font-size: 0.7rem;
		margin-top: 2px;
	}
	.gps-tagged { color: var(--color-primary); }
	.gps-untagged { color: var(--color-warning, #f0ad4e); }
	.editor-fields {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.field span {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-text-muted);
	}
	.field input, .field textarea {
		padding: 6px 10px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: 0.85rem;
		font-family: inherit;
	}
	.field input:focus, .field textarea:focus {
		outline: none;
		border-color: var(--color-primary);
	}
	.field-checkbox {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 0.85rem;
	}
	.field-error {
		background: #fdf0f0;
		color: var(--color-danger);
		padding: 6px 10px;
		border-radius: var(--radius-sm);
		font-size: 0.8rem;
	}
	.editor-actions {
		display: flex;
		gap: 8px;
		margin-top: 4px;
	}
</style>
