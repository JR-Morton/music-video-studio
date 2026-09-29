"""Shared paths / loaders for the "End of the Decade" word alignment.

Import FIRST (before torch / librosa) so model downloads are cached under align/.cache/.

Time reference: videos/end-of-the-decade/gl/audio/song.wav (the Suno master, padded to 170 s). The vocal stem is
Suno's own VOX export of the same session, saved as videos/end-of-the-decade/stems/vocals.wav (not in the repo: export
it from your own Suno session), sample-aligned with the master (checked by cross-correlation in check_offset()).
align/stems/ holds a lead/backing split of that stem (a mel-band-roformer karaoke model, e.g. via python-audio-separator);
align/work/lyrics_before.json holds the line texts and backing flags. The result, data/lyrics.json, is in the repo.
"""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent            # videos/end-of-the-decade/gl/align/
GL = ROOT.parent                                   # videos/end-of-the-decade/gl/
CACHE = ROOT / ".cache"
for var, sub in [("TORCH_HOME", "torch"), ("HF_HOME", "hf"), ("HF_HUB_CACHE", "hf/hub"),
                 ("XDG_CACHE_HOME", "xdg"), ("MPLCONFIGDIR", "mpl"), ("NUMBA_CACHE_DIR", "numba")]:
    os.environ.setdefault(var, str(CACHE / sub))
    (CACHE / sub).mkdir(parents=True, exist_ok=True)

MIX = GL / "audio" / "song.wav"
VOCALS = GL.parent / "stems" / "vocals.wav"       # Suno VOX stem (lead + backing), 48 kHz stereo
KARAOKE = ROOT / "stems"                           # mel-band-roformer karaoke split of VOCALS (lead / backing)
SRC = ROOT / "work" / "lyrics_before.json"         # line texts + backing flags (+ the old timings, for plots)
DATA = GL / "data"
QA = ROOT / "qa"
WORK = ROOT / "work"
QA.mkdir(exist_ok=True)
WORK.mkdir(exist_ok=True)

BPM, OFFSET = 112.996, 0.2702                      # data/audio.json: constant grid, first downbeat
DURATION = 158.9                                   # the sung song (the master is padded to 170 s)


def load_lines():
    """All lines of the old data/lyrics.json: dicts with i, text, backing, start, end, words."""
    import json
    return json.loads(SRC.read_text())["lines"]


def _read(path, sr=None, mono=True):
    import soundfile as sf
    import numpy as np
    y, s = sf.read(path, dtype="float32", always_2d=True)
    y = y.mean(axis=1) if mono else y.T
    if sr and sr != s:
        import soxr
        y = soxr.resample(y, s, sr) if mono else np.stack([soxr.resample(c, s, sr) for c in y])
        s = sr
    return y, s


def load_stem(name="vocals", sr=None, mono=True):
    """'vocals' = the VOX stem."""
    assert name == "vocals"
    return _read(VOCALS, sr, mono)


def lead_path():
    c = sorted(KARAOKE.glob("*(Vocals)*.wav")) or sorted(KARAOKE.glob("*vocals*.wav"))
    return c[0] if c else None


def load_vocal_source(name, sr=None):
    """'vocals' = VOX (mono sum), 'vocL'/'vocR' = its channels, 'lead' = karaoke lead-vocal split."""
    if name == "lead":
        return _read(lead_path(), sr)
    if name == "back":
        return _read(sorted(KARAOKE.glob("*(Instrumental)*.wav"))[0], sr)
    if name in ("vocL", "vocR"):
        y, s = load_stem("vocals", sr=sr, mono=False)
        return y[0 if name == "vocL" else 1], s
    return load_stem("vocals", sr=sr)


def check_offset():
    """Lag (s) of the VOX stem against the master: should be 0."""
    import numpy as np
    from scipy.signal import fftconvolve
    v, _ = load_stem("vocals", sr=8000)
    m, _ = _read(MIX, 8000)
    a, b = int(30 * 8000), int(60 * 8000)
    x, y = v[a:b], m[a - 800:b + 800]
    c = fftconvolve(y, x[::-1], mode="valid")
    return (int(np.argmax(c)) - 800) / 8000
