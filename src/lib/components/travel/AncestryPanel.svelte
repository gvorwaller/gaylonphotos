<script>
	/**
	 * Public-facing collapsible Family Heritage panel for travel collections.
	 * Shows ancestry data filtered by current map viewport bounds.
	 *
	 * Props:
	 *   ancestry — full ancestry object from data/{slug}/ancestry.json
	 *   collectionSlug — collection slug for links
	 *   mapBounds — { north, south, east, west } from ItineraryMap onboundschange
	 */
	import { slide } from 'svelte/transition';

	let { ancestry = { persons: [], places: [] }, collectionSlug = '', mapBounds = null } = $props();

	let expanded = $state(false);
	let activeTab = $state('place');
	let expandedPersonId = $state(null);
	let ancestorSearch = $state('');

	// ─── Map-viewport filtering ─────────────────────────────
	let visiblePlaces = $derived.by(() => {
		if (!ancestry?.places) return [];
		if (!mapBounds) return ancestry.places;
		return ancestry.places.filter((p) => {
			if (p.lat == null || p.lng == null) return false;
			const inLat = p.lat >= mapBounds.south && p.lat <= mapBounds.north;
			if (!inLat) return false;
			if (mapBounds.west <= mapBounds.east) {
				return p.lng >= mapBounds.west && p.lng <= mapBounds.east;
			}
			return p.lng >= mapBounds.west || p.lng <= mapBounds.east;
		});
	});

	let visiblePersonIds = $derived(
		new Set(visiblePlaces.flatMap((p) => (p.events || []).map((e) => e.personId)))
	);
	let visiblePersons = $derived.by(() => {
		let persons = (ancestry?.persons || []).filter((p) => visiblePersonIds.has(p.id));
		if (ancestorSearch) {
			const q = ancestorSearch.toLowerCase();
			persons = persons.filter((p) =>
				p.name.toLowerCase().includes(q) ||
				(p.birthPlace && p.birthPlace.toLowerCase().includes(q)) ||
				(p.deathPlace && p.deathPlace.toLowerCase().includes(q))
			);
		}
		return persons;
	});

	// ─── Derived data for tabs ──────────────────────────────

	// By Place: sorted by country then name, filtered by search if active
	let visiblePersonIdSet = $derived(new Set(visiblePersons.map((p) => p.id)));
	let placesSorted = $derived.by(() => {
		let places = visiblePlaces;
		if (ancestorSearch) {
			// Only show places that have events for matching persons
			places = places.filter((p) =>
				(p.events || []).some((e) => visiblePersonIdSet.has(e.personId))
			);
		}
		return [...places].sort((a, b) => {
			const ca = (a.country || '').localeCompare(b.country || '');
			return ca !== 0 ? ca : a.name.localeCompare(b.name);
		});
	});

	// By Family Line: group visible persons by lineage
	// "self" and "both" appear in both paternal/maternal columns for the primary root
	let paternalPersons = $derived(
		visiblePersons.filter((p) => p.lineage === 'paternal' || p.lineage === 'self' || p.lineage === 'both').sort((a, b) => a.generation - b.generation)
	);
	let maternalPersons = $derived(
		visiblePersons.filter((p) => p.lineage === 'maternal' || p.lineage === 'self' || p.lineage === 'both').sort((a, b) => a.generation - b.generation)
	);

	// Detect merged ancestry — check for wife-* lineage prefixes
	let hasWifeLines = $derived(
		(ancestry?.persons || []).some((p) => p.lineage?.startsWith('wife-'))
	);

	// Wife's family line persons
	let wifePaternal = $derived(
		visiblePersons.filter((p) => p.lineage === 'wife-paternal' || p.lineage === 'wife-self' || p.lineage === 'wife-both').sort((a, b) => a.generation - b.generation)
	);
	let wifeMaternal = $derived(
		visiblePersons.filter((p) => p.lineage === 'wife-maternal' || p.lineage === 'wife-self' || p.lineage === 'wife-both').sort((a, b) => a.generation - b.generation)
	);

	// By Generation: group visible persons by generation number
	let generationGroups = $derived.by(() => {
		const groups = new Map();
		for (const p of visiblePersons) {
			if (!groups.has(p.generation)) {
				groups.set(p.generation, []);
			}
			groups.get(p.generation).push(p);
		}
		return [...groups.entries()]
			.sort(([a], [b]) => a - b)
			.map(([gen, persons]) => ({ generation: gen, persons, label: generationLabel(gen) }));
	});

	let expandedGenerations = $state(new Set());

	function toggleGeneration(gen) {
		const next = new Set(expandedGenerations);
		if (next.has(gen)) next.delete(gen);
		else next.add(gen);
		expandedGenerations = next;
	}

	// ─── Statistics ─────────────────────────────────────────
	let stats = $derived.by(() => {
		const persons = ancestry?.persons || [];
		if (!persons.length) return null;

		let earliest = null;
		let latest = null;
		const countries = new Set();

		for (const p of persons) {
			if (p.birthYear && (!earliest || p.birthYear < earliest.birthYear)) earliest = p;
			if (p.deathYear && (!latest || p.deathYear > latest.deathYear)) latest = p;
		}
		for (const pl of ancestry?.places || []) {
			if (pl.country) countries.add(pl.country);
		}

		return { earliest, latest, countries: [...countries].sort() };
	});

	// ─── Helpers ────────────────────────────────────────────
	function generationLabel(gen) {
		const labels = [
			'Self', 'Parents', 'Grandparents', 'Great-Grandparents',
			'2nd Great-Grandparents', '3rd Great-Grandparents',
			'4th Great-Grandparents', '5th Great-Grandparents',
			'6th Great-Grandparents'
		];
		return labels[gen] || `Generation ${gen}`;
	}

	function lifespan(person) {
		const parts = [];
		if (person.birthYear) parts.push(`b. ${person.birthYear}`);
		if (person.deathYear) parts.push(`d. ${person.deathYear}`);
		return parts.join(' \u2013 ') || 'dates unknown';
	}

	function placeSummary(person) {
		const parts = [];
		if (person.birthPlace) parts.push(person.birthPlace);
		if (person.deathPlace && person.deathPlace !== person.birthPlace) {
			parts.push(person.deathPlace);
		}
		return parts.join(' \u2192 ') || '';
	}

	// Must stay in sync with --color-line-* CSS variables in global.css
	const VALID_LINEAGES = new Set([
		'paternal', 'maternal', 'self', 'both',
		'wife-paternal', 'wife-maternal', 'wife-self', 'wife-both'
	]);

	function safeLineageColor(lineage) {
		return VALID_LINEAGES.has(lineage) ? `var(--color-line-${lineage}, #6c757d)` : '#6c757d';
	}

	function fsLink(person) {
		if (!person.fsId) return null;
		return `https://www.familysearch.org/tree/person/details/${person.fsId}`;
	}

	function eventIcon(type) {
		const icons = {
			Birth: '\u2605', Christening: '\u2020', Baptism: '\u2020',
			Marriage: '\u2661', Death: '\u271D', Burial: '\u26B0',
			Immigration: '\u2708', Emigration: '\u2708',
			Residence: '\u2302', Census: '\u2316',
			Occupation: '\u2692', 'Military Service': '\u2694',
			Naturalization: '\u2691', Will: '\u270D', Probate: '\u2696',
			Event: '\u2022'
		};
		return icons[type] || '\u2022';
	}

	let personMap = $derived(new Map((ancestry?.persons || []).map((p) => [p.id, p])));

	// Root person first names for column headings (index 0 = primary import, index 1 = merged "wife-*" import)
	let primaryName = $derived(ancestry?.meta?.rootPersonNames?.[0]?.split(' ')[0] || '');
	let mergedName = $derived(ancestry?.meta?.rootPersonNames?.[1]?.split(' ')[0] || '');

	function togglePerson(id) {
		expandedPersonId = expandedPersonId === id ? null : id;
	}

	function getPersonById(id) {
		return personMap.get(id);
	}

	function displayLineagePath(path) {
		if (!path) return '';
		if (path.startsWith("Wife's") && mergedName) {
			return path.replace("Wife's", mergedName + "'s");
		}
		if ((path.startsWith("Father's") || path.startsWith("Mother's")) && primaryName) {
			return primaryName + "'s " + path[0].toLowerCase() + path.slice(1);
		}
		return path;
	}
