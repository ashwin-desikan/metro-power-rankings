"""Python-side coverage for the metro Score engine.

These run in CI, where the 36MB MetroAreas.xlsx does not exist, so everything
here is pure decision logic. The workbook comparison lives in
`scripts/metro_score/parity.py` and runs locally via `npm run check:score-parity`.
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from metro_score import score as score_mod  # noqa: E402
from metro_score import sources, weights as weights_mod  # noqa: E402
from metro_score.parity import self_test  # noqa: E402


@pytest.fixture(scope="module")
def w():
    return weights_mod.load()


@pytest.fixture
def blank():
    return {c: 0.0 for c in ("AU", "AV", "AY", "AZ", "BA", "AX", "BC", "BD", "BE",
                             "BF", "BB", "AS", "BR", "AQ", "AR")}


def test_self_test_passes():
    """The engine's own --self-test is the gate the refresh scripts run."""
    assert self_test() == 0


def test_weights_file_is_valid():
    assert weights_mod.load().version == 1


@pytest.mark.parametrize("bad", [
    {},
    {"version": 1},
    {"version": 1, "terms": {}, "columns": {}},
    {"version": 99, "terms": {}, "columns": {}},
])
def test_weights_validation_refuses_to_guess(bad):
    """A silently-defaulted weight is the one failure parity cannot catch."""
    with pytest.raises(weights_mod.WeightsError):
        weights_mod.validate(bad)


def test_weights_rejects_an_unknown_term(w):
    raw = {"version": 1, "terms": dict(w.terms), "columns": dict(w.columns)}
    raw["terms"]["skyscrapers_v2"] = {"log_multiplier": 1}
    with pytest.raises(weights_mod.WeightsError, match="unknown term"):
        weights_mod.validate(raw)


def test_weights_rejects_out_of_order_gdp_bands(w):
    raw = {"version": 1, "terms": dict(w.terms), "columns": dict(w.columns)}
    raw["terms"] = dict(raw["terms"])
    raw["terms"]["gdp_band"] = {"bands": [[10, 0.5], [500, 3.0]], "floor": 0.0}
    with pytest.raises(weights_mod.WeightsError, match="high threshold first"):
        weights_mod.validate(raw)


def test_excel_text_key_is_case_insensitive_but_does_not_trim():
    """Excel COUNTIFS semantics. Trimming here would break parity, not fix data."""
    assert sources.key("New York") == sources.key("NEW YORK")
    assert sources.key("Osnabruck ") != sources.key("Osnabruck")


def test_column_letters():
    assert (sources.A("A"), sources.A("Z"), sources.A("AA"), sources.A("BG")) == (0, 25, 26, 58)


def test_log_matches_excel_iferror(w):
    assert score_mod.log10(0) == 0.0
    assert score_mod.log10(-1) == 0.0
    assert score_mod.log10(1000) == pytest.approx(3.0)


def test_other_teams_term_has_no_floor(w, blank):
    """13 metros score negative here today. Faithful on purpose; see score.py."""
    t = score_mod.score_terms(0, 0, dict(blank, AQ=0, AR=2), 0, 0, w)
    assert t["other_teams"] == pytest.approx(-0.5)


def test_caps_are_caps(w, blank):
    assert score_mod.score_terms(0, 0, dict(blank, AR=99, AQ=99), 0, 0, w)[
        "major_league_teams"] == 10.0
    assert score_mod.score_terms(0, 0, dict(blank, AQ=999, AR=0), 0, 0, w)[
        "other_teams"] == 10.0
    assert score_mod.score_terms(0, 0, dict(blank, AS=999), 0, 0, w)[
        "sporting_events"] == 4.0


@pytest.mark.parametrize("gdp,want", [
    (501, 3.0), (500, 2.0), (200.01, 2.0), (200, 1.0),
    (50.5, 1.0), (50, 0.5), (10.1, 0.5), (10, 0.0), (-5, 0.0),
])
def test_gdp_bands_on_both_sides_of_every_boundary(w, blank, gdp, want):
    assert score_mod.score_terms(0, 0, dict(blank, BR=gdp), 0, 0, w)["gdp_band"] == want


def test_gawc_blank_is_zero_not_a_division_error(w, blank):
    assert score_mod.score_terms(0, 0, dict(blank), 0, 0, w)["gawc"] == 0.0
    assert score_mod.score_terms(0, 1, dict(blank), 0, 0, w)["gawc"] == 12.0


def test_term_order_sums_every_term_exactly_once(w, blank):
    terms = score_mod.score_terms(0, 0, dict(blank), 0, 0, w)
    assert sorted(score_mod.TERM_ORDER) == sorted(terms)
    assert len(set(score_mod.TERM_ORDER)) == len(score_mod.TERM_ORDER)


def test_total_is_the_ordered_sum(w, blank):
    terms = score_mod.score_terms(1_500_000, 4, dict(blank, AQ=6, AR=2, BR=60), 1, 3, w)
    assert score_mod.total(terms) == pytest.approx(
        sum(terms[t] for t in score_mod.TERM_ORDER), abs=1e-12)


def test_aq_excludes_the_double_counted_column():
    """AQ is SUM(K:AN) minus V, because NCAA W is already inside U."""
    assert score_mod.AQ_EXCLUDES == "V"
    assert "V" in score_mod.TEAM_COLS
    assert len(score_mod.TEAM_COLS) == len(set(score_mod.TEAM_COLS))
