#!/usr/bin/env python3
"""
A photographed sketch → a 1-bit glyph for a map slot (see public/kit/).

    python3 tools/glyph_from_sketch.py <photo> <set> <slot> [--px 16|24|32] [--threshold 0.5] [--invert]

    slot: me | sound | other | crumb
    e.g.  python3 tools/glyph_from_sketch.py ~/Desktop/marino-listen.jpg marino sound --px 24

Best input: dark pen on light paper, one drawing per photo, little else in
frame. The drawing is cropped to its ink, squared, reduced to px×px, thresholded
to ink/transparent, and written ×2 as public/glyphs/<set>/<slot>.png. The set
is added to public/glyphs/glyphs.json (not activated: preview it with
?glyphs=<set>, activate by setting "active"). A preview, 8× on black, is
written next to the photo.
"""
import argparse
import json
import os

from PIL import Image, ImageFilter, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GLYPHS = os.path.join(ROOT, 'public', 'glyphs')
INK = (155, 77, 255, 255)
SLOTS = ('me', 'sound', 'other', 'crumb')


def otsu(gray):
    hist = gray.histogram()
    total = sum(hist)
    s_all = sum(i * h for i, h in enumerate(hist))
    best, cut, w_b, s_b = 0, 128, 0, 0
    for t in range(256):
        w_b += hist[t]
        if not w_b or w_b == total:
            continue
        s_b += t * hist[t]
        m_b, m_f = s_b / w_b, (s_all - s_b) / (total - w_b)
        between = w_b * (total - w_b) * (m_b - m_f) ** 2
        if between > best:
            best, cut = between, t
    return cut


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('photo')
    ap.add_argument('set')
    ap.add_argument('slot', choices=SLOTS)
    ap.add_argument('--px', type=int, default=16, help='glyph resolution before ×2 (16, 24 or 32)')
    ap.add_argument('--threshold', type=float, default=None, help='0..1 ink cut; default: automatic (Otsu)')
    ap.add_argument('--invert', action='store_true', help='light lines on a dark ground (like the parade drawing)')
    a = ap.parse_args()

    gray = ImageOps.exif_transpose(Image.open(a.photo)).convert('L')
    gray.thumbnail((1200, 1200))
    if a.invert:
        gray = ImageOps.invert(gray)
    cut = int(a.threshold * 255) if a.threshold is not None else otsu(gray)
    ink = gray.point(lambda v: 255 if v < cut else 0)  # 255 = ink

    box = ink.getbbox()
    if not box:
        raise SystemExit('no ink found: try --threshold 0.6, or --invert for light lines')
    x0, y0, x1, y1 = box
    side = int(max(x1 - x0, y1 - y0) * 1.1)
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    square = Image.new('L', (side, side), 0)
    square.paste(ink.crop((cx - side // 2, cy - side // 2, cx - side // 2 + side, cy - side // 2 + side)), (0, 0))

    # Thicken strokes to about half a glyph pixel, so a pen line survives the reduction.
    grow = max(3, (side // a.px) // 2 * 2 + 1)
    square = square.filter(ImageFilter.MaxFilter(min(grow, 31)))
    small = square.resize((a.px, a.px), Image.BOX).point(lambda v: 255 if v > 90 else 0)
    glyph = Image.new('RGBA', (a.px, a.px), (0, 0, 0, 0))
    glyph.paste(Image.new('RGBA', (a.px, a.px), INK), (0, 0), small)
    glyph = glyph.resize((a.px * 2, a.px * 2), Image.NEAREST)

    out_dir = os.path.join(GLYPHS, a.set)
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, f'{a.slot}.png')
    glyph.save(out, optimize=True)

    preview = Image.new('RGBA', glyph.size, (0, 0, 0, 255))
    preview.alpha_composite(glyph)
    prev_path = os.path.splitext(a.photo)[0] + f'.{a.set}-{a.slot}.preview.png'
    preview.resize((glyph.width * 4, glyph.height * 4), Image.NEAREST).save(prev_path)

    cfg_path = os.path.join(GLYPHS, 'glyphs.json')
    cfg = json.load(open(cfg_path)) if os.path.exists(cfg_path) else {'active': 'squares', 'sets': {}}
    s = cfg['sets'].setdefault(a.set, {'about': f'Drawn by hand ({a.set}).', 'size': 32, 'sizes': {}, 'crumbEvery': 25})
    s[a.slot] = f'{a.slot}.png'
    s.setdefault('sizes', {})[a.slot] = a.px * 2 if a.slot != 'crumb' else min(a.px * 2, 24)
    json.dump(cfg, open(cfg_path, 'w'), indent=2)
    print(f'wrote {os.path.relpath(out, ROOT)} ({a.px}×{a.px}, ink cut {cut}); preview: {prev_path}')
    print(f'see it: https://altred.xyz/AlpineFeministPunkParade/?glyphs={a.set}  (after ./deploy_afpp_web.sh)')


if __name__ == '__main__':
    main()
