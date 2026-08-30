# -*- coding: utf-8 -*-
"""Next-election dates for the forecast pipeline, read from lib/electionHubsMeta.ts.

WHY THIS FILE EXISTS
    The forecast used to carry its own hardcoded election dates. On 2026-08-30
    build_forecast.py still modelled New Zealand as 17 October 2026, labelled
    "assumed", while lib/electionHubsMeta.ts already carried the announced date
    of 7 November 2026. Two sources of truth in one repo, and the wrong one was
    feeding months_until(), which sets the horizon term in every sigma.

    So the hub table is now the single source of election dates and this module
    is the only way the pipeline reads them.

CONTRACT
    confirmed_date(code)  -> date | None
        Returns a date ONLY when the hub marks it nextConfidence:"confirmed",
        i.e. officially set. Anything else returns None, and the caller keeps
        its own documented modelling assumption. That split is deliberate: the
        hub's "expected" dates are latest-permissible sort keys, not forecasts,
        and silently adopting them would move published seat ranges.

    hub_date(code)        -> (date | None, confidence)
        The raw pair, for callers that want to reason about it themselves.

Stdlib only, to match the rest of scripts/forecast/.
"""
import os
import re
import sys
from datetime import date

META = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "..", "lib", "electionHubsMeta.ts"
)

# One hub literal per line in the ELECTION_HUBS table. Keyed on `code:` rather
# than the object key so a renamed key cannot silently orphan a date.
_ROW = re.compile(r'\bcode:\s*"(?P<code>[a-z]{2})"')
_DATE = re.compile(r'\bnextDate:\s*"(?P<date>\d{4}-\d{2}-\d{2})"')
_CONF = re.compile(r'\bnextConfidence:\s*"(?P<conf>confirmed|expected|unscheduled)"')

_cache = None


def _load(text=None):
    """Parse the hub table into {code: (date|None, confidence)}."""
    if text is None:
        with open(META, encoding="utf-8") as fh:
            text = fh.read()
    out = {}
    for line in text.splitlines():
        row = _ROW.search(line)
        if not row or "href:" not in line:
            continue
        d = _DATE.search(line)
        c = _CONF.search(line)
        conf = c.group("conf") if c else "expected"
        parsed = None
        if d:
            y, m, dd = (int(x) for x in d.group("date").split("-"))
            parsed = date(y, m, dd)
        if conf == "unscheduled":
            parsed = None
        out[row.group("code")] = (parsed, conf)
    return out


def table():
    global _cache
    if _cache is None:
        _cache = _load()
    return _cache


def hub_date(code):
    return table().get(code, (None, "expected"))


def confirmed_date(code):
    d, conf = hub_date(code)
    return d if conf == "confirmed" else None


def resolve(code, fallback, label=None):
    """The date the model should use, plus a confidence string for the payload.

    Prefers a confirmed hub date. Falls back to the caller's own assumption and
    says so on stdout when the two disagree, so a divergence is visible in the
    run log instead of hiding in a seat range.
    """
    d, conf = hub_date(code)
    name = label or code.upper()
    if conf == "confirmed" and d is not None:
        if d != fallback:
            print(
                "  %s: using CONFIRMED hub date %s (script fallback was %s)"
                % (name, d.isoformat(), fallback.isoformat())
            )
        return d, "confirmed"
    if d is not None and d != fallback:
        print(
            "  %s: hub expects %s, model keeps its own assumption %s"
            % (name, d.isoformat(), fallback.isoformat())
        )
    return fallback, "assumed"


# ---------------------------------------------------------------- self-test --

_FIXTURE = '\n'.join([
    'export const ELECTION_HUBS: Record<string, ElectionHubMeta> = {',
    '  nz: { code: "nz", flag: "nz", name: "New Zealand", href: "/elections/nz", last: "x", next: "general election, 7 November 2026", nextDate: "2026-11-07", nextConfidence: "confirmed" },',
    '  uk: { code: "uk", flag: "gb", name: "United Kingdom", href: "/elections/uk", last: "x", next: "general election, expected 2029", nextDate: "2029-08-15", nextConfidence: "expected" },',
    '  ua: { code: "ua", flag: "ua", name: "Ukraine", href: "/elections/ua", last: "x", next: "suspended under martial law", nextConfidence: "unscheduled" },',
    '  xx: { code: "xx", flag: "xx", name: "No fields", href: "/elections/xx", last: "x", next: "who knows" },',
    '};',
])


def _self_test():
    fails = []

    def check(label, got, want):
        if got != want:
            fails.append("%s: got %r, want %r" % (label, got, want))

    t = _load(_FIXTURE)
    # A confirmed date parses and is offered to the model.
    check("nz date", t["nz"], (date(2026, 11, 7), "confirmed"))
    # An expected date parses but must NOT be treated as confirmed: this is the
    # guard that stops a latest-permissible sort key becoming a modelled date.
    check("uk date", t["uk"], (date(2029, 8, 15), "expected"))
    # Unscheduled drops the date even if one were present.
    check("ua date", t["ua"], (None, "unscheduled"))
    # A hub with no structured fields at all degrades to expected/None rather
    # than raising, so adding a hub can never break the pipeline.
    check("xx date", t["xx"], (None, "expected"))

    global _cache
    saved, _cache = _cache, t
    try:
        # resolve() takes the confirmed date over the caller's fallback...
        got, conf = resolve("nz", date(2026, 10, 17), "New Zealand")
        check("resolve confirmed", (got, conf), (date(2026, 11, 7), "confirmed"))
        # ...and keeps the caller's assumption when the hub is only expecting.
        got, conf = resolve("uk", date(2029, 5, 3), "United Kingdom")
        check("resolve expected", (got, conf), (date(2029, 5, 3), "assumed"))
        # An unknown code must not explode.
        got, conf = resolve("zz", date(2030, 1, 1))
        check("resolve unknown", (got, conf), (date(2030, 1, 1), "assumed"))
    finally:
        _cache = saved

    # The real file must parse, and every hub in it must carry a confidence.
    live = _load()
    if len(live) < 30:
        fails.append("live table parsed only %d hubs" % len(live))
    for code, (d, conf) in sorted(live.items()):
        if conf == "confirmed" and d is None:
            fails.append("%s is confirmed with no date" % code)
        if conf == "unscheduled" and d is not None:
            fails.append("%s is unscheduled but has a date" % code)

    if fails:
        print("SELF-TEST FAILED")
        for f in fails:
            print("  -", f)
        return 1
    print("hub_dates self-test OK (%d hubs, %d confirmed)"
          % (len(live), sum(1 for d, c in live.values() if c == "confirmed")))
    return 0


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        sys.exit(_self_test())
    for code, (d, conf) in sorted(table().items()):
        print("%-3s %-11s %s" % (code, conf, d.isoformat() if d else "-"))
