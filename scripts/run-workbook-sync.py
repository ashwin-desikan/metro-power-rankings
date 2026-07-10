#!/usr/bin/env python3
"""
Orchestrator for the workbook-sync skill.

Chains the full xlsx -> JSON -> boundaries -> verify pipeline so the user (or
the workbook-sync skill) can compress 7-9 commands into one invocation.

Sequence (each step blocks on the previous one's success):

  1.  sync_source_xlsx.py           Pull MetroAreas.xlsx master from OneDrive
  2.  stage-leagues.py              Stage NFL/NBA/NHL/MLB + Champions League workbooks
  3.  extract.py                    metros.json, regions.json, details/*.json
  4.  build-nfl-data.py             public/data/nfl/*.json
  5.  build-nba-data.py             public/data/nba/*.json
  6.  build-mlb-data.py             public/data/mlb/*.json
  7.  build-nhl-data.py             public/data/nhl/*.json
  8.  build-international-data.py    public/data/international/*.json (national teams, ELO/FIFA)
  9.  build-football-data.py        public/data/football/*.json (clubs)
  10. build-wfootball-data.py       public/data/football/womens-*.json
  11. build-wnba-data.py            public/data/wnba/*.json
  12. build-sports-index.py         public/data/sports/all-teams.json + summary
  13. build-metro-boundaries.py     public/data/boundaries/*.geojson (cached)
  14. (verify)  check-client-imports.mjs
  15. (verify)  tsc --noEmit

Flags:
  --dry-run             Print the plan, exit 0 without running.
  --only S1,S2          Run only the named steps (by short name, see STEPS).
  --skip S1,S2          Skip the named steps.
  --force-sync          Pass --force to sync_source_xlsx.py.
  --max-age-days N      Forward to build-metro-boundaries.py. Default 7.
  --skip-verify         Skip tsc + check:client-imports gates.
  --no-color            Disable ANSI color (auto-off when not a TTY).
  --log-dir PATH        Where to write the run log. Default .workbook-sync-log/.
  -h / --help           This help.

Step short names: sync, stage-leagues, extract, nfl, nba, mlb, nhl,
                  international, football, wfootball, wnba, sports-index,
                  boundaries, check-imports, tsc

Exit codes:
  0  full pipeline succeeded (or no-op via --dry-run)
  >0 the index of the first failing step (1-based across the executed slice)

This script is the source of truth for the pipeline order. The SKILL.md at
.claude/skills/workbook-sync/SKILL.md is a thin wrapper telling future Claude
sessions when and how to invoke this.
"""

import argparse
import os
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Callable, List, Optional


PROJECT_ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = PROJECT_ROOT / "scripts"


@dataclass
class Step:
    short: str
    label: str
    cmd: List[str]
    optional_on_no_change: bool = False  # if upstream sync was a no-op
    # outputs to fingerprint for the summary table; mtimes only, not contents
    output_globs: List[str] = field(default_factory=list)


WORKBOOKS_DIR = PROJECT_ROOT / "workbooks"


