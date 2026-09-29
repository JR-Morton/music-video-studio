# The pipeline

From a finished song to a YouTube upload, end to end. The worked example is
[videos/end-of-the-decade](../videos/end-of-the-decade/README.md): every step below was used to make it.

```
song ─► new video ─► stems ─► lyrics ─► sections ─► engine data ─► treatment + look ─► plates ─► review ─► final render ─► publish
Suno    analysis,    Demucs   word      = plates    audio.json,    the plan            one scene   stills,   segments,          upload package,
Studio  video.js,    + VOX    timing                lyrics.json                        per section sheets    60 fps, motion     Short, thumbnails
        gl scaffold                                                                                          blur
```

Run every command from the repo root unless it says `cd gl/app`. Python tools run through `uv run` and install their
own dependencies (PEP 723 script headers). The engine's tools need `bun install` in `gl/app` once.

**The rule everything depends on:** video time is song time. Every frame is a pure function of the song time `t`, and
every shot time comes from the music (lyric words, beats, bars, sections), never from hard-coded seconds. The
browser preview and the offline export then match frame for frame, and a timing fix moves everything with it.

---

## 1. The song

Write and make the song first: see [SONGWRITING.md](SONGWRITING.md). You need:

- `song.wav`: the full mix;
- `vocals.wav`: the vocal-only (VOX) stem of the same take, sample-aligned with the mix;
- `lyrics.txt`: the lyrics exactly as sung, one line per sung line.

**Rights.** Only publish songs you have the rights to: your own, licensed, or AI-generated under terms that allow it.
Anything else gets a Content ID claim or a strike.

No song yet? Make a synthetic test song and run the pipeline on it:

```bash
python3 tools/make_demo_song.py videos/demo        # 45 s song.wav + lyrics.lrc + truth.json (the exact tempo and sections)
node tools/new.mjs demo --audio=videos/demo/song.wav --lyrics=videos/demo/lyrics.lrc
```

## 2. A new video

```bash
node tools/new.mjs <slug> --audio=song.wav --title="My Song" [--artist="Me"] [--lyrics=lyrics.txt]
```

This makes `videos/<slug>/`:

| file | what |
|---|---|
| `song.wav` | a copy of the song |
| `analysis.json`, `analysis.js` | tempo, beat grid, downbeats, suggested sections, envelopes, drum hits (from `tools/analyze.py`) |
| `analysis.md` | the same, readable: tempo check, a bar table, suggested sections, an energy map (one character per bar) |
| `analysis.png` | the song on one picture: loudness with numbered bars, sections, frequency bands, beats and hits |
| `video.js` | the video's settings: title, audio, duration, the `bpm`/`offset` grid, sections, the `youtube` block |
| `lyrics.js` | timed lyrics, if you gave them in a timed format |
| `gl/` | the engine scaffold, copied from `videos/_template/gl` (below) |

The `gl/` scaffold:

- `timeline.ts`: maps each section of `video.js` to a plate, `scenes/<section-id>.ts`. A section whose file doesn't
  exist yet plays the `slate` placeholder: the section name, a bar.beat counter and the current lyric wiping word by
  word. So the video renders start to end from day one, and you can check the sync before building anything.
