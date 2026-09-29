# /// script
# requires-python = ">=3.10,<3.14"
# dependencies = ["faster-whisper>=1.0", "numpy"]
# ///
"""align_lyrics.py: time plain-text lyrics against the song's vocals.

    uv run tools/align_lyrics.py --video=<slug> [--text=lyrics.txt] [--model=large-v3] [--device=auto|cuda|cpu]
                                 [--language=en] [--shift=0]

Whisper transcribes the song with a time for every word. Sung words are often misheard, so the transcript isn't used as
the lyrics: the lyrics you give are aligned to it word by word (a fuzzy sequence alignment that tolerates mishearings,
missed words and ad-libs), and each lyric word takes the time of the transcript word it matches. Words with no match are
placed between their neighbours. Writes videos/<slug>/lyrics.lrc (enhanced LRC, a time per word) and imports it into
lyrics.js. Lines with few matched words are listed at the end: check those by ear (studio.html + the karaoke bar).

Lyrics text: one line per lyric line. Blank lines and section tags like [Chorus] or (Verse 2) are ignored.
Accuracy improves a lot on an isolated vocal stem: pass it with --audio=vocals.wav if you have one.
"""
import argparse, difflib, re, subprocess, sys, unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def norm(w):
    w = unicodedata.normalize("NFKD", w).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9']", "", w).strip("'")


def sim(a, b):
    if a == b:
        return 1.0
    if not a or not b:
        return 0.0
    return difflib.SequenceMatcher(None, a, b).ratio()


def align(L, T, gap=-0.45):
    """Needleman-Wunsch over word lists with fuzzy match scores. Returns {lyric index: transcript index}."""
    n, m = len(L), len(T)
    S = [[0.0] * (m + 1) for _ in range(n + 1)]
    B = [[0] * (m + 1) for _ in range(n + 1)]   # 0 diag, 1 up (skip lyric word), 2 left (skip transcript word)
    for i in range(1, n + 1):
        S[i][0] = i * gap; B[i][0] = 1
    for j in range(1, m + 1):
        S[0][j] = j * gap * 0.5; B[0][j] = 2    # ad-libs and misheard filler in the transcript are cheap to skip
    for i in range(1, n + 1):
        Li, Si, Sp = L[i - 1], S[i], S[i - 1]
        for j in range(1, m + 1):
            s = sim(Li, T[j - 1]); d = Sp[j - 1] + (2 * s - 1 if s >= 0.5 else -1.0)
            u = Sp[j] + gap; l = Si[j - 1] + gap * 0.5
            if d >= u and d >= l:
                Si[j] = d; B[i][j] = 0
            elif u >= l:
                Si[j] = u; B[i][j] = 1
            else:
                Si[j] = l; B[i][j] = 2
    out, i, j = {}, n, m
    while i > 0 or j > 0:
        b = B[i][j]
        if b == 0:
            if sim(L[i - 1], T[j - 1]) >= 0.5:
                out[i - 1] = j - 1
            i, j = i - 1, j - 1
        elif b == 1:
            i -= 1
        else:
            j -= 1
    return out


def read_lines(path):
    lines = []
    for raw in Path(path).read_text().splitlines():
        s = raw.strip()
        if not s or re.fullmatch(r"[\[(].*[\])]", s):
            continue
        s = re.sub(r"\s+[\[(][^\])]*[\])]\s*$", "", s)   # trailing (backing vocal) notes
        if s:
            lines.append(s)
    return lines


