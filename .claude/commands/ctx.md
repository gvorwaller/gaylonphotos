Export full project context for session continuity or AI handoffs.

This aggregates branch info, recent progress, today's devlog, and uncommitted changes into a single context summary.

## Instructions

Gather and display the following sections:

### 1. Header
```markdown
# Current Context (YYYY-MM-DD)
```

### 2. Branch
Show current git branch name.

### 3. Recent Progress
Display the last 50 lines of `docs/PROGRESS.md` (the `/sp` savepoint log).

### 4. Today's Devlog
Display the full contents of `docs/devlog/YYYY-MM-DD.md` (today's date), or "(none yet)" if it doesn't exist.

### 5. Uncommitted Changes
Show `git status -sb` output (short format with branch info).

## Output Format

```markdown
# Current Context (YYYY-MM-DD)

## Branch
feature/current-branch

## Recent Progress
[last 50 lines of docs/PROGRESS.md]

## Today's Devlog
[contents of docs/devlog/YYYY-MM-DD.md]

## Uncommitted Changes
[git status -sb output]
```

## Purpose

This command is the **read** counterpart to `/sp` (write savepoint) and `/nn` (write devlog):

| Command | Action | Purpose |
|---------|--------|---------|
| `/sp` | Write | Quick checkpoint to PROGRESS.md |
| `/nn` | Write | Detailed narrative to devlog |
| `/ctx` | Read | Aggregate all context for review/handoff |

Use `/ctx` at the start of a session to understand where things left off, or to prepare context for switching between AI assistants.
