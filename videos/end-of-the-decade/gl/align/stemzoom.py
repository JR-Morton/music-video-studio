"""Lead vs backing (karaoke split of the VOX stem) over a window, with the current word marks.
   ./run.sh stemzoom.py t0 t1 name   -> qa/name.png"""
import common, sys, json
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import librosa

SR = 22050
lead = common._read(common.lead_path(), SR, True)[0]
back = common._read(sorted(common.KARAOKE.glob("*(Instrumental)*.wav"))[0], SR, True)[0]
doc = json.loads((common.WORK / "lyrics_new.json").read_text())


def panel(ax, axr, y, t0, t1, title):
    a, b = int(t0 * SR), int(t1 * SR)
    seg = y[a:b]
    hop = 64
    S = librosa.amplitude_to_db(np.abs(librosa.stft(seg, n_fft=2048, hop_length=hop)) + 1e-9, ref=1.0)
    fr = librosa.fft_frequencies(sr=SR, n_fft=2048)
    ext = [t0, t0 + S.shape[1] * hop / SR, 0, 4000]
    ax.imshow(S[fr <= 4000], origin="lower", aspect="auto", cmap="magma", vmin=-60, vmax=20, extent=ext)
    ax.set_ylabel(title)
    r = librosa.feature.rms(y=seg, frame_length=1024, hop_length=hop)[0]
    tt = t0 + np.arange(len(r)) * hop / SR
    axr.plot(tt, 20 * np.log10(r + 1e-6), lw=1, label=title)


def main(t0, t1, name):
    fig, ax = plt.subplots(4, 1, figsize=(22, 12), sharex=True, gridspec_kw=dict(height_ratios=[2, 2, 1.2, 1.2]))
    panel(ax[0], ax[2], lead, t0, t1, "lead")
    panel(ax[1], ax[2], back, t0, t1, "backing")
    ax[2].legend(loc="upper left"); ax[2].set_ylim(-70, 0)
    P, OFF = 60 / common.BPM, common.OFFSET
    for n in range(int((t0 - OFF) / P * 4) - 1, int((t1 - OFF) / P * 4) + 2):
        tb = OFF + n * P / 4
        if t0 <= tb <= t1:
            for a_ in ax[2:]:
                a_.axvline(tb, color="gray", lw=[1.4, 0.4, 0.8, 0.4][n % 4], ls="-" if n % 4 == 0 else ":")
    for l in doc["lines"]:
        yv = 0.4 if l.get("backing") else 1.0
        col = "tab:blue" if l.get("backing") else "tab:red"
        for w in l["words"]:
            if w["end"] < t0 or w["start"] > t1:
                continue
            ax[3].plot([w["start"], w["end"]], [yv, yv], lw=7, alpha=0.5, color=col)
            ax[3].text(w["start"], yv + 0.12, w["w"], fontsize=11, clip_on=True)
            ax[0 if not l.get("backing") else 1].axvline(w["start"], color="w", lw=0.8)
            for s in w.get("syl", [])[1:]:
                ax[3].plot([s[0], s[0]], [yv - 0.1, yv + 0.1], color=col, lw=2)
    ax[3].set_ylim(0, 1.5); ax[3].set_yticks([])
    ax[3].set_xticks(np.arange(np.ceil(t0 * 10) / 10, t1, 0.1), minor=True)
    ax[3].set_xticks(np.arange(np.ceil(t0 * 2) / 2, t1, 0.5))
    for a_ in ax:
        a_.grid(True, which="both", axis="x", alpha=0.25)
    ax[3].set_xlim(t0, t1)
    fig.tight_layout(); fig.savefig(common.QA / f"{name}.png", dpi=70)
    plt.close(fig)


if __name__ == "__main__":
    main(float(sys.argv[1]), float(sys.argv[2]), sys.argv[3])
