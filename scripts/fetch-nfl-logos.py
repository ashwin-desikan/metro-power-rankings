#!/usr/bin/env python3
"""
One-shot logo fetcher for NFL team pages.

Runs locally on the user's machine (Cowork's egress allowlist blocks
Wikipedia/Wikimedia). Downloads each franchise's primary logo SVG from
Wikipedia via the Special:FilePath redirect into public/data/nfl/logos/.

After running, the team-detail and team-index pages will render the
SVG instead of the colored monogram fallback. If a file is missing,
the page silently falls back to the monogram.

Usage:
  python scripts/fetch-nfl-logos.py
  python scripts/fetch-nfl-logos.py --force      # overwrite existing
  python scripts/fetch-nfl-logos.py --slug green-bay-packers   # one team

Notes on licensing:
  The current NFL primary logos are copyrighted. Wikipedia hosts them
  under fair use for editorial purposes. The rankings site is editorial.
  This is the same posture Pro Football Reference and FiveThirtyEight
  use. If you want to ship under a stricter posture, swap the URLs for
  team wordmarks on Commons (which are mostly public domain).
"""

import argparse
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = REPO_ROOT / "public" / "data" / "nfl" / "logos"

# Wikipedia file names for each franchise's primary logo. Where a team's
# article uses a non-obvious filename, the comment notes why. The URL
# template uses Special:FilePath which resolves to the actual hosted file
# regardless of which hash subdirectory it lives in.
WIKI_FILES = {
    "arizona-cardinals":    "Arizona Cardinals logo.svg",
    "atlanta-falcons":      "Atlanta Falcons logo.svg",
    "baltimore-ravens":     "Baltimore Ravens logo.svg",
    "buffalo-bills":        "Buffalo Bills logo.svg",
    "carolina-panthers":    "Carolina Panthers logo.svg",
    "chicago-bears":        "Chicago Bears logo.svg",
    "cincinnati-bengals":   "Cincinnati Bengals logo.svg",
    "cleveland-browns":     "Cleveland Browns logo.svg",
    "dallas-cowboys":       "Dallas Cowboys.svg",            # team-name file, not "logo"
    "denver-broncos":       "Denver Broncos logo.svg",
    "detroit-lions":        "Detroit Lions logo.svg",
    "green-bay-packers":    "Green Bay Packers logo.svg",
    "houston-texans":       "Houston Texans logo.svg",
    "indianapolis-colts":   "Indianapolis Colts logo.svg",
    "jacksonville-jaguars": "Jacksonville Jaguars logo.svg",
    "kansas-city-chiefs":   "Kansas City Chiefs logo.svg",
    "las-vegas-raiders":    "Las Vegas Raiders logo.svg",
    "los-angeles-chargers": "Los Angeles Chargers logo.svg",
    "los-angeles-rams":     "Los Angeles Rams logo.svg",
    "miami-dolphins":       "Miami Dolphins logo.svg",
    "minnesota-vikings":    "Minnesota Vikings logo.svg",
    "new-england-patriots": "New England Patriots logo.svg",
    "new-orleans-saints":   "New Orleans Saints logo new.svg",   # "new" suffix on the 2017 redesign
    "new-york-giants":      "New York Giants logo.svg",
    "new-york-jets":        "New York Jets logo.svg",
    "philadelphia-eagles":  "Philadelphia Eagles logo.svg",
    "pittsburgh-steelers":  "Pittsburgh Steelers logo.svg",
    "san-francisco-49ers":  "San Francisco 49ers logo.svg",
    "seattle-seahawks":     "Seattle Seahawks logo.svg",
    "tampa-bay-buccaneers": "Tampa Bay Buccaneers logo.svg",
    "tennessee-titans":     "Tennessee Titans logo.svg",
    "washington-commanders":"Washington Commanders logo.svg",
}

WIKI_URL_TEMPLATE = "https://en.wikipedia.org/wiki/Special:FilePath/{filename}"

USER_AGENT = (
    "MetroPowerRankings/1.0 (https://citizenofnowhere.org; ashwind@gmail.com) "
    "Python/urllib"
)


def fetch_one(slug: str, filename: str, force: bool) -> str:
    out_path = OUT_DIR / f"{slug}.svg"
    if out_path.exists() and not force:
        return f"SKIP  {slug}: {out_path.name} exists (use --force to overwrite)"
    encoded_filename = urllib.parse.quote(filename)
    url = WIKI_URL_TEMPLATE.format(filename=encoded_filename)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = resp.read()
            ctype = resp.headers.get("Content-Type", "")
    except Exception as e:
        return f"FAIL  {slug}: {e}"
    if b"<svg" not in data[:512].lower():
        # Wikipedia sometimes returns PNG fallback for older logos. Save as png.
        if "png" in ctype.lower() or data.startswith(b"\x89PNG"):
            png_path = OUT_DIR / f"{slug}.png"
            png_path.write_bytes(data)
            return f"OK    {slug}: saved {png_path.name} (PNG, {len(data):,}B)"
        return f"FAIL  {slug}: response is not SVG/PNG (ctype={ctype}, first bytes={data[:40]!r})"
    out_path.write_bytes(data)
    return f"OK    {slug}: saved {out_path.name} ({len(data):,}B)"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="Overwrite existing files")
    parser.add_argument("--slug", help="Fetch only this slug")
    args = parser.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    targets = {args.slug: WIKI_FILES[args.slug]} if args.slug else WIKI_FILES
    if args.slug and args.slug not in WIKI_FILES:
        print(f"Unknown slug: {args.slug}", file=sys.stderr)
        sys.exit(2)

    for slug, filename in targets.items():
        print(fetch_one(slug, filename, args.force))

    # Summary
    have = list(OUT_DIR.glob("*.svg")) + list(OUT_DIR.glob("*.png"))
    print(f"\n{len(have)} logo files in {OUT_DIR}")


if __name__ == "__main__":
    main()
