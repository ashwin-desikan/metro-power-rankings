"""Shared plumbing for the point-in-time company rankings pipeline (Board A).

Bridges to scripts/mktcap/common.py rather than duplicating the Supabase/REST layer
(and its supabase_key.txt lookup, its PostgREST pagination and its in_list quoting).
Stdlib only, same as the rest of the pipeline.
"""
import importlib.util as _ilu
import os, re, sys

# Load scripts/mktcap/common.py BY PATH, not by name. Importing it by name resolves
# back to this file (the script directory is always first on sys.path), which is a
# circular import, not a bridge.
_SRC = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    "mktcap", "common.py")
if not os.path.exists(_SRC):
    sys.exit(f"FATAL: expected the mktcap plumbing at {_SRC}")
_spec = _ilu.spec_from_file_location("mktcap_common", _SRC)
_mk = _ilu.module_from_spec(_spec)
_spec.loader.exec_module(_mk)

fetch_url, log, rest = _mk.fetch_url, _mk.log, _mk.rest
select, select_all, get_key = _mk.select, _mk.select_all, _mk.get_key

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
RAW = os.path.join(OUT, "raw")
os.makedirs(RAW, exist_ok=True)

# Legal-form and filler tokens stripped before keying. Deliberately does NOT strip
# "group"/"holdings" style words that distinguish real companies (Berkshire Hathaway
# vs Berkshire Hills), and does NOT collapse "&" to "and" beyond spacing.
_STOP = re.compile(r"\b(inc|incorporated|corp|corporation|co|company|the|plc|ltd|limited|"
                   r"lp|llc|llp|sa|nv|ag|ab|oyj|spa|se)\b")

# Dotted legal forms must be stripped BEFORE punctuation is flattened: once "L.P."
# has become "l p" the token pass sees two single letters, not a legal form.
# Anchored at the end because that is the only place these legally appear.
_DOTTED_TAIL = re.compile(
    r"[\s,]*\b(l\.?\s?p|l\.?\s?l\.?\s?c|l\.?\s?l\.?\s?p|p\.?\s?l\.?\s?c|s\.?\s?a|"
    r"n\.?\s?v|a\.?\s?g|s\.?\s?p\.?\s?a|s\.?\s?e|inc|corp|co|ltd)\.?\s*$", re.I)


def company_key(name):
    """Stable join key across 70 years of spelling drift. 'Wal-Mart Stores, Inc.' and
    'Walmart Stores' collapse to the same key; 'Ford Motor' and 'Ford' do not."""
    raw = (name or "").lower().strip()
    raw = raw.replace("&", " and ").replace("'", "").replace("’", "")
    base = re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", raw)).strip()

    s = raw
    for _ in range(3):                      # e.g. "Foo Holdings, Inc. L.P."
        s2 = _DOTTED_TAIL.sub("", s)
        if s2 == s:
            break
        s = s2
    trimmed = re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", s)).strip()
    stripped = re.sub(r"\s+", " ", _STOP.sub(" ", trimmed)).strip()

    # Names made entirely of stop words ("The Limited, Inc.", or a row literally
    # named "Co") would key to "" and silently merge every such company into one
    # bucket in the HQ layer. Fall back through progressively less aggressive forms.
    return stripped or trimmed or base


def parse_money(v):
    """'$716,924' -> 716924.0 ; '$382,642.8' -> 382642.8 ; '-$2,722' -> -2722.0.
    Returns None on anything unrecognised, never 0 — a zero would read as a real
    measurement of nothing."""
    if v is None:
        return None
    s = str(v).strip().replace(",", "").replace("$", "")
    if s in ("", "-", "--", "N/A", "n/a", "NA"):
        return None
    neg = s.startswith("(") and s.endswith(")")
    if neg:
        s = s[1:-1]
    try:
        f = float(s)
    except ValueError:
        return None
    return -f if neg else f


def parse_int(v):
    f = parse_money(v)
    return None if f is None else int(round(f))


def pick(data, patterns):
    """Case-insensitive key lookup by regex. Fortune's field names drift across the
    31 years (and the 2013-2014 HQ hole is a missing key, not an empty value), so
    never index the dict directly."""
    for pat in patterns:
        rx = re.compile(pat, re.I)
        for k, v in (data or {}).items():
            if rx.match(k.strip()):
                return v
    return None


FIELD_PATTERNS = {
    "revenue_musd":      [r"^revenues?\s*\(\$m\)$", r"^revenues?$", r"^revenue \(in millions"],
    "profit_musd":       [r"^profits?\s*\(\$m\)$", r"^profits?$"],
    "assets_musd":       [r"^assets\s*\(\$m\)$", r"^assets$"],
    "market_value_musd": [r"^market value\s*\(\$m\)$", r"^market value", r"^valuation"],
    "employees":         [r"^employees$", r"^number of employees$"],
    "sector":            [r"^sector$"],
    "industry":          [r"^industry$"],
    "hq_city":           [r"^headquarters city$", r"^hq ?city$", r"^city$"],
    "hq_state":          [r"^state$", r"^headquarters state$"],
}

ROW_FIELDS = ["source", "year", "rank", "company_key", "company", "revenue_musd",
              "profit_musd", "assets_musd", "market_value_musd", "employees",
              "sector", "industry", "hq_city", "hq_state"]
