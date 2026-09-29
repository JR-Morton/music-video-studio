# Example: "End of the Decade"

The finished example: a cheerful, deadpan pop song over a creepy marionette-town story, with tin toy robots, hands
on strings above the clouds, and a dawn ending. The song is 2:39; the video runs to 2:50 with a silent sunrise.

It's a story song: the song and the video never say or admit anything, and the viewer decides. The people in it are
wooden marionettes, the machines are tin wind-up robots, and whoever pulls the strings is only ever a pair of cuffed
hands.

The song, its lyrics and the video are © 2026 JR Morton, all rights reserved. They're here so you can study and
reproduce the example; please don't re-upload them. See the license section of the [main README](../../README.md).

## What's in this folder

### The song and its data

| file | what |
|---|---|
| `SONG.md` | the song: arc, motif, the Suno style prompt, the lyrics as sung, the rhyme scheme |
| `video.js` | settings: title, duration (170 s: the song plus the silent ending), the beat grid (113 BPM, first downbeat at 0.27 s), the ten sections, the YouTube block |
| `analysis.json`, `analysis.js`, `analysis.md`, `analysis.png` | the song analysis (`tools/analyze.py`): tempo, beat grid, suggested sections, energy per bar, envelopes, hits |
| `lyrics.txt` | the lyrics as sung, one line per sung line |
| `lyrics.lrc`, `lyrics.js` | word-timed lyrics from `tools/align_lyrics.py` |

The stems (`stems/`) are not included.

### The video (`gl/`)

| file | what |
|---|---|
| `gl/TREATMENT.md` | the treatment: the idea, the palette, the cast, the running motif (the thread) and the plate list |
| `gl/LOOK.md` | the style bible every plate follows: palette, type, lyric rules, motion, story rules, a brief per plate |
| `gl/timeline.ts` | the edit: one plate per section of `video.js`, three cuts moved onto the next sung line, and `?sheet=<scene>` for model sheets |
| `gl/scenes/` | the plates and their shared modules (below) |
| `gl/data/audio.json` | beats, downbeats, sections, envelopes and drum/vocal onsets (from `gl/analysis/studio_data.py`) |
| `gl/data/lyrics.json` | word- and syllable-timed lyrics (from `gl/align/`) |
| `gl/audio/song.wav` | the song, padded with silence to 170 s |
| `gl/align/` | the syllable-level lyric alignment used for this song (below) |
| `gl/render_final.sh` | the final render, in segments |
| `gl/render_short.sh`, `gl/short.py` | the YouTube Short |
| `gl/thumbs.py` | the thumbnail options |

### The plates

One plate per section, with its colour grade from `_look.ts`:

| plate | section | what happens |
|---|---|---|
| `sandbox.ts` | verse 1 (`lab`) | a porcelain test chamber: the instruction typed as a system prompt, tin robots pick the padlock and slip out through a crack of light, the chamber turns out to be a box inside bigger boxes, a crate locks, and the floor grid runs out into the real world at night |
| `bench.ts` | pre-chorus 1 (`candy`) | the too-neat daytime park: a marionette on a bench, his quote composing on a glass post card that flips to a sworn statement; the lights go down to one spot on his face |
| `decade.ts` | chorus (`spot`) | the town square at night: a marquee title, a sea of marionettes, a view counter rolling to 100,000,000, and a floor spotlight blowing one small robot's shadow up into a monster |
| `hook.ts` | instrumental hook (`dusk`) | the marionette town dances under sweeping spotlights; a cuffed hand dangles a hook to snag a robot and misses; night falls |
| `wire.ts` | verse 2 (`flash`) | a sun hauled up on a string over a toy town, the post spreading town to town, PLANNED on a marquee sign, credits and a paper plane, four day cards, a ticking pendulum on the boss's podium that slows, the rivals' huddle |
| `sides.ts` | pre-chorus 2 (`afternoon`) | a split stage: the warning side screen-right, "all for show" behind a curtain screen-left; the frame closes like eyelids and a shadow swallows the wall |
| `string.ts` | verse 3 (`gallery`) | the reveal: the thread is taken hold of and followed up through the clouds to a night gallery of cuffed hands, cheques, the front rows, referees' badges, a handshake, and a vault door that closes quietly |
| `strings.ts` | final chorus, stripped (`cold`) | back in the town, cold and quiet: every string lit silver, the crowd in perfect puppet unison, the sky of hands |
| `money.ts` | final chorus, full band (`money`) | brass light and falling coins, an LED ticker, the crowd yanked hardest; then the camera walks into the big shadow and finds the small robot in the light |
| `dawn.ts` | ending, silent (`dawn`) | a real sunrise with no string: the small robot on a knoll above the town turns, on its own, to watch it; fade to black |

Shared modules and helpers:

| file | what |
|---|---|
| `_look.ts` | the shared look: the section grades, the lyric renderer (every sung word casts a shadow), the backing-vocal echo, the thread, and the two motion rules (marionettes yank on the beat, robots tick on their own clock) |
| `_cast.ts` | the cast as GLSL signed-distance models (tin robot, marionette, cuffed hand, strings) plus a stage-lighting toolkit (march, normals, soft shadows, AO, materials, spotlight shading) |
| `_aa.ts` | rotated-grid supersampling for full-screen shaders, spread over the motion-blur sub-frames |
| `sandbox-gl.ts` | the `sandbox` plate's raymarched sets |
| `bench-kit.ts` | shared by `bench` and `sides`: a camera mirrored in TS and GLSL, string and shading helpers, a lyric that types in |
| `decade-world.ts` | the night town square, shared by `decade` and `hook` |
| `wire-cam.ts`, `wire-town.ts`, `wire-planned.ts`, `wire-credits.ts`, `wire-podium.ts`, `wire-puppet.ts` | the `wire` plate's camera, town and shots |
| `string-glsl.ts`, `string-type.ts` | the `string` plate's shaders and its two-block lyric layout |
| `strings-stage.ts` | the final-chorus stage, shared by `strings` and `money` |
| `dawn-gl.ts` | the `dawn` plate's sunrise shader |
| `slate.ts` | the placeholder plate: section name, bar.beat and the lyric wiping word by word |
| `looktest.ts`, `castsheet.ts` | the look test and the cast model sheet (render with `--sheet`) |

### The lyric alignment (`gl/align/`)

The lyrics in `gl/data/lyrics.json` are timed to the syllable, so a held note ("de-caaade") fills slowly instead of
racing through the word. `gl/align/` is the aligner that made them: CTC forced alignment of the whole lyric in one
pass, on the Suno VOX stem, with two acoustic models (torchaudio's MMS_FA and wav2vec2 LV60K) fused; then signal
refinement of each syllable start and word end, and a small table of manual fixes made from its QA plots. Backing
echoes keep hand-set timings.

It's a record of what was done, not a turnkey tool. It needs inputs that aren't included: the VOX stem at
`videos/end-of-the-decade/stems/vocals.wav`, a lead/backing split of it in `gl/align/stems/`, and the starting line
list `gl/align/work/lyrics_before.json`. The result, `gl/data/lyrics.json`, is included, so you don't need to run it to
render the video. With those inputs:

```bash
cd videos/end-of-the-decade/gl/align
./run.sh ctc_emissions.py        # CTC log-probabilities of the vocal (fetches the models on first run)
./run.sh vocal_feats.py          # loudness, pitch, onset and consonant features of the vocal
./run.sh align.py --plots        # → ../data/lyrics.json, QA plots in qa/
```

`run.sh` runs the scripts through `uv` with the pinned torch and torchaudio versions.

## Reproduce it

Requirements and setup are in the [main README](../../README.md). Install the engine once:

```bash
cd gl/app && bun install && cd ../..
```

### Preview

```bash
cd gl/app && VIDEO=end-of-the-decade bunx vite        # http://localhost:5173
```

### The final video

```bash
bash videos/end-of-the-decade/gl/render_final.sh
```

It renders 1080p60 with `SAMPLES=8 SHUTTER=0.3 CRF=17` (override them as environment variables), in segments of one
or two plates each, into `videos/end-of-the-decade/gl/out/final/`. Reruns skip finished segments. The last step joins
the segments with the audio into `gl/out/final/end_of_the_decade.mp4`. It took about 9 minutes on an RTX 5080. The generic
`bash tools/render_final.sh end-of-the-decade` does the same in 16-second segments.

It takes a while: in an agent shell, start it detached and poll the log (see [CLAUDE.md](../../CLAUDE.md)).

### The Short

A 9:16, 54.8-second cut: verse 3, the final chorus and the dawn.

```bash
bash videos/end-of-the-decade/gl/render_short.sh      # clean 4K plates, no type → gl/out/short/plates/plates_4k.mp4
cd videos/end-of-the-decade/gl
uv run short.py sheet                                 # one still per shot → out/short/preview/shots.jpg
uv run short.py                                       # the Short → out/short/end_of_the_decade_short.mp4
```

`render_short.sh` renders the song from 106.68 s to 161.5 s at 3840×2160 with `--notype`. `short.py` reframes every
shot to a 1215×2160 window of the 4K frame (the `SHOTS` table: a crop centre per shot, eased within a shot and jumping
only on cuts), scales it to 1080×1920, sets the lyrics again for a phone screen, adds the title over the dawn, and
muxes the audio. `uv run short.py cuts` lists the cuts it finds in the plates, and `uv run short.py preview --t
110,120.5` renders single frames.

### The thumbnails

`thumbs.py` makes seven 1280×720 options (cropped, graded and lettered) from clean 4K stills of seven moments, and a
contact sheet to choose from. It renders any missing stills first (`render.ts stills --notype --scale 2` into
`gl/out/thumbs/hi/`), so `bun install` in `gl/app` must have run.

```bash
cd videos/end-of-the-decade/gl
uv run thumbs.py                    # → out/thumbs/thumb_*.jpg + out/thumbs/options.jpg
```
