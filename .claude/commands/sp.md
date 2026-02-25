Save a progress snapshot to `docs/PROGRESS.md`.

This creates a quick git state checkpoint (complementary to `/nn` which writes detailed devlog narratives).

**User message:** $ARGUMENTS

## Instructions

1. Get current timestamp, branch name, and git status
2. Search for any `#GBV` reminder comments in tracked files (excluding PROGRESS.md and savepoint.sh)
3. Append a snapshot entry to `docs/PROGRESS.md` in this format:

```markdown
## YYYY-MM-DD HH:MM:SS TZ — branch-name
- [USER MESSAGE HERE - use exactly what they typed after /sp]

**Uncommitted changes:**
    [git status --porcelain output, or "(none - all changes committed)"]

**Open #GBV notes (top 50):**
    [any #GBV comments found in codebase, or "(none)"]

---
```

**IMPORTANT:** The user's message (everything after `/sp `) MUST appear on the `- ` line. Examples:
- `/sp beginning next phase` → `- beginning next phase`
- `/sp fixed dual-write bug` → `- fixed dual-write bug`
- `/sp` (no message) → `- (checkpoint)`

## File Size Check

If `docs/PROGRESS.md` exceeds ~500KB, rename it to `docs/PROGRESS.rollover.YYYY-MM-DD-HHMMSS.md` before creating the new entry.

## Key Differences from /nn

| `/sp` (savepoint) | `/nn` (devlog) |
|-------------------|----------------|
| Quick checkpoint | Detailed narrative |
| Git state focus | Work summary focus |
| `docs/PROGRESS.md` | `docs/devlog/YYYY-MM-DD.md` |
| Append-only log | Daily file with sections |
| Includes #GBV reminders | Includes technical insights |

## Output

After saving, confirm with: `✅ Saved snapshot → docs/PROGRESS.md`
