#!/usr/bin/env node
/**
 * Interactive CLI script runner.
 * Lists all project scripts, prompts for parameters, and executes the selected one.
 *
 * Usage: node scripts/run.js
 */

import { createInterface } from 'readline';
import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

// ── Script Registry ─────────────────────────────────────────────────

const SCRIPTS = [
	{
		file: 'bulk-reverse-geocode.js',
		description: 'Add place names to GPS-tagged photos',
		params: [
			{ name: 'collection', type: 'collection' },
			{ name: '--prod', type: 'flag', description: 'Use production API key' },
			{ name: '--dry-run', type: 'flag', description: 'Preview without writing changes' },
		],
	},
	{
		file: 'delete-collection-photos.js',
		description: 'Remove all photos from a collection',
		dangerous: true,
		params: [
			{ name: 'collection', type: 'collection' },
		],
	},
	{
		file: 'ingest-photos.js',
		description: 'Import photos from a local folder',
		params: [
			{ name: 'collection', type: 'collection' },
			{ name: 'folder', type: 'path', description: 'Source folder (default: photos/<slug>/)' },
		],
	},
	{
		file: 'ai-geocode-ancestry.js',
		description: 'Geocode ancestry places via Google API',
		params: [
			{ name: 'collection', type: 'collection' },
			{ name: '--dry-run', type: 'flag', description: 'Preview without writing changes' },
			{ name: '--status', type: 'optional-value', description: 'Target status (e.g. ai-estimate, failed)' },
		],
	},
	{
		file: 'family-geocode-ancestry.js',
		description: 'Estimate ancestry coords from family context',
		params: [
			{ name: 'collection', type: 'collection' },
			{ name: '--dry-run', type: 'flag', description: 'Preview without writing changes' },
		],
	},
	{
		file: 'itinerary-locate.js',
		description: 'Tag unlocated photos with itinerary stop coordinates',
		params: [
			{ name: 'collection', type: 'collection' },
			{ name: '--prod', type: 'flag', description: 'Read from / write to production' },
			{ name: '--dry-run', type: 'flag', description: 'Preview without writing changes' },
		],
	},
	{
		file: 'setup-admin.js',
		description: 'Create/update admin credentials',
		params: [],
	},
	{
		file: 'deploy-to-DO.sh',
		description: 'Push and deploy to gaylon.photos',
		dangerous: true,
		params: [],
	},
	{
		file: 'sync-prod-data.sh',
		description: 'Pull production data locally',
		params: [],
	},
	{
		file: 'sync-collection.sh',
		description: 'Copy collection JSON between dev and prod',
		params: [
			{ name: 'collection', type: 'collection' },
			{ name: 'direction', type: 'path', description: 'push (dev→prod) or pull (prod→dev)' },
			{ name: 'file-type', type: 'path', description: 'photos, itinerary, ancestry, or all (default: all)' },
			{ name: '--force', type: 'flag', description: 'Skip newer-file safety check' },
		],
	},
	{
		file: 'vision-standalone.js',
		description: 'Bird species identification (module, not standalone)',
		params: [
			{ name: 'image', type: 'path', description: 'Path to image file' },
		],
	},
];

// ── Helpers ──────────────────────────────────────────────────────────

function loadCollections() {
	try {
		const raw = readFileSync(resolve(PROJECT_ROOT, 'data/collections.json'), 'utf8');
		return JSON.parse(raw).collections || [];
	} catch {
		return [];
	}
}

function prompt(rl, question) {
	return new Promise((resolve) => {
		rl.question(question, (answer) => resolve(answer.trim()));
	});
}

