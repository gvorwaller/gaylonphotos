#!/usr/bin/env bash
# sync-collection.sh — Copy collection JSON between dev and prod
#
# Usage:
#   sync-collection.sh <collection> <direction> [file-type] [--force]
#
# Arguments:
#   collection   Collection slug (e.g. scandinavia-2023, birds)
#   direction    "push" (dev → prod) or "pull" (prod → dev)
#   file-type    Optional: photos, itinerary, ancestry, or "all" (default: all)
#   --force      Skip the newer-file safety check
#
# Examples:
#   sync-collection.sh scandinavia-2023 pull              # pull all files
#   sync-collection.sh scandinavia-2023 push photos       # push only photos.json
#   sync-collection.sh birds push all --force             # force push everything

set -euo pipefail

REMOTE="root@134.199.211.199"
REMOTE_DATA="/opt/gaylonphotos/data"
LOCAL_DATA="data"
SSH_KEY="$HOME/.ssh/id_ed25519"
SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no"

# --- Parse args ---

SLUG="${1:-}"
DIRECTION="${2:-}"
FILETYPE="${3:-all}"
FORCE=false

for arg in "$@"; do
    [[ "$arg" == "--force" ]] && FORCE=true
done

if [[ -z "$SLUG" || -z "$DIRECTION" ]]; then
    echo "Usage: sync-collection.sh <collection> <direction> [file-type] [--force]"
    echo ""
    echo "  direction:  push (dev → prod) or pull (prod → dev)"
    echo "  file-type:  photos, itinerary, ancestry, or all (default: all)"
    echo "  --force:    skip newer-file safety check"
    exit 1
fi

if [[ "$DIRECTION" != "push" && "$DIRECTION" != "pull" ]]; then
    echo "Error: direction must be 'push' or 'pull', got '$DIRECTION'"
    exit 1
fi

# --- Determine which files to sync ---

ALL_TYPES=("photos" "itinerary" "ancestry")

if [[ "$FILETYPE" == "all" ]]; then
    TYPES=("${ALL_TYPES[@]}")
else
    # Validate file type
    valid=false
    for t in "${ALL_TYPES[@]}"; do
        [[ "$t" == "$FILETYPE" ]] && valid=true
    done
    if [[ "$valid" == false ]]; then
        echo "Error: file-type must be photos, itinerary, ancestry, or all"
        exit 1
    fi
    TYPES=("$FILETYPE")
fi

# --- Helper: get file mod time as epoch seconds ---

local_mtime() {
    local file="$1"
    if [[ -f "$file" ]]; then
        stat -f %m "$file" 2>/dev/null  # macOS
    else
        echo "0"
    fi
}

remote_mtime() {
    local file="$1"
    ssh $SSH_OPTS "$REMOTE" "stat -c %Y '$file' 2>/dev/null || echo 0" 2>/dev/null
}

format_date() {
    local epoch="$1"
    if [[ "$epoch" == "0" ]]; then
        echo "(does not exist)"
    else
        date -r "$epoch" "+%Y-%m-%d %H:%M:%S" 2>/dev/null || echo "$epoch"
    fi
}

# --- Verify collection exists on at least one side ---

LOCAL_DIR="$LOCAL_DATA/$SLUG"
REMOTE_DIR="$REMOTE_DATA/$SLUG"

local_exists=false
remote_exists=false

[[ -d "$LOCAL_DIR" ]] && local_exists=true
ssh $SSH_OPTS "$REMOTE" "test -d '$REMOTE_DIR'" 2>/dev/null && remote_exists=true

if [[ "$DIRECTION" == "push" && "$local_exists" == false ]]; then
    echo "Error: local collection '$SLUG' not found at $LOCAL_DIR"
    exit 1
fi

if [[ "$DIRECTION" == "pull" && "$remote_exists" == false ]]; then
    echo "Error: remote collection '$SLUG' not found at $REMOTE_DIR"
    exit 1
fi

# --- Sync each file ---

synced=0
skipped=0
arrow=$([[ "$DIRECTION" == "push" ]] && echo "→" || echo "←")
label=$([[ "$DIRECTION" == "push" ]] && echo "DEV → PROD" || echo "PROD → DEV")

echo ""
echo "  Sync: $SLUG ($label)"
echo "  ─────────────────────────────────"

for type in "${TYPES[@]}"; do
    file="${type}.json"
    local_path="$LOCAL_DIR/$file"
    remote_path="$REMOTE_DIR/$file"

    # Check if file exists on source side
    if [[ "$DIRECTION" == "push" ]]; then
        if [[ ! -f "$local_path" ]]; then
            continue  # silently skip files that don't exist in this collection
        fi
    else
        exists=$(ssh $SSH_OPTS "$REMOTE" "test -f '$remote_path' && echo yes || echo no" 2>/dev/null)
        if [[ "$exists" != "yes" ]]; then
            continue
        fi
    fi

    # Get mod times
    lt=$(local_mtime "$local_path")
    rt=$(remote_mtime "$remote_path")

    local_date=$(format_date "$lt")
    remote_date=$(format_date "$rt")

    echo ""
    echo "  $file"
    echo "    Local:  $local_date"
    echo "    Prod:   $remote_date"

    # Safety check: warn if destination is newer
    if [[ "$FORCE" == false ]]; then
        if [[ "$DIRECTION" == "push" && "$rt" -gt "$lt" ]]; then
            echo "    ⚠  SKIPPED — prod is newer. Use --force to override."
            skipped=$((skipped + 1))
            continue
        fi
        if [[ "$DIRECTION" == "pull" && "$lt" -gt "$rt" ]]; then
            echo "    ⚠  SKIPPED — local is newer. Use --force to override."
            skipped=$((skipped + 1))
            continue
        fi
    fi

    # Perform the copy
    if [[ "$DIRECTION" == "push" ]]; then
        # Ensure remote directory exists
        ssh $SSH_OPTS "$REMOTE" "mkdir -p '$REMOTE_DIR'" 2>/dev/null
        scp $SSH_OPTS "$local_path" "$REMOTE:$remote_path" >/dev/null 2>&1
    else
        # Ensure local directory exists
        mkdir -p "$LOCAL_DIR"
        scp $SSH_OPTS "$REMOTE:$remote_path" "$local_path" >/dev/null 2>&1
    fi

    if [[ $? -eq 0 ]]; then
        echo "    ✓  Copied $arrow"
        synced=$((synced + 1))
    else
        echo "    ✗  FAILED"
    fi
done

echo ""
echo "  Done: $synced synced, $skipped skipped"
echo ""
