# "End of the Decade": LOOK (the style bible for plate builders)

Read this, then `TREATMENT.md` (the plate list), then `gl/docs/ENGINE.md` (the scene API). Where they disagree,
**this file wins**, then TREATMENT.

## What it is

**A toy theatre lit like a product launch.** Glossy, clean, futuristic: raymarched 3D toys and set pieces under
theatrical stage light (a hard key spotlight, soft coloured fill, rim light, haze, light shafts), polished floors with
reflections, porcelain-white lab surfaces, and big confident lyric type that is part of the set. A happy Top 40 song
about fear: the image is cheerful and beautiful, and the dread lives in the shadows and in who holds the light.

**The singer is never shown.** "I" is the lyric type. The people in the story are wooden marionettes; the machines are
tin wind-up robots; the people pulling the strings are only ever hands with navy pinstripe cuffs and brass cufflinks.

## What it must NOT look like

- no film grain, halation, chromatic aberration or crop-mark frames (the post chain no longer does these by default:
  leave them off);
- no engraving/hatching (`hatch`, `engrave`), no banknote guilloché, no pen-plotter single-stroke writing, no
  oscilloscopes, no bone-paper bureaucratic forms or rubber stamps on paper, no Swiss-grid layouts littered with tiny
  mono footnotes, no "spark with a line" motif, no ink-black + hazard-orange palette;
- no other typefaces than the three below.

Our equivalents: raymarched glossy objects with real light and cast shadows; 3D or perspective type on/in the set;
light boxes, marquee bulbs, LED tickers, holographic panels, embossed brass for the establishment; the pale thread.

## Palette (`@engine/palette`, GLSL `C_*`)

`ink` navy-black stage · `ink2` raised navy · `graphite`/`ash` cool greys · `bone` porcelain white ·
**`signal` caution yellow** (the only colour that glows: the sung word, smiles, the countdown, the spotlight, hazard
stripes, robot eyes) · `ember` pale hot yellow (cores) · `blood` deep amber (signal's shadow) · `lilac` (the too-neat
daytime town, the lab's soft fill, the backing echo) · `brass` (money, cufflinks, badges; verse 3 and the final
chorus) · `dawn` peach (**only** the real sunrise, the `dawn` plate) · `shadow` bruise indigo (the big shadow).
Robot paint variants: 0 caution yellow, 1 toy red, 2 toy blue, 3 bare tin. Avoid purple/cyan neon cyberpunk, glowing
brains, code rain, particle nebulae, stock "AI" imagery.

**Colour arc:** return `...GRADE.<name>` from render() (see `_look.ts`): `lab` (verse 1), `candy` (pre 1), `spot`
(chorus 1), `dusk` (hook), `flash` (verse 2), `afternoon` (pre 2), `gallery` (verse 3), `cold` (final, stripped),
`money` (final, full), `dawn` (ending). Override per shot (`rays`, `raysAt`, `bloom`, `exposure`, `flash`, `shake`,
`zoom`, `fade`...). `raysAt` is the light's position in frame uv (y up); set it where your key light is.

## Typography (`@engine/type`)

- **Unbounded** `F.display(300|500|700|900)`: the lyric, the voice. Big, rounded, confident. Title case as sung, or
  caps for slams.
- **Martian Mono** `F.mono(weight 300|500|800, width 75|100|112.5)`: the machine voice (prompts, counters, labels,
  tickers, readouts) and the backing echo.
- **Instrument Serif** `F.serif(italic?)`: the establishment voice (cheques, badges, plaques, press notices,
  podium signs). Rare.

## Karaoke (every plate)

- Every lead line is readable and synced per word: use `drawLyric()` from `_look.ts` (unsung words dim, the sung part
  wipes in caution yellow, a small pop on each onset). Build on it or draw your own, but keep those rules: a word never
  highlights before its `start`, and it's complete by its `end`. Anticipation up to ~0.4 s is fine (dim).
