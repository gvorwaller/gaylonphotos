<script>
	/**
	 * Full-screen help overlay with friendly tips for using the app.
	 * Props: show, onclose
	 */
	let { show = false, onclose = null } = $props();

	function handleKeydown(e) {
		if (e.key === 'Escape' && show) onclose?.();
	}

	function handleOverlayClick(e) {
		if (e.target === e.currentTarget) onclose?.();
	}

	let openSection = $state('browsing');

	function toggle(section) {
		openSection = openSection === section ? null : section;
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if show}
	<div class="help-overlay" role="button" tabindex="0" aria-label="Close help" onclick={handleOverlayClick} onkeydown={handleOverlayClick}>
		<div class="help-panel" role="dialog" aria-modal="true" aria-label="How to Use This Site">
			<div class="help-header">
				<h2>How to Use This Site</h2>
				<button class="help-close" onclick={onclose} aria-label="Close">&times;</button>
			</div>

			<div class="help-intro">
				<p>Welcome! This site is a collection of family photos, travel memories, and more. Here are some tips to help you explore.</p>
			</div>

			<div class="help-sections">

				<!-- Browsing & Navigation -->
				<button class="section-toggle" class:open={openSection === 'browsing'} onclick={() => toggle('browsing')}>
					<span class="section-icon">&#x1f4f7;</span>
					<span class="section-title">Browsing Photos</span>
					<span class="chevron">{openSection === 'browsing' ? '▾' : '▸'}</span>
				</button>
				{#if openSection === 'browsing'}
					<div class="section-body">
						<ul>
							<li><strong>Home page</strong> — The main page shows all available photo collections. Tap any collection card to open it.</li>
							<li><strong>Menu</strong> — Tap the ☰ menu button (top left) to jump to any collection at any time.</li>
							<li><strong>Viewing a photo</strong> — Tap any photo thumbnail to open it full-size in the viewer.</li>
							<li><strong>Next / Previous</strong> — In the photo viewer, use the arrow buttons on each side to flip through photos. On a phone or tablet, you can also <strong>swipe left or right</strong>.</li>
							<li><strong>Close the viewer</strong> — Tap the <strong>✕</strong> in the corner, or press <strong>Escape</strong> on a keyboard.</li>
							<li><strong>Photo details</strong> — Below the full-size photo you'll see information like the date, camera, and location (when available).</li>
							<li><strong>Favorites</strong> — Photos marked with a ★ star are personal favorites.</li>
						</ul>
					</div>
				{/if}

				<!-- Maps -->
				<button class="section-toggle" class:open={openSection === 'maps'} onclick={() => toggle('maps')}>
					<span class="section-icon">&#x1f5fa;</span>
					<span class="section-title">Using the Maps</span>
					<span class="chevron">{openSection === 'maps' ? '▾' : '▸'}</span>
				</button>
				{#if openSection === 'maps'}
					<div class="section-body">
						<ul>
							<li><strong>Zoom in / out</strong> — Pinch on a touchscreen, or use the + / − buttons. On a computer, scroll your mouse wheel.</li>
							<li><strong>Move around</strong> — Drag the map with your finger or mouse to pan to a different area.</li>
							<li><strong>Tap a marker</strong> — Map markers show a popup with a photo preview and details. Tap it to learn more.</li>
							<li><strong>Filter by Map</strong> — On some pages you'll see a "Filter by Map" button above the photo grid. Turn it on, then pan and zoom the map — the photos below will update to show only what's visible on the map.</li>
							<li><strong>Show Family Heritage</strong> — On travel collections, check the <strong>"Show Family Heritage"</strong> box (top right, above the map) to overlay colored diamond markers showing where ancestors lived. See the <em>Family Heritage Panel</em> section below for full details.</li>
							<li><strong>Map styles</strong> — Use the map type control to switch between road map, satellite, and terrain views.</li>
						</ul>
					</div>
				{/if}

				<!-- Travel Collections -->
				<button class="section-toggle" class:open={openSection === 'travel'} onclick={() => toggle('travel')}>
					<span class="section-icon">&#x2708;</span>
					<span class="section-title">Travel Collections</span>
					<span class="chevron">{openSection === 'travel' ? '▾' : '▸'}</span>
				</button>
				{#if openSection === 'travel'}
					<div class="section-body">
						<ul>
							<li><strong>Journey Map</strong> — Shows the travel route with stops and photo locations plotted on the map.</li>
							<li><strong>Timeline</strong> — Below the map, photos are organized by each stop on the trip, in chronological order. Each stop shows the city, dates, and a sample of photos.</li>
							<li><strong>Show Family Heritage</strong> — On travel collections, check the "Show Family Heritage" box above the map to see colored diamond markers where ancestors lived. More on this below!</li>
						</ul>
					</div>
				{/if}

				<!-- Family Heritage (the big one) -->
				<button class="section-toggle" class:open={openSection === 'family'} onclick={() => toggle('family')}>
					<span class="section-icon">&#x1f333;</span>
					<span class="section-title">Family Heritage Panel</span>
					<span class="chevron">{openSection === 'family' ? '▾' : '▸'}</span>
				</button>
				{#if openSection === 'family'}
					<div class="section-body">
						<p class="section-intro">On travel collections, you'll find a <strong>Family Heritage</strong> section below the timeline. This connects the places visited on the trip to ancestors who lived there. Here's how to use it:</p>

						<h4>Opening the Panel</h4>
						<ul>
							<li>Tap the <strong>Family Heritage</strong> header bar to expand or collapse the panel.</li>
							<li>The header shows a quick summary — how many ancestors and places are connected to the current map view.</li>
						</ul>

						<h4>The Four Tabs</h4>
						<p class="tab-intro">Inside the panel, there are four different ways to explore your family history:</p>

						<div class="tab-card">
							<strong>By Place</strong>
							<p>Groups ancestors by where they lived. Each place card shows who was born, married, or lived there, along with the year. Tap a person's name to see their full details. If you see a <span class="inline-badge visited">Visited</span> badge, it means the trip passed through that location.</p>
						</div>
						<div class="tab-card">
							<strong>By Family Line</strong>
							<p>Separates ancestors into father's side and mother's side (and spouse's lines, if available). Each person shows their lifespan, where they lived, and how they connect to the family. Color-coded dots indicate which line they belong to.</p>
						</div>
						<div class="tab-card">
							<strong>By Generation</strong>
							<p>Organizes ancestors by how far back they go — parents, grandparents, great-grandparents, and so on. Tap a generation heading to expand or collapse it.</p>
						</div>
						<div class="tab-card">
							<strong>Family Tree</strong>
							<p>A visual tree diagram showing how ancestors connect. Use the <strong>depth slider</strong> to show more or fewer generations. If both husband and wife ancestry data is available, you can switch between the two family trees using the toggle at the top.</p>
							<p><strong>Focus on an ancestor:</strong> Use the <strong>"Focus on an ancestor..."</strong> search box below the tree controls to find a specific person. Tap their name in the dropdown to <strong>re-root the tree</strong> on that person — the tree will show only their direct ancestors, making it much easier to explore a single family line (especially on a phone). A yellow chip shows who you're focused on; tap the <strong>✕</strong> to return to the full tree.</p>
						</div>

						<h4>Searching for Someone</h4>
						<ul>
							<li>Use the <strong>search box</strong> at the top of the panel to find a specific ancestor by name or place. Matching names are highlighted across all tabs.</li>
							<li>By default, search looks within the current map view. Tap <strong>"All"</strong> to search across all ancestors regardless of the map.</li>
							<li>On the <strong>Family Tree</strong> tab, there's a separate <strong>"Focus on an ancestor..."</strong> field that lets you re-root the entire tree on one person — great for exploring your own branch of the family.</li>
						</ul>

						<h4>Connecting to the Map</h4>
						<ul>
							<li>Tap the <strong>📍 map button</strong> next to any person or place to fly the map to that location.</li>
							<li>Turning on "Show Family Heritage" above the main map displays colored diamond markers for each ancestor's location.</li>
							<li>As you pan and zoom the map, the panel automatically updates to show only the ancestors in the visible area.</li>
						</ul>

						<h4>FamilySearch Links</h4>
						<ul>
							<li>Many ancestors have a small <strong>FS</strong> link next to their name. Tapping it opens their record on FamilySearch.org, where you can learn even more.</li>
						</ul>

						<h4>Color Key</h4>
						<div class="color-key">
							<div class="color-row"><span class="dot paternal"></span> Father's line (paternal)</div>
							<div class="color-row"><span class="dot maternal"></span> Mother's line (maternal)</div>
							<div class="color-row"><span class="dot wife-paternal"></span> Wife's father's line</div>
							<div class="color-row"><span class="dot wife-maternal"></span> Wife's mother's line</div>
						</div>
					</div>
				{/if}

				<!-- Wildlife Collections -->
				<button class="section-toggle" class:open={openSection === 'wildlife'} onclick={() => toggle('wildlife')}>
					<span class="section-icon">&#x1f426;</span>
					<span class="section-title">Wildlife Collections</span>
					<span class="chevron">{openSection === 'wildlife' ? '▾' : '▸'}</span>
				</button>
				{#if openSection === 'wildlife'}
					<div class="section-body">
						<ul>
							<li><strong>Sightings Map</strong> — Shows where each species was photographed. Each species has its own marker color.</li>
							<li><strong>Species Grid</strong> — Tap a species card to filter the photo gallery to show only that species. Tap "Show All" to go back.</li>
							<li><strong>Search</strong> — Use the search box in the species panel to quickly find a specific animal.</li>
						</ul>
					</div>
				{/if}

				<!-- Action Collections -->
				<button class="section-toggle" class:open={openSection === 'action'} onclick={() => toggle('action')}>
					<span class="section-icon">&#x1f3c4;</span>
					<span class="section-title">Action Collections</span>
					<span class="chevron">{openSection === 'action' ? '▾' : '▸'}</span>
				</button>
				{#if openSection === 'action'}
					<div class="section-body">
						<ul>
							<li><strong>Spots Map</strong> — Shows all the locations ("spots") where photos were taken.</li>
							<li><strong>Spot Cards</strong> — Tap a marker on the map to see the spot name and a sample photo. The page scrolls to that spot's photos below.</li>
						</ul>
					</div>
				{/if}

			</div>

			<div class="help-footer">
				<p>Tap the <strong>✕</strong> or press <strong>Escape</strong> to close this screen.</p>
			</div>
		</div>
	</div>
{/if}

<style>
	.help-overlay {
		position: fixed;
		inset: 0;
		z-index: 200;
		background: rgba(0, 0, 0, 0.4);
		display: flex;
		justify-content: center;
		align-items: flex-start;
		padding: 24px;
		overflow-y: auto;
	}

	.help-panel {
		background: var(--color-surface);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-card-hover);
		max-width: 620px;
		width: 100%;
		margin: 24px auto;
		padding: 28px 28px 20px;
		animation: help-slide-up 0.25s ease;
	}

	@keyframes help-slide-up {
		from { opacity: 0; transform: translateY(20px); }
		to { opacity: 1; transform: translateY(0); }
	}

	.help-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 8px;
	}
	.help-header h2 {
		font-size: 1.25rem;
		font-weight: 700;
	}
	.help-close {
		background: none;
		border: none;
		font-size: 1.6rem;
		cursor: pointer;
		color: var(--color-text-muted);
		padding: 0 4px;
		line-height: 1;
	}
	.help-close:hover {
		color: var(--color-text);
	}

	.help-intro {
		color: var(--color-text-muted);
		font-size: 0.9rem;
		margin-bottom: 20px;
		line-height: 1.6;
	}

	/* Accordion toggles */
	.section-toggle {
		display: flex;
		align-items: center;
		width: 100%;
		padding: 12px 14px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface);
		cursor: pointer;
		font-size: 0.95rem;
		font-weight: 600;
		font-family: inherit;
		color: var(--color-text);
		margin-bottom: 6px;
		transition: background 0.15s, border-color 0.15s;
		text-align: left;
		gap: 10px;
	}
	.section-toggle:hover {
		background: rgba(0, 0, 0, 0.02);
	}
	.section-toggle.open {
		border-color: var(--color-primary);
		background: rgba(40, 167, 69, 0.04);
		border-bottom-left-radius: 0;
		border-bottom-right-radius: 0;
		margin-bottom: 0;
	}
	.section-icon {
		font-size: 1.1rem;
		flex-shrink: 0;
		width: 24px;
		text-align: center;
	}
	.section-title {
		flex: 1;
	}
	.chevron {
		font-size: 0.8rem;
		color: var(--color-text-muted);
		flex-shrink: 0;
	}

	/* Accordion body */
	.section-body {
		border: 1px solid var(--color-primary);
		border-top: none;
		border-radius: 0 0 var(--radius-md) var(--radius-md);
		padding: 16px 18px;
		margin-bottom: 6px;
		background: rgba(40, 167, 69, 0.02);
		font-size: 0.88rem;
		line-height: 1.7;
		color: var(--color-text);
	}
	.section-body ul {
		list-style: none;
		padding: 0;
	}
	.section-body ul li {
		padding: 4px 0 4px 20px;
		position: relative;
	}
	.section-body ul li::before {
		content: '•';
		position: absolute;
		left: 4px;
		color: var(--color-primary);
		font-weight: 700;
	}
	.section-body p {
		margin-bottom: 10px;
	}

	.section-intro {
		color: var(--color-text-muted);
		font-style: italic;
	}

	.section-body h4 {
		font-size: 0.9rem;
		font-weight: 700;
		margin: 16px 0 6px;
		color: var(--color-text);
	}
	.section-body h4:first-of-type {
		margin-top: 8px;
	}

	.tab-intro {
		margin-bottom: 8px;
	}

	/* Tab description cards */
	.tab-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		padding: 10px 14px;
		margin-bottom: 8px;
	}
	.tab-card strong {
		display: block;
		margin-bottom: 4px;
		font-size: 0.88rem;
	}
	.tab-card p {
		margin: 0;
		color: var(--color-text-muted);
		font-size: 0.84rem;
		line-height: 1.6;
	}

	.inline-badge {
		display: inline-block;
		font-size: 0.72rem;
		font-weight: 600;
		padding: 1px 6px;
		border-radius: var(--radius-pill);
		vertical-align: middle;
	}
	.inline-badge.visited {
		background: #e8f5e9;
		color: #2e7d32;
	}

	/* Color key */
	.color-key {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 6px 16px;
		margin-top: 6px;
	}
	.color-row {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.82rem;
		color: var(--color-text-muted);
	}
	.dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		flex-shrink: 0;
	}
	.dot.paternal { background: var(--color-line-paternal); }
	.dot.maternal { background: var(--color-line-maternal); }
	.dot.wife-paternal { background: var(--color-line-wife-paternal); }
	.dot.wife-maternal { background: var(--color-line-wife-maternal); }

	/* Footer */
	.help-footer {
		margin-top: 16px;
		padding-top: 12px;
		border-top: 1px solid var(--color-border);
		text-align: center;
		font-size: 0.8rem;
		color: var(--color-text-muted);
	}

	/* Mobile */
	@media (max-width: 480px) {
		.help-overlay {
			padding: 12px;
		}
		.help-panel {
			padding: 20px 16px 16px;
			margin: 12px auto;
		}
		.help-header h2 {
			font-size: 1.1rem;
		}
		.color-key {
			grid-template-columns: 1fr;
		}
	}
</style>
