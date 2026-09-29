# /// script
# requires-python = ">=3.10,<3.14"
# dependencies = ["numpy", "scipy", "librosa>=0.10.2", "soundfile"]
# ///
"""studio_data.py: build the gl engine's data files for a studio video.

    uv run gl/analysis/studio_data.py --video=<slug> --stems=videos/<slug>/stems/htdemucs_ft [--vocal=videos/<slug>/stems/vocals.wav] [--pad-to=S]

Reads the studio's checked data, so hand fixes survive:
  videos/<slug>/analysis.json   beat grid (beats, downbeats, bpm)
  videos/<slug>/video.js        sections (id, name, start)
  videos/<slug>/lyrics.js       lines [start, end, text, [[t, word], ...]]: word START times
  a vocal stem (default videos/<slug>/stems/vocals.wav) word END times: a word ends where the voice goes
                                quiet before the next word (or at the next word), plus the vocal envelope
  vocal onsets = the aligned word starts
  4 Demucs stems (--stems dir with drums/bass/other/vocals.wav): drum onsets and stem envelopes
Writes videos/<slug>/gl/data/audio.json and lyrics.json (formats: gl/docs/ENGINE.md "Data"), copies the song to
videos/<slug>/gl/audio/song.wav.
"""
import argparse, json, math, re, shutil, sys
from pathlib import Path

import numpy as np
import soundfile as sf
import librosa
from scipy.signal import sosfiltfilt

sys.path.insert(0, str(Path(__file__).resolve().parent))
import dsp as A  # signal building blocks (frame_rms, smooth_env, norm01, drum_onsets, ...)

STUDIO = Path(__file__).resolve().parents[2]
SR, FPS = A.SR, A.FPS


def load(path, n=None):
    y, _ = librosa.load(str(path), sr=SR, mono=True)
    if n is not None:
        y = np.pad(y, (0, max(0, n - len(y))))[:n]
    return y


def js_array(src, name):
    """The JSON-ish array literal assigned to `var <name> = [...]` in a studio .js file."""
    m = re.search(rf"var\s+{name}\s*=\s*(\[.*?\n\]);", src, re.S)
    if not m:
        sys.exit(f"no `var {name} = [...]` found")
    body = re.sub(r"//[^\n]*", "", m.group(1))
    return json.loads(re.sub(r",\s*\]", "]", body))


def sections_from_video_js(src, duration):
    m = re.search(r"sections:\s*\[(.*?)\n\s*\],", src, re.S)
    rows = re.findall(r'id:\s*"([^"]+)".*?name:\s*"([^"]+)".*?start:\s*([\d.]+)', m.group(1))
    out = []
    for k, (sid, name, start) in enumerate(rows):
        end = float(rows[k + 1][2]) if k + 1 < len(rows) else duration
        out.append(dict(name=sid, label=name, start=round(float(start), 3), end=round(min(end, duration), 3)))
    return [s for s in out if s["start"] < duration]


