# AI Assistant Session Guide

## Session Startup (Required)
1. Read `cs.md` (this file) — hard rules that override defaults
2. Read `CLAUDE.md` — project architecture and patterns
3. Check recent devlog entries in `docs/devlog/`
4. Run `td usage --new-session` to see current tasks

---

## Core Principles

### No Assumptions
- **Never guess** when you can verify — read source code, check config files, test directly
- **Never assume the user's environment** — don't guess what device, browser, or OS they're using
- **Never assume infrastructure details** — read deploy scripts, config files, and connection strings instead of guessing
- **State uncertainty explicitly** — if you must hypothesize, say so and ask for confirmation
- **Ask when uncertain** — one question is cheaper than one wrong assumption

### No Quick Fixes
- Find root causes, not band-aids
- Implement maintainable solutions
- If a fix requires multiple rounds, slow down and trace the data flow

### Evidence-Based Debugging (MANDATORY)
When diagnosing errors, follow this methodology instead of guessing:

1. **Read the relevant source code** before forming any hypothesis
2. **Trace the data flow** — client → API route → server module → response
3. **Test each layer independently** — use curl, direct file reads, or browser devtools
4. **Compare expected vs actual** at each boundary
5. **Never assume a cause** — verify with evidence first, then propose a fix

> "No guesses, only solid evidence, tracing the code carefully."

---

## Production Infrastructure

### DigitalOcean Droplet
- **SSH**: `ssh root@134.199.211.199`
- **App directory**: `/opt/gaylonphotos`
- **Process manager**: PM2 (NOT systemd)
  - Restart: `pm2 restart ecosystem.config.cjs --update-env`
  - Logs: `pm2 logs gaylonphotos --lines 30`
- **Domain**: `gaylon.photos` — proxied through Cloudflare (HTTP only, NOT SSH)
- **Deploy script**: `./scripts/deploy-to-DO.sh` — pushes, pulls on droplet, builds, restarts PM2

### Deploying
**Always use `./scripts/deploy-to-DO.sh` to deploy.** Never manually SSH and run build commands. The script handles push, pull, install, build, PM2 restart, and health check.

### Critical: SSH Is NOT the Domain
`gaylon.photos` resolves to Cloudflare IPs, not the droplet. **Always use the IP `134.199.211.199` for SSH.** The deploy script already does this correctly — follow its example.

### Sessions Are In-Memory
Admin sessions live in a Map in the Node process. Every PM2 restart (including deploy) clears all sessions. Users must re-login after deploy.

### Data Directory Is Gitignored
`data/` is not deployed via git. Production data files must be managed via SSH to the droplet. If you need to reset or modify production data, SSH to the droplet and edit files directly at `/opt/gaylonphotos/data/`.

---

## Project-Specific Rules

### Photo Upload Pipeline
- Apple Photos drag-and-drop provides files with **empty MIME type** — both client and server must handle this
- EXIF auto-rotation: `sharp.rotate()` (no args) must be called before `.resize()` in all processing paths
- Supported formats: JPEG, PNG, WebP, HEIC/HEIF
- Magic byte validation is the authoritative format check, not MIME type
- Batch limit: 300 photos per upload

### CSS & UI
- **No Tailwind. No utility frameworks.** Component-scoped `<style>` blocks only.
- **No toast notifications.** Use modal confirmation dialogs for destructive actions.
- Card styling: white background, `border-radius: 8px`, `border: 1px solid #e9ecef`

### Data Integrity
**NEVER:**
- Create synthetic or placeholder data
- Use fallback data to mask broken code
- Modify production data without explicit user confirmation

**ALWAYS:**
- Use atomic JSON writes via `json-store.js` `updateJson()`
- Validate at system boundaries (API routes), trust internal code
- Preserve data truthfulness

---

## Development Workflow
- **Dev server port**: 5174 (5173 is BTC Dashboard)
- **Always `cd` back** to project root after operations
- **Use absolute paths** when possible to avoid directory confusion
- **Commits**: Only commit when explicitly asked

---

## State Tracking Tools
- `td` — task management CLI
- `nn` — append timestamped entry to today's devlog
- `ctx` — export full context for session continuity

---

## Historical Failures (Learn From These)
- **2026-03-07**: Used `ssh root@gaylon.photos` — timed out because domain resolves to Cloudflare, not the droplet. Always use `root@134.199.211.199`.
- **2026-03-07**: Used `systemctl restart gaylonphotos` — failed because app uses PM2, not systemd. Always use `pm2 restart`.
- **2026-03-07**: Assumed user was on mobile from a screenshot — they were on Mac with a narrow browser window. Never assume the user's device.
- **2026-03-07**: Assumed session was expired without evidence — the user had already re-logged in. Verify before diagnosing.
- **2026-03-07**: Three rounds of upload fixes needed because assumptions replaced investigation — empty MIME types from Apple Photos weren't caught until actual file data was examined.

- **2026-03-11**: Tried manual `ssh root@gaylon.photos` + `npm run build` to deploy — timed out, then host key failure. Deploy script `./scripts/deploy-to-DO.sh` handles everything correctly. Never deploy manually.

### Key Principle
> Assumptions are the enemy. Read the code. Read the config. Test the layer. Only then diagnose.
