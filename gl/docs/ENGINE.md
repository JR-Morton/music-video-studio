# Engine guide (for scene authors)

The video is a web app (`gl/app/`, TypeScript + three.js, run with bun + Vite) that renders any song time `t`
deterministically at 1920×1080 (or at 2× that, 3840×2160, with `?scale=2`; see "Output scale"). The same code drives
the live preview and the offline 60 fps export.

A video's content lives in `videos/<slug>/gl/`: `timeline.ts` (the edit), `scenes/*.ts` (the plates), `data/`
(`audio.json`, `lyrics.json`) and `audio/song.wav`. Scenes import the engine as `@engine/...` (for example
`@engine/scene`, `@engine/gl`). All commands below run from `gl/app/`.

## Running things

- Dev server: `VIDEO=<slug> bunx vite`. Preview: http://localhost:5173/?t=23.0 (space = play/pause, ←/→ = ±1 s,
  shift = ±5 s, `,`/`.` = ±1 frame, `[`/`]` = previous/next timeline entry, `l` = loop the current entry, `h` = hide
  the UI; click the frame to play/pause). Saving a scene file reloads just that scene.
- Stills (the main way to check your work: then LOOK at the images):
  `bun scripts/render.ts stills --video <slug> --t 12.5,13.0,14.2 --only open --out ../../videos/<slug>/gl/out/wip/open`
- Contact sheet of a time range:
  `bun scripts/render.ts sheet --video <slug> --from 1.5 --to 9 --n 16 --cols 4 --only open --out ../../videos/<slug>/gl/out/wip/open/sheet.jpg`.
  `--cuts` instead of a range gives 4 frames around every cut.
- Short clip (to judge motion; extract frames with ffmpeg and look at them):
  `bun scripts/render.ts video --video <slug> --from 20 --to 25 --only hook --samples 1 --preset veryfast --out ../../videos/<slug>/gl/out/wip/hook.mp4`
