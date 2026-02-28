<script>
	/**
	 * Animated hamburger/X toggle button.
	 * Props: open, onclick, ariaLabel, ariaControls
	 */
	let { open = false, onclick = null, ariaLabel = '', ariaControls = '' } = $props();
</script>

<button
	class="hamburger"
	aria-label={ariaLabel || (open ? 'Close menu' : 'Open menu')}
	aria-expanded={open}
	aria-controls={ariaControls || undefined}
	{onclick}
>
	<span class="hamburger-line" class:open></span>
	<span class="hamburger-line" class:open></span>
	<span class="hamburger-line" class:open></span>
</button>

<style>
	.hamburger {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 5px;
		width: 36px;
		height: 36px;
		padding: 6px;
		background: none;
		border: none;
		cursor: pointer;
		border-radius: var(--radius-sm);
	}
	.hamburger:hover {
		background: rgba(0, 0, 0, 0.05);
	}
	.hamburger-line {
		display: block;
		width: 100%;
		height: 2px;
		background: var(--color-text);
		border-radius: 1px;
		transition: transform 0.25s ease, opacity 0.25s ease;
		transform-origin: center;
	}
	.hamburger-line.open:nth-child(1) {
		transform: translateY(7px) rotate(45deg); /* gap(5px) + line-height(2px) */
	}
	.hamburger-line.open:nth-child(2) {
		opacity: 0;
	}
	.hamburger-line.open:nth-child(3) {
		transform: translateY(-7px) rotate(-45deg); /* -(gap + line-height) */
	}
</style>
