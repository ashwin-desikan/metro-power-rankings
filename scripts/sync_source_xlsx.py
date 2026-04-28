#!/usr/bin/env python3
"""
Sync the master MetroAreas.xlsx from its source-of-truth location into the
project root so subsequent ETL runs always see the latest data.

The source file is expected to live in the OneDrive 'Excel Files' folder. The
project copy is the canonical input for scripts/extract.py.

Behavior:
  - Compares mtime + size between source and project copy
  - Validates that the source is a complete .xlsx (zip with an EOCD record)
    before copying. This prevents copying a partially written file while
    Excel still has it open or while OneDrive is mid-sync
  - Detects Excel's '~$' lock file as an early warning signal
  - If source is newer: backs up the project copy as
    MetroAreas.xlsx.bak-YYYYMMDD-HHMMSS and copies source over
  - If project copy is newer: aborts with a warning. Pass --force to clobber
  - If same mtime/size: reports a no-op and exits 0
  - --dry-run shows what would happen without touching files
  - --skip-validation bypasses the xlsx integrity check (not recommended)

Source lookup order:
  1. METROAREAS_SOURCE_XLSX environment variable
  2. --source CLI argument
  3. ~/OneDrive/Excel Files/MetroAreas.xlsx
  4. ~/Excel Files/MetroAreas.xlsx
  5. Sibling 'Excel Files' folder next to the project root

Exit codes:
  0  - success (copied or no-op)
  1  - source not found
  2  - dest is newer than source and --force not given
  3  - copy or backup failed
  4  - source is not a valid/complete xlsx (validation failed)
"""

import argparse
import datetime as dt
import os
import shutil
import sys
import zipfile
from pathlib import Path


SOURCE_FILENAME = "MetroAreas.xlsx"


def find_source(explicit=None):
    candidates = []
    env_path = os.environ.get("METROAREAS_SOURCE_XLSX")
    if env_path:
        candidates.append(Path(env_path))
    if explicit:
        candidates.append(Path(explicit))
    home = Path.home()
    project_root = Path(__file__).resolve().parent.parent
    candidates.extend([
        home / "OneDrive" / "Excel Files" / SOURCE_FILENAME,
        home / "Excel Files" / SOURCE_FILENAME,
        project_root.parent / "Excel Files" / SOURCE_FILENAME,
    ])
    seen = set()
    for c in candidates:
        try:
            resolved = c.resolve()
        except OSError:
            resolved = c
        key = str(resolved)
        if key in seen:
            continue
        seen.add(key)
        if c.exists():
            return c
    return None


def excel_lockfile(p: Path) -> Path:
    """Return the path Excel uses for its temporary lock file when the
    workbook is open (e.g. '~$MetroAreas.xlsx' next to 'MetroAreas.xlsx')."""
    return p.with_name("~$" + p.name)


def validate_xlsx(p: Path) -> tuple[bool, str]:
    """Return (ok, reason). The file must be readable as a zip archive and
    must contain at least one .xml part (xlsx contents). A truncated or
    half-written xlsx will fail because the End Of Central Directory record
    is absent."""
    try:
        with zipfile.ZipFile(str(p), 'r') as z:
            names = z.namelist()
            if not names:
                return False, "xlsx archive contains no entries"
            if not any(n.endswith('.xml') for n in names):
                return False, "xlsx archive has no .xml parts"
            # Test integrity of central directory entries
            bad = z.testzip()
            if bad is not None:
                return False, f"corrupt entry in xlsx: {bad}"
        return True, ""
    except zipfile.BadZipFile as e:
        return False, f"not a complete zip archive ({e})"
    except OSError as e:
        return False, f"cannot read source file ({e})"


def fmt_mtime(p: Path) -> str:
    return dt.datetime.fromtimestamp(p.stat().st_mtime).strftime('%Y-%m-%d %H:%M:%S')


def fmt_size(n: int) -> str:
    return f"{n/1024/1024:.2f} MB"


