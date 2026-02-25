<script>
	/**
	 * Reusable modal dialog.
	 * Props: title, show, onclose
	 * Slots: default (body), actions (footer buttons)
	 */
	let { title = '', show = false, onclose = null, children, actions } = $props();

	function handleKeydown(e) {
		if (e.key === 'Escape' && show) {
			onclose?.();
		}
	}

	function handleOverlayClick(e) {
		if (e.target === e.currentTarget) {
			onclose?.();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if show}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="modal-overlay" onclick={handleOverlayClick}>
		<div class="modal-content" role="dialog" aria-modal="true" aria-label={title}>
			<div class="modal-header">
				<h3>{title}</h3>
				<button class="modal-close" onclick={onclose} aria-label="Close">&times;</button>
			</div>
			<div class="modal-body">
				{@render children?.()}
			</div>
			{#if actions}
				<div class="modal-actions">
					{@render actions()}
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 16px;
	}
	.modal-header h3 {
		font-size: 1.1rem;
		font-weight: 700;
		margin: 0;
	}
	.modal-close {
		background: none;
		border: none;
		font-size: 1.5rem;
		cursor: pointer;
		color: var(--color-text-muted);
		padding: 0 4px;
		line-height: 1;
	}
	.modal-close:hover {
		color: var(--color-text);
	}
	.modal-body {
		margin-bottom: 16px;
	}
</style>
