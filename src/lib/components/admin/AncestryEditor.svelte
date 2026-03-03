<script>
	/**
	 * Admin GEDCOM import and ancestry management.
	 * Props: collectionSlug, ancestry
	 */
	import { apiUpload, apiPut, apiDelete } from '$lib/api.js';
	import Modal from '$lib/components/common/Modal.svelte';

	let { collectionSlug, ancestry = null } = $props();

	let localAncestry = $state(null);
	let loaded = $state(false);

	// Sync from prop on initial load (or after re-mount on navigation)
	$effect(() => {
		if (!loaded && ancestry !== null) {
			localAncestry = ancestry;
			loaded = true;
		}
		return () => { loaded = false; };
	});

	// --- Import mode state ---
	let rootPersonId = $state('I1');
	let maxGenerations = $state(8);
	let importing = $state(false);
	let importError = $state('');
	let geocodeReport = $state(null);
	let selectedFile = $state(null);

	// --- Merge mode state ---
	let mergeMode = $state(false);
	let mergeFile = $state(null);
	let mergeRootId = $state('I1');
	let mergeMaxGen = $state(8);
	let merging = $state(false);
	let mergeError = $state('');
	let mergeReport = $state(null);

	// --- Management mode state ---
	let saving = $state(false);
	let saved = $state(false);
	let saveError = $state('');
	let showClearConfirm = $state(false);
	let showReimportConfirm = $state(false);
	let showMergeConfirm = $state(false);

	function handleFileInput(e) {
		const file = e.target.files?.[0];
		if (file) selectedFile = file;
	}

	function handleDrop(e) {
		e.preventDefault();
		const file = e.dataTransfer.files?.[0];
		if (file && file.name.toLowerCase().endsWith('.ged')) {
			selectedFile = file;
		}
	}

	async function doImport() {
		if (!selectedFile || importing) return;
		importing = true;
		importError = '';
		geocodeReport = null;

		const formData = new FormData();
		formData.append('file', selectedFile);
		formData.append('collection', collectionSlug);
		formData.append('rootPersonId', rootPersonId);
		formData.append('maxGenerations', String(maxGenerations));

		const result = await apiUpload('/api/ancestry', formData);

		importing = false;

		if (result.ok) {
			localAncestry = result.data.ancestry;
			geocodeReport = result.data.geocodeReport;
			loaded = true;
		} else {
			importError = result.error;
			loaded = false;
		}
	}

	async function saveChanges() {
		if (saving || !localAncestry) return;
		saving = true;
		saveError = '';

		const result = await apiPut('/api/ancestry', {
			collection: collectionSlug,
			ancestry: localAncestry
		});

		saving = false;
		if (result.ok) {
			localAncestry = result.data.ancestry;
			saved = true;
			setTimeout(() => saved = false, 2000);
		} else {
			saveError = result.error;
		}
	}

	async function confirmClear() {
		const result = await apiDelete('/api/ancestry', { collection: collectionSlug });
		showClearConfirm = false;
		if (result.ok) {
			localAncestry = null;
			geocodeReport = null;
			selectedFile = null;
		} else {
			saveError = result.error;
		}
	}

	function handleMergeFileInput(e) {
		const file = e.target.files?.[0];
		if (file) mergeFile = file;
	}

	function handleMergeDrop(e) {
		e.preventDefault();
		const file = e.dataTransfer.files?.[0];
		if (file && file.name.toLowerCase().endsWith('.ged')) {
			mergeFile = file;
		}
	}

	async function doMerge() {
		if (!mergeFile || merging) return;
		merging = true;
		mergeError = '';
		mergeReport = null;

		const formData = new FormData();
		formData.append('file', mergeFile);
		formData.append('collection', collectionSlug);
		formData.append('rootPersonId', mergeRootId);
		formData.append('maxGenerations', String(mergeMaxGen));
		formData.append('merge', 'true');
		formData.append('lineagePrefix', 'wife');

		const result = await apiUpload('/api/ancestry', formData);

		merging = false;

		if (result.ok) {
			localAncestry = result.data.ancestry;
			geocodeReport = result.data.geocodeReport;
			mergeReport = result.data.geocodeReport?.mergeReport || null;
			mergeMode = false;
			mergeFile = null;
			loaded = true;
		} else {
			mergeError = result.error;
		}
	}

	function updatePlaceCoords(placeId, lat, lng) {
		if (!localAncestry) return;
		const numLat = lat === '' || lat == null ? null : Number(lat);
		const numLng = lng === '' || lng == null ? null : Number(lng);
		const bothValid = numLat != null && numLng != null && !isNaN(numLat) && !isNaN(numLng);
		localAncestry = {
			...localAncestry,
			places: localAncestry.places.map((p) =>
				p.id === placeId
					? { ...p, lat: numLat, lng: numLng, geocodeStatus: bothValid ? 'manual' : 'failed' }
					: p
			)
		};
	}

	let failedCount = $derived(localAncestry?.places?.filter((p) => p.geocodeStatus === 'failed').length ?? 0);