- `scenes/_aa.ts`: the supersampling helper for full-screen shaders (see `gl/docs/ENGINE.md`, "Motion blur and
  sampling").
- `TREATMENT.md` and `LOOK.md`: templates for the plan (step 7). The treatment starts with a table of the sections,
  their bars, energy and lyrics.

It never overwrites a file you may have edited.

**Check the analysis now.** Everything is built on it. Read `analysis.md` and look at `analysis.png`:

1. **Tempo.** The "Tempo check" table shows how many kicks each tempo candidate catches. Beat trackers often lock onto
   half, double, 2/3 or 3/2 of the real tempo. Pick the level where the song *feels* like it bounces. If it's wrong,
   re-run with a hint: `node tools/new.mjs <slug> --audio=song.wav --bpm=N`.
2. **Downbeat.** `offset` in `video.js` is the time of bar 0, beat 1. If the slate's bar counter is a beat or two off
   the song's "one", re-run with `--downbeat=S` (the time of any downbeat).
3. **Sections.** The suggested sections are a starting point, named by guesswork. You fix them in step 5.

A re-run re-analyses the song but keeps your `video.js`: it prints the new timing to paste in, or add
`--rewrite-config` to replace it (the old one is kept as `video.js.bak`).

## 3. Stems

```bash
uv run tools/stems.py --video=<slug> --vocal=vocals.wav
```

This writes:

- `videos/<slug>/stems/htdemucs_ft/{drums,bass,other,vocals}.wav`: a Demucs (`htdemucs_ft`) split of the mix, on the
  GPU if there is one. The engine reads drum hits and per-stem envelopes from these.
- `videos/<slug>/stems/vocals.wav`: the clean vocal. This is your VOX stem if you pass `--vocal`, otherwise Demucs'
  vocals. The Suno stem is much cleaner than a separated one, and the lyric timing is only as good as this file.

The first run fetches torch and the model (a few GB).

## 4. Lyrics

```bash
uv run tools/align_lyrics.py --video=<slug> --text=videos/<slug>/lyrics.txt --audio=videos/<slug>/stems/vocals.wav
node tools/lyrics.mjs show --video=<slug>
```

`align_lyrics.py` transcribes the vocal with Whisper (faster-whisper) and a time per word, then aligns your lyrics to
that transcript word by word. The transcript's mishearings never reach the lyrics; your words just take the times of
the words they match. Words with no match are placed between their neighbours. It writes `lyrics.lrc` (enhanced LRC,
a time per word) and `lyrics.js`. The first run fetches the model (a few GB).

- Lines listed under "check by ear" at the end had few matched words: their times are guesses.
- `lyrics.mjs show` lists every line with its time, bar and section. It's the lyric sheet for planning.
- Fix times by ear: edit `lyrics.js` directly, or shift everything with `--shift=0.2`.
- Already have timed lyrics? `node tools/lyrics.mjs import song.lrc --video=<slug>` reads `.lrc` (enhanced LRC gives
  word times), `.srt`, `.vtt` and `.json`.

Word start times are what the plates sync to, so get them right here. For syllable-level timing on a tricky song, see
the example's `gl/align/` (a CTC forced aligner; described in
[videos/end-of-the-decade/README.md](../videos/end-of-the-decade/README.md)).

## 5. Sections

Edit the `sections` list in `videos/<slug>/video.js`. Each section becomes one plate (one scene), so this is where you
decide the video's structure.

- Match the song's real structure: verses, pre-choruses, choruses, instrumental breaks, the ending.
- Start every section on a downbeat. `analysis.md`'s bar table gives the times. Sections that start on downbeats give
  hard cuts on the beat by default.
- A plate can hold several shots, so a section doesn't need splitting just because it has several ideas. Split it
  when the music changes (the band drops out, a stripped chorus becomes a full one).
- If the video should run on after the song (a silent ending, room for the end screen), raise `duration` and add a
  last section for it.

The example has ten: verse 1, pre-chorus 1, chorus, an instrumental hook, verse 2, pre-chorus 2, verse 3, the final
chorus stripped, the final chorus with the full band, and a silent sunrise.

## 6. Engine data

```bash
uv run gl/analysis/studio_data.py --video=<slug> --stems=videos/<slug>/stems/htdemucs_ft [--pad-to=SECONDS]
```

This reads the checked data (the beat grid from `analysis.json`, the sections from `video.js`, the word starts from
`lyrics.js`, the clean vocal from `stems/vocals.wav`, the Demucs stems) and writes what the engine reads:

- `videos/<slug>/gl/data/audio.json`: beats, downbeats, sections, envelopes (`rms`, `low`, `mid`, `high`, `vocal`,
  `drums`, `bass`, `other`) and onsets (kick, snare, hat, vocal);
