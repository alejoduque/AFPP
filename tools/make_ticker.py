#!/usr/bin/env python3
"""
The AFPP ticker: a strip of tiny 1-bit actors walking past, frame by frame.

Writes public/ticker/ticker.png (one row per actor, one 32×24 cell per frame;
ink purple, with white where something is "lit": sound, a flower, a seed in
the air) and public/ticker/ticker.json (frames, timing, order), read by
public/ticker/ticker.js.

Actors: a plant growing, a forager picking into a basket, a traceur (run,
jump, vault, roll, land), a listening walker, a mushroom coming up, a grazing
cow, a flag-bearer of the parade, a dancer, a sower, a bird, a butterfly, and
someone lying in the grass listening to the sky.

Each frame is drawn at 10× with strokes and reduced like a pen drawing, so the
figures keep a hand-drawn line. All coordinates are in cell pixels (32×24).

    python3 tools/make_ticker.py
"""
import json
import math
import os

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'ticker')
W, H, K = 32, 24, 10  # cell, and the drawing scale
INK = (155, 77, 255, 255)
LIT = (255, 255, 255, 255)
GROUND_Y = 23  # feet stand here; the strip draws its own dotted ground


class Frame:
    def __init__(self):
        self.ink = Image.new('L', (W * K, H * K), 0)
        self.lit = Image.new('L', (W * K, H * K), 0)
        self.d = {'ink': ImageDraw.Draw(self.ink), 'lit': ImageDraw.Draw(self.lit)}

    def _pts(self, pts):
        return [(x * K, y * K) for x, y in pts]

    def line(self, pts, w=1.5, layer='ink'):
        d = self.d[layer]
        pp = self._pts(pts)
        d.line(pp, fill=255, width=int(w * K), joint='curve')
        r = w * K / 2
        for x, y in pp:
            d.ellipse((x - r, y - r, x + r, y + r), fill=255)

    def disc(self, x, y, r, layer='ink', fill=True, w=1.2):
        box = (x * K - r * K, y * K - r * K, x * K + r * K, y * K + r * K)
        if fill:
            self.d[layer].ellipse(box, fill=255)
        else:
            self.d[layer].ellipse(box, outline=255, width=int(w * K))

    def poly(self, pts, layer='ink'):
        self.d[layer].polygon(self._pts(pts), fill=255)

    def arc(self, x, y, r, a0, a1, w=1.1, layer='ink'):
        self.d[layer].arc((x * K - r * K, y * K - r * K, x * K + r * K, y * K + r * K), a0, a1, fill=255, width=int(w * K))

    def body(self, head, neck, hip, arms, legs, hr=2.0):
        self.disc(*head, hr)
        self.line([neck, hip])
        for a in arms:
            self.line([neck] + a, 1.3)
        for leg in legs:
            self.line([hip] + leg)

    def render(self):
        def cut(m, t):
            return m.resize((W, H), Image.BOX).point(lambda v: 255 if v > t else 0)
        ink, lit = cut(self.ink, 95), cut(self.lit, 80)
        img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        img.paste(Image.new('RGBA', (W, H), INK), (0, 0), ink)
        img.paste(Image.new('RGBA', (W, H), LIT), (0, 0), lit)
        return img


def walker(f, x, phase, arms=None):
    """A walking body at x, legs/arms by phase 0..1."""
    s = math.sin(phase * 2 * math.pi)
    hip = (x, 15.5)
    neck = (x + 0.3, 8.5)
    f.body((x + 0.5, 5.3), neck, hip,
           arms or [[(x - 1.5 * s, 11.5), (x - 2.6 * s, 14)], [(x + 1.5 * s, 11.5), (x + 2.6 * s, 14)]],
           [[(x + 2.2 * s, 19.3), (x + 3.4 * s, GROUND_Y)], [(x - 2.2 * s, 19.3), (x - 3.4 * s, GROUND_Y)]])


# ───────────────────────────────────────────── actors

