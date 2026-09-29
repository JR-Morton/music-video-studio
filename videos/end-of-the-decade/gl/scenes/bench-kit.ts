// Shared kit for the `bench` and `sides` plates (owned by the bench/sides builder): a TS camera that mirrors the
// shader camera (so Canvas2D overlays can sit on 3D points), GLSL helpers (camera ray, screen-space hairline strings,
// custom-material shading on top of _cast.ts's stageShade), and a "composing" karaoke (words type in as they come).
import { Lyrics, type Line, type Word } from '@engine/lyrics';
import { rgba } from '@engine/palette';
import { F, font } from '@engine/type';
import { clamp } from '@engine/util';
import { placeLine, drawLyric, type LyricOpts } from './_look';

export type V3 = [number, number, number];
export interface Cam { ro: V3; ta: V3; focal: number; roll?: number }

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const mix3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Project a world point to screen px (1920x1080 logical, y down). Mirrors camRay() in GLSL_KIT. */
export function project(cam: Cam, p: V3): { x: number; y: number; z: number } {
  const fw = norm(sub(cam.ta, cam.ro));
  let rt = norm(cross(fw, [0, 1, 0]));
  let up = cross(rt, fw);
  const r = cam.roll ?? 0;
  if (r) { const c = Math.cos(r), s = Math.sin(r); const rt2: V3 = [rt[0] * c + up[0] * s, rt[1] * c + up[1] * s, rt[2] * c + up[2] * s]; up = cross(rt2, fw); rt = rt2; }
  const d = sub(p, cam.ro);
  const z = dot(d, fw);
  const ux = (dot(d, rt) / z) * cam.focal, uy = (dot(d, up) / z) * cam.focal;
  return { x: 960 + ux * 1080, y: 540 - uy * 1080, z };
}

export function setCam(u: Record<string, { value: any }>, cam: Cam) {
  (u.ro!.value as number[]).splice(0, 3, ...cam.ro);
  (u.ta!.value as number[]).splice(0, 3, ...cam.ta);
  u.focal!.value = cam.focal;
  u.roll!.value = cam.roll ?? 0;
}
export const camUniforms = () => ({ ro: { value: [0, 1, 5] }, ta: { value: [0, 1, 0] }, focal: { value: 1.6 }, roll: { value: 0 } });

/**
 * GLSL: camera ray + hairline strings. Include after GLSL_CAST_SDF. Needs `uniform vec3 ro, ta; uniform float focal, roll;`
 * declared by the kit (it declares them).
 */
export const GLSL_KIT = /* glsl */ `
uniform vec3 ro, ta; uniform float focal, roll;
uniform vec2 rtRes;
vec3 camRay(vec2 uv, out vec3 fw) {
  fw = normalize(ta - ro);
  vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(rt, fw);
  float c = cos(roll), s = sin(roll);
  vec3 rt2 = rt * c + up * s; up = cross(rt2, fw); rt = rt2;
  return normalize(fw * focal + rt * uv.x + up * uv.y);
}
// Coverage of a hairline segment a-b seen along the ray (occluded beyond tHit when tHit > 0). pix = world size of one
// pixel at distance 1. Returns (coverage, height of the closest point).
vec2 hairline(vec3 ro, vec3 rd, vec3 a, vec3 b, float tHit, float pix, float radius) {
  vec3 ba = b - a, oa = ro - a;
  float d1 = dot(rd, ba), baba = dot(ba, ba), rdoa = dot(rd, oa), baoa = dot(ba, oa);
  float den = max(baba - d1 * d1, 1e-6);
  float s = clamp((baoa - d1 * rdoa) / den, 0.0, 1.0);
  float t = max(d1 * s - rdoa, 0.0);
  if (tHit > 0.0 && t > tHit) return vec2(0.0);
  vec3 q = a + ba * s;
  float d = length(oa + rd * t - ba * s);
  float pw = pix * t;
  float r = pw * 0.6; // a constant ~1 px hairline, fainter when the real string is thinner than a pixel
  float cov = (1.0 - smoothstep(r - pw * 0.5, r + pw * 0.5, d)) * clamp(radius / pw * 1.5 + 0.3, 0.0, 1.0);
  return vec2(cov, q.y);
}
`;

/**
 * GLSL: shading that extends stageShade with scene materials (ids >= 20). The scene must define, BEFORE including this:
 *   void sceneMaterial(float id, float v, vec3 p, inout vec3 alb, inout float metal, inout float rough, inout vec3 emit);
 * Include after GLSL_CAST_SHADE.
 */
export const GLSL_KIT_SHADE = /* glsl */ `
void matOf(float m, vec3 p, out vec3 alb, out float metal, out float rough, out vec3 emit) {
  alb = vec3(0.5); emit = vec3(0.0); metal = 0.0; rough = 0.5;
  if (m < 19.5) { vec4 c = castMaterial(m, p, rough, emit); alb = c.rgb; metal = c.a; return; }
  float id = floor(m + 0.001), v = floor((m - id) * 10.0 + 0.5);
  sceneMaterial(id, v, p, alb, metal, rough, emit);
}
// A hard shadow for small, close lights (castShadow's penumbra estimate bands badly at grazing angles): a crisp,
// graphic silhouette, softened only by a thin edge term.
float kShadow(vec3 ro, vec3 rd, float tmax, float k) {
  float t = 0.02, res = 1.0;
  for (int i = 0; i < 80; i++) {
    float h = map(ro + rd * t).x;
    if (h < 0.0015) return 0.0;
    if (t > 0.3) res = min(res, k * h / t);
    t += h;
    if (t > tmax) break;
  }
  return smoothstep(0.0, 1.0, res);
}
vec3 kShade(vec3 p, vec3 n, vec3 rd, float m, StageLight key, StageLight fill, StageLight rim, float envAmt, vec3 envLo, vec3 envHi) {
  if (m < 19.5) return stageShade(p, n, rd, m, key, fill, rim);
  vec3 alb, emit; float metal, rough;
  matOf(m, p, alb, metal, rough, emit);
  float ao = castAO(p, n);
  vec3 c = cs_light(key, p, n, rd, alb, metal, rough, true);
  c += cs_light(fill, p, n, rd, alb, metal, rough, false) * ao;
  c += cs_light(rim, p, n, rd, alb, metal, rough, false) * 0.8;
  vec3 r = reflect(rd, n);
  vec3 env = mix(envLo, envHi, smoothstep(-0.2, 0.8, r.y));
  float fres = pow(1.0 - max(dot(n, -rd), 0.0), 4.0) * (1.0 - rough);
  c += env * envAmt * ao * (mix(alb * 0.35, alb, metal) + fres * 0.6);
  return c + emit;
}
`;