def main():
    ap = argparse.ArgumentParser(description="Sync MetroAreas.xlsx from OneDrive into the project root.")
    ap.add_argument("--source", help="Override source path")
    ap.add_argument("--dest", help="Override destination path (defaults to project root MetroAreas.xlsx)")
    ap.add_argument("--dry-run", action="store_true", help="Show what would happen without copying")
    ap.add_argument("--force", action="store_true", help="Copy source over dest even if dest is newer")
    ap.add_argument("--quiet", action="store_true", help="Only print errors")
    ap.add_argument("--skip-validation", action="store_true",
                    help="Skip the xlsx integrity check (not recommended)")
    args = ap.parse_args()

    project_root = Path(__file__).resolve().parent.parent
    dest = Path(args.dest) if args.dest else project_root / SOURCE_FILENAME

    source = find_source(args.source)
    if source is None:
        print("ERROR: Could not locate MetroAreas.xlsx source.", file=sys.stderr)
        print("  Checked: $METROAREAS_SOURCE_XLSX, --source, ~/OneDrive/Excel Files/, ~/Excel Files/, project sibling", file=sys.stderr)
        sys.exit(1)

    src_stat = source.stat()
    src_mtime = src_stat.st_mtime

    if not args.quiet:
        print(f"Source: {source}")
        print(f"  modified {fmt_mtime(source)} ({fmt_size(src_stat.st_size)})")

    # Heads-up if Excel still has the workbook open: the lock file is usually
    # the smoking gun behind a half-synced/truncated source xlsx.
    lock = excel_lockfile(source)
    if lock.exists() and not args.quiet:
        print(f"  NOTE: Excel lock file present ({lock.name}); the workbook may still be open.")

    if not dest.exists():
        if not args.quiet:
            print(f"Dest:   {dest}")
            print("  (does not exist - will create)")
        if not args.skip_validation:
            ok, reason = validate_xlsx(source)
            if not ok:
                print(f"ERROR: source xlsx failed validation: {reason}", file=sys.stderr)
                print("  The file in OneDrive is likely still being written by Excel or is mid-sync.", file=sys.stderr)
                print("  Close the workbook, wait for OneDrive to finish syncing, then retry.", file=sys.stderr)
                print("  Re-run with --skip-validation to bypass (not recommended).", file=sys.stderr)
                sys.exit(4)
        if args.dry_run:
            print("DRY RUN: would copy source to dest.")
            return
        try:
            shutil.copy2(str(source), str(dest))
        except OSError as e:
            print(f"ERROR: copy failed: {e}", file=sys.stderr)
            sys.exit(3)
        print(f"Copied {source.name} to {dest}.")
        return

    dst_stat = dest.stat()
    dst_mtime = dst_stat.st_mtime

    if not args.quiet:
        print(f"Dest:   {dest}")
        print(f"  modified {fmt_mtime(dest)} ({fmt_size(dst_stat.st_size)})")

    delta = src_mtime - dst_mtime
    same_size = src_stat.st_size == dst_stat.st_size

    # Same content if mtimes within 2 seconds and sizes match (FS rounding).
    if abs(delta) < 2 and same_size:
        if not args.quiet:
            print("Already in sync. No copy needed.")
        return

    if delta < 0 and not args.force:
        print("WARNING: project copy is newer than source.", file=sys.stderr)
        print(f"  source mtime: {fmt_mtime(source)}", file=sys.stderr)
        print(f"  dest   mtime: {fmt_mtime(dest)}", file=sys.stderr)
        print("  This usually means you have local edits that have not been saved to OneDrive.", file=sys.stderr)
        print("  Re-run with --force to copy source over dest anyway.", file=sys.stderr)
        sys.exit(2)

    # Source is newer (or --force). Validate before clobbering anything.
    if not args.skip_validation:
        ok, reason = validate_xlsx(source)
        if not ok:
            print(f"ERROR: source xlsx failed validation: {reason}", file=sys.stderr)
            print("  The file in OneDrive is likely still being written by Excel or is mid-sync.", file=sys.stderr)
            print("  Close the workbook, wait for OneDrive to finish syncing, then retry.", file=sys.stderr)
            print("  The project copy was NOT touched.", file=sys.stderr)
            print("  Re-run with --skip-validation to bypass (not recommended).", file=sys.stderr)
            sys.exit(4)

    timestamp = dt.datetime.now().strftime('%Y%m%d-%H%M%S')
    backup = dest.with_name(f"{dest.name}.bak-{timestamp}")

    if args.dry_run:
        print(f"DRY RUN: would back up dest to {backup.name} and copy source to dest.")
        return

    try:
        shutil.copy2(str(dest), str(backup))
    except OSError as e:
        print(f"ERROR: backup failed: {e}", file=sys.stderr)
        sys.exit(3)

    try:
        shutil.copy2(str(source), str(dest))
    except OSError as e:
        print(f"ERROR: copy failed: {e}", file=sys.stderr)
        sys.exit(3)

    print(f"Synced {source.name}: source -> dest (backup at {backup.name}).")


if __name__ == "__main__":
    main()
