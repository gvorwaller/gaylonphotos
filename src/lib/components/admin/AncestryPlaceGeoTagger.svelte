<script>
	/**
	 * Split-panel geo-tagging UI for ancestry places.
	 * Left (40%): list of unresolved places with selection
	 * Right (60%): Google Map with clickable placement + place search
	 *
	 * Props: collectionSlug, ancestry, apiKey
	 */
	import GoogleMap from '$lib/components/common/Map.svelte';
	import { apiPatch } from '$lib/api.js';

	let { collectionSlug, ancestry = null, apiKey = '' } = $props();

	let places = $state([]);
	let selectedPlaceId = $state(null);
	let pendingCoords = $state(null);
	let assigning = $state(false);
	let error = $state('');
	let filter = $state('failed'); // 'failed', 'all'

	// Initialize from prop
	$effect(() => {
		if (ancestry?.places) {
			places = ancestry.places.map((p) => ({ ...p }));
		}
	});

	let filteredPlaces = $derived.by(() => {
		if (filter === 'failed') {
			return places.filter((p) => p.geocodeStatus === 'failed');
		}
		return places;
	});

	let failedCount = $derived(places.filter((p) => p.geocodeStatus === 'failed').length);
	let resolvedCount = $derived(places.filter((p) => p.geocodeStatus !== 'failed').length);

	// Markers: show all resolved places as context, and pending preview
	let markers = $derived.by(() => {
		const m = [];

		// Resolved places as green context markers
		for (const p of places) {
			if (p.lat != null && p.lng != null && p.geocodeStatus !== 'failed') {
				m.push({
					lat: p.lat,
					lng: p.lng,
					id: p.id,
					label: p.name,
					color: '#28a745',
					shape: 'diamond'
				});
			}
		}

		// Pending preview marker
		if (pendingCoords) {
			m.push({
				lat: pendingCoords.lat,
				lng: pendingCoords.lng,
				id: '__pending__',
				label: selectedPlaceId ? `Assign here` : 'Select a place first',
				color: '#ff6b35'
			});
		}

		return m;
	});

	function selectPlace(placeId) {
		selectedPlaceId = selectedPlaceId === placeId ? null : placeId;
		pendingCoords = null;
		error = '';
	}

	function handleMapClick(coords) {
		if (!selectedPlaceId) return;
		pendingCoords = coords;
	}

	let selectedPlace = $derived(selectedPlaceId ? places.find((p) => p.id === selectedPlaceId) : null);
	let canAssign = $derived(selectedPlaceId !== null && pendingCoords !== null);

	async function assignCoords() {
		if (!pendingCoords || !selectedPlaceId) return;

		assigning = true;
		error = '';

		const result = await apiPatch('/api/ancestry', {
			collection: collectionSlug,
			placeId: selectedPlaceId,
			lat: pendingCoords.lat,
			lng: pendingCoords.lng
		});

		assigning = false;

		if (result.ok) {
			// Update local state
			const updatedPlace = result.data.place;
			places = places.map((p) =>
				p.id === selectedPlaceId
					? { ...p, lat: updatedPlace.lat, lng: updatedPlace.lng, geocodeStatus: updatedPlace.geocodeStatus, nearStop: updatedPlace.nearStop }
					: p
			);
			selectedPlaceId = null;
			pendingCoords = null;
		} else {
			error = result.error;
		}
	}

	function formatEvents(place) {
		if (!place.events?.length) return '';
		return place.events.map((e) => {
			const parts = [e.personName];
			if (e.type) parts.push(e.type);
			if (e.year) parts.push(String(e.year));
			return parts.join(' — ');
		}).join('; ');
	}
</script>

