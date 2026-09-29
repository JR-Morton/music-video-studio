# /// script
# requires-python = ">=3.10"
# dependencies = ["pillow"]
# ///
"""YouTube thumbnail options for "End of the Decade" (1280x720 JPEG, < 2 MB).
Source plates: clean renders without type at 2x (render.ts stills --notype --scale 2) in out/thumbs/hi/; missing ones
are rendered first (needs `bun install` in gl/app).
    uv run thumbs.py            -> out/thumbs/thumb_*.jpg + out/thumbs/options.jpg (contact sheet)
"""
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent
HI = ROOT / "out" / "thumbs" / "hi"
OUT = ROOT / "out" / "thumbs"
FONTS = ROOT.parents[2] / "gl" / "app" / "public" / "fonts"
W, H = 1280, 720

INK = (10, 14, 26)
BONE = (242, 244, 247)
SIGNAL = (255, 210, 31)
SHADOW = (38, 26, 72)   # bruise indigo


TIMES = [47.8, 69.3, 112.0, 141.1, 146.6, 153.6, 162.0]   # song seconds of the plates used below


def render_missing():
    need = [t for t in TIMES if not (HI / f"f_{t:07.2f}.png").exists()]
    if need:
        print("rendering clean 4K plates at", need)
        subprocess.run(["bun", "scripts/render.ts", "stills", "--video", ROOT.parent.name, "--notype", "--scale", "2",
                        "--t", ",".join(str(t) for t in need), "--out", str(HI)], cwd=ROOT.parents[2] / "gl" / "app", check=True)


def font(name, size):
    return ImageFont.truetype(str(FONTS / name), size)


def plate(t, crop=(0.0, 0.0, 1.0), contrast=1.06, color=1.08, bright=1.0):
    """crop = (x0, y0, width) as fractions of the frame; height follows 16:9."""
    im = Image.open(HI / f"f_{t:07.2f}.png").convert("RGB")
    fw, fh = im.size
    x0, y0, cw = crop
    w = int(fw * cw); h = int(w * 9 / 16)
    im = im.crop((int(fw * x0), int(fh * y0), int(fw * x0) + w, int(fh * y0) + h)).resize((W, H), Image.LANCZOS)
    im = ImageEnhance.Contrast(im).enhance(contrast)
    im = ImageEnhance.Color(im).enhance(color)
    im = ImageEnhance.Brightness(im).enhance(bright)
    return im


def shade(im, box, color=INK, alpha=0.55, blur=60):
    """a soft dark pool behind type (box in px), so it reads at stamp size"""
    m = Image.new("L", im.size, 0)
    ImageDraw.Draw(m).rounded_rectangle(box, radius=40, fill=int(255 * alpha))
    m = m.filter(ImageFilter.GaussianBlur(blur))
    return Image.composite(Image.new("RGB", im.size, color), im, m)


def text(im, xy, s, f, fill=BONE, anchor="la", stroke=0, stroke_fill=INK, drop=(0, 8), drop_blur=14,
         drop_color=INK, drop_alpha=0.85, glow=None):
    """type with a soft drop shadow (and an optional glow in its own colour)"""
    lay = Image.new("L", im.size, 0)
    ImageDraw.Draw(lay).text((xy[0] + drop[0], xy[1] + drop[1]), s, font=f, fill=255, anchor=anchor,
                             stroke_width=stroke + 4, stroke_fill=255)
    lay = lay.filter(ImageFilter.GaussianBlur(drop_blur)).point(lambda v: int(v * drop_alpha))
    im = Image.composite(Image.new("RGB", im.size, drop_color), im, lay)
    if glow:
        g = Image.new("L", im.size, 0)
        ImageDraw.Draw(g).text(xy, s, font=f, fill=255, anchor=anchor, stroke_width=stroke + 2, stroke_fill=255)
        g = g.filter(ImageFilter.GaussianBlur(glow[0])).point(lambda v: int(v * glow[1]))
        im = Image.composite(Image.new("RGB", im.size, fill), im, g)
    d = ImageDraw.Draw(im)
    d.text(xy, s, font=f, fill=fill, anchor=anchor, stroke_width=stroke, stroke_fill=stroke_fill)
    return im


def title_stack(im, x, y, size=118, anchor_x="l", gap=0.98, top=BONE, big=SIGNAL):
    """END OF THE / DECADE (the house title lock-up)"""
    f1, f2 = font("Unbounded-900.ttf", int(size * 0.62)), font("Unbounded-900.ttf", size)
    a = anchor_x + "s"
    im = text(im, (x, y), "END OF THE", f1, fill=top, anchor=a)
    im = text(im, (x, y + int(size * gap)), "DECADE", f2, fill=big, anchor=a, glow=(18, 0.35))
    return im


