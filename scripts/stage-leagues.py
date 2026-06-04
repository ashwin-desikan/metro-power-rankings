#!/usr/bin/env python3
"""
Stage the four league workbooks from OneDrive into ./workbooks/ so the
build-*-data.py family reads project-local copies and never blocks on
OneDrive sharing locks.

This sits next to scripts/sync_source_xlsx.py (which owns MetroAreas.xlsx).
The contract is intentionally the same so the workbook-sync skill can treat
them as siblings.

Targets:
  NFL_all.xlsx               -> workbooks/NFL_all.xlsx
  NBA.xlsx                   -> workbooks/NBA.xlsx
  NHL.xlsx                   -> workbooks/NHL.xlsx
  MLB.xlsx                   -> workbooks/MLB.xlsx
  Champions League-201516.xlsx -> workbooks/Champions League-201516.xlsx

Behavior:
  - Detects Excel's '~$NAME.xlsx' lockfile in the source dir and aborts with
    exit 2. Excel must be closed for staging to succeed; that is by design,
    since reading while Excel holds the workbook is the original failure.
  - Opens each source for read with retry-on-PermissionError (OneDrive
    mid-upload). Default: 3 attempts, 5s initial backoff, exponential.
  - Validates that each source is a complete .xlsx (zip with EOCD) before
    copying. Catches OneDrive partial-write / bindfs-padding situations.
  - Skips when the staged copy already matches source by size + mtime.
  - Atomic copy via tempfile + os.replace inside the staging directory.

Source lookup order (per workbook, in order):
  1. {NAME}_SOURCE_XLSX environment variable (e.g. NBA_SOURCE_XLSX)
  2. WORKBOOK_SOURCE_DIR environment variable + filename
  3. ~/OneDrive/Excel Files/{filename}
  4. ~/Excel Files/{filename}
  5. Sibling 'Excel Files' folder next to the project root

CLI:
  --only NAME[,NAME]    Restrict to a subset (nfl|nba|mlb|nhl)
  --force               Clobber staged copy even if it's newer than source
  --dry-run             Report intentions, do not copy
  --retry-seconds N     Initial backoff for sharing-violation retry (default 5)
  --retry-count N       Total attempts including the first (default 3)
  --staging-dir PATH    Override ./workbooks/
  --quiet               Suppress per-workbook OK lines (errors still print)
  -h / --help

Exit codes:
  0  all requested workbooks staged or already current
  1  a source file was not found
  2  Excel '~$' lockfile present and active (close Excel; stale lockfiles are warned and ignored)
  3  sharing violation persisted after all retries
  4  validation failed (EOCD missing / not a complete xlsx)
  5  copy or backup failed
  6  unknown workbook name passed to --only
"""

import argparse
import datetime as dt
import os
import shutil
import sys
import tempfile
import time
import zipfile
from pathlib import Path


# Logical short name -> default source filename. Update if the user renames a
# workbook in OneDrive. The user-readable short names are stable.
WORKBOOKS = {
    "nfl": "NFL_all.xlsx",
    "nba": "NBA.xlsx",
    "nhl": "NHL.xlsx",
    "mlb": "MLB.xlsx",
    # Global football/international database (legacy filename). Feeds
    # build-international-data.py + build-football-data.py + women's WC.
    "football": "Champions League-201516.xlsx",
}


def env_var_for(short_name: str) -> str:
    return f"{short_name.upper()}_SOURCE_XLSX"


def candidate_sources(short_name: str) -> list[Path]:
    filename = WORKBOOKS[short_name]
    project_root = Path(__file__).resolve().parent.parent
    cands = []
    # 1. per-workbook env var
    env_val = os.environ.get(env_var_for(short_name))
    if env_val:
        cands.append(Path(env_val))
    # 2. shared dir env var
    src_dir = os.environ.get("WORKBOOK_SOURCE_DIR")
    if src_dir:
        cands.append(Path(src_dir) / filename)
    # 3-5. canonical fallbacks
    home = Path.home()
    cands.append(home / "OneDrive" / "Excel Files" / filename)
    cands.append(home / "Excel Files" / filename)
    cands.append(project_root.parent / "Excel Files" / filename)
    return cands


def find_source(short_name: str) -> Path | None:
    for c in candidate_sources(short_name):
        if c.exists() and c.is_file():
            return c.resolve()
    return None


def excel_lockfile_status(src: Path) -> tuple[Path | None, bool]:
    """Return (lockfile_path, is_active) for the Excel '~$NAME.xlsx' marker
    that sits next to src when Excel has the workbook open.

    A real (active) lockfile is freshly written when Excel opens the file, so
    its mtime is at-or-after the workbook's. Stale lockfiles from old Excel
    crashes can persist for years on disk; their mtime is older than the
    workbook's own mtime, and they should be reported as a warning rather
    than aborting the run.
    """
    lock = src.parent / f"~${src.name}"
    if not lock.exists():
        return (None, False)
    try:
        active = lock.stat().st_mtime >= src.stat().st_mtime - 1.0
    except OSError:
        active = True
    return (lock, active)


def validate_eocd(path: Path) -> bool:
    """A complete xlsx is a zip; a zip has an End Of Central Directory record
    in its final 22 bytes (plus optional comment). zipfile.is_zipfile is a
    cheap way to confirm the EOCD survived the OneDrive / bindfs round-trip."""
    try:
        return zipfile.is_zipfile(str(path))
    except OSError:
        return False


