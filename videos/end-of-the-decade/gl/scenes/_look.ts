// Shared look for "End of the Decade": section grades (the colour arc), the karaoke renderer (every lyric word casts
// a shadow from the plate's stage light), the backing-vocal echo, the thread, and the two motion rules
// (marionettes yank on the beat, robots tick on their own clock). Read LOOK.md first. Owned by the lead: plates
// import from here and don't edit it (ask the lead via your final report if you need a change).
import type { PostOverrides } from '@engine/scene';
import { Lyrics, type Line } from '@engine/lyrics';
import type { AudioData } from '@engine/audio';
import { rgba } from '@engine/palette';
import { F, font, layout } from '@engine/type';
import { clamp, ease, hash, lerp } from '@engine/util';

// ------------------------------------------------------------------ grades (post presets per section)

/** Post presets for the colour arc. Spread one into your render()'s return value and override as needed. */
export const GRADE: Record<string, PostOverrides> = {
  // verse 1: a clean white test lab, soft lilac fill
  lab: { shadowTint: [0.93, 0.92, 1.1], highlightTint: [1.0, 1.0, 1.0], saturation: 1.0, bloom: 0.45, vignette: 0.2 },
  // pre 1: the too-neat daytime town under lilac cloud
  candy: { shadowTint: [1.02, 0.9, 1.15], highlightTint: [1.03, 1.0, 1.0], saturation: 1.1, bloom: 0.5, vignette: 0.22 },
  // chorus 1: stage night, one hard yellow spotlight, the indigo shadow
  spot: { shadowTint: [0.85, 0.8, 1.2], highlightTint: [1.05, 1.02, 0.94], saturation: 1.12, bloom: 0.6, rays: 0.55, vignette: 0.38 },
  // hook: dusk into night
  dusk: { shadowTint: [0.88, 0.82, 1.18], highlightTint: [1.08, 0.98, 0.9], saturation: 1.08, bloom: 0.55, vignette: 0.32 },
  // verse 2: the string-sun, flashbulbs, hot
  flash: { shadowTint: [1.0, 0.9, 1.05], highlightTint: [1.08, 1.02, 0.9], saturation: 1.15, bloom: 0.65, vignette: 0.25 },
  // pre 2: candy afternoon, the shadow growing
  afternoon: { shadowTint: [0.95, 0.86, 1.12], highlightTint: [1.06, 1.0, 0.94], saturation: 1.05, bloom: 0.5, vignette: 0.3 },
  // verse 3: above the clouds, navy and brass
  gallery: { shadowTint: [0.8, 0.86, 1.25], highlightTint: [1.1, 1.0, 0.82], saturation: 1.0, bloom: 0.6, rays: 0.35, vignette: 0.42 },
  // final chorus, stripped: cold blue-grey, strings lit silver
  cold: { shadowTint: [0.85, 0.95, 1.18], highlightTint: [0.95, 1.0, 1.08], saturation: 0.7, bloom: 0.55, vignette: 0.4 },
  // final chorus, full: garish brass money light
  money: { shadowTint: [0.95, 0.85, 0.9], highlightTint: [1.15, 1.0, 0.72], saturation: 1.2, bloom: 0.75, rays: 0.4, vignette: 0.35 },
  // ending: real dawn (the only natural warm light in the film)
  dawn: { shadowTint: [1.0, 0.9, 1.0], highlightTint: [1.12, 0.98, 0.86], saturation: 1.05, bloom: 0.7, rays: 0.6, vignette: 0.25 },
};

// ------------------------------------------------------------------ motion rules

/**
 * Marionette beat-lift: jerked up on every beat (fast), falling back under gravity. Returns 0..1 (1 = top of the yank).
 * `amount` scales it; use the audio's beat grid so it follows the song. Offbeats get a smaller tug when `offbeats`.
 */
export function yank(au: AudioData, t: number, offbeats = false): number {
  const b = au.beatAt(t);
  const ph = b - Math.floor(b);
  const len = au.timeOfBeat(Math.floor(b) + 1) - au.timeOfBeat(Math.floor(b));
  const s = ph * len; // seconds since the beat
  const up = 0.055; // rise time
  let y = s < up ? ease.outCubic(s / up) : Math.max(0, 1 - Math.pow((s - up) / (len * 0.85), 2)); // gravity parabola
  if (offbeats && ph > 0.5) y = Math.max(y, 0.35 * (1 - Math.pow(((ph - 0.5) * len) / (len * 0.4), 2)));
  return clamp(y, 0, 1);
}

