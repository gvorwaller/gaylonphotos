<script>
	/**
	 * Travel collection map showing itinerary stops and photo locations.
	 * Props: photos (with GPS), stops, apiKey
	 */
	import Map from '$lib/components/common/Map.svelte';

	let {
		photos = [],
		stops = [],
		apiKey = '',
		onboundschange = null,
		ancestryPlaces = [],
		showAncestry = false,
		collectionSlug = '',
		ancestry = null,
		gotoTarget = null
	} = $props();

	// Use globalThis.Map — `Map` is shadowed by the Map.svelte component import
	let personMap = $derived(new globalThis.Map((ancestry?.persons || []).map((p) => [p.id, p])));

	// Root person first names for lineage badges (index 0 = primary import, index 1 = merged "wife-*" import)
	let primaryName = $derived(ancestry?.meta?.rootPersonNames?.[0]?.split(' ')[0] || '');
	let mergedName = $derived(ancestry?.meta?.rootPersonNames?.[1]?.split(' ')[0] || '');

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

	const IW = 'font-family:system-ui,-apple-system,sans-serif;font-size:13px;color:#212529;max-height:280px;overflow-y:auto;line-height:1.4;';

	function buildAncestryInfoHtml(place) {
		let html = `<div style="${IW}">`;
		html += `<div style="font-weight:700;margin-bottom:4px;">${esc(place.name)}</div>`;
		if (place.country) html += `<div style="color:#6c757d;font-size:12px;margin-bottom:6px;">${esc(place.country)}</div>`;
		if (place.nearStop) {
			html += `<span style="display:inline-block;background:#e8f5e9;color:#2e7d32;font-size:11px;padding:1px 6px;border-radius:4px;margin-bottom:6px;">Visited</span>`;
		}
		const events = (place.events || []).slice().sort((a, b) => (a.year || 9999) - (b.year || 9999));
		const show = events.slice(0, 8);
		if (show.length > 0) {
			html += `<div style="border-top:1px solid #e9ecef;padding-top:4px;margin-top:4px;">`;
			for (const evt of show) {
				const person = personMap.get(evt.personId);
				const icon = eventIcon(evt.type);
				let name = esc(evt.personName || 'Unknown');
				if (person?.fsId) {
					name = `<a href="https://www.familysearch.org/tree/person/details/${encodeURIComponent(person.fsId)}" target="_blank" rel="noopener" style="color:#28a745;text-decoration:none;">${name}</a>`;
				}
				const lineageLabel = person?.lineage?.startsWith('wife-') ? mergedName : primaryName;
				const lineageBadge = lineageLabel ? ` <span style="font-size:10px;color:#fff;background:${person?.lineage?.startsWith('wife-') ? '#d946ef' : '#6366f1'};padding:0 4px;border-radius:3px;vertical-align:middle;">${esc(lineageLabel)}</span>` : '';
				html += `<div style="margin-bottom:3px;">${icon} <strong>${name}</strong>${lineageBadge} &mdash; ${esc(evt.type)}${evt.year ? ', ' + esc(String(evt.year)) : ''}</div>`;
			}
			if (events.length > 8) {
				html += `<div style="color:#6c757d;font-size:12px;margin-top:2px;">and ${events.length - 8} more&hellip;</div>`;
			}
			html += `</div>`;
		}
		html += `</div>`;
		return html;
	}

	function buildStopInfoHtml(stop) {
		let html = `<div style="${IW}">`;
		html += `<div style="font-weight:700;margin-bottom:4px;">${esc(stop.city || 'Stop')}</div>`;
		if (stop.country) html += `<div style="color:#6c757d;font-size:12px;margin-bottom:6px;">${esc(stop.country)}</div>`;
		const dates = formatDateRange(stop.arrivalDate, stop.departureDate);
		if (dates) html += `<div style="margin-bottom:4px;">${dates}</div>`;
		if (stop.notes) {
			const truncated = stop.notes.length > 150 ? stop.notes.slice(0, 150) + '\u2026' : stop.notes;
			html += `<div style="color:#6c757d;font-size:12px;margin-top:4px;">${esc(truncated)}</div>`;
		}
		html += `</div>`;
		return html;
	}

	function buildPhotoInfoHtml(photo) {
		const thumbUrl = photo.thumbnail || photo.url;
		const href = `/${encodeURIComponent(collectionSlug)}/photo/${encodeURIComponent(photo.id)}`;
		let html = `<div style="${IW}">`;
		if (thumbUrl) {
			html += `<a href="${esc(href)}" style="display:block;margin-bottom:6px;"><img src="${esc(thumbUrl)}" alt="${esc(photo.description || photo.filename || '')}" style="width:120px;border-radius:4px;"></a>`;
		}
		if (photo.description) html += `<div style="margin-bottom:4px;">${esc(photo.description)}</div>`;
		if (photo.date) {
			html += `<div style="color:#6c757d;font-size:12px;">${esc(formatDate(photo.date))}</div>`;
		}
		html += `</div>`;
		return html;
	}

	function handleMarkerClick({ id }) {
		if (id.startsWith('ancestry-')) {
			const place = ancestryPlaces.find((p) => p.id === id.slice(9));
			if (place) return { content: buildAncestryInfoHtml(place), zoomLevel: 11 };
		} else if (id.startsWith('stop-')) {
			const stop = stops.find((s) => String(s.id) === id.slice(5));
			if (stop) return { content: buildStopInfoHtml(stop), zoomLevel: 12 };
		} else if (id.startsWith('photo-')) {
			const photo = photos.find((p) => p.id === id.slice(6));
			if (photo) return { content: buildPhotoInfoHtml(photo), zoomLevel: 13 };
		}
		return null;
	}

	/** Escape HTML entities for safe injection into InfoWindow */
	function esc(str) {
		if (str == null) return '';
		return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
	}

	function formatDate(dateStr) {
		if (!dateStr) return '';
		try {
			return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
		} catch {
			return dateStr;
		}
	}

	function formatDateRange(arrival, departure) {
		if (!arrival && !departure) return '';
		const a = formatDate(arrival);
		const d = formatDate(departure);
		if (a && d) return `${esc(a)} &ndash; ${esc(d)}`;
		return esc(a) || esc(d);
	}

	let markers = $derived.by(() => {
		const m = [];

		// Stop markers (numbered; green for main, orange for side trips)
		for (let i = 0; i < stops.length; i++) {
			const s = stops[i];
			if (s.lat != null && s.lng != null && (s.lat !== 0 || s.lng !== 0)) {
				m.push({
					lat: s.lat,
					lng: s.lng,
					id: `stop-${s.id}`,
					label: `${i + 1}. ${s.city}`,
					color: s.sideTrip ? '#e67e22' : '#28a745'
				});
			}
		}

		// Photo markers (blue circles)
		for (const p of photos) {
			if (p.gps) {
				m.push({
					lat: p.gps.lat,
					lng: p.gps.lng,
					id: `photo-${p.id}`,
					label: p.description || p.filename,
					color: '#4a90d9'
				});
			}
		}

		// Ancestry markers (purple diamonds)
		if (showAncestry) {
			for (const place of ancestryPlaces) {
				if (place.lat != null && place.lng != null) {
					const count = place.events?.length || 0;
					m.push({
						lat: place.lat,
						lng: place.lng,
						id: `ancestry-${place.id}`,
						label: `${place.name} (${count} event${count !== 1 ? 's' : ''})`,
						color: '#8B5CF6',
						shape: 'diamond'
					});
				}
			}
		}

		return m;
	});

	function hasGps(s) {
		return s.lat != null && s.lng != null && (s.lat !== 0 || s.lng !== 0);
	}

	let routePolylines = $derived.by(() => {
		const hasSideTrips = stops.some((s) => s.sideTrip);
		if (!hasSideTrips) {
			// No side trips — single green polyline (same as before)
			const path = stops.filter(hasGps).map((s) => ({ lat: s.lat, lng: s.lng }));
			return path.length >= 2 ? [{ path, color: '#28a745' }] : [];
		}

		// Main route: only non-side-trip stops
		const mainStops = stops.filter((s) => !s.sideTrip);
		const mainPath = mainStops.filter(hasGps).map((s) => ({ lat: s.lat, lng: s.lng }));
		const result = mainPath.length >= 2 ? [{ path: mainPath, color: '#28a745' }] : [];

		// Side-trip routes: group consecutive side-trip stops by parentStopId
		const stopById = new globalThis.Map(stops.map((s) => [s.id, s]));
		let i = 0;
		while (i < stops.length) {
			if (stops[i].sideTrip && stops[i].parentStopId != null) {
				const parentId = stops[i].parentStopId;
				const parent = stopById.get(parentId);
				const group = [];
				while (i < stops.length && stops[i].sideTrip && stops[i].parentStopId === parentId) {
					group.push(stops[i]);
					i++;
				}
				const sidePath = [];
				if (parent && hasGps(parent)) sidePath.push({ lat: parent.lat, lng: parent.lng });
				for (const s of group) {
					if (hasGps(s)) sidePath.push({ lat: s.lat, lng: s.lng });
				}
				if (parent && hasGps(parent)) sidePath.push({ lat: parent.lat, lng: parent.lng });
				if (sidePath.length >= 2) {
					result.push({ path: sidePath, color: '#e67e22', dashed: true });
				}
			} else {
				i++;
			}
		}

		return result;
	});
</script>

<div class="itinerary-map">
	<Map
		{apiKey}
		center={{ lat: 55, lng: 15 }}
		zoom={4}
		markers={markers}
		polylines={routePolylines}
		{onboundschange}
		infoWindowEnabled={true}
		onmarkerclick={handleMarkerClick}
		searchable={true}
		{gotoTarget}
	/>
</div>

<style>
	.itinerary-map {
		height: 450px;
		border-radius: var(--radius-lg);
		overflow: hidden;
		border: 1px solid var(--color-border);
	}
</style>
