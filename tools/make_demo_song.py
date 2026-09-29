#!/usr/bin/env python3
"""make_demo_song.py: synthesize the demo song ("Paper Boat") with numpy, plus its exact lyrics (LRC) and ground truth.

The demo video needs music we are free to publish, and the analyzer needs a song whose tempo, downbeats and sections
are known exactly. This writes both. Only numpy and scipy are needed (no uv environment):

    python3 tools/make_demo_song.py videos/demo            # -> song.wav, lyrics.lrc, truth.json

Structure (104 BPM, 4/4, first downbeat at 0.40 s):  intro 4 bars | verse 4 bars | chorus 8 bars | outro 2 bars + ring
"""
import json, sys
from pathlib import Path
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

SR, BPM, LEAD = 44100, 104, 0.40
BEAT = 60 / BPM
BAR = 4 * BEAT
SECTIONS = [("intro", "Intro", 0, 4), ("verse", "Verse", 4, 8), ("chorus", "Chorus", 8, 16), ("outro", "Outro", 16, 18)]
N_BARS = 18
DUR = LEAD + N_BARS * BAR + 3.2
rng = np.random.default_rng(7)
N = int(DUR * SR)
L, R = np.zeros(N), np.zeros(N)

def bt(bar, beat=0.0):  # song time of a bar/beat position
    return LEAD + bar * BAR + beat * BEAT

def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)

def env_adsr(n, a, d, s, r, hold):
    """Sample envelope: attack a s, decay d s to sustain s, hold `hold` s total, release r s."""
    t = np.arange(n) / SR
    e = np.where(t < a, t / max(a, 1e-4), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-4)))
    rel = t > hold
    e[rel] *= np.exp(-(t[rel] - hold) / max(r, 1e-4))
    return e

def add(sig, t0, gain=1.0, pan=0.0):
    i = int(t0 * SR)
    if i >= N:
        return
    sig = sig[: N - i]
    L[i : i + len(sig)] += sig * gain * np.sqrt(0.5 * (1 - pan))
    R[i : i + len(sig)] += sig * gain * np.sqrt(0.5 * (1 + pan))

def lp(x, hz, order=2):
    return sosfilt(butter(order, hz, "low", fs=SR, output="sos"), x)

def hp(x, hz, order=2):
    return sosfilt(butter(order, hz, "high", fs=SR, output="sos"), x)

def bp(x, lo, hi):
    return sosfilt(butter(2, [lo, hi], "band", fs=SR, output="sos"), x)

def saw(f, n, detune=0.0):
    t = np.arange(n) / SR
    ph = (f * (1 + detune)) * t + rng.random()
    return 2 * (ph % 1) - 1

# ---------- drums ----------
def kick():
    n = int(0.45 * SR); t = np.arange(n) / SR
    f = 45 + 95 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7) + 0.3 * np.exp(-t * 200) * rng.standard_normal(n) * 0.2

def snare():
    n = int(0.3 * SR); t = np.arange(n) / SR
    return 0.7 * bp(rng.standard_normal(n), 1500, 7000) * np.exp(-t * 16) + 0.5 * np.sin(2 * np.pi * 185 * t) * np.exp(-t * 25)

def hat(open_=False):
    n = int((0.25 if open_ else 0.06) * SR); t = np.arange(n) / SR
    return hp(rng.standard_normal(n), 7000, 4) * np.exp(-t * (12 if open_ else 70))

# ---------- harmony: D  A  Bm  G ----------
CHORDS = [(62, 66, 69), (61, 64, 69), (59, 62, 66), (59, 62, 67)]
ROOTS = [38, 45, 35, 43]

def pad(bar, gain):
    notes = CHORDS[bar % 4]; n = int(BAR * SR * 1.25)
    sig = sum(saw(mtof(m), n, d) for m in notes for d in (-0.004, 0.004)) / 6
    sig = lp(sig, 1800) * env_adsr(n, 0.5, 1.0, 0.8, 0.4, BAR)
    add(sig, bt(bar), gain * 0.55, -0.3); add(sig, bt(bar) + 0.011, gain * 0.55, 0.3)

