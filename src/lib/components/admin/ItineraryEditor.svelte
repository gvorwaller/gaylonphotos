<script>
	/**
	 * Itinerary editor with stop list and map picker.
	 * Props: collectionSlug, itinerary, apiKey, onupdated
	 */
	import GoogleMap from '$lib/components/common/Map.svelte';
	import Modal from '$lib/components/common/Modal.svelte';
	import { apiPut, apiPost, apiDelete } from '$lib/api.js';

	let { collectionSlug, itinerary = null, apiKey = '', onupdated = null } = $props();

	// Working state
	let tripName = $state('');
	let tripDesc = $state('');
	let tripStart = $state('');
	let tripEnd = $state('');
	let stops = $state([]);

	let editingStopIdx = $state(null);
	let pickingGps = $state(false); // true when next map click sets a stop's GPS
	let error = $state('');
	let saving = $state(false);
	let showDeleteConfirm = $state(null); // stop index to delete

	$effect(() => {
		tripName = itinerary?.trip?.name || '';
		tripDesc = itinerary?.trip?.description || '';
		tripStart = itinerary?.trip?.startDate || '';
		tripEnd = itinerary?.trip?.endDate || '';
		stops = itinerary?.stops ? [...itinerary.stops] : [];
	});

	// Map markers from stops
	let markers = $derived(
		stops.filter((s) => s.lat && s.lng).map((s, i) => ({
			lat: s.lat,
			lng: s.lng,
			id: `stop-${s.id}`,
			label: `${i + 1}. ${s.city}`,
			color: '#28a745'
		}))
	);

	// Polyline from stops
	let polylinePath = $derived(
		stops.filter((s) => s.lat && s.lng).map((s) => ({ lat: s.lat, lng: s.lng }))
	);

	function addStop() {
		const newStop = {
			id: Date.now(), // temporary; real ID comes from server
			city: '',
			country: '',
			lat: 0,
			lng: 0,
			arrivalDate: null,
			departureDate: null,
			notes: ''
		};
		stops = [...stops, newStop];
		editingStopIdx = stops.length - 1;
		pickingGps = true;
	}

	function handleMapClick(coords) {
		if (editingStopIdx !== null && pickingGps) {
			stops[editingStopIdx].lat = coords.lat;
			stops[editingStopIdx].lng = coords.lng;
			stops = [...stops]; // trigger reactivity
			pickingGps = false;
		}
	}

	function startPickGps(idx) {
		editingStopIdx = idx;
		pickingGps = true;
	}

	function removeStop(idx) {
		stops = stops.filter((_, i) => i !== idx);
		showDeleteConfirm = null;
		if (editingStopIdx === idx) editingStopIdx = null;
	}

	function moveStop(idx, direction) {
		const newIdx = idx + direction;
		if (newIdx < 0 || newIdx >= stops.length) return;
		const temp = stops[idx];
		stops[idx] = stops[newIdx];
		stops[newIdx] = temp;
		stops = [...stops];
	}

	async function saveAll() {
		saving = true;
		error = '';

		const itineraryData = {
			trip: {
				name: tripName,
				description: tripDesc,
				startDate: tripStart || null,
				endDate: tripEnd || null
			},
			stops
		};

		const result = await apiPut('/api/itinerary', {
			collection: collectionSlug,
			itinerary: itineraryData
		});

		saving = false;
		if (result.ok) {
			onupdated?.(result.data.itinerary);
		} else {
			error = result.error;
		}
	}
</script>

