<script>
	/**
	 * GEDCOM re-import with diff preview and accept/reject per field.
	 * Props: collectionSlug, ancestry (existing)
	 */
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { apiUpload, apiPut } from '$lib/api.js';
	import { parseGedcomPersonList } from '$lib/gedcom-utils.js';
	import Modal from '$lib/components/common/Modal.svelte';

	let { collectionSlug, ancestry } = $props();

	// --- Step tracking ---
	let step = $state('upload'); // 'upload' | 'review' | 'applying'

	// --- Upload state ---
	let selectedFile = $state(null);
	let rootPersonId = $state('');
	const initialMaxGenerations = untrack(() => ancestry?.meta?.generationCount ?? 8);
	let maxGenerations = $state(initialMaxGenerations);
	let personList = $state([]);
	let personSearch = $state('');
	let showPersonDropdown = $state(false);
	let scanningFile = $state(false);
	let previewLoading = $state(false);
	let previewError = $state('');
	let rootPrefilled = $state(false);

	// Pre-fill from existing ancestry (once only)
	$effect(() => {
		if (ancestry?.meta && !untrack(() => rootPrefilled)) {
			const rootIds = ancestry.meta.rootPersonIds || [ancestry.meta.rootPersonId];
			if (rootIds[0]) rootPersonId = rootIds[0];
			rootPrefilled = true;
		}
	});

	// --- Diff state ---
	let diff = $state(null);
	let previewId = $state('');
	let normalizedRootPersonId = $state('');
	let expandedPersons = $state(new Set());
	let showApplyConfirm = $state(false);
	let applyError = $state('');

	function readFileAsText(file) {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result);
			reader.onerror = () => reject(reader.error);
			reader.readAsText(file);
		});
	}

	async function scanFile(file) {
		if (!file) { personList = []; return; }
		scanningFile = true;
		try {
			const text = await readFileAsText(file);
			personList = parseGedcomPersonList(text);
		} catch { personList = []; }
		scanningFile = false;
	}

	let filteredPersons = $derived.by(() => {
		if (!personSearch) return personList.slice(0, 50);
		const q = personSearch.toLowerCase();
		return personList.filter(p =>
			p.name.toLowerCase().includes(q) ||
			p.id.toLowerCase().includes(q) ||
			(p.birthPlace && p.birthPlace.toLowerCase().includes(q))
		).slice(0, 50);
	});

	function selectPerson(person) {
		rootPersonId = person.id;
		personSearch = formatPersonLabel(person);
		showPersonDropdown = false;
	}

	function formatPersonLabel(p) {
		let label = p.name;
		if (p.birthYear || p.birthPlace) {
			const parts = [];
			if (p.birthYear) parts.push(`b. ${p.birthYear}`);
			if (p.birthPlace) parts.push(p.birthPlace.split(',')[0].trim());
			label += ` (${parts.join(', ')})`;
		}
		return label;
	}

	function handleFileInput(e) {
		const file = e.target.files?.[0];
		if (file) { selectedFile = file; scanFile(file); }
		e.target.value = '';
	}

	function handleDrop(e) {
		e.preventDefault();
		const file = e.dataTransfer.files?.[0];
		if (file && file.name.toLowerCase().endsWith('.ged')) {
			selectedFile = file;
			scanFile(file);
		}
	}

	// --- Preview ---
	async function previewChanges() {
		if (!selectedFile || previewLoading) return;
		previewLoading = true;
		previewError = '';

		try {
			const formData = new FormData();
			formData.append('file', selectedFile);
			formData.append('collection', collectionSlug);
			formData.append('rootPersonId', rootPersonId);
			formData.append('maxGenerations', String(maxGenerations));

			const result = await apiUpload('/api/ancestry/reimport', formData);

			if (result.ok) {
				diff = result.data.diff;
				previewId = result.data.previewId;
				normalizedRootPersonId = result.data.rootPersonId;
				addedAccepted = new Set((diff.added || []).map(p => p.id));
				removedConfirmed = new Set();
				expandedPersons = new Set();
				step = 'review';
			} else {
				previewError = result.error;
			}
		} catch (err) {
			previewError = 'Network error — please try again';
		} finally {
			previewLoading = false;
		}
	}

	// --- Diff state helpers ---
	function toggleExpand(personId) {
		const next = new Set(expandedPersons);
		if (next.has(personId)) next.delete(personId);
		else next.add(personId);
		expandedPersons = next;
	}

	function setFieldAction(changeIdx, fieldIdx, action) {
		diff.changes[changeIdx].fields[fieldIdx].action = action;
	}

	function acceptAllUnprotected() {
		for (const change of diff.changes) {
			for (const field of change.fields) {
				if (!field.hasOverride) field.action = 'accept';
			}
		}
	}

	function rejectAll() {
		for (const change of diff.changes) {
			for (const field of change.fields) {
				field.action = 'reject';
			}
		}
	}

	// Added persons: track which to include (initialized on preview, not via $effect)
	let addedAccepted = $state(new Set());

	function toggleAdded(id) {
		const next = new Set(addedAccepted);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		addedAccepted = next;
	}

	// Removed persons: track which to actually remove
	let removedConfirmed = $state(new Set());

	function toggleRemoved(id) {
		const next = new Set(removedConfirmed);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		removedConfirmed = next;
	}

	// Count of accepted changes
	let acceptedCount = $derived.by(() => {
		if (!diff) return 0;
		let count = 0;
		for (const c of diff.changes) {
			count += c.fields.filter(f => f.action === 'accept').length;
		}
		count += addedAccepted.size;
		count += removedConfirmed.size;
		return count;
	});

	// --- Apply ---
	async function applyChanges() {
		step = 'applying';
		applyError = '';

		try {
			const decisions = {
				changes: diff.changes.map(c => ({
					personId: c.personId,
					fields: c.fields.map(f => ({ field: f.field, action: f.action }))
				})),
				addedIds: [...addedAccepted],
				removedIds: [...removedConfirmed]
			};

			const result = await apiPut('/api/ancestry/reimport', {
				collection: collectionSlug,
				rootPersonId: normalizedRootPersonId,
				maxGenerations,
				decisions,
				previewId
			});

			if (result.ok) {
				goto(`/admin/${collectionSlug}/ancestry`);
			} else {
				// If preview session expired, reset to upload step
				if (result.error?.includes('expired') || result.error?.includes('re-upload')) {
					previewError = result.error;
					diff = null;
					previewId = '';
					step = 'upload';
				} else {
					applyError = result.error;
					step = 'review';
				}
			}
		} catch {
			applyError = 'Network error — please try again';
			step = 'review';
		}
	}
