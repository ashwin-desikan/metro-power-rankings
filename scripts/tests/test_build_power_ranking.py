import pytest

from conftest import load_module_from_path

bpr = load_module_from_path("build_power_ranking", "build-power-ranking.py")


class TestBare:
    def test_strips_warning_marker(self):
        assert bpr._bare("⚠️ Donald Trump") == "Donald Trump"

    def test_strips_crown_marker(self):
        assert bpr._bare("\U0001f451 Xi Jinping") == "Xi Jinping"

    def test_plain_name_unchanged(self):
        assert bpr._bare("Jerome Powell") == "Jerome Powell"

    def test_none_returns_empty_string(self):
        assert bpr._bare(None) == ""


class TestRegime:
    def test_full_democracy_gives_minimum_multiplier(self):
        assert bpr.regime("free-land", {"free-land": 1.0}, bpr.W) == pytest.approx(bpr.W["natl_min"])

    def test_full_autocracy_gives_maximum_multiplier(self):
        assert bpr.regime("autocracy", {"autocracy": 0.0}, bpr.W) == pytest.approx(bpr.W["natl_max"])

    def test_missing_slug_defaults_to_midpoint_democracy_score(self):
        expected = bpr.W["natl_max"] - (bpr.W["natl_max"] - bpr.W["natl_min"]) * 0.5
        assert bpr.regime("unknown-country", {}, bpr.W) == pytest.approx(expected)

    def test_partial_democracy_interpolates_linearly(self):
        w = dict(natl_min=0.5, natl_max=1.0)
        assert bpr.regime("mid", {"mid": 0.25}, w) == pytest.approx(0.875)


class TestResolveMetro:
    MROWS = [
        {"slug": "new-york", "name": "New York", "score": 100, "stateSlug": "new-york-state", "countrySlug": "united-states"},
        {"slug": "los-angeles", "name": "Los Angeles", "score": 80, "stateSlug": "california", "countrySlug": "united-states"},
        {"slug": "sacramento", "name": "Sacramento", "score": 20, "stateSlug": "california", "countrySlug": "united-states"},
    ]
    MSLUGS = {r["slug"] for r in MROWS}
    MNAMEOF = {r["slug"]: r["name"] for r in MROWS}

    def test_direct_slug_match(self):
        name, slug = bpr.resolve_metro("new-york", self.MROWS, self.MSLUGS, self.MNAMEOF)
        assert (name, slug) == ("New York", "new-york")

    def test_unresolvable_direct_slug_falls_back_to_state(self):
        name, slug = bpr.resolve_metro("nonexistent", self.MROWS, self.MSLUGS, self.MNAMEOF, state_slug="california")
        # Highest-scored metro in California wins.
        assert (name, slug) == ("Los Angeles", "los-angeles")

    def test_falls_back_to_country_when_no_state_match(self):
        name, slug = bpr.resolve_metro(None, self.MROWS, self.MSLUGS, self.MNAMEOF, country_slug="united-states")
        assert (name, slug) == ("New York", "new-york")

    def test_state_checked_before_country(self):
        name, slug = bpr.resolve_metro(None, self.MROWS, self.MSLUGS, self.MNAMEOF, country_slug="united-states", state_slug="california")
        assert (name, slug) == ("Los Angeles", "los-angeles")

    def test_no_match_returns_text_fallback_with_empty_slug(self):
        name, slug = bpr.resolve_metro(None, self.MROWS, self.MSLUGS, self.MNAMEOF, text_fallback="Some Country")
        assert (name, slug) == ("Some Country", "")


class TestComputePowerEntry:
    def test_builds_entry_with_rounded_fields(self):
        e = bpr.compute_power_entry("Jane Doe", "Role", "Cat", "Jurisdiction", 12.345, 0.6789, metro="Metro", metro_slug="metro-slug")
        assert e == dict(
            name="Jane Doe", role="Role", category="Cat", jurisdiction="Jurisdiction",
            metro="Metro", metroSlug="metro-slug",
            jscore=12.3, weight=0.679, power=round(12.345 * 0.6789, 1),
        )

    def test_zero_jscore_excludes_entry(self):
        assert bpr.compute_power_entry("N", "R", "C", "J", 0, 1.0) is None

    def test_zero_weight_excludes_entry(self):
        assert bpr.compute_power_entry("N", "R", "C", "J", 10, 0) is None

    def test_none_jscore_excludes_entry(self):
        assert bpr.compute_power_entry("N", "R", "C", "J", None, 1.0) is None


