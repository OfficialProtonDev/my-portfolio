"""
Trims the variable fonts to what the site uses: Latin text, the weights in the
design, and the OpenType features the CSS turns on. Newsreader is pinned to one
optical size per style (56 for roman, 72 for the display italic), which halves
the files; the serif only ever appears at display sizes here.
Run from the project root: python scripts/subset-fonts.py
"""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset

ROOT = Path(__file__).resolve().parent.parent
NM = ROOT / "node_modules"
OUT = ROOT / "src" / "assets" / "fonts"
OUT.mkdir(parents=True, exist_ok=True)

UNICODES = (
    "U+0020-007E,U+00A0-00FF,U+0131,U+0152-0153,U+2002-2003,U+2009-200A,"
    "U+2010-2015,U+2018-201E,U+2022,U+2026,U+2030,U+2032-2033,U+2039-203A,"
    "U+2044,U+20AC,U+2122,U+2190-2193,U+2197,U+2212,U+2215,U+00D7"
)
FEATURES = ["kern", "liga", "calt", "ccmp", "locl", "mark", "mkmk", "onum", "lnum", "pnum", "tnum", "case", "frac", "sups", "ss01"]

JOBS = [
    ("@fontsource-variable/newsreader/files/newsreader-latin-opsz-normal.woff2", "newsreader-roman.woff2", {"wght": (250, 600), "opsz": 56}),
    ("@fontsource-variable/newsreader/files/newsreader-latin-opsz-italic.woff2", "newsreader-italic.woff2", {"wght": (250, 450), "opsz": 72}),
    ("@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2", "instrument-sans.woff2", {"wght": (400, 650)}),
    ("@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2", "plex-mono-400.woff2", None),
    ("@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2", "plex-mono-500.woff2", None),
]

for src, dst, axes in JOBS:
    font = TTFont(NM / src)
    if axes and "fvar" in font:
        have = {a.axisTag for a in font["fvar"].axes}
        limits = {k: v for k, v in axes.items() if k in have}
        font = instancer.instantiateVariableFont(font, limits)
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = FEATURES
    opts.name_IDs = ["*"]
    opts.hinting = False
    sub = subset.Subsetter(options=opts)
    sub.populate(unicodes=subset.parse_unicodes(UNICODES))
    sub.subset(font)
    out = OUT / dst
    font.flavor = "woff2"
    font.save(out)
    print(f"{dst}: {(NM / src).stat().st_size // 1024} KB -> {out.stat().st_size // 1024} KB")