def plant():
    frames = []
    for stage in range(7):
        f = Frame()
        f.line([(9, GROUND_Y), (23, GROUND_Y)], 1.0)  # a little bed
        if stage == 0:
            f.disc(16, 21.6, 1.2, 'lit')                    # a seed
        else:
            top = GROUND_Y - min(stage, 5) * 2.8
            f.line([(16, GROUND_Y), (16, top)], 1.2)
            if stage >= 2:
                f.poly([(16, top + 3.5), (12.5, top + 1.5), (12, top + 3.2), (15.8, top + 4.6)])
            if stage >= 3:
                f.poly([(16, top + 2), (19.6, top), (20.2, top + 1.8), (16.2, top + 3.2)])
            if stage >= 4:
                f.poly([(16, top + 6.5), (19.8, top + 5), (20, top + 6.6), (16.2, top + 7.6)])
            if stage == 5:
                f.disc(16, top - 0.6, 1.3)                 # a bud
            if stage == 6:
                for a in range(0, 360, 60):
                    f.disc(16 + 2.2 * math.cos(math.radians(a)), top - 1 + 2.2 * math.sin(math.radians(a)), 1.1, 'lit')
                f.disc(16, top - 1, 1.0)
        frames.append(f.render())
    return frames


def forager():
    frames = []
    basket = lambda f, x, y: (f.line([(x - 2, y), (x + 2, y), (x + 1.4, y + 2.6), (x - 1.4, y + 2.6), (x - 2, y)], 1.0),
                              f.arc(x, y, 2, 180, 360, 0.9))
    # walk, walk, stop, bend, pick, rise, drop into basket
    for i, pose in enumerate(['w1', 'w2', 'stand', 'bend', 'pick', 'rise', 'drop']):
        f = Frame()
        x = 15
        f.line([(22, GROUND_Y), (23, GROUND_Y - 2.2), (24, GROUND_Y)], 1.0)  # the plant being picked
        f.disc(23, GROUND_Y - 2.6, 0.9, 'lit')
        if pose in ('w1', 'w2'):
            walker(f, x, 0.15 if pose == 'w1' else 0.65, arms=[[(x - 1, 12), (x - 0.5, 15)], [(x + 1.6, 11.5), (x + 2.6, 13.5)]])
            basket(f, x + 3.4, 13.5)
        elif pose == 'stand':
            f.body((x + 0.4, 5.3), (x + 0.3, 8.5), (x, 15.5), [[(x - 1, 12), (x - 0.8, 15)], [(x + 2, 11.5), (x + 3, 13.5)]],
                   [[(x - 0.8, 19.3), (x - 1, GROUND_Y)], [(x + 1, 19.3), (x + 1.2, GROUND_Y)]])
            basket(f, x + 3.6, 13.5)
        elif pose in ('bend', 'pick'):
            hand = (22.4, GROUND_Y - 2.4) if pose == 'pick' else (20.5, 18.5)
            f.body((x + 5.5, 10.5), (x + 3.5, 11.2), (x - 0.5, 15.5), [[(x + 5, 15), hand], [(x + 2, 14.5), (x + 1, 17)]],
                   [[(x + 0.6, 19.3), (x + 0.4, GROUND_Y)], [(x - 1.6, 19.3), (x - 2.2, GROUND_Y)]])
            basket(f, x - 3.4, GROUND_Y - 2.6)
        elif pose == 'rise':
            f.body((x + 1.6, 6), (x + 1.2, 9), (x, 15.5), [[(x + 3, 11), (x + 4.4, 9.4)], [(x - 1.2, 12), (x - 2.4, 14.5)]],
                   [[(x - 0.8, 19.3), (x - 1, GROUND_Y)], [(x + 1, 19.3), (x + 1.2, GROUND_Y)]])
            f.disc(x + 4.6, 8.8, 0.9, 'lit')  # what was found, held up
            basket(f, x - 3.4, GROUND_Y - 2.6)
        else:  # drop into basket
            f.body((x - 0.2, 6.4), (x - 0.2, 9.2), (x, 15.5), [[(x - 2, 12), (x - 3.2, 17.6)], [(x + 1.2, 12), (x + 2, 14.6)]],
                   [[(x - 0.8, 19.3), (x - 1, GROUND_Y)], [(x + 1, 19.3), (x + 1.2, GROUND_Y)]])
            basket(f, x - 3.4, GROUND_Y - 2.6)
            f.disc(x - 3.4, GROUND_Y - 3.4, 0.8, 'lit')
        frames.append(f.render())
    return frames


