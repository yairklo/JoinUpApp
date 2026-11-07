"""Generate JoinUp logo assets from the attached icon + wordmark splits.

Cleaning: the splits came from a JPG on white, so edge pixels are blended toward white. Each pixel
is classified green/orange by hue, its coverage is recovered by un-blending from white, and it is
repainted with one flat brand colour at that coverage. That removes the white fringe and JPG noise.
"""
import sys, os, base64, io
from PIL import Image, ImageChops

SRC_ICON, SRC_WORD, REPO = sys.argv[1], sys.argv[2], sys.argv[3]

GREEN = (3, 110, 84)      # median of the attached artwork
ORANGE = (240, 76, 24)
DARK = {GREEN: (16, 185, 129), ORANGE: (242, 103, 42)}  # existing kit dark palette (#10B981/#F2672A)


def clean(path, scale=2):
    im = Image.open(path).convert("RGBA")
    im = im.resize((im.width * scale, im.height * scale), Image.LANCZOS)
    r, g, b, a = im.split()
    w, h = im.size
    rp, gp, bp, ap = r.load(), g.load(), b.load(), a.load()
    cls = Image.new("L", im.size, 0)        # 1 = green, 2 = orange
    cov = Image.new("L", im.size, 0)
    cp, vp = cls.load(), cov.load()
    for y in range(h):
        for x in range(w):
            if ap[x, y] == 0:
                continue
            R, G, B = rp[x, y], gp[x, y], bp[x, y]
            if R > G + 20:                     # orange
                c = (255 - B) / (255 - ORANGE[2])
                k = 2
            else:                              # green (or near-white fringe)
                c = (255 - R) / (255 - GREEN[0])
                k = 1
            c = max(0.0, min(1.0, c))
            if c < 0.12:
                c = 0.0
            elif c > 0.9:
                c = 1.0
            else:
                c = (c - 0.12) / 0.78
            vp[x, y] = int(round(c * ap[x, y]))
            cp[x, y] = k
    return cls, cov


def paint(cls, cov, dark=False):
    g = DARK[GREEN] if dark else GREEN
    o = DARK[ORANGE] if dark else ORANGE
    out = Image.new("RGBA", cls.size, g + (0,))
    orange_mask = cls.point(lambda v: 255 if v == 2 else 0)
    out.paste(Image.new("RGBA", cls.size, o + (255,)), (0, 0), orange_mask)
    out.putalpha(cov)
    return out.crop(cov.getbbox())


def mono(img, color=(255, 255, 255)):
    out = Image.new("RGBA", img.size, color + (0,))
    out.putalpha(img.getchannel("A"))
    return out


def fit(img, box):
    """Resize img to fit inside box (w, h), keeping aspect."""
    s = min(box[0] / img.width, box[1] / img.height)
    return img.resize((max(1, round(img.width * s)), max(1, round(img.height * s))), Image.LANCZOS)


