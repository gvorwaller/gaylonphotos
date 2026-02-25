#!/usr/bin/env node

/**
 * Creates or updates admin credentials in data/admin.json.
 * Usage: node scripts/setup-admin.js
 * Prompts for username and password interactively.
 *
 * WARNING: Do not run while the server is active — this script writes
 * admin.json directly without the server's file locking. Stop the server
 * first, then restart it after running this script.
 */

import { createInterface } from 'node:readline';
import { writeFile, mkdir, access } from 'node:fs/promises';
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;
const ADMIN_FILE = 'data/admin.json';

function prompt(question) {
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	return new Promise((resolve) => {
		rl.question(question, (answer) => {
			rl.close();
			resolve(answer.trim());
		});
	});
}

async function main() {
	console.log('=== Gaylon Photos — Admin Setup ===\n');

	try {
		await access(ADMIN_FILE);
		const overwrite = await prompt('Admin credentials already exist. Overwrite? (y/N): ');
		if (overwrite.toLowerCase() !== 'y') {
			console.log('Aborted.');
			process.exit(0);
		}
	} catch {
		// File doesn't exist — proceed
	}

	const username = await prompt('Username: ');
	if (!username) {
		console.error('Error: username cannot be empty');
		process.exit(1);
	}

	const password = await prompt('Password: ');
	if (!password || password.length < 8) {
		console.error('Error: password must be at least 8 characters');
		process.exit(1);
	}

	const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

	await mkdir('data', { recursive: true });
	await writeFile(ADMIN_FILE, JSON.stringify({ username, passwordHash }, null, 2) + '\n');

	console.log(`\nAdmin credentials saved to ${ADMIN_FILE}`);
	console.log(`Username: ${username}`);
	console.log('Password: [hidden]');
}

main().catch((err) => {
	console.error('Setup failed:', err.message);
	process.exit(1);
});
