from extract import (
    slugify,
    safe_int,
    safe_float,
    safe_str,
    _normalize_league,
    _normalize_venue_name,
    _slugify_state,
)


class TestSlugify:
    def test_basic(self):
        assert slugify("New York") == "new-york"

    def test_strips_diacritics(self):
        assert slugify("São Paulo") == "sao-paulo"
        assert slugify("Zürich") == "zurich"
        assert slugify("Köln") == "koln"

    def test_transliterates_beyond_latin1(self):
        """The 2026-08-09 repair. slugify used to hand-list about thirty
        Latin-1 characters and DELETE everything else, so Łódź became `od` and
        Huế became `hu` - live URLs for metros of nearly a million people. The
        damage clustered in Poland, Romania, Turkey, Czechia and Bosnia, which
        made it a coverage bias rather than a typo. These cases exist so the
        hand-list can never come back."""
        assert slugify("Łódź") == "lodz"
        assert slugify("Huế") == "hue"
        assert slugify("Niš") == "nis"
        assert slugify("Częstochowa") == "czestochowa"
        assert slugify("Diyarbakır") == "diyarbakir"
        assert slugify("Muğla") == "mugla"

    def test_collapses_whitespace_and_punctuation(self):
        assert slugify("  Washington -- Baltimore  ") == "washington-baltimore"

    def test_separators_become_hyphens_not_nothing(self):
        """Also the 2026-08-09 repair. A slash or en dash used to be deleted
        rather than replaced, running compound names together: `bielbienne`,
        `bloomingtonnormal`, `bydgoszcztorun`. This assertion previously
        encoded the bug - it expected `dallasfort-worth` - and so kept failing
        CI after the fix landed."""
        assert slugify("Dallas/Fort Worth") == "dallas-fort-worth"
        assert slugify("Biel/Bienne") == "biel-bienne"
        assert slugify("Bloomington–Normal") == "bloomington-normal"

    def test_lowercases(self):
        assert slugify("SAN FRANCISCO") == "san-francisco"

    def test_empty_string(self):
        assert slugify("") == ""

    def test_only_punctuation_yields_empty(self):
        assert slugify("!!!") == ""


class TestSafeInt:
    def test_valid_int_string(self):
        assert safe_int("42") == 42

    def test_valid_float_string_truncates_via_value_error(self):
        # int("3.5") raises ValueError, so this falls back to the default.
        assert safe_int("3.5") == 0

    def test_none_returns_default(self):
        assert safe_int(None) == 0
        assert safe_int(None, default=-1) == -1

    def test_invalid_string_returns_default(self):
        assert safe_int("not a number", default=7) == 7

    def test_actual_float_truncates(self):
        assert safe_int(3.9) == 3


class TestSafeFloat:
    def test_valid_string(self):
        assert safe_float("3.14") == 3.14

    def test_none_returns_default(self):
        assert safe_float(None) == 0.0
        assert safe_float(None, default=-1.5) == -1.5

    def test_invalid_string_returns_default(self):
        assert safe_float("abc", default=2.0) == 2.0


class TestSafeStr:
    def test_strips_whitespace(self):
        assert safe_str("  hello  ") == "hello"

    def test_none_returns_empty_string(self):
        assert safe_str(None) == ""

    def test_coerces_non_string(self):
        assert safe_str(42) == "42"


class TestNormalizeLeague:
    def test_maps_major_venues_to_notable_venues(self):
        assert _normalize_league("Major Venues") == "Notable Venues"

    def test_passes_through_other_leagues(self):
        assert _normalize_league("NFL") == "NFL"

    def test_handles_none(self):
        assert _normalize_league(None) == ""


class TestNormalizeVenueName:
    def test_aliases_only_apply_to_notable_venues(self):
        assert _normalize_venue_name("Notable Venues", "New Wembley Stadium") == "Wembley Stadium"
        assert _normalize_venue_name("Notable Venues", "The O2 Arena") == "O2 Arena"

    def test_non_aliased_venue_passes_through(self):
        assert _normalize_venue_name("Notable Venues", "Madison Square Garden") == "Madison Square Garden"

    def test_alias_ignored_outside_notable_venues(self):
        # Same string, different league: not a venue row, so no rewrite.
        assert _normalize_venue_name("NFL", "New Wembley Stadium") == "New Wembley Stadium"


class TestSlugifyState:
    def test_basic(self):
        assert _slugify_state("California") == "california"

    def test_strips_diacritics(self):
        assert _slugify_state("Québec") == "quebec"

    def test_handles_punctuation(self):
        assert _slugify_state("Washington, D.C.") == "washington-d-c"

    def test_empty_or_none_returns_empty_string(self):
        assert _slugify_state("") == ""
        assert _slugify_state(None) == ""

    def test_collapses_repeated_dashes(self):
        assert _slugify_state("A---B") == "a-b"