</script>

<div class="ancestry-panel">
	<button class="ancestry-header" onclick={() => (expanded = !expanded)} aria-expanded={expanded}>
		<span class="ancestry-chevron">{expanded ? '\u25BE' : '\u25B8'}</span>
		<h2 class="section-label" style="margin-bottom: 0;">Family Heritage</h2>
		<span class="ancestry-summary">
			{#if mapBounds}
				{visiblePersons.length} ancestor{visiblePersons.length !== 1 ? 's' : ''} &middot;
				{visiblePlaces.length} place{visiblePlaces.length !== 1 ? 's' : ''} in view
				<span class="ancestry-total">({ancestry?.persons?.length ?? 0} total)</span>
			{:else}
				{ancestry?.persons?.length ?? 0} ancestor{(ancestry?.persons?.length ?? 0) !== 1 ? 's' : ''} &middot;
				{ancestry?.places?.length ?? 0} place{(ancestry?.places?.length ?? 0) !== 1 ? 's' : ''}
			{/if}
		</span>
	</button>

	{#if expanded}
		<div class="ancestry-body" transition:slide={{ duration: 250 }}>
			<!-- Tab bar -->
			<div class="ancestry-tabs">
				<button
					class="ancestry-tab"
					class:active={activeTab === 'place'}
					onclick={() => (activeTab = 'place')}
				>By Place</button>
				<button
					class="ancestry-tab"
					class:active={activeTab === 'line'}
					onclick={() => (activeTab = 'line')}
				>By Family Line</button>
				<button
					class="ancestry-tab"
					class:active={activeTab === 'generation'}
					onclick={() => (activeTab = 'generation')}
				>By Generation</button>
			</div>

			<!-- Search -->
			<div class="ancestry-search-bar">
				<input
					type="text"
					class="ancestry-search-input"
					placeholder="Search ancestors by name or place..."
					bind:value={ancestorSearch}
				/>
				{#if ancestorSearch}
					<button class="ancestry-search-clear" onclick={() => ancestorSearch = ''}>
						&times;
					</button>
				{/if}
			</div>

			<!-- Tab content -->
			<div class="ancestry-content">
				{#if activeTab === 'place'}
					{#if placesSorted.length === 0}
						<p class="ancestry-empty">No ancestors in the current map view — zoom out or pan to see more.</p>
					{:else}
						<div class="place-list">
							{#each placesSorted as place (place.id)}
								<div class="place-card">
									<div class="place-header">
										<h3 class="place-name">{place.name}</h3>
										<span class="place-meta">
											{#if place.country}
												<span class="place-country">{place.country}</span>
											{/if}
											{#if place.nearStop}
												<span class="visited-badge">Visited</span>
											{/if}
										</span>
									</div>
									<ul class="place-events">
										{#each place.events as evt}
											{@const person = getPersonById(evt.personId)}
											<li class="place-event">
												<span class="event-icon">{eventIcon(evt.type)}</span>
												<span class="event-detail">
													<button class="person-link" onclick={() => togglePerson(evt.personId)}>
														{evt.personName}
													</button>
													{#if person?.fsId}
														<a href={fsLink(person)} target="_blank" rel="noopener noreferrer" class="fs-link" title="View on FamilySearch">FS</a>
													{/if}
													{#if person?.generation != null}
														<span class="gen-label">Gen {person.generation}</span>
													{/if}
													— {evt.type}{#if evt.year}, {evt.year}{/if}
												</span>
											</li>
											{#if expandedPersonId === evt.personId && person}
												<li class="person-detail" transition:slide={{ duration: 150 }}>
													{@render personDetails(person)}
												</li>
											{/if}
										{/each}
									</ul>
								</div>
							{/each}
						</div>
					{/if}

				{:else if activeTab === 'line'}
					{#if visiblePersons.length === 0}
						<p class="ancestry-empty">No ancestors in the current map view — zoom out or pan to see more.</p>
					{:else}
						<div class="line-columns" class:four-columns={hasWifeLines}>
							<div class="line-column">
								<h3 class="line-heading" style="color: var(--color-line-paternal);">
									{primaryName ? `${primaryName}'s` : ''} Father's Line
								</h3>
								{#if paternalPersons.length === 0}
									<p class="ancestry-empty-small">No paternal ancestors in view.</p>
								{:else}
									{#each paternalPersons as person (person.id)}
										{@render personRow(person, 'paternal')}
									{/each}
								{/if}
							</div>
							<div class="line-column">
								<h3 class="line-heading" style="color: var(--color-line-maternal);">
									{primaryName ? `${primaryName}'s` : ''} Mother's Line
								</h3>
								{#if maternalPersons.length === 0}
									<p class="ancestry-empty-small">No maternal ancestors in view.</p>
								{:else}
									{#each maternalPersons as person (person.id)}
										{@render personRow(person, 'maternal')}
									{/each}
								{/if}
							</div>
							{#if hasWifeLines}
								<div class="line-column">
									<h3 class="line-heading" style="color: var(--color-line-wife-paternal);">
										{mergedName ? `${mergedName}'s` : "Spouse's"} Father's Line
									</h3>
									{#if wifePaternal.length === 0}
										<p class="ancestry-empty-small">No ancestors in view.</p>
									{:else}
										{#each wifePaternal as person (person.id)}
											{@render personRow(person, 'wife-paternal')}
										{/each}
									{/if}
								</div>
								<div class="line-column">
									<h3 class="line-heading" style="color: var(--color-line-wife-maternal);">
										{mergedName ? `${mergedName}'s` : "Spouse's"} Mother's Line
									</h3>
									{#if wifeMaternal.length === 0}
										<p class="ancestry-empty-small">No ancestors in view.</p>
									{:else}
										{#each wifeMaternal as person (person.id)}
											{@render personRow(person, 'wife-maternal')}
										{/each}
									{/if}
								</div>
							{/if}
						</div>
					{/if}

				{:else if activeTab === 'generation'}
					{#if generationGroups.length === 0}
						<p class="ancestry-empty">No ancestors in the current map view — zoom out or pan to see more.</p>
					{:else}
						<div class="generation-list">
							{#each generationGroups as group (group.generation)}
								<div class="generation-section">
									<button
										class="generation-header"
										onclick={() => toggleGeneration(group.generation)}
										aria-expanded={expandedGenerations.has(group.generation)}
									>
										<span class="ancestry-chevron">{expandedGenerations.has(group.generation) ? '\u25BE' : '\u25B8'}</span>
										<span class="generation-title">
											Generation {group.generation} — {group.label}
											<span class="generation-count">({group.persons.length})</span>
										</span>
									</button>
									{#if expandedGenerations.has(group.generation)}
										<div class="generation-body" transition:slide={{ duration: 150 }}>
											{#each group.persons as person (person.id)}
												<div class="generation-person">
													<div class="generation-person-header">
														<button class="person-link" onclick={() => togglePerson(person.id)}>
															{person.name}
														</button>
														{#if person.fsId}
															<a href={fsLink(person)} target="_blank" rel="noopener noreferrer" class="fs-link" title="View on FamilySearch">FS</a>
														{/if}
														<span class="person-lifespan">{lifespan(person)}</span>
													</div>
													{#if placeSummary(person)}
														<div class="person-places">{placeSummary(person)}</div>
													{/if}
													{#if expandedPersonId === person.id}
														<div class="person-detail" transition:slide={{ duration: 150 }}>
															{@render personDetails(person)}
														</div>
													{/if}
												</div>
											{/each}
										</div>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				{/if}
			</div>

			<!-- Statistics footer -->
			{#if stats}
				<div class="ancestry-footer">
					<div class="ancestry-stats">
						{#if stats.earliest}
							<span>Earliest: {stats.earliest.name}, b. {stats.earliest.birthYear}</span>
						{/if}
						{#if stats.latest}
							<span class="stat-sep">&middot;</span>
							<span>Latest: {stats.latest.name}, d. {stats.latest.deathYear}</span>
						{/if}
					</div>
					{#if stats.countries.length > 0}
						<div class="ancestry-countries">
							{stats.countries.join(', ')}
						</div>
					{/if}
					<div class="ancestry-attribution">
						Data from <a href="https://www.familysearch.org" target="_blank" rel="noopener noreferrer">FamilySearch</a>
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>

<!-- ─── Snippets ──────────────────────────────────────── -->

{#snippet personRow(person, lineage)}
	<div class="line-person" style="padding-left: {person.generation * 12}px;">
		<span
			class="line-dot"
			style="background: {safeLineageColor(lineage)};"
		></span>
		<div class="line-person-info">
			<div class="line-person-header">
				<button class="person-link" onclick={() => togglePerson(person.id)}>
					{person.name}
				</button>
				{#if person.fsId}
					<a href={fsLink(person)} target="_blank" rel="noopener noreferrer" class="fs-link" title="View on FamilySearch">FS</a>
				{/if}
			</div>
			<div class="line-person-meta">
				{lifespan(person)}
				{#if placeSummary(person)}
					<span class="stat-sep">&middot;</span> {placeSummary(person)}
				{/if}
			</div>
			{#if person.lineagePath}
				<div class="line-person-path">{displayLineagePath(person.lineagePath)}</div>
			{/if}
			{#if expandedPersonId === person.id}
				<div class="person-detail" transition:slide={{ duration: 150 }}>
					{@render personDetails(person)}
				</div>
			{/if}
		</div>
	</div>
{/snippet}

{#snippet personDetails(person)}
	<div class="detail-card">
		<div class="detail-header">
			<strong>{person.name}</strong>
			{#if person.gender}
				<span class="detail-gender">{person.gender}</span>
			{/if}
			{#if person.lineagePath}
				<span class="detail-lineage">{displayLineagePath(person.lineagePath)}</span>
			{/if}
		</div>
		{#if person.facts?.length > 0}
			<ul class="detail-facts">
				{#each person.facts as fact}
					<li class="detail-fact">
						<span class="event-icon">{eventIcon(fact.type)}</span>
						<span class="detail-fact-type">{fact.type}</span>
						{#if fact.date}
							<span class="detail-fact-date">{fact.date}</span>
						{/if}
						{#if fact.place}
							<span class="detail-fact-place">{fact.place}</span>
						{/if}
					</li>
				{/each}
			</ul>
		{:else}
			<p class="ancestry-empty-small">No recorded events.</p>
		{/if}
		{#if person.fsId}
			<a href={fsLink(person)} target="_blank" rel="noopener noreferrer" class="detail-fs-link">
				View on FamilySearch &rarr;
			</a>
		{/if}
	</div>
{/snippet}

<style>
	/* ─── Panel Container ────────────────────────── */
	.ancestry-panel {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		overflow: hidden;
	}

	/* ─── Collapsed Header ───────────────────────── */
	.ancestry-header {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 14px 20px;
		background: none;
		border: none;
		cursor: pointer;
		font-family: inherit;
		text-align: left;
		transition: background 0.15s;
	}
	.ancestry-header:hover {
		background: var(--color-bg);
	}
	.ancestry-chevron {
		font-size: 0.9rem;
		color: var(--color-text-muted);
		flex-shrink: 0;
		width: 14px;
	}
	.ancestry-summary {
		font-size: 0.85rem;
		color: var(--color-text-muted);
		margin-left: auto;
	}
	.ancestry-total {
		color: var(--color-text-light);
	}

	/* ─── Body ───────────────────────────────────── */
	.ancestry-body {
		border-top: 1px solid var(--color-border);
	}

	/* ─── Tabs ───────────────────────────────────── */
	.ancestry-tabs {
		display: flex;
		gap: 0;
		border-bottom: 1px solid var(--color-border);
		padding: 0 20px;
	}
	.ancestry-tab {
		padding: 10px 16px;
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		font-family: inherit;
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--color-text-muted);
		cursor: pointer;
		transition: color 0.15s, border-color 0.15s;
	}
	.ancestry-tab:hover {
		color: var(--color-text);
	}
	.ancestry-tab.active {
		color: var(--color-primary);
		border-bottom-color: var(--color-primary);
	}

	/* ─── Search Bar ────────────────────────────── */
	.ancestry-search-bar {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 10px 20px;
		border-bottom: 1px solid var(--color-border);
	}
	.ancestry-search-input {
		flex: 1;
		padding: 7px 12px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: 0.85rem;
		font-family: inherit;
		outline: none;
	}
	.ancestry-search-input:focus {
		border-color: var(--color-primary);
	}
	.ancestry-search-clear {
		background: none;
		border: none;
		font-size: 1.2rem;
		color: var(--color-text-muted);
		cursor: pointer;
		padding: 0 4px;
		line-height: 1;
	}
	.ancestry-search-clear:hover {
		color: var(--color-text);
	}

	/* ─── Content Area ───────────────────────────── */
	.ancestry-content {
		padding: 16px 20px;
		max-height: 500px;
		overflow-y: auto;
	}
	.ancestry-empty {
		color: var(--color-text-muted);
		font-size: 0.85rem;
		text-align: center;
		padding: 24px 0;
	}
	.ancestry-empty-small {
		color: var(--color-text-light);
		font-size: 0.8rem;
		padding: 8px 0;
	}

	/* ─── By Place Tab ───────────────────────────── */
	.place-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.place-card {
		border: 1px solid var(--color-border-light);
		border-radius: var(--radius-md);
		padding: 12px 14px;
	}
	.place-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		margin-bottom: 8px;
	}
	.place-name {
		font-size: 0.9rem;
		font-weight: 700;
	}
	.place-meta {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-shrink: 0;
	}
	.place-country {
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}
	.visited-badge {
		font-size: 0.65rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 2px 8px;
		border-radius: var(--radius-pill);
		background: var(--badge-travel-bg);
		color: var(--badge-travel-text);
	}
	.place-events {
		list-style: none;
	}
	.place-event {
		display: flex;
		align-items: flex-start;
		gap: 6px;
		padding: 3px 0;
		font-size: 0.8rem;
	}
	.event-icon {
		flex-shrink: 0;
		width: 16px;
		text-align: center;
		color: var(--color-text-muted);
	}
	.event-detail {
		line-height: 1.4;
		color: var(--color-text);
	}

	/* ─── Person link / FS link ──────────────────── */
	.person-link {
		background: none;
		border: none;
		padding: 0;
		font-family: inherit;
		font-size: inherit;
		font-weight: 600;
		color: var(--color-text);
		cursor: pointer;
		text-decoration: underline;
		text-decoration-color: var(--color-border);
		text-underline-offset: 2px;
	}
	.person-link:hover {
		text-decoration-color: var(--color-primary);
		color: var(--color-primary);
	}
	.fs-link {
		font-size: 0.65rem;
		font-weight: 700;
		padding: 1px 5px;
		border-radius: 3px;
		background: #e8f5e9;
		color: #2e7d32;
		text-decoration: none;
		vertical-align: middle;
	}
	.fs-link:hover {
		background: #c8e6c9;
	}
	.gen-label {
		font-size: 0.7rem;
		color: var(--color-text-light);
	}

	/* ─── Person Detail Expansion ────────────────── */
	.person-detail {
		list-style: none;
	}
	.detail-card {
		background: var(--color-bg);
		border-radius: var(--radius-sm);
		padding: 10px 12px;
		margin: 6px 0 4px 22px;
		font-size: 0.8rem;
	}
	.detail-header {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
		margin-bottom: 8px;
	}
	.detail-gender {
		font-size: 0.7rem;
		color: var(--color-text-muted);
	}
	.detail-lineage {
		font-size: 0.7rem;
		color: var(--color-text-light);
		font-style: italic;
	}
	.detail-facts {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.detail-fact {
		display: flex;
		align-items: baseline;
		gap: 6px;
		line-height: 1.4;
	}
	.detail-fact-type {
		font-weight: 600;
		min-width: 80px;
	}
	.detail-fact-date {
		color: var(--color-text-muted);
		min-width: 100px;
	}
	.detail-fact-place {
		color: var(--color-text);
	}
	.detail-fs-link {
		display: inline-block;
		margin-top: 8px;
		font-size: 0.75rem;
		color: var(--color-primary);
		text-decoration: none;
	}
	.detail-fs-link:hover {
		text-decoration: underline;
	}

	/* ─── By Family Line Tab ─────────────────────── */
	.line-columns {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 20px;
	}
	.line-columns.four-columns {
		grid-template-columns: repeat(4, 1fr);
	}
	@media (max-width: 1024px) {
		.line-columns.four-columns {
			grid-template-columns: 1fr 1fr;
		}
	}
	@media (max-width: 640px) {
		.line-columns {
			grid-template-columns: 1fr;
		}
	}
	.line-heading {
		font-size: 0.85rem;
		font-weight: 700;
		margin-bottom: 10px;
		padding-bottom: 6px;
		border-bottom: 2px solid currentColor;
	}
	.line-person {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		padding: 6px 0;
	}
	.line-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
		margin-top: 5px;
	}
	.line-person-info {
		flex: 1;
		min-width: 0;
	}
	.line-person-header {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.line-person-meta {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		margin-top: 2px;
	}
	.line-person-path {
		font-size: 0.7rem;
		color: var(--color-text-light);
		font-style: italic;
		margin-top: 1px;
	}

	/* ─── By Generation Tab ──────────────────────── */
	.generation-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.generation-section {
		border: 1px solid var(--color-border-light);
		border-radius: var(--radius-sm);
		overflow: hidden;
	}
	.generation-header {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 10px 12px;
		background: none;
		border: none;
		cursor: pointer;
		font-family: inherit;
		text-align: left;
		transition: background 0.15s;
	}
	.generation-header:hover {
		background: var(--color-bg);
	}
	.generation-title {
		font-size: 0.85rem;
		font-weight: 600;
	}
	.generation-count {
		color: var(--color-text-muted);
		font-weight: 400;
	}
	.generation-body {
		padding: 0 12px 10px 12px;
	}
	.generation-person {
		padding: 6px 0;
		border-bottom: 1px solid var(--color-border-light);
	}
	.generation-person:last-child {
		border-bottom: none;
	}
	.generation-person-header {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	.person-lifespan {
		font-size: 0.8rem;
		color: var(--color-text-muted);
	}
	.person-places {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		margin-top: 2px;
	}

	/* ─── Footer ─────────────────────────────────── */
	.ancestry-footer {
		border-top: 1px solid var(--color-border);
		padding: 12px 20px;
		font-size: 0.75rem;
		color: var(--color-text-muted);
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.ancestry-stats {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.stat-sep {
		color: var(--color-text-light);
	}
	.ancestry-countries {
		color: var(--color-text-light);
	}
	.ancestry-attribution a {
		color: var(--color-primary);
		text-decoration: none;
	}
	.ancestry-attribution a:hover {
		text-decoration: underline;
	}
</style>