<div class="itinerary-editor">
	<div class="editor-left">
		<div class="trip-info">
			<h3>Trip Info</h3>
			<label class="field">
				<span>Name</span>
				<input type="text" bind:value={tripName} placeholder="Trip name" />
			</label>
			<label class="field">
				<span>Description</span>
				<textarea bind:value={tripDesc} rows="2"></textarea>
			</label>
			<div class="field-row">
				<label class="field">
					<span>Start Date</span>
					<input type="date" bind:value={tripStart} />
				</label>
				<label class="field">
					<span>End Date</span>
					<input type="date" bind:value={tripEnd} />
				</label>
			</div>
		</div>

		{#if error}
			<div class="editor-error">{error}</div>
		{/if}

		<div class="stops-header">
			<h3>Stops ({stops.length})</h3>
			<button class="btn btn-primary btn-sm" onclick={addStop}>Add Stop</button>
		</div>

		<div class="stops-list">
			{#each stops as stop, idx (stop.id)}
				<div class="stop-card" class:editing={editingStopIdx === idx}>
					<div class="stop-number">{idx + 1}</div>
					<div class="stop-fields">
						<div class="field-row">
							<input type="text" bind:value={stop.city} placeholder="City" />
							<input type="text" bind:value={stop.country} placeholder="Country" />
						</div>
						<div class="field-row">
							<input type="date" bind:value={stop.arrivalDate} />
							<input type="date" bind:value={stop.departureDate} />
						</div>
						<textarea bind:value={stop.notes} rows="1" placeholder="Notes"></textarea>
						<div class="stop-gps">
							{#if stop.lat && stop.lng}
								<span class="gps-display">{stop.lat.toFixed(4)}, {stop.lng.toFixed(4)}</span>
							{:else}
								<span class="gps-none">No location</span>
							{/if}
							<button class="btn btn-outline btn-sm" onclick={() => startPickGps(idx)}>
								{pickingGps && editingStopIdx === idx ? 'Click map...' : 'Set on map'}
							</button>
						</div>
					</div>
					<div class="stop-actions">
						<button class="move-btn" onclick={() => moveStop(idx, -1)} disabled={idx === 0}>&#9650;</button>
						<button class="move-btn" onclick={() => moveStop(idx, 1)} disabled={idx === stops.length - 1}>&#9660;</button>
						<button class="delete-btn" onclick={() => showDeleteConfirm = idx}>&times;</button>
					</div>
				</div>
			{/each}
		</div>

		<div class="save-bar">
			<button class="btn btn-primary" onclick={saveAll} disabled={saving}>
				{saving ? 'Saving...' : 'Save Itinerary'}
			</button>
		</div>
	</div>

	<div class="editor-right">
		<GoogleMap
			{apiKey}
			center={{ lat: 55, lng: 15 }}
			zoom={4}
			{markers}
			polyline={polylinePath}
			clickable={true}
			onmapclick={handleMapClick}
		/>
		{#if pickingGps}
			<div class="map-hint">Click the map to set location for stop {(editingStopIdx ?? 0) + 1}</div>
		{/if}
	</div>
</div>

<Modal title="Remove Stop" show={showDeleteConfirm !== null} onclose={() => showDeleteConfirm = null}>
	<p>Remove this stop from the itinerary?</p>
	{#snippet actions()}
		<button class="btn btn-outline btn-sm" onclick={() => showDeleteConfirm = null}>Cancel</button>
		<button class="btn btn-danger btn-sm" onclick={() => removeStop(showDeleteConfirm)}>Remove</button>
	{/snippet}
</Modal>

<style>
	.itinerary-editor {
		display: flex;
		height: calc(100vh - 96px);
		gap: 0;
	}
	.editor-left {
		width: 45%;
		display: flex;
		flex-direction: column;
		overflow-y: auto;
		padding-right: 16px;
	}
	.editor-right {
		width: 55%;
		position: relative;
	}
	.trip-info {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: 16px;
		margin-bottom: 16px;
	}
	.trip-info h3 {
		font-size: 0.9rem;
		font-weight: 700;
		margin-bottom: 12px;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 3px;
		margin-bottom: 8px;
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
	.field-row {
		display: flex;
		gap: 8px;
	}
	.field-row .field, .field-row input {
		flex: 1;
	}
	.stops-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 12px;
	}
	.stops-header h3 {
		font-size: 0.9rem;
		font-weight: 700;
	}
	.stops-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
		flex: 1;
	}
	.stop-card {
		display: flex;
		gap: 10px;
		padding: 12px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}
	.stop-card.editing {
		border-color: var(--color-primary);
	}
	.stop-number {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: var(--color-primary);
		color: #fff;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.75rem;
		font-weight: 700;
		flex-shrink: 0;
	}
	.stop-fields {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.stop-fields input, .stop-fields textarea {
		padding: 5px 8px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: 0.8rem;
		font-family: inherit;
	}
	.stop-gps {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.75rem;
	}
	.gps-display {
		color: var(--color-primary);
		font-family: monospace;
	}
	.gps-none {
		color: var(--color-text-muted);
	}
	.stop-actions {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex-shrink: 0;
	}
	.move-btn, .delete-btn {
		background: none;
		border: 1px solid var(--color-border);
		border-radius: 4px;
		padding: 2px 6px;
		cursor: pointer;
		font-size: 0.7rem;
		color: var(--color-text-muted);
	}
	.move-btn:hover { color: var(--color-text); }
	.delete-btn { color: var(--color-danger); border-color: transparent; }
	.delete-btn:hover { background: #fdf0f0; }
	.save-bar {
		padding: 16px 0;
		flex-shrink: 0;
	}
	.map-hint {
		position: absolute;
		bottom: 12px;
		left: 50%;
		transform: translateX(-50%);
		background: var(--color-primary);
		color: #fff;
		padding: 8px 16px;
		border-radius: 20px;
		font-size: 0.8rem;
		font-weight: 600;
		pointer-events: none;
	}
	.editor-error {
		background: #fdf0f0;
		color: var(--color-danger);
		padding: 8px 12px;
		border-radius: var(--radius-sm);
		font-size: 0.85rem;
		margin-bottom: 12px;
	}
</style>
