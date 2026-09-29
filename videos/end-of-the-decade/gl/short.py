# /// script
# requires-python = ">=3.10"
# dependencies = ["numpy", "pillow"]
# ///
"""short.py: the YouTube Short of "End of the Decade" (1080x1920, 60 fps): verse 3 -> final chorus -> dawn.

Source: clean 4K plates without type (render_short.sh -> out/short/plates/plates_4k.mp4). Each shot is reframed to
9:16 (a 1215x2160 window of the 3840x2160 plate, panned per shot: SHOTS below), the lyrics are set again for a phone
(vertical karaoke in the house style: unsung dim, the sung part wipes in caution yellow, done words go bone), the
backing echo stacks in lilac mono, and the title comes up over the dawn. Audio: song.wav from the same instant.

    uv run short.py cuts                    # shot cuts found in the plates (to check SHOTS against)
    uv run short.py preview --t 110,120.5   # reframed + typed stills -> out/short/preview/
    uv run short.py sheet                   # one still per shot -> out/short/preview/shots.jpg
    uv run short.py                         # the Short -> out/short/end_of_the_decade_short.mp4
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent
import os
PLATES = Path(os.environ.get("PLATES", ROOT / "out" / "short" / "plates" / "plates_4k.mp4"))
SONG = ROOT / "audio" / "song.wav"
LYRICS = ROOT / "data" / "lyrics.json"
OUTDIR = ROOT / "out" / "short"
FONTS = ROOT.parents[2] / "gl" / "app" / "public" / "fonts"

FPS = 60
N0 = round(106.683 * FPS)          # first plate frame (render.ts renders frame n at n / FPS)
T0 = N0 / FPS                      # 106.6833: "So I took hold" (the string plate's first frame)
T_END = 161.5                      # a little dawn after the music stops
SW, SH = 3840, 2160                # plate size
CW = round(SH * 9 / 16)            # 1215: the 9:16 window
OW, OH = 1080, 1920                # output
K = SH / OH                        # 1.125: work pixels per output pixel (type is set at work size, then scaled)

# ---------------------------------------------------------------------------------------------------------- palette
INK = np.array((10, 14, 26), np.float32)
BONE = np.array((242, 244, 247), np.float32)
SIGNAL = np.array((255, 210, 31), np.float32)
LILAC = np.array((184, 166, 255), np.float32)

# ------------------------------------------------------------------------------------------------------------ shots
# (start, crop centre at the shot's start, at its end) as fractions of the plate width. The centre eases between the
# two across the shot; it jumps only on cuts. Starts are the plates' cuts (python3 short.py cuts).
SHOTS = [
    (106.683, 0.66, 0.62),   # the single string, followed down
    (108.60, 0.60, 0.52),    # up the string into the rays
    (110.72, [(110.72, 0.50), (111.0, 0.49), (111.7, 0.46), (112.0, 0.40), (112.2, 0.33), (112.4, 0.24), (112.84, 0.19)]),
    #                        through the clouds to the two cuffed hands on the crosses: stay with the left hand (the
    #                        cheque lands in it twice) as the camera slides right
    (112.84, 0.50, 0.50),    # the front rows
    (114.97, 0.50, 0.50),    # the referees with their badges
    (117.09, 0.50, 0.50),    # the rivals' hands meet in the middle
    (119.21, 0.66, 0.66),    # the door that closes quietly
    (123.46, 0.50, 0.50),    # final chorus: the crowd under the strings
    (127.71, 0.36, 0.36),    # the little figure in the dark
    (128.60, 0.37, 0.37),    # the cane, the robot, the shadow
    (129.83, 0.50, 0.50),    # two puppets in front of the crowd
    (131.96, 0.50, 0.50),    # the aisle
    (134.08, 0.66, 0.66),    # the dark dancer
    (136.21, 0.50, 0.50),    # the crowd from behind, craning up to the hands on the crosses
    (138.33, 0.46, 0.46),    # money: the slam
    (140.45, 0.50, 0.50),    # the crowd's faces
    (142.58, 0.50, 0.50),    # the widest shot, the ticker
    (144.70, 0.62, 0.66),    # the hands, the coins
    (146.83, 0.37, 0.37),    # the robot and the shadow on the wall
    (148.95, [(148.95, 0.50), (151.6, 0.50), (152.6, 0.46), (153.4, 0.40), (155.32, 0.40)]),
    #                        the crowd, the glow, the lamp; then one move up the aisle into the shadow to the robot
    (155.32, [(155.32, 0.53), (156.5, 0.56), (158.0, 0.75), (161.5, 0.78)]),   # dawn: go with the robot
]


def crop_x(t):
    """left edge of the 9:16 window (plate px) at song time t"""
    i = max([k for k, s in enumerate(SHOTS) if s[0] <= t + 1e-6] or [0])
    a = SHOTS[i][0]
    b = SHOTS[i + 1][0] if i + 1 < len(SHOTS) else T_END
    if isinstance(SHOTS[i][1], list):
        keys = SHOTS[i][1]  # [(t, centre), ...] inside the shot, eased from one to the next
    else:
        keys = [(a, SHOTS[i][1]), (b, SHOTS[i][2])]
    if t <= keys[0][0]:
        c = keys[0][1]
    elif t >= keys[-1][0]:
        c = keys[-1][1]
    else:
        j = max(k for k in range(len(keys)) if keys[k][0] <= t)
        (ta, ca), (tb, cb) = keys[j], keys[j + 1]
        u = (t - ta) / max(1e-3, tb - ta)
        u = u * u * (3 - 2 * u)  # smoothstep: pans ease in and out
        c = ca + (cb - ca) * u
    return int(round(min(SW - CW, max(0, c * SW - CW / 2))))


# ------------------------------------------------------------------------------------------------------------- type
def font(name, size_out):
    return ImageFont.truetype(str(FONTS / name), max(1, round(size_out * K)))


def typo(s):
    return s.replace("'", "\u2019")


class Word:
    def __init__(self, w, start, end, syl):
        self.w, self.start, self.end, self.syl = typo(w), start, end, syl

    def progress(self, t):
        """engine Lyrics.wordProgress: through the syllables when there are several"""
        if t <= self.start:
            return 0.0
        if t >= self.end:
            return 1.0
        if self.syl and len(self.syl) > 1:
            n = len(self.syl)
            for i, (a, b) in enumerate(self.syl):
                if t < a:
                    return i / n
                if t < b:
                    return (i + (t - a) / max(1e-3, b - a)) / n
            return 1.0
        return (t - self.start) / max(1e-3, self.end - self.start)


# lines broken where the phrase breaks (the same split points as the 16:9 `string` plate)
BREAKS = {
    "So I took hold": "and",
    "The checks that built": "fund",
    "Now the referees": "and",
    "On a door that closes": "on",
}


def balanced_rows(words, fnt, max_w, space):
    """fewest rows that fit, then the break that evens them out (no widows)"""
    widths = [fnt.getlength(w.w) for w in words]

    def rows_for(n):
        best = None
        # all ways to cut the words into n contiguous rows (lines here are short: brute force is fine)
        def rec(i, left, acc):
            nonlocal best
            if left == 1:
                row = list(range(i, len(words)))
                if not row:
                    return
                rows = acc + [row]
                ws = [sum(widths[j] for j in r) + space * (len(r) - 1) for r in rows]
                if max(ws) <= max_w and (best is None or max(ws) < best[0]):
                    best = (max(ws), rows)
                return
            for j in range(i + 1, len(words)):
                rec(j, left - 1, acc + [list(range(i, j))])
        rec(0, n, [])
        return best

    for n in range(1, len(words) + 1):
        b = rows_for(n)
        if b:
            return [[words[j] for j in r] for r in b[1]]
    return [[w] for w in words]


class Block:
    """a lyric line laid out for the phone: rows of words, glyph masks, its soft shadow and scrim"""

    PAD = 90  # work px around the text for the shadow, the scrim and the pop

    def __init__(self, text, words, size, fnt_name, cy, max_w, color, upper=False, tracking=0.0, leading=1.16,
                 unsung=0.34, done=None, scrim=0.42):
        self.text, self.words = text, words
        self.size = size * K
        self.fnt = font(fnt_name, size)
        self.color, self.done = color, BONE if done is None else done
        self.unsung, self.scrim_a = unsung, scrim
        self.start, self.end = words[0].start, words[-1].end
        self.tracking = tracking * K
        disp = [w.w.upper() if upper else w.w for w in words]
        for w, d in zip(words, disp):
            w.disp = d
        space = self.fnt.getlength(" ") + self.tracking
        key = next((k for k in BREAKS if text.startswith(k)), None)
        if key:
            j = next(i for i, w in enumerate(words) if i > 0 and w.w.lower() == BREAKS[key])
            groups = [words[:j], words[j:]]
        else:
            groups = [words]
        rows = []
        for g in groups:
            rows += balanced_rows(g, _Measure(self.fnt, self.tracking), max_w * K, space)
        lead = leading * self.size
        asc, desc = self.fnt.getmetrics()
        cap = self.fnt.getbbox("H", anchor="ls")
        cap_h = cap[3] - cap[1]
        total = cap_h + lead * (len(rows) - 1)
        y0 = cy * K - total / 2 + cap_h  # baseline of the first row, so the block's ink is centred on cy
        self.placed = []  # (word, x, y_baseline, width)
        for r, row in enumerate(rows):
            ws = [self._width(w.disp) for w in row]
            rw = sum(ws) + space * (len(row) - 1)
            x = (CW - rw) / 2
            for w, wd in zip(row, ws):
                self.placed.append((w, x, y0 + r * lead, wd))
                x += wd + space
        # the region this block may touch (work px), and the masks in it
        xs0 = min(p[1] for p in self.placed); xs1 = max(p[1] + p[3] for p in self.placed)
        ys0 = y0 - cap_h - asc * 0.25; ys1 = y0 + lead * (len(rows) - 1) + desc
        P = self.PAD
        self.box = (int(max(0, xs0 - P)), int(max(0, ys0 - P)), int(min(CW, xs1 + P)), int(min(SH, ys1 + P)))
        bw, bh = self.box[2] - self.box[0], self.box[3] - self.box[1]
        self.masks = []
        allm = Image.new("L", (bw, bh), 0)
        for w, x, y, wd in self.placed:
            m = Image.new("L", (bw, bh), 0)
            self._draw(ImageDraw.Draw(m), x - self.box[0], y - self.box[1], w.disp)
            allm.paste(255, (0, 0), m)
            self.masks.append((np.asarray(m, np.float32) / 255.0, int(x - self.box[0]), wd))
        sh = Image.new("L", (bw, bh), 0)
        sh.paste(allm, (0, round(5 * K)))
        self.shadow = np.asarray(sh.filter(ImageFilter.GaussianBlur(9 * K)), np.float32) / 255.0 * 0.9
        scr = Image.new("L", (bw, bh), 0)
        ImageDraw.Draw(scr).rounded_rectangle((P * 0.55, P * 0.55, bw - P * 0.55, bh - P * 0.55), radius=int(40 * K), fill=255)
        self.scrim = np.asarray(scr.filter(ImageFilter.GaussianBlur(34 * K)), np.float32) / 255.0

    def _width(self, s):
        return self.fnt.getlength(s) + self.tracking * max(0, len(s) - 1) if self.tracking else self.fnt.getlength(s)

    def _draw(self, d, x, y, s):
        if not self.tracking:
            d.text((x, y), s, font=self.fnt, fill=255, anchor="ls")
            return
        for ch in s:
            d.text((x, y), ch, font=self.fnt, fill=255, anchor="ls")
            x += self.fnt.getlength(ch) + self.tracking

    def layers(self, t, A, lift=True):
        """premultiplied RGB and alpha for the block's box at time t, overall opacity A"""
        bw, bh = self.box[2] - self.box[0], self.box[3] - self.box[1]
        rgb = np.zeros((bh, bw, 3), np.float32)
        a = np.zeros((bh, bw), np.float32)

        def over(color, alpha):
            nonlocal rgb, a
            rgb = color * alpha[..., None] + rgb * (1 - alpha[..., None])
            a = alpha + a * (1 - alpha)

        if self.scrim_a > 0:
            over(INK, self.scrim * (self.scrim_a * A))
        over(INK, self.shadow * A)
        for (w, x, y, wd), (m, mx, _) in zip(self.placed, self.masks):
            pr = w.progress(t)
            since = t - w.start
            pop = 0.06 * np.sin(since / 0.22 * np.pi) if (lift and 0 < since < 0.22) else 0.0
            dy = -int(round(pop * self.size * 0.6))
            mm = np.roll(m, dy, axis=0) if dy else m
            if pr < 1:
                over(BONE, mm * (self.unsung * A))
            if pr > 0:
                cut = int(round(mx - 4 * K + (wd + 8 * K) * pr))
                sm = mm.copy()
                sm[:, max(0, cut):] = 0
                over(self.color if pr < 1 else self.done, sm * A)
        return rgb, a


