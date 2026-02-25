#!/usr/bin/env bash
#
# Ingest all photos from ./photos/{slug}/ subdirectories.
#
# For each subdirectory in ./photos/, runs the node ingest script
# against that collection slug. On success, moves processed source
# files into ./photos/{slug}/imported/ so they won't be re-processed.
#
# Usage:
#   ./scripts/ingest-all.sh              # process all collections
#   ./scripts/ingest-all.sh birds        # process only 'birds'
#   ./scripts/ingest-all.sh birds surfing # process specific collections
#
# To re-process a photo, move it from imported/ back to the parent:
#   mv photos/birds/imported/IMG_1234.jpg photos/birds/

set -euo pipefail

PHOTOS_DIR="./photos"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NODE_SCRIPT="$SCRIPT_DIR/ingest-photos.js"

if [ ! -d "$PHOTOS_DIR" ]; then
	echo "Error: $PHOTOS_DIR directory not found"
	exit 1
fi

if [ ! -f "$NODE_SCRIPT" ]; then
	echo "Error: $NODE_SCRIPT not found"
	exit 1
fi

# Determine which slugs to process
if [ $# -gt 0 ]; then
	slugs=("$@")
else
	slugs=()
	for dir in "$PHOTOS_DIR"/*/; do
		[ -d "$dir" ] || continue
		slug="$(basename "$dir")"
		# Skip imported directories and hidden dirs
		[ "$slug" = "imported" ] && continue
		[[ "$slug" == .* ]] && continue
		slugs+=("$slug")
	done
fi

if [ ${#slugs[@]} -eq 0 ]; then
	echo "No collection directories found in $PHOTOS_DIR/"
	exit 0
fi

total_ingested=0
total_skipped=0
total_failed=0

for slug in "${slugs[@]}"; do
	src_dir="$PHOTOS_DIR/$slug"

	if [ ! -d "$src_dir" ]; then
		echo "Warning: $src_dir not found, skipping"
		continue
	fi

	# Count image files (excluding imported/ subdirectory)
	image_count=$(find "$src_dir" -maxdepth 1 -type f \( \
		-iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' \
		-o -iname '*.webp' -o -iname '*.heic' -o -iname '*.heif' \
		-o -iname '*.tif' -o -iname '*.tiff' \
	\) 2>/dev/null | wc -l | tr -d ' ')

	if [ "$image_count" -eq 0 ]; then
		echo "[$slug] No new images to process"
		continue
	fi

	echo "[$slug] Found $image_count image(s) to process"

	# Run the node ingest script and capture output
	output=$(node "$NODE_SCRIPT" "$slug" "$src_dir" 2>&1) || {
		echo "[$slug] Ingest failed:"
		echo "$output"
		continue
	}

	echo "$output"

	# Parse counts from output (e.g. "  Ingested: 3")
	ingested=$(echo "$output" | sed -n 's/.*Ingested:[[:space:]]*\([0-9]*\).*/\1/p')
	skipped=$(echo "$output" | sed -n 's/.*Skipped:[[:space:]]*\([0-9]*\).*/\1/p')
	failed=$(echo "$output" | sed -n 's/.*Failed:[[:space:]]*\([0-9]*\).*/\1/p')
	ingested=${ingested:-0}
	skipped=${skipped:-0}
	failed=${failed:-0}

	total_ingested=$((total_ingested + ingested))
	total_skipped=$((total_skipped + skipped))
	total_failed=$((total_failed + failed))

	# Move only successfully processed files to imported/
	# Parse output to find which files succeeded (✓) or were skipped (SKIP)
	if [ "$ingested" -gt 0 ] || [ "$skipped" -gt 0 ]; then
		imported_dir="$src_dir/imported"
		mkdir -p "$imported_dir"

		# Extract failed filenames from node output to skip during move
		# Failed lines:    "    ✗ FAILED: filename.jpg — error"
		failed_files=$(echo "$output" | sed -n 's/^[[:space:]]*✗ FAILED: \(.*\) —.*/\1/p')

		moved=0
		for img in "$src_dir"/*; do
			[ -f "$img" ] || continue
			basename_img="$(basename "$img")"
			ext="${basename_img##*.}"
			ext_lower=$(echo "$ext" | tr '[:upper:]' '[:lower:]')
			case "$ext_lower" in
				jpg|jpeg|png|webp|heic|heif|tif|tiff)
					# Check if this file failed — if so, leave it for retry
					is_failed=false
					while IFS= read -r ff; do
						[ -z "$ff" ] && continue
						if [ "$ff" = "$basename_img" ]; then
							is_failed=true
							break
						fi
					done <<< "$failed_files"

					if [ "$is_failed" = true ]; then
						echo "[$slug] Leaving failed file for retry: $basename_img"
						continue
					fi

					mv "$img" "$imported_dir/"
					moved=$((moved + 1))
					# Also move sidecar JSON if it exists (Google Takeout)
					sidecar="${img}.json"
					[ -f "$sidecar" ] && mv "$sidecar" "$imported_dir/"
					;;
			esac
		done

		echo "[$slug] Moved $moved file(s) to imported/"
	fi

	echo ""
done

echo "=== Summary ==="
echo "  Ingested: $total_ingested"
echo "  Skipped:  $total_skipped"
echo "  Failed:   $total_failed"