</script>

<div class="ancestry-editor">
	{#if !localAncestry}
		<!-- Import mode -->
		<section class="import-section">
			<h2 class="subsection-title">Import GEDCOM</h2>
			<p class="help-text">
				Export a GEDCOM file from <a href="https://www.familysearch.org/innovate/export" target="_blank" rel="noopener">FamilySearch</a>,
				then upload it here. Place names will be automatically geocoded.
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
					<input
						type="file"
						accept=".ged"
						onchange={handleFileInput}
						style="display: none;"
					/>
				</label>
			</div>

			<div class="import-options">
				<label class="field">
					<span>Root Person ID</span>
					<input type="text" bind:value={rootPersonId} placeholder="I1" />
					<span class="field-hint">
						The GEDCOM individual ID for yourself or the starting ancestor (e.g., I1).
						Open the .ged file in a text editor to find it.
					</span>
				</label>

				<label class="field">
					<span>Max Generations</span>
					<div class="slider-row">
						<input type="range" min="1" max="8" bind:value={maxGenerations} />
						<span class="slider-value">{maxGenerations}</span>
					</div>
				</label>
			</div>

			{#if importError}
				<div class="field-error">{importError}</div>
			{/if}

			<button
				class="btn btn-primary"
				onclick={doImport}
				disabled={!selectedFile || importing}
			>
				{importing ? 'Importing — this may take a minute...' : 'Import GEDCOM'}
			</button>

			{#if geocodeReport}
				<div class="geocode-report">
					<h3>Geocode Report</h3>
					<div class="report-stats">
						<span class="stat ok">{geocodeReport.ok} geocoded</span>
						{#if geocodeReport.approximate > 0}
							<span class="stat approx">{geocodeReport.approximate} approximate</span>
						{/if}
						{#if geocodeReport.failed > 0}
							<span class="stat failed">{geocodeReport.failed} failed</span>
						{/if}
					</div>
					{#if geocodeReport.failedPlaces?.length > 0}
						<div class="failed-list">
							<p>Failed places (fix in management view below):</p>
							<ul>
								{#each geocodeReport.failedPlaces as place}
									<li>{place}</li>
								{/each}
							</ul>
						</div>
					{/if}
				</div>
			{/if}
		</section>
	{:else}
		<!-- Management mode -->
		<section class="manage-section">
			<div class="stats-bar">
				<span><strong>{localAncestry.persons.length}</strong> persons</span>
				<span><strong>{localAncestry.places.length}</strong> places</span>
				<span><strong>{localAncestry.meta.generationCount}</strong> generations</span>
				<span class="stats-date">Imported {new Date(localAncestry.meta.importedAt).toLocaleDateString()}</span>
				{#if failedCount > 0}
					<span class="stat failed">{failedCount} failed geocode{failedCount !== 1 ? 's' : ''}</span>
				{/if}
			</div>

			{#if saveError}
				<div class="field-error">{saveError}</div>
			{/if}

			{#if geocodeReport}
				<div class="geocode-report">
					<h3>Geocode Report</h3>
					<div class="report-stats">
						<span class="stat ok">{geocodeReport.ok} geocoded</span>
						{#if geocodeReport.approximate > 0}
							<span class="stat approx">{geocodeReport.approximate} approximate</span>
						{/if}
						{#if geocodeReport.failed > 0}
							<span class="stat failed">{geocodeReport.failed} failed</span>
						{/if}
					</div>
					{#if geocodeReport.failedPlaces?.length > 0}
						<div class="failed-list">
							<p>Failed places — fix coordinates below:</p>
							<ul>
								{#each geocodeReport.failedPlaces as place}
									<li>{place}</li>
								{/each}
							</ul>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Places table -->
			<h3 class="subsection-title">Places ({localAncestry.places.length})</h3>
			<div class="places-table">
				<div class="table-header">
					<span>Place</span>
					<span>Country</span>
					<span>Lat</span>
					<span>Lng</span>
					<span>Status</span>
					<span>Events</span>
				</div>
				{#each localAncestry.places as place (place.id)}
					<div class="table-row" class:failed={place.geocodeStatus === 'failed'}>
						<span class="place-name" title={place.name}>{place.name}</span>
						<span>{place.country || '—'}</span>
						<input
							type="number"
							step="any"
							value={place.lat}
							class="coord-input"
							class:failed-input={place.geocodeStatus === 'failed'}
							onchange={(e) => updatePlaceCoords(place.id, e.target.value, place.lng)}
						/>
						<input
							type="number"
							step="any"
							value={place.lng}
							class="coord-input"
							class:failed-input={place.geocodeStatus === 'failed'}
							onchange={(e) => updatePlaceCoords(place.id, place.lat, e.target.value)}
						/>
						<span class="status-badge" class:ok={place.geocodeStatus === 'ok'} class:approx={place.geocodeStatus === 'approximate'} class:fail={place.geocodeStatus === 'failed'} class:manual={place.geocodeStatus === 'manual'}>
							{place.geocodeStatus}
						</span>
						<span>{place.events.length}</span>
					</div>
				{/each}
			</div>

			<!-- Persons list -->
			<h3 class="subsection-title" style="margin-top: 24px;">Persons ({localAncestry.persons.length})</h3>
			<div class="persons-list">
				{#each localAncestry.persons as person (person.id)}
					<div class="person-row">
						<span class="person-name">{person.name}</span>
						<span class="person-dates">
							{person.birthYear ?? '?'}–{person.deathYear ?? '?'}
						</span>
						<span class="person-gen">Gen {person.generation}</span>
						<span class="person-lineage">{person.lineage}</span>
						{#if person.fsId}
							<a href="https://www.familysearch.org/tree/person/details/{person.fsId}" target="_blank" rel="noopener" class="fs-link">FS</a>
						{/if}
					</div>
				{/each}
			</div>

			{#if mergeReport}
				<div class="geocode-report" style="margin-top: 16px;">
					<h3>Merge Report</h3>
					<div class="report-stats">
						<span class="stat ok">{mergeReport.addedPersons} persons added</span>
						{#if mergeReport.skippedDuplicates > 0}
							<span class="stat approx">{mergeReport.skippedDuplicates} duplicates skipped</span>
						{/if}
						<span class="stat">{mergeReport.newPlacesGeocoded} new places geocoded</span>
					</div>
					{#if mergeReport.personsWithoutFsId > 0}
						<p class="help-text" style="margin-top: 8px; margin-bottom: 0;">
							{mergeReport.personsWithoutFsId} of {mergeReport.addedPersons} added persons have no FamilySearch ID — duplicates may exist if the same ancestor appears in both trees.
						</p>
					{/if}
				</div>
			{/if}

			<!-- Merge import panel -->
			{#if mergeMode}
				<section class="merge-section">
					<h3 class="subsection-title">Merge GEDCOM</h3>
					<p class="help-text">
						Import a second GEDCOM file (e.g. spouse's family tree). Persons already in the dataset
						(matched by FamilySearch ID) will be skipped.
					</p>

					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="drop-zone"
						class:has-file={mergeFile}
						ondragover={(e) => e.preventDefault()}
						ondrop={handleMergeDrop}
					>
						{#if mergeFile}
							<p class="file-name">{mergeFile.name}</p>
							<span class="file-size">{(mergeFile.size / 1024).toFixed(1)} KB</span>
						{:else}
							<p>Drag & drop a .ged file here</p>
							<span>or</span>
						{/if}
						<label class="btn btn-outline btn-sm">
							{mergeFile ? 'Change File' : 'Browse Files'}
							<input
								type="file"
								accept=".ged"
								onchange={handleMergeFileInput}
								style="display: none;"
							/>
						</label>
					</div>

					<div class="import-options">
						<label class="field">
							<span>Root Person ID</span>
							<input type="text" bind:value={mergeRootId} placeholder="I1" />
							<span class="field-hint">
								The GEDCOM individual ID for the second person (e.g., I1 in their file).
							</span>
						</label>
						<label class="field">
							<span>Label</span>
							<input type="text" value="wife" disabled />
							<span class="field-hint">
								Lineage label for merged persons. Only "wife" is currently supported.
							</span>
						</label>
						<label class="field">
							<span>Max Generations</span>
							<div class="slider-row">
								<input type="range" min="1" max="8" bind:value={mergeMaxGen} />
								<span class="slider-value">{mergeMaxGen}</span>
							</div>
						</label>
					</div>

					{#if mergeError}
						<div class="field-error">{mergeError}</div>
					{/if}

					<div class="merge-actions">
						<button
							class="btn btn-primary btn-sm"
							onclick={() => showMergeConfirm = true}
							disabled={!mergeFile || merging}
						>
							{merging ? 'Merging — this may take a minute...' : 'Merge GEDCOM'}
						</button>
						<button class="btn btn-outline btn-sm" onclick={() => { mergeMode = false; mergeFile = null; mergeError = ''; }}>
							Cancel
						</button>
					</div>
				</section>
			{/if}

			<!-- Actions -->
			<div class="manage-actions">
				<button
					class="btn btn-sm"
					class:btn-primary={!saved}
					class:btn-saved={saved}
					onclick={saveChanges}
					disabled={saving}
				>
					{saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
				</button>
				{#if !mergeMode}
					<button class="btn btn-outline btn-sm" onclick={() => mergeMode = true}>
						Merge Import
					</button>
				{/if}
				<button class="btn btn-outline btn-sm" onclick={() => showReimportConfirm = true}>
					Re-import
				</button>
				<button class="btn btn-danger btn-sm" onclick={() => showClearConfirm = true}>
					Clear All
				</button>
			</div>
		</section>
	{/if}
</div>

<Modal title="Re-import GEDCOM" show={showReimportConfirm} onclose={() => showReimportConfirm = false}>
	<p>Unsaved edits will be lost. Continue to re-import?</p>
	{#snippet actions()}
		<button class="btn btn-outline btn-sm" onclick={() => showReimportConfirm = false}>Cancel</button>
		<button class="btn btn-primary btn-sm" onclick={() => { showReimportConfirm = false; localAncestry = null; selectedFile = null; geocodeReport = null; importError = ''; mergeMode = false; mergeFile = null; mergeError = ''; mergeReport = null; }}>Re-import</button>
	{/snippet}
</Modal>

<Modal title="Merge GEDCOM" show={showMergeConfirm} onclose={() => showMergeConfirm = false}>
	<p>Merging will read ancestry data from disk. Any unsaved edits (e.g. coordinate fixes) will be lost. Save first if needed.</p>
	{#snippet actions()}
		<button class="btn btn-outline btn-sm" onclick={() => showMergeConfirm = false}>Cancel</button>
		<button class="btn btn-primary btn-sm" onclick={() => { showMergeConfirm = false; doMerge(); }}>Continue Merge</button>
	{/snippet}
</Modal>

<Modal title="Clear Ancestry Data" show={showClearConfirm} onclose={() => showClearConfirm = false}>
	<p>Are you sure you want to remove all ancestry data for this collection? This cannot be undone.</p>
	{#snippet actions()}
		<button class="btn btn-outline btn-sm" onclick={() => showClearConfirm = false}>Cancel</button>
		<button class="btn btn-danger btn-sm" onclick={confirmClear}>Clear</button>
	{/snippet}
</Modal>

<style>
	.help-text {
		color: var(--color-text-muted);
		font-size: 0.85rem;
		margin-bottom: 16px;
	}
	.help-text a {
		color: var(--color-primary);
	}
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
	.field span {
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
		line-height: 1.3;
	}
	.slider-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.slider-row input[type="range"] {
		flex: 1;
	}
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
	.geocode-report {
		margin-top: 20px;
		padding: 16px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}
	.geocode-report h3 {
		font-size: 0.85rem;
		font-weight: 700;
		margin-bottom: 8px;
	}
	.report-stats {
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
	}
	.stat {
		font-size: 0.8rem;
		font-weight: 600;
		padding: 2px 8px;
		border-radius: 4px;
	}
	.stat.ok { background: #e8f5e9; color: #2e7d32; }
	.stat.approx { background: #fff3e0; color: #e65100; }
	.stat.failed { background: #fce4ec; color: #c62828; }
	.failed-list {
		margin-top: 12px;
		font-size: 0.8rem;
		color: var(--color-text-muted);
	}
	.failed-list ul {
		margin: 4px 0 0 16px;
	}
	.failed-list li {
		margin-bottom: 2px;
	}

	/* Management mode */
	.stats-bar {
		display: flex;
		gap: 16px;
		flex-wrap: wrap;
		padding: 12px 16px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		font-size: 0.85rem;
		margin-bottom: 20px;
	}
	.stats-date {
		color: var(--color-text-muted);
		margin-left: auto;
	}
	.subsection-title {
		font-size: 0.95rem;
		font-weight: 700;
		margin-bottom: 12px;
	}
	.places-table {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		overflow: hidden;
		font-size: 0.8rem;
	}
	.table-header {
		display: grid;
		grid-template-columns: 2fr 1fr 80px 80px 80px 60px;
		gap: 8px;
		padding: 8px 12px;
		background: var(--color-bg);
		font-weight: 600;
		color: var(--color-text-muted);
		font-size: 0.75rem;
		text-transform: uppercase;
	}
	.table-row {
		display: grid;
		grid-template-columns: 2fr 1fr 80px 80px 80px 60px;
		gap: 8px;
		padding: 6px 12px;
		border-top: 1px solid var(--color-border);
		align-items: center;
	}
	.table-row.failed {
		background: #fdf0f0;
	}
	.place-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.coord-input {
		width: 100%;
		padding: 2px 4px;
		border: 1px solid var(--color-border);
		border-radius: 3px;
		font-size: 0.75rem;
		font-family: monospace;
	}
	.coord-input.failed-input {
		border-color: var(--color-danger);
	}
	.status-badge {
		font-size: 0.7rem;
		font-weight: 600;
		padding: 1px 6px;
		border-radius: 3px;
		text-align: center;
	}
	.status-badge.ok { background: #e8f5e9; color: #2e7d32; }
	.status-badge.approx { background: #fff3e0; color: #e65100; }
	.status-badge.fail { background: #fce4ec; color: #c62828; }
	.status-badge.manual { background: #e3f2fd; color: #1565c0; }
	.persons-list {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		max-height: 400px;
		overflow-y: auto;
	}
	.person-row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 6px 12px;
		font-size: 0.8rem;
		border-bottom: 1px solid var(--color-border);
	}
	.person-row:last-child {
		border-bottom: none;
	}
	.person-name {
		font-weight: 600;
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.person-dates {
		color: var(--color-text-muted);
		font-family: monospace;
		font-size: 0.75rem;
	}
	.person-gen {
		color: var(--color-text-muted);
		font-size: 0.75rem;
	}
	.person-lineage {
		color: var(--color-text-muted);
		font-size: 0.7rem;
		text-transform: capitalize;
	}
	.fs-link {
		font-size: 0.7rem;
		font-weight: 700;
		color: var(--color-primary);
		text-decoration: none;
		padding: 1px 4px;
		border: 1px solid var(--color-primary);
		border-radius: 3px;
	}
	.manage-actions {
		display: flex;
		gap: 8px;
		margin-top: 20px;
	}
	.btn-saved {
		background: var(--color-primary);
		color: #fff;
		opacity: 0.7;
		cursor: default;
	}

	/* Merge section */
	.merge-section {
		margin-top: 20px;
		padding: 16px;
		background: var(--color-surface);
		border: 1px solid var(--color-primary);
		border-radius: var(--radius-md);
	}
	.merge-actions {
		display: flex;
		gap: 8px;
		margin-top: 12px;
	}

	@media (max-width: 1024px) {
		.import-options {
			flex-direction: column;
			gap: 12px;
		}
		.table-header, .table-row {
			grid-template-columns: 1.5fr 1fr 60px 60px 60px 40px;
			font-size: 0.7rem;
		}
	}
</style>