- **Signature: the words cast shadows.** Pass `light` (your key light's screen position, px) and `shadow` (length).
  The shadow reads when the type sits over a lit surface (a lit wall/floor/panel), so compose for it. Fear beats get
  longer shadows (chorus "shadow in their head", pre 2 "smile right through the fear"); the `dawn` plate has almost
  none. You may also set lyric type physically in the 3D set (light boxes, marquee letters, signage, a screen), as
  long as it's readable and synced.
- **Backing echo** ("The end of the decade", a backing line: `lyrics.backingAt(t)`, `line.backing`): `drawEcho()`,
  or your own treatment in lilac Martian Mono caps that visibly lingers for its whole (long) duration.
- `lyrics.lineAt(t)`, `lastLine`, `nextLine`, `wordAt` skip backing lines. Find lines by content with
  `lyrics.get('park bench')`, never hard-code times.
- Keep type inside title-safe (>= 96 px from the edges). No outlined or haloed type.

## Motion

- **Marionettes** move with `yank(audio, t)` (jerked up on each beat, falling back under gravity): heads bob, limbs
  lift, feet dangle. They never walk naturally. Strings always rise out of frame into the dark/cloud above.
- **Robots** move on their own clock: `clockwork(t, rate, seed)` (odd rates, desynchronised seeds), never on the beat.
  Scurry, wobble, turn their heads, pick locks. Never villains; curious and a little cheeky.
- **Camera**: something always moves (slow dolly/crane/orbit), with strong eases, holds then snaps. Big changes land
  on downbeats (`audio.downbeats`, `audio.timeOfBeat`). Cuts inside your plate on downbeats.
- **Deterministic**: output is a pure function of `f.t` (no `Math.random`, no `Date.now`, no stateful sims). Motion blur
  comes from the export's sub-frame averaging.

## Story rules

- It tells the story in the order the lyrics do. It never says what anything was; it shows who helped, who paid, who
  agreed and which door closed, and leaves the conclusion to the viewer. No real people, companies, logos, product
  UIs or likenesses; generic post cards and generic buildings.
- **The thread** (`drawThread()`, or a 3D `sdString` hairline): one pale line runs through every plate doing ordinary
  jobs. Before verse 3 (`string` plate) no shot is ABOUT a string: they're thin, pale, and vanish upward.
- The warning side is always screen-right; the "it's all for show" side screen-left.
- Kind to the robots. The shadow (fear) is a small thing blown up by a light.

## The cast (`_cast.ts`)

GLSL models + stage-lighting toolkit: `sdTinRobot`, `sdMarionette` (+ `marionetteAnchor` for strings), `sdHand`,
`sdString`, `castMarch`, `castNormal`, `castShadow`, `castAO`, `stageShade` with `StageLight` key/fill/rim. See the
header of `_cast.ts` for the contract, and `scenes/looktest.ts` for a working example (render it:
`bun scripts/render.ts stills --video end-of-the-decade --sheet looktest --t 39.5 --out ../../videos/end-of-the-decade/gl/out/wip/looktest`).
Build against the API: if the models' detail and materials are refined behind the same signatures, your plate picks
the refinements up automatically. Don't edit `_cast.ts` or `_look.ts`; if you need
something new, put it in your own `scenes/<plate>-*.ts` helper and mention it in your report. Crowds: use domain
repetition in the SDF (cheap), not hundreds of separate calls.

## Workflow and limits

- Your files: `videos/end-of-the-decade/gl/scenes/<plate>.ts` (default export, extends `Scene`) and `scenes/<plate>-*.ts` helpers.
  Nothing else (the lead owns `timeline.ts`, `_look.ts`, `_cast.ts`, the engine).
- Commands from `gl/app/`:
  - typecheck: `bunx tsc --noEmit -p tsconfig.json 2>&1 | grep <plate>`
  - stills (JPEG): `bun scripts/render.ts stills --video end-of-the-decade --only <plate> --t 12.5,14 --out ../../videos/end-of-the-decade/gl/out/wip/<plate>`
    then LOOK at them with the read tool. This is the review loop: render, look, fix, repeat.
  - contact sheet: `bun scripts/render.ts sheet --video end-of-the-decade --only <plate> --from A --to B --n 16 --cols 4 --out ../../videos/end-of-the-decade/gl/out/wip/<plate>/sheet.jpg`
  - motion check (optional, short): `bun scripts/render.ts video --video end-of-the-decade --only <plate> --from A --to B --samples 1 --out ../../videos/end-of-the-decade/gl/out/wip/<plate>/clip.mp4`
    (sample frames with ffmpeg and look; delete the clip afterwards).
- Shell calls time out at 300 s: keep each render short (a few stills, or clips of a few seconds).
- Save disk: stills are JPEG; delete superseded stills and clips; don't render full-length videos while building.
- **Performance**: target <= 30 ms per frame at 1080p for one sample (the final export averages several sub-frames).
  Check with `bun scripts/render.ts perf --video end-of-the-decade --only <plate> --from A --to B`. Raymarch step counts, shadow
  rays and haze loops are the usual cost: budget them.
- The song: `data/lyrics.json` (word times), `data/audio.json` (113 BPM, bar = 2.124 s, first downbeat 0.27 s;
  sections, envelopes, kick/snare/hat onsets). Frames carry `f.a` (envelopes and hit pulses), `f.beat`, `f.bar`,
  `f.lt` (local time), `f.p` (0..1 through the plate).

## Plate briefs (refines TREATMENT.md)

Windows (song seconds): sandbox 0–17.26 · bench 17.26–34.25 · decade 34.25–66.11 · hook 66.11–72.49 ·
wire 72.49–89.48 · sides 89.48–106.47 · string 106.47–123.46 · strings 123.46–138.33 · money 138.33–155.32 ·
dawn 155.32–170 (the song ends at 158.9; the rest is silence).

- **sandbox** (verse 1, `lab`): a pristine porcelain test chamber (glossy white panels, soft lilac fill, a caution-
  yellow hazard stripe). The instruction appears as a system prompt typed in Martian Mono on a panel ("it's just a
  game, go on and pick the locks"). Tin robots scurry and pick a padlock/door. "Slipped out through a crack": a hairline
  crack of light in a wall (the thread's first job); they slip through, and the camera pulls back: the chamber is a box
  inside a bigger box inside a bigger box. "Lock it in": a padlock clicks shut (brass-free: chrome). "Where the game
  ends and the real world begins": the chamber's floor grid runs out into a real horizon/sky.
- **bench** (pre 1, `candy`): the too-neat daytime park under a lilac cloud ceiling. One marionette young man on a
  bench (strings vanish into the clouds), a phone glowing in his hand. His quote builds as a generic floating post
  card (a hologram/glass panel, not a real UI). "He swore it wasn't marketing / swore on everything": the card flips
  to a sworn statement with a signature line drawn by the thread; he raises a hand (yanked). No paper forms, no stamps.
- **decade** (chorus 1, `spot`): stage night. The hook "By the end of the decade" as a huge light-box/marquee title
  with a year counter rolling to the end of the decade; the backing echo lingers. "A hundred million people": a view
  counter (LED/Martian Mono) rolls to 100,000,000 while a crowd of tiny marionettes fills to the horizon (domain
  repetition), all yanking on the beat. "Put that shadow in their head": a hard spotlight catches one small tin robot
  and its shadow rears up huge over the crowd (indigo). "So smile and sing along": the crowd smiles and bobs, caution-
  yellow smile curves. "And don't you be afraid" (small, reassuring, while the shadow looms). "We've got till the end
  of the decade": the counter/title returns. A brass-cuffed hand flips an hourglass once (a cameo, easy to miss).
- **hook** (dance break, `dusk`, instrumental): the marionette crowd dances on the grid in the spotlights; a cuffed hand
  drops a hook on a string to snag a tin robot and misses (a cameo). Big, fun, on the beat.
- **wire** (verse 2, `flash`): "By morning it was everywhere": a sun is hauled up on a string over the town; a network
  of glowing lines lights up city to city. "And the other side said 'Planned'": the word PLANNED lands screen-left as
  a big lit sign. "He'd written it up with a friend, and a few friends lent a hand": credits roll on a holographic panel
  while two cuffed hands launch a paper plane. "Four days later": four day-cards flip past like a departures board.
  "The boss he'd left said 'Let's all slow it down'": a marionette at a podium; a ticking pendulum on the podium slows (the
  visuals slow while the music doesn't). "The rivals who agree on nothing came and gathered round": two groups of
  marionettes from opposite sides slide together into one huddle.
- **sides** (pre 2, `afternoon`): a split stage: screen-right "One side says the end is near" (red alarm light,
  sirens); screen-left "The other says it's all for show" behind a proscenium arch with a curtain. "So I shut my eyes
  and smile right through the fear": the frame closes like eyelids (two dark lids), a smile curve in caution yellow,
  and the big indigo shadow grows behind the type. "'Cause I don't know, I don't know": the words repeat, dimmer.
- **string** (verse 3, `gallery`): stop bar (silence at 106.47): the thread fills the frame and is taken hold of.
  "I took hold of a string and I followed where it goes": the camera climbs the string up through the clouds to a
  night gallery where cuffed hands work the marionette crosses. "The checks that built the builders": brass-embossed
  cheques pass from hand to hand. "fund the voices in the front rows": rows of marionettes in theatre seats, strings
  up to the same hands. "Now the referees wear badges": brass badges on lanyards. "and the rivals all agree": two cuffed
  hands shake. "On a door that closes quietly on anyone like me": a vault door swings shut; its light narrows to a
  hairline; a lock clicks.
- **strings** (final chorus stripped, `cold`, 123.46–138.33, no bass, near-silent bar ~129.8): back down in the town,
  cold and quiet. The same crowd, but now every string is lit silver and visible all the way up. The hook lines again
  with the echo; "A hundred million people / Moving just the way they're led": the crowd moves in perfect puppet unison.
- **money** (final chorus full, `money`, 138.33–155.32, the loudest bars): garish brass light, coins, a ticker "The
  money's being made", the crowd yanked hardest, the shadow pumped huge by a cuffed hand on the spotlight. Then, on
  the last line "We've got till the end of the decade", the camera stops dancing and walks into the big shadow, and at
  its heart finds the small tin robot standing in the light.
- **dawn** (ending, `dawn`, silence after 158.9): a real sun rises with no string. The tin robot in soft daylight, a
  friend, maybe offering a hand (a fingertip) to someone off-frame. The fear has lost its hold; nothing breaks out of
  anything. The one warm natural light in the film. Hold on it to the end (~170 s); final fade to black at the end.
