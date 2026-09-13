#!/usr/bin/env python3
"""
check-wikidata-overrides.py - weekly reconciliation of curated leader overrides.

CURATED_OVERRIDES (in refresh-current-leaders.py) hardcode a country's head of
government because Wikidata is wrong/stale for it. Unlike the validator PINS -
which fail LOUD (a real change makes the scrape disagree and the sanity gate HOLDs
the commit) - an override silently AUTO-APPLIES its value every run. So if a real
leadership change happens in an overridden country, we would keep serving the old
leader and never notice. This check closes that gap.

For each override it asks what refresh-current-leaders.py would PUBLISH from
Wikidata with the override removed (its own build_entry), and compares that with
the override and with the known-wrong value Wikidata returned when the override
was created (WD_SEEN):

  * WD output == the override, second row included -> Wikidata FIXED: override
    redundant, remove it.                                     [ntfy, low priority]
  * WD's head of government matches, but the published entry would NOT (wrong
    lead role, or the monarch/second row differs) -> PARTIAL: keep the override.
                                                                [printed, silent]
  * WD head of government == the known-wrong value (or empty) -> unchanged.  [silent]
  * WD head of government == anything else -> Wikidata CHANGED to a NEW value: a
    possible REAL leadership change we are masking (or fresh vandalism). [ntfy, high]

🔴 Why PARTIAL exists (2026-09-13). This check used to compare the head-of-
government NAME only, and pinged "remove override" for Belgium the moment Wikidata
returned Bart De Wever. But Belgium's override also carries the monarch row, and
Wikidata files Belgium's form as "federation", not a monarchy, so build_entry would
publish "Philippe of Belgium (Pres.)": the exact monarch-as-president bug the
override was added to fix (2026-09-07). Removing it on that ping would have
reintroduced it. Now a "remove" ping means removal is proven safe.

Best-effort monitor: always exits 0, never blocks the weekly job. (india/israel are
PINNED but not overridden, so a real change there is already caught loud by the gate.)
Offline self-test: --self-test.
"""
import importlib.util, os, sys, urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RL = os.path.join(REPO, "scripts", "leaders", "refresh-current-leaders.py")

# What Wikidata (wrongly) returned for the head of government when each override was
# created. The check stays silent while WD keeps returning this; it alerts the moment
# WD returns anything else. Keep this in sync with CURATED_OVERRIDES.
WD_SEEN = {
    "saudi-arabia": "Salman bin Abdulaziz Al Saud",  # the King, mislabeled PM
    "kuwait":       "Sabah Al-Khalid Al-Sabah",      # stale (left PM role 2022)
    "belgium":      "Philippe of Belgium",           # the King filed as P6 (2026-09)
}

def _load_rl():
    spec = importlib.util.spec_from_file_location("rl", RL)
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    return m

def _ntfy(title, body, priority="default"):
    topic = os.environ.get("NTFY_TOPIC")
    if not topic:
        print(f"[ntfy skipped: NTFY_TOPIC unset] {title}: {body}"); return
    server = os.environ.get("NTFY_SERVER", "https://ntfy.sh").rstrip("/")
    try:
        req = urllib.request.Request(
            f"{server}/{topic}", data=body.encode("utf-8"),
            headers={"Title": title, "Priority": priority, "Tags": "crown,warning"})
        tok = os.environ.get("NTFY_TOKEN")
        if tok:
            req.add_header("Authorization", f"Bearer {tok}")
        urllib.request.urlopen(req, timeout=15).read()
    except Exception as e:
        print(f"[ntfy failed: {e}] {title}: {body}")

def _mismatch(rl, ov, derived):
    """Why the entry Wikidata would publish differs from the override, or None if it reproduces it."""
    if not derived:
        return "Wikidata would publish nothing"
    if rl.bare(derived["name"]) != rl.bare(ov["name"]) or derived.get("role") != ov.get("role"):
        return f"lead would be {rl.bare(derived['name'])!r} ({derived.get('role')}), override has {rl.bare(ov['name'])!r} ({ov.get('role')})"
    want, got = ov.get("second"), derived.get("second")
    if want:
        if not got:
            return f"no second row; override has {rl.bare(want['name'])!r} ({want.get('role')})"
        if rl.bare(got["name"]) != rl.bare(want["name"]) or got.get("role") != want.get("role"):
            return (f"second would be {rl.bare(got['name'])!r} ({got.get('role')}), "
                    f"override has {rl.bare(want['name'])!r} ({want.get('role')})")
    return None

