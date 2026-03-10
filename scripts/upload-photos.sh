#!/usr/bin/env bash
#
# Upload selected Photos to gaylon.photos
#
# Usage:
#   ./scripts/upload-photos.sh <collection-slug> [options]
#
# Examples:
#   ./scripts/upload-photos.sh scandinavia-2023          # production upload
#   ./scripts/upload-photos.sh scandinavia-2023 --dry-run
#   ./scripts/upload-photos.sh birds --base-url http://localhost:5174
#   ./scripts/upload-photos.sh scandinavia-2023 --preflight
#
# Credentials are read from environment (UPLOAD_USER / UPLOAD_PASS)
# or prompted interactively.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CLI_DIR="$PROJECT_ROOT/mac/photo-uploader-cli"

# --- Load .env if credentials not already set ---
if [[ -z "${UPLOAD_USER:-}" || -z "${UPLOAD_PASS:-}" ]]; then
    if [[ -f "$PROJECT_ROOT/.env" ]]; then
        set -a
        source "$PROJECT_ROOT/.env"
        set +a
    fi
fi

# --- Args ---
if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <collection-slug> [--dry-run] [--preflight] [--base-url URL] [...]"
    echo ""
    echo "Select photos in Photos.app first, then run this script."
    echo "All extra flags are passed through to the CLI."
    exit 1
fi

COLLECTION="$1"
shift
EXTRA_ARGS=("$@")

# Default to --prod unless --base-url is specified
USE_PROD=true
for arg in "${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}"; do
    if [[ "$arg" == "--base-url" ]]; then
        USE_PROD=false
        break
    fi
done

# --- Build ---
echo "Building photo-uploader..."
BUILD_START=$(date +%s)
(cd "$CLI_DIR" && swift build 2>&1 | tail -1)
BUILD_END=$(date +%s)
echo "Build time: $((BUILD_END - BUILD_START))s"
echo ""

# --- Credentials ---
if [[ -n "${UPLOAD_USER:-}" && -n "${UPLOAD_PASS:-}" ]]; then
    CRED_INPUT=$(printf '%s\n%s\n' "$UPLOAD_USER" "$UPLOAD_PASS")
else
    echo "Enter credentials for gaylon.photos admin:"
    read -rp "  Username: " UPLOAD_USER
    read -rsp "  Password: " UPLOAD_PASS
    echo ""
    CRED_INPUT=$(printf '%s\n%s\n' "$UPLOAD_USER" "$UPLOAD_PASS")
fi

# --- Run ---
echo "═══════════════════════════════════════════"
echo "  Collection:  $COLLECTION"
if $USE_PROD; then
    echo "  Target:      https://gaylon.photos"
else
    echo "  Target:      (custom)"
fi
echo "  Extra flags: ${EXTRA_ARGS[*]+"${EXTRA_ARGS[*]}"}"
echo "═══════════════════════════════════════════"
echo ""

RUN_START=$(date +%s)

CMD=(swift run photo-uploader --collection "$COLLECTION")
if $USE_PROD; then
    CMD+=(--prod)
fi
CMD+=("${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}")

set +e
printf '%s' "$CRED_INPUT" | (cd "$CLI_DIR" && "${CMD[@]}" 2>&1)
EXIT_CODE=$?
set -e

RUN_END=$(date +%s)
ELAPSED=$((RUN_END - RUN_START))

# --- Summary ---
echo ""
echo "═══════════════════════════════════════════"
if [[ $EXIT_CODE -eq 0 ]]; then
    echo "  Result:    SUCCESS"
else
    echo "  Result:    FAILED (exit code $EXIT_CODE)"
fi
echo "  Run time:  ${ELAPSED}s"
echo "  Finished:  $(date '+%Y-%m-%d %H:%M:%S')"
echo "═══════════════════════════════════════════"

# --- Show latest run log if available ---
RUNS_DIR="$CLI_DIR/.photo-uploader-runs"
if [[ -d "$RUNS_DIR" ]]; then
    LATEST_RUN=$(ls -td "$RUNS_DIR"/run-* 2>/dev/null | head -1)
    if [[ -n "$LATEST_RUN" ]]; then
        echo ""
        echo "Run log: $LATEST_RUN"

        if [[ -f "$LATEST_RUN/run.json" ]]; then
            echo ""
            # Parse run.json for plain-text summary
            python3 -c "
import json, sys
with open('$LATEST_RUN/run.json') as f:
    r = json.load(f)
print(f\"  Total:     {r.get('total', '?')}\")
print(f\"  Uploaded:  {r.get('uploaded', '?')}\")
print(f\"  Failed:    {r.get('failed', '?')}\")
print(f\"  Skipped:   {r.get('skipped', '?')}\")
print(f\"  Status:    {r.get('status', '?')}\")
" 2>/dev/null || true
        fi

        if [[ -s "$LATEST_RUN/failures.jsonl" ]]; then
            echo ""
            echo "  FAILURES:"
            python3 -c "
import json, sys
with open('$LATEST_RUN/failures.jsonl') as f:
    for line in f:
        if line.strip():
            r = json.loads(line)
            name = r.get('filename', '?')
            err = r.get('error', r.get('uploadStatus', '?'))
            print(f'    - {name}: {err}')
" 2>/dev/null || cat "$LATEST_RUN/failures.jsonl"
        fi
    fi
fi

exit $EXIT_CODE
