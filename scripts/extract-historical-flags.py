#!/usr/bin/env python3
"""extract-historical-flags.py - period flags for states that no longer exist.

WHY THIS EXISTS. The Time Machine's polity rows had no flags, because flagcdn
has no Soviet Union. BabelStone Flags (SIL OFL 1.1, by Andrew West) carries
genuine period artwork as OT-SVG colour glyphs, so this pulls those glyphs out
as standalone SVGs.

WHY IMAGES AND NOT THE FONT. Two reasons, both load-bearing. The font is 1.8 MB
for four flags anyone actually needs here. And this site established long ago
that flag EMOJI do not render on Windows, which is the entire reason
flagCdnUrl() serves images everywhere else - putting these four behind a
webfont would reintroduce that failure for the one set of rows with no
fallback.

WHY ONLY FOUR. They are the only genuinely historical flags in the font that
this board needs. The Russian Empire, the Austrian Empire, Austria-Hungary and
the Ottoman Empire are absent from it. Their modern successors (RU, AT, TR) are
present, and substituting one would be worse than nothing: an 1850 row reading
"Ottoman Empire" beside the flag of the Turkish Republic is a claim, not a
label.

usage:
  python scripts/extract-historical-flags.py --self-test
  python scripts/extract-historical-flags.py <path-to-BabelStoneFlags.ttf>
"""
import os, re, sys

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                       "public", "flags-historical")

# ISO 3166 code in the font -> the filename this site serves.
WANT = {
    "SU": "soviet-union",
    "YU": "yugoslavia",
    "CS": "czechoslovakia",
    "DD": "east-germany",
}

TOKEN = re.compile(r"([MmLlHhVvCcSsQqTtAaZz])|(-?\d*\.?\d+(?:e-?\d+)?)")


def path_extent(d):
    """Bounding box of one SVG path, walking absolute and relative commands.

    Written out rather than reached for a library because the alternative is a
    heavyweight dependency for four files, and because the FIRST path is not
    reliably the background: Czechoslovakia's is the blue wedge and Yugoslavia's
    is the top stripe, so taking path one and calling it the flag crops both.
    """
    xs, ys = [], []
    cx = cy = sx = sy = 0.0
    cmd, buf = None, []

    def flush():
        nonlocal cx, cy, sx, sy, buf
        if not cmd or not buf:
            buf = []
            return
        n, absolute = buf, cmd.isupper()
        if cmd in "Mm":
            for i in range(0, len(n) - 1, 2):
                cx = n[i] if absolute else cx + n[i]
                cy = n[i + 1] if absolute else cy + n[i + 1]
                if i == 0:
                    sx, sy = cx, cy
                xs.append(cx); ys.append(cy)
        elif cmd in "Ll":
            for i in range(0, len(n) - 1, 2):
                cx = n[i] if absolute else cx + n[i]
                cy = n[i + 1] if absolute else cy + n[i + 1]
                xs.append(cx); ys.append(cy)
        elif cmd in "Hh":
            for v in n:
                cx = v if absolute else cx + v
                xs.append(cx); ys.append(cy)
        elif cmd in "Vv":
            for v in n:
                cy = v if absolute else cy + v
                xs.append(cx); ys.append(cy)
        elif cmd in "Cc":
            for i in range(0, len(n) - 5, 6):
                for j in (0, 2, 4):
                    xs.append(n[i + j] if absolute else cx + n[i + j])
                    ys.append(n[i + j + 1] if absolute else cy + n[i + j + 1])
                nx, ny = n[i + 4], n[i + 5]
                cx = nx if absolute else cx + nx
                cy = ny if absolute else cy + ny
        elif cmd in "Qq":
            for i in range(0, len(n) - 3, 4):
                for j in (0, 2):
                    xs.append(n[i + j] if absolute else cx + n[i + j])
                    ys.append(n[i + j + 1] if absolute else cy + n[i + j + 1])
                nx, ny = n[i + 2], n[i + 3]
                cx = nx if absolute else cx + nx
                cy = ny if absolute else cy + ny
        buf = []

    for m in TOKEN.finditer(d):
        if m.group(1):
            flush()
            cmd = m.group(1)
            if cmd in "Zz":
                cx, cy = sx, sy
        else:
            buf.append(float(m.group(2)))
    flush()
    if not xs:
        raise SystemExit("FATAL: a path yielded no coordinates.")
    return min(xs), min(ys), max(xs), max(ys)