def square(img, size, frac, bg=None):
    canvas = Image.new("RGBA", (size, size), (bg + (255,)) if bg else (0, 0, 0, 0))
    m = fit(img, (round(size * frac), round(size * frac)))
    canvas.alpha_composite(m, ((size - m.width) // 2, (size - m.height) // 2))
    return canvas


def lockup(icon, word, height):
    """Icon left, wordmark right (wordmark always reads LTR), wordmark ~0.55 of icon height."""
    ic = fit(icon, (10_000, height))
    wd = fit(word, (10_000, round(height * 0.55)))
    gap = round(height * 0.12)
    out = Image.new("RGBA", (ic.width + gap + wd.width, height), (0, 0, 0, 0))
    out.alpha_composite(ic, (0, 0))
    out.alpha_composite(wd, (ic.width + gap, (height - wd.height) // 2))
    return out


def save(img, rel, opaque=False, colors=128):
    path = os.path.join(REPO, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if opaque:
        img = img.convert("RGB")
        img.quantize(colors=colors, method=Image.MEDIANCUT, dither=Image.NONE).save(path, optimize=True)
    else:
        img.quantize(colors=colors, method=Image.FASTOCTREE, dither=Image.NONE).save(path, optimize=True)
    print(f"{rel}: {Image.open(path).size} {os.path.getsize(path)//1024}KB")


ic_cls, ic_cov = clean(SRC_ICON)
wd_cls, wd_cov = clean(SRC_WORD)
icon_l, icon_d = paint(ic_cls, ic_cov), paint(ic_cls, ic_cov, dark=True)
word_l, word_d = paint(wd_cls, wd_cov), paint(wd_cls, wd_cov, dark=True)
WHITE = (255, 255, 255)

# Design masters (cleaned, optimized; not the raw JPG)
save(square(icon_l, 1024, 1.0), "design/brand/joinup-logo-v2/joinup-icon-1024.png")
save(fit(word_l, (1600, 1600)), "design/brand/joinup-logo-v2/joinup-wordmark.png")
save(lockup(icon_l, word_l, 480), "design/brand/joinup-logo-v2/joinup-lockup-horizontal.png")
save(lockup(icon_d, word_d, 480), "design/brand/joinup-logo-v2/joinup-lockup-horizontal-on-dark.png")

# Web: in-app marks (served from /brand, rendered at <=56px tall -> 3x)
save(lockup(icon_l, word_l, 168), "next_app/public/brand/joinup-lockup-light.png")
save(lockup(icon_d, word_d, 168), "next_app/public/brand/joinup-lockup-dark.png")
save(square(icon_l, 192, 1.0), "next_app/public/brand/joinup-icon-light.png")
save(square(icon_d, 192, 1.0), "next_app/public/brand/joinup-icon-dark.png")

# Web: favicons / PWA
save(square(icon_l, 32, 1.0), "next_app/public/icons/favicon-32x32.png")
save(square(icon_l, 96, 1.0), "next_app/public/icons/favicon-96x96.png")
save(square(icon_l, 180, 0.84, WHITE), "next_app/public/icons/apple-touch-icon.png", opaque=True)
save(square(icon_l, 192, 0.86, WHITE), "next_app/public/icons/web-app-manifest-192x192.png", opaque=True)
save(square(icon_l, 512, 0.86, WHITE), "next_app/public/icons/web-app-manifest-512x512.png", opaque=True)
save(square(icon_l, 512, 0.66, WHITE), "next_app/public/icons/web-app-manifest-maskable-512x512.png", opaque=True)
ico = os.path.join(REPO, "next_app/public/icons/favicon.ico")
square(icon_l, 256, 1.0).save(ico, sizes=[(16, 16), (32, 32), (48, 48)])
print("favicon.ico", os.path.getsize(ico) // 1024, "KB")

# favicon.svg: embedded PNGs, swapped by prefers-color-scheme like the old one
def b64(img):
    buf = io.BytesIO(); img.quantize(colors=64, method=Image.FASTOCTREE, dither=Image.NONE).save(buf, "PNG", optimize=True); return base64.b64encode(buf.getvalue()).decode()
svg = (
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 96 96" '
    'width="96" height="96" role="img" aria-labelledby="t"><title id="t">JoinUp</title>'
    '<style>.d{display:none}@media (prefers-color-scheme:dark){.l{display:none}.d{display:inline}}</style>'
    f'<image class="l" width="96" height="96" href="data:image/png;base64,{b64(square(icon_l, 64, 1.0))}"/>'
    f'<image class="d" width="96" height="96" href="data:image/png;base64,{b64(square(icon_d, 64, 1.0))}"/>'
    '</svg>\n'
)
for rel in ("next_app/public/favicon.svg", "next_app/public/icons/favicon.svg"):
    with open(os.path.join(REPO, rel), "w") as f:
        f.write(svg)
    print(rel, len(svg) // 1024, "KB")

# Mobile: in-app marks (same filenames BrandLogo already requires)
save(lockup(icon_l, word_l, 168), "mobile_app/assets/images/brand/lockup-light.png")
save(lockup(icon_d, word_d, 168), "mobile_app/assets/images/brand/lockup-dark.png")
save(square(icon_l, 384, 1.0), "mobile_app/assets/images/brand/symbol-light.png")
save(square(icon_d, 384, 1.0), "mobile_app/assets/images/brand/symbol-dark.png")

# Mobile: native
save(square(icon_l, 1024, 0.84, WHITE), "mobile_app/assets/images/icon.png", opaque=True)        # iOS: no alpha
save(square(icon_l, 1024, 0.62), "mobile_app/assets/images/adaptive-icon.png")                     # inside 66% safe zone
save(square(mono(icon_l), 1024, 0.62), "mobile_app/assets/images/adaptive-icon-monochrome.png", colors=32)
save(square(icon_d, 1024, 0.84), "mobile_app/assets/images/splash-icon.png")                       # on #0b1220 splash
save(square(mono(icon_l), 96, 0.92), "mobile_app/assets/images/notification-icon.png", colors=32)  # Android: white + alpha
save(square(icon_l, 96, 1.0), "mobile_app/assets/images/favicon.png")

print("lockup aspect:", lockup(icon_l, word_l, 168).size)
