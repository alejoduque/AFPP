#!/usr/bin/env python3
"""
Deriva Sonora: 1-bit launcher icons and splash screens.

Every pixel is ground (black) or ink (purple #9b4dff); grey is faked with the
same 4x4 Bayer matrix the rings and the globe use. The motif is the rings:
a dithered disc, three inner circles, a solid rim, the dotted crosshair and
four sound dots (one lit white). The splash adds the name in Lugar Común
(Radiolibre's typeface, SIL OFL).

    python3 tools/make_1bit_assets.py [path/to/LugarComun-Regular.ttf]
    python3 tools/make_1bit_assets.py --parade     # the AFPP drawing (+ logo)
    python3 tools/make_1bit_assets.py --logo       # only the AFPP poster logo, splash screens, card

Writes into android/app/src/main/res and public/. Needs Pillow.
"""
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')
PUBLIC = os.path.join(ROOT, 'public')
ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
FONT = ARGS[0] if ARGS else os.path.join(
    ROOT, '..', 'radiolibre_template', 'tools', 'lugar-comun', 'ttf', 'LugarComun-Regular.ttf')

GROUND = (0, 0, 0)
INK = (155, 77, 255)
LIT = (255, 255, 255)
BAYER = [(v + 0.5) / 16 for v in (0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5)]


def dither(x, y, cov):
    return cov > BAYER[(y & 3) * 4 + (x & 3)]


