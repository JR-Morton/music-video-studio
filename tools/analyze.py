# /// script
# requires-python = ">=3.10,<3.14"
# dependencies = ["librosa>=0.10.2", "soundfile", "numpy", "scipy", "matplotlib"]
# ///
"""analyze.py: turn a song into data the animation can dance to.

    uv run tools/analyze.py videos/<slug>/song.mp3 --out videos/<slug> [--bpm 104] [--downbeat 0.40] [--bpb 4]

Writes, into --out:
  analysis.json / analysis.js   tempo, beat grid, downbeats, sections, audio envelopes and hits (ANALYSIS = {...})
  analysis.md                   a readable summary for storyboarding (sections, bars, energy)
  analysis.png                  the song on one picture: loudness, bands, beats, bars, sections (and lyric lines)

Every number here is an estimate. Hints fix the usual mistakes: --bpm (tempo octave: 70 vs 140), --downbeat (bar phase),
--sections "0,9.63,18.86" (your own boundaries). Or edit video.js afterwards; the engine reads the tempo, offset and
sections from there.
"""
import argparse, json, math, sys
from pathlib import Path

import numpy as np
import librosa

SR, HOP, HOP_F = 22050, 256, 512   # HOP: fine hop for onsets and beats (11.6 ms); HOP_F: feature hop
EPS = 1e-10


def pct_norm(x, lo=5, hi=99.5, floor=None):
    """Map x to 0..1 between two percentiles (robust against silence and single spikes)."""
    a, b = np.percentile(x, lo), np.percentile(x, hi)
    if floor is not None:
        a = max(a, floor)
    return np.clip((x - a) / max(b - a, EPS), 0, 1)


def db(x):
    return 10 * np.log10(np.maximum(x, EPS))


def zs(x, axis=-1):
    return (x - x.mean(axis=axis, keepdims=True)) / (x.std(axis=axis, keepdims=True) + 1e-9)


# ---------------------------------------------------------------- beats
def refine_peaks(times, env, sr, hop, win=0.035):
    """Move each time to the strongest onset-envelope peak within ±win s (parabolic interpolation)."""
    out, n = [], len(env)
    for t in times:
        c = int(round(t * sr / hop)); w = max(1, int(win * sr / hop))
        a, b = max(1, c - w), min(n - 2, c + w)
        if b <= a:
            out.append(t); continue
        i = a + int(np.argmax(env[a:b + 1]))
        y0, y1, y2 = env[i - 1], env[i], env[i + 1]
        d = 0.5 * (y0 - y2) / (y0 - 2 * y1 + y2) if (y0 - 2 * y1 + y2) != 0 else 0
        out.append((i + float(np.clip(d, -.5, .5))) * hop / sr)
    return np.array(out)


def comb_fit(env, sr, hop, bpm0, dur, span=0.03):
    """Constant-tempo grid t = t0 + i * P that puts the most onset energy on its beats, over the whole song.

    A beat tracker follows local evidence, so a quiet intro with off-beat hats can pull it half a beat out of phase and
    its tempo is only as fine as its search. Produced music is quantised to a fixed grid, and fitting that grid to the
    whole song at once gets the tempo to ~0.01 BPM and the phase to ~1 ms. Searches bpm0 ± span (keeps the octave)."""
    tt = np.arange(len(env)) * hop / sr
    e = env / (env.max() + EPS)
    best = (-1.0, 0.0, 0.0)
    for P in 60 / np.linspace(bpm0 * (1 - span), bpm0 * (1 + span), 481):
        ph = np.arange(0, P, 0.004); n = int(dur / P) + 1
        s = np.interp(ph[:, None] + np.arange(n)[None, :] * P, tt, e).mean(axis=1)
        k = int(np.argmax(s))
        if s[k] > best[0]:
            best = (float(s[k]), float(P), float(ph[k]))
    _, P, t0 = best
    for step in (0.0005, 0.00005):    # polish tempo and phase together
        cands = [(P + dP, t0 + dt) for dP in np.arange(-10, 11) * step * P / 10 for dt in np.arange(-10, 11) * step * 4]
        n = int(dur / P) + 1
        sc = [np.interp(t0_ + np.arange(n) * P_, tt, e).mean() for P_, t0_ in cands]
        P, t0 = cands[int(np.argmax(sc))]
    t0 = t0 % P
    return P, t0