def bass(bar, gain, busy):
    root = ROOTS[bar % 4]
    pattern = [0, 1.5, 2, 3, 3.5] if busy else [0, 2]
    for b in pattern:
        n = int(BEAT * (0.9 if b % 1 == 0 else 0.45) * SR)
        m = root + (12 if busy and b == 3.5 else 0)
        sig = lp(saw(mtof(m), n), 500) * env_adsr(n, 0.005, 0.2, 0.6, 0.05, n / SR - 0.05)
        add(sig, bt(bar, b), gain * 0.9)

def lead_note(t0, m, dur, gain, bright):
    n = int((dur + 0.25) * SR); t = np.arange(n) / SR
    vib = 1 + 0.006 * np.sin(2 * np.pi * 5.5 * t) * np.clip((t - 0.15) * 4, 0, 1)
    ph = np.cumsum(mtof(m) * vib) / SR
    sig = 0.6 * np.sin(2 * np.pi * ph) + 0.25 * np.sign(np.sin(2 * np.pi * ph)) * bright + 0.15 * np.sin(4 * np.pi * ph)
    sig = lp(sig, 2400 + 2600 * bright) * env_adsr(n, 0.02, 0.3, 0.75, 0.12, dur)
    add(sig, t0, gain, 0.1)

# ---------- melody + lyrics: (bar, beat, midi, beats, syllable). "|" starts a lyric line; a trailing "-" joins the next syllable ----------
VERSE = [  # "Paper boat on a paper sea" / "folding up the night for me"
    (4, 0, 69, 1, "|Pa-"), (4, 1, 69, .5, "per"), (4, 1.5, 71, 1, "boat"), (4, 2.5, 69, .5, "on"), (4, 3, 66, .5, "a"),
    (5, 0, 69, 1, "pa-"), (5, 1, 71, .5, "per"), (5, 1.5, 73, 2, "sea"),
    (6, 0, 71, 1, "|Fold-"), (6, 1, 71, .5, "ing"), (6, 1.5, 69, 1, "up"), (6, 2.5, 66, .5, "the"), (6, 3, 64, 1, "night"),
    (7, 0, 66, 1, "for"), (7, 1, 69, 2.5, "me"),
]
CHORUS = [  # "Row, row, into the glow" / "every wave's a place to go" / "Row, row, don't let go" / "paint the dawn where rivers flow"
    (8, 0, 74, 1, "|Row,"), (8, 1, 74, 1, "row,"), (8, 2, 73, .5, "in-"), (8, 2.5, 71, .5, "to"), (8, 3, 69, .5, "the"), (9, 0, 71, 2, "glow"),
    (10, 0, 69, .5, "|Ev-"), (10, .5, 69, .5, "ery"), (10, 1, 71, 1, "wave's"), (10, 2, 73, .5, "a"), (10, 2.5, 74, 1, "place"), (11, 0, 76, .5, "to"), (11, .5, 74, 2, "go"),
    (12, 0, 74, 1, "|Row,"), (12, 1, 74, 1, "row,"), (12, 2, 76, 1, "don't"), (12, 3, 78, 1, "let"), (13, 0, 76, 2, "go"),
    (14, 0, 71, .5, "|Paint"), (14, .5, 71, .5, "the"), (14, 1, 73, 1, "dawn"), (14, 2, 74, .5, "where"), (14, 2.5, 76, 1, "riv-"), (15, 0, 74, .5, "ers"), (15, .5, 74, 2.5, "flow"),
]