class _Measure:
    """getlength with tracking, for balanced_rows"""

    def __init__(self, f, tr):
        self.f, self.tr = f, tr

    def getlength(self, s):
        return self.f.getlength(s) + self.tr * max(0, len(s) - 1)


# ------------------------------------------------------------------------------------------------------ the lyrics
LEAD_Y = 1150        # output px: the lyric block's centre (above the Shorts UI at the bottom, clear of the side rail)
LEAD_MAXW = 820
VERSE_SIZE, CHORUS_SIZE = 66, 82
# per-line placement overrides (output px centre y), for shots whose subject sits where the type would
LEAD_Y_AT = {
    "The checks tha": 450,    # over the sleeve and the strings: clear of the cheque in the hand and the front rows. faces
    "Now the refere": 1340,   # under the referees' badges, below the rivals' handshake
    "On a door that": 330,    # above the door (its wheel sits where the type would)
    "We've got till": 360,    # over the big shadow (the walk ends on the robot, low in the frame)
}


def load_lines():
    L = json.load(open(LYRICS))["lines"]
    out = []
    for l in L:
        if l["start"] < T0 - 0.2 or l["start"] > T_END:
            continue
        ws = [Word(w["w"], w["start"], w["end"], w.get("syl")) for w in l["words"]]
        out.append((l, ws))
    return out