def grid_error(grid, env, sr, hop):
    """How far the song's strong onsets sit from the grid: residuals (s) of local onset peaks near each grid beat."""
    tt = np.arange(len(env)) * hop / sr
    peaks = refine_peaks(grid, env, sr, hop, win=0.07)
    strength = np.interp(peaks, tt, env)
    strong = strength > np.percentile(strength, 40)
    return (peaks - grid)[strong]


def kick_alignment(low_hits, bpm, offset, tol=0.08):
    """Share of strong low-band hits (kicks) that land within ±tol beat of a beat of this grid."""
    ts = [h[0] for h in low_hits if h[1] > 0.5]
    if len(ts) < 8:
        return None
    B = 60 / bpm
    return float(np.mean([min(p, 1 - p) < tol for p in (((t - offset) / B) % 1 for t in ts)]))


def tempo_alternatives(env, sr, hop, dur, bpm, low_hits):
    """The metrical level is the classic beat-tracking mistake (half, double, 2/3, 3/2 of the true tempo). Fit a grid at
    each alternative and report how many kicks it catches. Faster grids always catch more, so this is advice, not a vote."""
    out = []
    for r in (0.5, 2 / 3, 1.0, 1.5, 2.0):
        if not 50 <= bpm * r <= 220:
            continue
        P, t0 = comb_fit(env, sr, hop, bpm * r, dur, span=0.006) if r != 1.0 else (60 / bpm, None)
        if t0 is None:
            P, t0 = comb_fit(env, sr, hop, bpm, dur, span=0.002)
        out.append({"ratio": round(r, 3), "bpm": round(60 / P, 2), "kicks_on_beat": kick_alignment(low_hits, 60 / P, t0)})
    return out


def downbeat_phase(beat_times, kick_env, chroma, rms_env, sr, bpb):
    """Which beat of the bar is the "1"? Kicks, harmony changes and loudness changes tend to land on downbeats."""
    fr = lambda env, hop: env[np.clip(np.round(beat_times * sr / hop).astype(int), 0, len(env) - 1)]
    kick = zs(fr(kick_env, HOP))
    cb = np.clip(np.round(beat_times * sr / HOP_F).astype(int), 0, chroma.shape[1] - 1)
    C = chroma[:, cb]; C = C / (np.linalg.norm(C, axis=0, keepdims=True) + 1e-9)
    change = np.r_[0, 1 - np.sum(C[:, 1:] * C[:, :-1], axis=0)]
    lv = fr(rms_env, HOP_F); dl = np.r_[0, np.maximum(0, np.diff(lv))]
    score = kick + 1.2 * zs(change) + 0.6 * zs(dl)
    phases = [float(np.mean(score[p::bpb])) for p in range(bpb)]
    return int(np.argmax(phases)), phases


# ---------------------------------------------------------------- sections
def foote(S, K):
    """Novelty along the diagonal of a self-similarity matrix, Gaussian-tapered checkerboard kernel of half-width K."""
    n = S.shape[0]; g = np.exp(-0.5 * (np.linspace(-1, 1, 2 * K) * 2) ** 2)
    ker = np.outer(g, g) * np.outer(np.r_[-np.ones(K), np.ones(K)], np.r_[-np.ones(K), np.ones(K)])
    P = np.pad(S, K, mode="edge"); nov = np.zeros(n + 1)
    for i in range(n + 1):
        nov[i] = np.sum(P[i:i + 2 * K, i:i + 2 * K] * ker)
    return np.maximum(nov, 0)


