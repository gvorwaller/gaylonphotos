#!/usr/bin/env node

const { spawnSync } = require('child_process');
const { loadEnv } = require('./load-env.cjs');

const [, , command, ...args] = process.argv;

if (!command) {
	console.error('Usage: node scripts/with-env.cjs <command> [...args]');
	process.exit(2);
}

loadEnv({ root: process.cwd() });

const result = spawnSync(command, args, {
	stdio: 'inherit',
	shell: process.platform === 'win32',
	env: process.env
});

if (result.error) {
	console.error(result.error.message);
	process.exit(1);
}

process.exit(result.status ?? 0);
