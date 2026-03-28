<script>
	/**
	 * THE CRITICAL FEATURE — Split-panel geo-tagging UI.
	 * Left (40%): grid of untagged photo thumbnails with multi-select
	 * Right (60%): Google Map with clickable placement + place search
	 *
	 * Props: collectionSlug, photos (untagged), allPhotos, apiKey
	 */
	import GoogleMap from '$lib/components/common/Map.svelte';
	import { apiPost, apiPut } from '$lib/api.js';
	import { reverseGeocode } from '$lib/geocoding.js';
	import AdminPhotoLightbox from '$lib/components/admin/AdminPhotoLightbox.svelte';

	let { collectionSlug, photos = [], allPhotos = [], apiKey = '' } = $props();

	// Working copies — photos move from untagged to tagged as they're assigned
	let untaggedPhotos = $state([]);
	let selectedIds = $state(new Set());
	let pendingCoords = $state(null);
	let assigning = $state(false);
	let error = $state('');

	// Re-sync when navigating to a different collection's geotag page
	$effect(() => {
		untaggedPhotos = [...photos];
		selectedIds = new Set();
		pendingCoords = null;
	});

	// Place search
	let searchInput;
	let mapInstance = $state(null);
	let autocomplete = null;

	function handleMapReady(map) {
		mapInstance = map;
	}

	// Bind Places Autocomplete once map and input are both ready
	$effect(() => {
		if (!mapInstance || !searchInput || !window.google?.maps?.places) return;
		if (autocomplete) return; // already bound

		autocomplete = new google.maps.places.Autocomplete(searchInput, {
			fields: ['geometry', 'name']
		});

		autocomplete.bindTo('bounds', mapInstance);

		autocomplete.addListener('place_changed', () => {
			const place = autocomplete.getPlace();
			if (!place.geometry?.location) return;

			const lat = place.geometry.location.lat();
			const lng = place.geometry.location.lng();

			// Pan map to the selected place
			mapInstance.setCenter({ lat, lng });
			if (place.geometry.viewport) {
				mapInstance.fitBounds(place.geometry.viewport);
			} else {
				mapInstance.setZoom(14);
			}

			// Set as pending coords — assign button is gated on both selection + coords
			pendingCoords = { lat, lng };
		});
	});

	// Markers: already-tagged photos (semi-transparent context) + pending preview
	let markers = $derived.by(() => {
		const m = [];

		// Already-tagged photos from the full collection
		for (const p of allPhotos) {
			if (p.gps && p.gpsSource !== null) {
				m.push({
					lat: p.gps.lat,
					lng: p.gps.lng,
					id: p.id,
					label: p.filename,
					color: '#28a745'
				});
			}
		}

		// Pending preview marker
		if (pendingCoords) {
			m.push({
				lat: pendingCoords.lat,
				lng: pendingCoords.lng,
				id: '__pending__',
				label: `Assign ${selectedIds.size} photo(s) here`,
				color: '#ff6b35'
			});
		}

		return m;
	});

	function toggleSelect(photoId) {
		const next = new Set(selectedIds);
		if (next.has(photoId)) {
			next.delete(photoId);
		} else {
			next.add(photoId);
		}
		selectedIds = next;
	}

	function selectAll() {
		selectedIds = new Set(untaggedPhotos.map((p) => p.id));
	}

	function clearSelection() {
		selectedIds = new Set();
		pendingCoords = null;
	}

	function handleMapClick(coords) {
		if (selectedIds.size === 0) return;
		pendingCoords = coords;
	}

	async function assignGps() {
		if (!pendingCoords || selectedIds.size === 0) return;

		assigning = true;
		error = '';

		const slug = collectionSlug;
		const result = await apiPost('/api/geotag', {
			collection: slug,
			photoIds: [...selectedIds],
			lat: pendingCoords.lat,
			lng: pendingCoords.lng
		});

		assigning = false;

		if (result.ok) {
			// Capture state before resetting
			const assignedIds = [...selectedIds];
			const coords = pendingCoords;

			// Remove assigned photos from untagged list
			untaggedPhotos = untaggedPhotos.filter((p) => !selectedIds.has(p.id));
			selectedIds = new Set();
			pendingCoords = null;

			// Backfill locationName in the background
			if (apiKey && coords) {
				reverseGeocode(coords.lat, coords.lng, apiKey).then(async (name) => {
					if (name) {
						for (const photoId of assignedIds) {
							const putResult = await apiPut('/api/photos', {
								collection: slug,
								photoId,
								updates: { locationName: name }
							});
							if (!putResult.ok) {
								console.warn(`Failed to set locationName for ${photoId}:`, putResult.error);
							}
						}
					}
				}).catch((err) => console.warn('Background geocode failed:', err));
			}
		} else {
			error = result.error;
		}
	}

	let selectedCount = $derived(selectedIds.size);

	// Photo preview lightbox
	let previewPhoto = $state(null);

	function openPreview(e, photo) {
		e.stopPropagation();
		previewPhoto = photo;
	}
	let canAssign = $derived(selectedCount > 0 && pendingCoords !== null);