def steps_plan(args) -> List[Step]:
    sync_cmd = ["python3", str(SCRIPTS / "sync_source_xlsx.py")]
    if args.force_sync:
        sync_cmd.append("--force")
    if args.dry_run:
        # dry-run on the sync step too, so we don't touch the workbook
        sync_cmd.append("--dry-run")

    stage_cmd = ["python3", str(SCRIPTS / "stage-leagues.py")]
    if args.force_sync:
        stage_cmd.append("--force")
    if args.dry_run:
        stage_cmd.append("--dry-run")

    boundary_cmd = ["python3", str(SCRIPTS / "build-metro-boundaries.py")]
    if args.max_age_days is not None:
        boundary_cmd += ["--max-age-days", str(args.max_age_days)]

    # Pass staged paths to each league builder so the build never reads from
    # OneDrive in the hot path. The staging step above is what holds the
    # OneDrive lock risk, and it surfaces a clean error if it can't.
    nfl_path = str(WORKBOOKS_DIR / "NFL_all.xlsx")
    nba_path = str(WORKBOOKS_DIR / "NBA.xlsx")
    nhl_path = str(WORKBOOKS_DIR / "NHL.xlsx")
    mlb_path = str(WORKBOOKS_DIR / "MLB.xlsx")
    cl_path = str(WORKBOOKS_DIR / "Champions League-201516.xlsx")
    otherleagues_path = str(PROJECT_ROOT / "OtherLeagues.xlsx")

    plan = [
        Step("sync",          "1/15  sync MetroAreas.xlsx",
             sync_cmd,
             output_globs=["MetroAreas.xlsx"]),
        Step("stage-leagues", "2/15  stage NFL/NBA/NHL/MLB + Champions League workbooks",
             stage_cmd,
             output_globs=["workbooks/NFL_all.xlsx",
                           "workbooks/NBA.xlsx",
                           "workbooks/NHL.xlsx",
                           "workbooks/MLB.xlsx",
                           "workbooks/Champions League-201516.xlsx"]),
        Step("extract",       "3/15  extract metros + regions + details",
             ["python3", str(SCRIPTS / "extract.py")],
             output_globs=["public/data/metros.json",
                           "public/data/regions.json"]),
        Step("states-directory", "3.5/15  build /states directory + per-state scores",
             ["python3", str(SCRIPTS / "build-states-directory.py"), str(PROJECT_ROOT / "MetroAreas.xlsx")],
             output_globs=["public/data/states-directory.json",
                           "public/data/state-metro-scores.json"]),
        Step("nfl",           "4/15  build NFL data",
             ["python3", str(SCRIPTS / "build-nfl-data.py"), nfl_path],
             output_globs=["public/data/nfl/franchises.json"]),
        Step("nba",           "5/15  build NBA data",
             ["python3", str(SCRIPTS / "build-nba-data.py"), nba_path],
             output_globs=["public/data/nba/franchises.json"]),
        Step("mlb",           "6/15  build MLB data",
             ["python3", str(SCRIPTS / "build-mlb-data.py"), mlb_path],
             output_globs=["public/data/mlb/franchises.json"]),
        Step("nhl",           "7/15  build NHL data",
             ["python3", str(SCRIPTS / "build-nhl-data.py"), nhl_path],
             output_globs=["public/data/nhl/franchises.json"]),
        Step("international", "8/15  build international (national teams, ELO/FIFA)",
             ["python3", str(SCRIPTS / "build-international-data.py"), cl_path],
             output_globs=["public/data/international/index.json"]),
        Step("football",      "9/15  build club football",
             ["python3", str(SCRIPTS / "build-football-data.py"), cl_path],
             output_globs=["public/data/football/index.json"]),
        Step("domestic-cups", "9.5/15 build FA Cup + League Cup (domestic cups)",
             ["python3", str(SCRIPTS / "build-domestic-cups-data.py")],
             output_globs=["public/data/football/domestic-cups.json"]),
        Step("wfootball",     "10/15 build women's football",
             ["python3", str(SCRIPTS / "build-wfootball-data.py")],
             output_globs=["public/data/football/womens-football.json"]),
        Step("wnba",          "11/15 build WNBA",
             ["python3", str(SCRIPTS / "build-wnba-data.py"), otherleagues_path],
             output_globs=["public/data/wnba/data.json"]),
        Step("cfl",           "11.5/15 build CFL",
             ["python3", str(SCRIPTS / "build-cfl-data.py"), otherleagues_path],
             output_globs=["public/data/cfl/data.json"]),
        Step("sports-index",  "12/15  build cross-league sports index",
             ["python3", str(SCRIPTS / "build-sports-index.py")],
             output_globs=["public/data/sports/all-teams.json",
                           "public/data/sports/league-summary.json"]),
        Step("relocations",   "12.5/15 build relocations-by-metro",
             ["python3", str(SCRIPTS / "build-relocations.py")],
             output_globs=["public/data/sports/relocations-by-metro.json",
                           "public/data/sports/relocations-skipped.json"]),
        Step("champion-status", "12.7/15 emit champion banners (nav + sidebar)",
             ["python3", str(SCRIPTS / "emit-champion-status.py")],
             output_globs=["lib/championStatus.generated.ts"]),
        Step("boundaries",    "13/15  refresh metro boundaries (cached)",
             boundary_cmd,
             output_globs=["public/data/boundaries/.build-cache.json"]),
    ]

    if not args.skip_verify:
        plan.append(Step(
            "check-imports", "14/15 verify client-import boundaries",
            ["node", str(SCRIPTS / "check-client-imports.mjs")]))
        # tsc is the slowest of the lot; run it last
        plan.append(Step(
            "tsc",           "15/15 typecheck (tsc --noEmit)",
            # Invoke tsc via node directly (node_modules/typescript/bin/tsc).
            # Avoids npx.cmd on Windows, which subprocess.run cannot resolve
            # without shell=True.
            ["node", str(PROJECT_ROOT / "node_modules" / "typescript" / "bin" / "tsc"), "--noEmit"]))

    if args.only:
        wanted = set(s.strip() for s in args.only.split(","))
        plan = [s for s in plan if s.short in wanted]
    if args.skip:
        unwanted = set(s.strip() for s in args.skip.split(","))
        plan = [s for s in plan if s.short not in unwanted]

    return plan


class Painter:
    def __init__(self, enabled: bool):
        self.enabled = enabled

    def _c(self, code: str, s: str) -> str:
        if not self.enabled:
            return s
        return f"\033[{code}m{s}\033[0m"

    def bold(self, s):  return self._c("1", s)
    def green(self, s): return self._c("32", s)
    def red(self, s):   return self._c("31", s)
    def yellow(self,s): return self._c("33", s)
    def cyan(self, s):  return self._c("36", s)
    def dim(self, s):   return self._c("2", s)


