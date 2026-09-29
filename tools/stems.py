# /// script
# requires-python = ">=3.10,<3.13"
# dependencies = ["demucs==4.0.1", "torch==2.8.*", "torchaudio==2.8.*", "soundfile", "numpy"]
# ///
"""stems.py: split a video's song into Demucs stems for gl/analysis/studio_data.py.

    uv run tools/stems.py --video=<slug> [--vocal=<clean vocal stem.wav>] [--model=htdemucs_ft] [--device=cuda|cpu]

Writes videos/<slug>/stems/htdemucs_ft/{drums,bass,other,vocals}.wav (drum onsets and stem envelopes) and
videos/<slug>/stems/vocals.wav, the lead vocal used for lyric alignment and the vocal envelope: your clean vocal stem if
you pass --vocal (e.g. Suno's VOX export of the same session: much cleaner than a separated one), else Demucs' vocals.
The first run downloads torch and the model (a few GB); it uses the GPU when CUDA is available.
"""
import argparse
import re
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--video", required=True)
    ap.add_argument("--vocal", help="a clean lead-vocal stem of the same song (sample-aligned with the mix)")
    ap.add_argument("--model", default="htdemucs_ft")
    ap.add_argument("--device", help="cuda or cpu (default: cuda if available)")
    a = ap.parse_args()
    vdir = ROOT / "videos" / a.video
    if not (vdir / "video.js").exists():
        sys.exit(f"no videos/{a.video}/video.js: make the video with tools/new.mjs first")
    m = re.search(r"audio:\s*['\"]([^'\"]+)['\"]", (vdir / "video.js").read_text())
    song = vdir / m.group(1) if m else next(iter(sorted(vdir.glob("song.*"))), None)
    if not song or not song.exists():
        sys.exit(f"no song for {a.video}: set audio in video.js")
    out = vdir / "stems" / a.model
    out.mkdir(parents=True, exist_ok=True)

    import demucs.separate
    import torch
    device = a.device or ("cuda" if torch.cuda.is_available() else "cpu")
    print(f"separating {song.relative_to(ROOT)} with {a.model} on {device}…")
    with tempfile.TemporaryDirectory() as tmp:
        demucs.separate.main(["-n", a.model, "-d", device, "-o", tmp, "--filename", "{stem}.{ext}", str(song)])
        for f in (Path(tmp) / a.model).glob("*.wav"):
            shutil.move(str(f), out / f.name)
    stems = sorted(p.name for p in out.glob("*.wav"))
    print(f"wrote {out.relative_to(ROOT)}: {', '.join(stems)}")

    lead = vdir / "stems" / "vocals.wav"
    if a.vocal:
        shutil.copy2(a.vocal, lead)
        print(f"lead vocal: {a.vocal} -> {lead.relative_to(ROOT)}")
    else:
        shutil.copy2(out / "vocals.wav", lead)
        print(f"lead vocal: Demucs vocals -> {lead.relative_to(ROOT)} (a clean vocal export aligns better: --vocal)")


if __name__ == "__main__":
    main()
