#!/usr/bin/env node

/**
 * Creates or updates admin credentials in data/admin.json.
 * Usage: node scripts/setup-admin.js
 * Prompts for username and password interactively.
 */

import { createInterface } from 'node:readline';
import { writeFile, mkdir } from 'node:fs/promises';
import bcrypt from 'bcrypt';

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