def word_ends(lines, venv, duration):
    """Each word ends at the next word's start, or earlier where the vocal drops below 15% of the line's
    peak for at least 60 ms (a breath, a rest, the end of a held note)."""
    out = []
    starts = [w[0] for ln in lines for w in ln[3]]
    flat_i = 0
    for li, (ls, le, text, words) in enumerate(lines):
        a, b = int(ls * FPS), int(max(le, ls + 0.5) * FPS)
        peak = float(np.max(venv[a:b])) if b > a else 1.0
        thr = 0.15 * peak
        W = []
        for k, (t, w) in enumerate(words):
            nxt = starts[flat_i + 1] if flat_i + 1 < len(starts) else duration
            limit = min(nxt, t + 4.0)
            end = limit
            i0, i1 = int((t + 0.08) * FPS), int(limit * FPS)
            quiet = venv[i0:i1] < thr
            run = 0
            for j, q in enumerate(quiet):
                run = run + 1 if q else 0
                if run >= 6:  # 60 ms of quiet
                    end = (i0 + j - run + 1) / FPS
                    break
            end = max(end, t + 0.06)
            W.append(dict(w=w, start=round(t, 3), end=round(min(end, limit), 3), conf=1.0))
            flat_i += 1
        out.append(dict(i=li, text=text, start=W[0]["start"], end=W[-1]["end"], words=W))
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--video", required=True)
    ap.add_argument("--stems", required=True, help="dir with drums.wav, bass.wav, other.wav, vocals.wav (Demucs)")
    ap.add_argument("--vocal", help="clean lead vocal (default videos/<slug>/stems/vocals.wav)")
    ap.add_argument("--pad-to", type=float, default=0, help="pad the song with silence to this many seconds (an ending that outlasts the song)")
    ap.add_argument("--overwrite-lyrics", action="store_true",
                    help="replace a gl/data/lyrics.json that another aligner wrote (e.g. a video's own gl/align/align.py)")
    a = ap.parse_args()
    vdir = STUDIO / "videos" / a.video
    out = vdir / "gl"
    (out / "data").mkdir(parents=True, exist_ok=True)
    (out / "audio").mkdir(parents=True, exist_ok=True)

    an = json.loads((vdir / "analysis.json").read_text())
    song = vdir / an.get("audio", "song.wav")
    mix = load(song)
    if a.pad_to * SR > len(mix):
        mix = np.pad(mix, (0, int(a.pad_to * SR) - len(mix)))
    n_samp = len(mix)
    duration = n_samp / SR
    stems = {k: load(Path(a.stems) / f"{k}.wav", n_samp) for k in ("drums", "bass", "other", "vocals")}
    vocal = load(Path(a.vocal) if a.vocal else vdir / "stems" / "vocals.wav", n_samp)

    # grid: the studio's checked beat grid
    beats = [float(b) for b in an["beats"]]
    downbeats = [float(b) for b in an["downbeats"]]
    P = float(np.median(np.diff(beats)))
    off = beats[0]

    # envelopes (100 fps, normalized 0..1 at the 99th percentile)
    n = int(math.ceil(duration * FPS))
    env = {"rms": A.frame_rms(mix, SR)[:n]}
    for name, (lo, hi) in {"low": (None, 150), "mid": (150, 2000), "high": (4000, None)}.items():
        env[name] = A.frame_rms(sosfiltfilt(A.band_sos(lo, hi, SR), mix), SR)[:n]
    env["vocal"] = A.frame_rms(vocal, SR)[:n]
    for s in ("drums", "bass", "other"):
        env[s] = A.frame_rms(stems[s], SR)[:n]
    for k in env:
        e = A.smooth_env(env[k])
        env[k] = [round(float(x), 3) for x in A.norm01(e)]
        env[k] += [0.0] * (n - len(env[k]))

    (kt, kdb), (st, sdb), (ht, hdb), _ = A.drum_onsets(stems["drums"], SR, P, off)
    onsets = {
        "kick": [[round(float(t), 3), round(float(s), 3)] for t, s in zip(kt, A.strength01(kdb))],
        "snare": [[round(float(t), 3), round(float(s), 3)] for t, s in zip(st, A.strength01(sdb))],
        "hat": [[round(float(t), 3), round(float(s), 3)] for t, s in zip(ht, A.strength01(hdb))],
    }
    # vocal onsets: the aligned word starts, weighted by the vocal level just after them
    lines = js_array((vdir / "lyrics.js").read_text(), "LYRICS")
    venv = A.smooth_env(A.frame_rms(vocal, SR))
    vn = venv / (np.percentile(venv, 99) + 1e-9)
    onsets["vocal"] = [[round(w[0], 3), round(float(min(1.0, vn[int(w[0] * FPS):int(w[0] * FPS) + 15].max(initial=0))), 3)]
                       for ln in lines for w in ln[3]]
    ph = lambda ts: np.bincount(np.round((np.asarray(ts) - off) / (P / 2)).astype(int) % 8, minlength=8).tolist()
    print(f"onsets: {len(kt)} kick {ph(kt)}, {len(st)} snare {ph(st)}, {len(ht)} hat, {len(onsets['vocal'])} vocal  (8th-positions in bar)")

    sections = sections_from_video_js((vdir / "video.js").read_text(), duration)
    doc = dict(duration=round(duration, 3), bpm=round(60 / P, 3), beat_period=round(P, 5), time_signature=4,
               beats=[round(b, 3) for b in beats], downbeats=[round(b, 3) for b in downbeats], sections=sections,
               fps=FPS, **env, onsets=onsets,
               notes=f"studio_data.py: grid from videos/{a.video}/analysis.json (constant {60 / P:.3f} BPM), sections from video.js, "
                     f"drum onsets from Demucs htdemucs_ft stems, vocal envelope/onsets from the clean lead vocal stem.")
    (out / "data" / "audio.json").write_text(json.dumps(doc, separators=(",", ":")))

    # lyrics: studio word starts + measured ends
    L = word_ends(lines, venv, duration)
    fix = out / "lyrics_fix.json"
    if fix.exists():
        for f in json.loads(fix.read_text())["lines"]:
            hits = [l for l in L if l["text"].lower() == f["match"].lower()]
            l = hits[f.get("nth", 0)]
            if "words" in f:
                l["words"] = [dict(w=w[0], start=w[1], end=w[2], conf=1.0, **({"syl": w[3]} if len(w) > 3 else {})) for w in f["words"]]
            if "shift_start_to" in f:
                w0 = l["words"][0]; w0["start"] = f["shift_start_to"]; w0["end"] = max(w0["end"], w0["start"] + 0.1)
            if f.get("backing"):
                l["backing"] = True
            l["start"], l["end"] = l["words"][0]["start"], l["words"][-1]["end"]
            print(f"fix: {'backing ' if l.get('backing') else ''}'{l['text']}' {l['start']:.2f}-{l['end']:.2f}")
    lj = out / "data" / "lyrics.json"
    if lj.exists() and not a.overwrite_lyrics and not json.loads(lj.read_text()).get("notes", "").startswith("studio_data.py"):
        print(f"kept {lj}: another aligner wrote it (pass --overwrite-lyrics to replace it with these timings)")
    else:
      lj.write_text(json.dumps(dict(lines=L, extras=[], notes=(
        f"studio_data.py: word starts from videos/{a.video}/lyrics.js (Whisper-aligned on the clean vocal stem, hand-checked); "
        "word ends where the vocal stem drops below 15% of the line peak for 60 ms, else the next word's start.")), indent=1))
    if a.pad_to:
        sr0 = sf.info(str(song)).samplerate
        y0, _ = sf.read(str(song), always_2d=True)
        y0 = np.pad(y0, ((0, max(0, int(a.pad_to * sr0) - len(y0))), (0, 0)))
        sf.write(str(out / "audio" / "song.wav"), y0, sr0, subtype="PCM_16")
    else:
        shutil.copy2(song, out / "audio" / "song.wav")

    held = sorted(((w["end"] - w["start"], w["w"], w["start"]) for l in L for w in l["words"]), reverse=True)[:6]
    print(f"wrote {out/'data'/'audio.json'} ({len(beats)} beats, {len(sections)} sections) and lyrics.json ({len(L)} lines, "
          f"{sum(len(l['words']) for l in L)} words); longest words: " + ", ".join(f"{w} {d:.2f}s@{t:.1f}" for d, w, t in held))


if __name__ == "__main__":
    main()
