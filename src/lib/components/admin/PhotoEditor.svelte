<script>
	/**
	 * Inline photo metadata editor.
	 * Props: photo, collectionSlug, collectionType, apiKey, onupdated, ondeleted
	 */
	import { apiPost, apiPut, apiDelete } from '$lib/api.js';
	import { reverseGeocode } from '$lib/geocoding.js';
	import Modal from '$lib/components/common/Modal.svelte';
	import AdminPhotoLightbox from '$lib/components/admin/AdminPhotoLightbox.svelte';

	let { photo, collectionSlug = '', collectionType = 'travel', apiKey = '', onupdated = null, ondeleted = null, onpreview = null } = $props();

	// Track whether we've already geocoded this photo to prevent re-firing (intentionally not $state)
	let hasGeocoded = false;
	let resolvedLocationName = $state(null);

	$effect(() => {
		const id = photo.id;
		const slug = collectionSlug;
		if (photo.gps && !photo.locationName && apiKey && slug && !hasGeocoded) {
			hasGeocoded = true;
			const { lat, lng } = photo.gps;
			reverseGeocode(lat, lng, apiKey).then((name) => {
				if (name && photo.id === id) {
					resolvedLocationName = name;
					// Persist silently — don't call onupdated to avoid resetting unsaved form edits
					apiPut('/api/photos', { collection: slug, photoId: id, updates: { locationName: name } });
				}
			}).catch((err) => console.warn('Geocode backfill failed:', err));
		}
	});

	let displayLocation = $derived(photo.locationName || resolvedLocationName);

	let description = $state('');
	let links = $state([]);
	let tagsStr = $state('');
	let favorite = $state(false);
	let species = $state('');
	let spot = $state('');
	let conditions = $state('');

	// Re-sync local state when photo prop changes (e.g. after save or navigation)
	$effect(() => {
		description = photo?.description ?? '';
		links = (photo?.links || []).map((l) => ({ ...l }));
		tagsStr = (photo?.tags || []).join(', ');
		favorite = !!photo?.favorite;
		species = photo?.species || '';
		spot = photo?.spot || '';
		conditions = photo?.conditions || '';
	});

	let saving = $state(false);
	let saved = $state(false);
	let error = $state('');
	let showDeleteConfirm = $state(false);
	let identifying = $state(false);

	async function save() {
		saving = true;
		error = '';

		const updates = {
			description,
			links: links.filter((l) => l.url && l.label),
			tags: tagsStr.split(',').map((t) => t.trim()).filter(Boolean),
			favorite
		};

		if (collectionType === 'wildlife') {
			updates.species = species;
			// Clear AI metadata if user manually changed the species
			if (photo.speciesAI && species !== photo.species) {
				updates.scientificName = null;
				updates.speciesAI = null;
			}
		}
		if (collectionType === 'action') {
			updates.spot = spot;
			updates.conditions = conditions;
		}

		const result = await apiPut('/api/photos', {
			collection: collectionSlug,
			photoId: photo.id,
			updates
		});

		saving = false;
		if (result.ok) {
			saved = true;
			setTimeout(() => saved = false, 2000);
			onupdated?.(result.data.photo);
		} else {
			error = result.error;
		}
	}

	async function autoIdentify() {
		identifying = true;
		error = '';

		const result = await apiPost('/api/vision', {
			collection: collectionSlug,
			photoIds: [photo.id]
		});

		identifying = false;

		if (!result.ok) {
			error = result.error || 'Auto-ID failed';
			return;
		}

		const item = result.data.results?.[0];
		if (!item || item.status !== 'identified') {
			error = item?.reason || item?.error || 'Could not identify species';
			return;
		}

		species = item.species;
		onupdated?.(item.photo);
	}

	async function confirmDelete() {
		const result = await apiDelete('/api/photos', {
			collection: collectionSlug,
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
		<button class="preview-btn" onclick={() => onpreview?.(photo)} aria-label="Preview {photo.filename}">
			<img src={photo.thumbnail} alt={photo.filename} />
			{#if photo.type === 'video'}
				<span class="video-badge">&#9654; Video</span>
			{/if}
		</button>
		<div class="editor-meta">
			<div class="editor-filename">{photo.filename}</div>
			{#if photo.duration}
				<div class="editor-duration">{Math.floor(photo.duration / 60)}:{String(photo.duration % 60).padStart(2, '0')}</div>
			{/if}
			<div class="editor-gps">
				{#if displayLocation}
					<span class="gps-tagged">{displayLocation}</span>
				{:else if photo.gps}
					<span class="gps-tagged">GPS: {photo.gps.lat.toFixed(4)}, {photo.gps.lng.toFixed(4)}</span>
				{:else}
					<span class="gps-untagged">No GPS</span>
				{/if}
			</div>
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

		<div class="field">
			<span class="field-label">Links</span>
			{#each links as link, i}
				<div class="link-row">
					<input type="text" bind:value={link.label} placeholder="Label" class="link-label-input" />
					<input type="url" bind:value={link.url} placeholder="https://..." class="link-url-input" />
					<button type="button" class="btn btn-danger btn-sm link-remove" onclick={() => { links = links.filter((_, j) => j !== i); }}>&times;</button>
				</div>
			{/each}
			<button type="button" class="btn btn-outline btn-sm" onclick={() => { links = [...links, { url: '', label: '' }]; }}>+ Add Link</button>
		</div>

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
				<div class="species-row">
					<input type="text" bind:value={species} placeholder="e.g. Bald Eagle" />
					<button
						class="btn btn-outline btn-sm auto-id-btn"
						onclick={autoIdentify}
						disabled={identifying}
						title="Use AI to identify bird species"
					>
						{identifying ? 'Identifying...' : 'Auto-ID'}
					</button>
				</div>
			</label>
			{#if photo.speciesAI}
				<div class="ai-badge">
					AI: {photo.speciesAI.confidence} confidence
					{#if photo.scientificName}
						<span class="scientific-name">({photo.scientificName})</span>
					{/if}
				</div>
			{/if}
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
			<button class="btn btn-sm" class:btn-primary={!saved} class:btn-saved={saved} onclick={save} disabled={saving || identifying}>
				{saving ? 'Saving...' : saved ? 'Saved!' : 'Save'}
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
	.preview-btn {
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		border-radius: var(--radius-sm);
		transition: opacity 0.15s;
	}
	.preview-btn:hover {
		opacity: 0.8;
	}
	.editor-preview img {
		width: 100px;
		max-height: 120px;
		object-fit: contain;
		border-radius: var(--radius-sm);
		background: #f5f5f5;
	}
	.video-badge {
		display: block;
		margin-top: 4px;
		font-size: 0.65rem;
		font-weight: 600;
		color: #fff;
		background: rgba(0, 0, 0, 0.6);
		padding: 1px 6px;
		border-radius: var(--radius-sm);
	}
	.editor-duration {
		font-size: 0.7rem;
		color: var(--color-text-muted);
		margin-top: 2px;
	}
	.editor-meta {
		min-width: 0;
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
	.field-label {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--color-text-muted);
		display: block;
		margin-bottom: 4px;
	}
	.link-row {
		display: flex;
		gap: 6px;
		margin-bottom: 6px;
	}
	.link-label-input {
		width: 120px;
		flex-shrink: 0;
		padding: 6px 8px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: 0.82rem;
		font-family: inherit;
	}
	.link-url-input {
		flex: 1;
		min-width: 0;
		padding: 6px 8px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: 0.82rem;
		font-family: inherit;
	}
	.link-remove {
		padding: 4px 8px;
		line-height: 1;
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
	.btn-saved {
		background: var(--color-primary);
		color: #fff;
		opacity: 0.7;
		cursor: default;
	}

	.species-row {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	.species-row input {
		flex: 1;
	}
	.auto-id-btn {
		white-space: nowrap;
		flex-shrink: 0;
	}
	.auto-id-btn:disabled {
		opacity: 0.6;
		cursor: wait;
	}
	.ai-badge {
		font-size: 0.7rem;
		color: var(--color-text-muted);
		padding: 2px 0;
	}
	.scientific-name {
		font-style: italic;
	}

	@media (max-width: 1024px) {
		.editor {
			flex-direction: column;
		}
		.editor-preview {
			width: 100%;
			display: flex;
			align-items: center;
			gap: 12px;
		}
		.editor-preview img {
			width: 64px;
			height: 64px;
			flex-shrink: 0;
		}
	}
</style>
