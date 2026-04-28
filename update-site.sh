#!/bin/bash
# ============================================================
# Metro Power Rankings - One-Click Site Update
# ============================================================
# Usage:
#   ./update-site.sh [path/to/MetroAreas.xlsx]
#
# What this does:
#   0. Syncs the latest MetroAreas.xlsx from OneDrive into the project
#      root if the source is newer (skipped when an explicit path is
#      passed in or when SKIP_SYNC=1)
#   1. Reads MetroAreas.xlsx and extracts JSON data files
#   2. Commits the updated data to git
#   3. Pushes to GitHub (which triggers Vercel auto-deploy)
#
# The site will be live ~60 seconds after this script finishes.
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Find the Excel file
if [ -n "$1" ]; then
    XLSX_PATH="$1"
    EXPLICIT_PATH=1
else
    # Default: project root copy, kept in sync from OneDrive by Step 0
    XLSX_PATH="./MetroAreas.xlsx"
    EXPLICIT_PATH=0
fi

echo ""
echo "======================================"
echo "  Metro Power Rankings - Site Update"
echo "======================================"
echo ""

# Step 0: Sync the master xlsx from OneDrive if newer.
# Skipped when caller passes an explicit path or sets SKIP_SYNC=1.
if [ "$EXPLICIT_PATH" -eq 0 ] && [ "${SKIP_SYNC:-0}" != "1" ]; then
    echo "Step 0/3: Syncing MetroAreas.xlsx from OneDrive..."
    python3 scripts/sync_source_xlsx.py
    echo ""
fi

if [ ! -f "$XLSX_PATH" ]; then
    echo "ERROR: Cannot find $XLSX_PATH"
    echo "Usage: ./update-site.sh [path/to/MetroAreas.xlsx]"
    exit 1
fi

echo "Source: $XLSX_PATH"
echo ""

# Step 1: Extract data
echo "Step 1/3: Extracting data from Excel..."
python3 scripts/extract.py "$XLSX_PATH"
echo ""

# Step 2: Commit
echo "Step 2/3: Committing updated data..."
git add public/data/
git commit -m "data: update metro rankings $(date +%Y-%m-%d)" || echo "No data changes to commit."
echo ""

# Step 3: Push
echo "Step 3/3: Pushing to GitHub (triggers Vercel deploy)..."
git push
echo ""

echo "======================================"
echo "  Done! Site will update in ~60 seconds."
echo "======================================"
echo ""