- Speed: `bun scripts/render.ts perf --video <slug> --from 20 --to 25 --only hook` (ms per frame, including the
  export's pixel readback).
- `--only a,b` loads only those timeline entries (fast, and isolates you from other people's broken scenes). Outside
  them nothing renders (black), so the entry must exist in the video's `timeline.ts`.
- `--sheet <scene>` plays one scene file (`scenes/<scene>.ts`) across the whole duration, with `ctx.params.sheet` set:
  for model sheets and look tests that aren't in the edit.
- Typecheck just your files: `bunx tsc --noEmit -p tsconfig.json 2>&1 | grep scenes/yourscene`.
- The render script prints `SCENE ERRORS` and browser console errors: read them.
- 4K: add `--scale 2` to any mode (`stills` then saves full-resolution 3840×2160 PNGs). Check your scene at both
  scales: downscaled, the 4K frame should look like the 1080p one, only sharper.
- `render.ts` starts a private Vite server without live reload, so files saved mid-render don't reload the page. To
  reuse a server, run one without live reload (`STUDIO_NO_HMR=1 VIDEO=<slug> bunx vite --port 5190`) and pass
  `--url http://localhost:5190`.

## Data

- `lyrics` (`@engine/lyrics`): `lines[]` with `text, start, end, words[], backing?`; each word
  `{ w, start, end, syl? }` (word-level, aligned to the vocal; `syl` holds syllable times when the aligner produced
  them). Find lines by content, never hard-code times: `const l = this.ctx.lyrics.get('park bench')` →
  `l.words[3].start`. `lineAt(t)`, `lastLine`, `nextLine`, `wordAt(t)` and `lastWord` skip backing lines;
  `backingAt(t)` finds them. Also `linesIn(t0, t1)`, `find(s)`, `findWords('decade')`, and the helpers
  `Lyrics.wordProgress(word, t)` (0..1 sung progress) and `Lyrics.lineCharProgress(line, t)` (characters sung so far,
  for per-glyph wipes).
- `audio` (`@engine/audio`): `beats[]`, `downbeats[]`, `sections[]` (`name` is the section id from `video.js`),
  `beatAt(t)` (continuous beat index), `barAt(t)`, `timeOfBeat(i)`, `nearestBeat(t)`, `section(t)`,
  `events('kick'|'snare'|'hat'|'vocal', t0, t1)`, `env(name, t)` and `envPeak(name, t)` for
  `rms|low|mid|high|vocal|drums|bass|other` (0..1), `hit(kind, t, halfLife)` decaying pulses.
- Every `Frame` already carries `f.a` = `{rms, low, mid, high, vocal, drums, bass, other, kick, snare, hat, vonset}`
  and `f.beat, f.bar, f.beatPhase, f.barPhase`.

## Writing a scene

One file `videos/<slug>/gl/scenes/<name>.ts`, default-exporting a class extending `Scene` (`@engine/scene`):

```ts
import * as THREE from 'three';
import { Scene, type Frame } from '@engine/scene';
import { FSPass, Layer2D } from '@engine/gl';
import { rgba } from '@engine/palette';

export default class MyScene extends Scene {
  bg = new FSPass(`uniform float t; void main(){ fragColor = vec4(C_INK, 1.0); }`, { t: { value: 0 } });
  text = new Layer2D();
  async init() { /* build meshes, precompute text outlines, etc. */ }
  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp, lyrics } = this.ctx;
    this.bg.u.t!.value = f.t;
    this.bg.render(renderer, out);                 // fullscreen shader → out (overwrites)
    const c = this.text.ctx; this.text.clear();    // draw with Canvas2D, e.g. c.fillStyle = rgba('signal')
    comp.draw(renderer, this.text.upload(), out);  // alpha-over onto out
    return { bloom: 0.7 };                         // post overrides (optional)
  }
}
```

The video's `timeline.ts` decides when it plays (`makeTimeline(lyrics, audio)` returns the entries: `id`, the module
to load, `start`, `end`, optional `params`, `post` and `maxSamples`).

Rules:

- **Deterministic**: output must be a pure function of `f.t` (and seeded randomness: `mulberry32(seed)`, `hash(...)`).
  Never use `Math.random()`, `Date.now()` or `performance.now()` for visuals. The export averages many sub-frames per
  frame, in any order (see "Motion blur and sampling"). If you need simulation state (particles, feedback buffers),
  set `stateful = true`, reset in `reset()`, integrate with `f.dt`, and the engine will fast-forward after seeks; such
  a scene can only be exported with a fixed `--samples`.
- `render()` must fully overwrite `out` (a HalfFloat linear-HDR target). Colours are **linear**; values above about
  0.85 bloom. Use palette constants (`C_INK`, `C_BONE`, `C_SIGNAL`… in GLSL; `LIN.signal` in TS for GL;
  `rgba('signal', a)` for Canvas2D).
- `ctx.params` holds the timeline entry's params (one module can serve several entries); `ctx.start`/`ctx.end` its
  window; `f.lt`/`f.p` local time and 0..1 progress.
- Transitions: by default the engine crossfades overlapping entries. For a custom transition set
  `handlesTransition = true` and composite `f.under` (the previous scene's frame) yourself using `f.tin` (0→1 over
  the overlap; `f.tout` is the same for the next one). Most cuts should be hard cuts on downbeats (no overlap): that's
  the default when windows touch.
- Post overrides you can return (`PostParams` in `@engine/post`, defaults in `DEFAULT_POST`): `exposure, bloom,
  bloomThreshold, bloomKnee, bloomRadius, rays, raysAt, raysLength, streak, shadowTint, highlightTint, saturation,
  halation, ca, grain, vignette, hud, fade, flash, shake:[x,y], zoom, invert`. A timeline entry's `post` sets
  defaults for that entry; the scene's own overrides win.
- The HUD layer (`hud.ts`) is empty: every plate stages its own type.
- Performance: aim for under about 25 to 30 ms per frame at 1080p for one sample. Canvas2D layers cost about 2 to 4 ms
  each to upload: don't use more than 2 or 3 per scene. Precompute in `init()`.
- Don't edit files outside your scene files (and your own helpers named `scenes/<name>-*.ts`). Shared scene modules
  (`scenes/_*.ts`), `timeline.ts` and the engine belong to the lead: report in your final message what you'd need.

## Toolbox

- `gl.ts`: `FSPass(frag, uniforms)` fullscreen GLSL3 pass (has `vUv`, writes `fragColor`, gets `GLSL_COMMON`);
  the `Compositor`, via `this.ctx.comp.draw(renderer, tex, target, { mode: 'normal'|'add'|'screen'|'multiply'|'max'|'replace', opacity, tint, scale, offset })`;
  `Layer2D` (1920×1080 logical Canvas2D → sRGB texture); `makeRT()` (screen-sized HDR target; `makeRT(w, h)` takes
  logical px); `clearRT(renderer, rt, [r, g, b])`; `W`/`H` (logical size), `SCALE`/`PW`/`PH` (output scale and physical
  size); `SS_TAP`/`SS_TAP_GLSL` (supersampling, below).
- `glsl/common.ts` (`GLSL_COMMON`, prepended to every FSPass; import it into your own ShaderMaterials): palette
  constants (`C_INK`, `C_INK2`, `C_GRAPHITE`, `C_ASH`, `C_BONE`, `C_SIGNAL`, `C_EMBER`, `C_BLOOD`, `C_LILAC`,
  `C_BRASS`, `C_DAWN`, `C_SHADOW`), `hash*`, `snoise(vec2|vec3)`, `fbm`, `curl2`, 2D/3D SDFs (`sdCircle`, `sdBox`,
  `sdSegment`, `sdSphere`, `sdBox3`, `sdCapsule`, `sdTorus`), `smin`/`smax`, `rot2`, `aaFill`, `aaStroke`, `pxLine`,
  `rampLine`, `hatch(u, darkness)` and `engrave(uv, darkness, freq, angle)` shading, `heat(x)` ramp, `luma`,
  `toSRGB`/`toLinear`, `FRAG_PX`, `PX_SCALE`.
- `palette.ts`: `HEX` (the video palette by role: `ink`, `ink2`, `graphite`, `ash`, `bone`, `signal`, `ember`,
  `blood`, `lilac`, `brass`, `dawn`, `shadow`), `LIN` (linear RGB), `rgba(key, a)`.
- `lines.ts`: `LineBatch(capacity, { screen2D, worldWidth, blend })`: GPU capsule segments, in 2D pixels (y down) or 3D
  with a camera. `seg2`, `seg`, `polyline`, `render(renderer, out, camera?)`. Colours are linear and can exceed 1 for
  glow. Good for 10k to 200k segments.
- `type.ts`: fonts (all SIL OFL). `F.display(weight)` Unbounded (300/500/700/900), `F.mono(weight, width)` Martian
  Mono (weights 300/500/800, widths 75/100/112.5), `F.serif(italic)` Instrument Serif. `font(family, px)` → CSS font
  string. `layout(text, family, size, tracking)` → per-glyph x/advance with the font's kerning (draw glyph i at
  `glyphs[i].x`). `glyphX(text, i, family, size)` → where to start drawing `text[i..]` when a word is drawn in pieces
  (sung/unsung colours, wipes); never offset a piece by `measure(text.slice(0, i))`, which drops the kern between the
  pieces. `fitSize`, `measure`, `textPath2D` (opentype outline as Path2D), `textPathCommands`,
  `textPoints(text, family, size, step)` (points filling the glyphs). `smart(s)` / `plain(s)`: typewriter quotes →
  typographic (’ “ ” …) and back. To add a family, drop its OFL sources in `public/fonts/src` and extend
  `analysis/make_fonts_studio.py` and `type.ts`.