def segment(bar_feats, bar_rms, min_bars, max_n):
    n = bar_feats.shape[1]
    if n < 2 * min_bars:
        return [0, n]
    X = zs(bar_feats, axis=1); X = X / (np.linalg.norm(X, axis=0, keepdims=True) + 1e-9)
    S = X.T @ X
    nov = sum(foote(S, K) / (foote(S, K).max() + 1e-9) for K in (2, 4) if n > 2 * K)
    nov = nov / (nov.max() + 1e-9)
    de = np.r_[0, np.abs(np.diff(bar_rms)), 0]          # loudness change at each bar boundary (n + 1 values, like nov)
    nov = nov + 0.8 * de / (de.max() + 1e-9)
    nov[:1] = nov[-1:] = 0
    # prefer boundaries on 4-bar phrases: music is built in phrases, so boost multiples of 4 bars from the first bar
    nov = nov * np.array([1.15 if i % 4 == 0 else 1.0 for i in range(n + 1)])
    cand = sorted(range(1, n), key=lambda i: -nov[i]); cut = [0, n]
    thr = np.mean(nov[1:n]) + 0.35 * np.std(nov[1:n])
    for i in cand:
        if nov[i] < thr or len(cut) - 1 >= max_n:
            break
        if all(abs(i - c) >= min_bars for c in cut):
            cut.append(i)
    return sorted(cut)


def label_sections(feats):
    """Letters by similarity (A, B, A, C ...): greedy clustering of section-mean features by cosine similarity."""
    X = zs(np.array(feats).T, axis=1).T; X = X / (np.linalg.norm(X, axis=1, keepdims=True) + 1e-9)
    labels, protos = [], []
    for x in X:
        sims = [float(x @ p) for p in protos]
        if sims and max(sims) > 0.55:
            labels.append(int(np.argmax(sims)))
        else:
            protos.append(x); labels.append(len(protos) - 1)
    return [chr(65 + l) for l in labels]


