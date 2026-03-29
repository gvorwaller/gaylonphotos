#!/usr/bin/env node
/**
 * One-time migration: swap primary/wife identity in ancestry.json.
 *
 * Before: Madonna = primary (no prefix), Gaylon = wife-* prefix
 * After:  Gaylon = primary (no prefix), Madonna = wife-* prefix
 *
 * Gaylon is the husband; Madonna is the wife. The original import order
 * was backwards (Madonna imported first).
 *
 * Usage: node scripts/swap-ancestry-roots.js
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const FILES = [
	'data/scandinavia-2023/ancestry.json',
	'data-prod/scandinavia-2023/ancestry.json'
];

for (const relPath of FILES) {
	const filePath = resolve(relPath);
	console.log(`\nProcessing: ${relPath}`);

	const data = JSON.parse(readFileSync(filePath, 'utf-8'));

	// ── Swap rootPersonIds and rootPersonNames ──
	if (data.meta.rootPersonIds?.length === 2) {
		data.meta.rootPersonIds.reverse();
		console.log(`  rootPersonIds swapped: ${data.meta.rootPersonIds}`);
	}
	if (data.meta.rootPersonNames?.length === 2) {
		data.meta.rootPersonNames.reverse();
		console.log(`  rootPersonNames swapped: ${data.meta.rootPersonNames}`);
	}

	// ── Transform persons ──
	let swappedToPrimary = 0;   // was wife-* (Gaylon), becoming primary
	let swappedToWife = 0;      // was primary (Madonna), becoming wife-*

	for (const p of data.persons) {
		if (p.lineage && p.lineage.startsWith('wife-')) {
			// Gaylon's ancestors: remove wife- prefix → becomes primary
			p.lineage = p.lineage.slice(5); // 'wife-'.length === 5

			// lineagePath: "Wife's father's mother" → "Father's mother"
			// or "Wife" → "Self"
			if (p.lineagePath === 'Wife') {
				p.lineagePath = 'Self';
			} else if (p.lineagePath.startsWith("Wife's ")) {
				const rest = p.lineagePath.slice(7); // "Wife's ".length === 7
				p.lineagePath = rest.charAt(0).toUpperCase() + rest.slice(1);
			}

			// ID: "wife_33947744" → "@33947744@"
			if (p.id.startsWith('wife_')) {
				p.id = `@${p.id.slice(5)}@`;
			}

			swappedToPrimary++;
		} else {
			// Madonna's ancestors: add wife- prefix → becomes wife
			if (p.lineage) {
				p.lineage = `wife-${p.lineage}`;
			}

			// lineagePath: "Father" → "Wife's father"
			// or "Self" → "Wife"
			if (p.lineagePath === 'Self') {
				p.lineagePath = 'Wife';
			} else if (p.lineagePath) {
				p.lineagePath = "Wife's " + p.lineagePath.charAt(0).toLowerCase() + p.lineagePath.slice(1);
			}

			// ID: "@2614864@" → "wife_2614864"
			if (p.id.startsWith('@') && p.id.endsWith('@')) {
				p.id = `wife_${p.id.slice(1, -1)}`;
			}

			swappedToWife++;
		}
	}

	console.log(`  Persons: ${swappedToPrimary} → primary (Gaylon), ${swappedToWife} → wife (Madonna)`);

	// ── Swap personId references in places[].events[] ──
	let eventSwaps = 0;
	for (const place of (data.places || [])) {
		for (const evt of (place.events || [])) {
			if (evt.personId?.startsWith('wife_')) {
				// was Gaylon's → restore @xref@ format
				evt.personId = `@${evt.personId.slice(5)}@`;
				eventSwaps++;
			} else if (evt.personId?.startsWith('@') && evt.personId?.endsWith('@')) {
				// was Madonna's → add wife_ prefix
				evt.personId = `wife_${evt.personId.slice(1, -1)}`;
				eventSwaps++;
			}
		}
	}
	console.log(`  Event personId refs swapped: ${eventSwaps}`);

	// ── Swap familyLines ──
	if (data.familyLines) {
		for (const line of data.familyLines) {
			if (line.id.startsWith('wife-')) {
				// was Gaylon's, becomes primary
				line.id = line.id.slice(5);
				line.label = line.label
					.replace(/^Wife's /, '')
					.replace(/^Wife \(/, '(')
					.replace(/^Wife$/, 'Self');
			} else {
				// was Madonna's, becomes wife-prefixed
				line.id = `wife-${line.id}`;
				if (line.label === 'Self') {
					line.label = 'Wife';
				} else if (line.label.startsWith('(')) {
					line.label = `Wife ${line.label}`;
				} else {
					line.label = `Wife's ${line.label}`;
				}
			}
		}
		console.log(`  familyLines swapped:`, data.familyLines.map(l => l.id));
	}

	// ── Write back ──
	writeFileSync(filePath, JSON.stringify(data, null, '\t') + '\n');
	console.log(`  Written: ${filePath}`);
}

console.log('\nDone. Verify with: npm run dev');