def build():
    lead, echo = [], []
    for l, ws in load_lines():
        if l.get("backing"):
            echo.append((l, ws))
            continue
        verse = l["start"] < 123.4
        size = VERSE_SIZE if verse else CHORUS_SIZE
        cy = LEAD_Y_AT.get(l["text"][:14], LEAD_Y)
        lead.append(Block(l["text"], ws, size, "Unbounded-700.ttf", cy, LEAD_MAXW, SIGNAL))
    # show windows: anticipate / linger trimmed so two lead lines never overlap (a short crossfade where they touch)
    for i, b in enumerate(lead):
        gb = b.start - lead[i - 1].end if i else 9
        ga = lead[i + 1].start - b.end if i + 1 < len(lead) else 9
        b.antic = max(0.06, min(0.3, gb * 0.5))
        b.linger = max(0.06, min(0.45, ga * 0.5 - 0.01))
        if i + 1 == len(lead):
            b.linger = 0.3
    echoes = []
    for l, ws in echo:
        # the lead block sounding with the echo: stack the echo copies under it
        host = min(lead, key=lambda b: abs(b.start - l["start"]) if b.start <= l["start"] else 99)
        ybot = (host.placed[-1][2] / K) + 70
        eb = Block(l["text"], ws, 34, "MartianMono-w1125-500.ttf", ybot, 900, LILAC, upper=True, tracking=34 * 0.18,
                   unsung=0.25, done=LILAC, scrim=0.0)
        eb.host = host
        echoes.append(eb)
    return lead, echoes


