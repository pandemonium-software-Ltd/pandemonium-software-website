#!/bin/bash
# Extract cursor positions from all 4 recordings.
# Run from the remotion/ directory: bash scripts/extract-all.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REMOTION_DIR="$(dirname "$SCRIPT_DIR")"
VENV="$REMOTION_DIR/.venv"
VIDEOS="/Users/Ben/Pandemonium Software Consulting Ltd/pandemonium-playbook/videos"

source "$VENV/bin/activate"

echo "=== Extracting cursor positions ==="

python3 "$SCRIPT_DIR/extract-cursor.py" \
  "$VIDEOS/Cloudflare_Registrar.mov" \
  "$REMOTION_DIR/src/data/cloudflare-signup.json" \
  --sample-fps 5 &

python3 "$SCRIPT_DIR/extract-cursor.py" \
  "$VIDEOS/Godaddy.mov" \
  "$REMOTION_DIR/src/data/godaddy-nameservers.json" \
  --sample-fps 5 &

python3 "$SCRIPT_DIR/extract-cursor.py" \
  "$VIDEOS/GBP_Link.mov" \
  "$REMOTION_DIR/src/data/gbp-share-link.json" \
  --sample-fps 5 &

python3 "$SCRIPT_DIR/extract-cursor.py" \
  "$VIDEOS/GBP_Add_Member.mov" \
  "$REMOTION_DIR/src/data/gbp-add-manager.json" \
  --sample-fps 5 &

wait
echo ""
echo "=== All extractions complete ==="
echo "Run 'npm run studio' to preview."
