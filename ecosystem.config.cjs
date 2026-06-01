const { loadEnv } = require('./scripts/load-env.cjs');

const root = __dirname;
const envFile = loadEnv({ root });

module.exports = {
	apps: [
		{
			name: 'gaylonphotos',
			script: 'build/index.js',
			env: {
				...envFile,
				NODE_ENV: 'production',
				BODY_SIZE_LIMIT: 'Infinity' // Nginx enforces 55MB; disable SvelteKit's 512KB default
			}
		}
	]
};