<div class="geotagger">
	<div class="geotagger-left">
		<div class="geotagger-toolbar">
			<span class="count">
				{failedCount} unresolved, {resolvedCount} resolved
			</span>
			<div class="toolbar-actions">
				<button
					class="btn btn-outline btn-xs"
					class:active={filter === 'failed'}
					onclick={() => filter = 'failed'}
				>
					Unresolved
				</button>
				<button
					class="btn btn-outline btn-xs"
					class:active={filter === 'all'}
					onclick={() => filter = 'all'}
				>
					All
				</button>
			</div>
		</div>

		{#if error}
			<div class="geotagger-error">{error}</div>
		{/if}

		{#if filteredPlaces.length === 0}
			<div class="geotagger-done">
				{filter === 'failed' ? 'All places have been resolved!' : 'No places found.'}
			</div>
		{:else}
			<div class="place-list">
				{#each filteredPlaces as place (place.id)}
					<button
						class="place-card"
						class:selected={selectedPlaceId === place.id}
						class:resolved={place.geocodeStatus !== 'failed'}
						onclick={() => selectPlace(place.id)}
					>
						<div class="place-info">
							<span class="place-name">{place.name}</span>
							<span class="place-events">{formatEvents(place)}</span>
						</div>
						<span
							class="status-badge"
							class:ok={place.geocodeStatus === 'ok'}
							class:approx={place.geocodeStatus === 'approximate'}
							class:fail={place.geocodeStatus === 'failed'}
							class:manual={place.geocodeStatus === 'manual'}
						>
							{place.geocodeStatus}
						</span>
					</button>
				{/each}
			</div>
		{/if}
	</div>

	<div class="geotagger-right">
		<div class="map-area">
			<GoogleMap
				{apiKey}
				center={{ lat: 55, lng: 14 }}
				zoom={5}
				markers={markers}
				clickable={true}
				onmapclick={handleMapClick}
				searchable={true}
			/>
		</div>

		{#if canAssign}
			<div class="assign-bar">
				<div class="assign-info">
					<span class="assign-place">{selectedPlace?.name}</span>
					<span class="assign-coords">
						{pendingCoords.lat.toFixed(5)}, {pendingCoords.lng.toFixed(5)}
					</span>
				</div>
				<button
					class="btn btn-primary"
					onclick={assignCoords}
					disabled={assigning}
				>
					{assigning ? 'Saving...' : 'Assign Coordinates'}
				</button>
			</div>
		{:else if selectedPlaceId}
			<div class="assign-bar hint">
				Search a place or click the map to set coordinates for: <strong>{selectedPlace?.name}</strong>
			</div>
		{:else}
			<div class="assign-bar hint">
				Select a place on the left, then search or click the map
			</div>
		{/if}
	</div>
</div>

<style>
	.geotagger {
		display: flex;
		height: calc(100vh - 96px);
		gap: 0;
	}
	.geotagger-left {
		width: 40%;
		display: flex;
		flex-direction: column;
		border-right: 1px solid var(--color-border);
		overflow: hidden;
	}
	.geotagger-right {
		width: 60%;
		display: flex;
		flex-direction: column;
	}
	.geotagger-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		border-bottom: 1px solid var(--color-border);
		flex-shrink: 0;
	}
	.count {
		font-size: 0.85rem;
		color: var(--color-text-muted);
		font-weight: 600;
	}
	.toolbar-actions {
		display: flex;
		gap: 4px;
	}
	.btn-xs {
		padding: 3px 8px;
		font-size: 0.7rem;
	}
	.btn-xs.active {
		background: var(--color-primary);
		color: #fff;
		border-color: var(--color-primary);
	}
	.geotagger-error {
		background: #fdf0f0;
		color: var(--color-danger);
		padding: 8px 16px;
		font-size: 0.8rem;
	}
	.geotagger-done {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: 1;
		color: var(--color-primary);
		font-weight: 600;
		font-size: 1rem;
	}
	.place-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 8px;
		overflow-y: auto;
		flex: 1;
	}
	.place-card {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 10px;
		border: 2px solid transparent;
		border-radius: var(--radius-sm);
		background: #fdf0f0;
		cursor: pointer;
		transition: border-color 0.1s;
		text-align: left;
		flex-shrink: 0;
	}
	.place-card.resolved {
		background: #f8f8f8;
	}
	.place-card.selected {
		border-color: var(--color-primary);
		background: #e8f5e9;
	}
	.place-card:hover {
		background: #f0f0f0;
	}
	.place-info {
		flex: 1;
		min-width: 0;
	}
	.place-name {
		display: block;
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--color-text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.place-events {
		display: block;
		font-size: 0.7rem;
		color: var(--color-text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		margin-top: 2px;
	}
	.status-badge {
		font-size: 0.65rem;
		font-weight: 600;
		padding: 1px 6px;
		border-radius: 3px;
		text-align: center;
		white-space: nowrap;
		flex-shrink: 0;
	}
	.status-badge.ok { background: #e8f5e9; color: #2e7d32; }
	.status-badge.approx { background: #fff3e0; color: #e65100; }
	.status-badge.fail { background: #fce4ec; color: #c62828; }
	.status-badge.manual { background: #e3f2fd; color: #1565c0; }
	.map-area {
		flex: 1;
		min-height: 0;
	}
	.assign-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		border-top: 1px solid var(--color-border);
		background: var(--color-surface);
		flex-shrink: 0;
	}
	.assign-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.assign-place {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--color-text);
	}
	.assign-coords {
		font-size: 0.8rem;
		color: var(--color-text-muted);
		font-family: monospace;
	}
	.assign-bar.hint {
		justify-content: center;
		color: var(--color-text-muted);
		font-size: 0.85rem;
	}

	@media (max-width: 1024px) {
		.geotagger {
			flex-direction: column;
			height: auto;
			min-height: calc(100vh - 160px);
		}
		.geotagger-left {
			width: 100%;
			border-right: none;
			border-bottom: 1px solid var(--color-border);
			max-height: 40vh;
			overflow: hidden auto;
		}
		.geotagger-toolbar {
			position: sticky;
			top: 0;
			background: var(--color-surface);
			z-index: 1;
		}
		.place-list {
			overflow-y: visible;
		}
		.geotagger-right {
			width: 100%;
			flex: 1;
		}
		.map-area {
			min-height: 50vh;
		}
	}
</style>
