<script>
	import '../styles/global.css';
	import { currentUser } from '$lib/stores.js';

	let { data, children } = $props();

	$effect(() => {
		currentUser.set(data.user);
	});
</script>

{@render children()}