</script>

<div class="geotagger">
	<div class="geotagger-left">
		<div class="geotagger-toolbar">
			<span class="count">
				{untaggedPhotos.length} untagged, {selectedCount} selected
			</span>
			<div class="toolbar-actions">
				<button class="btn btn-outline btn-sm" onclick={selectAll}>Select All</button>
				<button class="btn btn-outline btn-sm" onclick={clearSelection}>Clear</button>
			</div>
		</div>

		{#if error}
			<div class="geotagger-error">{error}</div>
		{/if}

		{#if untaggedPhotos.length === 0}
			<div class="geotagger-done">
				All photos have been geo-tagged!
			</div>
		{:else}
			<div class="photo-list">
				{#each untaggedPhotos as photo (photo.id)}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<div
						class="photo-card"
						class:selected={selectedIds.has(photo.id)}
						onclick={() => toggleSelect(photo.id)}
						role="button"
						tabindex="0"
					>
						<img src={photo.thumbnail} alt={photo.filename} loading="lazy" />
						<button class="preview-icon" onclick={(e) => openPreview(e, photo)} aria-label="Preview {photo.filename}">
							&#128269;
						</button>
						<span class="photo-label">{photo.species || photo.filename}</span>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<div class="geotagger-right">
		<div class="search-bar">
			<input
				bind:this={searchInput}
				type="text"
				class="search-input"
				placeholder="Search for a place..."
			/>
		</div>
		<div class="map-area">
			<GoogleMap
				{apiKey}
				center={{ lat: 40, lng: -10 }}
				zoom={3}
				markers={markers}
				clickable={true}
				onmapclick={handleMapClick}
				onmapready={handleMapReady}
			/>
		</div>

		{#if canAssign}
			<div class="assign-bar">
				<span>
					{pendingCoords.lat.toFixed(4)}, {pendingCoords.lng.toFixed(4)}
				</span>
				<button
					class="btn btn-primary"
					onclick={assignGps}
					disabled={assigning}
				>
					{assigning ? 'Assigning...' : `Assign GPS to ${selectedCount} photo${selectedCount !== 1 ? 's' : ''}`}
				</button>
			</div>
		{:else if selectedCount > 0}
			<div class="assign-bar hint">
				Search a place or click the map to set GPS location
			</div>
		{:else}
			<div class="assign-bar hint">
				Select photos on the left, then search or click the map
			</div>
		{/if}
	</div>
</div>

{#if previewPhoto}
	<AdminPhotoLightbox
		photo={previewPhoto}
		photos={untaggedPhotos}
		{collectionSlug}
		onclose={() => previewPhoto = null}
		ondeleted={(id) => { untaggedPhotos = untaggedPhotos.filter(p => p.id !== id); previewPhoto = null; }}
	/>
{/if}

<style>
	.geotagger {
		display: flex;
		height: calc(100vh - 96px);
		gap: 0;
	}
	.geotagger-left {
		width: 45%;
		display: flex;
		flex-direction: column;
		border-right: 1px solid var(--color-border);
		overflow: hidden;
	}
	.geotagger-right {
		width: 55%;
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
		gap: 6px;
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
	.photo-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 8px;
		overflow-y: auto;
		flex: 1;
	}
	.photo-card {
		position: relative;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 4px;
		border: 2px solid transparent;
		border-radius: var(--radius-sm);
		background: #f8f8f8;
		cursor: pointer;
		transition: border-color 0.1s;
		text-align: left;
		flex-shrink: 0;
	}
	.photo-card.selected {
		border-color: var(--color-primary);
		background: #e8f5e9;
	}
	.photo-card:hover {
		background: #f0f0f0;
	}
	.photo-card img {
		width: 120px;
		height: 80px;
		object-fit: cover;
		border-radius: 4px;
		flex-shrink: 0;
	}
	.preview-icon {
		position: absolute;
		top: 4px;
		right: 4px;
		background: rgba(0, 0, 0, 0.5);
		border: none;
		color: #fff;
		font-size: 0.7rem;
		width: 22px;
		height: 22px;
		border-radius: 3px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0;
		transition: opacity 0.15s;
		padding: 0;
		line-height: 1;
	}
	.photo-card:hover .preview-icon {
		opacity: 1;
	}
	.preview-icon:hover {
		background: rgba(0, 0, 0, 0.8);
	}
	.photo-label {
		font-size: 0.8rem;
		color: var(--color-text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex: 1;
	}
	.search-bar {
		padding: 8px 12px;
		border-bottom: 1px solid var(--color-border);
		background: var(--color-surface);
		flex-shrink: 0;
	}
	.search-input {
		width: 100%;
		padding: 8px 12px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: 0.9rem;
		font-family: inherit;
		outline: none;
		transition: border-color 0.15s;
	}
	.search-input:focus {
		border-color: var(--color-primary);
		box-shadow: 0 0 0 3px rgba(40, 167, 69, 0.15);
	}
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
	.assign-bar span {
		font-size: 0.85rem;
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
			min-height: calc(100vh - 160px); /* topbar + page header + margins */
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
		.photo-list {
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