/**
 * Clockwork: robots move on their own tick, NOT the song's grid. Returns a stepped phase: holds, then snaps to the next
 * step over `snap` of the tick. rate in ticks/s (use odd values like 6.7 or 9.3), seed desynchronises robots.
 */
export function clockwork(t: number, rate = 7.3, seed = 0, snap = 0.35): number {
  const x = t * rate + hash(seed * 17.13) * 3;
  const i = Math.floor(x), f = x - i;
  return i + ease.outCubic(clamp(f / snap, 0, 1));
}

// ------------------------------------------------------------------ karaoke (Canvas2D)

export interface LyricOpts {
  x: number; y: number; // anchor (left or centre of the first row's baseline)
  size: number; // px
  weight?: number; // Unbounded weight (default 700)
  family?: string; // override family (default F.display(weight))
  align?: 'left' | 'center';
  maxWidth?: number; // wrap width (default 1920 - 2 * 120)
  leading?: number; // row step as a multiple of size (default 1.12)
  upper?: boolean; // uppercase (default false)
  tracking?: number; // px
  sung?: string; // palette key for sung (default 'signal')
  done?: string; // palette key once the word is fully sung (default 'bone')
  unsungAlpha?: number; // default 0.3
  base?: string; // palette key of unsung (default 'bone')
  anticipate?: number; // show the line this many seconds before its first word (default 0.35)
  linger?: number; // keep it this many seconds after its last word (default 0.5)
  pop?: number; // onset pop scale (default 0.06)
  /** The stage light in px (the shadow falls away from it). null = no shadow. */
  light?: { x: number; y: number } | null;
  /** Shadow length in px at 1000 px from the light (grows with distance). 0 = none. The fear dial: grow it in fear beats. */
  shadow?: number;
  shadowAlpha?: number; // default 0.55
  alpha?: number; // overall opacity
}

interface Placed { w: string; x: number; y: number; width: number; word: Line['words'][number] }

/** Word positions for a line (wrapped, kerned). */
export function placeLine(line: Line, o: LyricOpts): Placed[] {
  const fam = o.family ?? F.display(o.weight ?? 700);
  const maxW = o.maxWidth ?? 1920 - 240;
  const tr = o.tracking ?? 0;
  const txt = (w: string) => (o.upper ? w.toUpperCase() : w);
  const space = layout(' ', fam, o.size, tr).width;
  const rows: { words: { w: string; width: number; word: Line['words'][number] }[]; width: number }[] = [{ words: [], width: 0 }];
  for (const word of line.words) {
    const w = txt(word.w);
    const width = layout(w, fam, o.size, tr).width;
    let row = rows[rows.length - 1]!;
    if (row.words.length && row.width + space + width > maxW) { row = { words: [], width: 0 }; rows.push(row); }
    row.width += (row.words.length ? space : 0) + width;
    row.words.push({ w, width, word });
  }
  const out: Placed[] = [];
  const lead = (o.leading ?? 1.12) * o.size;
  rows.forEach((row, ri) => {
    let x = o.align === 'center' ? o.x - row.width / 2 : o.x;
    for (const it of row.words) { out.push({ w: it.w, x, y: o.y + ri * lead, width: it.width, word: it.word }); x += it.width + space; }
  });
  return out;
}

/**
 * Draw a lyric line with karaoke timing: unsung words dim, the sung part wipes in signal yellow, a small pop on each
 * word's onset, and a cast shadow from the plate's light. Returns the placed words (for anything that follows them).
 */
