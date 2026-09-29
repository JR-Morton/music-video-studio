"""Word/syllable-level lyric alignment for "End of the Decade" -> ../data/lyrics.json

Pipeline:
  1. ctc_emissions.py : 20 ms CTC log-probs of the Suno VOX stem from two acoustic models (torchaudio MMS_FA and
                        wav2vec2 LV60K-960h) on the mono sum and on the left / right channels (+ the karaoke lead split).
  2. vocal_feats.py   : 5 ms RMS / pYIN pitch / spectral-flux onsets / frication features of the vocal.
  3. this script      : ONE global constrained Viterbi pass over the whole song on the fused emissions (a garbage
                        "star" token between lines absorbs backing vocals / ad-libs), every multi-syllable word
                        split into its sung syllables (pron.SYL), then signal refinement of each syllable start
                        (rest re-entry / onset snap / frication start) and of word ends (legato -> next word; else
                        where the voice stops), then the manual FIX table (from the QA plots).
Backing lines ("The end of the decade" echoes) are not re-aligned: they keep their hand-set timings.

Run:  ./run.sh align.py [--plots]
"""
import common
import json
import sys

import numpy as np

from ctcalign import align, emissions, word_table
from pron import pron
from refine_lib import load_feats, refine

PRIMARY = "fused6"
ALTS = ("mms", "lv60k", "fused_vocL", "fused_vocR")
LINE_WINDOWS = {}
ANCHORS = {}

# (lead line index, token index) -> dict(start=, end=, syl=[later syllable starts], conf=) from the QA plots
FIX = {
    (9, 0): dict(start=38.72),     # That's: lead stem (all models) + same bar position as the final chorus (By + 4.00 s)
    (14, 4): dict(start=61.60),    # end: held note on the & of 4 (lv60k/lead 61.78, fused 61.52); final chorus agrees
    (14, 5): dict(start=64.58),    # of: after the "d" release of the held "end" (64.50)
    (16, 0): dict(start=78.58),    # He'd: all models 78.58; the refiner took the "d" of "Planned" (78.33)
    (18, 4): dict(start=88.00),    # agree
    (19, 0): dict(start=91.02),    # One: models 91.10-91.18; the refiner snapped to the "d" release of "round" (90.87)
    (20, 0): dict(start=95.05),    # The: voice enters 95.05 (models 95.08); 94.81 was a breath
    (22, 4): dict(start=105.68),   # I (2nd): models 105.74; 105.55 was a breath
    (23, 3): dict(start=107.45),   # hold: models 107.50; 107.35 is the "k" of "took"
    (24, 3): dict(start=111.68),   # built: models 111.70
    (26, 9): dict(start=122.38),   # me: models 122.40; 122.28 is the "k" of "like"
    (27, 1): dict(start=124.14),   # the: models 124.16
    (27, 3): dict(start=124.92),   # of: after the "d" release of "end" (124.86)
    (28, 0): dict(start=127.92),   # That's: lead stem 127.92 (the mixed stem put it on the backing echo, 127.20)
    (28, 3): dict(start=128.68),   # warning: models 128.68-128.74
    (33, 4): dict(start=150.80),   # end: held note on the & of 4 (lead 150.70, fused 151.00)
    (33, 5): dict(start=153.80),   # of: after the "d" release (153.74)
}

# Backing echoes "(the end of the decade)": windowed CTC on the karaoke backing split (probe.py, fused/mms/lv60k agree),
# the two choruses land on the same bar positions. Ends kept long: the echo's harmony tail (user: "lasts longer").
BACKING = {
    9: [("The", 37.40, 37.60), ("end", 37.60, 37.86), ("of", 37.86, 37.98), ("the", 37.98, 38.22),
        ("decade", 38.22, 42.85, [[38.22, 38.46], [38.46, 42.85]])],
    29: [("The", 126.40, 126.74), ("end", 126.74, 127.06), ("of", 127.06, 127.18), ("the", 127.18, 127.42),
         ("decade", 127.42, 129.00, [[127.42, 127.66], [127.66, 129.00]])],
}


def lead_lines():
    return [l for l in common.load_lines() if not l.get("backing")]