def name_sections(secs):
    """Guess musical names from repetition and energy. Only a suggestion: rename them in video.js."""
    if not secs:
        return
    es = np.array([s["energy"] for s in secs]); med = float(np.median(es))
    count = {}
    for s in secs:
        count[s["label"]] = count.get(s["label"], 0) + 1
    by_label = {}
    for s in secs:
        by_label.setdefault(s["label"], []).append(s["energy"])
    rep = [l for l, c in count.items() if c > 1]
    chorus = max(rep or by_label, key=lambda l: np.mean(by_label[l]))
    if np.mean(by_label[chorus]) < med and not rep:
        chorus = None
    for i, s in enumerate(secs):
        if i == 0 and s["energy"] <= med and len(secs) > 2 and s["label"] != chorus:
            s["name"] = "Intro"
        elif i == len(secs) - 1 and s["energy"] <= med and len(secs) > 2 and s["label"] != chorus:
            s["name"] = "Outro"
        elif s["label"] == chorus:
            s["name"] = "Chorus"
        elif count[s["label"]] > 1:
            s["name"] = "Verse"
        elif i > len(secs) / 2:
            s["name"] = "Bridge"
        else:
            s["name"] = "Verse"
    seen, total = {}, {}
    for s in secs:
        total[s["name"]] = total.get(s["name"], 0) + 1
    for s in secs:
        seen[s["name"]] = seen.get(s["name"], 0) + 1
        base = s["name"]
        if total[base] > 1:
            s["name"] = f"{base} {seen[base]}"
        s["id"] = s["name"].lower().replace(" ", "")


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("audio"); ap.add_argument("--out", default=None)
    ap.add_argument("--bpm", type=float, help="tempo hint (fixes half/double-time mistakes)")
    ap.add_argument("--downbeat", type=float, help="time (s) of any downbeat, the '1' of a bar")
    ap.add_argument("--bpb", type=int, default=4, help="beats per bar (default 4)")
    ap.add_argument("--sections", help="comma-separated section start times in seconds (skips detection)")
    ap.add_argument("--min-section", type=float, default=8.0, help="shortest detected section, seconds (default 8)")
    ap.add_argument("--rate", type=float, default=30.0, help="envelope sample rate, Hz (default 30)")
    ap.add_argument("--lyrics", help="lyrics JSON [[start, end, text], ...] to draw on the plot")
    a = ap.parse_args()
    out = Path(a.out or Path(a.audio).parent); out.mkdir(parents=True, exist_ok=True)

    print(f"loading {a.audio}", file=sys.stderr)
    y, sr = librosa.load(a.audio, sr=SR, mono=True)
    dur = len(y) / sr
    y_h, y_p = librosa.effects.hpss(y)

    # onset envelopes (fine hop): percussive for beats, and one per band for kicks / hats. Short FFT windows keep them
    # early: a 2048-sample window registers onsets ~23 ms late, 512 ~10 ms (measured on the demo song's known grid)
    oenv_p = librosa.onset.onset_strength(y=y_p, sr=sr, hop_length=HOP, n_fft=512, aggregate=np.median)
    oenv = librosa.onset.onset_strength(y=y, sr=sr, hop_length=HOP, n_fft=512)
    Sf = np.abs(librosa.stft(y, n_fft=1024, hop_length=HOP)) ** 2
    fq = librosa.fft_frequencies(sr=sr, n_fft=1024)
    band = lambda lo, hi: np.where((fq >= lo) & (fq < hi))[0]
    b_low, b_mid, b_high = band(20, 160), band(160, 2500), band(2500, sr / 2 + 1)
    oband = librosa.onset.onset_strength_multi(S=librosa.power_to_db(Sf), sr=sr, hop_length=HOP,
                                               channels=[int(b_low[0]), int(b_low[-1]) + 1, int(b_mid[-1]) + 1, len(fq)])
    kick_env, high_env = oband[0], oband[2]
    # use the percussive envelope for beats unless the song has little percussion
    beat_env = oenv_p if np.percentile(oenv_p, 99) > 0.25 * np.percentile(oenv, 99) else oenv

    # tempo: a coarse estimate picks the octave (or --bpm does), the comb fit gets the exact grid
    tempo = float(np.atleast_1d(librosa.feature.tempo(onset_envelope=beat_env, sr=sr, hop_length=HOP, start_bpm=a.bpm or 110.0))[0])
    bpm0 = a.bpm or tempo
    P, t0 = comb_fit(beat_env, sr, HOP, bpm0, dur, span=0.02 if a.bpm else 0.04)
    bpm = 60 / P
    grid_beats = t0 + np.arange(0, int((dur - t0) / P) + 1) * P
    resid = grid_error(grid_beats, beat_env, sr, HOP)
    med_err, p95_err = float(np.median(np.abs(resid))), float(np.percentile(np.abs(resid), 95))
    constant_ok = med_err < 0.02 and p95_err < 0.06
    if constant_ok:
        beats = grid_beats
    else:   # live or rubato playing: follow the beats one by one
        _, bf = librosa.beat.beat_track(onset_envelope=beat_env, sr=sr, hop_length=HOP, start_bpm=bpm, tightness=200, trim=False)
        beats = refine_peaks(librosa.frames_to_time(bf, sr=sr, hop_length=HOP), beat_env, sr, HOP)
        if len(beats) < 8:
            sys.exit("fewer than 8 beats found: is this music? pass --bpm and --downbeat to force a grid")
    ref_beats = beats

    # features for downbeats and sections
    chroma = librosa.feature.chroma_cqt(y=y_h, sr=sr, hop_length=HOP_F)
    mfcc = librosa.feature.mfcc(y=y, sr=sr, hop_length=HOP_F, n_mfcc=14)[1:]
    rms = librosa.feature.rms(y=y, hop_length=HOP_F)[0]
    rms_db = db(rms ** 2)

    if a.downbeat is not None:
        k = int(np.argmin(np.abs(ref_beats - a.downbeat))); phase = k % a.bpb; phases = []
    else:
        phase, phases = downbeat_phase(ref_beats, kick_env, chroma, rms_db, sr, a.bpb)
    downbeats = ref_beats[phase::a.bpb]
    offset = float(downbeats[0])
    print(f"tempo {bpm:.2f} BPM ({'constant grid' if constant_ok else 'tempo drifts: tracked grid'}; "
          f"median err {med_err * 1000:.0f} ms), first downbeat {offset:.3f} s", file=sys.stderr)

    # bars → sections
    bar_starts = downbeats[downbeats < dur - 0.5]
    bar_frames = np.clip(np.round(bar_starts * sr / HOP_F).astype(int), 0, chroma.shape[1] - 1)
    idx_sync = list(bar_frames) + [chroma.shape[1]]
    sync = lambda F: np.stack([F[:, a_:max(b_, a_ + 1)].mean(axis=1) for a_, b_ in zip(idx_sync[:-1], idx_sync[1:])], axis=1)   # mean per bar
    bar_chroma, bar_mfcc = sync(chroma), sync(mfcc)
    bar_rms = sync(rms_db[None])[0]
    bar_feats = np.vstack([bar_chroma, bar_mfcc, np.repeat(zs(bar_rms)[None], 4, axis=0)])
    e_norm = pct_norm(rms_db, 5, 99.5)
    bar_len = a.bpb * P
    if a.sections:
        starts = sorted(float(s) for s in a.sections.split(","))
        cuts = sorted({int(np.argmin(np.abs(bar_starts - s))) for s in starts if s > 0.5} | {0, len(bar_starts)})
    else:
        min_bars = max(2, int(round(a.min_section / bar_len)))
        cuts = segment(bar_feats, zs(bar_rms), min_bars, max_n=max(2, int(dur / 8)))
    secs, sfeats = [], []
    for i, (c0, c1) in enumerate(zip(cuts[:-1], cuts[1:])):
        start = 0.0 if i == 0 else float(bar_starts[c0])
        end = dur if c1 >= len(bar_starts) else float(bar_starts[c1])
        f0, f1 = int(start * sr / HOP_F), max(int(start * sr / HOP_F) + 1, int(end * sr / HOP_F))
        secs.append({"start": round(start, 3), "end": round(end, 3), "bar": int(c0), "bars": int(c1 - c0),
                     "energy": round(float(np.mean(e_norm[f0:f1])), 3)})
        sfeats.append(np.r_[bar_feats[:, c0:c1].mean(axis=1)])
    for s, l in zip(secs, label_sections(sfeats) if len(secs) > 1 else ["A"]):
        s["label"] = l
    name_sections(secs)

    # envelopes at a.rate Hz, 0..1, perceptual (log) scale
    tf = librosa.frames_to_time(np.arange(Sf.shape[1]), sr=sr, hop_length=HOP)
    ts = np.arange(0, dur, 1 / a.rate)
    smooth = lambda x, n=3: np.convolve(x, np.ones(n) / n, "same")
    bandE = lambda b: pct_norm(db(Sf[b].sum(axis=0)), 5, 99.5)
    env = {
        "rate": a.rate,
        "rms": np.interp(ts, librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=HOP_F), e_norm),
        "low": np.interp(ts, tf, smooth(bandE(b_low))),
        "mid": np.interp(ts, tf, smooth(bandE(b_mid))),
        "high": np.interp(ts, tf, smooth(bandE(b_high))),
        "onset": np.interp(ts, tf, pct_norm(oenv, 0, 99.5)),
    }

    def hits(e, delta):
        e = e / (np.percentile(e, 99.5) + 1e-9)
        pk = librosa.onset.onset_detect(onset_envelope=e, sr=sr, hop_length=HOP, units="frames", backtrack=False,
                                        delta=delta, wait=int(0.09 * sr / HOP))
        return [[round(float(p * HOP / sr), 3), round(float(min(1, e[p])), 2)] for p in pk if e[p] > 0.25]

    H = {"onset": hits(oenv, 0.07), "low": hits(kick_env, 0.1), "high": hits(high_env, 0.1)}
    alts = tempo_alternatives(beat_env, sr, HOP, dur, bpm, H["low"])
    here = next((x["kicks_on_beat"] for x in alts if x["ratio"] == 1.0), None)
    # double time trivially catches more kicks, so only 2/3, 3/2 and half time count as evidence against the chosen level
    better = [x for x in alts if x["ratio"] in (0.5, 0.667, 1.5) and x["kicks_on_beat"] and here is not None and x["kicks_on_beat"] > 1.6 * here]
    for x in better:
        print(f"warning: the {bpm:.1f} BPM grid catches {here:.0%} of kicks but {x['bpm']} BPM catches {x['kicks_on_beat']:.0%}: "
              f"check the tempo check in analysis.md and re-run with --bpm if the song feels like {x['bpm']}", file=sys.stderr)
    data = {
        "version": 1, "audio": Path(a.audio).name, "duration": round(dur, 3),
        "bpm": round(bpm, 3), "bpm_tracker": round(tempo, 2), "beatsPerBar": a.bpb, "offset": round(offset, 4),
        "grid": {"constant": bool(constant_ok), "median_err_ms": round(med_err * 1000, 1), "p95_err_ms": round(p95_err * 1000, 1),
                 "downbeat_phase_scores": [round(p, 3) for p in phases]},
        "beats": [round(float(b), 4) for b in beats],
        "downbeats": [round(float(b), 4) for b in downbeats],
        "sections": secs,
        "env": {k: (v if k == "rate" else [round(float(x), 3) for x in v]) for k, v in env.items()},
        "tempo_alternatives": alts,
        "hits": H,
    }
    (out / "analysis.json").write_text(json.dumps(data, separators=(",", ":")))
    (out / "analysis.js").write_text("// generated by tools/analyze.py: don't edit (re-run it instead). Edit tempo and sections in video.js.\n"
                                     "var ANALYSIS = " + json.dumps(data, separators=(",", ":")) + ";\n")
    lyrics = json.loads(Path(a.lyrics).read_text()) if a.lyrics and Path(a.lyrics).exists() else []
    write_md(out / "analysis.md", data)
    plot(out / "analysis.png", data, lyrics)
    print(json.dumps({k: data[k] for k in ("duration", "bpm", "offset", "beatsPerBar")} | {"constant_grid": constant_ok,
          "sections": [(s["name"], s["start"], s["bars"]) for s in secs]}))


