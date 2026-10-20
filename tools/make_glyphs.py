#!/usr/bin/env python3
"""
The map marks of Deriva Sonora / AFPP, drawn in code and reduced to 1-bit.

Three sets (public/glyphs/<set>/, read by src/afpp/glyphs.js):

  marino   the body: a walker (2-frame stride), and where a sound was recorded,
           a gesture: listening, crouching to the ground, reaching up, lying in
           the grass, dancing, standing still. Others' sounds: the same bodies,
           framed. Breadcrumbs: footprints, left and right.
  seraina  local food: a sprout growing (2 frames) for you; where a sound was
           recorded, what was foraged there: mushroom, berries, a leaf, wild
           garlic, an acorn, an apple. Others': the same, hollow. Breadcrumbs:
           seeds (grain, bean, sunflower, pumpkin).
  afpp     both, woven: the walker, foraged sounds, framed bodies for others,
           and footprints alternating with seeds. The default.

Each figure is drawn large (strokes, fills) and reduced like a pen sketch
(tools/glyph_from_sketch.py): thickened, boxed down, thresholded, ×2. Marks
are ink (#9b4dff); you are lit (#fff). Slots with several files are variants,
picked per sound (or in turn, for crumbs); `me` frames animate.

    python3 tools/make_glyphs.py
"""
import json
import math
import os

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'glyphs')
KIT = os.path.join(ROOT, 'public', 'kit')
INK = (155, 77, 255, 255)
LIT = (255, 255, 255, 255)
S = 240  # drawing canvas


# ───────────────────────────────────────────── drawing helpers (0..1 coords)

def canvas():
    img = Image.new('L', (S, S), 0)
    return img, ImageDraw.Draw(img)


def P(x, y):
    return (x * S, y * S)


def line(d, pts, w=0.07):
    pts = [P(*p) for p in pts]
    d.line(pts, fill=255, width=int(w * S), joint='curve')
    r = w * S / 2
    for x, y in pts:
        d.ellipse((x - r, y - r, x + r, y + r), fill=255)


def disc(d, x, y, r, fill=True, w=0.06):
    box = (P(x - r, y - r), P(x + r, y + r))
    if fill:
        d.ellipse([*box[0], *box[1]], fill=255)
    else:
        d.ellipse([*box[0], *box[1]], outline=255, width=int(w * S))


def poly(d, pts, fill=True, w=0.06):
    pts = [P(*p) for p in pts]
    if fill:
        d.polygon(pts, fill=255)
    else:
        d.line(pts + [pts[0]], fill=255, width=int(w * S), joint='curve')


def arc(d, cx, cy, r, a0, a1, w=0.05):
    d.arc([*P(cx - r, cy - r), *P(cx + r, cy + r)], a0, a1, fill=255, width=int(w * S))