def main(plots=False):
    L = lead_lines()
    toks = [l["text"].split(" ") for l in L]
    primary = PRIMARY
    alts = list(ALTS)
    if (common.WORK / "emission_mms_lead.npy").exists():
        alts.append("fused_lead")
    E = emissions(primary)
    sp, score, _, _ = align(E, toks, anchors=ANCHORS, line_windows=LINE_WINDOWS)
    words = word_table(sp, toks)
    alt = {}
    for k in alts:
        s2, _, _, _ = align(emissions(k), toks, anchors=ANCHORS, line_windows=LINE_WINDOWS)
        alt[k] = word_table(s2, toks)
    f = load_feats()
    words = refine(words, f, FIX)
    for k in range(1, len(words)):
        if words[k]["start"] < words[k - 1]["start"] + 0.02:
            words[k]["start"] = words[k - 1]["start"] + 0.02
        if words[k - 1]["end"] > words[k]["start"]:
            words[k - 1]["end"] = words[k]["start"]
    # confidence: agreement of the alternative alignments with the primary CTC start
    for i, w in enumerate(words):
        ds = [abs(a[i]["start"] - w["ctc_start"]) for a in alt.values()]
        agree = float(np.mean([d <= 0.06 for d in ds]))
        c = 0.4 + 0.4 * agree + 0.2 * min(1.0, w["conf"] / 0.5)
        fx = FIX.get((w["li"], w["ti"]))
        if fx is not None:
            c = fx.get("conf", max(c, 0.85))
        w["conf_final"] = round(float(np.clip(c, 0, 1)), 2)
    (common.WORK / "align_debug.json").write_text(json.dumps(dict(words=words, alt=alt), indent=1, default=float))

    # write data/lyrics.json: lead lines re-aligned, backing lines untouched, original order / indices
    before = json.loads(common.SRC.read_text())
    lead_i = [l["i"] for l in L]
    out_lines = []
    for l in before["lines"]:
        if l.get("backing"):
            if l["i"] in BACKING:
                ws = []
                for b in BACKING[l["i"]]:
                    d = dict(w=b[0], start=b[1], end=b[2], conf=0.8)
                    if len(b) > 3:
                        d["syl"] = b[3]
                    ws.append(d)
                assert [w["w"] for w in ws] == l["text"].split(" "), l["text"]
                l = dict(l, words=ws, start=ws[0]["start"], end=ws[-1]["end"])
            out_lines.append(l)
            continue
        li = lead_i.index(l["i"])
        ws = [w for w in words if w["li"] == li]
        assert [w["w"] for w in ws] == l["text"].split(" ")
        o = []
        for w in ws:
            d = dict(w=w["w"], start=round(w["start"], 3), end=round(w["end"], 3), conf=w["conf_final"])
            if len(w["subs"]) > 1:
                d["syl"] = [[round(a, 3), round(b, 3)] for a, b in w["subs"]]
            o.append(d)
        out_lines.append(dict(i=l["i"], text=l["text"], start=o[0]["start"], end=o[-1]["end"], words=o))
    doc = dict(lines=out_lines, extras=before.get("extras", []), notes=NOTES)
    if "--dry" not in sys.argv:
        (common.DATA / "lyrics.json").write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n")
        print("wrote", common.DATA / "lyrics.json", "score", round(score, 1))
    (common.WORK / "lyrics_new.json").write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n")
    if plots:
        make_plots(words, alt, L, before, doc)
    return words, alt


def make_plots(words, alt, L, before, doc):
    from qa_plot import plot
    old = [(w["w"], w["start"], w["end"]) for l in before["lines"] if not l.get("backing") for w in l["words"]]
    back = [(w["w"], w["start"], w["end"]) for l in doc["lines"] if l.get("backing") for w in l["words"]]
    only = [int(x) for x in sys.argv[sys.argv.index("--only") + 1].split(",")] if "--only" in sys.argv else None
    for li, l in enumerate(L):
        if only is not None and li not in only:
            continue
        ws = [w for w in words if w["li"] == li]
        t0 = min(ws[0]["start"], ws[0]["ctc_start"]) - 0.7
        t1 = max(ws[-1]["end"], ws[-1]["ctc_end"]) + 0.6
        t1 = min(t1, t0 + 8)
        tracks = [
            ("final", [(w["w"], w["start"], w["end"]) for w in words]),
            ("syllables", [(pron(w["w"])[i] if len(w["subs"]) > 1 else "", a, b)
                           for w in words for i, (a, b) in enumerate(w["subs"])]),
            ("fused-ctc", [(w["w"], w["ctc_start"], w["ctc_end"]) for w in words]),
            ("mms", [(w["w"], w["start"], w["end"]) for w in alt["mms"]]),
            ("lv60k", [(w["w"], w["start"], w["end"]) for w in alt["lv60k"]]),
        ]
        if "fused_lead" in alt:
            tracks.append(("lead-stem", [(w["w"], w["start"], w["end"]) for w in alt["fused_lead"]]))
        tracks.append(("OLD (whisper)", old))
        tracks.append(("backing", back))
        plot(t0, t1, tracks, common.QA / f"line_{li:02d}.png", title=f"L{li} (data line {l['i']}): {l['text']}")


NOTES = (
    "Lead lines: align/align.py: CTC emissions of the Suno VOX stem from MMS_FA + wav2vec2 "
    "LV60K on the mono / left / right channels (fused), one global Viterbi forced alignment with a garbage token "
    "between lines, each multi-syllable word split into sung syllables (Word.syl), signal refinement of syllable "
    "starts (rest re-entry, spectral-flux onset, frication start) and word ends (legato -> next word, else voice "
    "stop), manual fixes from per-line QA plots (align/qa/). Backing lines: hand-set (lyrics_fix.json)."
)

if __name__ == "__main__":
    main(plots="--plots" in sys.argv)