- `videos/<slug>/gl/data/lyrics.json`: lines and words with start and end times (a word ends where the voice goes
  quiet, or at the next word);
- `videos/<slug>/gl/audio/song.wav`: the song, padded with silence to `--pad-to` seconds if given.

Re-run it after any change to the grid, the sections or the lyrics. If another aligner wrote `lyrics.json` (like the
example's `gl/align`), it's kept unless you pass `--overwrite-lyrics`.

## 7. Plan: treatment and look

Plan before you write scene code. Two files in `videos/<slug>/gl/`:

- **`TREATMENT.md`**: the idea in a paragraph, the palette, the cast, the running motif, and a table with one row per
  plate: its section, its time and what happens in it.
- **`LOOK.md`**: the style bible every plate follows: what it is and what it must not look like, the palette and what
  each colour means, the type roles, the lyric rules, how each kind of thing moves, the story rules, and a brief per
  plate. Where the two disagree, LOOK wins.

The example's [TREATMENT.md](../videos/end-of-the-decade/gl/TREATMENT.md) and
[LOOK.md](../videos/end-of-the-decade/gl/LOOK.md) are complete ones to copy from.

A song gives the video its structure. Use it:

- **Sections are acts.** Verses tell (set-up, story, detail). Choruses are spectacle and the recurring image. The last
  chorus is the biggest thing in the video. The ending rhymes with the opening.
- **Choruses rhyme and escalate.** Give every chorus the same core image so it's recognised at once, and change it each
  time: bigger, stranger, later in the story, or broken. In the example the chorus is the town square with a small
  robot's shadow thrown huge on a wall; in the final chorus every string is visible.
- **Spend visuals where the music is loud.** The energy map in `analysis.md` is your budget: the biggest moment goes in
  the loudest bars, and quiet stretches get small, close shots.
- **Cut on bars.** Cut on downbeats, every 2 to 4 bars in verses and every 1 to 2 in choruses at most tempos. Land
  impacts and reveals on beats. A cut that fights the music feels wrong even when the viewer can't say why.
- **Act the lyric, don't illustrate every word.** At most one image per line. Show the meaning, the irony or the
  feeling, and land the key word on its beat.
- **Hook the first seconds.** Something happens before the first chorus, ideally in the first few seconds.
- **Plan the thumbnail.** One strong frame, high contrast, readable at the size of a stamp.
- **Plan the end screen.** YouTube's end-screen elements cover part of the last 5 to 20 seconds. Make that stretch a
  calm composition with space for them, and let the ending land before it.
- **Lyrics on screen or captions.** In this engine the plates draw the lyric themselves, as part of the image (the
  example does this in every plate). Either way, the lyrics also go to YouTube as captions (step 10).

Before building plates, make **model sheets and a look test**: one scene that shows the cast and the lighting, rendered
with `--sheet <scene>` (step 8). Agree the look on those stills, not on words.

## 8. Build the plates

Read [gl/docs/ENGINE.md](../gl/docs/ENGINE.md) before writing a scene. It has the scene API, the rules, the toolbox
and how motion blur works.

A plate is `videos/<slug>/gl/scenes/<plate>.ts`: a default-exported class that extends `Scene` and imports the engine
as `@engine/...`. `render(f, out)` draws the frame for song time `f.t` into `out` and may return post-processing
overrides.

- **Find times in the music.** Lyric words: `this.ctx.lyrics.get('park bench').words[0].start`. Beats and bars:
  `this.ctx.audio.timeOfBeat(i)`, `beatAt(t)`, `barAt(t)`, `downbeats`. Envelopes and hits: `f.a.kick`, `f.a.vocal`,
  `audio.env('bass', t)`. Never type a lyric time in seconds.
- **Deterministic.** No `Math.random()`, `Date.now()` or `performance.now()` for anything visible: use seeded hashes.
  The export renders every frame as several sub-frames, in any order.
- **Shared code** used by several plates (a look module, a cast of models) lives in `scenes/_*.ts` files owned by the
  lead. A plate's private helpers go in `scenes/<plate>-*.ts`.
- **The timeline** (`timeline.ts`) is the edit: which plate plays when. Plates start at their sections by default. If a
  sung line runs past a section's downbeat, move the cut to the next line's first word (the example does this three
  times; see its `timeline.ts`).

### Preview

```bash
cd gl/app && bun install
VIDEO=<slug> bunx vite                   # http://localhost:5173 , add ?t=40 to start at 40 s
```

Keys: space play/pause, ←/→ ±1 s (shift ±5 s), `,`/`.` ±1 frame, `[`/`]` previous/next plate, `l` loop the current
plate, `h` hide the UI. The scrub bar shows the plates; the info line shows time, beat, bar, plate and lyric. Saving a
scene file reloads just that scene.

### Stills, sheets, perf, typecheck (from `gl/app`)

```bash
bun scripts/render.ts stills --video <slug> --t 12.5,40                        # → videos/<slug>/gl/out/stills/
bun scripts/render.ts sheet  --video <slug> --from 20 --to 35 --n 12 --cols 4  # → videos/<slug>/gl/out/sheets/
bun scripts/render.ts sheet  --video <slug> --cuts                             # 4 frames around every cut
bun scripts/render.ts perf   --video <slug> --from A --to B                    # ms per frame
bunx tsc --noEmit -p tsconfig.json                                             # typecheck engine + scenes
```

Useful flags: `--only <plate>[,<plate>]` loads only those plates (faster, and isolates you from someone else's broken
scene); `--out <dir|file>`; `--scale 2` renders true 4K; `--sheet <scene>` plays one scene file across the whole
duration (model sheets, look tests); `--notype` leaves every 2D layer empty (clean plates for thumbnails and Shorts).
`render.ts` starts its own Vite server without live reload, and prints `SCENE ERRORS` and browser errors: read them.

### Building in parallel

A 3-minute song is about ten plates. They can be built in parallel by one agent per plate:

1. **The lead** writes TREATMENT.md and LOOK.md, builds the shared files (the look module, the cast), and gets the look
   test agreed.
2. **One builder per plate**, each owning `scenes/<plate>.ts` and its `scenes/<plate>-*.ts` helpers and nothing else.
   A missing shared helper or a bug in a shared file is reported to the lead, not fixed in place.
3. Each builder renders only its plate (`--only`), reviews its own stills and sheets, and checks both seams: the last
   frames of the plate before and the first frames of the plate after.
4. **The lead reviews** every plate, every seam and the whole video with sound, by opening the images, and sends fixes
   back.

See [CLAUDE.md](../CLAUDE.md) for the agent rules.

## 9. Review, then the final render

Look at every render you make before calling a shot done. For each plate, check:

- the lyric is readable and never lights up before its word is sung;
- nothing clips through anything else, and nothing intersects that shouldn't;
- a cut doesn't chop an animation off halfway, and a transition doesn't hide the moment a shot was built for;
- it holds up in motion: render a short clip of the plate (`bun scripts/render.ts video --video <slug> --only <plate>
  --from A --to B --samples 1 --out clip.mp4`) and watch it with sound;
- it's fast enough (`perf`): aim for under about 30 ms per frame at 1080p for one sample.

Then render the final video:

```bash
bash tools/render_final.sh <slug>
```

It renders the timeline in 16-second segments on the 60 fps frame grid, then joins them losslessly with the audio into
`videos/<slug>/gl/out/final/<slug>.mp4`. A crash or a timeout only costs one segment, and a rerun skips finished
segments. Settings are environment variables: `SAMPLES=8` (motion-blur and anti-aliasing sub-frames per frame),
`SHUTTER=0.3` (the fraction of the frame time the shutter is open), `CRF=17` (x264 quality), `SEG=16` (segment
length in seconds).

```bash
SAMPLES=4 CRF=20 bash tools/render_final.sh <slug>       # a quicker draft
```

The example's final render (170 s at 1080p60, `SAMPLES=8 SHUTTER=0.3 CRF=17`) took about 9 minutes on an RTX 5080.
A 4K render is `--scale 2` on `render.ts`; see `gl/docs/ENGINE.md`, "Output scale".

**Long renders and agent shells.** Agent shells time out (often at a few minutes). Start long renders detached and
poll the log:

```bash
setsid nohup bash tools/render_final.sh <slug> > render.log 2>&1 < /dev/null &
tail -n 5 render.log
```

## 10. Publish

```bash
node tools/publish.mjs --video=<slug> --master=videos/<slug>/gl/out/final/<slug>.mp4 --upscale=2160 [--thumb=thumb.jpg]
```

`--master` defaults to that path, so `node tools/publish.mjs --video=<slug> --upscale=2160` is the same.

This writes `videos/<slug>/out/youtube/`:

| file | what |
|---|---|
| `<slug>.mp4` | the master in YouTube's recommended upload format (H.264, BT.709, AAC, faststart) |
| `thumbnail.jpg` | 1280×720, under 2 MB: from `--thumb`, or else the master's frame at `youtube.thumbnail` in `video.js` |
| `description.txt` | the description, chapters from the sections, the lyrics and the credits |
| `captions.srt` | the lyrics as subtitles: upload them under Subtitles, so viewers can turn them on |
| `metadata.json` | title, description, tags and category, for an API upload |
| `report.md` | what was made, the checks, and an upload checklist |

Fill in the `youtube` block in `video.js` first (title, description, tags). Notes:

- **`--upscale=2160`** is worth it: YouTube serves 4K uploads at a much higher bitrate, which keeps hairlines and type
  crisp even for viewers watching in 1080p.
- **Chapters.** YouTube's rules: the first at 0:00, at least three, each at least 10 seconds long. They come from the
  sections; rename or merge sections if a chapter is too short.
- **Loudness.** YouTube plays everything at about −14 LUFS and turns louder masters down, so there's nothing to gain
  from a hot master. Keep the true peak under −1 dBFS or the transcode may clip.
- **Disclosure.** Answer YouTube's "altered or synthetic content" question honestly. An AI-generated song is a yes.

### The Short and thumbnails

`publish.mjs --short=a:b` makes a quick vertical cut of song seconds a to b (the frame blurred or cropped to fit). For
a Short that is reframed shot by shot, and for designed thumbnails, adapt the example's scripts (see
[videos/end-of-the-decade/README.md](../videos/end-of-the-decade/README.md)).