def traceur():
    frames = []
    block = lambda f: f.line([(19, GROUND_Y), (19, 17.5), (27, 17.5), (27, GROUND_Y)], 1.1)
    poses = {
        'run1': lambda f, x: walker(f, x, 0.2, arms=[[(x + 2, 11), (x + 3.4, 9.6)], [(x - 2, 11.8), (x - 3.2, 13.6)]]),
        'run2': lambda f, x: walker(f, x, 0.7, arms=[[(x - 2, 11), (x - 3.4, 9.6)], [(x + 2, 11.8), (x + 3.2, 13.6)]]),
        'jump': lambda f, x: f.body((x + 1.2, 2.4), (x + 0.8, 5.5), (x, 11.5), [[(x + 3, 4.8), (x + 4.6, 3)], [(x - 2.6, 5), (x - 4, 3.4)]],
                                    [[(x + 2.6, 13.4), (x + 0.4, 15.8)], [(x - 1.6, 14), (x - 3.4, 15.6)]]),
        'vault': lambda f, x: f.body((x + 3.2, 7.8), (x + 2.4, 10.4), (x - 1.4, 13), [[(x + 2.4, 14), (x + 2.6, 17.4)], [(x + 1, 14.4), (x + 1.2, 17.4)]],
                                     [[(x - 4, 11.8), (x - 7, 12.4)], [(x - 3.8, 13.6), (x - 6.8, 14.4)]]),
        'roll': lambda f, x: (f.disc(x, 18.2, 3.2, fill=False, w=1.4), f.disc(x + 1.2, 16.4, 1.4), f.line([(x - 2, 20), (x + 1.6, 21)], 1.2)),
        'land': lambda f, x: f.body((x + 2.4, 12.2), (x + 1.8, 14.4), (x - 0.6, 17.6), [[(x + 3.6, 16), (x + 5.4, 18.4)], [(x - 1.6, 15.6), (x - 3.4, 13.4)]],
                                    [[(x + 2.2, 19.6), (x + 1.6, GROUND_Y)], [(x - 2.8, 20), (x - 2.2, GROUND_Y)]]),
    }
    for name, x in (('run1', 8), ('run2', 11), ('jump', 15), ('vault', 23), ('roll', 12), ('land', 13)):
        f = Frame()
        if name in ('run1', 'run2', 'jump', 'vault'):
            block(f)
        poses[name](f, x)
        frames.append(f.render())
    return frames


def listener():
    frames = []
    for i in range(4):
        f = Frame()
        x = 13
        phase = (i % 2) * 0.5 + 0.15
        walker(f, x, phase, arms=[[(x + 2.4, 8.4), (x + 1.8, 5.6)], [(x - 1.2, 11.8), (x - 2, 14.4)]])
        for k, r in enumerate((3.4, 5.8, 8.2)):
            if k <= i % 3 + (1 if i == 3 else 0):
                f.arc(x + 1, 5.4, r, -50, 50, 1.0, 'lit')
        frames.append(f.render())
    return frames


def mushroom():
    frames = []
    for stage in range(5):
        f = Frame()
        f.line([(10, GROUND_Y), (22, GROUND_Y)], 1.0)
        if stage >= 1:
            h = [0, 2, 4.5, 6.5, 6.5][stage]
            f.line([(16, GROUND_Y), (16, GROUND_Y - h)], 1.8)
            if stage >= 2:
                r = [0, 0, 2.6, 4.2, 4.6][stage]
                f.d['ink'].pieslice(((16 - r) * K, (GROUND_Y - h - r * 0.9) * K, (16 + r) * K, (GROUND_Y - h + r * 0.9) * K), 180, 360, fill=255)
            if stage == 4:
                for dx in (-2, 0.4, 2.4):
                    f.disc(16 + dx, GROUND_Y - h - 1.6, 0.6, 'lit')
        frames.append(f.render())
    return frames


