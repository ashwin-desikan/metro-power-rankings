"""Load and validate scripts/metro_score_weights.json.

score.py must contain no numeric literals. That rule only holds if a missing or
misspelled key is an error rather than a default, because a silently-defaulted
weight is the one failure a parity test cannot catch: the score changes, the
test still passes against a workbook that changed the same way, and nobody
learns anything until a ranking looks wrong months later.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Optional

WEIGHTS_PATH = Path(__file__).resolve().parent.parent / "metro_score_weights.json"

# The exact shape score.py expects. Validation is a whitelist in both
# directions: every key here must exist, and no key outside it may.
REQUIRED_TERMS: Dict[str, tuple] = {
    "population": ("divisor",),
    "market_cap": ("divisor",),
    "major_league_teams": ("per_team", "cap_points"),
    "other_teams": ("per_team", "cap_teams"),
    "culture_infra": ("per_item",),
    "airports": ("per_point",),
    "top50_universities": ("per_university", "rank_max"),
    "other_top_institutions": ("per_institution",),
    "metro_stations": ("log_multiplier",),
    "gawc": ("numerator",),
    "suburban_rail": ("log_multiplier",),
    "train_hubs": ("log_multiplier",),
    "skyscrapers": ("log_multiplier",),
    "sporting_events": ("per_event", "cap_points"),
    "annual_events": ("per_event",),
    "luxury_hospitality": ("log_multiplier",),
    "gdp_band": ("bands", "floor"),
}
REQUIRED_COLUMNS = (
    "top_university_rank_max", "hospital_weight", "research_weight",
    "football_tiers", "airport_class_points", "nfl_partial_share_threshold",
)


class WeightsError(ValueError):
    """Raised when the weights file cannot be trusted."""


class Weights:
    """Access with a loud failure on anything unrecognised."""

    def __init__(self, raw: Dict[str, Any]):
        self.version = raw["version"]
        self.terms: Dict[str, Dict[str, Any]] = raw["terms"]
        self.columns: Dict[str, Any] = raw["columns"]

    def term(self, name: str, key: str) -> Any:
        try:
            return self.terms[name][key]
        except KeyError as exc:  # pragma: no cover - validate() precedes this
            raise WeightsError(f"weights: no term {name}.{key}") from exc

    def col(self, key: str) -> Any:
        try:
            return self.columns[key]
        except KeyError as exc:  # pragma: no cover
            raise WeightsError(f"weights: no columns.{key}") from exc


def validate(raw: Dict[str, Any]) -> None:
    if not isinstance(raw, dict):
        raise WeightsError("weights: top level is not an object")
    for key in ("version", "terms", "columns"):
        if key not in raw:
            raise WeightsError(f"weights: missing top-level '{key}'")
    if raw["version"] != 1:
        raise WeightsError(f"weights: unsupported version {raw['version']!r}")

    terms = raw["terms"]
    missing = sorted(set(REQUIRED_TERMS) - set(terms))
    extra = sorted(set(terms) - set(REQUIRED_TERMS))
    if missing:
        raise WeightsError(f"weights: missing term(s) {missing}")
    if extra:
        raise WeightsError(f"weights: unknown term(s) {extra} - typo, or score.py is behind")
    for name, keys in REQUIRED_TERMS.items():
        got = terms[name]
        if not isinstance(got, dict):
            raise WeightsError(f"weights: term {name} is not an object")
        m = sorted(set(keys) - set(got))
        e = sorted(set(got) - set(keys))
        if m:
            raise WeightsError(f"weights: term {name} missing {m}")
        if e:
            raise WeightsError(f"weights: term {name} has unknown key(s) {e}")

    cols = raw["columns"]
    m = sorted(set(REQUIRED_COLUMNS) - set(cols))
    if m:
        raise WeightsError(f"weights: missing columns key(s) {m}")

    bands = terms["gdp_band"]["bands"]
    if not bands or any(len(b) != 2 for b in bands):
        raise WeightsError("weights: gdp_band.bands must be [[threshold, points], ...]")
    thresholds = [b[0] for b in bands]
    if thresholds != sorted(thresholds, reverse=True):
        raise WeightsError("weights: gdp_band.bands must be ordered high threshold first")

    if "_unclassified" not in cols["airport_class_points"]:
        raise WeightsError("weights: airport_class_points needs an '_unclassified' fallback")


def load(path: Optional[Path] = None) -> Weights:
    p = path or WEIGHTS_PATH
    try:
        raw = json.loads(p.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise WeightsError(f"weights: {p} not found") from exc
    except json.JSONDecodeError as exc:
        raise WeightsError(f"weights: {p} is not valid JSON ({exc})") from exc
    raw.pop("_readme", None)
    validate(raw)
    return Weights(raw)