def classify(rl, slug, ov, info):
    """-> ("fixed", wd_now) | ("partial", reason) | ("unchanged", None) | ("changed", (seen, wd_now, forced))."""
    forced = rl.bare(ov["name"])
    wd_now = (info.get("hog") or info.get("hos") or "").strip()
    seen = WD_SEEN.get(slug, "")
    if wd_now and rl.bare(wd_now) == forced:
        derived = rl.build_entry(slug, info.get("hos"), info.get("hog"), info.get("office"),
                                 info.get("form", ""), info.get("hos_start"), info.get("hog_start"))
        why = _mismatch(rl, ov, derived)
        return ("fixed", wd_now) if why is None else ("partial", why)
    if (not wd_now) or wd_now == seen:
        return ("unchanged", None)
    return ("changed", (seen, wd_now, forced))

def main():
    rl = _load_rl()
    slug_iso = rl.load_slug_iso()
    try:
        wd = rl.query_wikidata()
    except Exception as e:
        print(f"wikidata query failed ({e}); skipping override audit (no-op)")
        return
    fixed, partial, changed, unchanged = [], [], [], []
    for slug, ov in rl.CURATED_OVERRIDES.items():
        iso = slug_iso.get(slug)
        kind, detail = classify(rl, slug, ov, wd.get(iso, {}) if iso else {})
        {"fixed": fixed, "partial": partial, "changed": changed, "unchanged": unchanged}[kind].append((slug, detail))

    for slug, name in fixed:
        print(f"FIXED   {slug}: Wikidata now reproduces the override ({name!r}) -- override redundant, remove it")
    for slug, why in partial:
        print(f"PARTIAL {slug}: head of government matches, but without the override {why} -- keep it")
    for slug, (seen, now, forced) in changed:
        print(f"CHANGED {slug}: Wikidata now {now!r} (was {seen!r}; we force {forced!r}) -- POSSIBLE REAL CHANGE, review")
    for slug, _ in unchanged:
        print(f"ok      {slug}: Wikidata still the known-wrong value; override still needed")

    if fixed:
        _ntfy("Leaders: Wikidata caught up - remove override(s)",
              "\n".join(f"{s}: WD now = {n} (reproduces our override, second row included)" for s, n in fixed),
              "default")
    if changed:
        _ntfy("Leaders: Wikidata CHANGED - possible real handover we're masking",
              "\n".join(f"{s}: WD now '{now}' but we force '{f}' - REVIEW: real change or vandalism?"
                        for s, (_, now, f) in changed),
              "high")
    print(f"override audit: {len(fixed)} fixed, {len(partial)} partial, {len(changed)} changed, {len(unchanged)} unchanged")

def self_test():
    rl = _load_rl()
    be = {"name": "Bart De Wever", "role": "PM", "since": "2025-02-03",
          "second": {"name": "👑 Philippe", "role": "Monarch"}}
    # The 2026-09-13 live values: WD's PM is right, but "federation" is not a monarchy.
    live = {"hos": "Philippe of Belgium", "hog": "Bart De Wever", "office": "Prime Minister of Belgium",
            "form": "federation", "hos_start": "2013-07-21", "hog_start": "2025-02-03"}
    kind, why = classify(rl, "belgium", be, live)
    assert kind == "partial", (kind, why)
    # Head of government still the known-wrong value -> unchanged.
    assert classify(rl, "belgium", be, {**live, "hog": "Philippe of Belgium"})[0] == "unchanged"
    # A brand-new head of government -> changed.
    assert classify(rl, "belgium", be, {**live, "hog": "Someone Else"})[0] == "changed"
    # An override with no second row, reproduced exactly by WD -> fixed.
    rep = rl.build_entry("testland", None, "Jane Roe", "Prime Minister of Testland", "parliamentary republic")
    ov = {"name": rep["name"], "role": rep["role"]}
    assert classify(rl, "testland", ov, {"hog": "Jane Roe", "office": "Prime Minister of Testland",
                                          "form": "parliamentary republic"})[0] == "fixed"
    # A second row that WD reproduces with the same name and role -> fixed; a different role -> partial.
    mon = rl.build_entry("testland", "King Olaf", "Jane Roe", "Prime Minister of Testland", "constitutional monarchy")
    if mon and mon.get("second"):
        info = {"hos": "King Olaf", "hog": "Jane Roe", "office": "Prime Minister of Testland", "form": "constitutional monarchy"}
        assert classify(rl, "testland", dict(mon), info)[0] == "fixed", classify(rl, "testland", dict(mon), info)
        wrong = {**mon, "second": {**mon["second"], "role": "Pres."}}
        assert classify(rl, "testland", wrong, info)[0] == "partial"
    print("check-wikidata-overrides self-test OK (belgium live case -> partial:", why + ")")

if __name__ == "__main__":
    if "--self-test" in sys.argv:
        self_test()
    else:
        main()