def cow():
    frames = []
    for down in (False, True):
        f = Frame()
        f.line([(8, 12), (22, 12), (22, 17), (8, 17), (8, 12)], 1.2)       # body
        f.poly([(10, 13), (14, 13), (13, 16), (10, 15.5)])                  # a patch
        for x in (9.5, 12, 18.5, 21):
            f.line([(x, 17), (x, GROUND_Y)], 1.1)
        f.line([(8, 13), (6, 16)], 0.9)                                     # tail
        hx, hy = (25.2, 19.6) if down else (25, 10.6)
        f.line([(22, 13), (hx - 1, hy)], 1.6)                               # neck
        f.disc(hx, hy, 1.9)
        f.line([(hx - 1, hy - 1.8), (hx - 1.8, hy - 3)], 0.8)              # horn
        if down:
            f.line([(26.4, GROUND_Y), (27.2, GROUND_Y - 1.6)], 0.8)         # grass
        frames.append(f.render())
    return frames


def flag_bearer():
    frames = []
    for i in range(2):
        f = Frame()
        x = 13
        walker(f, x, 0.15 + i * 0.5, arms=[[(x + 2, 9.6), (x + 3.2, 7)], [(x - 1.4, 11.8), (x - 2.4, 14)]])
        f.line([(x + 3.2, 3), (x + 3.2, 14)], 0.9)                          # the pole
        wave = 0.8 if i else -0.8
        f.poly([(x + 3.2, 1.6), (x + 9, 2 + wave), (x + 9, 6 + wave), (x + 3.2, 5.6)])
        f.disc(x + 6.2, 3.8 + wave / 2, 1.1, 'lit')                        # the sign on the flag
        frames.append(f.render())
    return frames


def dancer():
    frames = []
    poses = [
        ((16.5, 5.3), (16.3, 8.5), (16, 15.5), [[(13.6, 6.6), (12.4, 3.6)], [(19, 10.6), (21.2, 9.2)]], [[(14.8, 19.4), (14, GROUND_Y)], [(18.6, 17.6), (21, 19)]]),
        ((15.5, 5.3), (15.7, 8.5), (16, 15.5), [[(18.4, 6.6), (19.6, 3.6)], [(13, 10.6), (10.8, 9.2)]], [[(17.2, 19.4), (18, GROUND_Y)], [(13.4, 17.6), (11, 19)]]),
        ((16, 4.4), (16, 7.6), (16, 14.6), [[(13.6, 5), (12.6, 2.2)], [(18.4, 5), (19.4, 2.2)]], [[(14.4, 18.6), (13.6, 22)], [(17.6, 18.6), (18.4, 22)]]),
    ]
    for head, neck, hip, arms, legs in poses:
        f = Frame()
        f.body(head, neck, hip, arms, legs)
        frames.append(f.render())
    return frames


def sower():
    frames = []
    for i in range(3):
        f = Frame()
        x = 13
        reach = [(x + 2.4, 10.4), (x + 4.8, 8.2)] if i == 1 else [(x + 2, 11.6), (x + 2.6, 13.8)]
        walker(f, x, 0.2 + i * 0.33, arms=[reach, [(x - 1.6, 11.6), (x - 2.4, 14)]])
        f.line([(x - 3.4, 12.6), (x - 1, 12.6), (x - 1.4, 15), (x - 3, 15), (x - 3.4, 12.6)], 0.9)  # seed bag
        if i >= 1:
            for k, (dx, dy) in enumerate(((6.6, 8.6), (8.4, 11.6), (10, 15.6), (11.2, 19.6))):
                if k < i * 2:
                    f.disc(x + dx, dy, 0.6, 'lit')
        frames.append(f.render())
    return frames


def bird():
    frames = []
    for up in (True, False):
        f = Frame()
        f.disc(16, 8, 1.6)
        f.poly([(17.2, 7.4), (19.4, 7.8), (17.2, 8.6)])                     # beak
        if up:
            f.line([(16, 8), (12.6, 4.4), (9.6, 5.2)], 1.5)
            f.line([(16, 8), (19.2, 4.2), (22.4, 3.6)], 1.5)
        else:
            f.line([(16, 8), (12.4, 10.6), (9.6, 10)], 1.5)
            f.line([(16, 8), (19.4, 10.8), (22.4, 10.6)], 1.5)
        frames.append(f.render())
    return frames


