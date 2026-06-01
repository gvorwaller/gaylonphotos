const fs = require('fs');
const path = require('path');

function parseEnvValue(value) {
	const trimmed = value.trim();
	if (trimmed.length < 2) return trimmed;

	const quote = trimmed[0];
	if ((quote !== '"' && quote !== "'") || trimmed[trimmed.length - 1] !== quote) {
		return trimmed;
	}

	const unquoted = trimmed.slice(1, -1);
	if (quote === "'") return unquoted;

	return unquoted
		.replace(/\\n/g, '\n')
		.replace(/\\r/g, '\r')
		.replace(/\\t/g, '\t')
		.replace(/\\"/g, '"')
		.replace(/\\\\/g, '\\');
}

function stripInlineComment(value) {
	let quote = null;
	for (let i = 0; i < value.length; i += 1) {
		const ch = value[i];
		if ((ch === '"' || ch === "'") && value[i - 1] !== '\\') {
			quote = quote === ch ? null : quote || ch;
		}
		if (ch === '#' && !quote && (i === 0 || /\s/.test(value[i - 1]))) {
			return value.slice(0, i);
		}
	}
	return value;
}

function parseEnvFile(filePath) {
	const env = {};
	if (!fs.existsSync(filePath)) return env;

	const content = fs.readFileSync(filePath, 'utf8');
	for (const rawLine of content.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith('#')) continue;

		const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
		if (!match) continue;

		const [, key, rawValue] = match;
		env[key] = parseEnvValue(stripInlineComment(rawValue));
	}

	return env;
}

function loadEnv(options = {}) {
	const root = options.root || process.cwd();
	const filePath = options.filePath || path.join(root, '.env');
	const parsed = parseEnvFile(filePath);

	for (const [key, value] of Object.entries(parsed)) {
		if (options.override || process.env[key] === undefined) {
			process.env[key] = value;
		}
	}

	return parsed;
}

module.exports = {
	loadEnv,
	parseEnvFile
};
