<script>
	/**
	 * SVG pedigree chart for one ancestry root.
	 * Compact occupied-branch layout (left-to-right: root → ancestors).
	 * Tree structure reconstructed from lineagePath strings.
	 */

	let {
		persons = [],
		maxGen = 5,
		selectedId = null,
		searchQuery = '',
		searchGlobal = false,
		visibleIds = new Set(),
		locatedIds = new Set(),
		selectedRoot = 'primary',
		onselect = () => {},
		ongoto = () => {}
	} = $props();

	// ─── Layout constants ───────────────────────────
	const NODE_HEIGHT = 52;
	const GEN_GAP = 36;
	const ROW_GAP = 10;
	const OUTER_PAD = 12;

	// ─── Responsive node width ──────────────────────
	let nodeWidth = $state(160);

	$effect(() => {
		function update() {
			if (window.matchMedia('(max-width: 480px)').matches) nodeWidth = 120;
			else if (window.matchMedia('(max-width: 767px)').matches) nodeWidth = 140;
			else nodeWidth = 160;
		}
		update();
		const mql1 = window.matchMedia('(max-width: 480px)');
		const mql2 = window.matchMedia('(max-width: 767px)');
		mql1.addEventListener('change', update);
		mql2.addEventListener('change', update);
		return () => {
			mql1.removeEventListener('change', update);
			mql2.removeEventListener('change', update);
		};
	});

	// ─── Helpers ────────────────────────────────────
	const VALID_LINEAGES = new Set([
		'paternal', 'maternal', 'self', 'both',
		'wife-paternal', 'wife-maternal', 'wife-self', 'wife-both'
	]);

	function safeLineageColor(lineage) {
		return VALID_LINEAGES.has(lineage) ? `var(--color-line-${lineage}, #6c757d)` : '#6c757d';
	}

	function lifespan(person) {
		const parts = [];
		if (person.birthYear) parts.push(`b. ${person.birthYear}`);
		if (person.deathYear) parts.push(`d. ${person.deathYear}`);
		return parts.join(' \u2013 ') || '';
	}

	function branchKeyFromLineagePath(path, rootLbl) {
		if (!path || path === rootLbl) return 'root';

		let remainder = path;
		if (path.startsWith(rootLbl + "'s ")) {
			remainder = path.slice((rootLbl + "'s ").length);
		}

		const tokens = remainder.split("'s ").map((t) => t.toLowerCase());
		const valid = tokens.filter((t) => t === 'father' || t === 'mother');

		if (valid.length !== tokens.length) {
			console.warn(`Unexpected lineagePath tokens in "${path}": got [${tokens}], expected only father/mother`);
		}

		if (valid.length === 0) return 'root';
		return ['root', ...valid.map((t) => (t === 'father' ? 'f' : 'm'))].join('.');
	}

	function truncName(name, width) {
		if (!name) return '';
		const max = Math.floor((width - 18) / 6.2);
		if (name.length <= max) return name;
		return name.slice(0, max - 1) + '\u2026';
	}

	// ─── Root label ─────────────────────────────────
	let rootLabel = $derived(selectedRoot === 'primary' ? 'Self' : 'Wife');

	// ─── Build nodes ────────────────────────────────
	let nodes = $derived.by(() => {
		const q = searchQuery?.toLowerCase() || '';
		return persons
			.filter((p) => p.generation <= maxGen)
			.map((p) => {
				const bk = branchKeyFromLineagePath(p.lineagePath, rootLabel);
				const parts = bk.split('.');
				const parentKey = parts.length > 1 ? parts.slice(0, -1).join('.') : null;
				const lastSeg = parts[parts.length - 1];
				const side = parts.length === 1 ? 'root' : lastSeg === 'f' ? 'father' : 'mother';
				return {
					id: p.id,
					person: p,
					generation: p.generation,
					branchKey: bk,
					parentKey,
					side,
					shared: p.lineage === 'both' || p.lineage === 'wife-both',
					inViewport: visibleIds.has(p.id),
					matchesSearch: q
						? p.name.toLowerCase().includes(q) ||
							(p.facts || []).some((f) => f.place && f.place.toLowerCase().includes(q))
						: false
				};
			});
	});

	// ─── Layout computation ─────────────────────────
	let layout = $derived.by(() => {
		if (!nodes.length)
			return { positioned: [], connectors: [], svgW: 0, svgH: 0 };

		// Index by branchKey
		const byKey = new Map();
		for (const n of nodes) byKey.set(n.branchKey, n);

		// Build children map
		const childrenOf = new Map();
		for (const n of nodes) {
			if (n.parentKey && byKey.has(n.parentKey)) {
				if (!childrenOf.has(n.parentKey)) childrenOf.set(n.parentKey, []);
				childrenOf.get(n.parentKey).push(n);
			}
		}
		// Sort children: father before mother
		for (const [, ch] of childrenOf) {
			ch.sort((a, b) => (a.side === 'father' ? -1 : 1) - (b.side === 'father' ? -1 : 1));
		}

		// DFS to assign compact Y rows (leaf-first)
		let leafRow = 0;
		const yRow = new Map();

		function assignY(key) {
			const ch = childrenOf.get(key);
			if (!ch || ch.length === 0) {
				yRow.set(key, leafRow);
				leafRow++;
				return leafRow - 1;
			}
			const childYs = ch.map((c) => assignY(c.branchKey));
			const my = (Math.min(...childYs) + Math.max(...childYs)) / 2;
			yRow.set(key, my);
			return my;
		}

		if (byKey.has('root')) assignY('root');

		// Handle orphan nodes (parent missing from data)
		for (const n of nodes) {
			if (!yRow.has(n.branchKey)) {
				yRow.set(n.branchKey, leafRow);
				leafRow++;
			}
		}

		const colW = nodeWidth + GEN_GAP;
		const rowH = NODE_HEIGHT + ROW_GAP;
		const svgW = (maxGen + 1) * colW + OUTER_PAD * 2;
		const svgH = Math.max(leafRow, 1) * rowH + OUTER_PAD * 2;

		const positioned = nodes.map((n) => ({
			...n,
			x: OUTER_PAD + n.generation * colW,
			y: OUTER_PAD + (yRow.get(n.branchKey) ?? 0) * rowH
		}));

		// Build connector paths
		const posMap = new Map();
		for (const n of positioned) posMap.set(n.branchKey, n);

		const connectors = [];
		for (const n of positioned) {
			if (n.parentKey) {
				const parent = posMap.get(n.parentKey);
				if (parent) {
					const prx = parent.x + nodeWidth;
					const pcy = parent.y + NODE_HEIGHT / 2;
					const clx = n.x;
					const ccy = n.y + NODE_HEIGHT / 2;
					const mx = (prx + clx) / 2;
					connectors.push({
						key: `${parent.branchKey}>${n.branchKey}`,
						d: `M ${prx},${pcy} H ${mx} V ${ccy} H ${clx}`,
						lineage: n.person.lineage
					});
				}
			}
		}

		return { positioned, connectors, svgW, svgH };
	});

	// ─── Hidden search matches (beyond maxGen) ──────
	let hiddenMatches = $derived.by(() => {
		if (!searchQuery) return 0;
		const q = searchQuery.toLowerCase();
		return persons.filter(
			(p) =>
				p.generation > maxGen &&
				(p.name.toLowerCase().includes(q) ||
					(p.facts || []).some((f) => f.place && f.place.toLowerCase().includes(q)))
		).length;
	});

	// ─── Root person name for aria ──────────────────
	let rootPersonName = $derived(nodes.find((n) => n.branchKey === 'root')?.person?.name || 'Unknown');

	function handleKey(e, id) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			onselect(id);
		}
	}