- **The Short** (9:16, under 3 minutes): `render_short.sh` renders a stretch of the song as clean 4K plates (no type),
  and `short.py` reframes each shot to a 1215×2160 window of the 4K frame, sets the lyrics again for a phone screen,
  and muxes the audio. Pick a stretch that stands on its own; the example uses verse 3, the final chorus and the dawn
  (54.8 s).
- **Thumbnails:** render clean 4K stills of your best frames (`stills --notype --scale 2`), then `thumbs.py` crops,
  grades and letters them into 1280×720 options with a contact sheet to choose from.

## Troubleshooting

| symptom | fix |
|---|---|
| everything moves at double or half speed, or on the off-beat | wrong tempo level or phase: re-run the analysis with `--bpm` / `--downbeat` (step 2), then `studio_data.py` |
| a lyric lights up early or late | fix the word in `lyrics.js`, re-run `studio_data.py` |
| white or black frames, or very slow renders | headless WebGL isn't on the GPU: see [gl/README.md](../gl/README.md), "Linux notes"; `bun scripts/render.ts gpu` prints the renderer in use |
| `SCENE ERRORS` in the render output | a plate failed to load or threw: the message names it; the rest of the video still renders |
| a black stretch in a still or sheet made with `--only` | `--only` loads only those plates: the time is outside them |
| `adaptive sampling needs stateless scenes` | a plate sets `stateful = true`: render with a fixed `--samples N` |
| a change doesn't show up in a render | a finished segment is skipped on rerun: delete that `seg_*.mp4` in `gl/out/final/` |
| no chapters in the description | fewer than three sections of at least 10 s: merge or rename sections |
