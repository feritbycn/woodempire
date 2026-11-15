"""Wood Empire — özgün uygulama simgesi ve açılış ekranı üretici (PIL).
Kullanım: python3 scripts/gen-icons.py
Çıktılar: public/icon.png, store/icon-512.png, store/feature-graphic.png, Android mipmap + splash dosyaları
"""
import math, os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, 'android/app/src/main/res')
FONT = os.path.join(ROOT, 'scripts/.fonts/baloo800.ttf')

def font(size):
    try: return ImageFont.truetype(FONT, size)
    except Exception: return ImageFont.truetype('DejaVuSans-Bold.ttf', size)

def radial(size, c0, c1, center=(0.5, 0.4)):
    img = Image.new('RGB', (size, size))
    px = img.load(); cx, cy = center[0] * size, center[1] * size; R = size * 0.75
    for y in range(size):
        for x in range(size):
            t = min(1, math.hypot(x - cx, y - cy) / R)
            px[x, y] = tuple(int(c0[i] + (c1[i] - c0[i]) * t) for i in range(3))
    return img

def emblem(size, transparent=False):
    """Kütük kesiti + balta amblemi (size x size)."""
    S = size * 4
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx, cy = S * 0.5, S * 0.54
    # kütük gövdesi (perspektif)
    r = S * 0.30
    d.rounded_rectangle([cx - r * 1.05, cy - r * 0.15, cx + r * 1.05, cy + r * 0.95], radius=int(r * 0.4), fill=(110, 62, 30, 255))
    for i in range(6):
        x = cx - r * 0.9 + i * r * 0.36
        d.line([(x, cy + r * 0.2), (x + r * 0.05, cy + r * 0.85)], fill=(80, 44, 20, 255), width=int(S * 0.012))
    # kesit yüzü
    d.ellipse([cx - r, cy - r * 0.95, cx + r, cy + r * 0.55], fill=(92, 52, 25, 255))
    d.ellipse([cx - r * 0.9, cy - r * 0.86, cx + r * 0.9, cy + r * 0.46], fill=(242, 205, 150, 255))
    for k, col in enumerate([(214, 165, 102), (232, 190, 130), (205, 152, 90), (226, 180, 118)]):
        f = 0.75 - k * 0.17
        d.ellipse([cx - r * 0.9 * f, cy - r * 0.2 - r * 0.66 * f, cx + r * 0.9 * f, cy - r * 0.2 + r * 0.66 * f], outline=col + (255,), width=int(S * 0.012))
    d.ellipse([cx - r * 0.08, cy - r * 0.27, cx + r * 0.08, cy - r * 0.13], fill=(180, 120, 60, 255))
    # balta (çapraz)
    ax = Image.new('RGBA', (S, S), (0, 0, 0, 0)); ad = ImageDraw.Draw(ax)
    hx, hy = S * 0.5, S * 0.5
    ad.rounded_rectangle([hx - S * 0.035, hy - S * 0.38, hx + S * 0.035, hy + S * 0.30], radius=int(S * 0.03), fill=(150, 98, 60, 255), outline=(70, 40, 20, 255), width=int(S * 0.012))
    ad.polygon([(hx + S * 0.02, hy - S * 0.36), (hx + S * 0.26, hy - S * 0.44), (hx + S * 0.30, hy - S * 0.24), (hx + S * 0.24, hy - S * 0.10), (hx + S * 0.02, hy - S * 0.18)], fill=(214, 224, 230, 255), outline=(55, 71, 79, 255))
    ad.line([(hx + S * 0.26, hy - S * 0.43), (hx + S * 0.29, hy - S * 0.25), (hx + S * 0.24, hy - S * 0.11)], fill=(255, 255, 255, 255), width=int(S * 0.018))
    ax = ax.rotate(-32, center=(hx, hy), resample=Image.BICUBIC)
    ax = ax.transform(ax.size, Image.AFFINE, (1, 0, S * 0.07, 0, 1, S * 0.08))
    # gölge
    sh = Image.new('RGBA', (S, S), (0, 0, 0, 0)); sh.paste((0, 0, 0, 90), mask=ax.split()[3]); sh = sh.filter(ImageFilter.GaussianBlur(S * 0.012))
    img = Image.alpha_composite(img, sh.transform(sh.size, Image.AFFINE, (1, 0, -S * 0.01, 0, 1, -S * 0.015)))
    img = Image.alpha_composite(img, ax)
    return img.resize((size, size), Image.LANCZOS)

