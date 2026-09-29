// Karaoke for the `string` plate: a lyric line split into two fixed blocks (each wrapped on its own), both visible
// for the whole line (dim until sung), with the same rules as _look.ts drawLyric: unsung dim, the sung part wipes in
// caution yellow, a pop on each onset, never lit before a word's start, complete by its end; words cast shadows.
import { Lyrics, type Line } from '@engine/lyrics';
import { rgba } from '@engine/palette';
import { F, font } from '@engine/type';
import { clamp } from '@engine/util';
import { placeLine, type LyricOpts } from './_look';

export interface SplitOpts extends LyricOpts {
  /** index of the first word of the second block */
  split: number;
  /** y offset of the second block below the first block's last row (in px, added to the row step) */
  gap?: number;
  /** x of the second block (default o.x) */
  x2?: number;
  /** show window (default line.start - 0.4 .. line.end + 0.6) */
  from?: number; to?: number;
  fadeIn?: number; fadeOut?: number;
}

function sub(line: Line, a: number, b: number): Line {
  const words = line.words.slice(a, b);
  return { ...line, words, text: words.map((w) => w.w).join(' '), start: words[0]!.start, end: words[words.length - 1]!.end };
}

export function drawSplitLyric(c: CanvasRenderingContext2D, line: Line, t: number, o: SplitOpts) {
  const from = o.from ?? line.start - 0.4, to = o.to ?? line.end + 0.6;
  if (t < from || t > to) return;
  const A = (o.alpha ?? 1) * clamp((t - from) / (o.fadeIn ?? 0.3), 0, 1) * clamp((to - t) / (o.fadeOut ?? 0.4), 0, 1);
  if (A <= 0.001) return;
  const fam = o.family ?? F.display(o.weight ?? 700);
  const p1 = placeLine(sub(line, 0, o.split), o);
  const lead = (o.leading ?? 1.12) * o.size;
  const lastY = p1.length ? p1[p1.length - 1]!.y : o.y;
  const p2 = placeLine(sub(line, o.split, line.words.length), { ...o, x: o.x2 ?? o.x, y: lastY + lead + (o.gap ?? 0) });
  const placed = [...p1, ...p2];
  c.save();
  c.textBaseline = 'alphabetic';
  c.font = font(fam, o.size);
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
    const cx = p.x + p.width / 2, cy = p.y - o.size * 0.35;
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
}