class TestDedupeAndRank:
    def test_sorts_by_power_descending(self):
        entries = [
            dict(name="A", power=10),
            dict(name="B", power=50),
            dict(name="C", power=30),
        ]
        top = bpr.dedupe_and_rank(entries)
        assert [e["name"] for e in top] == ["B", "C", "A"]

    def test_dedupes_case_insensitive_bare_name_keeping_highest_power(self):
        entries = [
            dict(name="⚠️ Donald Trump", power=100),
            dict(name="donald trump", power=50),
            dict(name="DONALD TRUMP", power=999),
        ]
        top = bpr.dedupe_and_rank(entries)
        assert len(top) == 1
        assert top[0]["power"] == 999  # sorted by power desc first, so the highest wins the dedup.

    def test_respects_limit(self):
        entries = [dict(name=f"Person {i}", power=i) for i in range(10)]
        top = bpr.dedupe_and_rank(entries, limit=3)
        assert len(top) == 3
        assert [e["name"] for e in top] == ["Person 9", "Person 8", "Person 7"]

    def test_distinct_names_all_kept(self):
        entries = [dict(name="Alice", power=10), dict(name="Bob", power=20)]
        top = bpr.dedupe_and_rank(entries)
        assert len(top) == 2


class TestMemsum:
    def test_sums_scores_of_members_only(self):
        corgs = {
            "france": {"EU": "Member"},
            "germany": {"EU": "Member"},
            "united-kingdom": {"EU": "Former Member"},
            "canada": {},
        }
        cscore = {"france": 10.0, "germany": 20.0, "united-kingdom": 100.0, "canada": 5.0}
        assert bpr.memsum("EU", corgs, cscore) == pytest.approx(30.0)

    def test_missing_country_score_defaults_to_zero(self):
        corgs = {"nowhere": {"EU": "Member"}}
        assert bpr.memsum("EU", corgs, {}) == 0


class TestJurisHref:
    CNAME2SLUG = {"United States": "united-states", "France": "france"}
    SNAME2SLUG = {"California": "california"}
    CNAME = {"vatican-city": "Holy See"}

    def test_jhref_override_takes_priority(self):
        e = dict(name="Special Person", category="National", jurisdiction="United States")
        href = bpr.juris_href(e, self.CNAME2SLUG, self.SNAME2SLUG, self.CNAME, {"Special Person": "/custom"})
        assert href == "/custom"

    def test_national_category_links_to_country(self):
        e = dict(name="Leader", category="National", jurisdiction="France")
        assert bpr.juris_href(e, self.CNAME2SLUG, self.SNAME2SLUG, self.CNAME, {}) == "/countries/france"

    def test_sub_national_links_to_state(self):
        e = dict(name="Governor", category="Sub-national", jurisdiction="California")
        assert bpr.juris_href(e, self.CNAME2SLUG, self.SNAME2SLUG, self.CNAME, {}) == "/states/california"

    def test_mayor_links_to_metro_ranking(self):
        e = dict(name="Mayor", category="Mayor", jurisdiction="Some City", metroSlug="some-city")
        assert bpr.juris_href(e, self.CNAME2SLUG, self.SNAME2SLUG, self.CNAME, {}) == "/rankings/some-city"

    def test_mayor_without_metro_slug_yields_empty(self):
        e = dict(name="Mayor", category="Mayor", jurisdiction="Some City")
        assert bpr.juris_href(e, self.CNAME2SLUG, self.SNAME2SLUG, self.CNAME, {}) == ""

    def test_org_in_org_set_links_to_orgs_page(self):
        e = dict(name="Sec-Gen", category="Org", jurisdiction="UN")
        assert bpr.juris_href(e, self.CNAME2SLUG, self.SNAME2SLUG, self.CNAME, {}) == "/orgs"

    def test_org_not_in_org_set_yields_empty(self):
        e = dict(name="Someone", category="Org", jurisdiction="Not A Real Org")
        assert bpr.juris_href(e, self.CNAME2SLUG, self.SNAME2SLUG, self.CNAME, {}) == ""

    def test_sport_uses_sport_href_map(self):
        e = dict(name="Commissioner", category="Sport", jurisdiction="FIFA")
        assert bpr.juris_href(e, self.CNAME2SLUG, self.SNAME2SLUG, self.CNAME, {}) == "/teams/national"

    def test_unresolvable_country_yields_empty(self):
        e = dict(name="Nobody", category="National", jurisdiction="Nowhereland")
        assert bpr.juris_href(e, self.CNAME2SLUG, self.SNAME2SLUG, self.CNAME, {}) == ""

    def test_faith_holy_see_links_to_vatican(self):
        e = dict(name="Pope", category="Faith", jurisdiction="Holy See")
        assert bpr.juris_href(e, self.CNAME2SLUG, self.SNAME2SLUG, self.CNAME, {}) == "/countries/vatican-city"

    def test_unhandled_category_yields_empty(self):
        e = dict(name="X", category="Something Else", jurisdiction="Y")
        assert bpr.juris_href(e, self.CNAME2SLUG, self.SNAME2SLUG, self.CNAME, {}) == ""