// ------------------------------------------------------------------ composing karaoke

export function pseudoLine(words: Word[], i = -1): Line {
  return { i, text: words.map((w) => w.w).join(' '), start: words[0]!.start, end: words[words.length - 1]!.end, words };
}

/**
 * Karaoke where the words compose in (a post being typed): each word appears (dim) `lead` s before its start, then wipes
 * in `sung`, then settles to `done`. Same rules as drawLyric (never highlighted before its start, done by its end).
 */
export function drawComposing(c: CanvasRenderingContext2D, line: Line, t: number, o: LyricOpts & { lead?: number; hideAfter?: number }) {
  const lead = o.lead ?? 0.3;
  const fam = o.family ?? F.display(o.weight ?? 700);
  const placed = placeLine(line, o);
  const A = o.alpha ?? 1;
  if (A <= 0.001) return placed;
  c.save();
  c.textBaseline = 'alphabetic';
  c.font = font(fam, o.size);
  if (o.tracking) (c as any).letterSpacing = `${o.tracking}px`;
  const vis = (p: (typeof placed)[number]) => clamp((t - (p.word.start - lead)) / 0.12, 0, 1);
  if (o.light && (o.shadow ?? 0) > 0) {
    for (const p of placed) {
      const a0 = vis(p); if (a0 <= 0) continue;
      const cx = p.x + p.width / 2, cy = p.y - o.size * 0.35;
      const dx = cx - o.light.x, dy = cy - o.light.y, dist = Math.hypot(dx, dy) || 1;
      const L = (o.shadow ?? 0) * (dist / 1000), ux = dx / dist, uy = dy / dist, N = 10;
      const sa = (o.shadowAlpha ?? 0.55) * A * a0;
      for (let k = N; k >= 1; k--) {
        const f = k / N;
        c.fillStyle = rgba('shadow', (sa / N) * 2.2 * (1 - f * 0.6));
        c.fillText(p.w, p.x + ux * L * f, p.y + uy * L * f);
      }
    }
  }
  for (const p of placed) {
    const a0 = vis(p); if (a0 <= 0) continue;
    const pr = Lyrics.wordProgress(p.word, t);
    const since = t - p.word.start;
    const pop = since > 0 && since < 0.22 ? (o.pop ?? 0.06) * Math.sin((since / 0.22) * Math.PI) : 0;
    const rise = (1 - a0) * o.size * 0.15;
    c.save();
    const cx = p.x + p.width / 2, cy = p.y - o.size * 0.35;
    c.translate(cx, cy + rise); c.scale(1 + pop, 1 + pop); c.translate(-cx, -cy);
    c.fillStyle = rgba(o.base ?? 'bone', (o.unsungAlpha ?? 0.3) * A * a0);
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

/** Rounded-rect path. */
export function rrect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
}

/**
 * drawLyric with a smoother long shadow: the shared drawLyric steps its shadow in 14 copies, which reads as a ladder
 * of ghost glyphs when the fear dial makes it long. Same karaoke rules (the words themselves are drawn by drawLyric).
 */
export function drawLyricS(c: CanvasRenderingContext2D, line: Line, t: number, o: LyricOpts) {
  const antic = o.anticipate ?? 0.35, linger = o.linger ?? 0.5;
  if (t < line.start - antic || t > line.end + linger) return [];
  if (o.light && (o.shadow ?? 0) > 0) {
    const fam = o.family ?? F.display(o.weight ?? 700);
    const placed = placeLine(line, o);
    const fadeIn = clamp((t - (line.start - antic)) / Math.max(0.05, antic), 0, 1);
    const fadeOut = 1 - clamp((t - line.end) / Math.max(0.05, linger), 0, 1);
    const A = (o.alpha ?? 1) * fadeIn * fadeOut;
    c.save();
    c.textBaseline = 'alphabetic';
    c.font = font(fam, o.size);
    if (o.tracking) (c as any).letterSpacing = `${o.tracking}px`;
    for (const p of placed) {
      const cx = p.x + p.width / 2, cy = p.y - o.size * 0.35;
      const dx = cx - o.light.x, dy = cy - o.light.y, dist = Math.hypot(dx, dy) || 1;
      const L = (o.shadow ?? 0) * (dist / 1000), ux = dx / dist, uy = dy / dist;
      const N = Math.round(clamp(L / 4, 10, 56));
      const sa = (o.shadowAlpha ?? 0.55) * A;
      for (let k = N; k >= 1; k--) {
        const f = k / N;
        c.fillStyle = rgba('shadow', (sa / N) * 2.6 * (1 - f * 0.7));
        c.fillText(p.w, p.x + ux * L * f, p.y + uy * L * f);
      }
    }
    c.restore();
  }
  return drawLyric(c, line, t, { ...o, shadow: 0 });
}
