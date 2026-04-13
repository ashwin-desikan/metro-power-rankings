#!/bin/bash
# ============================================================
# Metro Power Rankings - One-Click Site Update
# ============================================================
# Usage:
#   ./update-site.sh [path/to/MetroAreas.xlsx]
#
# What this does:
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
else
    # Default: look in the parent directory
    XLSX_PATH="../MetroAreas.xlsx"
fi

if [ ! -f "$XLSX_PATH" ]; then
    echo "ERROR: Cannot find $XLSX_PATH"
    echo "Usage: ./update-site.sh [path/to/MetroAreas.xlsx]"
    exit 1
fi

echo ""
echo "======================================"
echo "  Metro Power Rankings - Site Update"
echo "======================================"
echo ""
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
