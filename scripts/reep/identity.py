#!/usr/bin/env python3
"""Football club identity resolver for the Python scrapers (the twin of lib/teamIdentity.ts).

    from scripts.reep.identity import IdentityIndex, resolve_team
    idx = IdentityIndex("name")                     # one request per provider, then in-memory
    r = idx.resolve("OB Odense", country="Denmark")  # -> ("resolved", TeamIdentity(...))
    r = idx.resolve("Juventus")                      # -> ("ambiguous", [..Italy.., ..Switzerland..])
    r = idx.resolve("Nonsuch FC")                    # -> ("unknown", [])

Exact after normalisation, never fuzzy. Workbook name columns outrank Reep labels, which outrank Reep
community aliases; the workbook's api-football ids outrank Reep's api_football bridge. Reads only public
tables through the anon key, so it works from any machine that can reach Supabase.

    python3 scripts/reep/identity.py name "OB Odense"        # CLI smoke test
"""
import json, re, sys, unicodedata, urllib.request
from dataclasses import dataclass
from typing import Optional

SUPA = "https://nmprqkmymrdknffwnuur.supabase.co"
ANON = ("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tcHJxa215bXJka25mZndudXVyIiwicm9sZSI6ImFub24i"
        "LCJpYXQiOjE3ODMyMDkzNDMsImV4cCI6MjA5ODc4NTM0M30.4RXU3mQ-Yl81ZqC2_a10aizKGu_87B4vt8OK5Pi_-sM")

TRANSLIT = str.maketrans({"ł": "l", "Ł": "L", "ø": "o", "Ø": "O", "đ": "d", "Đ": "D", "ß": "ss", "æ": "ae", "Æ": "Ae",
                          "œ": "oe", "Œ": "Oe", "ð": "d", "Ð": "D", "þ": "th", "Þ": "Th", "ı": "i", "ħ": "h", "Ħ": "H"})
INITIALISM = re.compile(r"\b(?:[A-Za-z]\.){2,}")

def normalise(s: str) -> str:
    """Same as reep_join_clubs.strict_norm and SQL public.football_name_norm."""
    s = INITIALISM.sub(lambda m: m.group(0).replace(".", ""), s or "")
    s = unicodedata.normalize("NFKD", s.translate(TRANSLIT)).encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", s)).strip()

@dataclass
class TeamIdentity:
    sheet_row: int
    team: str
    country: str
    reep_v1_id: Optional[str]
    lookup_id: Optional[int]
    matched_key: str
    rung: str

def _rank(rung: str) -> int:
    if rung.startswith("workbook:"): return 0
    if rung in ("reep:label", "reep v1", "reep v0", "corroborated-mint", "first-party"): return 1
    return 2

def _decide(hits):
    if not hits: return "unknown", []
    if len(hits) == 1: return "resolved", hits[0]
    best = min(_rank(h.rung) for h in hits); top = [h for h in hits if _rank(h.rung) == best]
    if len(top) == 1: return "resolved", top[0]
    return "ambiguous", hits

def _get(path: str):
    req = urllib.request.Request(f"{SUPA}/rest/v1/{path}", headers={"apikey": ANON, "Authorization": f"Bearer {ANON}"})
    with urllib.request.urlopen(req, timeout=60) as r: return json.loads(r.read().decode("utf-8"))

def _post(path: str, body: dict):
    req = urllib.request.Request(f"{SUPA}/rest/v1/{path}", data=json.dumps(body).encode(), method="POST",
                                 headers={"apikey": ANON, "Authorization": f"Bearer {ANON}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r: return json.loads(r.read().decode("utf-8"))

def resolve_team(provider: str, key: str, country: Optional[str] = None):
    """One round trip. For a whole feed build an IdentityIndex instead."""
    rows = _post("rpc/resolve_football_team", {"p_provider": provider, "p_key": key, "p_country": country})
    return _decide([TeamIdentity(r["sheet_row"], r["team"], r["country"], r.get("reep_v1_id"), r.get("lookup_id"), r.get("matched_key") or "", r.get("rung") or "") for r in rows])

class IdentityIndex:
    def __init__(self, provider: str):
        self.provider = provider; self.by_norm = {}
        page, off = 1000, 0
        while True:
            rows = _get(f"football_identity_alias?provider=eq.{provider}&select=key,key_norm,sheet_row,reep_v1_id,country,rung,football_team_reep(team,lookup_id)&order=id.asc&offset={off}&limit={page}")
            for r in rows:
                n = r.get("football_team_reep") or {}
                self.by_norm.setdefault(r["key_norm"], []).append(TeamIdentity(r["sheet_row"], n.get("team", ""), r["country"], r.get("reep_v1_id"), n.get("lookup_id"), r["key"], r.get("rung") or ""))
            if len(rows) < page: break
            off += page
        self.size = sum(len(v) for v in self.by_norm.values())

    def resolve(self, key: str, country: Optional[str] = None):
        hits = [h for h in self.by_norm.get(normalise(key), []) if not country or h.country == country]
        per_row = {}
        for h in hits:
            if h.sheet_row not in per_row or _rank(h.rung) < _rank(per_row[h.sheet_row].rung): per_row[h.sheet_row] = h
        return _decide(list(per_row.values()))

if __name__ == "__main__":
    prov, key = sys.argv[1], sys.argv[2]; country = sys.argv[3] if len(sys.argv) > 3 else None
    print(resolve_team(prov, key, country))