- `stroke.ts`: single-stroke plotter fonts (`script`, `hscript`, `sans`, `readable`, `tech`, `serif`, `osmotron`,
  `felix`): `strokeText(text, font, size, tracking, kern)`, `drawStrokeText(ctx2d, st, lengthPx)` → returns the pen
  head position, `writtenLength(st, charTimes, t)` to sync writing to word timings. The fonts have no kerning tables:
  pairs that leave a hole (To, Yo, We, AV, LT…) are kerned optically from the glyph shapes (off for the connected
  scripts).
- `util.ts`: `clamp, lerp, invLerp, remap, smoothstep, smootherstep, ease.*, prog(x, a, b, ease),
  keys(t, [[t, v, ease], ...]), springStep, pulse, mulberry32, hash, noise1/2/3, fbm1/2, frameIdx, polylineLengths,
  pointAtLength, window01, hexToLinear`.

## Typography

- Proportional text gets the font's kerning: whole strings through Canvas2D get it for free; glyph-by-glyph drawing
  must use `layout()` / `glyphX()`. Adjacent runs in different fonts or sizes have no kerning between them: set that
  gap by eye.
- Lyrics come with typographic punctuation (`don’t`, `’cause`, `“Just`): `Word.w` and `Line.text` go through `smart()`;
  `lyrics.get()` matches straight or curly quotes. Hard-coded display strings use ’ “ ” … – — × − too. Mono text can
  keep typewriter quotes (`plain()` for a lyric shown as typed input).
- No outlined or haloed type.

## Output scale (4K)

`?scale=2` (render.ts `--scale 2`) renders a true 3840×2160 frame. Scenes keep laying out in logical 1920×1080 px
(`W`, `H`, `ctx.W`, `ctx.H` never change); the engine handles the rest:

- Render targets: `out`, the engine's targets and `makeRT()` are physical (`PW`×`PH`). `makeRT(w, h)` takes logical px
  and allocates `w*SCALE`×`h*SCALE`; pass `{ pxScale: 1 }` for a data-sized target whose resolution must not follow the
  output.
