"""Column-letter -> 0-based index, matching scripts/metro_score/sources.py's
A(). Duplicated here (rather than imported) so metro_sync has no import-time
dependency on metro_score; both engines must agree on this mapping, checked
by test_metro_sync.py."""


def A(letter: str) -> int:
    n = 0
    for ch in letter.upper():
        n = n * 26 + (ord(ch) - 64)
    return n - 1
