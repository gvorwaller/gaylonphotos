<script>
	import { goto, invalidateAll } from '$app/navigation';

	let { data } = $props();

	let username = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let error = $state('');
	let loading = $state(false);

	let isSetup = $derived(!data.adminExists);

	let passwordMismatch = $derived(
		isSetup && confirmPassword.length > 0 && password !== confirmPassword
	);
	let passwordTooShort = $derived(
		isSetup && password.length > 0 && password.length < 8
	);

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

			const result = await res.json();

			if (!res.ok) {
				error = result.error || 'Login failed';
				password = '';
				return;
			}

			await invalidateAll();
			await goto('/admin');
		} catch {
			error = 'Network error. Please try again.';
		} finally {
			loading = false;
		}
	}

	async function handleSetup(e) {
		e.preventDefault();
		error = '';

		if (password.length < 8) {
			error = 'Password must be at least 8 characters';
			return;
		}
		if (password !== confirmPassword) {
			error = 'Passwords do not match';
			return;
		}

		loading = true;

		try {
			const res = await fetch('/api/auth/setup', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ username, password, confirmPassword })
			});

			const result = await res.json();

			if (!res.ok) {
				if (result.error === 'Admin already configured') {
					await invalidateAll();
				}
				error = result.error || 'Setup failed';
				password = '';
				confirmPassword = '';
				return;
			}

			await goto('/admin');
		} catch {
			error = 'Network error. Please try again.';
		} finally {
			loading = false;
		}
	}
</script>

<div class="login-page">
	<div class="login-card">
		{#if isSetup}
			<h1>Create Admin Account</h1>
			<p class="setup-hint">No admin account exists yet. Create one to get started.</p>
			<form onsubmit={handleSetup}>
				{#if error}
					<div class="login-error">{error}</div>
				{/if}
				<label class="login-field">
					<span>Username</span>
					<input type="text" bind:value={username} required autocomplete="username" />
				</label>
				<label class="login-field">
					<span>Password</span>
					<input
						type="password"
						bind:value={password}
						required
						minlength="8"
						autocomplete="new-password"
					/>
					{#if passwordTooShort}
						<span class="field-hint field-hint-error">Must be at least 8 characters</span>
					{/if}
				</label>
				<label class="login-field">
					<span>Confirm Password</span>
					<input
						type="password"
						bind:value={confirmPassword}
						required
						autocomplete="new-password"
					/>
					{#if passwordMismatch}
						<span class="field-hint field-hint-error">Passwords do not match</span>
					{/if}
				</label>
				<button
					type="submit"
					class="btn btn-primary login-submit"
					disabled={loading || passwordMismatch || passwordTooShort}
				>
					{loading ? 'Creating...' : 'Create Account'}
				</button>
			</form>
		{:else}
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
		{/if}
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
	.setup-hint {
		color: var(--color-text-muted);
		font-size: 0.875rem;
		text-align: center;
		margin-bottom: 24px;
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
	.field-hint {
		display: block;
		font-size: 0.8rem;
		margin-top: 4px;
	}
	.field-hint-error {
		color: var(--color-danger);
	}
	.login-submit {
		width: 100%;
		margin-top: 8px;
		padding: 12px;
		font-size: 1rem;
		justify-content: center;
	}
</style>
