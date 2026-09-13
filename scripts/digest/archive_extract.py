#!/usr/bin/env python3
"""Extract story skeletons from a day's socials/substack.md.

Mirrors the mini's archive/extract.py for the eight Windows-era days (2026-06-20,
06-22..06-28) that predate the mini cutover. Mechanical only: it pulls section, source,
headline and url. The `why` is written afterwards from that day's own prose.

Bullet shapes in the source:
    - [Source — "Headline"](https://example.com/article)     -> a story
    - Source — "Headline"                                     -> listed only, no link
    - [Source — "Headline"](https://example.com)              -> homepage, dropped

Usage:
    python archive_extract.py <indir> <outdir>
    python archive_extract.py --self-test
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

# Per-subscriber tracking links. These can carry a token identifying Ashwin's own
# subscription, so they must never reach a public page. Same posture as the mini's
# push_feed.clean_url(), which refused 20 archived links for exactly this reason.
BLOCK_HOST_EXACT = {
    "nl.nytimes.com", "elink.mail.status.news", "l.businessinsider.com",
    "info.sportsbusinessjournal.com", "link.axios.com", "links.morningbrew.com",
}
BLOCK_HOST_PREFIX = ("email.", "click.", "clicks.", "e.", "el.", "mail.", "t.", "link.",
                     "links.", "elink.", "url.", "go.")
BLOCK_PATH_SNIPPET = ("/ss/c/", "/f/newsletter/", "list-manage.com", "/e/", "/CL0/")
BLOCK_URL_SNIPPET = ("google.com/url?", "substack.com/redirect", "beehiiv.com/c/",
                     "mailchi.mp", "sendgrid.net")

DROP_PARAMS = {"utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
               "ref", "attribution_id", "fbclid", "gclid", "mc_cid", "mc_eid",
               "source", "_bhlid", "triedRedirect"}

BULLET = re.compile(r"^\s*[-*]\s+(.*\S)\s*$")
MD_LINK = re.compile(r"^\[(?P<text>.+?)\]\((?P<url>https?://[^\s)]+)\)\s*$")
DASHES = re.compile(r"\s+[—–-]\s+")


def clean_url(raw: str) -> str | None:
    """Return a safe, canonical article URL, or None if it must not be published."""
    try:
        p = urlsplit(raw.strip())
    except ValueError:
        return None
    if p.scheme not in ("http", "https") or not p.netloc:
        return None

    host = p.netloc.lower().split(":")[0]
    low = raw.lower()

    if host in BLOCK_HOST_EXACT:
        return None
    if any(host.startswith(pre) for pre in BLOCK_HOST_PREFIX):
        return None
    if any(s in low for s in BLOCK_PATH_SNIPPET):
        return None
    if any(s in low for s in BLOCK_URL_SNIPPET):
        return None

    q = [(k, v) for k, v in parse_qsl(p.query, keep_blank_values=True)
         if k.lower() not in DROP_PARAMS]
    path = p.path.rstrip("/")

    # A bare domain is the newsletter's front page, not a story. The mini dropped 279.
    if not path and not q:
        return None

    return urlunsplit((p.scheme, host, path or "/", urlencode(q), ""))


def split_label(text: str) -> tuple[str | None, str]:
    """'Puck — "How J.D. Vance Pivoted"' -> ('Puck', 'How J.D. Vance Pivoted')"""
    text = re.sub(r"\*\*?(.+?)\*\*?", r"\1", text).strip()  # strip md emphasis
    parts = DASHES.split(text, maxsplit=1)
    if len(parts) == 2 and len(parts[0]) <= 60:
        source, headline = parts[0].strip(), parts[1].strip()
    else:
        source, headline = None, text
    headline = headline.strip().strip('"').strip("“”").strip()
    return (source or None), headline


def extract(path: Path) -> dict:
    date = path.stem.split("-substack")[0]
    section = None
    stories, dropped = [], {"no_link": 0, "blocked": 0, "homepage": 0, "no_headline": 0}
    seen_urls: set[str] = set()

    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("## "):
            section = line[3:].strip()
            continue
        m = BULLET.match(line)
        if not m:
            continue
        body = m.group(1).strip()

        link = MD_LINK.match(body)
        if not link:
            dropped["no_link"] += 1
            continue

        url = clean_url(link.group("url"))
        if url is None:
            raw_low = link.group("url").lower()
            key = "homepage" if not urlsplit(raw_low).path.rstrip("/") else "blocked"
            dropped[key] += 1
            continue
        if url in seen_urls:
            continue
        seen_urls.add(url)

        source, headline = split_label(link.group("text"))
        if not headline or len(headline) < 6:
            dropped["no_headline"] += 1
            continue

        stories.append({
            "position": len(stories) + 1,
            "section": section or "",
            "source_name": source or "Unknown",
            "headline": headline,
            "url": url,
            "why": "",          # written from the day's prose afterwards
            "entities": [],
        })

    return {"digest_date": date, "items": stories, "dropped": dropped}


def self_test() -> None:
    cases = [
        ("https://www.democracydocket.com", None),                       # homepage
        ("https://nl.nytimes.com/f/newsletter/abc123", None),            # per-subscriber
        ("https://l.businessinsider.com/a/zc/tok", None),
        ("https://elink.mail.status.news/ss/c/xyz", None),
        ("https://www.google.com/url?q=http://x.com", None),
        ("https://puck.news/how-jd-vance-pivoted-on-israel/",
         "https://puck.news/how-jd-vance-pivoted-on-israel"),
        ("https://www.businessinsider.com/cannes-2026-6?utm_source=nl&ref=x",
         "https://www.businessinsider.com/cannes-2026-6"),
    ]
    bad = 0
    for raw, want in cases:
        got = clean_url(raw)
        if got != want:
            print(f"  FAIL clean_url({raw!r}) -> {got!r}, want {want!r}")
            bad += 1

    s, h = split_label('Puck — "How J.D. Vance Pivoted on Israel"')
    if (s, h) != ("Puck", "How J.D. Vance Pivoted on Israel"):
        print(f"  FAIL split_label -> {(s, h)!r}")
        bad += 1
    s, h = split_label("The Athletic — Cape Verde reach the knockouts")
    if s != "The Athletic":
        print(f"  FAIL split_label source -> {s!r}")
        bad += 1

    print("self-test:", "OK" if bad == 0 else f"{bad} FAILURE(S)")
    sys.exit(1 if bad else 0)


def main() -> None:
    if "--self-test" in sys.argv:
        self_test()
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    indir, outdir = Path(sys.argv[1]), Path(sys.argv[2])
    outdir.mkdir(parents=True, exist_ok=True)

    total = 0
    for f in sorted(indir.glob("*-substack.md")):
        res = extract(f)
        (outdir / f"{res['digest_date']}.json").write_text(
            json.dumps(res, indent=2, ensure_ascii=False), encoding="utf-8")
        total += len(res["items"])
        print(f"{res['digest_date']}: {len(res['items'])} stories, dropped {res['dropped']}")
    print(f"TOTAL {total} stories across {len(list(outdir.glob('*.json')))} days")


if __name__ == "__main__":
    main()
