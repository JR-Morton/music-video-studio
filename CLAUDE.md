# Notes for coding agents

This repo makes code-rendered, beat-synced music videos: a song is analysed, then the video is written as
TypeScript/GLSL scenes ("plates", one per song section) in a three.js engine, rendered headless and packaged for
YouTube. `AGENTS.md` is a symlink to this file.

Read these before you change anything:

- [docs/PIPELINE.md](docs/PIPELINE.md): the workflow, step by step, with every command.
- [gl/docs/ENGINE.md](gl/docs/ENGINE.md): the scene API and rules. **Read it before writing or editing a scene.**
- The video's own `videos/<slug>/gl/LOOK.md` (the style bible, it wins over everything else) and `TREATMENT.md` (the
  plate list).

## Map

- `gl/app/`: the engine (TypeScript + three.js, bun + Vite). `src/engine/` is the renderer core, post, type, lines,
  lyrics and audio; `src/main.ts` is the preview player and export API; `scripts/render.ts` is the offline renderer
  (stills, sheets, perf, video). Changes here affect every video: keep them backwards compatible.
- `gl/analysis/studio_data.py`: builds a video's engine data (`gl/data/audio.json`, `lyrics.json`, `gl/audio/song.wav`).
- `tools/`: `new.mjs` (a new video), `analyze.py`, `stems.py`, `align_lyrics.py`, `lyrics.mjs`, `render_final.sh`,
  `publish.mjs`, `make_demo_song.py`. Each has its usage in its header comment.
- `videos/<slug>/`: one video. `video.js` (settings and sections), `analysis.*` and `lyrics.*` (generated, then
  checked by hand), `stems/`, and `gl/`: `timeline.ts` (the edit), `scenes/*.ts` (the plates), `data/`, `audio/`,
  `TREATMENT.md`, `LOOK.md`, `out/` (renders, not committed).
- `videos/_template/gl/`: the scaffold `new.mjs` copies. `videos/end-of-the-decade/`: the finished example.

## Rules

**Time and sync**

- Video time is song time, everywhere. Every frame is a pure function of `t`: no `Math.random()`, `Date.now()` or
  `performance.now()` for anything visible, no state carried between frames. The export renders sub-frames in any
  order.
- Never hard-code lyric or beat times. Find lyric words by content (`ly.get('park bench').words[0].start`) and beats
  from the grid (`audio.timeOfBeat`, `downbeats`, `barAt`). A timing fix then moves everything with it.
- Text is never early: a lyric word never lights up before its `start`, and it's complete by its `end`.

**Plan, then build**

- Plan each video in `gl/TREATMENT.md` and `gl/LOOK.md` before writing plates. Agree the look on rendered model sheets
  and a look test, not on descriptions.
- No clipping or intersections: figures stand on floors, hands hold what they hold, strings reach what they pull.
- Check every seam: a transition must not cut an animation off halfway, and a cut must not land before the moment the
  shot was built for.

**Look at your renders**

- Render stills and contact sheets and **look at them** (open the image files) before calling anything done. Review
  your own images critically: what's wrong with this frame?
- The agent that builds a scene views its images itself. Don't hand frames to another agent or tool to describe: a
  summary drops exactly the details that matter (a line that floats, a word that's early, a colour that's off). The
  lead reviews by opening the images too, not by reading a builder's report of them.
- Use `--only <plate>` for fast, isolated renders; `sheet --cuts` for seams; `perf` for speed.

**Working in parallel**

- One subagent per plate. Each owns `scenes/<plate>.ts` and its own `scenes/<plate>-*.ts` helpers, and nothing else:
  file sets never overlap.
- The lead owns the shared files: `timeline.ts`, `video.js`, the shared scene modules (in the example `_look.ts` and
  `_cast.ts`) and the engine. A builder who needs a change there reports it instead of editing.
- Never overwrite a user's song, lyrics or plan files.

**Long jobs**

- Agent shells time out. Run long renders detached and poll a log:
  `setsid nohup bash tools/render_final.sh <slug> > render.log 2>&1 < /dev/null &`, then `tail render.log`.
- Keep interactive renders short: a few stills, a sheet, or a clip of a few seconds. Prefer JPEG stills and delete
  superseded renders.

## Checks

From the repo root:

```bash
node tools/lyrics.mjs show --video=<slug>                  # lyrics line up with bars and sections
```

From `gl/app`:

```bash
bunx tsc --noEmit -p tsconfig.json                         # typecheck engine + scenes
bun scripts/render.ts stills --video <slug> --t 12.5,40    # it renders; then look at the files
bun scripts/render.ts sheet --video <slug> --cuts          # every seam
```

## Content

- Only publish songs you have the rights to.
- If a story resembles real life, tell it the way the lyrics do: no real people's names, organisations, logos or
  likenesses, and nothing the video claims or "admits". Leave the conclusion to the viewer.