def mmss(t):
    return f"{int(t // 60)}:{t % 60:05.2f}"


def pct(x):
    return "—" if x is None else f"{x:.0%}"


def write_md(path, d):
    bar = 60 / d["bpm"] * d["beatsPerBar"]
    blocks = " ▁▂▃▄▅▆▇█"
    L = [f"# Song analysis: {d['audio']}", "",
         f"- **Length** {mmss(d['duration'])} ({d['duration']} s)",
         f"- **Tempo** {d['bpm']:.2f} BPM, {d['beatsPerBar']}/4. Beat = {60 / d['bpm']:.4f} s, bar = {bar:.4f} s",
         f"- **First downbeat** (bar 0, beat 0) at {d['offset']:.3f} s",
         f"- **Grid** {'constant tempo: the grid is exact (beatGrid: \"constant\")' if d['grid']['constant'] else 'the tempo drifts: use beatGrid: \"tracked\"'}"
         f" (median beat error {d['grid']['median_err_ms']} ms)",
         "", "### Tempo check", "",
         "Beat trackers often lock onto the wrong metrical level (half, double, 2/3 or 3/2 of the real tempo). This is how many",
         "strong kicks each alternative grid catches. Faster grids always catch more; pick the level where the song *feels* like",
         "it bounces, and re-run with `--bpm` if it isn't the one above.", "",
         "| ratio | BPM | kicks on a beat |", "|---|---|---|",
         *[f"| {x['ratio']:g} | {x['bpm']} | {pct(x['kicks_on_beat'])} |" for x in d.get("tempo_alternatives", [])],
         "", "## Sections (suggested; rename and move them in video.js)", "",
         "| # | id | name | start | bar | bars | similar to | energy |", "|---|---|---|---|---|---|---|---|"]
    for i, s in enumerate(d["sections"]):
        e = s["energy"]; L.append(f"| {i} | `{s['id']}` | {s['name']} | {mmss(s['start'])} ({s['start']:.2f} s) | {s['bar']} | {s['bars']} | {s['label']} | "
                                  f"{blocks[min(8, int(e * 8.99))] * 3} {e:.2f} |")
    L += ["", "## Energy across the song (one character per bar)", "", "```"]
    env, rate = d["env"]["rms"], d["env"]["rate"]
    row = ""
    for db_ in d["downbeats"]:
        a = int(db_ * rate); b = int((db_ + bar) * rate); seg = env[a:b] or [0]
        row += blocks[min(8, int(np.mean(seg) * 8.99))]
    for i in range(0, len(row), 64):
        L.append(f"bar {i:>3}  {row[i:i + 64]}")
    L += ["```", "", "Loud bars are the moments to spend your biggest visuals on. Hits (`hit(t, 'low')`) follow the actual kick drum;",
          "`pulse(t)` follows the beat grid. See MUSIC_VIDEO_GUIDE.md.", ""]
    path.write_text("\n".join(L))


