#!/usr/bin/env python3
"""publish_guard.py - decides whether a freshly generated public/data/metros.json
may be published.

Compares an "old" metros.json (default: the version committed at HEAD) against
a "new" one (default: the working tree's public/data/metros.json, i.e. what
scripts/extract.py just wrote) and holds the publish when any of seven rules
trips. A hold is a signal to the caller (mac-mini-jobs/runners/metro-rankings.sh)
to restore public/data and not commit.

Usage:
  python3 scripts/metro_sync/publish_guard.py [--old PATH_OR_REF] [--new PATH]
                                               [--json] [--report PATH.md]
  python3 scripts/metro_sync/publish_guard.py --self-test

--old defaults to `git show HEAD:public/data/metros.json`.
--new defaults to public/data/metros.json.
--old/--new accept a plain filesystem path, or a git rev spec of the form
  ref:path (e.g. HEAD~1:public/data/metros.json) which is resolved with
  `git show`.

Exit codes: 0 pass or no_change, 20 held, 1 error (bad input, parse failure).

No em dashes anywhere in this file's output text.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple

ROOT = Path(__file__).resolve().parents[2]

# ---------------------------------------------------------------------------
# Thresholds. Each is a module constant, overridable by the named env var.
# ---------------------------------------------------------------------------

# Rule 3: a metro ranked in the OLD top 100 may not move more than this many
# places (up or down) without holding. Guards against a feed fault silently
# reshuffling the metros people actually look at.
TOP100_MAX_MOVE = int(os.environ.get("METRO_GUARD_TOP100_MAX_MOVE", "10"))

# Rule 4: no metro's `score` field (the 1-decimal figure that is all the JSON
# carries) may change by more than this in one run.
SCORE_MAX_DELTA = float(os.environ.get("METRO_GUARD_SCORE_MAX_DELTA", "3.0"))

# Rule 5: the sum of dims.marketCap (in the real file: the top-level
# `marketCap` field) over all metros may not change by more than this percent.
MKTCAP_MAX_PCT = float(os.environ.get("METRO_GUARD_MKTCAP_MAX_PCT", "15.0"))

# Rule 6: the count of metros with score <= 0 may not RISE by more than this
# many between old and new.
ZERO_SCORE_MAX_RISE = int(os.environ.get("METRO_GUARD_ZERO_SCORE_MAX_RISE", "50"))

# Rule 7: the new file must have at least this many metros, or it is held as
# a feed fault regardless of anything else.
MIN_METROS = int(os.environ.get("METRO_GUARD_MIN_METROS", "1000"))

# How many climbers/fallers to report, and the rank window they are drawn
# from (top 500 of the NEW ranking, per the spec).
REPORT_TOP_N = 15
REPORT_RANK_WINDOW = 500


class GuardError(Exception):
    pass


def _load_json_path_or_ref(spec: str) -> Tuple[list, str]:
    """Returns (parsed_json, human_label). Accepts a filesystem path, or a
    git rev spec REF:PATH resolved via `git show`."""
    p = Path(spec)
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8")), str(p)
        except Exception as exc:
            raise GuardError(f"failed to parse {spec}: {exc}")
    # Try to resolve as a git ref:path.
    if ":" in spec:
        try:
            out = subprocess.run(
                ["git", "-C", str(ROOT), "show", spec],
                capture_output=True, text=True, check=True,
            )
        except subprocess.CalledProcessError as exc:
            raise GuardError(f"git show {spec} failed: {exc.stderr.strip()}")
        try:
            return json.loads(out.stdout), spec
        except Exception as exc:
            raise GuardError(f"failed to parse git show {spec}: {exc}")
    raise GuardError(f"{spec}: not a file and not a git ref:path")


def _default_old() -> Tuple[list, str]:
    try:
        out = subprocess.run(
            ["git", "-C", str(ROOT), "show", "HEAD:public/data/metros.json"],
            capture_output=True, text=True, check=True,
        )
    except subprocess.CalledProcessError as exc:
        raise GuardError(f"git show HEAD:public/data/metros.json failed: {exc.stderr.strip()}")
    try:
        return json.loads(out.stdout), "HEAD:public/data/metros.json"
    except Exception as exc:
        raise GuardError(f"failed to parse HEAD:public/data/metros.json: {exc}")


def _by_slug(metros: list) -> Dict[str, dict]:
    out = {}
    for m in metros:
        slug = m.get("slug")
        if slug is not None:
            out[slug] = m
    return out


def evaluate(old_metros: list, new_metros: list) -> dict:
    """Runs all seven rules and returns a result dict. Does not raise for a
    held run; GuardError is reserved for input-parse failures."""
    reasons: List[str] = []
    reports: List[str] = []

    if not isinstance(new_metros, list) or not new_metros:
        return {
            "status": "held",
            "reasons": [f"new file failed to parse into a non-empty metro list"],
            "reports": [],
            "summary": {},
        }

    # Rule 7 first: bad shape holds regardless of anything else below.
    if len(new_metros) < MIN_METROS:
        reasons.append(
            f"new file has {len(new_metros)} metros, fewer than the minimum {MIN_METROS}"
        )

    old_by_slug = _by_slug(old_metros)
    new_by_slug = _by_slug(new_metros)

    old_count = len(old_metros)
    new_count = len(new_metros)

    # Rule 1: count falls at all.
    if new_count < old_count:
        reasons.append(f"metro count fell from {old_count} to {new_count}")
    elif new_count > old_count:
        reports.append(f"metro count rose from {old_count} to {new_count}")

    # Rule 2: slugs dropped / added.
    old_slugs = set(old_by_slug)
    new_slugs = set(new_by_slug)
    dropped = sorted(old_slugs - new_slugs)
    added = sorted(new_slugs - old_slugs)
    if dropped:
        shown = ", ".join(dropped[:25])
        more = f" (+{len(dropped) - 25} more)" if len(dropped) > 25 else ""
        reasons.append(f"{len(dropped)} slug(s) present in old, missing in new: {shown}{more}")
    if added:
        shown = ", ".join(added[:25])
        more = f" (+{len(added) - 25} more)" if len(added) > 25 else ""
        reports.append(f"{len(added)} new slug(s): {shown}{more}")

    common = old_slugs & new_slugs

    # Rule 3: old top-100 metro moves more than TOP100_MAX_MOVE places.
    top100_old = {s: old_by_slug[s].get("rank") for s in common if (old_by_slug[s].get("rank") or 10**9) <= 100}
    big_moves = []
    for slug, old_rank in top100_old.items():
        new_rank = new_by_slug[slug].get("rank")
        if old_rank is None or new_rank is None:
            continue
        move = abs(new_rank - old_rank)
        if move > TOP100_MAX_MOVE:
            big_moves.append((slug, old_by_slug[slug].get("name", slug), old_rank, new_rank, move))
    if big_moves:
        big_moves.sort(key=lambda t: -t[4])
        shown = "; ".join(f"{n} ({o}->{new_})" for _, n, o, new_, _mv in big_moves[:15])
        more = f" (+{len(big_moves) - 15} more)" if len(big_moves) > 15 else ""
        reasons.append(
            f"{len(big_moves)} metro(s) ranked in the old top 100 moved more than "
            f"{TOP100_MAX_MOVE} places: {shown}{more}"
        )

    # Rule 4: score changes by more than SCORE_MAX_DELTA.
    score_jumps = []
    for slug in common:
        old_score = old_by_slug[slug].get("score")
        new_score = new_by_slug[slug].get("score")
        if old_score is None or new_score is None:
            continue
        delta = abs(new_score - old_score)
        if delta > SCORE_MAX_DELTA:
            score_jumps.append((slug, old_by_slug[slug].get("name", slug), old_score, new_score, delta))
    if score_jumps:
        score_jumps.sort(key=lambda t: -t[4])
        shown = "; ".join(f"{n} ({o}->{new_})" for _, n, o, new_, _d in score_jumps[:15])
        more = f" (+{len(score_jumps) - 15} more)" if len(score_jumps) > 15 else ""
        reasons.append(
            f"{len(score_jumps)} metro(s) changed score by more than {SCORE_MAX_DELTA}: "
            f"{shown}{more}"
        )

    # Rule 5: sum of marketCap changes by more than MKTCAP_MAX_PCT.
    old_mktcap_total = sum((m.get("marketCap") or 0) for m in old_metros)
    new_mktcap_total = sum((m.get("marketCap") or 0) for m in new_metros)
    if old_mktcap_total > 0:
        pct = abs(new_mktcap_total - old_mktcap_total) / old_mktcap_total * 100.0
        if pct > MKTCAP_MAX_PCT:
            reasons.append(
                f"total marketCap changed by {pct:.2f} percent "
                f"({old_mktcap_total:.0f} -> {new_mktcap_total:.0f}), more than {MKTCAP_MAX_PCT} percent"
            )
    elif new_mktcap_total > 0:
        reasons.append(
            f"total marketCap went from 0 to {new_mktcap_total:.0f} (old total was 0, cannot compute percent)"
        )

    # Rule 6: count of score<=0 metros rises by more than ZERO_SCORE_MAX_RISE.
    old_zero = sum(1 for m in old_metros if (m.get("score") if m.get("score") is not None else 1) <= 0)
    new_zero = sum(1 for m in new_metros if (m.get("score") if m.get("score") is not None else 1) <= 0)
    zero_rise = new_zero - old_zero
    if zero_rise > ZERO_SCORE_MAX_RISE:
        reasons.append(
            f"count of metros with score <= 0 rose by {zero_rise} (from {old_zero} to {new_zero}), "
            f"more than {ZERO_SCORE_MAX_RISE}"
        )

    # --- summary (built regardless of hold, useful either way) ---
    changed = 0
    max_move = None
    max_move_who = None
    climbers = []  # (rank_delta_negative_is_climb, name, old_rank, new_rank, score_delta)
    fallers = []
    for slug in common:
        o = old_by_slug[slug]
        n = new_by_slug[slug]
        o_rank, n_rank = o.get("rank"), n.get("rank")
        o_score, n_score = o.get("score"), n.get("score")
        o_mkt, n_mkt = o.get("marketCap"), n.get("marketCap")
        rank_delta = None
        if o_rank is not None and n_rank is not None:
            rank_delta = n_rank - o_rank
        score_delta = None
        if o_score is not None and n_score is not None:
            score_delta = n_score - o_score
        any_diff = False
        if rank_delta not in (None, 0):
            any_diff = True
        if score_delta not in (None, 0):
            any_diff = True
        if o_mkt != n_mkt:
            any_diff = True
        if any_diff:
            changed += 1
        if rank_delta is not None:
            if max_move is None or abs(rank_delta) > max_move:
                max_move = abs(rank_delta)
                max_move_who = f"{n.get('name', slug)} ({o_rank}->{n_rank})"
        if n_rank is not None and n_rank <= REPORT_RANK_WINDOW and rank_delta is not None and rank_delta != 0:
            entry = (rank_delta, n.get("name", slug), o_rank, n_rank, score_delta)
            if rank_delta < 0:
                climbers.append(entry)
            else:
                fallers.append(entry)

    climbers.sort(key=lambda t: t[0])          # most negative (biggest climb) first
    fallers.sort(key=lambda t: -t[0])          # most positive (biggest fall) first

    summary = {
        "metros_changed": changed,
        "max_rank_move": max_move,
        "max_rank_move_who": max_move_who,
        "old_count": old_count,
        "new_count": new_count,
        "old_marketcap_total": old_mktcap_total,
        "new_marketcap_total": new_mktcap_total,
        "top_climbers": [
            {"name": name, "old_rank": o, "new_rank": n, "score_delta": sd}
            for (_d, name, o, n, sd) in climbers[:REPORT_TOP_N]
        ],
        "top_fallers": [
            {"name": name, "old_rank": o, "new_rank": n, "score_delta": sd}
            for (_d, name, o, n, sd) in fallers[:REPORT_TOP_N]
        ],
    }

    if reasons:
        status = "held"
    elif changed == 0 and old_count == new_count and not dropped and not added:
        status = "no_change"
    else:
        status = "pass"

    return {
        "status": status,
        "reasons": reasons,
        "reports": reports,
        "summary": summary,
    }


def render_report_md(result: dict, old_label: str, new_label: str) -> str:
    s = result["summary"]
    lines = []
    lines.append(f"# metro-rankings publish guard report")
    lines.append("")
    lines.append(f"- old: {old_label}")
    lines.append(f"- new: {new_label}")
    lines.append(f"- status: {result['status']}")
    lines.append("")
    if result["reasons"]:
        lines.append("## Hold reasons")
        for r in result["reasons"]:
            lines.append(f"- {r}")
        lines.append("")
    if result["reports"]:
        lines.append("## Reported, not held")
        for r in result["reports"]:
            lines.append(f"- {r}")
        lines.append("")
    if s:
        lines.append("## Summary")
        lines.append(f"- metros changed: {s.get('metros_changed')}")
        lines.append(f"- max rank move: {s.get('max_rank_move')} ({s.get('max_rank_move_who')})")
        lines.append(f"- metro count: {s.get('old_count')} -> {s.get('new_count')}")
        lines.append(
            f"- total marketCap: {s.get('old_marketcap_total'):.0f} -> {s.get('new_marketcap_total'):.0f}"
        )
        lines.append("")
        lines.append("### Top climbers (within new top 500)")
        if s.get("top_climbers"):
            for c in s["top_climbers"]:
                lines.append(f"- {c['name']}: {c['old_rank']} -> {c['new_rank']} (score delta {c['score_delta']})")
        else:
            lines.append("- none")
        lines.append("")
        lines.append("### Top fallers (within new top 500)")
        if s.get("top_fallers"):
            for c in s["top_fallers"]:
                lines.append(f"- {c['name']}: {c['old_rank']} -> {c['new_rank']} (score delta {c['score_delta']})")
        else:
            lines.append("- none")
        lines.append("")
    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------------------
# self-test
# ---------------------------------------------------------------------------

def _mk(slug, rank, score, mktcap=1000.0, name=None):
    return {"slug": slug, "rank": rank, "name": name or slug.title(), "score": score, "marketCap": mktcap}


def _base_lists(n=1200):
    old = [_mk(f"m{i}", i, max(0.1, 100.0 - i * 0.05)) for i in range(1, n + 1)]
    new = [dict(m) for m in old]
    return old, new


def self_test() -> int:
    fails = []

    def check(name, cond):
        if not cond:
            fails.append(name)

    # Benign: identical copies pass as no_change.
    old, new = _base_lists()
    r = evaluate(old, new)
    check("benign identical -> no_change", r["status"] == "no_change")

    # Benign: a small score wobble and a couple of rank swaps within bounds
    # passes without holding.
    old, new = _base_lists()
    new[500]["score"] = round(new[500]["score"] + 1.0, 1)
    new[600]["rank"], new[601]["rank"] = new[601]["rank"], new[600]["rank"]
    r = evaluate(old, new)
    check("benign small changes -> pass", r["status"] == "pass" and not r["reasons"])

    # Rule 1: count falls.
    old, new = _base_lists()
    new = new[:-5]
    r = evaluate(old, new)
    check("rule1 count falls -> held", r["status"] == "held" and any("count fell" in x for x in r["reasons"]))

    # Rule 1 inverse: count rises is reported, not held.
    old, new = _base_lists()
    new = new + [_mk("mnew1", len(new) + 1, 5.0)]
    r = evaluate(old, new)
    check("rule1 count rises -> reported not held", r["status"] != "held" and any("rose" in x for x in r["reports"]))

    # Rule 2: dropped slug.
    old, new = _base_lists()
    del new[10]
    r = evaluate(old, new)
    check("rule2 dropped slug -> held", r["status"] == "held" and any("missing in new" in x for x in r["reasons"]))

    # Rule 2 inverse: new slug reported.
    old, new = _base_lists()
    new.append(_mk("mextra", len(new) + 1, 3.0))
    r = evaluate(old, new)
    check("rule2 new slug -> reported", any("new slug" in x for x in r["reports"]))

    # Rule 3: top-100 metro moves too far.
    old, new = _base_lists()
    new[4]["rank"], new[95]["rank"] = new[95]["rank"], new[4]["rank"]
    r = evaluate(old, new)
    check("rule3 top100 big move -> held", r["status"] == "held" and any("old top 100 moved" in x for x in r["reasons"]))

    # Rule 4: score jump.
    old, new = _base_lists()
    new[50]["score"] = round(new[50]["score"] + 10.0, 1)
    r = evaluate(old, new)
    check("rule4 score jump -> held", r["status"] == "held" and any("changed score" in x for x in r["reasons"]))

    # Rule 5: marketCap sum swings too much.
    old, new = _base_lists()
    for m in new:
        m["marketCap"] = m["marketCap"] * 2.0
    r = evaluate(old, new)
    check("rule5 marketcap swing -> held", r["status"] == "held" and any("marketCap changed" in x for x in r["reasons"]))

    # Rule 6: zero-score count rises too much.
    old, new = _base_lists()
    for i in range(60):
        new[i]["score"] = 0.0
    r = evaluate(old, new)
    check("rule6 zero-score rise -> held", r["status"] == "held" and any("score <= 0 rose" in x for x in r["reasons"]))

    # Rule 7: too few metros.
    old, new = _base_lists()
    new = new[:500]
    r = evaluate(old, new)
    check("rule7 too few metros -> held", r["status"] == "held" and any("fewer than the minimum" in x for x in r["reasons"]))

    # Rule 7: unparseable new.
    r = evaluate(old, {"not": "a list"})
    check("rule7 bad shape -> held", r["status"] == "held")

    if fails:
        print(f"self-test: {len(fails)} FAILURE(S): {', '.join(fails)}")
        return 1
    print(f"self-test OK ({12} cases)")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--old", default=None, help="path or REF:path (default: HEAD:public/data/metros.json)")
    ap.add_argument("--new", default=str(ROOT / "public" / "data" / "metros.json"))
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--report", default=None, help="write a human-readable report to this path")
    args = ap.parse_args()

    if args.self_test:
        return self_test()

    try:
        if args.old:
            old_metros, old_label = _load_json_path_or_ref(args.old)
        else:
            old_metros, old_label = _default_old()
        new_metros, new_label = _load_json_path_or_ref(args.new)
    except GuardError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    try:
        result = evaluate(old_metros, new_metros)
    except Exception as exc:
        print(f"ERROR: guard evaluation failed: {exc}", file=sys.stderr)
        return 1

    if args.report:
        Path(args.report).parent.mkdir(parents=True, exist_ok=True)
        Path(args.report).write_text(render_report_md(result, old_label, new_label), encoding="utf-8")

    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(f"status: {result['status']}")
        for r in result["reasons"]:
            print(f"HOLD REASON: {r}")
        for r in result["reports"]:
            print(f"reported: {r}")
        s = result["summary"]
        if s:
            print(f"metros changed: {s.get('metros_changed')}")
            print(f"max rank move: {s.get('max_rank_move')} ({s.get('max_rank_move_who')})")
            print(f"marketCap total: {s.get('old_marketcap_total'):.0f} -> {s.get('new_marketcap_total'):.0f}")

    if result["status"] == "held":
        return 20
    return 0


if __name__ == "__main__":
    sys.exit(main())
