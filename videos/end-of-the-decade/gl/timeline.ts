// "End of the Decade": the edit. Which scene plays when. Anchor boundaries to lyric lines (ly.get) and the beat
// grid (au), never hard-coded seconds. Scene modules: ./scenes/<name>.ts (default export extends Scene).
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
  // The plates, one per section (sections come from video.js via data/audio.json; they start on downbeats, so the
  // default hard cuts land on the beat). A plate whose scenes/<id>.ts doesn't exist yet plays the `slate` placeholder.
  const S = (name: string) => {
    const s = au.sections.find((x) => x.name === name);
    if (!s) throw new Error(`no section ${name}`);
    return s;
  };
  const plates: [id: string, section: string][] = [
    ['sandbox', 'verse1'], ['bench', 'pre1'], ['decade', 'chorus1'], ['hook', 'hook'], ['wire', 'verse2'],
    ['sides', 'pre2'], ['string', 'verse3'], ['strings', 'final'], ['money', 'finalfull'], ['dawn', 'ending'],
  ];
  const have = (f: string) => !!modules[`./scenes/${f}.ts`];
  const entries = plates.map(([id, sec]) => {
    const s = S(sec);
    return E(id, have(id) ? id : 'slate', s.start, s.end, { params: { label: (s as any).label ?? sec, section: sec } });
  });
  // Boundary fixes where a lyric line runs past its section's downbeat:
  //  wire -> sides: "…came and gathered round" is sung to 90.48, where "One side says" starts (60 ms before the beat).
  const move = (a: string, b: string, t: number) => {
    const ea = entries.find((e) => e.id === a)!, eb = entries.find((e) => e.id === b)!;
    ea.end = t; eb.start = t;
  };
  //  sandbox -> bench: "…the real world begins" is sung to ~18.0 (the bar 8 downbeat, 17.26, fell on "world"): cut on
  //  "On a park bench" (18.28), after it.
  move('sandbox', 'bench', ly.get('On a park bench').words[0]!.start);
  move('wire', 'sides', ly.get('One side says').words[0]!.start);
  //  sides -> string: the last "know" is sung across the bar 50 downbeat (106.47) to 106.68: cut on "So I took hold".
  move('sides', 'string', ly.get('So I took hold').words[0]!.start);
  return entries;
}