export function drawLyric(c: CanvasRenderingContext2D, line: Line, t: number, o: LyricOpts): Placed[] {
  const antic = o.anticipate ?? 0.35, linger = o.linger ?? 0.5;
  if (t < line.start - antic || t > line.end + linger) return [];
  const fam = o.family ?? F.display(o.weight ?? 700);
  const placed = placeLine(line, o);
  const fadeIn = clamp((t - (line.start - antic)) / Math.max(0.05, antic), 0, 1);
  const fadeOut = 1 - clamp((t - line.end) / Math.max(0.05, linger), 0, 1);
  const A = (o.alpha ?? 1) * fadeIn * fadeOut;
  if (A <= 0.001) return placed;
  c.save();
  c.textBaseline = 'alphabetic';
  c.font = font(fam, o.size);
  if (o.tracking) (c as any).letterSpacing = `${o.tracking}px`;
  // shadows first (all words), then the words
  if (o.light && (o.shadow ?? 0) > 0) {
    for (const p of placed) {
      const cx = p.x + p.width / 2, cy = p.y - o.size * 0.35;
      const dx = cx - o.light.x, dy = cy - o.light.y;
      const dist = Math.hypot(dx, dy) || 1;
      const L = (o.shadow ?? 0) * (dist / 1000);
      const ux = dx / dist, uy = dy / dist;
      const N = 14;
      const sa = (o.shadowAlpha ?? 0.55) * A;
      for (let k = N; k >= 1; k--) {
        const f = k / N;
        c.fillStyle = rgba('shadow', (sa / N) * 2.2 * (1 - f * 0.6));
        c.fillText(p.w, p.x + ux * L * f, p.y + uy * L * f);
      }
    }
  }
  for (const p of placed) {
    const pr = Lyrics.wordProgress(p.word, t);
    const since = t - p.word.start;
    const pop = since > 0 && since < 0.22 ? (o.pop ?? 0.06) * Math.sin((since / 0.22) * Math.PI) : 0;
    c.save();
    // the onset pop is a small lift plus a hint of scale: a full scale-up would eat the word spaces on either side
    const cx = p.x + p.width / 2, cy = p.y;
    const sc = 1 + Math.min(pop, 0.1) * 0.25;
    c.translate(cx, cy - pop * o.size * 0.6); c.scale(sc, sc); c.translate(-cx, -cy);
    c.fillStyle = rgba(o.base ?? 'bone', (o.unsungAlpha ?? 0.3) * A);
    if (pr < 1) c.fillText(p.w, p.x, p.y);
    if (pr > 0) {
      c.save();
      c.beginPath(); c.rect(p.x - 4, p.y - o.size * 1.2, (p.width + 8) * pr, o.size * 1.6); c.clip();
      c.fillStyle = rgba(pr < 1 ? (o.sung ?? 'signal') : (o.done ?? 'bone'), A);
      c.fillText(p.w, p.x, p.y);
      c.restore();
    }
    c.restore();
  }
  c.restore();
  return placed;
}

/**
 * The backing-vocal echo ("The end of the decade"): Martian Mono caps, lilac, repeated in trailing copies that fall
 * back and fade like an echo. Draws nothing unless a backing line is sounding (or just ended) at t.
 */
export function drawEcho(c: CanvasRenderingContext2D, ly: Lyrics, t: number, o: { x: number; y: number; size?: number; align?: 'left' | 'center'; copies?: number; dy?: number; color?: string; alpha?: number }) {
  const line = ly.lines.find((l) => l.backing && t >= l.start - 0.2 && t < l.end + 0.8);
  if (!line) return;
  const size = o.size ?? 30, copies = o.copies ?? 4, dy = o.dy ?? size * 1.25;
  for (let k = copies - 1; k >= 0; k--) {
    const tk = t - k * 0.32; // each copy is the same line, delayed
    if (tk < line.start - 0.2) continue;
    const a = (o.alpha ?? 1) * Math.pow(0.5, k) * (1 - clamp((t - line.end) / 0.8, 0, 1));
    drawLyric(c, line, tk, { x: o.x, y: o.y + k * dy, size, family: F.mono(500, 112.5), align: o.align ?? 'center', upper: true, tracking: size * 0.18,
      sung: o.color ?? 'lilac', done: o.color ?? 'lilac', base: o.color ?? 'lilac', unsungAlpha: 0.25, anticipate: 0.2, linger: 0.8, pop: 0, alpha: a });
  }
}

// ------------------------------------------------------------------ the thread (Canvas2D)

/**
 * The thread: one pale hairline that runs through every plate doing ordinary jobs (it draws the box, it's the crack,
 * the reply thread, the wire...). NEVER the subject before verse 3. A slight catenary sag and a breath of sway.
 */
export function drawThread(c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, t: number, o: { sag?: number; sway?: number; alpha?: number; width?: number; color?: string; seed?: number } = {}) {
  const sag = o.sag ?? 0, sway = (o.sway ?? 3) * Math.sin(t * 1.3 + (o.seed ?? 0) * 2.1);
  c.save();
  c.strokeStyle = rgba(o.color ?? 'bone', o.alpha ?? 0.55);
  c.lineWidth = o.width ?? 1.2;
  c.lineCap = 'round';
  c.beginPath();
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const x = lerp(x0, x1, f) + Math.sin(f * Math.PI) * sway;
    const y = lerp(y0, y1, f) + Math.sin(f * Math.PI) * sag;
    if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
  }
  c.stroke();
  c.restore();
}