def rings(n, pitch=1, dots=True):
    """The rings motif on an n×n canvas (pitch = pixels per 1-bit dot)."""
    m = max(8, n // pitch)
    img = Image.new('RGB', (m, m), GROUND)
    px = img.load()
    c = m / 2
    R = m * 0.40
    lw = max(0.6, m / 160)
    dot_pos = [(-0.42, -0.30, True), (0.38, 0.18, False), (-0.12, 0.52, False), (0.22, -0.55, False)]
    for y in range(m):
        for x in range(m):
            dx, dy = x + 0.5 - c, y + 0.5 - c
            d = math.hypot(dx, dy)
            cov = 0.0
            if d < R:
                cov = 0.16
            if abs(d - R) < lw * 1.6:
                cov = 1
            for k in (1, 2, 3):
                if abs(d - R * k / 4) < lw:
                    cov = max(cov, 0.8)
            if d < R and (abs(dx) < lw * 0.6 or abs(dy) < lw * 0.6) and (x + y) & 1:
                cov = max(cov, 0.85)
            col = INK if dither(x, y, cov) else GROUND
            if dots:
                for (ux, uy, lit) in dot_pos:
                    ddx, ddy = x + 0.5 - (c + ux * R), y + 0.5 - (c + uy * R)
                    dd = max(abs(ddx), abs(ddy))
                    if dd < R * 0.07:
                        col = LIT if lit else INK
                    elif lit and R * 0.11 < math.hypot(ddx, ddy) < R * 0.2 and dither(x, y, 0.5):
                        col = LIT
            px[x, y] = col
    return img.resize((n, n), Image.NEAREST) if pitch > 1 else img


def save(img, *parts):
    path = os.path.join(*parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, optimize=True)
    return path


def icons():
    legacy = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
    for dens, size in legacy.items():
        # Legacy (pre-Android 8) icons: the motif on a black square / circle.
        sq = rings(size, pitch=max(1, size // 64))
        save(sq, RES, f'mipmap-{dens}', 'ic_launcher.png')
        mask = Image.new('L', (size, size), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
        round_ = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        round_.paste(sq, (0, 0), mask)
        save(round_, RES, f'mipmap-{dens}', 'ic_launcher_round.png')
        # Adaptive foreground: 108dp canvas, motif inside the 72dp safe zone.
        fg_size = size * 108 // 48
        fg = Image.new('RGB', (fg_size, fg_size), GROUND)
        inner = int(fg_size * 72 / 108)
        fg.paste(rings(inner, pitch=max(1, inner // 64)), ((fg_size - inner) // 2,) * 2)
        save(fg, RES, f'mipmap-{dens}', 'ic_launcher_foreground.png')


def splash_image(w, h, font_path):
    img = Image.new('RGB', (w, h), GROUND)
    side = int(min(w, h) * 0.62)
    pitch = max(2, side // 150)
    img.paste(rings(side, pitch=pitch), ((w - side) // 2, int(h * 0.42 - side / 2)))
    try:
        size = max(12, int(min(w, h) * 0.085))
        font = ImageFont.truetype(font_path, size)
        draw = ImageDraw.Draw(img)
        for text, y, col, s in (('DERIVA SONORA', 0.42 + 0.31 * min(w, h) / h + 0.04, INK, size),):
            # Rendered small and scaled up with NEAREST, so the letters are 1-bit too.
            small = Image.new('L', (w // pitch, h // pitch), 0)
            f = ImageFont.truetype(font_path, max(8, s // pitch))
            sd = ImageDraw.Draw(small)
            tw = sd.textlength(text, font=f)
            sd.text(((w // pitch - tw) / 2, y * h / pitch), text, font=f, fill=255)
            bw = small.point(lambda v: 255 if v > 110 else 0).resize((w, h), Image.NEAREST)
            img.paste(Image.new('RGB', (w, h), col), (0, 0), bw)
    except OSError:
        print('font not found, splash without name:', font_path)
    return img


def splashes():
    port = {'mdpi': (320, 480), 'hdpi': (480, 800), 'xhdpi': (720, 1280), 'xxhdpi': (960, 1600), 'xxxhdpi': (1280, 1920)}
    for dens, (w, h) in port.items():
        save(splash_image(w, h, FONT), RES, f'drawable-port-{dens}', 'splash.png')
        save(splash_image(h, w, FONT), RES, f'drawable-land-{dens}', 'splash.png')
    save(splash_image(480, 800, FONT), RES, 'drawable', 'splash.png')
    # The same artwork for the web splash and the favicon.
    save(splash_image(720, 1280, FONT), PUBLIC, 'deriva-splash.png')
    save(rings(192, pitch=3), PUBLIC, 'deriva-icon.png')
    rings(48, pitch=1).save(os.path.join(PUBLIC, 'favicon.ico'), sizes=[(48, 48)])


def parade(threshold=0.36):
    """The Alpine Feminist Punk Parade drawing (tools/afpp-parade-source.jpg), 1-bit:
    its pale purple lines become ink, its grainy dark ground becomes black."""
    src = os.path.join(ROOT, 'tools', 'afpp-parade-source.jpg')
    if not os.path.exists(src):
        return
    img = Image.open(src).convert('RGB')
    img = img.crop((0, int(img.height * 0.02), img.width, img.height))  # a stray scan edge on top
    for width, name in ((1200, 'afpp-parade.png'), (480, 'afpp-parade-480.png')):
        h = round(img.height * width / img.width)
        small = img.resize((width, h), Image.LANCZOS)
        lum = small.convert('L').point(lambda v: 255 if v / 255 > threshold else 0)
        out = Image.new('RGB', small.size, GROUND)
        out.paste(Image.new('RGB', small.size, INK), (0, 0), lum)
        save(out, PUBLIC, name)
    # Social preview: the drawing centred on a 1200×630 black card.
    card = Image.new('RGB', (1200, 630), GROUND)
    art = Image.open(os.path.join(PUBLIC, 'afpp-parade-480.png'))
    art = art.resize((round(art.width * 600 / art.height), 600), Image.NEAREST)
    card.paste(art, ((1200 - art.width) // 2, 15))
    save(card, PUBLIC, 'afpp-card.png')


def logo(threshold=0.30):
    """The AFPP poster logo (tools/afpp-logo-source.jpeg), 1-bit: the poster, the
    lettering alone for headers, the social card, and every splash screen."""
    src = os.path.join(ROOT, 'tools', 'afpp-logo-source.jpeg')
    if not os.path.exists(src):
        return
    img = Image.open(src).convert('RGB')

    def onebit(im):
        lum = im.convert('L').point(lambda v: 255 if v / 255 > threshold else 0)
        out = Image.new('RGB', im.size, GROUND)
        out.paste(Image.new('RGB', im.size, INK), (0, 0), lum)
        return out, lum

    def sized(width):
        return img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)

    for width, name in ((900, 'afpp-logo.png'), (480, 'afpp-logo-480.png')):
        save(onebit(sized(width))[0], PUBLIC, name)

    # The lettering: the top of the poster, trimmed to its ink, on transparent.
    big = sized(1200)
    top = big.crop((0, int(big.height * 0.015), big.width, int(big.height * 0.42)))
    art, lum = onebit(top)
    # Keep the lettering, not the mountains under it: everything above the peaks,
    # and lower only on the left, where the stem of the P reaches down.
    keep = Image.new('L', lum.size, 0)
    from PIL import ImageDraw as _D
    _D.Draw(keep).polygon([(0, 0), (lum.width, 0), (lum.width, int(big.height * 0.322)),
                           (int(lum.width * 0.27), int(big.height * 0.322)), (int(lum.width * 0.27), int(big.height * 0.36)), (0, int(big.height * 0.36))], fill=255)
    lum = Image.composite(lum, Image.new('L', lum.size, 0), keep)
    box = lum.getbbox()
    art, lum = art.crop(box), lum.crop(box)
    for height, name in ((96, 'afpp-wordmark.png'), (48, 'afpp-wordmark-48.png')):
        w = round(art.width * height / art.height)
        m = lum.resize((w, height), Image.BOX).point(lambda v: 255 if v > 80 else 0)
        mark = Image.new('RGBA', (w, height), (0, 0, 0, 0))
        mark.paste(Image.new('RGBA', (w, height), INK + (255,)), (0, 0), m)
        save(mark, PUBLIC, name)

    # Social card: the poster on a 1200×630 black card.
    card = Image.new('RGB', (1200, 630), GROUND)
    poster = onebit(img.resize((round(img.width * 600 / img.height), 600), Image.LANCZOS))[0]
    card.paste(poster, ((1200 - poster.width) // 2, 15))
    save(card, PUBLIC, 'afpp-card.png')

    # Splash screens: the poster, centred on black, as large as fits.
    def splash(w, h):
        out = Image.new('RGB', (w, h), GROUND)
        scale = min(w * 0.88 / img.width, h * 0.88 / img.height)
        p = onebit(img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS))[0]
        out.paste(p, ((w - p.width) // 2, (h - p.height) // 2))
        return out

    port = {'mdpi': (320, 480), 'hdpi': (480, 800), 'xhdpi': (720, 1280), 'xxhdpi': (960, 1600), 'xxxhdpi': (1280, 1920)}
    for dens, (w, h) in port.items():
        save(splash(w, h), RES, f'drawable-port-{dens}', 'splash.png')
        save(splash(h, w), RES, f'drawable-land-{dens}', 'splash.png')
    save(splash(480, 800), RES, 'drawable', 'splash.png')
    save(splash(720, 1280), PUBLIC, 'deriva-splash.png')


if __name__ == '__main__':
    if '--parade' not in sys.argv and '--logo' not in sys.argv:
        icons()
        splashes()
    if '--logo' not in sys.argv:
        parade()
    logo()  # last: its splash screens and card replace the rings ones
    print('1-bit assets written')
