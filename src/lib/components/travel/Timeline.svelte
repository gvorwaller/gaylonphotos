<script>
	/**
	 * Vertical timeline grouped by itinerary stops.
	 * Props: photos, stops
	 */
	let { photos = [], stops = [], collectionSlug = '' } = $props();

	// Group photos by closest stop (by date range or proximity)
	let groupedStops = $derived.by(() => {
		const groups = stops.map((stop) => ({
			stop,
			photos: [],
			sideTrips: [] // child side-trip groups nested under their parent
		}));

		// Build lookup: stop id → index in groups array
		const idxById = new globalThis.Map(stops.map((s, i) => [s.id, i]));

		// Nest side-trip groups under their parent stop
		for (let i = 0; i < groups.length; i++) {
			const s = groups[i].stop;
			if (s.sideTrip && s.parentStopId != null) {
				const parentIdx = idxById.get(s.parentStopId);
				if (parentIdx != null) {
					groups[parentIdx].sideTrips.push(groups[i]);
				}
			}
		}

		// Simple grouping: assign each photo to the closest stop by date
		for (const photo of photos) {
			if (!photo.date) continue;
			const photoDate = new Date(photo.date);
			let bestIdx = 0;
			let bestDist = Infinity;

			for (let i = 0; i < stops.length; i++) {
				const arrival = stops[i].arrivalDate ? new Date(stops[i].arrivalDate) : null;
				const departure = stops[i].departureDate ? new Date(stops[i].departureDate) : null;

				if (arrival && departure && photoDate >= arrival && photoDate <= departure) {
					bestIdx = i;
					bestDist = 0;
					break;
				}

				const refDate = arrival || departure;
				if (refDate) {
					const dist = Math.abs(photoDate - refDate);
					if (dist < bestDist) {
						bestDist = dist;
						bestIdx = i;
					}
				}
			}

			if (groups[bestIdx]) {
				groups[bestIdx].photos.push(photo);
			}
		}

		// Return only top-level stops (side trips are nested inside their parent's sideTrips array)
		return groups.filter((g) => !g.stop.sideTrip);
	});

	function formatDateRange(arrival, departure) {
		const opts = { month: 'short', day: 'numeric' };
		const a = arrival ? new Date(arrival).toLocaleDateString('en-US', opts) : null;
		const d = departure ? new Date(departure).toLocaleDateString('en-US', opts) : null;
		if (a && d) return `${a} – ${d}`;
		return a || d || '';
	}
</script>

<div class="timeline">
	{#each groupedStops as group, idx (group.stop.id)}
		<div class="timeline-item">
			<div class="timeline-marker">
				<div class="marker-dot"></div>
				{#if idx < groupedStops.length - 1 || group.sideTrips.length > 0}
					<div class="marker-line"></div>
				{/if}
			</div>

			<div class="timeline-content">
				<div class="timeline-header">
					<h3>{group.stop.city}, {group.stop.country}</h3>
					<span class="timeline-dates">
						{formatDateRange(group.stop.arrivalDate, group.stop.departureDate)}
					</span>
				</div>

				{#if group.stop.notes}
					<p class="timeline-notes">{group.stop.notes}</p>
				{/if}

				{#if group.photos.length > 0}
					<div class="timeline-photos">
						{#each group.photos.slice(0, 6) as photo (photo.id)}
							<a href="/{collectionSlug}/photo/{photo.id}" class="timeline-thumb">
								<img src={photo.thumbnail} alt={photo.description || photo.filename} loading="lazy" />
							</a>
						{/each}
						{#if group.photos.length > 6}
							<span class="more-count">+{group.photos.length - 6}</span>
						{/if}
					</div>
				{/if}

				{#if group.sideTrips.length > 0}
					<div class="side-trips">
						{#each group.sideTrips as st (st.stop.id)}
							<div class="timeline-item side-trip-item">
								<div class="timeline-marker">
									<div class="marker-dot side-trip-dot"></div>
									{#if group.sideTrips.indexOf(st) < group.sideTrips.length - 1}
										<div class="marker-line side-trip-line"></div>
									{/if}
								</div>
								<div class="timeline-content">
									<div class="timeline-header">
										<h3>{st.stop.city}, {st.stop.country}</h3>
										<span class="side-trip-badge">Side Trip</span>
										<span class="timeline-dates">
											{formatDateRange(st.stop.arrivalDate, st.stop.departureDate)}
										</span>
									</div>
									{#if st.stop.notes}
										<p class="timeline-notes">{st.stop.notes}</p>
									{/if}
									{#if st.photos.length > 0}
										<div class="timeline-photos">
											{#each st.photos.slice(0, 6) as photo (photo.id)}
												<a href="/{collectionSlug}/photo/{photo.id}" class="timeline-thumb">
													<img src={photo.thumbnail} alt={photo.description || photo.filename} loading="lazy" />
												</a>
											{/each}
											{#if st.photos.length > 6}
												<span class="more-count">+{st.photos.length - 6}</span>
											{/if}
										</div>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	{/each}
</div>

{#if stops.length === 0}
	<p class="timeline-empty">No itinerary stops defined yet.</p>
{/if}

<style>
	.timeline {
		display: flex;
		flex-direction: column;
		padding: 16px 0;
	}
	.timeline-item {
		display: flex;
		gap: 16px;
		min-height: 80px;
	}
	.timeline-marker {
		display: flex;
		flex-direction: column;
		align-items: center;
		flex-shrink: 0;
		width: 20px;
	}
	.marker-dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--color-primary);
		flex-shrink: 0;
		margin-top: 6px;
	}
	.marker-line {
		width: 2px;
		flex: 1;
		background: var(--color-primary);
		opacity: 0.3;
		margin-top: 4px;
	}
	.timeline-content {
		flex: 1;
		padding-bottom: 24px;
	}
	.timeline-header {
		display: flex;
		align-items: baseline;
		gap: 12px;
		flex-wrap: wrap;
	}
	.timeline-header h3 {
		font-size: 1rem;
		font-weight: 700;
	}
	.timeline-dates {
		font-size: 0.8rem;
		color: var(--color-text-muted);
	}
	.timeline-notes {
		font-size: 0.85rem;
		color: var(--color-text-muted);
		margin-top: 4px;
		line-height: 1.4;
	}
	.timeline-photos {
		display: flex;
		gap: 6px;
		margin-top: 12px;
		flex-wrap: wrap;
		align-items: center;
	}
	.timeline-thumb {
		width: 64px;
		height: 64px;
		border-radius: var(--radius-sm);
		overflow: hidden;
	}
	.timeline-thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.more-count {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		font-weight: 600;
	}
	.side-trips {
		margin-top: 12px;
		padding-left: 8px;
		border-left: 2px dashed #e67e22;
	}
	.side-trip-item {
		min-height: 60px;
	}
	.side-trip-dot {
		background: #e67e22;
	}
	.side-trip-line {
		background: #e67e22;
	}
	.side-trip-badge {
		font-size: 0.7rem;
		font-weight: 600;
		color: #e67e22;
		background: #fef3e2;
		padding: 1px 6px;
		border-radius: 4px;
	}
	.timeline-empty {
		text-align: center;
		color: var(--color-text-muted);
		padding: 32px 0;
	}
</style>
