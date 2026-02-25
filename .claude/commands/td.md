---
allowed-tools: Bash(td:*)
description: Task management using td CLI - check tasks, manage sessions, track work
---

# Task Management (td)

Run the `td` task management CLI with the provided arguments.

## Execute Command

```bash
td $ARGUMENTS
```

## Common Usage Patterns

| Command | Purpose |
|---------|---------|
| `td usage --new-session` | Start new session, see what to work on |
| `td usage -q` | Quick status (after first read) |
| `td session "name"` | Label current session |
| `td session --new` | Force new session in same context |
| `td session --list` | List all sessions |
| `td help` | Show all td commands |

## After Running

Based on the output:
1. Summarize the current task status
2. Identify the next priority item
3. If starting a new session, acknowledge the session context

## Default Behavior

If no arguments provided, run `td usage -q` for a quick status check.
