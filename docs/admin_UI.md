# Plan: Admin Nav Link + Web-Based Admin Setup

## Context
Currently, accessing admin requires knowing to navigate to `/admin/login` manually, and creating admin credentials requires running a CLI script (`node scripts/setup-admin.js`). This plan adds a visible Admin link in the public nav bar and a web-based first-time setup flow so everything stays in the browser.

## Changes

### 1. Add "Admin" link to the public nav bar
**File:** `src/routes/+layout.svelte`

- Add an "Admin" link on the right side of the `.nav-inner` flex container
- If `data.user` is set (logged in): link text = "Admin" → `/admin`
- If not logged in: link text = "Admin" → `/admin/login`
- Style: subtle, muted color, same weight as brand but smaller font. No special icon.

### 2. Add `adminExists` flag to root layout data
**File:** `src/routes/+layout.server.js`

- Add a check: try `readJson('data/admin.json')` — if it succeeds, `adminExists = true`; if it throws, `adminExists = false`
- Return `adminExists` alongside existing `user` and `googleMapsApiKey`
- Import `readJson` from `$lib/server/json-store.js`

### 3. Add web-based admin setup to the login page
**File:** `src/routes/admin/login/+page.svelte`

- Add a `+page.server.js` that passes `adminExists` from the parent layout data (or re-checks directly)
- If `!adminExists`: show a "Create Admin Account" form instead of the login form
  - Fields: username, password, confirm password
  - Client-side validation: password min 8 chars, passwords must match
  - Submits to `POST /api/auth/setup`
  - On success: auto-login (the setup endpoint returns a session token) → redirect to `/admin`
- If `adminExists`: show the existing login form (no change)

### 4. Add setup API endpoint
**File:** `src/routes/api/auth/setup/+server.js` (new)

- `POST /api/auth/setup` — creates admin credentials
- Guard: if `data/admin.json` already exists, return 403 "Admin already configured"
- Validate: username non-empty, password >= 8 chars, password === confirmPassword
- Hash password with bcryptjs (cost 12), write `{ username, passwordHash }` to `data/admin.json`
- Auto-login: create session token (reuse `verifyCredentials` or directly create session), set cookie
- Return `{ success: true }`

### 5. Export `createAdmin` from auth module
**File:** `src/lib/server/auth.js`

- Add `createAdmin(username, password)` function:
  - Check if `data/admin.json` exists — if so, throw
  - Hash with bcryptjs, write via `writeJson`
  - Create session and return `{ token }`
- This keeps credential creation logic in one place (auth module), not scattered in the API route

### 6. Exempt setup route from auth in hooks
**File:** `src/hooks.server.js`

- Add `/api/auth/setup` to the exemption alongside `/api/auth` for both the auth check and CSRF check (setup must work when unauthenticated and no admin exists)

## Files Modified
- `src/routes/+layout.svelte` — add Admin link
- `src/routes/+layout.server.js` — add `adminExists` check
- `src/routes/admin/login/+page.svelte` — dual-mode: setup form vs login form
- `src/routes/admin/login/+page.server.js` — new, passes `adminExists`
- `src/routes/api/auth/setup/+server.js` — new, setup endpoint
- `src/lib/server/auth.js` — add `createAdmin()` export
- `src/hooks.server.js` — exempt setup route

## Verification
1. Delete `data/admin.json` to test setup flow
2. Navigate to `localhost:5174` — "Admin" link visible in nav bar
3. Click "Admin" → redirected to `/admin/login` → shows "Create Admin Account" form
4. Create account → auto-redirected to `/admin` dashboard
5. Log out → "Admin" link now goes to login form (not setup form)
6. Verify `data/admin.json` exists with bcrypt hash
7. Verify hitting `POST /api/auth/setup` again returns 403
8. Run `npm run build` — clean, no warnings
