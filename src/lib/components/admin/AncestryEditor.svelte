<script>
	/**
	 * Admin GEDCOM import and ancestry management.
	 * Props: collectionSlug, ancestry
	 */
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { apiGet, apiUpload, apiPut, apiPatch, apiDelete } from '$lib/api.js';
	import { parseGedcomPersonList } from '$lib/gedcom-utils.js';
	import Modal from '$lib/components/common/Modal.svelte';

	let { collectionSlug, ancestry = null } = $props();

	let localAncestry = $state(null);
	let loaded = $state(false);

	let primaryFirst = $derived(localAncestry?.meta?.rootPersonNames?.[0]?.split(' ')[0] || '');
	let wifeFirst = $derived(localAncestry?.meta?.rootPersonNames?.[1]?.split(' ')[0] || '');

	function displayLineage(lineage) {
		if (!lineage) return '';
		const isWife = lineage.startsWith('wife-');
		const base = isWife ? lineage.slice(5) : lineage;
		const owner = isWife ? wifeFirst : primaryFirst;
		const label = base.charAt(0).toUpperCase() + base.slice(1);
		return owner ? `${owner}'s ${label}` : label;
	}

	function readFileAsText(file) {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result);
			reader.onerror = () => reject(reader.error);
			reader.readAsText(file);
		});
	}

	// Sync from prop on initial load (or after re-mount on navigation).
	// Uses untrack(loaded) so the effect only subscribes to `ancestry`, not `loaded`.
	// No cleanup needed — component remount creates a fresh loaded=false.
	$effect(() => {
		if (ancestry !== null && !untrack(() => loaded)) {
			localAncestry = ancestry;
			loaded = true;
		}
	});

	// --- Import mode state ---
	let rootPersonId = $state('');
	let maxGenerations = $state(8);
	let importing = $state(false);
	let importError = $state('');
	let geocodeReport = $state(null);
	let selectedFile = $state(null);
	let personList = $state([]);
	let personSearch = $state('');
	let showPersonDropdown = $state(false);
	let scanningFile = $state(false);

	async function scanImportFile(file) {
		if (!file) {
			personList = [];
			personSearch = '';
			rootPersonId = '';
			scanningFile = false;
			return;
		}
		scanningFile = true;
		try {
			const text = await readFileAsText(file);
			personList = parseGedcomPersonList(text);
		} catch {
			personList = [];
			importError = 'Could not read the GEDCOM file';
		}
		scanningFile = false;
	}

	// --- Merge mode state ---
	let mergeMode = $state(false);
	let mergeFile = $state(null);
	let mergeRootId = $state('');
	let mergePersonList = $state([]);
	let mergePersonSearch = $state('');
	let showMergePersonDropdown = $state(false);
	let scanningMergeFile = $state(false);

	async function scanMergeFile(file) {
		if (!file) {
			mergePersonList = [];
			mergePersonSearch = '';
			mergeRootId = '';
			scanningMergeFile = false;
			return;
		}
		scanningMergeFile = true;
		try {
			const text = await readFileAsText(file);
			mergePersonList = parseGedcomPersonList(text);
		} catch {
			mergePersonList = [];
			mergeError = 'Could not read the GEDCOM file';
		}
		scanningMergeFile = false;
	}
	let mergeMaxGen = $state(8);
	let merging = $state(false);
	let mergeError = $state('');
	let mergeReport = $state(null);

	// Filtered person lists for dropdowns
	let filteredPersons = $derived.by(() => {
		if (!personSearch) return personList.slice(0, 50);
		const q = personSearch.toLowerCase();
		return personList.filter((p) =>
			p.name.toLowerCase().includes(q) ||
			p.id.toLowerCase().includes(q) ||
			(p.birthPlace && p.birthPlace.toLowerCase().includes(q))
		).slice(0, 50);
	});

	let filteredMergePersons = $derived.by(() => {
		if (!mergePersonSearch) return mergePersonList.slice(0, 50);
		const q = mergePersonSearch.toLowerCase();
		return mergePersonList.filter((p) =>
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

	function selectMergePerson(person) {
		mergeRootId = person.id;
		mergePersonSearch = formatPersonLabel(person);
		showMergePersonDropdown = false;
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

	// --- Management mode state ---
	let saving = $state(false);
	let saved = $state(false);
	let saveError = $state('');
	let showClearConfirm = $state(false);
	let showMergeConfirm = $state(false);
	let showReimportConfirm = $state(false);

	function handleFileInput(e) {
		const file = e.target.files?.[0];
		if (file) {
			selectedFile = file;
			scanImportFile(file);
		}
		e.target.value = '';
	}

	function handleDrop(e) {
		e.preventDefault();
		const file = e.dataTransfer.files?.[0];
		if (file && file.name.toLowerCase().endsWith('.ged')) {
			selectedFile = file;
			scanImportFile(file);
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
		if (file) {
			mergeFile = file;
			scanMergeFile(file);
		}
		e.target.value = '';
	}

	function handleMergeDrop(e) {
		e.preventDefault();
		const file = e.dataTransfer.files?.[0];
		if (file && file.name.toLowerCase().endsWith('.ged')) {
			mergeFile = file;
			scanMergeFile(file);
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

	function clearPlaceCoords(placeId) {
		updatePlaceCoords(placeId, null, null);
	}

	let failedCount = $derived(localAncestry?.places?.filter((p) => p.geocodeStatus === 'failed').length ?? 0);

	// --- Place search ---
	let placeSearch = $state('');
	let displayedPlaces = $derived.by(() => {
		const list = localAncestry?.places ?? [];
		if (!placeSearch.trim()) return list;
		const q = placeSearch.trim().toLowerCase();
		return list.filter((p) => p.name.toLowerCase().includes(q));
	});

	// --- Place geocode lookup state ---
	let lookupPlaceId = $state(null);
	let lookupQuery = $state('');
	let lookupLoading = $state(false);
	let lookupError = $state('');

	// --- Person edit state ---
	const EDITABLE_FIELDS = ['name', 'birthDate', 'birthPlace', 'deathDate', 'deathPlace', 'gender'];
	let editingPersonId = $state(null);
	let editFields = $state({});
	let editReason = $state('');
	let editSaving = $state(false);
	let editError = $state('');

	function startEditPerson(person) {
		editingPersonId = person.id;
		editFields = {};
		for (const f of EDITABLE_FIELDS) {
			editFields[f] = person[f] ?? '';
		}
		editReason = '';
		editError = '';
	}

	function cancelEditPerson() {
		editingPersonId = null;
		editFields = {};
		editReason = '';
		editError = '';
	}

	async function savePersonEdit(person) {
		editSaving = true;
		editError = '';
		// Find fields that changed
		const changed = EDITABLE_FIELDS.filter((f) => {
			const oldVal = person[f] ?? '';
			const newVal = editFields[f] ?? '';
			return oldVal !== newVal;
		});

		if (changed.length === 0) {
			cancelEditPerson();
			editSaving = false;
			return;
		}

		// Send all field changes in a single atomic request
		// Use ?? null (not || null) so empty strings are sent as empty, not as revert
		const fields = changed.map((field) => ({
			field,
			value: editFields[field] ?? null
		}));

		const result = await apiPatch('/api/ancestry', {
			collection: collectionSlug,
			personId: person.id,
			fields,
			reason: editReason || undefined
		});

		if (!result.ok) {
			editError = result.error;
			editSaving = false;
			return;
		}

		// Update local person data
		const idx = localAncestry.persons.findIndex((p) => p.id === person.id);
		if (idx >= 0) {
			localAncestry.persons[idx] = { ...localAncestry.persons[idx], ...result.data.person };
		}

		// Reload full ancestry to get updated places
		const freshGet = await apiGet(`/api/ancestry?collection=${collectionSlug}`);
		if (freshGet.ok && freshGet.data.ancestry) {
			localAncestry = freshGet.data.ancestry;
		}

		editSaving = false;
		cancelEditPerson();
	}

	async function revertOverride(person, field) {
		const result = await apiPatch('/api/ancestry', {
			collection: collectionSlug,
			personId: person.id,
			field,
			value: null
		});
		if (!result.ok) {
			editError = result.error || 'Failed to revert override';
			return;
		}
		// Re-fetch full ancestry to get updated places (revert may change birthPlace/deathPlace)
		const freshGet = await apiGet(`/api/ancestry?collection=${collectionSlug}`);
		if (freshGet.ok && freshGet.data.ancestry) {
			localAncestry = freshGet.data.ancestry;
		} else {
			// Fallback: at least update the person locally
			const idx = localAncestry.persons.findIndex((p) => p.id === person.id);
			if (idx >= 0) {
				localAncestry.persons[idx] = { ...localAncestry.persons[idx], ...result.data.person };
			}
		}
	}

	function updatePlaceFull(placeId, lat, lng, country, status) {
		localAncestry = {
			...localAncestry,
			places: localAncestry.places.map((p) =>
				p.id === placeId ? { ...p, lat, lng, country, geocodeStatus: status } : p
			)
		};
	}

	function startLookup(place) {
		lookupPlaceId = place.id;
		lookupQuery = place.name;
		lookupError = '';
	}

	function cancelLookup() {
		lookupPlaceId = null;
		lookupQuery = '';
		lookupError = '';
		lookupLoading = false;
	}

	async function lookupPlace(placeId, query) {
		lookupLoading = true;
		lookupError = '';
		try {
			const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
				q: query,
				format: 'json',
				limit: '1',
				addressdetails: '1'
			})}`;
			const res = await fetch(url, {
				headers: { 'User-Agent': 'GaylonPhotos/1.0' }
			});
			const data = await res.json();
			if (!data.length) {
				lookupError = 'No results';
				lookupLoading = false;
				return;
			}
			const top = data[0];
			const lat = parseFloat(top.lat);
			const lng = parseFloat(top.lon);
			const country = top.address?.country || '';
			const rank = top.place_rank ?? 0;
			const status = (rank < 10 || rank > 22) ? 'approximate' : 'ok';
			updatePlaceFull(placeId, lat, lng, country, status);
			lookupPlaceId = null;
			lookupQuery = '';
		} catch {
			lookupError = 'Lookup failed';
		}
		lookupLoading = false;
	}
</script>

<div class="ancestry-editor">
	{#if !localAncestry}
		<!-- Import mode -->
		<section class="import-section">
			<h2 class="subsection-title">Import GEDCOM</h2>
			<p class="help-text">
				Export a GEDCOM file from <a href="https://www.familysearch.org/innovate/export" target="_blank" rel="noopener">FamilySearch</a>
				or MacFamilyTree, then upload it here. Place names will be automatically geocoded.
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
										<button
											type="button"
											class="person-option"
											onmousedown={() => selectPerson(person)}
										>
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
									{#if personList.length > 50 && !personSearch}
										<div class="dropdown-hint">{personList.length} persons — type to filter</div>
									{/if}
								</div>
							{/if}
						</div>
						<span class="field-hint">
							Search for the starting person. {personList.length} individuals found.
						</span>
					{:else}
						<input type="text" bind:value={rootPersonId} placeholder="@I1@" />
						<span class="field-hint">
							Select a GEDCOM file first, or enter the individual ID manually.
						</span>
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

			{#if importError}
				<div class="field-error">{importError}</div>
			{/if}

			<button
				class="btn btn-primary"
				onclick={doImport}
				disabled={!selectedFile || !rootPersonId || importing}
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
					<a href="/admin/{collectionSlug}/ancestry/geotag" class="btn btn-outline btn-sm">Geo-Tag Places</a>
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
			<div class="places-header">
				<h3 class="subsection-title">Places ({localAncestry.places.length})</h3>
				<input
					class="place-search"
					type="search"
					placeholder="Search places by name..."
					bind:value={placeSearch}
				/>
			</div>
			<div class="places-table">
				<div class="table-header">
					<span>Place</span>
					<span>Country</span>
					<span>Lat</span>
					<span>Lng</span>
					<span>Status</span>
					<span>Events</span>
					<span></span>
					<span></span>
				</div>
				{#if displayedPlaces.length === 0 && placeSearch.trim()}
					<div class="no-results">No places match "{placeSearch.trim()}"</div>
				{/if}
				{#each displayedPlaces as place (place.id)}
					<div class="table-row" class:failed={place.geocodeStatus === 'failed'} class:lookup-active={lookupPlaceId === place.id}>
						<span class="place-name" title={place.name}>{place.name}</span>
						<span>{place.country || '—'}</span>
						{#if lookupPlaceId === place.id}
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div class="lookup-inline" onkeydown={(e) => { if (e.key === 'Escape') cancelLookup(); }}>
								<input
									type="text"
									class="lookup-input"
									bind:value={lookupQuery}
									placeholder="Search place name..."
									onkeydown={(e) => { if (e.key === 'Enter') lookupPlace(place.id, lookupQuery); }}
								/>
								<button
									class="btn btn-primary btn-xs lookup-go"
									onclick={() => lookupPlace(place.id, lookupQuery)}
									disabled={lookupLoading || !lookupQuery.trim()}
								>
									{lookupLoading ? '...' : 'Go'}
								</button>
								<button class="btn btn-outline btn-xs" onclick={cancelLookup}>✕</button>
								{#if lookupError}
									<span class="lookup-hint">{lookupError}</span>
								{/if}
							</div>
						{:else}
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
						{/if}
						<span>{place.events.length}</span>
						<button class="lookup-btn" title="Look up coordinates" onclick={() => startLookup(place)} disabled={lookupPlaceId === place.id}>&#x1F50D;</button>
						{#if place.geocodeStatus !== 'failed' && lookupPlaceId !== place.id}
							<button class="clear-btn" title="Clear coordinates" onclick={() => clearPlaceCoords(place.id)}>&#10005;</button>
						{:else}
							<span></span>
						{/if}
					</div>
				{/each}
			</div>

			<!-- Persons list -->
			<h3 class="subsection-title" style="margin-top: 24px;">Persons ({localAncestry.persons.length})</h3>
			<div class="persons-list">
				{#each localAncestry.persons as person (person.id)}
					<div class="person-row">
						<span class="person-name">
							{person.name}
							{#if person.appOverrides}
								{#each Object.keys(person.appOverrides) as overField}
									<span class="override-badge" title="{overField}: {person.appOverrides[overField].reason || 'manually edited'}">&#9998;</span>
								{/each}
							{/if}
						</span>
						<span class="person-dates">
							{person.birthYear ?? '?'}–{person.deathYear ?? '?'}
						</span>
						<span class="person-gen">Gen {person.generation}</span>
						<span class="person-lineage">{displayLineage(person.lineage)}</span>
						{#if person.fsId}
							<a href="https://www.familysearch.org/tree/person/details/{person.fsId}" target="_blank" rel="noopener" class="fs-link">FS</a>
						{/if}
						<button class="edit-person-btn" title="Edit person fields" onclick={() => startEditPerson(person)} disabled={editingPersonId === person.id}>&#9998;</button>
					</div>
					{#if editingPersonId === person.id}
						<div class="person-edit-panel">
							{#each EDITABLE_FIELDS as field}
								<div class="edit-field-row">
									<!-- svelte-ignore a11y_label_has_associated_control -->
									<label class="edit-field-label">
										{field}
										{#if person.appOverrides?.[field]}
											<span class="override-indicator" title="Override: {person.appOverrides[field].reason || 'manually edited'}">&#128274;</span>
										{/if}
									</label>
									<input
										type="text"
										class="edit-field-input"
										class:has-override={person.appOverrides?.[field]}
										value={editFields[field] ?? ''}
										oninput={(e) => editFields[field] = e.target.value}
									/>
									{#if person.appOverrides?.[field]}
										<button class="btn btn-outline btn-xs" onclick={() => revertOverride(person, field)} title="Revert to original">Revert</button>
									{/if}
								</div>
							{/each}
							<div class="edit-field-row">
								<!-- svelte-ignore a11y_label_has_associated_control -->
								<label class="edit-field-label">Reason</label>
								<input
									type="text"
									class="edit-field-input"
									placeholder="Optional reason for changes..."
									bind:value={editReason}
								/>
							</div>
							{#if editError}
								<div class="field-error">{editError}</div>
							{/if}
							<div class="edit-actions">
								<button class="btn btn-primary btn-sm" onclick={() => savePersonEdit(person)} disabled={editSaving}>
									{editSaving ? 'Saving...' : 'Save'}
								</button>
								<button class="btn btn-outline btn-sm" onclick={cancelEditPerson}>Cancel</button>
							</div>
						</div>
					{/if}
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
						<div class="field">
							<span>Root Person</span>
							{#if scanningMergeFile}
								<div class="scanning-hint">Scanning file...</div>
							{:else if mergePersonList.length > 0}
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<div class="person-picker" onkeydown={(e) => { if (e.key === 'Escape') showMergePersonDropdown = false; }}>
									<input
										type="text"
										bind:value={mergePersonSearch}
										placeholder="Search by name..."
										onfocus={() => showMergePersonDropdown = true}
										oninput={() => { showMergePersonDropdown = true; mergeRootId = ''; }}
										onblur={() => { setTimeout(() => showMergePersonDropdown = false, 200); }}
									/>
									{#if mergeRootId}
										<span class="picked-id">{mergeRootId}</span>
									{/if}
									{#if showMergePersonDropdown}
										<div class="person-dropdown">
											{#each filteredMergePersons as person (person.id)}
												<button
													type="button"
													class="person-option"
													onmousedown={() => selectMergePerson(person)}
												>
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
											{#if filteredMergePersons.length === 0}
												<div class="no-results">No matches</div>
											{/if}
											{#if mergePersonList.length > 50 && !mergePersonSearch}
												<div class="dropdown-hint">{mergePersonList.length} persons — type to filter</div>
											{/if}
										</div>
									{/if}
								</div>
								<span class="field-hint">
									Search for the starting person. {mergePersonList.length} individuals found.
								</span>
							{:else}
								<input type="text" bind:value={mergeRootId} placeholder="@I1@" />
								<span class="field-hint">
									Select a GEDCOM file first, or enter the individual ID manually.
								</span>
							{/if}
						</div>
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
							disabled={!mergeFile || !mergeRootId || merging}
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

<Modal title="Merge GEDCOM" show={showMergeConfirm} onclose={() => showMergeConfirm = false}>
	<p>Merging will read ancestry data from disk. Any unsaved edits (e.g. coordinate fixes) will be lost. Save first if needed.</p>
	{#snippet actions()}
		<button class="btn btn-outline btn-sm" onclick={() => showMergeConfirm = false}>Cancel</button>
		<button class="btn btn-primary btn-sm" onclick={() => { showMergeConfirm = false; doMerge(); }}>Continue Merge</button>
	{/snippet}
</Modal>

<Modal title="Navigate to Re-import" show={showReimportConfirm} onclose={() => showReimportConfirm = false}>
	<p>Navigating to re-import will discard any unsaved edits (e.g. coordinate fixes). Save first if needed.</p>
	{#snippet actions()}
		<button class="btn btn-outline btn-sm" onclick={() => showReimportConfirm = false}>Cancel</button>
		<button class="btn btn-primary btn-sm" onclick={() => { showReimportConfirm = false; goto(`/admin/${collectionSlug}/ancestry/reimport`); }}>Continue</button>
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

	/* Person picker */
	.person-picker {
		position: relative;
	}
	.person-picker input[type="text"] {
		width: 100%;
		padding: 6px 10px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: 0.85rem;
		font-family: inherit;
	}
	.person-picker input:focus {
		outline: none;
		border-color: var(--color-primary);
	}
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
		top: 100%;
		left: 0;
		right: 0;
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
	.person-option:hover {
		background: var(--color-surface, #f8f9fa);
	}
	.option-name {
		font-weight: 600;
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.option-detail {
		color: var(--color-text-muted);
		font-size: 0.75rem;
		white-space: nowrap;
	}
	.option-id {
		color: var(--color-text-muted);
		font-size: 0.65rem;
		font-family: monospace;
		white-space: nowrap;
	}
	.no-results {
		padding: 8px 10px;
		font-size: 0.8rem;
		color: var(--color-text-muted);
		font-style: italic;
	}
	.dropdown-hint {
		padding: 6px 10px;
		font-size: 0.7rem;
		color: var(--color-text-muted);
		border-top: 1px solid var(--color-border);
		text-align: center;
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
	.places-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 12px;
	}
	.places-header .subsection-title {
		margin: 0;
	}
	.place-search {
		padding: 5px 10px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: 0.8rem;
		font-family: inherit;
		width: 240px;
	}
	.place-search:focus {
		outline: none;
		border-color: var(--color-primary);
	}
	.table-header {
		display: grid;
		grid-template-columns: 2fr 1fr 80px 80px 80px 60px 32px 32px;
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
		grid-template-columns: 2fr 1fr 80px 80px 80px 60px 32px 32px;
		gap: 8px;
		padding: 6px 12px;
		border-top: 1px solid var(--color-border);
		align-items: center;
	}
	.table-row.lookup-active {
		grid-template-columns: 2fr 1fr 1fr 60px 32px 32px;
	}
	.table-row.failed {
		background: #fdf0f0;
	}
	.no-results {
		padding: 16px;
		text-align: center;
		color: var(--color-text-muted);
		font-size: 0.85rem;
	}
	.clear-btn {
		background: none;
		border: 1px solid var(--color-border);
		border-radius: 3px;
		cursor: pointer;
		font-size: 0.75rem;
		padding: 2px 4px;
		line-height: 1;
		color: var(--color-danger);
	}
	.clear-btn:hover {
		background: #fdf0f0;
		border-color: var(--color-danger);
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
	/* Lookup button + inline form */
	.lookup-btn {
		background: none;
		border: 1px solid var(--color-border);
		border-radius: 3px;
		cursor: pointer;
		font-size: 0.75rem;
		padding: 2px 4px;
		line-height: 1;
	}
	.lookup-btn:hover:not(:disabled) {
		background: var(--color-surface);
		border-color: var(--color-primary);
	}
	.lookup-btn:disabled {
		opacity: 0.3;
		cursor: default;
	}
	.lookup-inline {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.lookup-input {
		flex: 1;
		padding: 3px 6px;
		border: 1px solid var(--color-primary);
		border-radius: 3px;
		font-size: 0.75rem;
		font-family: inherit;
		min-width: 0;
	}
	.lookup-input:focus {
		outline: none;
		box-shadow: 0 0 0 2px rgba(40, 167, 69, 0.15);
	}
	.lookup-go {
		white-space: nowrap;
	}
	.btn-xs {
		padding: 2px 8px;
		font-size: 0.7rem;
	}
	.lookup-hint {
		font-size: 0.7rem;
		color: var(--color-danger);
		white-space: nowrap;
	}

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
	/* Person edit */
	.edit-person-btn {
		background: none;
		border: 1px solid var(--color-border);
		border-radius: 3px;
		cursor: pointer;
		font-size: 0.75rem;
		padding: 2px 4px;
		line-height: 1;
	}
	.edit-person-btn:hover:not(:disabled) {
		background: var(--color-surface);
		border-color: var(--color-primary);
	}
	.edit-person-btn:disabled {
		opacity: 0.3;
		cursor: default;
	}
	.override-badge {
		font-size: 0.6rem;
		color: #1565c0;
		background: #e3f2fd;
		padding: 0 3px;
		border-radius: 2px;
		margin-left: 2px;
		vertical-align: middle;
	}
	.person-edit-panel {
		padding: 12px 16px;
		background: var(--color-surface);
		border-bottom: 1px solid var(--color-border);
		border-left: 3px solid var(--color-primary);
	}
	.edit-field-row {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 6px;
	}
	.edit-field-label {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-text-muted);
		min-width: 80px;
		text-transform: capitalize;
	}
	.edit-field-input {
		flex: 1;
		padding: 4px 8px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: 0.8rem;
		font-family: inherit;
	}
	.edit-field-input:focus {
		outline: none;
		border-color: var(--color-primary);
	}
	.edit-field-input.has-override {
		background: #e3f2fd;
		border-color: #1565c0;
	}
	.override-indicator {
		font-size: 0.65rem;
		margin-left: 2px;
	}
	.edit-actions {
		display: flex;
		gap: 6px;
		margin-top: 8px;
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
			grid-template-columns: 1.5fr 1fr 60px 60px 60px 40px 28px;
			font-size: 0.7rem;
		}
		.table-row.lookup-active {
			grid-template-columns: 1.5fr 1fr 1fr 40px 28px;
		}
	}
</style>