- `Layer2D`: the backing canvas is `SCALE`× larger and its context is pre-scaled, so drawing code works in logical px.
  `setTransform`/`resetTransform`/`getTransform`, `shadowBlur`, `shadowOffsetX/Y` and `filter` px lengths are patched
  to stay logical. Not patched: `canvas.width/height` and `getImageData`/`putImageData` are physical px, and
  `drawImage(layer.canvas, x, y)` needs an explicit size. `new Layer2D(w, h, 1)` makes a deliberately low-res layer
  (e.g. a soft glow). `scaleContext2D(ctx, SCALE)` applies the same patch to your own canvas.
- `LineBatch`: coordinates and widths stay logical; the AA feather and the hairline floor work in physical px, so
  hairlines stay crisp.
- GLSL (`GLSL_COMMON`): `gl_FragCoord`, `fwidth` and `dFdx` are physical. Use `FRAG_PX` (the fragment position in
  logical px) instead of `gl_FragCoord.xy` whenever it is combined with logical sizes, and `PX_SCALE` to convert. A line
  whose width comes from `fwidth` ("a 1.2 px hairline": `1.0 - smoothstep(a, b, d / fwidth(u))`) gets thinner and
  fainter at 4K: write it as `pxLine(d, a, b)`, which is identical at 1× and keeps the 1× ink with sharper edges at 4K
  (`rampLine` does the same for the linear-ramp idiom). `hatch`, `engrave` and `aaStroke` already do this. LOD
  thresholds and supersampling offsets expressed in pixels should be logical (`fwidth(u) * PX_SCALE`, offsets
  `/ PX_SCALE`).
- Offscreen canvases used as textures (atlases, text planes) keep their own size: make them `SCALE`× larger (with
  `ctx.scale(SCALE, SCALE)`) if they are shown large, or they look soft at 4K.
- Post (bloom, rays, grade, vignette) scales automatically; the bloom pyramid stays at the logical resolution.

## Motion blur and sampling

The export renders every frame as the average of several sub-frames spread over the shutter (`--shutter 0.3`: 30 % of
the frame time, centred on the frame's time), before post-processing. `--samples N` takes N evenly spaced sub-frames;
`--samples auto` chooses the count per frame (`Engine.render`, `AdaptiveSampling`). The final render uses a fixed
`--samples 8 --shutter 0.3` (`tools/render_final.sh`).

Adaptive sampling:

- The count steps through 4, 12, 36, 108, 324. Each step adds a sub-frame either side of every existing one, so each
  set is evenly spread and centred on the frame's time.
- After each step the engine compares the new sub-frames' average with the old ones' (displayed values, worst
  2×2-logical-px block). Stepped copies of a moving edge differ between the two sets; a converged streak or a still
  image does not. It stops when the estimated remaining error is below `--tol` (default 3 levels of 255).
  `--min-samples` and `--max-samples` bound it, and a timeline entry's `maxSamples` caps it while that entry is on
  screen.
- In practice a still frame stops at 12, ordinary camera motion at 36, and whips, slams and fast zooms at 108 or 324.

What this asks of scenes:

- Sub-frames are rendered out of time order and in any number: a scene's output must depend on `f.t` only. `stateful`
  scenes can't be sampled adaptively (the engine refuses); nothing may count `render()` calls.
- Per-frame flicker and jitter keyed to 60 fps must use `frameIdx(t)` (`util.ts`), not `Math.floor(t * 60)`.
  `frameIdx` is constant over the frame's shutter; `floor` switches at the frame's own time and double-exposes two
  states in every frame.
- Noise that changes with continuous `t` (a hash seeded by time) is resampled in every sub-frame: it averages out, but
  slowly, and makes the adaptive sampler work harder. Seed it with `frameIdx(t)` unless it is meant to smooth out.
- Particles whose emission rate varies over time must compute each particle from its birth time, not from the
  current `t`, or every particle is re-timed from one sub-frame to the next.
- Shaders that supersample internally (4 rotated-grid taps) take `ssTap: SS_TAP` and `${SS_TAP_GLSL}` and loop
  `for (int k = ssK0(); k < ssK1(); k++) ... rgss(k)`, weighting by `ssWeight()`. The engine then hands each sub-frame
  one tap, cycling them (use a sample count that is a multiple of 4), which averages to the same image for a quarter
  of the cost. In the preview and single-sample stills they take all four. The template's `scenes/_aa.ts` wraps this
  for full-screen passes.
- Post parameters (shake, flash, zoom, fades) are read at one point of the shutter, 1/8 of it after the frame's time;
  grain and dither are drawn once per frame.