def reduce(img, px):
    """Large drawing → px×px 1-bit mask, like a reduced pen sketch."""
    box = img.getbbox()
    if not box:
        return Image.new('L', (px, px), 0)
    x0, y0, x1, y1 = box
    side = int(max(x1 - x0, y1 - y0) * 1.06)
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    sq = Image.new('L', (side, side), 0)
    sq.paste(img.crop((cx - side // 2, cy - side // 2, cx - side // 2 + side, cy - side // 2 + side)), (0, 0))
    # Drawn strokes are already thick: no thickening, just a fair threshold.
    return sq.resize((px, px), Image.BOX).point(lambda v: 255 if v > 105 else 0)


def hollow(mask):
    """Outline of a filled 1-bit mask (for others' marks)."""
    inner = mask.filter(ImageFilter.MinFilter(3))
    return ImageChops.subtract(mask, inner)


def framed(drawing, n):
    """A mark inside a 1-dot frame with open corners: someone else's.
    Reduced from the large drawing straight to the inner size, so no line is lost."""
    small = reduce(drawing, n - 6)
    out = Image.new('L', (n, n), 0)
    out.paste(small, (3, 3))
    d = ImageDraw.Draw(out)
    for a, b in (((1, 0), (n - 2, 0)), ((1, n - 1), (n - 2, n - 1)), ((0, 1), (0, n - 2)), ((n - 1, 1), (n - 1, n - 2))):
        d.line([a, b], fill=255)
    return out


def save(mask, path, color=INK, scale=2):
    img = Image.new('RGBA', mask.size, (0, 0, 0, 0))
    img.paste(Image.new('RGBA', mask.size, color), (0, 0), mask)
    img = img.resize((mask.width * scale, mask.height * scale), Image.NEAREST)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, optimize=True)
    return img


def strip(frames, path, color):
    w = frames[0].width
    sheet = Image.new('L', (w * len(frames), w), 0)
    for i, f in enumerate(frames):
        sheet.paste(f, (i * w, 0))
    return save(sheet, path, color)


# ───────────────────────────────────────────── Marino: the body

def body(head, neck, hip, arms, legs, extra=None, ground=False):
    img, d = canvas()
    disc(d, *head, 0.085)
    line(d, [neck, hip])
    for a in arms:
        line(d, [neck] + a, 0.06)
    for leg in legs:
        line(d, [hip] + leg)
    if ground:
        line(d, [(0.05, 0.97), (0.95, 0.97)], 0.03)
    if extra:
        extra(d)
    return img


POSES = {
    'walk-a': lambda: body((0.52, 0.12), (0.5, 0.25), (0.48, 0.56),
                           [[(0.36, 0.38), (0.3, 0.52)], [(0.64, 0.36), (0.72, 0.46)]],
                           [[(0.38, 0.74), (0.26, 0.93)], [(0.6, 0.74), (0.7, 0.93)]]),
    'walk-b': lambda: body((0.5, 0.11), (0.5, 0.24), (0.5, 0.55),
                           [[(0.62, 0.38), (0.68, 0.52)], [(0.38, 0.36), (0.3, 0.46)]],
                           [[(0.6, 0.74), (0.74, 0.93)], [(0.42, 0.74), (0.32, 0.93)]]),
    'listen': lambda: body((0.3, 0.16), (0.3, 0.29), (0.3, 0.6),
                           [[(0.48, 0.3), (0.44, 0.12)], [(0.18, 0.44), (0.16, 0.6)]],
                           [[(0.22, 0.78), (0.18, 0.96)], [(0.38, 0.78), (0.42, 0.96)]],
                           extra=lambda d: [arc(d, 0.44, 0.16, r, -55, 55, 0.07) for r in (0.22, 0.4)]),
    'crouch': lambda: body((0.36, 0.38), (0.42, 0.48), (0.62, 0.62),
                           [[(0.34, 0.66), (0.26, 0.86)], [(0.48, 0.66), (0.42, 0.84)]],
                           [[(0.76, 0.7), (0.66, 0.92)], [(0.56, 0.78), (0.58, 0.93)]],
                           extra=lambda d: [disc(d, 0.2, 0.9, 0.035), disc(d, 0.28, 0.93, 0.03)], ground=True),
    'reach': lambda: body((0.5, 0.24), (0.5, 0.36), (0.5, 0.64),
                          [[(0.36, 0.2), (0.3, 0.04)], [(0.64, 0.2), (0.72, 0.05)]],
                          [[(0.44, 0.8), (0.4, 0.96)], [(0.56, 0.8), (0.6, 0.96)]],
                          extra=lambda d: [disc(d, 0.86, 0.06, 0.04), disc(d, 0.8, 0.13, 0.03)]),
    'lie': lambda: body((0.12, 0.66), (0.22, 0.7), (0.56, 0.74),
                        [[(0.3, 0.52), (0.2, 0.44)], [(0.36, 0.7), (0.48, 0.66)]],
                        [[(0.72, 0.66), (0.9, 0.72)], [(0.74, 0.76), (0.94, 0.8)]],
                        extra=lambda d: [line(d, [(0.04, 0.86), (0.98, 0.86)], 0.03)] + [line(d, [(x, 0.86), (x + 0.02, 0.8)], 0.025) for x in (0.08, 0.3, 0.5, 0.8)]),
    'dance': lambda: body((0.5, 0.12), (0.5, 0.25), (0.52, 0.55),
                          [[(0.34, 0.2), (0.24, 0.06)], [(0.66, 0.32), (0.8, 0.26)]],
                          [[(0.42, 0.76), (0.4, 0.95)], [(0.68, 0.62), (0.8, 0.74)]]),
    'still': lambda: body((0.5, 0.12), (0.5, 0.25), (0.5, 0.57),
                          [[(0.34, 0.42), (0.3, 0.58)], [(0.66, 0.42), (0.7, 0.58)]],
                          [[(0.4, 0.77), (0.38, 0.96)], [(0.6, 0.77), (0.62, 0.96)]]),
}


def footprint(left):
    """A bare footprint: heel, sole, and three toes, all apart."""
    img, d = canvas()
    d.ellipse([*P(0.36, 0.66), *P(0.62, 0.96)], fill=255)            # heel
    d.ellipse([*P(0.3, 0.26), *P(0.7, 0.58)], fill=255)              # ball of the foot
    for x, y, r in ((0.3, 0.12, 0.07), (0.5, 0.07, 0.075), (0.68, 0.13, 0.065)):
        disc(d, x, y, r)                                             # toes
    img = img.rotate(-10 if left else 10, resample=Image.BICUBIC)
    return img.transpose(Image.FLIP_LEFT_RIGHT) if left else img


# ───────────────────────────────────────────── Seraina: what grows, what is gathered

def mushroom():
    img, d = canvas()
    d.pieslice([*P(0.12, 0.14), *P(0.88, 0.74)], 180, 360, fill=255)
    for x in (0.3, 0.5, 0.68):
        disc(d, x, 0.3, 0.045)  # spots, cut out below
    line(d, [(0.44, 0.44), (0.42, 0.88)], 0.13)
    line(d, [(0.2, 0.92), (0.72, 0.92)], 0.04)
    img2 = img.copy()
    d2 = ImageDraw.Draw(img2)
    for x, y in ((0.3, 0.3), (0.52, 0.24), (0.68, 0.34)):
        d2.ellipse([*P(x - 0.04, y - 0.04), *P(x + 0.04, y + 0.04)], fill=0)
    return img2


def berries():
    img, d = canvas()
    line(d, [(0.5, 0.06), (0.46, 0.3), (0.52, 0.55)], 0.04)
    line(d, [(0.46, 0.3), (0.3, 0.46)], 0.035)
    line(d, [(0.5, 0.42), (0.7, 0.52)], 0.035)
    for x, y in ((0.3, 0.56), (0.24, 0.68), (0.36, 0.7), (0.7, 0.62), (0.62, 0.74), (0.76, 0.76), (0.52, 0.66), (0.48, 0.8)):
        disc(d, x, y, 0.07)
    poly(d, [(0.5, 0.12), (0.72, 0.04), (0.8, 0.16), (0.6, 0.22)])
    return img


def leaf():
    """A filled leaf on its stalk, the midrib cut through it."""
    img, d = canvas()
    pts = [(0.5 + 0.36 * math.sin(t) ** 1.2, 0.04 + 0.78 * t / math.pi) for t in [i * math.pi / 30 for i in range(31)]]
    pts += [(1 - x, y) for x, y in reversed(pts)]
    poly(d, pts)
    line(d, [(0.5, 0.8), (0.46, 0.98)], 0.06)
    ImageDraw.Draw(img).line([P(0.5, 0.14), P(0.5, 0.78)], fill=0, width=int(0.07 * S))
    return img


def wild_garlic():
    img, d = canvas()
    poly(d, [(0.3, 0.96), (0.14, 0.5), (0.22, 0.2), (0.38, 0.6)])
    poly(d, [(0.4, 0.96), (0.46, 0.5), (0.6, 0.3), (0.54, 0.7)])
    line(d, [(0.62, 0.96), (0.74, 0.32)], 0.035)
    for a in range(0, 360, 60):
        x, y = 0.74 + 0.11 * math.cos(math.radians(a)), 0.22 + 0.11 * math.sin(math.radians(a))
        line(d, [(0.74, 0.22), (x, y)], 0.03)
        disc(d, x, y, 0.035)
    return img


def acorn():
    img, d = canvas()
    d.ellipse([*P(0.26, 0.34), *P(0.74, 0.94)], fill=255)
    d.chord([*P(0.18, 0.18), *P(0.82, 0.62)], 180, 360, fill=255)
    line(d, [(0.18, 0.4), (0.82, 0.4)], 0.06)
    line(d, [(0.5, 0.2), (0.56, 0.06)], 0.05)
    img2 = img.copy()
    d2 = ImageDraw.Draw(img2)
    for i in range(5):
        x = 0.28 + i * 0.11
        d2.line([P(x, 0.26), P(x + 0.06, 0.38)], fill=0, width=int(0.02 * S))
    return img2


def apple():
    img, d = canvas()
    d.ellipse([*P(0.12, 0.24), *P(0.56, 0.92)], fill=255)
    d.ellipse([*P(0.44, 0.24), *P(0.88, 0.92)], fill=255)
    line(d, [(0.5, 0.3), (0.54, 0.08)], 0.05)
    poly(d, [(0.56, 0.16), (0.8, 0.06), (0.86, 0.18), (0.64, 0.24)])
    img2 = img.copy()
    ImageDraw.Draw(img2).ellipse([*P(0.26, 0.4), *P(0.34, 0.5)], fill=0)
    return img2


def seed(kind):
    img, d = canvas()
    if kind == 'grain':
        d.ellipse([*P(0.34, 0.14), *P(0.66, 0.86)], fill=255)
        ImageDraw.Draw(img).line([P(0.5, 0.24), P(0.5, 0.76)], fill=0, width=int(0.04 * S))
    elif kind == 'bean':
        d.pieslice([*P(0.12, 0.2), *P(0.88, 0.96)], 180, 360, fill=255)
        d.ellipse([*P(0.12, 0.38), *P(0.88, 0.8)], fill=255)
        ImageDraw.Draw(img).ellipse([*P(0.44, 0.5), *P(0.56, 0.62)], fill=0)
    elif kind == 'sunflower':
        poly(d, [(0.5, 0.06), (0.74, 0.5), (0.62, 0.92), (0.38, 0.92), (0.26, 0.5)])
        dd = ImageDraw.Draw(img)
        for x in (0.42, 0.58):
            dd.line([P(x, 0.3), P(x, 0.86)], fill=0, width=int(0.04 * S))
    else:  # pumpkin
        poly(d, [(0.5, 0.06), (0.76, 0.3), (0.8, 0.66), (0.5, 0.96), (0.2, 0.66), (0.24, 0.3)], fill=False, w=0.08)
        disc(d, 0.5, 0.14, 0.05)
    return img


def sprout(stage):
    img, d = canvas()
    line(d, [(0.08, 0.86), (0.92, 0.86)], 0.04)
    d.ellipse([*P(0.38, 0.78), *P(0.62, 0.94)], fill=255)
    top = 0.5 if stage == 0 else 0.22
    line(d, [(0.5, 0.82), (0.5, top)], 0.06)
    if stage == 0:
        poly(d, [(0.5, 0.56), (0.7, 0.44), (0.76, 0.54), (0.56, 0.62)])
    else:
        poly(d, [(0.5, 0.34), (0.2, 0.16), (0.16, 0.3), (0.44, 0.42)])
        poly(d, [(0.5, 0.3), (0.82, 0.08), (0.88, 0.22), (0.56, 0.38)])
    return img


# ───────────────────────────────────────────── sets

PX = 20       # marks: 20 dots, shown at 40 px
PX_CRUMB = 13  # breadcrumbs: 13 dots, shown at 26 px


def build():
    gestures = ['listen', 'crouch', 'reach', 'lie', 'dance', 'still']
    forage = {'mushroom': mushroom, 'berries': berries, 'leaf': leaf, 'wild-garlic': wild_garlic, 'acorn': acorn, 'apple': apple}
    seeds = ['grain', 'bean', 'sunflower', 'pumpkin']

    def files(name, prefix, masks, color=INK):
        out = []
        for key, m in masks:
            fn = f'{prefix}-{key}.png'
            save(m, os.path.join(OUT, name, fn), color)
            out.append(fn)
        return out

    walk = [reduce(POSES['walk-a'](), PX), reduce(POSES['walk-b'](), PX)]
    gesture_masks = [(g, reduce(POSES[g](), PX)) for g in gestures]
    forage_masks = [(k, reduce(f(), PX)) for k, f in forage.items()]
    feet = [('left', reduce(footprint(True), PX_CRUMB)), ('right', reduce(footprint(False), PX_CRUMB))]
    seed_masks = [(k, reduce(seed(k), PX_CRUMB)) for k in seeds]
    grow = [reduce(sprout(0), PX), reduce(sprout(1), PX)]

    sets = {'squares': {'about': 'The plain 1-bit squares.'}}

    # Marino
    strip(walk, os.path.join(OUT, 'marino', 'me-walk.png'), LIT)
    sets['marino'] = {
        'about': 'Marino: the body. You walk; a sound is a gesture (listening, crouching, reaching, lying, dancing, standing still); others are framed bodies; footprints for crumbs.',
        'size': PX * 2, 'sizes': {'crumb': PX_CRUMB * 2}, 'crumbEvery': 12, 'crumbSpacingPx': 22,
        'me': {'sprite': 'me-walk.png', 'frames': 2, 'fps': 2},
        'sound': files('marino', 'sound', gesture_masks),
        'other': files('marino', 'other', [(g, framed(POSES[g](), PX)) for g in gestures]),
        'crumb': files('marino', 'crumb', feet),
    }

    # Seraina
    strip(grow, os.path.join(OUT, 'seraina', 'me-sprout.png'), LIT)
    sets['seraina'] = {
        'about': 'Seraina: local food. You are a sprout; a sound is what was foraged there (mushroom, berries, leaf, wild garlic, acorn, apple); others hollow; seeds for crumbs.',
        'size': PX * 2, 'sizes': {'crumb': PX_CRUMB * 2}, 'crumbEvery': 20, 'crumbSpacingPx': 28,
        'me': {'sprite': 'me-sprout.png', 'frames': 2, 'fps': 1},
        'sound': files('seraina', 'sound', forage_masks),
        'other': files('seraina', 'other', [(k, hollow(m)) for k, m in forage_masks]),
        'crumb': files('seraina', 'crumb', seed_masks),
    }

    # AFPP: both, woven
    strip(walk, os.path.join(OUT, 'afpp', 'me-walk.png'), LIT)
    crumbs = []
    for (fk, fm), (sk, sm) in zip(feet * 2, seed_masks):
        crumbs += [(fk + '-' + sk, fm), (sk, sm)]
    sets['afpp'] = {
        'about': 'AFPP: both woven. You walk; a sound is what was found there; other walkers are framed bodies; crumbs alternate footprints and seeds.',
        'size': PX * 2, 'sizes': {'crumb': PX_CRUMB * 2}, 'crumbEvery': 15, 'crumbSpacingPx': 24,
        'me': {'sprite': 'me-walk.png', 'frames': 2, 'fps': 2},
        'sound': files('afpp', 'sound', forage_masks),
        'other': files('afpp', 'other', [(g, framed(POSES[g](), PX)) for g in gestures]),
        'crumb': files('afpp', 'crumb', crumbs),
    }
    return sets


def preview(name, conf, w=720, h=260):
    """A trace on black with the set's crumbs, sounds, an other and you: for the kit page."""
    img = Image.new('RGBA', (w, h), (0, 0, 0, 255))
    d = ImageDraw.Draw(img)
    pts = [(40 + x, int(h / 2 + 60 * math.sin(x / 90) + 20 * math.sin(x / 31))) for x in range(0, w - 90, 2)]
    d.line(pts, fill=INK, width=3)
    load = lambda f: Image.open(os.path.join(OUT, name, f)).convert('RGBA')

    def put(g, xy):
        img.alpha_composite(g, (int(xy[0] - g.width / 2), int(xy[1] - g.height / 2)))

    crumbs = conf['crumb']
    for n, i in enumerate(range(8, len(pts), 18)):
        put(load(crumbs[n % len(crumbs)]), pts[i])
    for n, i in enumerate((60, 150, 230)):
        put(load(conf['sound'][(n * 2) % len(conf['sound'])]), (pts[i][0], pts[i][1] + (-44 if n % 2 == 0 else 44)))
    other = [(x, int(h / 2 + 95 * math.cos(x / 70))) for x in range(300, 560, 4)]
    for i in range(0, len(other) - 2, 4):
        d.line([other[i], other[i + 2]], fill=INK, width=2)
    put(load(conf['other'][0]), other[len(other) // 2])
    sheet = load(conf['me']['sprite'])
    put(sheet.crop((0, 0, sheet.height, sheet.height)), pts[-1])
    img.convert('RGB').save(os.path.join(KIT, f'preview-{name}.png'), optimize=True)


def gallery(name, conf):
    """Every mark of a set on one strip, for the kit page."""
    items = [Image.open(os.path.join(OUT, name, conf['me']['sprite'])).convert('RGBA')]
    for slot in ('sound', 'other', 'crumb'):
        items += [Image.open(os.path.join(OUT, name, f)).convert('RGBA') for f in conf[slot]]
    gap = 14
    width = sum(i.width for i in items) + gap * (len(items) + 1)
    img = Image.new('RGBA', (width, 40 + 2 * gap), (0, 0, 0, 255))
    x = gap
    for it in items:
        img.alpha_composite(it, (x, gap + (40 - it.height) // 2))
        x += it.width + gap
    img.convert('RGB').save(os.path.join(KIT, f'gallery-{name}.png'), optimize=True)


def main():
    for old in ('body', 'seeds'):  # the first quick starters, replaced
        p = os.path.join(OUT, old)
        if os.path.isdir(p):
            for f in os.listdir(p):
                os.remove(os.path.join(p, f))
            os.rmdir(p)
    sets = build()
    os.makedirs(KIT, exist_ok=True)
    for name in ('marino', 'seraina', 'afpp'):
        preview(name, sets[name])
        gallery(name, sets[name])
    path = os.path.join(OUT, 'glyphs.json')
    active = 'afpp'
    if os.path.exists(path):
        prev = json.load(open(path)).get('active')
        if prev in sets and prev != 'squares':
            active = prev
    json.dump({'active': active, 'sets': sets}, open(path, 'w'), indent=2)
    print('glyph sets written; active:', active)


if __name__ == '__main__':
    main()