def smooth(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


class Title:
    """END OF THE / DECADE over the dawn sky (the house lock-up from thumbs.py)"""

    def __init__(self, cy=310):
        f1, f2 = font("Unbounded-900.ttf", 70), font("Unbounded-900.ttf", 120)
        im = Image.new("RGBA", (CW, int(420 * K)), (0, 0, 0, 0))
        m1 = Image.new("L", im.size, 0); m2 = Image.new("L", im.size, 0)
        y1, y2 = int(160 * K), int(290 * K)
        ImageDraw.Draw(m1).text((CW / 2, y1), "END OF THE", font=f1, fill=255, anchor="ms")
        ImageDraw.Draw(m2).text((CW / 2, y2), "DECADE", font=f2, fill=255, anchor="ms")
        both = Image.fromarray(np.maximum(np.asarray(m1), np.asarray(m2)))
        sh = Image.new("L", im.size, 0); sh.paste(both, (0, int(8 * K)))
        sh = np.asarray(sh.filter(ImageFilter.GaussianBlur(14 * K)), np.float32) / 255 * 0.8
        glow = np.asarray(m2.filter(ImageFilter.GaussianBlur(18 * K)), np.float32) / 255 * 0.35
        a1 = np.asarray(m1, np.float32) / 255; a2 = np.asarray(m2, np.float32) / 255
        rgb = np.zeros(sh.shape + (3,), np.float32); a = np.zeros(sh.shape, np.float32)
        for col, al in ((INK, sh), (SIGNAL, glow), (BONE, a1), (SIGNAL, a2)):
            rgb = col * al[..., None] + rgb * (1 - al[..., None]); a = al + a * (1 - al)
        self.rgb, self.a = rgb, a
        self.y = int(cy * K - im.size[1] / 2)
        self.t0, self.t1 = 158.95, 159.9  # fade in once the music has gone


def compose(frame, t, lead, echoes, title):
    """frame: the cropped work frame (SH x CW x 3, uint8) -> composited uint8"""
    f = frame.astype(np.float32)

    def put(rgb, a, box):
        x0, y0, x1, y1 = box
        reg = f[y0:y1, x0:x1]
        f[y0:y1, x0:x1] = rgb + reg * (1 - a[..., None])

    for b in lead:
        if t < b.start - b.antic or t > b.end + b.linger:
            continue
        A = smooth((t - (b.start - b.antic)) / b.antic) * (1 - smooth((t - b.end) / b.linger))
        if b is lead[0]:
            A = 1 - smooth((t - b.end) / b.linger)  # the Short opens on it
        if A > 0.002:
            put(*b.layers(t, A), b.box)
    for e in echoes:
        # engine drawEcho: copies of the same line, each 0.32 s later, falling back and halving
        if not (e.start - 0.2 <= t < e.end + 0.8):
            continue
        for k in range(3, -1, -1):
            tk = t - k * 0.32
            if tk < e.start - 0.2:
                continue
            A = 0.5 ** k * (1 - smooth((t - e.end) / 0.8)) * smooth((tk - (e.start - 0.2)) / 0.2)
            if A < 0.01:
                continue
            dy = int(round(k * 34 * 1.25 * K))
            x0, y0, x1, y1 = e.box
            if y1 + dy > SH:
                continue
            rgb, a = e.layers(tk, A, lift=False)
            put(rgb, a, (x0, y0 + dy, x1, y1 + dy))
    if t > title.t0:
        A = smooth((t - title.t0) / (title.t1 - title.t0))
        h = title.a.shape[0]
        put(title.rgb * A, title.a * A, (0, title.y, CW, title.y + h))
    # the Short loops: fade the last beat to black (the first frame is the dark string shot)
    fade = 1 - smooth((t - (T_END - 0.9)) / 0.9)
    if fade < 1:
        f *= fade
    return np.clip(f + 0.5, 0, 255).astype(np.uint8)


# ------------------------------------------------------------------------------------------------------------- I/O
def frames(t_from=T0, n=None):
    ss = max(0.0, t_from - float(os.environ.get("PLATES_T0", T0)))  # PLATES_T0: when PLATES is one segment
    cmd = ["ffmpeg", "-v", "error", "-ss", f"{ss:.4f}", "-i", str(PLATES)]
    if n:
        cmd += ["-frames:v", str(n)]
    cmd += ["-vf", "scale=in_color_matrix=bt709:in_range=tv", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, bufsize=SW * SH * 3)
    size = SW * SH * 3
    i = 0
    while True:
        buf = p.stdout.read(size)
        if len(buf) < size:
            break
        yield t_from + i / FPS, np.frombuffer(buf, np.uint8).reshape(SH, SW, 3)
        i += 1
    p.wait()


def still(t, lead, echoes, title):
    ft, fr = next(frames(round(t * FPS) / FPS, 1))
    x = crop_x(ft)
    out = compose(np.ascontiguousarray(fr[:, x:x + CW]), ft, lead, echoes, title)
    return Image.fromarray(out).resize((OW, OH), Image.LANCZOS)


def cmd_cuts():
    p = subprocess.Popen(["ffmpeg", "-v", "error", "-i", str(PLATES), "-vf", "scale=160:90,format=gray", "-f", "rawvideo", "-"],
                         stdout=subprocess.PIPE)
    prev, i, d = None, 0, []
    while True:
        b = p.stdout.read(160 * 90)
        if len(b) < 160 * 90:
            break
        a = np.frombuffer(b, np.uint8).astype(np.float32)
        if prev is not None:
            d.append((T0 + i / FPS, float(np.abs(a - prev).mean())))
        prev, i = a, i + 1
    v = np.array([x[1] for x in d])
    for j, (t, x) in enumerate(d):
        loc = np.median(v[max(0, j - 30):j + 30])
        if x > max(6.0, 5 * loc):
            print(f"cut at {t:8.3f}  diff {x:5.1f}  (local {loc:4.1f})")


def main():
    args = sys.argv[1:]
    mode = args[0] if args and not args[0].startswith("--") else "video"
    if mode == "cuts":
        return cmd_cuts()
    lead, echoes = build()
    title = Title()
    pv = OUTDIR / "preview"
    pv.mkdir(parents=True, exist_ok=True)
    if mode == "preview":
        ts = [float(x) for x in args[args.index("--t") + 1].split(",")]
        for t in ts:
            p = pv / f"s_{t:07.2f}.jpg"
            still(t, lead, echoes, title).save(p, quality=90)
            print(p)
        return
    if mode == "sheet":
        ts = [(a + (SHOTS[i + 1][0] if i + 1 < len(SHOTS) else T_END)) / 2 for i, (a, *_) in enumerate(SHOTS)]
        if "--t" in args:
            ts = [float(x) for x in args[args.index("--t") + 1].split(",")]
        cols = 7
        tw, th = 270, 480
        sheet = Image.new("RGB", (cols * tw, ((len(ts) + cols - 1) // cols) * th), (0, 0, 0))
        fnt = ImageFont.truetype(str(FONTS / "MartianMono-w1000-500.ttf"), 18)
        for i, t in enumerate(ts):
            im = still(t, lead, echoes, title).resize((tw, th), Image.LANCZOS)
            d = ImageDraw.Draw(im)
            d.rectangle((0, 0, 86, 24), fill=(0, 0, 0)); d.text((4, 2), f"{t:.2f}", font=fnt, fill=(255, 210, 31))
            sheet.paste(im, ((i % cols) * tw, (i // cols) * th))
        out = pv / (args[args.index("--out") + 1] if "--out" in args else "shots.jpg")
        sheet.save(out, quality=86)
        print(out)
        return
    # the Short
    out = OUTDIR / "end_of_the_decade_short.mp4"
    dur = T_END - T0
    enc = subprocess.Popen([
        "ffmpeg", "-v", "error", "-y",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{CW}x{SH}", "-r", str(FPS), "-i", "-",
        "-ss", f"{T0:.4f}", "-t", f"{dur:.4f}", "-i", str(SONG),
        "-filter_complex", f"[0:v]scale={OW}:{OH}:flags=lanczos:out_color_matrix=bt709:out_range=tv,format=yuv420p,"
                           f"setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709[v];"
                           f"[1:a]afade=t=in:d=0.015,afade=t=out:st={dur - 0.9:.3f}:d=0.9,apad[a]",
        "-map", "[v]", "-map", "[a]", "-shortest",
        "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-profile:v", "high", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "320k", "-ar", "48000", "-movflags", "+faststart", str(out)],
        stdin=subprocess.PIPE)
    n = 0
    total = round(T_END * FPS) - N0
    for t, fr in frames():
        x = crop_x(t)
        enc.stdin.write(compose(np.ascontiguousarray(fr[:, x:x + CW]), t, lead, echoes, title).tobytes())
        n += 1
        if n % 120 == 0:
            print(f"\r{n}/{total}", end="", flush=True)
    enc.stdin.close()
    enc.wait()
    print(f"\n{n} frames -> {out}")


if __name__ == "__main__":
    main()