</script>

<div class="reimport">
	{#if step === 'upload'}
		<!-- Step 1: Upload -->
		<section class="upload-section">
			<p class="help-text">
				Upload a new GEDCOM export to compare against the existing ancestry data.
				Changes will be previewed before applying — your manual edits (GPS, name corrections) are protected.
			</p>

			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="drop-zone"
				class:has-file={selectedFile}
				ondragover={(e) => e.preventDefault()}
				ondrop={handleDrop}
			>
				{#if selectedFile}
					<p class="file-name">{selectedFile.name}</p>
					<span class="file-size">{(selectedFile.size / 1024).toFixed(1)} KB</span>
				{:else}
					<p>Drag & drop a .ged file here</p>
					<span>or</span>
				{/if}
				<label class="btn btn-outline btn-sm">
					{selectedFile ? 'Change File' : 'Browse Files'}
					<input type="file" accept=".ged" onchange={handleFileInput} style="display: none;" />
				</label>
			</div>

			<div class="import-options">
				<div class="field">
					<span>Root Person</span>
					{#if scanningFile}
						<div class="scanning-hint">Scanning file...</div>
					{:else if personList.length > 0}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div class="person-picker" onkeydown={(e) => { if (e.key === 'Escape') showPersonDropdown = false; }}>
							<input
								type="text"
								bind:value={personSearch}
								placeholder="Search by name..."
								onfocus={() => showPersonDropdown = true}
								oninput={() => { showPersonDropdown = true; rootPersonId = ''; }}
								onblur={() => { setTimeout(() => showPersonDropdown = false, 200); }}
							/>
							{#if rootPersonId}
								<span class="picked-id">{rootPersonId}</span>
							{/if}
							{#if showPersonDropdown}
								<div class="person-dropdown">
									{#each filteredPersons as person (person.id)}
										<button type="button" class="person-option" onmousedown={() => selectPerson(person)}>
											<span class="option-name">{person.name}</span>
											{#if person.birthYear || person.birthPlace}
												<span class="option-detail">
													{person.birthYear ? `b. ${person.birthYear}` : ''}
													{person.birthPlace ? person.birthPlace.split(',')[0].trim() : ''}
												</span>
											{/if}
											<span class="option-id">{person.id}</span>
										</button>
									{/each}
									{#if filteredPersons.length === 0}
										<div class="no-results">No matches</div>
									{/if}
								</div>
							{/if}
						</div>
						<span class="field-hint">{personList.length} individuals found.</span>
					{:else}
						<input type="text" bind:value={rootPersonId} placeholder="@I1@" />
						<span class="field-hint">Select a GEDCOM file first, or enter the ID manually.</span>
					{/if}
				</div>

				<label class="field">
					<span>Max Generations</span>
					<div class="slider-row">
						<input type="range" min="1" max="8" bind:value={maxGenerations} />
						<span class="slider-value">{maxGenerations}</span>
					</div>
				</label>
			</div>

			{#if previewError}
				<div class="field-error">{previewError}</div>
			{/if}

			<button
				class="btn btn-primary"
				onclick={previewChanges}
				disabled={!selectedFile || !rootPersonId || previewLoading}
			>
				{previewLoading ? 'Analyzing changes...' : 'Preview Changes'}
			</button>
		</section>

	{:else if step === 'review'}
		<!-- Step 2: Diff Review -->
		<section class="review-section">
			<!-- Summary bar -->
			<div class="summary-bar">
				<span class="summary-stat">{diff.summary.matched} matched</span>
				<span class="summary-stat changed">{diff.summary.changed} changed</span>
				<span class="summary-stat added">{diff.summary.added} added</span>
				<span class="summary-stat removed">{diff.summary.removed} removed</span>
				{#if diff.summary.protectedOverrides > 0}
					<span class="summary-stat protected">{diff.summary.protectedOverrides} protected</span>
				{/if}
			</div>

			<!-- Bulk actions -->
			{#if diff.changes.length > 0}
				<div class="bulk-actions">
					<button class="btn btn-outline btn-sm" onclick={acceptAllUnprotected}>Accept All Unprotected</button>
					<button class="btn btn-outline btn-sm" onclick={rejectAll}>Reject All</button>
				</div>
			{/if}

			<!-- Changed persons -->
			{#if diff.changes.length > 0}
				<h3 class="section-title">Changed ({diff.changes.length})</h3>
				<div class="changes-list">
					{#each diff.changes as change, ci (change.personId)}
						<div class="change-item">
							<button class="change-header" onclick={() => toggleExpand(change.personId)}>
								<span class="expand-icon">{expandedPersons.has(change.personId) ? '▼' : '▶'}</span>
								<span class="change-name">{change.name}</span>
								<span class="change-gen">Gen {change.generation}</span>
								<span class="match-badge match-{change.matchType}">{change.matchType}</span>
								<span class="change-count">{change.fields.length} field{change.fields.length !== 1 ? 's' : ''}</span>
							</button>

							{#if expandedPersons.has(change.personId)}
								<div class="field-diff-table">
									<div class="diff-header">
										<span>Field</span>
										<span>Current</span>
										<span>New (GEDCOM)</span>
										<span>Action</span>
									</div>
									{#each change.fields as field, fi (field.field + fi)}
										<div class="diff-row" class:protected={field.hasOverride}>
											<span class="diff-field">
												{field.field}
												{#if field.hasOverride}
													<span class="lock-icon" title="{field.overrideReason || 'manually edited'}">&#128274;</span>
												{/if}
											</span>
											<span class="diff-old" title={field.oldValue ?? ''}>{field.oldValue ?? '—'}</span>
											<span class="diff-new" title={field.newValue ?? ''}>{field.newValue ?? '—'}</span>
											<span class="diff-action">
												<button
													class="action-btn"
													class:active={field.action === 'accept'}
													class:accept={field.action === 'accept'}
													onclick={() => setFieldAction(ci, fi, 'accept')}
												>Accept</button>
												<button
													class="action-btn"
													class:active={field.action === 'reject'}
													class:reject={field.action === 'reject'}
													onclick={() => setFieldAction(ci, fi, 'reject')}
												>Reject</button>
											</span>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}

			<!-- New persons -->
			{#if diff.added.length > 0}
				<h3 class="section-title">New Persons ({diff.added.length})</h3>
				<div class="added-list">
					{#each diff.added as person (person.id)}
						<label class="added-row">
							<input
								type="checkbox"
								checked={addedAccepted.has(person.id)}
								onchange={() => toggleAdded(person.id)}
							/>
							<span class="added-name">{person.name}</span>
							<span class="added-detail">
								{person.birthDate ?? ''} {person.birthPlace ? `— ${person.birthPlace.split(',')[0]}` : ''}
							</span>
							<span class="added-gen">Gen {person.generation}</span>
						</label>
					{/each}
				</div>
			{/if}

			<!-- Removed persons -->
			{#if diff.removed.length > 0}
				<h3 class="section-title">Removed ({diff.removed.length})</h3>
				<p class="help-text">These persons are in your data but not in the new GEDCOM. Default: keep them.</p>
				<div class="removed-list">
					{#each diff.removed as person (person.id)}
						<label class="removed-row">
							<input
								type="checkbox"
								checked={removedConfirmed.has(person.id)}
								onchange={() => toggleRemoved(person.id)}
							/>
							<span class="removed-label">Remove</span>
							<span class="removed-name">{person.name}</span>
							<span class="removed-gen">Gen {person.generation}</span>
							<span class="removed-lineage">{person.lineage}</span>
						</label>
					{/each}
				</div>
			{/if}

			{#if applyError}
				<div class="field-error">{applyError}</div>
			{/if}

			<!-- Apply actions -->
			<div class="apply-actions">
				<button class="btn btn-primary" onclick={() => showApplyConfirm = true} disabled={acceptedCount === 0}>
					Apply {acceptedCount} Change{acceptedCount !== 1 ? 's' : ''}
				</button>
				<button class="btn btn-outline" onclick={() => { step = 'upload'; diff = null; }}>
					Back
				</button>
			</div>
		</section>

	{:else if step === 'applying'}
		<div class="applying">
			<div class="spinner"></div>
			<p>Applying changes...</p>
		</div>
	{/if}
</div>

<Modal title="Apply Re-Import" show={showApplyConfirm} onclose={() => showApplyConfirm = false}>
	<p>
		{#if diff}
			Updating {diff.changes.reduce((s, c) => s + c.fields.filter(f => f.action === 'accept').length, 0)} fields
			on {diff.changes.filter(c => c.fields.some(f => f.action === 'accept')).length} persons.
			{#if addedAccepted.size > 0}Adding {addedAccepted.size} new person{addedAccepted.size !== 1 ? 's' : ''}.{/if}
			{#if removedConfirmed.size > 0}Removing {removedConfirmed.size} person{removedConfirmed.size !== 1 ? 's' : ''}.{/if}
			{#if diff.summary.protectedOverrides > 0}{diff.summary.protectedOverrides} field{diff.summary.protectedOverrides !== 1 ? 's' : ''} protected by your edits.{/if}
		{/if}
	</p>
	{#snippet actions()}
		<button class="btn btn-outline btn-sm" onclick={() => showApplyConfirm = false}>Cancel</button>
		<button class="btn btn-primary btn-sm" onclick={() => { showApplyConfirm = false; applyChanges(); }}>Apply</button>
	{/snippet}
</Modal>

<style>
	.reimport {
		max-width: 900px;
	}
	.help-text {
		color: var(--color-text-muted);
		font-size: 0.85rem;
		margin-bottom: 16px;
	}

	/* Upload */
	.drop-zone {
		border: 2px dashed var(--color-border);
		border-radius: var(--radius-lg);
		padding: 32px;
		text-align: center;
		transition: border-color 0.15s, background 0.15s;
	}
	.drop-zone.has-file {
		border-color: var(--color-primary);
		background: rgba(40, 167, 69, 0.03);
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
	.file-name {
		font-weight: 600;
		color: var(--color-text) !important;
	}
	.file-size {
		font-size: 0.75rem !important;
	}
	.import-options {
		display: flex;
		gap: 24px;
		margin: 20px 0;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 3px;
		flex: 1;
	}
	.field > span {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-text-muted);
	}
	.field input[type="text"] {
		padding: 6px 10px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: 0.85rem;
		font-family: inherit;
	}
	.field input:focus {
		outline: none;
		border-color: var(--color-primary);
	}
	.field-hint {
		font-size: 0.7rem !important;
		font-weight: 400 !important;
		color: var(--color-text-muted);
	}
	.slider-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.slider-row input[type="range"] { flex: 1; }
	.slider-value {
		font-size: 0.9rem !important;
		font-weight: 700 !important;
		min-width: 20px;
		text-align: center;
	}
	.field-error {
		background: #fdf0f0;
		color: var(--color-danger);
		padding: 8px 12px;
		border-radius: var(--radius-sm);
		font-size: 0.8rem;
		margin: 12px 0;
	}

	/* Person picker */
	.person-picker { position: relative; }
	.person-picker input[type="text"] {
		width: 100%;
		padding: 6px 10px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: 0.85rem;
		font-family: inherit;
	}
	.person-picker input:focus { outline: none; border-color: var(--color-primary); }
	.picked-id {
		font-size: 0.7rem !important;
		font-weight: 400 !important;
		color: var(--color-primary) !important;
		font-family: monospace;
	}
	.scanning-hint {
		font-size: 0.8rem;
		color: var(--color-text-muted);
		font-style: italic;
		padding: 6px 0;
	}
	.person-dropdown {
		position: absolute;
		top: 100%; left: 0; right: 0;
		max-height: 260px;
		overflow-y: auto;
		background: var(--color-bg, #fff);
		border: 1px solid var(--color-border);
		border-top: none;
		border-radius: 0 0 var(--radius-sm) var(--radius-sm);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
		z-index: 100;
	}
	.person-option {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 6px 10px;
		border: none;
		background: none;
		cursor: pointer;
		font-size: 0.8rem;
		text-align: left;
		font-family: inherit;
	}
	.person-option:hover { background: var(--color-surface, #f8f9fa); }
	.option-name { font-weight: 600; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.option-detail { color: var(--color-text-muted); font-size: 0.75rem; white-space: nowrap; }
	.option-id { color: var(--color-text-muted); font-size: 0.65rem; font-family: monospace; white-space: nowrap; }
	.no-results { padding: 8px 10px; font-size: 0.8rem; color: var(--color-text-muted); font-style: italic; }

	/* Summary bar */
	.summary-bar {
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
		padding: 12px 16px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		margin-bottom: 16px;
	}
	.summary-stat {
		font-size: 0.85rem;
		font-weight: 600;
		padding: 2px 10px;
		border-radius: 4px;
	}
	.summary-stat.changed { background: #fff3e0; color: #e65100; }
	.summary-stat.added { background: #e8f5e9; color: #2e7d32; }
	.summary-stat.removed { background: #fce4ec; color: #c62828; }
	.summary-stat.protected { background: #e3f2fd; color: #1565c0; }

	.bulk-actions {
		display: flex;
		gap: 8px;
		margin-bottom: 16px;
	}

	.section-title {
		font-size: 0.95rem;
		font-weight: 700;
		margin: 20px 0 8px;
	}

	/* Changed persons */
	.changes-list {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}
	.change-item {
		border-bottom: 1px solid var(--color-border);
	}
	.change-item:last-child { border-bottom: none; }
	.change-header {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 8px 12px;
		border: none;
		background: none;
		cursor: pointer;
		font-size: 0.85rem;
		text-align: left;
		font-family: inherit;
	}
	.change-header:hover { background: var(--color-surface); }
	.expand-icon { font-size: 0.7rem; color: var(--color-text-muted); width: 14px; }
	.change-name { font-weight: 600; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.change-gen { font-size: 0.75rem; color: var(--color-text-muted); }
	.match-badge {
		font-size: 0.65rem;
		font-weight: 600;
		padding: 1px 6px;
		border-radius: 3px;
		text-transform: uppercase;
	}
	.match-fsId { background: #e8f5e9; color: #2e7d32; }
	.match-xref { background: #fff3e0; color: #e65100; }
	.match-fuzzy { background: #fce4ec; color: #c62828; }
	.change-count {
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}

	/* Diff table */
	.field-diff-table {
		padding: 0 12px 12px;
	}
	.diff-header {
		display: grid;
		grid-template-columns: 100px 1fr 1fr 120px;
		gap: 8px;
		padding: 4px 8px;
		font-size: 0.7rem;
		font-weight: 600;
		color: var(--color-text-muted);
		text-transform: uppercase;
	}
	.diff-row {
		display: grid;
		grid-template-columns: 100px 1fr 1fr 120px;
		gap: 8px;
		padding: 4px 8px;
		font-size: 0.8rem;
		border-top: 1px solid var(--color-border);
		align-items: center;
	}
	.diff-row.protected {
		background: #e3f2fd;
	}
	.diff-field {
		font-weight: 600;
		font-size: 0.75rem;
		text-transform: capitalize;
	}
	.lock-icon { font-size: 0.65rem; }
	.diff-old, .diff-new {
		font-size: 0.8rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.diff-old { color: var(--color-text-muted); }
	.diff-new { color: var(--color-text); font-weight: 500; }
	.diff-action {
		display: flex;
		gap: 4px;
	}
	.action-btn {
		padding: 2px 8px;
		border: 1px solid var(--color-border);
		border-radius: 3px;
		background: none;
		cursor: pointer;
		font-size: 0.7rem;
		font-family: inherit;
	}
	.action-btn:hover { background: var(--color-surface); }
	.action-btn.active.accept {
		background: #e8f5e9;
		border-color: #2e7d32;
		color: #2e7d32;
		font-weight: 600;
	}
	.action-btn.active.reject {
		background: #fce4ec;
		border-color: #c62828;
		color: #c62828;
		font-weight: 600;
	}

	/* Added */
	.added-list {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}
	.added-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 12px;
		font-size: 0.8rem;
		border-bottom: 1px solid var(--color-border);
		cursor: pointer;
	}
	.added-row:last-child { border-bottom: none; }
	.added-row:hover { background: var(--color-surface); }
	.added-name { font-weight: 600; }
	.added-detail { color: var(--color-text-muted); font-size: 0.75rem; flex: 1; }
	.added-gen { color: var(--color-text-muted); font-size: 0.75rem; }

	/* Removed */
	.removed-list {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}
	.removed-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 12px;
		font-size: 0.8rem;
		border-bottom: 1px solid var(--color-border);
		cursor: pointer;
	}
	.removed-row:last-child { border-bottom: none; }
	.removed-row:hover { background: var(--color-surface); }
	.removed-label { font-size: 0.7rem; color: var(--color-danger); font-weight: 600; }
	.removed-name { font-weight: 600; flex: 1; }
	.removed-gen { color: var(--color-text-muted); font-size: 0.75rem; }
	.removed-lineage { color: var(--color-text-muted); font-size: 0.7rem; text-transform: capitalize; }

	/* Apply */
	.apply-actions {
		display: flex;
		gap: 8px;
		margin-top: 20px;
	}

	.applying {
		text-align: center;
		padding: 48px;
	}
	.spinner {
		width: 32px;
		height: 32px;
		border: 3px solid var(--color-border);
		border-top-color: var(--color-primary);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
		margin: 0 auto 16px;
	}
	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	@media (max-width: 1024px) {
		.import-options { flex-direction: column; gap: 12px; }
		.diff-header, .diff-row {
			grid-template-columns: 80px 1fr 1fr 100px;
			font-size: 0.7rem;
		}
	}
</style>