</script>

<div class="pedigree-wrapper">
	{#if layout.positioned.length === 0}
		<p class="pedigree-empty">No ancestors to display.</p>
	{:else}
		<svg
			width={layout.svgW}
			height={layout.svgH}
			viewBox="0 0 {layout.svgW} {layout.svgH}"
			role="img"
			aria-label="Pedigree chart for {rootPersonName}"
			class="pedigree-svg"
		>
			<!-- Connectors -->
			{#each layout.connectors as c (c.key)}
				<path
					d={c.d}
					fill="none"
					stroke={safeLineageColor(c.lineage)}
					stroke-width="1.5"
					opacity="0.35"
				/>
			{/each}

			<!-- Nodes -->
			{#each layout.positioned as node (node.id)}
				{@const isSelected = selectedId === node.id}
				{@const suppressMuting = searchGlobal && searchQuery}
				{@const isMuted = !suppressMuting && !node.inViewport && !isSelected}
				{@const isMatch = node.matchesSearch}
				<g
					class="pedigree-node"
					class:muted={isMuted}
					class:selected={isSelected}
					class:search-match={isMatch}
					transform="translate({node.x}, {node.y})"
					role="button"
					tabindex="0"
					aria-label="{node.person.name}, {lifespan(node.person)}, {node.person.lineagePath}"
					onclick={() => onselect(node.id)}
					onkeydown={(e) => handleKey(e, node.id)}
				>
					<title>{node.person.name} — {node.person.lineagePath}</title>
					<rect
						width={nodeWidth}
						height={NODE_HEIGHT}
						rx="6"
						ry="6"
						class="node-rect"
						class:shared={node.shared}
					/>
					<!-- Lineage color stripe -->
					<rect
						x="0"
						y="4"
						width="4"
						height={NODE_HEIGHT - 8}
						rx="2"
						fill={safeLineageColor(node.person.lineage)}
					/>
					<text x="12" y="21" class="node-name" dominant-baseline="middle">
						{truncName(node.person.name, nodeWidth)}
					</text>
					<text x="12" y="39" class="node-lifespan" dominant-baseline="middle">
						{lifespan(node.person)}
					</text>
					{#if locatedIds.has(node.id)}
						<g
							class="node-map-btn"
							transform="translate({nodeWidth - 28}, 4)"
							onclick={(e) => { e.stopPropagation(); ongoto(node.person); }}
							onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); ongoto(node.person); } }}
							role="button"
							tabindex="0"
							aria-label="Show {node.person.name} on map"
						>
							<rect width="24" height="16" rx="3" class="map-btn-bg" />
							<text x="12" y="12" text-anchor="middle" class="map-btn-text">Map</text>
						</g>
					{/if}
				</g>
			{/each}
		</svg>
	{/if}