def icon(size, rounded=True):
    bg = radial(size, (140, 214, 92), (40, 112, 44)).convert('RGBA')
    if rounded:
        m = Image.new('L', (size, size), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.22), fill=255)
        bg.putalpha(m)
    e = emblem(int(size * 0.86))
    o = (size - e.size[0]) // 2
    bg.alpha_composite(e, (o, o + int(size * 0.02)))
    return bg

def round_icon(size):
    ic = icon(size, rounded=False)
    m = Image.new('L', (size, size), 0); ImageDraw.Draw(m).ellipse([0, 0, size - 1, size - 1], fill=255)
    ic.putalpha(m); return ic

def text_logo(w, h, img, y):
    d = ImageDraw.Draw(img)
    for txt, sz, col, dy in [('WOOD', int(h * 0.16), (255, 179, 0), 0), ('EMPIRE', int(h * 0.12), (255, 246, 227), int(h * 0.13))]:
        f = font(sz)
        tw = d.textlength(txt, font=f)
        x = (w - tw) / 2
        for ox in range(-6, 7, 3):
            for oy in range(-6, 13, 3): d.text((x + ox * sz / 160, y + dy + oy * sz / 160), txt, font=f, fill=(59, 36, 24))
        d.text((x, y + dy), txt, font=f, fill=col)

os.makedirs(os.path.join(ROOT, 'public'), exist_ok=True)
os.makedirs(os.path.join(ROOT, 'store'), exist_ok=True)
icon(512).save(os.path.join(ROOT, 'store/icon-512.png'))
icon(192).save(os.path.join(ROOT, 'public/icon.png'))

# Android simgeleri
dens = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
for dn, k in dens.items():
    d = os.path.join(RES, 'mipmap-' + dn); os.makedirs(d, exist_ok=True)
    s = int(48 * k)
    icon(s).save(os.path.join(d, 'ic_launcher.png'))
    round_icon(s).save(os.path.join(d, 'ic_launcher_round.png'))
    fs = int(108 * k)
    fg = Image.new('RGBA', (fs, fs), (0, 0, 0, 0))
    e = emblem(int(fs * 0.62)); o = (fs - e.size[0]) // 2
    fg.alpha_composite(e, (o, o))
    fg.save(os.path.join(d, 'ic_launcher_foreground.png'))
with open(os.path.join(RES, 'values/ic_launcher_background.xml'), 'w') as f:
    f.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#4E9A3A</color>\n</resources>\n')

# Açılış ekranları
def splash(w, h):
    img = radial(max(w, h), (138, 209, 106), (47, 107, 42), (0.5, 0.38)).crop((0, 0, w, h)).convert('RGBA')
    s = int(min(w, h) * 0.42)
    e = emblem(s); img.alpha_composite(e, ((w - s) // 2, int(h * 0.42 - s * 0.75)))
    text_logo(w, int(min(w, h) * 1.2), img, int(h * 0.42 + s * 0.3))
    return img.convert('RGB')
sizes = {'mdpi': (320, 480), 'hdpi': (480, 800), 'xhdpi': (720, 1280), 'xxhdpi': (960, 1600), 'xxxhdpi': (1280, 1920)}
for dn, (w, h) in sizes.items():
    for orient, (ww, hh) in [('port', (w, h)), ('land', (h, w))]:
        d = os.path.join(RES, f'drawable-{orient}-{dn}'); os.makedirs(d, exist_ok=True)
        splash(ww, hh).save(os.path.join(d, 'splash.png'))
splash(480, 800).save(os.path.join(RES, 'drawable/splash.png'))

# Google Play öne çıkan görsel (1024x500)
fgimg = radial(1024, (138, 209, 106), (40, 100, 40), (0.3, 0.5)).crop((0, 262, 1024, 762)).convert('RGBA')
e = emblem(380); fgimg.alpha_composite(e, (60, 60))
text_logo(1024 + 420, 900, fgimg, 120)
fgimg.convert('RGB').save(os.path.join(ROOT, 'store/feature-graphic.png'))
print('simgeler hazır')
