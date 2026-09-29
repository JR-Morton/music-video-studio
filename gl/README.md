# gl/: the music-video engine

A code-rendered, deterministic three.js engine. Every frame is a pure function of song time, so the browser preview
and the offline 1080p60 / 4K60 export match frame for frame. Scenes ("plates") are TypeScript and GLSL; the offline
renderer drives the app in headless Chrome and pipes frames to ffmpeg.

The GL engine began as a port of an MIT-licensed open-source music-video engine, and parts of the tooling are adapted
from another MIT-licensed project; see [NOTICE.md](../NOTICE.md).

**Before writing a scene, read [docs/ENGINE.md](docs/ENGINE.md)**: the scene API, the rules, the toolbox, 4K output and
motion blur.

## Layout

- `app/`: the engine and its tools (TypeScript + three.js, bun + Vite).
  - `src/engine/`: renderer core (`engine.ts`, `gl.ts`, `scene.ts`), post-processing (`post.ts`), type (`type.ts`,
    `stroke.ts`), GPU lines (`lines.ts`), lyrics and audio data (`lyrics.ts`, `audio.ts`), palette, GLSL helpers.
  - `src/main.ts`: the preview player and the export API that the renderer drives.
  - `scripts/render.ts`: the offline renderer (stills, contact sheets, perf, video).
  - `public/fonts/`: the fonts. The TTF families are SIL OFL (sources and licences in `public/fonts/src/`); the
    single-stroke SVG fonts are in `public/fonts/stroke/`.
- `analysis/studio_data.py`: builds a video's engine data from the studio's checked data (below).
- `analysis/make_fonts_studio.py`: makes the static font instances in `app/public/fonts/` from the variable sources.
- `docs/ENGINE.md`: the guide for scene authors.

The engine holds no video content. Each video keeps its own in `videos/<slug>/gl/`:

```
timeline.ts        the edit: which plate plays when (exports makeTimeline and AUDIO)
scenes/*.ts        one Scene per plate, plus shared modules; import the engine as '@engine/...'
data/audio.json    beats, downbeats, sections, envelopes, onsets  } built by analysis/studio_data.py
data/lyrics.json   word-timed lyrics                               }
audio/song.wav     the song
TREATMENT.md       the plan: one row per plate
LOOK.md            the style bible
out/               renders (not committed)
```

Vite picks the video with `VIDEO=<slug>` (`render.ts` with `--video <slug>`); the default is `end-of-the-decade`. It
serves the video's `audio/` and `data/`, and resolves `@video` to `videos/<slug>/gl` and `@engine` to
`app/src/engine`.

## Commands

Data for a video (from the repo root):

```sh
uv run gl/analysis/studio_data.py --video=<slug> --stems=videos/<slug>/stems/htdemucs_ft [--pad-to=SECONDS]
```

Everything else from `gl/app/`, after `bun install`:

```sh
VIDEO=<slug> bunx vite                                          # preview: http://localhost:5173 (?t=40 to start at 40 s)
bun scripts/render.ts stills --video <slug> --t 12.5,40         # stills → videos/<slug>/gl/out/stills/, then LOOK at them
bun scripts/render.ts sheet  --video <slug> --from 20 --to 35 --n 12 --cols 4   # contact sheet → out/sheets/
bun scripts/render.ts perf   --video <slug> --from 20 --to 25   # ms per frame
bun scripts/render.ts video  --video <slug> --from 20 --to 25 --samples 1 --out clip.mp4   # a quick clip
bun scripts/render.ts gpu    --video <slug>                     # which GPU renderer headless Chrome got
bunx tsc --noEmit -p tsconfig.json                              # typecheck engine + every video's scenes
```

For the final render use `bash tools/render_final.sh <slug>` from the repo root (segments, resumable; see
[docs/PIPELINE.md](../docs/PIPELINE.md)).

`render.ts` options:

| option | |
|---|---|
| `--video <slug>` | which video (or `VIDEO=<slug>`) |
| `--only a,b` | load only these timeline entries (fast; everything else is black) |
| `--sheet <scene>` | play one scene file across the whole duration (model sheets, look tests) |
| `--out <dir or file>` | where to write |
| `--scale 2` | true 3840×2160 (stills are then full-resolution PNGs) |
| `--samples N` / `--samples auto` | sub-frames per frame for motion blur and anti-aliasing (default 1) |
| `--shutter S` | the shutter as a fraction of the frame time (default 0.5) |
| `--notype` | leave every 2D layer empty: clean plates for thumbnails and Shorts |
| `--png` | PNG stills instead of JPEG |
| `--from`, `--to`, `--fps`, `--crf`, `--preset`, `--noaudio` | video mode |
| `--times a,b,c`, `--cuts` | sheet mode: explicit times, or 4 frames around every cut |
| `--url <url>` | use a running Vite server instead of starting a private one |

`render.ts` starts its own Vite server without live reload, so saving a file mid-render doesn't reload the page. It
prints `SCENE ERRORS` and browser errors: read them.

## Linux notes

- **GPU.** Headless WebGL renders on the GPU only through ANGLE on NVIDIA's EGL driver. `render.ts` passes
  `--use-gl=angle --use-angle=gl-egl` and sets `__EGL_VENDOR_LIBRARY_FILENAMES` to
  `/usr/share/glvnd/egl_vendor.d/10_nvidia.json` when that file exists. Headless Vulkan loses the WebGL context
  (white frames), and default headless falls back to SwiftShader (software, about 60× slower). Check with
  `bun scripts/render.ts gpu`: it should name your NVIDIA card.
- **Chrome.** The renderer uses the installed Google Chrome (playwright-core, channel `chrome`), not a downloaded
  Chromium.
- **macOS.** `render.ts` asks for ANGLE on Metal there. It's untested.
- **Agent shells time out** (often at a few minutes): run long renders with
  `setsid nohup <command> > log 2>&1 < /dev/null &` and poll the log.
