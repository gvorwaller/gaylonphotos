<script>
	import { goto } from '$app/navigation';

	let username = $state('');
	let password = $state('');
	let error = $state('');
	let loading = $state(false);

	async function handleLogin(e) {
		e.preventDefault();
		error = '';
		loading = true;

		try {
			const res = await fetch('/api/auth', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ username, password })
			});

			const data = await res.json();

			if (!res.ok) {
				error = data.error || 'Login failed';
				return;
			}

			goto('/admin');
		} catch {
			error = 'Network error. Please try again.';
		} finally {
			loading = false;
		}
	}
</script>

<div class="login-page">
	<div class="login-card">
		<h1>Admin Login</h1>
		<form onsubmit={handleLogin}>
			{#if error}
				<div class="login-error">{error}</div>
			{/if}
			<label class="login-field">
				<span>Username</span>
				<input type="text" bind:value={username} required autocomplete="username" />
			</label>
			<label class="login-field">
				<span>Password</span>
				<input type="password" bind:value={password} required autocomplete="current-password" />
			</label>
			<button type="submit" class="btn btn-primary login-submit" disabled={loading}>
				{loading ? 'Signing in...' : 'Sign In'}
			</button>
		</form>
	</div>
</div>

<style>
	.login-page {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		padding: 24px;
	}
	.login-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: 40px;
		width: 100%;
		max-width: 400px;
		box-shadow: var(--shadow-card);
	}
	.login-card h1 {
		font-size: 1.5rem;
		font-weight: 700;
		margin-bottom: 24px;
		text-align: center;
	}
	.login-error {
		background: #fdf0f0;
		color: var(--color-danger);
		padding: 10px 14px;
		border-radius: var(--radius-sm);
		font-size: 0.875rem;
		margin-bottom: 16px;
	}
	.login-field {
		display: block;
		margin-bottom: 16px;
	}
	.login-field span {
		display: block;
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--color-text-muted);
		margin-bottom: 6px;
	}
	.login-field input {
		width: 100%;
		padding: 10px 14px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: 0.95rem;
		font-family: inherit;
		transition: border-color 0.15s;
	}
	.login-field input:focus {
		outline: none;
		border-color: var(--color-primary);
		box-shadow: 0 0 0 3px rgba(40, 167, 69, 0.15);
	}
	.login-submit {
		width: 100%;
		margin-top: 8px;
		padding: 12px;
		font-size: 1rem;
		justify-content: center;
	}
</style>
