"""Windowed forced alignment of single lines on chosen emission sources (probe for the chorus overlaps).
   ./run.sh probe.py"""
import common
import numpy as np
from ctcalign import align, emissions, word_table

PROBES = [
    ("ch1 echoA", "The end of the decade", (36.6, 39.6), ["fused_back", "mms_back", "lv60k_back"]),
    ("ch1 echoB", "The end of the decade", (40.6, 43.9), ["fused_back", "mms_back", "lv60k_back"]),
    ("ch1 echoB2", "end of the decade", (40.6, 43.9), ["fused_back", "mms_back", "lv60k_back"]),
    ("ch1 echoB3", "decade", (40.6, 43.9), ["fused_back", "mms_back", "lv60k_back"]),
    ("ch3 echoA", "The end of the decade", (125.9, 128.8), ["fused_back", "mms_back", "lv60k_back"]),
]

cache = {}
for label, text, (a, b), srcs in PROBES:
    toks = [text.split(" ")]
    print(f"== {label}: {text}  [{a}, {b}]")
    for s in srcs:
        if s not in cache:
            cache[s] = emissions(s)
        E = cache[s]
        f0, f1 = int(a / 0.02), int(b / 0.02)
        sp, score, _, _ = align(E[f0:f1], toks)
        ws = word_table(sp, toks)
        print(f"  {s:12s} " + "  ".join(f"{w['w']}@{w['start'] + a:.2f}-{w['end'] + a:.2f}({w['conf']:.2f})" for w in ws))