def view_box(doc):
    """The union of every path, flipped: OT-SVG docs draw y-up and carry a
    scale(1,-1), so the visible band is -yMax .. -yMin."""
    x0 = y0 = 1e9
    x1 = y1 = -1e9
    for d in re.findall(r'<path[^>]*\sd="([^"]+)"', doc):
        a, b, c, e = path_extent(d)
        x0, y0, x1, y1 = min(x0, a), min(y0, b), max(x1, c), max(y1, e)
    if x1 <= x0:
        raise SystemExit("FATAL: no drawable paths in this glyph.")
    return f"{x0:g} {-y1:g} {x1 - x0:g} {y1 - y0:g}"


def main(argv):
    if "--self-test" in argv:
        return self_test()
    if not argv:
        return int(bool(sys.stderr.write("usage: extract-historical-flags.py <font.ttf>\n")))
    from fontTools.ttLib import TTFont  # only needed for a real run

    font = TTFont(argv[0])
    order = font.getGlyphOrder()
    index = {g: i for i, g in enumerate(order)}

    def regional(name):
        return chr(int(name[1:], 16) - 0x1F1E6 + ord("A"))

    gid = {}
    for lookup in font["GSUB"].table.LookupList.Lookup:
        for sub in lookup.SubTable:
            for first, ligs in getattr(sub, "ligatures", {}).items():
                if not first.startswith("u1F1"):
                    continue
                for lig in ligs:
                    if len(lig.Component) != 1:
                        continue
                    code = regional(first) + regional(lig.Component[0])
                    if code in WANT:
                        gid[code] = lig.LigGlyph

    missing = sorted(set(WANT) - set(gid))
    if missing:
        raise SystemExit(f"FATAL: {missing} absent from this font; it is the wrong "
                         "file or a version that dropped them.")

    os.makedirs(OUT_DIR, exist_ok=True)
    for code, glyph in sorted(gid.items()):
        gi = index[glyph]
        doc = next(d for d in font["SVG "].docList if d.startGlyphID <= gi <= d.endGlyphID)
        data = doc.data.lstrip("﻿")
        head = re.match(r"<svg[^>]*>", data).group(0)
        new_head = re.sub(r'\s*viewBox="[^"]*"', "", head).replace(
            "<svg", f'<svg viewBox="{view_box(data)}" role="img" aria-hidden="true"', 1)
        out = re.sub(r"\s+", " ", new_head + data[len(head):]).strip()
        path = os.path.join(OUT_DIR, f"{WANT[code]}.svg")
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(out)
        print(f"  {WANT[code]:<16} {len(out):>6} bytes")
    print(f"wrote {len(gid)} flags to public/flags-historical/")
    return 0


def self_test():
    # Absolute moveto plus relative linetos: the shape every flag background uses.
    assert path_extent("M100-100l3600 0 0 1800-3600 0 0-1800 z") == (100.0, -100.0, 3700.0, 1700.0)
    # Relative moveto must accumulate from the current point, not reset to it.
    assert path_extent("M10 10 m5 5 l10 0") == (10.0, 10.0, 25.0, 15.0)
    # H and V move one axis only.
    assert path_extent("M0 0 H50 V25") == (0.0, 0.0, 50.0, 25.0)
    # Z returns to the subpath start, so a following relative command is
    # measured from there rather than from wherever the pen stopped.
    assert path_extent("M0 0 l10 10 z l-5 0") == (-5.0, 0.0, 10.0, 10.0)

    two = ('<svg><path d="M100 1100l3600 0 0 600-3600 0 0-600 z" fill="#003893"/>'
           '<path d="M100 100l3600 0 0 1000-3600 0 0-1000 z" fill="#DE2918"/></svg>')
    assert view_box(two) == "100 -1700 3600 1600", view_box(two)
    one = '<svg><path d="M100 1100l3600 0 0 600-3600 0 0-600 z"/></svg>'
    assert view_box(one) != view_box(two), (
        "the box must be the UNION of every path; taking only the first crops "
        "Czechoslovakia to its blue wedge and Yugoslavia to its top stripe")
    print("self-test: 7/7 PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]) or 0)
