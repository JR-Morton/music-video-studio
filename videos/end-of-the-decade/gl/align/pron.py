"""Display token -> pronunciation sub-words (syllables) used for CTC alignment.

Each display token (a lyric line split on spaces) maps to one or more sub-words of plain letters. For multi-syllable
words the sub-words are its sung syllables (their letters concatenate back to the spelling, so the CTC target is
unchanged): the aligner times every syllable, and the renderer wipes a word syllable by syllable (Word.syl), so a
held "de-caaade" fills "cade" slowly instead of racing through the whole word.
"""
import re

SYL = {
    "machines": "ma chines", "bigger": "big ger", "better": "bet ter", "pretend": "pre tend", "begins": "be gins",
    "believe": "be lieve", "building": "build ing", "marketing": "mar ket ing", "everything": "ev ery thing",
    "decade": "dec ade", "warning": "warn ing", "hundred": "hun dred", "million": "mil lion", "people": "peo ple",
    "shadow": "shad ow", "along": "a long", "afraid": "a fraid", "morning": "morn ing", "everywhere": "ev ery where",
    "other": "oth er", "written": "writ ten", "later": "la ter", "rivals": "ri vals", "agree": "a gree",
    "nothing": "noth ing", "gathered": "gath ered", "followed": "fol lowed", "builders": "build ers",
    "voices": "voic es", "referees": "ref er ees", "badges": "badg es", "closes": "clos es", "quietly": "qui et ly",
    "anyone": "an y one", "moving": "mov ing", "money's": "mon ey's", "being": "be ing",
}
# the second syllable of "decade" is sung "-cade": keep the c with it for the wipe (d-e | c-a-d-e)
SYL["decade"] = "de cade"


def pron(token: str) -> list[str]:
    w = token.lower().replace("’", "'")
    w = re.sub(r"[^a-z' ]", " ", w).strip("' ")
    parts = [p.strip("'") for p in w.split() if p.strip("'")]
    out = []
    for p in parts:
        out.extend(SYL.get(p, p).split())
    return out


if __name__ == "__main__":
    import common
    for l in common.load_lines():
        print(l["i"], " | ".join(" ".join(pron(w)) for w in l["text"].split(" ")))
