#!/bin/bash
# Kill gaylonphotos dev/prod processes for this repo only.
# Usage: ./scripts/kill-photos-processes.sh [--force]

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT=5174
FORCE=false

if [[ "${1:-}" == "--force" ]]; then
  FORCE=true
  echo "Force kill mode enabled (using SIGKILL after confirmation)"
fi

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

add_pid() {
  local pid="$1"
  if [[ -n "$pid" && "$pid" =~ ^[0-9]+$ ]]; then
    printf '%s\n' "$pid"
  fi
}

pid_matches_repo() {
  local pid="$1"
  local cmd cwd

  cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
  [[ -z "$cmd" ]] && return 1

  if [[ "$cmd" == *"$REPO_DIR"* || "$cmd" == *"vite dev"* || "$cmd" == *"build/index.js"* || "$cmd" == *"npm run dev"* ]]; then
    return 0
  fi

  cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1)"
  [[ -n "$cwd" && "$cwd" == "$REPO_DIR"* ]]
}

echo "Searching for gaylonphotos processes..."

SORTED_PIDS=()
while IFS= read -r pid; do
  [[ -n "$pid" ]] && SORTED_PIDS+=("$pid")
done < <(
  {
    while IFS= read -r pid; do
      add_pid "$pid"
    done < <(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)

    while read -r pid; do
      [[ -z "$pid" ]] && continue
      if pid_matches_repo "$pid"; then
        add_pid "$pid"
      fi
    done < <(ps ax -o pid=,comm= | awk '$2 ~ /^(node|npm|vite)$/ {print $1}')
  } | sort -un
)

if [[ ${#SORTED_PIDS[@]} -eq 0 ]]; then
  echo -e "${GREEN}No gaylonphotos processes found${NC}"
  exit 0
fi

echo -e "${YELLOW}Found the following processes:${NC}"
for pid in "${SORTED_PIDS[@]}"; do
  ps -p "$pid" -o pid=,ppid=,command= 2>/dev/null || echo "  PID: $pid"
done

echo ""
read -r -p "Kill these processes? (y/n) " reply
if [[ ! "$reply" =~ ^[Yy]$ ]]; then
  echo "Aborted"
  exit 1
fi

if [[ "$FORCE" == true ]]; then
  echo -e "${RED}Force killing processes...${NC}"
  for pid in "${SORTED_PIDS[@]}"; do
    kill -9 "$pid" 2>/dev/null && echo "  Killed PID $pid" || echo "  PID $pid already gone"
  done
else
  echo "Killing processes gracefully (SIGTERM)..."
  for pid in "${SORTED_PIDS[@]}"; do
    kill "$pid" 2>/dev/null && echo "  Sent SIGTERM to PID $pid" || echo "  PID $pid already gone"
  done

  echo "Waiting 3 seconds for graceful shutdown..."
  sleep 3

  REMAINING=()
  for pid in "${SORTED_PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      REMAINING+=("$pid")
    fi
  done

  if [[ ${#REMAINING[@]} -gt 0 ]]; then
    echo -e "${YELLOW}Some processes are still running, force killing...${NC}"
    for pid in "${REMAINING[@]}"; do
      kill -9 "$pid" 2>/dev/null && echo "  Force killed PID $pid" || echo "  PID $pid already gone"
    done
  fi
fi

sleep 1
FINAL_REMAINING=()
for pid in "${SORTED_PIDS[@]}"; do
  if kill -0 "$pid" 2>/dev/null; then
    FINAL_REMAINING+=("$pid")
  fi
done

if [[ ${#FINAL_REMAINING[@]} -eq 0 ]]; then
  echo -e "${GREEN}All gaylonphotos processes killed${NC}"
else
  echo -e "${RED}Some processes may still be running:${NC}"
  for pid in "${FINAL_REMAINING[@]}"; do
    ps -p "$pid" -o pid=,ppid=,command= 2>/dev/null || echo "  PID: $pid"
  done
  exit 1
fi