def butterfly():
    frames = []
    for open_ in (True, False):
        f = Frame()
        y = 10 if open_ else 11
        f.line([(16, y - 2.4), (16, y + 3)], 1.0)                           # body
        f.line([(16, y - 2.4), (14.8, y - 4.4)], 0.6)                      # antennae
        f.line([(16, y - 2.4), (17.2, y - 4.4)], 0.6)
        if open_:
            for sx in (-1, 1):
                f.disc(16 + sx * 3.2, y - 0.8, 2.4, fill=False, w=1.0)       # wings, open
                f.disc(16 + sx * 2.6, y + 2.4, 1.5, fill=False, w=1.0)
                f.disc(16 + sx * 3.2, y - 0.8, 0.8, 'lit')
        else:
            f.poly([(16, y), (13.6, y - 4.4), (15.4, y - 4.8)])            # wings, folded up
            f.poly([(16, y), (18.4, y - 4.4), (16.6, y - 4.8)])
        frames.append(f.render())
    return frames


def sky_listener():
    frames = []
    for i in range(3):
        f = Frame()
        f.disc(5.6, 18.6, 1.9)                                               # head
        f.line([(7.6, 19.6), (16, 20.2)], 1.3)                               # body, lying
        f.line([(16, 20.2), (20.4, 16.6), (24, 20.8)], 1.2)                  # a knee up
        f.line([(16, 20.2), (26.6, 21)], 1.2)                                # the other leg
        f.line([(8.4, 19.4), (8.2, 15.6), (6, 14.8)], 1.0)                   # hand behind the head
        f.line([(10.4, 19.8), (13.2, 17.6)], 1.0)
        for k in range(3):                                                    # what comes down from the sky
            if (k + i) % 3 != 2:
                f.disc(9 + k * 6, 3 + ((k * 3 + i * 4) % 8), 0.7, 'lit')
        for gx in (2, 12, 22, 29):
            f.line([(gx, GROUND_Y), (gx + 0.8, GROUND_Y - 1.8)], 0.7)       # grass
        frames.append(f.render())
    return frames


ACTORS = [
    # name, frames, frames per second, sequence of frame indexes (holds and returns)
    ('listener', listener, 3, [0, 1, 2, 3]),
    ('plant', plant, 2, [0, 0, 1, 2, 3, 4, 5, 6, 6, 6, 6, 6, 6]),
    ('forager', forager, 2.5, [0, 1, 0, 1, 2, 3, 4, 4, 5, 6, 6, 2]),
    ('cow', cow, 1, [0, 1, 1, 0, 1]),
    ('traceur', traceur, 4, [0, 1, 0, 1, 2, 3, 3, 4, 5, 5]),
    ('flag', flag_bearer, 2.5, [0, 1]),
    ('mushroom', mushroom, 2, [0, 0, 1, 2, 3, 4, 4, 4, 4, 4]),
    ('dancer', dancer, 3, [0, 1, 0, 1, 2, 2]),
    ('sower', sower, 2.5, [0, 1, 2, 2]),
    ('bird', bird, 5, [0, 1]),
    ('sky', sky_listener, 1.5, [0, 1, 2]),
    ('butterfly', butterfly, 5, [0, 1]),
]


def main():
    os.makedirs(OUT, exist_ok=True)
    rows = [(name, fn(), fps, seq) for name, fn, fps, seq in ACTORS]
    cols = max(len(fr) for _, fr, _, _ in rows)
    sheet = Image.new('RGBA', (W * cols, H * len(rows)), (0, 0, 0, 0))
    meta = {'cell': [W, H], 'actors': []}
    for r, (name, frames, fps, seq) in enumerate(rows):
        for c, fr in enumerate(frames):
            sheet.alpha_composite(fr, (c * W, r * H))
        meta['actors'].append({'name': name, 'row': r, 'frames': len(frames), 'fps': fps, 'seq': seq})
    sheet.save(os.path.join(OUT, 'ticker.png'), optimize=True)
    json.dump(meta, open(os.path.join(OUT, 'ticker.json'), 'w'), indent=1)
    # A contact sheet for checking, 4× on black.
    check = Image.new('RGBA', sheet.size, (0, 0, 0, 255))
    check.alpha_composite(sheet)
    check.resize((sheet.width * 4, sheet.height * 4), Image.NEAREST).convert('RGB').save(os.path.join(ROOT, 'tools', 'ticker-contact.png'))
    print(f'ticker: {len(rows)} actors, {cols} frames max, sheet {sheet.size}')


if __name__ == '__main__':
    main()