def plot(path, d, lyrics):
    import matplotlib; matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    dur, rate = d["duration"], d["env"]["rate"]
    ts = np.arange(len(d["env"]["rms"])) / rate
    fig, ax = plt.subplots(3, 1, figsize=(22, 8.5), sharex=True, gridspec_kw={"height_ratios": [2.2, 1.4, 1]})
    cols = ["#F2A283", "#8EC3E6", "#E8AA38", "#6E9F58", "#E27A92", "#7B5CA8", "#3A9C98"]
    labels = sorted({s["label"] for s in d["sections"]})
    for s in d["sections"]:
        c = cols[labels.index(s["label"]) % len(cols)]
        for x in ax:
            x.axvspan(s["start"], s["end"], color=c, alpha=.22, lw=0)
        ax[0].text(s["start"] + .15, 1.1, f"{s['name']}\n{s['start']:.2f}s · bar {s['bar']}", va="top", fontsize=9, weight="bold")
    ax[0].fill_between(ts, 0, d["env"]["rms"], color="#2B2233", alpha=.75, lw=0)
    for i, b in enumerate(d["downbeats"]):
        ax[0].axvline(b, color="#2B2233", alpha=.25 if i % 4 else .6, lw=.6 if i % 4 else 1.1)
        if i % 4 == 0:
            ax[0].text(b, -.06, str(i), ha="center", va="top", fontsize=7)
    for ly in lyrics:
        ax[0].plot([ly[0], ly[1]], [.96, .96], color="#A84D33", lw=3, solid_capstyle="butt")
        ax[0].text(ly[0], .93, ly[2][:28], fontsize=6.5, va="top", color="#A84D33", rotation=0)
    ax[0].set_ylim(-.1, 1.12); ax[0].set_ylabel("loudness (bars numbered)")
    for k, c in (("low", "#A84D33"), ("mid", "#3A9C98"), ("high", "#7B5CA8")):
        ax[1].plot(ts, d["env"][k], color=c, lw=.8, label=k)
    ax[1].legend(loc="upper right", fontsize=8); ax[1].set_ylabel("bands")
    ax[2].plot(ts, d["env"]["onset"], color="#2B2233", lw=.5)
    for k, c, y0 in (("low", "#A84D33", 1.0), ("high", "#7B5CA8", 1.12)):
        h = d["hits"][k]
        if h:
            ax[2].scatter([p[0] for p in h], [y0] * len(h), s=[6 + 20 * p[1] for p in h], color=c, label=f"{k} hits")
    for b in d["beats"]:
        ax[2].axvline(b, color="#E8AA38", alpha=.35, lw=.5)
    ax[2].set_ylim(0, 1.25); ax[2].legend(loc="upper right", fontsize=8); ax[2].set_ylabel("onsets · beats")
    ax[2].set_xlim(0, dur); ax[2].set_xticks(np.arange(0, dur, 5 if dur < 150 else 10)); ax[2].set_xlabel("seconds")
    fig.suptitle(f"{d['audio']}   {d['bpm']:.2f} BPM · first downbeat {d['offset']:.3f} s · {mmss(dur)}", fontsize=12)
    fig.tight_layout(); fig.savefig(path, dpi=80); plt.close(fig)


if __name__ == "__main__":
    main()