def save(im, name):
    p = OUT / f"{name}.jpg"
    im.save(p, quality=92, optimize=True, progressive=True)
    assert p.stat().st_size < 2_000_000, p
    return p


def main():
    render_missing()
    made = []

    # 1. the small robot and its giant shadow (final chorus, the turn)
    im = plate(153.6, crop=(0.08, 0.06, 0.84), contrast=1.1, color=1.1)
    im = title_stack(im, 1220, 150, size=132, anchor_x="r", top=BONE, big=BONE)
    made.append(save(im, "thumb_1_shadow"))

    # 2. who's pulling the strings (verse 3: the hands on the crosses)
    im = plate(112.0, crop=(0.0, 0.0, 1.0), contrast=1.1, color=1.1, bright=1.05)
    im = shade(im, (60, 470, 1220, 700), alpha=0.5)
    f = font("Unbounded-900.ttf", 74)
    im = text(im, (640, 560), "WHO'S PULLING", f, fill=BONE, anchor="ms")
    im = text(im, (640, 655), "THE STRINGS?", f, fill=SIGNAL, anchor="ms", glow=(16, 0.35))
    made.append(save(im, "thumb_2_strings"))

    # 3. 2030: the crowd, the sign, the shadow on the wall; the year counter
    im = plate(47.8, crop=(0.05, 0.02, 0.9), contrast=1.08, color=1.1)
    fm = font("MartianMono-w1125-800.ttf", 150)
    box = (60, 300, 580, 490)
    d = ImageDraw.Draw(im)
    im = shade(im, (box[0] - 30, box[1] - 30, box[2] + 30, box[3] + 30), alpha=0.6, blur=30)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle(box, radius=26, fill=(14, 18, 32), outline=(90, 96, 120), width=3)
    im = text(im, ((box[0] + box[2]) // 2, (box[1] + box[3]) // 2 + 4), "2030", fm, fill=SIGNAL, anchor="mm",
              drop=(0, 0), drop_alpha=0.0, glow=(22, 0.55))
    made.append(save(im, "thumb_3_2030"))

    # 4. the money's being made (the hands above, coins pouring)
    im = plate(146.6, crop=(0.0, 0.0, 1.0), contrast=1.05, color=1.05)
    band = (0, 470, W, 610)
    im = shade(im, (band[0] - 40, band[1] - 10, band[2] + 40, band[3] + 10), alpha=0.75, blur=24)
    fm = font("MartianMono-w1125-800.ttf", 92)
    im = text(im, (640, 540), "+$2,000,000,000", fm, fill=SIGNAL, anchor="mm", drop=(0, 0), drop_alpha=0.0, glow=(20, 0.6))
    fs = font("MartianMono-w1000-500.ttf", 30)
    im = text(im, (640, 640), "THE MONEY'S BEING MADE", fs, fill=BONE, anchor="mm", drop=(0, 3), drop_blur=8)
    made.append(save(im, "thumb_4_money"))

    # 5. the hook: the cuffed hand fishing for the little red robot
    im = plate(69.3, crop=(0.02, 0.0, 0.96), contrast=1.1, color=1.12, bright=1.1)
    im = shade(im, (0, 50, 520, 400), alpha=0.6)
    im = title_stack(im, 44, 160, size=92)
    made.append(save(im, "thumb_5_hook"))

    # 6. dawn: the robot watching the sun come up (the hopeful one)
    im = plate(162.0, crop=(0.0, 0.0, 1.0), contrast=1.06, color=1.12)
    im = title_stack(im, 1220, 170, size=112, anchor_x="r", top=BONE, big=SIGNAL)
    made.append(save(im, "thumb_6_dawn"))

    # 7. smile and sing along: the grinning marionettes, yanked on the beat, coins in the air
    im = plate(141.1, crop=(0.06, 0.08, 0.84), contrast=1.08, color=1.08, bright=1.04)
    im = shade(im, (620, 480, 1280, 720), alpha=0.7, blur=40)
    f = font("Unbounded-900.ttf", 80)
    im = text(im, (1236, 575), "SMILE AND", f, fill=BONE, anchor="rs")
    im = text(im, (1236, 670), "SING ALONG", f, fill=SIGNAL, anchor="rs", glow=(16, 0.35))
    made.append(save(im, "thumb_7_smile"))

    # contact sheet
    rows = (len(made) + 1) // 2
    sheet = Image.new("RGB", (W, rows * (H // 2)), INK)
    for i, p in enumerate(made):
        t = Image.open(p).resize((W // 2 - 8, H // 2 - 8), Image.LANCZOS)
        sheet.paste(t, ((i % 2) * (W // 2) + 4, (i // 2) * (H // 2) + 4))
    sheet.save(OUT / "options.jpg", quality=88)
    for p in made:
        print(p.name, f"{p.stat().st_size / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
