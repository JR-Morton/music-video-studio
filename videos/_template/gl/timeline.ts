// The edit: which plate plays when. One plate per section of video.js (sections reach the engine through
// data/audio.json, built by gl/analysis/studio_data.py). A plate is scenes/<section id>.ts (default export extends
// Scene); until that file exists the section plays the `slate` placeholder (section, bar.beat, the lyric wiping word by
// word), which is already enough to check sync on the real song.
//
// Anchor boundaries to lyric lines (ly.get) and the beat grid (au), never hard-coded seconds. Sections start on
// downbeats, so the default hard cuts land on the beat; move a cut when a sung line runs past its section's downbeat
// (see move() below and the example in videos/end-of-the-decade/gl/timeline.ts).
import type { TimelineEntry } from '@engine/engine';
import type { SceneClass } from '@engine/scene';
import type { Lyrics } from '@engine/lyrics';
import type { AudioData } from '@engine/audio';

/** The song, served from ./audio/ (the preview player plays it; render.ts muxes it). */
export const AUDIO = 'audio/song.wav';

const modules = import.meta.glob<{ default: SceneClass }>('./scenes/*.ts');
const scene = (name: string) => () => {
  const m = modules[`./scenes/${name}.ts`];
  return m ? m() : Promise.reject(new Error(`scene module not found: scenes/${name}.ts`));
};

export function makeTimeline(ly: Lyrics, au: AudioData): TimelineEntry[] {
  const E = (id: string, file: string, start: number, end: number, extra: Partial<TimelineEntry> = {}): TimelineEntry =>
    ({ id, load: scene(file), start, end, ...extra });
  // ?sheet=<scene> (render.ts --sheet): only that scene, across the whole duration (model sheets, look tests)
  const sheet = new URLSearchParams(location.search).get('sheet');
  if (sheet) return [E(sheet, sheet, 0, au.duration, { params: { sheet: true } })];

  const have = (f: string) => !!modules[`./scenes/${f}.ts`];
  const entries = au.sections.map((s) =>
    E(s.name, have(s.name) ? s.name : 'slate', s.start, s.end, { params: { label: (s as any).label ?? s.name, section: s.name } }));

  // Move the cut between plates a and b to time t, e.g. onto the first word of the next line:
  //   move('verse1', 'pre1', ly.get('first words of the line').words[0]!.start);
  const move = (a: string, b: string, t: number) => {
    const ea = entries.find((e) => e.id === a)!, eb = entries.find((e) => e.id === b)!;
    ea.end = t; eb.start = t;
  };
  void move; void ly;
  return entries;
}
