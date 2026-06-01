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
	import { geocodePlaceQuery, reverseGeocode } from '$lib/geocoding.js';
	import AdminPhotoLightbox from '$lib/components/admin/AdminPhotoLightbox.svelte';

	let { collectionSlug, photos = [], apiKey = '' } = $props();

	// Working copy of all photos (tagged + untagged in one list).
	// Mutations (assign GPS, clear GPS) update photos in place rather than moving them.
	let localAllPhotos = $state([]);
	let selectedIds = $state(new Set());
	let pendingCoords = $state(null);
	let assigning = $state(false);
	let error = $state('');
	let clearingGps = $state(false);

	// Re-sync when navigating to a different collection's geotag page
	$effect(() => {
		localAllPhotos = [...photos];
		selectedIds = new Set();
		pendingCoords = null;
	});

	let untaggedCount = $derived(localAllPhotos.filter((p) => p.gpsSource === null).length);
	let taggedCount = $derived(localAllPhotos.length - untaggedCount);

	// Place search
	let searchQuery = $state('');
	let searchError = $state('');
	let mapInstance = $state(null);

	function handleMapReady(map) {
		mapInstance = map;
	}

	async function handlePlaceSearch(e) {
		e.preventDefault();
		if (!mapInstance || !searchQuery.trim()) return;

		searchError = '';
		try {
			const result = await geocodePlaceQuery(searchQuery, apiKey);
			if (!result) {
				searchError = 'Place not found';
				return;
			}
			const { lat, lng, viewport } = result;
			if (viewport) {
				mapInstance.fitBounds(viewport);
			} else {
				mapInstance.setCenter({ lat, lng });
				mapInstance.setZoom(14);
			}
			pendingCoords = { lat, lng };
		} catch (err) {
			console.warn('Place search failed:', err);
			searchError = 'Search failed';
		}
	}

	// Markers: already-tagged photos (semi-transparent context) + pending preview
	let markers = $derived.by(() => {
		const m = [];

		// Already-tagged photos from the full collection
		for (const p of localAllPhotos) {
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
		// Default to selecting all untagged photos; if everything is already tagged,
		// select all photos (so the user can bulk-overwrite GPS).
		const untagged = localAllPhotos.filter((p) => p.gpsSource === null);
		const source = untagged.length > 0 ? untagged : localAllPhotos;
		selectedIds = new Set(source.map((p) => p.id));
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

			// Update photos in place (works for both new and overwritten GPS)
			localAllPhotos = localAllPhotos.map((p) =>
				selectedIds.has(p.id)
					? { ...p, gps: { lat: coords.lat, lng: coords.lng }, gpsSource: 'manual', locationName: null }
					: p
			);
			selectedIds = new Set();
			pendingCoords = null;

			// Backfill locationName in the background
			if (apiKey && coords) {
				reverseGeocode(coords.lat, coords.lng, apiKey).then(async (name) => {
					if (!name) return;
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
					localAllPhotos = localAllPhotos.map((p) =>
						assignedIds.includes(p.id) ? { ...p, locationName: name } : p
					);
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

	// ─── Marker click: show tagged photo with option to clear GPS ───
	function handleMarkerClick({ id }) {
		if (id === '__pending__') return null;
		const photo = localAllPhotos.find((p) => p.id === id);
		if (!photo) return null;
		const src = photo.thumbnail || '';
		const name = photo.filename || photo.id;
		const source = photo.gpsSource || 'unknown';
		return {
			content: `<div style="text-align:center;max-width:240px;">
				<img src="${src}" alt="${name}" style="width:200px;height:auto;border-radius:4px;" />
				<div style="margin:6px 0 4px;font-size:12px;font-weight:600;">${name}</div>
				<div style="font-size:11px;color:#6c757d;margin-bottom:6px;">Source: ${source}</div>
				<button onclick="window.__clearGeotagGps__('${id}')" style="background:#dc3545;color:#fff;border:none;padding:4px 12px;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600;">Clear GPS</button>
			</div>`,
			zoomLevel: null
		};
	}

	// Global callback for InfoWindow button (InfoWindow content is raw HTML).
	// Re-bind on every collectionSlug change so client-side navigation between
	// collections doesn't leave a stale slug captured in the closure.
	$effect(() => {
		if (typeof window === 'undefined') return;
		const slug = collectionSlug;
		window.__clearGeotagGps__ = async (photoId) => {
			if (clearingGps) return;
			clearingGps = true;
			const result = await apiPut('/api/photos', {
				collection: slug,
				photoId,
				updates: { gps: null, gpsSource: null, locationName: null }
			});
			clearingGps = false;
			if (result.ok) {
				// Update photo in place — it stays in the list but becomes untagged
				localAllPhotos = localAllPhotos.map((p) =>
					p.id === photoId ? { ...p, gps: null, gpsSource: null, locationName: null } : p
				);
			} else {
				error = result.error || 'Failed to clear GPS';
			}
		};
		return () => {
			if (window.__clearGeotagGps__) delete window.__clearGeotagGps__;
		};
	});
</script>

<div class="geotagger">
	<div class="geotagger-left">
		<div class="geotagger-toolbar">
			<span class="count">
				{untaggedCount} untagged · {taggedCount} tagged · {selectedCount} selected
			</span>
			<div class="toolbar-actions">
				<button class="btn btn-outline btn-sm" onclick={selectAll}>Select All</button>
				<button class="btn btn-outline btn-sm" onclick={clearSelection}>Clear</button>
			</div>
		</div>

		{#if error}
			<div class="geotagger-error">{error}</div>
		{/if}

		{#if localAllPhotos.length === 0}
			<div class="geotagger-done">
				No photos in this collection yet.
			</div>
		{:else}
			<div class="photo-list">
				{#each localAllPhotos as photo (photo.id)}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<div
						class="photo-card"
						class:selected={selectedIds.has(photo.id)}
						class:tagged={photo.gpsSource !== null}
						onclick={() => toggleSelect(photo.id)}
						role="button"
						tabindex="0"
					>
						<div class="thumb-wrap">
							<img src={photo.thumbnail} alt={photo.filename} loading="lazy" />
							{#if photo.gpsSource !== null}
								<span class="gps-dot" title="Has GPS ({photo.gpsSource})">&#x1F4CD;</span>
							{/if}
						</div>
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
		<form class="search-bar" onsubmit={handlePlaceSearch}>
			<div class="search-row">
				<input
					bind:value={searchQuery}
					type="text"
					class="search-input"
					placeholder="Search for a place..."
					autocomplete="off"
				/>
				<button type="submit" class="btn btn-outline btn-sm">Search</button>
			</div>
			{#if searchError}
				<div class="search-error">{searchError}</div>
			{/if}
		</form>
		<div class="map-area">
			<GoogleMap
				{apiKey}
				center={{ lat: 40, lng: -10 }}
				zoom={3}
				markers={markers}
				clickable={true}
				infoWindowEnabled={true}
				onmapclick={handleMapClick}
				onmarkerclick={handleMarkerClick}
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
		photos={localAllPhotos}
		{collectionSlug}
		onclose={() => previewPhoto = null}
		ondeleted={(id) => { localAllPhotos = localAllPhotos.filter(p => p.id !== id); previewPhoto = null; }}
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
	.thumb-wrap {
		position: relative;
		flex-shrink: 0;
	}
	.photo-card img {
		width: 120px;
		height: 80px;
		object-fit: cover;
		border-radius: 4px;
		flex-shrink: 0;
		display: block;
	}
	.gps-dot {
		position: absolute;
		bottom: 2px;
		left: 2px;
		background: rgba(40, 167, 69, 0.95);
		color: #fff;
		font-size: 0.65rem;
		padding: 1px 4px;
		border-radius: 3px;
		line-height: 1;
		pointer-events: none;
	}
	.photo-card.tagged {
		background: #fafffb;
	}
	.photo-card.tagged.selected {
		background: #d4edda;
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
		position: relative;
		z-index: 5;
	}
	.search-row {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	.search-input {
		flex: 1;
		min-width: 0;
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
	.search-error {
		margin-top: 6px;
		color: var(--color-danger);
		font-size: 0.8rem;
		font-weight: 600;
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
			/* dvh respects iOS Safari's dynamic viewport (URL bar shrinks) */
			min-height: 100dvh;
		}
		.geotagger-left {
			width: 100%;
			border-right: none;
			border-bottom: 1px solid var(--color-border);
			max-height: 35vh;
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
			display: flex;
			flex-direction: column;
			min-height: 55vh;
		}
		.map-area {
			flex: 1;
			min-height: 55vh;
		}
	}

	@media (max-width: 640px) {
		.geotagger-left {
			max-height: 30vh;
		}
		.geotagger-toolbar {
			padding: 8px 10px;
		}
		.search-bar {
			padding: 6px 10px;
		}
		.geotagger-right,
		.map-area {
			min-height: 60vh;
		}
	}
</style>