</div>

{#if hiddenMatches > 0}
	<div class="hidden-match-hint">
		{hiddenMatches} match{hiddenMatches !== 1 ? 'es' : ''} in deeper generations &mdash; increase depth to see {hiddenMatches !== 1 ? 'them' : 'it'}
	</div>
{/if}

<style>
	.pedigree-wrapper {
		overflow: auto;
		-webkit-overflow-scrolling: touch;
		max-height: min(70vh, 700px);
		border: 1px solid var(--color-border-light);
		border-radius: var(--radius-sm);
		background: var(--color-bg);
	}
	.pedigree-empty {
		color: var(--color-text-muted);
		font-size: 0.85rem;
		text-align: center;
		padding: 24px;
	}
	.pedigree-svg {
		display: block;
	}

	/* ─── Node ───────────────────────────────────── */
	.node-rect {
		fill: #fff;
		stroke: var(--color-border);
		stroke-width: 1;
		transition: filter 0.15s;
	}
	.node-rect.shared {
		stroke-dasharray: 4 2;
	}
	.pedigree-node {
		cursor: pointer;
		outline: none;
	}
	.pedigree-node:hover .node-rect,
	.pedigree-node:focus-visible .node-rect {
		filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.12));
	}
	.pedigree-node:focus-visible .node-rect {
		stroke: var(--color-primary);
		stroke-width: 2;
	}
	.pedigree-node.selected .node-rect {
		stroke: var(--color-primary);
		stroke-width: 2;
	}
	.pedigree-node.search-match .node-rect {
		fill: #fefce8;
		stroke: #ca8a04;
		stroke-width: 1.5;
	}
	.pedigree-node.muted {
		opacity: 0.4;
	}
	.node-name {
		font-size: 11px;
		font-weight: 600;
		fill: var(--color-text, #333);
		font-family: system-ui, -apple-system, sans-serif;
	}
	.node-lifespan {
		font-size: 9px;
		fill: var(--color-text-muted, #6c757d);
		font-family: system-ui, -apple-system, sans-serif;
	}

	/* ─── Map button ─────────────────────────────── */
	.node-map-btn {
		cursor: pointer;
		outline: none;
	}
	.map-btn-bg {
		fill: #e8f5e9;
		stroke: #a5d6a7;
		stroke-width: 0.5;
		transition: fill 0.1s;
	}
	.node-map-btn:hover .map-btn-bg,
	.node-map-btn:focus-visible .map-btn-bg {
		fill: #c8e6c9;
		stroke: #66bb6a;
	}
	.map-btn-text {
		font-size: 8px;
		font-weight: 700;
		fill: #388e3c;
		font-family: system-ui, -apple-system, sans-serif;
	}

	/* ─── Hidden match hint ──────────────────────── */
	.hidden-match-hint {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		text-align: center;
		padding: 6px 12px;
		background: #fefce8;
		border: 1px solid #fde68a;
		border-radius: var(--radius-sm);
		margin-top: 8px;
	}
</style>