def find_audio(vdir):
    src = (vdir / "video.js").read_text()
    m = re.search(r"audio:\s*['\"]([^'\"]+)['\"]", src)
    if m and (vdir / m.group(1)).exists():
        return vdir / m.group(1)
    songs = sorted(vdir.glob("song.*"))
    if not songs:
        sys.exit(f"no audio in {vdir}: set audio in video.js or pass --audio")
    return songs[0]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--video", required=True); ap.add_argument("--text"); ap.add_argument("--audio")
    ap.add_argument("--model", default="large-v3"); ap.add_argument("--device", default="auto")
    ap.add_argument("--language", default=None); ap.add_argument("--shift", type=float, default=0.0)
    ap.add_argument("--no-import", action="store_true", help="write lyrics.lrc only, don't update lyrics.js")
    a = ap.parse_args()
    vdir = ROOT / "videos" / a.video
    if not (vdir / "video.js").exists():
        sys.exit(f"no video {a.video}")
    text = Path(a.text) if a.text else vdir / "lyrics.txt"
    if not text.exists():
        sys.exit(f"no lyrics text at {text}: pass --text=<file> (one lyric line per line)")
    audio = Path(a.audio) if a.audio else find_audio(vdir)
    lines = read_lines(text)
    words = [(li, w) for li, line in enumerate(lines) for w in line.split()]
    L = [norm(w) for _, w in words]

    from faster_whisper import WhisperModel
    model = None
    for dev, ct in ([("cuda", "float16"), ("cpu", "int8")] if a.device == "auto" else [(a.device, "float16" if a.device == "cuda" else "int8")]):
        try:
            model = WhisperModel(a.model, device=dev, compute_type=ct)
            segs, info = model.transcribe(str(audio), language=a.language, word_timestamps=True, vad_filter=False,
                                          condition_on_previous_text=False, beam_size=5,
                                          initial_prompt=" ".join(lines)[:600])
            T = [(w.start, w.end, w.word) for s in segs for w in (s.words or [])]
            print(f"transcribed on {dev}: {len(T)} words, language {info.language}", file=sys.stderr)
            break
        except Exception as e:  # e.g. CUDA libraries missing: fall back to the CPU
            print(f"{dev} failed ({str(e).splitlines()[0][:120]}); trying the next device", file=sys.stderr)
            model = None
    if model is None:
        sys.exit("transcription failed")
    if not T:
        sys.exit("Whisper heard no words: is there a vocal? try --audio=<vocal stem>")

    Tn = [norm(w) for _, _, w in T]
    match = align(L, Tn)
    # times for every lyric word: matched ones from the transcript, the rest spread between matched neighbours
    times = [None] * len(L)
    for i, j in match.items():
        times[i] = T[j][0]
    known = [i for i, t in enumerate(times) if t is not None]
    if not known:
        sys.exit("no lyric word matched the transcript: wrong lyrics, or no audible vocal")
    for i in range(len(L)):
        if times[i] is not None:
            continue
        prev = max((k for k in known if k < i), default=None); nxt = min((k for k in known if k > i), default=None)
        if prev is None:
            times[i] = max(0.0, times[nxt] - 0.3 * (nxt - i))
        elif nxt is None:
            times[i] = times[prev] + 0.3 * (i - prev)
        else:
            times[i] = times[prev] + (times[nxt] - times[prev]) * (i - prev) / (nxt - prev)
    for i in range(1, len(times)):   # keep them in order
        times[i] = max(times[i], times[i - 1] + 0.02)

    ts = lambda t: f"{int(t // 60):02d}:{t % 60:05.2f}"
    out, weak = ["[by:tools/align_lyrics.py]"], []
    for li, line in enumerate(lines):
        idx = [k for k, (l, _) in enumerate(words) if l == li]
        hit = sum(1 for k in idx if k in match) / max(1, len(idx))
        if hit < 0.5:
            weak.append((times[idx[0]], line, hit))
        out.append(f"[{ts(times[idx[0]] + a.shift)}] " + " ".join(f"<{ts(times[k] + a.shift)}> {words[k][1]}" for k in idx))
    lrc = vdir / "lyrics.lrc"
    lrc.write_text("\n".join(out) + "\n")
    rate = len(match) / len(L)
    print(f"{len(lines)} lines, {len(L)} words, {rate:.0%} matched to the transcript → {lrc.relative_to(ROOT)}")
    for t, line, h in weak:
        print(f"  check by ear: {t:7.2f}s  ({h:.0%} matched)  {line}")
    if not a.no_import:
        r = subprocess.run(["node", str(ROOT / "tools" / "lyrics.mjs"), "import", str(lrc), f"--video={a.video}"])
        if r.returncode:
            sys.exit(f"lyrics.lrc is written, but importing it failed: node tools/lyrics.mjs import {lrc.relative_to(ROOT)} --video={a.video}")


if __name__ == "__main__":
    main()
