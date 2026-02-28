<script>
	/**
	 * Drag-and-drop photo upload component.
	 * Props: collectionSlug, onuploaded
	 */
	import { apiUpload } from '$lib/api.js';

	let { collectionSlug, onuploaded = null } = $props();

	let dragover = $state(false);
	let uploading = $state(false);
	let progress = $state([]); // Array of { name, status: 'pending'|'uploading'|'done'|'error', error? }

	function handleDragOver(e) {
		e.preventDefault();
		dragover = true;
	}

	function handleDragLeave() {
		dragover = false;
	}

	function handleDrop(e) {
		e.preventDefault();
		dragover = false;
		const files = Array.from(e.dataTransfer.files);
		uploadFiles(files);
	}

	function handlePaste(e) {
		if (uploading) return;
		const items = e.clipboardData?.items;
		if (!items) return;
		const files = [];
		for (const item of items) {
			if (item.type.startsWith('image/')) {
				const file = item.getAsFile();
				if (file) {
					// Clone immediately — iOS invalidates clipboard File data after
					// the paste handler returns, breaking the async fetch/FormData.
					files.push(new File([file], file.name || 'pasted-image.jpg', { type: file.type }));
				}
			}
		}
		if (files.length > 0) {
			e.preventDefault();
			uploadFiles(files);
		}
	}

	// Block all text/content insertion into the contenteditable drop zone.
	// This keeps it editable (so iOS shows "Paste" on long-press) but empty.
	function blockInput(e) {
		e.preventDefault();
	}

	function handleFileInput(e) {
		const files = Array.from(e.target.files);
		uploadFiles(files);
		e.target.value = ''; // reset so same file can be re-selected
	}

	async function uploadFiles(files) {
		if (uploading) return;

		const imageFiles = files.filter((f) =>
			f.type.startsWith('image/')
		);

		if (imageFiles.length === 0) return;

		uploading = true;
		progress = imageFiles.map((f) => ({ name: f.name, status: 'pending' }));

		for (let i = 0; i < imageFiles.length; i++) {
			progress[i].status = 'uploading';
			progress = [...progress]; // trigger reactivity

			const formData = new FormData();
			formData.append('file', imageFiles[i]);
			formData.append('collection', collectionSlug);

			const result = await apiUpload('/api/photos', formData);

			if (result.ok) {
				progress[i].status = 'done';
				onuploaded?.(result.data.photo);
			} else {
				progress[i].status = 'error';
				progress[i].error = result.error;
			}
			progress = [...progress];
		}

		uploading = false;
	}

	let doneCount = $derived(progress.filter((p) => p.status === 'done').length);
	let errorCount = $derived(progress.filter((p) => p.status === 'error').length);
</script>

<div class="uploader">
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="drop-zone"
		class:dragover
		contenteditable="true"
		role="button"
		ondragover={handleDragOver}
		ondragleave={handleDragLeave}
		ondrop={handleDrop}
		onpaste={handlePaste}
		onbeforeinput={blockInput}
	>
		<p>Drag & drop photos here, or long-press to paste</p>
		<span>or</span>
		<label class="btn btn-outline btn-sm">
			Browse Files
			<input
				type="file"
				accept="image/jpeg,image/png,image/webp"
				multiple
				onchange={handleFileInput}
				style="display: none;"
			/>
		</label>
	</div>

	{#if progress.length > 0}
		<div class="upload-progress">
			<div class="progress-summary">
				{doneCount}/{progress.length} uploaded
				{#if errorCount > 0}
					<span class="error-count">({errorCount} failed)</span>
				{/if}
			</div>
			<div class="progress-list">
				{#each progress as item}
					<div class="progress-item" class:done={item.status === 'done'} class:error={item.status === 'error'}>
						<span class="progress-name">{item.name}</span>
						<span class="progress-status">
							{#if item.status === 'pending'}Waiting...
							{:else if item.status === 'uploading'}Uploading...
							{:else if item.status === 'done'}Done
							{:else if item.status === 'error'}{item.error || 'Failed'}
							{/if}
						</span>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.drop-zone {
		border: 2px dashed var(--color-border);
		border-radius: var(--radius-lg);
		padding: 40px;
		text-align: center;
		transition: border-color 0.15s, background 0.15s;
		cursor: pointer;
		caret-color: transparent;
		-webkit-user-select: none;
		user-select: none;
		outline: none;
	}
	.drop-zone.dragover {
		border-color: var(--color-primary);
		background: rgba(40, 167, 69, 0.05);
	}
	.drop-zone p {
		font-size: 0.95rem;
		color: var(--color-text-muted);
		margin-bottom: 8px;
	}
	.drop-zone span {
		display: block;
		font-size: 0.8rem;
		color: var(--color-text-muted);
		margin-bottom: 12px;
	}
	.upload-progress {
		margin-top: 16px;
	}
	.progress-summary {
		font-size: 0.85rem;
		font-weight: 600;
		margin-bottom: 8px;
	}
	.error-count {
		color: var(--color-danger);
	}
	.progress-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
		max-height: 200px;
		overflow-y: auto;
	}
	.progress-item {
		display: flex;
		justify-content: space-between;
		padding: 6px 10px;
		background: var(--color-surface);
		border-radius: var(--radius-sm);
		font-size: 0.8rem;
	}
	.progress-item.done {
		opacity: 0.6;
	}
	.progress-item.error .progress-status {
		color: var(--color-danger);
	}
	.progress-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 200px;
	}
	.progress-status {
		color: var(--color-text-muted);
		flex-shrink: 0;
	}

	@media (max-width: 1024px) {
		.drop-zone {
			padding: 24px;
		}
	}
</style>
