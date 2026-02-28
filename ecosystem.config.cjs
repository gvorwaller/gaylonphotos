module.exports = {
	apps: [
		{
			name: 'gaylonphotos',
			script: 'build/index.js',
			env: {
				NODE_ENV: 'production',
				BODY_SIZE_LIMIT: 'Infinity' // Nginx enforces 55MB; disable SvelteKit's 512KB default
			}
		}
	]
};