def open_with_retry(path: Path, attempts: int, backoff_seconds: float):
    """Open for binary read, retrying on PermissionError with exponential
    backoff. Returns the file handle. Caller is responsible for closing it."""
    last_exc = None
    for i in range(attempts):
        try:
            return open(path, "rb")
        except PermissionError as e:
            last_exc = e
            if i + 1 < attempts:
                wait = backoff_seconds * (2 ** i)
                print(f"  PermissionError on {path.name}, "
                      f"retry {i + 1}/{attempts - 1} in {wait:.1f}s",
                      file=sys.stderr)
                time.sleep(wait)
    raise last_exc


def same_by_metadata(src: Path, dst: Path) -> bool:
    if not dst.exists():
        return False
    s, d = src.stat(), dst.stat()
    if s.st_size != d.st_size:
        return False
    # OneDrive normalizes mtimes within seconds; allow a 2-second window.
    return abs(s.st_mtime - d.st_mtime) < 2.0


def atomic_copy(src: Path, dst: Path) -> int:
    """Copy src to dst atomically. Returns bytes written."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(dir=str(dst.parent),
                                     prefix=f".{dst.name}.",
                                     suffix=".staging")
    tmp = Path(tmp_name)
    try:
        with open(src, "rb") as r, os.fdopen(fd, "wb") as w:
            shutil.copyfileobj(r, w, length=1024 * 1024)
        # Preserve mtime so same_by_metadata can short-circuit next run.
        st = src.stat()
        os.utime(tmp, (st.st_atime, st.st_mtime))
        os.replace(tmp, dst)
        return st.st_size
    except Exception:
        if tmp.exists():
            tmp.unlink()
        raise


def backup_existing(dst: Path) -> Path | None:
    if not dst.exists():
        return None
    ts = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    bak = dst.with_name(f"{dst.name}.bak-{ts}")
    shutil.copy2(dst, bak)
    return bak


def stage_one(short_name: str, staging_dir: Path, args) -> int:
    filename = WORKBOOKS[short_name]
    target = staging_dir / filename
    src = find_source(short_name)
    if src is None:
        print(f"  FAIL {short_name}: source {filename} not found in any "
              f"candidate location", file=sys.stderr)
        return 1

    lock, lock_active = excel_lockfile_status(src)
    if lock is not None:
        if lock_active:
            print(f"  FAIL {short_name}: Excel lockfile present at {lock}. "
                  f"Close Excel and retry.", file=sys.stderr)
            return 2
        if not args.quiet:
            print(f"  WARN {short_name}: stale lockfile {lock.name} "
                  f"(older than the workbook); proceeding.", file=sys.stderr)

    if target.exists() and not args.force:
        # If staged copy is newer, surface that and require --force.
        if target.stat().st_mtime > src.stat().st_mtime + 1.0:
            print(f"  WARN {short_name}: staged copy is newer than source. "
                  f"Pass --force to clobber.", file=sys.stderr)
            return 5

    if same_by_metadata(src, target):
        if not args.quiet:
            print(f"  OK   {short_name}: already current "
                  f"({src.stat().st_size:,} bytes)")
        return 0

    if args.dry_run:
        print(f"  DRY  {short_name}: would copy {src} -> {target}")
        return 0

    # Acquire a read handle with retry, then validate, then copy. The retry
    # is just to surface a clean stdout message; the actual copy is via
    # shutil.copyfileobj on a fresh handle inside atomic_copy.
    try:
        fh = open_with_retry(src, args.retry_count, args.retry_seconds)
        fh.close()
    except PermissionError as e:
        print(f"  FAIL {short_name}: sharing violation after "
              f"{args.retry_count} attempts: {e}", file=sys.stderr)
        return 3

    if not validate_eocd(src):
        print(f"  FAIL {short_name}: source is not a complete xlsx "
              f"(EOCD missing). Wait for OneDrive sync to finish, retry.",
              file=sys.stderr)
        return 4

    try:
        backup_existing(target)
        n = atomic_copy(src, target)
    except OSError as e:
        print(f"  FAIL {short_name}: copy failed: {e}", file=sys.stderr)
        return 5

    if not args.quiet:
        print(f"  OK   {short_name}: staged {n:,} bytes -> "
              f"{target.relative_to(Path.cwd()) if target.is_absolute() else target}")
    return 0


def parse_args(argv):
    p = argparse.ArgumentParser(
        description="Stage league workbooks from OneDrive into ./workbooks/",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    p.add_argument("--only", help="comma list of names: " +
                                  ",".join(WORKBOOKS))
    p.add_argument("--force", action="store_true")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--retry-seconds", type=float, default=5.0)
    p.add_argument("--retry-count", type=int, default=3)
    p.add_argument("--staging-dir", default="workbooks")
    p.add_argument("--quiet", action="store_true")
    return p.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv or sys.argv[1:])
    project_root = Path(__file__).resolve().parent.parent
    staging_dir = (project_root / args.staging_dir).resolve()

    if args.only:
        wanted = [s.strip().lower() for s in args.only.split(",")]
        bad = [s for s in wanted if s not in WORKBOOKS]
        if bad:
            print(f"FAIL unknown workbook name(s): {bad}. "
                  f"Valid: {list(WORKBOOKS)}", file=sys.stderr)
            return 6
        order = wanted
    else:
        order = list(WORKBOOKS)

    if not args.quiet:
        print(f"stage-leagues -> {staging_dir}")
        print(f"  workbooks: {', '.join(order)}")
        if args.dry_run:
            print("  (dry-run)")

    worst = 0
    for short in order:
        rc = stage_one(short, staging_dir, args)
        if rc != 0:
            # First failure aborts, matching sync_source_xlsx.py semantics.
            return rc
        worst = max(worst, rc)
    return worst


if __name__ == "__main__":
    sys.exit(main())