def build():
    for bar in range(N_BARS):
        sec = next(s for s in SECTIONS if s[2] <= bar < s[3])[0]
        full = sec == "chorus"
        pad(bar, {"intro": 0.7, "verse": 0.5, "chorus": 0.45, "outro": 0.7}[sec])
        if sec in ("verse", "chorus"):
            bass(bar, 0.9 if full else 0.7, full)
        for b in range(4):  # drums
            if sec == "intro":
                if bar >= 2: add(hat(), bt(bar, b + 0.5), 0.12, 0.4)
                continue
            if sec == "outro":
                if bar == 16 and b == 0: add(kick(), bt(bar, b), 1.0); add(hat(True), bt(bar, b), 0.2, 0.4)
                continue
            if full or b in (0, 2): add(kick(), bt(bar, b), 1.0 if full else 0.85)
            if b in (1, 3): add(snare(), bt(bar, b), 0.55 if full else 0.35, -0.1)
            for h in (0, 0.5): add(hat(full and h == 0.5), bt(bar, b + h), 0.18 if full else 0.13, 0.4)
        if bar == 7:  # drum fill into the chorus
            for k in range(4): add(snare(), bt(7, 3 + k * 0.25), 0.3 + 0.1 * k, -0.1)
    add(hat(True) * 3, bt(8), 0.25)  # crash-ish on the chorus downbeat
    words = []
    for bar, beat, m, dur, syl in VERSE + CHORUS:
        lead_note(bt(bar, beat), m, dur * BEAT * 0.95, 0.42 if bar >= 8 else 0.34, 1.0 if bar >= 8 else 0.4)
        words.append((bt(bar, beat), syl))
    # the outro: the hook once more, alone, then a ring-out chord
    for bar, beat, m, dur, _ in CHORUS[:6]:
        lead_note(bt(bar + 8, beat), m, dur * BEAT * 0.95, 0.3, 0.2)
    return words

def lrc(words):
    """Line-level LRC plus enhanced (word) timing: [mm:ss.xx] <mm:ss.xx> word <mm:ss.xx> word ..."""
    ts = lambda t: f"{int(t // 60):02d}:{t % 60:05.2f}"
    lines, cur = [], None
    for t, syl in words:
        if syl.startswith("|"):
            cur = [t, []]; lines.append(cur); syl = syl[1:]
        cur[1].append((t, syl))
    out = ["[ti:Paper Boat]", "[ar:Music Video Studio demo]", "[by:tools/make_demo_song.py]"]
    for t0, syls in lines:
        # join syllables into words: a syllable ending in "-" continues into the next one ("Pa-" + "per" = "Paper")
        wordlist = []
        for t, s in syls:
            if wordlist and wordlist[-1][1].endswith("-"):
                wordlist[-1] = (wordlist[-1][0], wordlist[-1][1][:-1] + s)
            else:
                wordlist.append((t, s))
        body = " ".join(f"<{ts(t)}> {w}" for t, w in wordlist)
        out.append(f"[{ts(t0)}] {body}")
    return "\n".join(out) + "\n"

if __name__ == "__main__":
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "videos/demo"); out.mkdir(parents=True, exist_ok=True)
    words = build()
    mix = np.stack([L, R], 1)
    mix = hp(mix.T, 25).T
    fade = np.clip((DUR - np.arange(N) / SR) / 2.5, 0, 1)[:, None]
    mix = np.tanh(mix * fade * 1.1)
    mix *= 0.66 / np.abs(mix).max()   # about -3.6 dBFS peak: headroom so the AAC encode stays under -1 dBTP
    wavfile.write(out / "song.wav", SR, (mix * 32767).astype(np.int16))
    (out / "lyrics.lrc").write_text(lrc(words))
    truth = {"bpm": BPM, "first_downbeat": LEAD, "beats_per_bar": 4, "duration": DUR,
             "sections": [{"id": i, "name": n, "start": round(bt(a), 3), "end": round(bt(b), 3)} for i, n, a, b in SECTIONS]}
    (out / "truth.json").write_text(json.dumps(truth, indent=2))
    print(f"wrote {out}/song.wav ({DUR:.1f} s), lyrics.lrc, truth.json")
