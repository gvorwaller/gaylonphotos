import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

function stripInvalidRollupOutputOptions() {
	function strip(output) {
		if (!output || typeof output !== 'object') return;
		if ('codeSplitting' in output) {
			delete output.codeSplitting;
		}
	}

	return {
		name: 'strip-invalid-rollup-output-options',
		configResolved(config) {
			const buildOutput = config.build?.rollupOptions?.output;
			if (Array.isArray(buildOutput)) {
				for (const output of buildOutput) strip(output);
			} else {
				strip(buildOutput);
			}

			const workerOutput = config.worker?.rollupOptions?.output;
			if (Array.isArray(workerOutput)) {
				for (const output of workerOutput) strip(output);
			} else {
				strip(workerOutput);
			}
		}
	};
}

export default defineConfig({
	plugins: [sveltekit(), stripInvalidRollupOutputOptions()],
	server: {
		port: 5174,
		host: true // Expose to LAN for mobile/tablet testing
	}
});
