<script>
	/**
	 * Create/edit/delete collections.
	 * Props: collections, oncreated, onupdated, ondeleted
	 */
	import { apiPost, apiPut, apiDelete } from '$lib/api.js';
	import Modal from '$lib/components/common/Modal.svelte';

	let { collections = [], oncreated = null, onupdated = null, ondeleted = null } = $props();

	// New collection form
	let showCreate = $state(false);
	let newSlug = $state('');
	let newName = $state('');
	let newType = $state('travel');
	let newDesc = $state('');
	let createError = $state('');
	let creating = $state(false);

	// Edit state
	let editSlug = $state(null);
	let editName = $state('');
	let editDesc = $state('');
	let editError = $state('');
	let saving = $state(false);

	// Delete confirmation
	let deleteSlug = $state(null);
	let deleteName = $state('');

	function autoSlug(name) {
		return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
	}

	async function handleCreate() {
		creating = true;
		createError = '';

		const result = await apiPost('/api/collections', {
			slug: newSlug,
			name: newName,
			type: newType,
			description: newDesc
		});

		creating = false;
		if (result.ok) {
			showCreate = false;
			newSlug = ''; newName = ''; newType = 'travel'; newDesc = '';
			oncreated?.(result.data.collection);
		} else {
			createError = result.error;
		}
	}

	function startEdit(c) {
		editSlug = c.slug;
		editName = c.name;
		editDesc = c.description;
		editError = '';
	}

	async function handleSaveEdit() {
		saving = true;
		editError = '';

		const result = await apiPut('/api/collections', {
			slug: editSlug,
			updates: { name: editName, description: editDesc }
		});

		saving = false;
		if (result.ok) {
			editSlug = null;
			onupdated?.(result.data.collection);
		} else {
			editError = result.error;
		}
	}

	async function handleDelete() {
		const slug = deleteSlug;
		const result = await apiDelete('/api/collections', { slug });
		if (result.ok) {
			deleteSlug = null;
			ondeleted?.(slug);
		}
	}
</script>

<div class="collection-editor">
	<div class="editor-header">
		<h2>Collections</h2>
		<button class="btn btn-primary btn-sm" onclick={() => showCreate = true}>
			Add Collection
		</button>
	</div>

	<div class="collection-list">
		{#each collections as c (c.slug)}
			<div class="collection-item">
				{#if editSlug === c.slug}
					<div class="edit-form">
						{#if editError}
							<div class="field-error">{editError}</div>
						{/if}
						<input type="text" bind:value={editName} placeholder="Name" />
						<textarea bind:value={editDesc} rows="2" placeholder="Description"></textarea>
						<div class="edit-actions">
							<button class="btn btn-primary btn-sm" onclick={handleSaveEdit} disabled={saving}>
								{saving ? 'Saving...' : 'Save'}
							</button>
							<button class="btn btn-outline btn-sm" onclick={() => editSlug = null}>Cancel</button>
						</div>
					</div>
				{:else}
					<div class="item-info">
						<h3>{c.name}</h3>
						<span class="type-badge type-badge-{c.type}">{c.type}</span>
						<p>{c.description}</p>
					</div>
					<div class="item-actions">
						<button class="btn btn-outline btn-sm" onclick={() => startEdit(c)}>Edit</button>
						<button class="btn btn-danger btn-sm" onclick={() => { deleteSlug = c.slug; deleteName = c.name; }}>Delete</button>
					</div>
				{/if}
			</div>
		{/each}
	</div>

	{#if collections.length === 0}
		<p style="text-align: center; color: var(--color-text-muted); padding: 32px;">
			No collections. Click "Add Collection" to create one.
		</p>
	{/if}
</div>

<!-- Create Modal -->
<Modal title="New Collection" show={showCreate} onclose={() => showCreate = false}>
	{#if createError}
		<div class="field-error">{createError}</div>
	{/if}
	<div class="form-fields">
		<label class="field">
			<span>Name</span>
			<input type="text" bind:value={newName} oninput={() => newSlug = autoSlug(newName)} placeholder="e.g. Scandinavia 2024" />
		</label>
		<label class="field">
			<span>Slug</span>
			<input type="text" bind:value={newSlug} placeholder="e.g. scandinavia-2024" />
		</label>
		<label class="field">
			<span>Type</span>
			<select bind:value={newType}>
				<option value="travel">Travel</option>
				<option value="wildlife">Wildlife</option>
				<option value="action">Action</option>
			</select>
		</label>
		<label class="field">
			<span>Description</span>
			<textarea bind:value={newDesc} rows="2"></textarea>
		</label>
	</div>
	{#snippet actions()}
		<button class="btn btn-outline btn-sm" onclick={() => showCreate = false}>Cancel</button>
		<button class="btn btn-primary btn-sm" onclick={handleCreate} disabled={creating || !newSlug || !newName}>
			{creating ? 'Creating...' : 'Create'}
		</button>
	{/snippet}
</Modal>

<!-- Delete Confirmation -->
<Modal title="Delete Collection" show={deleteSlug !== null} onclose={() => deleteSlug = null}>
	<p>Are you sure you want to delete <strong>{deleteName}</strong>? This will remove all photos and data. This cannot be undone.</p>
	{#snippet actions()}
		<button class="btn btn-outline btn-sm" onclick={() => deleteSlug = null}>Cancel</button>
		<button class="btn btn-danger btn-sm" onclick={handleDelete}>Delete</button>
	{/snippet}
</Modal>

<style>
	.editor-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 20px;
	}
	.editor-header h2 {
		font-size: 1.3rem;
		font-weight: 800;
	}
	.collection-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.collection-item {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		padding: 16px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}
	.item-info h3 {
		font-size: 1rem;
		font-weight: 700;
		display: inline;
		margin-right: 8px;
	}
	.item-info p {
		font-size: 0.85rem;
		color: var(--color-text-muted);
		margin-top: 4px;
	}
	.item-actions {
		display: flex;
		gap: 6px;
		flex-shrink: 0;
	}
	.edit-form {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.edit-form input, .edit-form textarea {
		padding: 8px 10px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: 0.9rem;
		font-family: inherit;
	}
	.edit-actions {
		display: flex;
		gap: 6px;
	}
	.form-fields {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.field span {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--color-text-muted);
	}
	.field input, .field textarea, .field select {
		padding: 8px 10px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: 0.9rem;
		font-family: inherit;
	}
	.field-error {
		background: #fdf0f0;
		color: var(--color-danger);
		padding: 6px 10px;
		border-radius: var(--radius-sm);
		font-size: 0.8rem;
		margin-bottom: 8px;
	}
</style>
