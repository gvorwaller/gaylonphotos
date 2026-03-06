#!/usr/bin/env bash
# CCC preflight script — pull production data from DO before backup runs.
# Keeps a local copy of prod JSON data so CCC includes it in the NAS backup.
#
# CCC runs preflight scripts in a minimal environment, so we use full paths
# and explicitly specify the SSH key.

REMOTE="root@134.199.211.199"
REMOTE_DATA="/opt/gaylonphotos/data/"
LOCAL_DATA="$HOME/gaylonphotos/data-prod/"
SSH_KEY="$HOME/.ssh/id_ed25519"

mkdir -p "$LOCAL_DATA"
/opt/homebrew/bin/rsync -az --delete -e "/usr/bin/ssh -i $SSH_KEY -o StrictHostKeyChecking=no" "$REMOTE:$REMOTE_DATA" "$LOCAL_DATA"

exit 0