function isShellScript(file) {
	return file.endsWith('.sh');
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
	const rl = createInterface({ input: process.stdin, output: process.stdout });

	// Graceful Ctrl+C
	rl.on('close', () => {
		console.log('\nBye!');
		process.exit(0);
	});

	let running = true;
	while (running) {
		// Show menu
		console.log('\n  Scripts\n  -------');
		for (let i = 0; i < SCRIPTS.length; i++) {
			const s = SCRIPTS[i];
			const warn = s.dangerous ? ' [!!]' : '';
			console.log(`  ${String(i + 1).padStart(2)}) ${s.file}${warn}`);
			console.log(`      ${s.description}`);
		}
		console.log(`\n   0) Exit\n`);

		const choice = await prompt(rl, 'Pick a script: ');
		const idx = parseInt(choice, 10);

		if (choice === '0' || choice.toLowerCase() === 'q') break;
		if (isNaN(idx) || idx < 1 || idx > SCRIPTS.length) {
			console.log('Invalid choice.');
			continue;
		}

		const script = SCRIPTS[idx - 1];
		const args = [];

		// Collect parameters
		for (const param of script.params) {
			if (param.type === 'collection') {
				const collections = loadCollections();
				if (collections.length === 0) {
					console.log('No collections found in data/collections.json');
					break;
				}
				console.log('\n  Collections:');
				for (let i = 0; i < collections.length; i++) {
					console.log(`    ${i + 1}) ${collections[i].name} (${collections[i].slug})`);
				}
				const pick = await prompt(rl, '  Collection #: ');
				const ci = parseInt(pick, 10);
				if (isNaN(ci) || ci < 1 || ci > collections.length) {
					console.log('Invalid collection.');
					args.length = 0;
					break;
				}
				args.push(collections[ci - 1].slug);
			} else if (param.type === 'path') {
				const desc = param.description ? ` (${param.description})` : '';
				const val = await prompt(rl, `  ${param.name}${desc}: `);
				if (val) args.push(val);
			} else if (param.type === 'flag') {
				const desc = param.description ? ` — ${param.description}` : '';
				const val = await prompt(rl, `  ${param.name}${desc}? [y/N]: `);
				if (val.toLowerCase() === 'y' || val.toLowerCase() === 'yes') {
					args.push(param.name);
				}
			} else if (param.type === 'optional-value') {
				const desc = param.description ? ` (${param.description})` : '';
				const val = await prompt(rl, `  ${param.name}${desc} [blank to skip]: `);
				if (val) {
					args.push(param.name, val);
				}
			}
		}

		// If param collection broke out early
		if (script.params.length > 0 && args.length === 0 && script.params[0].type === 'collection') {
			continue;
		}

		// Dangerous confirmation
		if (script.dangerous) {
			console.log(`\n  !! WARNING: "${script.file}" is a destructive operation.`);
			const confirm = await prompt(rl, '  Type YES to proceed: ');
			if (confirm !== 'YES') {
				console.log('  Cancelled.');
				continue;
			}
		}

		// Build command
		const scriptPath = resolve(__dirname, script.file);
		let cmd, cmdArgs;
		if (isShellScript(script.file)) {
			cmd = 'bash';
			cmdArgs = [scriptPath, ...args];
		} else {
			cmd = 'node';
			cmdArgs = [scriptPath, ...args];
		}

		// Show and confirm
		const display = [cmd, ...cmdArgs.map(a => a.includes(' ') ? `"${a}"` : a)].join(' ');
		console.log(`\n  > ${display}`);
		const go = await prompt(rl, '  Run this command? [y/N]: ');
		if (go.toLowerCase() !== 'y' && go.toLowerCase() !== 'yes') {
			console.log('  Skipped.');
			continue;
		}

		// Execute
		console.log('');
		const exitCode = await new Promise((resolve) => {
			const child = spawn(cmd, cmdArgs, {
				stdio: 'inherit',
				cwd: PROJECT_ROOT,
			});
			child.on('error', (err) => {
				console.error(`  Failed to start: ${err.message}`);
				resolve(1);
			});
			child.on('close', (code) => resolve(code ?? 0));
		});

		if (exitCode === 0) {
			console.log('\n  Done (exit 0)');
		} else {
			console.log(`\n  Exited with code ${exitCode}`);
		}

		const again = await prompt(rl, '  Run another? [Y/n]: ');
		if (again.toLowerCase() === 'n' || again.toLowerCase() === 'no') {
			running = false;
		}
	}

	rl.close();
}

main();
