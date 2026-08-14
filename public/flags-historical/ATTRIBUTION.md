# Historical flags

Four SVGs extracted from the colour (OT-SVG) glyphs of **BabelStone Flags v4.13**,
by Andrew West — https://www.babelstone.co.uk/Fonts/Flags.html

> Copyright (c) 2013-2025, Andrew West (www.babelstone.co.uk),
> with Reserved Font Name BabelStone.
> This Font Software is licensed under the SIL Open Font License, Version 1.1.
> http://scripts.sil.org/OFL

The artwork is used as images rather than by shipping the font, for two reasons.
The font is 1.8 MB, which is a large download for four flags. And this site
already established that flag EMOJI do not render on Windows, which is why
`flagCdnUrl()` serves images everywhere else — putting these four behind a
webfont would reintroduce exactly that class of failure for the one set of
rows that has no fallback.

Per the OFL's Reserved Font Name clause these files are not distributed as a
font and are not named "BabelStone".

## What is here, and what is not

Present: the Soviet Union, Yugoslavia, Czechoslovakia, East Germany. These are
the only genuinely historical flags in the font that this site needs.

Absent, deliberately: the Russian Empire, the Austrian Empire, Austria-Hungary,
the Ottoman Empire, Serbia and Montenegro, North and South Yemen. The font does
not carry them. Their modern successors' flags (RU, AT, TR) ARE in the font,
and using one of those would be worse than showing nothing — a 1850 board
captioned "Ottoman Empire" beside the flag of the Turkish Republic is a claim,
not a label. Those rows stay unflagged until real period artwork is added.

Regenerate with `scripts/extract-historical-flags.py`.