def fingerprint(globs: List[str], step_ran: bool = True) -> str:
    """Summarize the on-disk state of the files a step would normally write.
    When step_ran is False (the step aborted before getting to its outputs),
    suppress 'MISSING' noise; the file simply was not written this run."""
    parts = []
    for g in globs:
        p = PROJECT_ROOT / g
        try:
            st = p.stat()
            mt = datetime.fromtimestamp(st.st_mtime).strftime("%H:%M:%S")
            parts.append(f"{g.split('/')[-1]} {st.st_size}B @{mt}")
        except FileNotFoundError:
            if step_ran:
                parts.append(f"{g.split('/')[-1]} MISSING")
            else:
                parts.append(f"{g.split('/')[-1]} not written")
    return ", ".join(parts) if parts else ""


def run_step(step: Step, painter: Painter, log_fh) -> tuple[int, float]:
    print(painter.bold(painter.cyan(f"\n>>> {step.label}")))
    print(painter.dim("    " + " ".join(step.cmd)))
    log_fh.write(f"\n=== {step.label} ===\n")
    log_fh.write("CMD: " + " ".join(step.cmd) + "\n")
    log_fh.flush()
    t0 = time.time()
    try:
        result = subprocess.run(
            step.cmd, cwd=PROJECT_ROOT, stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT, text=True, check=False)
    except FileNotFoundError as e:
        print(painter.red(f"    ERROR launching: {e}"))
        log_fh.write(f"LAUNCH FAILED: {e}\n")
        return 127, time.time() - t0
    elapsed = time.time() - t0
    log_fh.write(result.stdout or "")
    log_fh.write(f"\nEXIT: {result.returncode}  ({elapsed:.1f}s)\n")
    log_fh.flush()
    # echo tail of stdout to console so user sees progress
    tail = (result.stdout or "").rstrip().splitlines()[-5:]
    for line in tail:
        print("    " + painter.dim(line))
    if result.returncode == 0:
        print(painter.green(f"    OK  ({elapsed:.1f}s)"))
    else:
        print(painter.red(
            f"    FAIL exit={result.returncode}  ({elapsed:.1f}s)"))
    return result.returncode, elapsed


def summary(painter: Painter, results: List[tuple[Step, int, float]]):
    print()
    print(painter.bold("Workbook sync summary"))
    print(painter.bold("---------------------"))
    name_w = max(len(s.short) for s, _, _ in results) if results else 6
    for step, rc, sec in results:
        tag = painter.green("OK  ") if rc == 0 else painter.red("FAIL")
        fp = fingerprint(step.output_globs, step_ran=(rc == 0))
        suffix = "  " + painter.dim(fp) if fp else ""
        print(f"  {tag}  {step.short.ljust(name_w)}  {sec:6.1f}s{suffix}")


def parse_args(argv):
    p = argparse.ArgumentParser(
        description="Workbook sync orchestrator",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--only")
    p.add_argument("--skip")
    p.add_argument("--force-sync", action="store_true")
    p.add_argument("--max-age-days", type=int, default=None)
    p.add_argument("--skip-verify", action="store_true")
    p.add_argument("--no-color", action="store_true")
    p.add_argument("--log-dir", default=".workbook-sync-log")
    return p.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv or sys.argv[1:])
    use_color = not args.no_color and sys.stdout.isatty()
    painter = Painter(use_color)

    plan = steps_plan(args)
    if not plan:
        print(painter.yellow("Nothing to run (everything was --only/--skip'd)."))
        return 0

    log_dir = PROJECT_ROOT / args.log_dir
    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = log_dir / f"sync-{datetime.now():%Y%m%d-%H%M%S}.log"

    print(painter.bold("workbook-sync"))
    print(painter.dim(f"  project: {PROJECT_ROOT}"))
    print(painter.dim(f"  log:     {log_path.relative_to(PROJECT_ROOT)}"))
    print(painter.dim(f"  steps:   " + ", ".join(s.short for s in plan)))
    if args.dry_run:
        print(painter.yellow("\n(dry-run; not executing)"))
        for s in plan:
            print(painter.dim("  - " + " ".join(s.cmd)))
        return 0

    results: List[tuple[Step, int, float]] = []
    with open(log_path, "w") as log_fh:
        log_fh.write(f"workbook-sync start {datetime.now().isoformat()}\n")
        log_fh.write(f"plan: {[s.short for s in plan]}\n")
        for idx, step in enumerate(plan, start=1):
            rc, sec = run_step(step, painter, log_fh)
            results.append((step, rc, sec))
            if rc != 0:
                summary(painter, results)
                print(painter.red(
                    f"\nAborting at step {idx} ({step.short}). "
                    f"See {log_path.relative_to(PROJECT_ROOT)} for full output."))
                return idx
    summary(painter, results)
    print(painter.green("\nAll steps green. "
                        "Ready for the proposed-commit step in the skill."))
    print(painter.dim(f"Full log: {log_path.relative_to(PROJECT_ROOT)}"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
