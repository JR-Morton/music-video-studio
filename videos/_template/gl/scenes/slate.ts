// Placeholder plate: section name, bar.beat, and the current lyric line highlighted word by word.
// Used to check sync on the real song before the plates are built. Not part of the look.
import { Scene, type Frame } from '@engine/scene';
import { FSPass, Layer2D, W, H } from '@engine/gl';
import { rgba } from '@engine/palette';
import { F, font, layout } from '@engine/type';
import { Lyrics } from '@engine/lyrics';

export default class Slate extends Scene {
  bg = new FSPass(`uniform float k; void main(){ fragColor = vec4(C_INK + vec3(0.02, 0.012, 0.004) * k, 1.0); }`, { k: { value: 0 } });
  text = new Layer2D();
  render(f: Frame, out: any) {
    const { renderer, comp, lyrics, params } = this.ctx as any;
    this.bg.u.k!.value = f.a.kick;
    this.bg.render(renderer, out);
    const c = this.text.ctx; this.text.clear();
    c.textBaseline = 'alphabetic';
    c.font = font(F.mono(500), 18); c.fillStyle = rgba('ash', 1);
    c.fillText(`${String(params.label).toUpperCase()}   BAR ${Math.floor(f.bar)}.${Math.floor(f.beat % 4) + 1}   ${f.t.toFixed(2)} s`, 96, 110);
    // beat ticks: 4 squares, the current beat lit
    for (let i = 0; i < 4; i++) { c.fillStyle = rgba(i === Math.floor(f.beat % 4) ? 'signal' : 'graphite', 1); c.fillRect(96 + i * 22, 130, 14, 14); }
    const l = lyrics.lineAt(f.t) ?? lyrics.lastLine(f.t);
    if (l && f.t < l.end + 1.2) {
      const size = 64, fam = F.display(700);
      const lines: string[][] = [[]]; let wsum = 0;
      for (const w of l.words) { const ww = layout(w.w + ' ', fam, size).width; if (wsum + ww > W - 192) { lines.push([]); wsum = 0; } lines[lines.length - 1]!.push(w.w); wsum += ww; }
      let gi = 0, y = H / 2 - (lines.length - 1) * size * 0.6;
      for (const ln of lines) {
        let x = 96;
        for (const s of ln) {
          const w = l.words[gi++]!, p = Lyrics.wordProgress(w, f.t);
          c.font = font(fam, size);
          c.fillStyle = rgba('bone', 0.28); c.fillText(s, x, y);
          if (p > 0) { const ww = layout(s, fam, size).width; c.save(); c.beginPath(); c.rect(x, y - size, ww * p, size * 1.3); c.clip(); c.fillStyle = rgba(p < 1 ? 'signal' : 'bone', 1); c.fillText(s, x, y); c.restore(); }
          x += layout(s + ' ', fam, size).width;
        }
        y += size * 1.2;
      }
    }
    comp.draw(renderer, this.text.upload(), out);
    return { bloom: 0.4 };
  }
}
