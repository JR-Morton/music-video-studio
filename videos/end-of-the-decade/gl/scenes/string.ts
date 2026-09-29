// `string` (verse 3, 106.47–123.46): the reveal. The thread, alone in the stop bar, is taken hold of; the band returns
// and every string in the town lights up; the camera climbs ours through the cloud into a night gallery where
// cuffed hands work the crosses and pass brass cheques; the front row of voices on the same hands; referees get
// badges on lanyards (strings); two cuffed hands shake; a vault door closes quietly, its light narrowing to a
// hairline, and the lock clicks.
import * as THREE from 'three';
import { Scene, type Frame } from '@engine/scene';
import { FSPass, Layer2D, makeRT } from '@engine/gl';
import { aaPass } from './_aa';
import { clamp, ease, lerp } from '@engine/util';
import type { Line } from '@engine/lyrics';
import { GRADE, yank } from './_look';
import { drawSplitLyric } from './string-type';
import { SHOT_A, SHOT_B, SHOT_C1, SHOT_C2, SHOT_D1, SHOT_D2, SHOT_E } from './string-glsl';

type V3 = [number, number, number];
const inOutSine = (u: number) => 0.5 - 0.5 * Math.cos(Math.PI * u);
const RS = 1.0; // 3D shots render at full resolution (supersampled across the sub-frames, see _aa.ts)
const prog = (x: number, a: number, b: number, e: (u: number) => number = (u) => u) => e(clamp((x - a) / (b - a), 0, 1));
const mix3 = (a: V3, b: V3, u: number): V3 => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];

/** Project a world point to logical screen px (y down) for a look-at camera. */
function project(ro: V3, ta: V3, fl: number, p: V3): { x: number; y: number } {
  const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = (a: V3): V3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const fw = norm(sub(ta, ro)), rt = norm(cross(fw, [0, 1, 0])), up = cross(rt, fw);
  const d = sub(p, ro); const z = Math.max(1e-3, dot(d, fw));
  const u = (dot(d, rt) / z) * fl, v = (dot(d, up) / z) * fl;
  return { x: 960 + u * 1080, y: 540 - v * 1080 };
}

function pass3D(frag: string, extra: Record<string, THREE.IUniform> = {}) {
  return aaPass(frag, {
    t: { value: 0 }, fl: { value: 1.5 }, roll: { value: 0 }, pxA: { value: 0.001 }, yk: { value: 0 },
    ro: { value: new THREE.Vector3() }, ta: { value: new THREE.Vector3() }, ...extra,
  });
}

export default class StringPlate extends Scene {
  rt = makeRT(Math.round(1920 * RS), Math.round(1080 * RS));
  text = new Layer2D();
  A = aaPass(SHOT_A, Object.fromEntries(['t', 'cx', 'w0', 'sway', 'twA', 'twS', 'slide', 'glintY', 'glintA', 'bgx', 'lightUp', 'pinch', 'pinchY'].map((k) => [k, { value: 0 }])));
  B = aaPass(SHOT_B, { t: { value: 0 }, fl: { value: 1.4 }, roll: { value: 0 }, pxA: { value: 0.001 }, litR: { value: 0 }, cloudB: { value: 12 }, mist: { value: 0 },
    ro: { value: new THREE.Vector3() }, ta: { value: new THREE.Vector3() } });
  C1 = pass3D(SHOT_C1, { chq0: { value: new THREE.Vector4() }, chq1: { value: new THREE.Vector4() }, chq2: { value: new THREE.Vector4() }, mist: { value: 0 } });
  C2 = pass3D(SHOT_C2);
  D1 = pass3D(SHOT_D1, { bdg: { value: [0, 1, 2, 3, 4].map(() => new THREE.Vector4()) } });
  D2 = pass3D(SHOT_D2, { gc: { value: new THREE.Vector3() }, gOff: { value: 0 }, grip: { value: 0 } });
  E = pass3D(SHOT_E, { theta: { value: 1.2 }, vaultOn: { value: 1 }, wheel: { value: 0 }, slitA: { value: 0 },
    gA: { value: new THREE.Vector2() }, gB: { value: new THREE.Vector2() }, fA: { value: new THREE.Vector2() }, fB: { value: new THREE.Vector2() } });

  L1!: Line; L2!: Line; L3!: Line; L4!: Line;
  db: number[] = [];

  override async init() {
    const ly = this.ctx.lyrics;
    this.L1 = ly.get('took hold of a string')!;
    this.L2 = ly.get('checks that built')!;
    this.L3 = ly.get('referees wear')!;
    this.L4 = ly.get('closes quietly')!;
    const { start, end } = this.ctx;
    // the bar grid starts on the downbeat at (or up to a quarter bar before) the cut: the cut sits on "So I took
    // hold", sung just after the bar-50 downbeat, and the shots are laid out bar by bar from that downbeat
    this.db = this.ctx.audio.downbeats.filter((x) => x >= start - 0.5 && x < end - 0.05);
    while (this.db.length < 9) this.db.push(this.db[this.db.length - 1]! + 2.124);
    // compile every shot's shader now (no hitch at the cuts)
    for (const p of [this.A, this.B, this.C1, this.C2, this.D1, this.D2, this.E]) p.render(this.ctx.renderer, this.rt);
  }

  word(l: Line, w: string, nth = 0) {
    const m = l.words.filter((x) => x.w.toLowerCase().replace(/[^a-z']/g, '') === w);
    return m[nth] ?? l.words[0]!;
  }

  cam(p: FSPass, t: number, ro: V3, ta: V3, fl: number) {
    p.u.t!.value = t;
    (p.u.ro!.value as THREE.Vector3).set(...ro);
    (p.u.ta!.value as THREE.Vector3).set(...ta);
    p.u.fl!.value = fl;
    p.u.pxA!.value = 1 / (fl * this.rt.height);
    if (p.u.yk) p.u.yk.value = yank(this.ctx.audio, t);
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp, audio } = this.ctx;
    const t = f.t, db = this.db;
    const post: Record<string, unknown> = { ...GRADE.gallery };
    let light = { x: 300, y: -300 };
    let shotIs3D = true;
    let pass: FSPass;

    if (t < db[1]!) {
      // ---------------------------------------------------------------- A: the stop bar. The thread, alone; taken.
      shotIs3D = false;
      pass = this.A;
      const tg = this.word(this.L1, 'string').start;
      const u = pass.u;
      const s = prog(t, db[0]!, tg, inOutSine);
      const g = Math.max(0, t - tg);
      const gripped = t >= tg;
      const cxPre = lerp(1360, 1215, s) + 10 * Math.sin(t * 1.1);
      u.t!.value = t;
      u.cx!.value = gripped ? lerp(cxPre, 1180, prog(g, 0, 0.07, ease.outCubic)) : cxPre;
      u.w0!.value = lerp(20, 34, s) + (gripped ? 16 * prog(g, 0, 0.12, ease.outCubic) + 8 * prog(g, 0.12, 0.6, ease.inOutQuad) : 0);
      u.pinch!.value = gripped ? prog(g, 0, 0.08, ease.outCubic) : 0;
      u.pinchY!.value = 470;
      u.sway!.value = gripped ? 0 : 18 * (1 - 0.3 * s);
      u.twA!.value = gripped ? 9 : 0;
      u.twS!.value = g;
      u.slide!.value = gripped ? 110 * prog(g, 0, 0.1, ease.outCubic) : t * 6;
      u.glintY!.value = 470 + g * 1900;
      u.glintA!.value = gripped ? 1 : 0;
      u.bgx!.value = -s * 160 - g * 90;
      u.lightUp!.value = gripped ? 0.35 + 0.9 * Math.exp(-g * 4) : 0;
      pass.render(renderer, out);
      post.rays = 0.25; post.raysAt = [0.2, 1.3];
      post.bloom = 0.65;
      post.exposure = lerp(0.85, 1, s);
      if (gripped) post.shake = [0, 5 * Math.exp(-g * 18) * Math.sin(g * 90)];
      light = { x: 250, y: -250 };
    } else if (t < db[2]!) {
      // ---------------------------------------------------------------- B: the band returns; every string lights; climb
      pass = this.B;
      const s = t - db[1]!, D = db[2]! - db[1]!;
      // looking straight up our string: every string in the town converges on the gap in the cloud
      const u1 = prog(s, 0, 0.5, ease.outCubic);
      const u2 = prog(s, 0.35, D, (x) => ease.inOutCubic(x) * 0.85 + x * 0.15);
      const ro: V3 = [lerp(-0.55, -0.3, u1), lerp(1.2, 12.6, u2) + 0.6 * u1, lerp(0.9, 0.35, u1)];
      const ta: V3 = [ro[0] + 0.1, ro[1] + 6, ro[2] - lerp(6.5, 0.45, prog(s, 0.2, D, ease.inOutCubic))];
      const fl = lerp(0.85, 1.0, u1);
      pass.u.roll!.value = 0.35 * ease.inOutCubic(prog(s, 0.3, D));
      pass.u.t!.value = t;
      (pass.u.ro!.value as THREE.Vector3).set(...ro);
      (pass.u.ta!.value as THREE.Vector3).set(...ta);
      pass.u.fl!.value = fl;
      pass.u.pxA!.value = 1 / (fl * this.rt.height);
      pass.u.litR!.value = 1.2 + Math.pow(Math.max(0, s - 0.05), 1.4) * 26;
      pass.u.mist!.value = prog(s, D - 0.35, D, ease.inQuad) * 0.6;
      post.rays = 0.2; post.raysAt = [0.5, 1.2];
      post.bloom = 0.75;
      
      light = { x: 960, y: -500 };
    } else if (t < db[3]!) {
      // ---------------------------------------------------------------- C1: the gallery of hands; cheques hand to hand
      pass = this.C1;
      const s = t - db[2]!, D = db[3]! - db[2]!;
      const u1 = prog(s, 0, 1.15, ease.outCubic);
      const u2 = prog(s, 0.9, D, inOutSine);
      const ro: V3 = [lerp(-0.5, -0.2, u1) + 0.45 * u2, lerp(-0.3, 1.36, u1), lerp(1.9, 1.35, u1)];
      const ta: V3 = [lerp(-0.1, 0.1, u1) + 0.45 * u2, lerp(1.1, 1.46, u1), 0];
      this.cam(pass, t, ro, ta, 1.55);
      pass.u.mist!.value = 1 - prog(s, 0, 0.6, ease.outQuad);
      const yk = yank(audio, t);
      const b = audio.beatAt(t);
      const b0 = Math.round(audio.beatAt(this.word(this.L2, 'checks').start));
      const hop = Math.max(0, b - b0);
      const chq = [pass.u.chq0!, pass.u.chq1!, pass.u.chq2!];
      [-1, -3, -5].forEach((base, k) => {
        const fi = Math.floor(hop), fr = hop - fi;
        const e = ease.inOutCubic(clamp(fr / 0.55, 0, 1));
        const qi = base + fi + e;
        const inFlight = Math.sin(Math.PI * e);
        const zOf = (i: number) => 0.03 * Math.sin(i * 2.3);
        const z = lerp(zOf(Math.floor(qi)), zOf(Math.floor(qi) + 1), qi - Math.floor(qi));
        const lift = yk * 0.05;
        (chq[k]!.value as THREE.Vector4).set(qi * 0.8, 1.5 + lift - 0.196 - 0.07 * inFlight, z + 0.042 + 0.16 * inFlight, e * Math.PI * 2 * (fi % 2 === 0 ? 1 : -1));
      });
      post.rays = 0.2; post.raysAt = [0.75, 1.15];
      light = { x: 1500, y: -350 };
    } else if (t < db[4]!) {
      // ---------------------------------------------------------------- C2: the front row, strings up to the same hands
      pass = this.C2;
      const s = t - db[3]!, D = db[4]! - db[3]!;
      const u = prog(s, 0, D, inOutSine);
      const push = prog(t, this.word(this.L2, 'front').start - 0.1, this.word(this.L2, 'front').start + 0.35, ease.outCubic);
      const ro: V3 = [lerp(-0.9, 0.35, u), lerp(1.2, 1.25, u), lerp(3.75, 3.4, u) - 0.35 * push];
      const ta: V3 = [lerp(-0.45, 0.45, u), 1.85, 0];
      this.cam(pass, t, ro, ta, 1.05);
      post.rays = 0.18; post.raysAt = [0.6, 1.2];
      light = project(ro, ta, 1.05, [0.8, 5.5, 5.0]);
    } else if (t < db[5]!) {
      // ---------------------------------------------------------------- D1: the referees wear badges
      pass = this.D1;
      const s = t - db[4]!, D = db[5]! - db[4]!;
      const u = prog(s, 0, D, inOutSine);
      const ro: V3 = [lerp(0.3, 0.0, u), lerp(1.3, 1.42, u), lerp(3.5, 2.9, u)];
      const ta: V3 = [lerp(0.1, 0.0, u), 1.45, 0];
      this.cam(pass, t, ro, ta, 1.25);
      const yk = yank(audio, t);
      const land = this.word(this.L3, 'badges').start;
      const bd = pass.u.bdg!.value as THREE.Vector4[];
      const bp = audio.timeOfBeat(Math.round(audio.beatAt(land)) + 1) - audio.timeOfBeat(Math.round(audio.beatAt(land)));
      [-2, -1, 0, 1, 2].forEach((i, k) => {
        const tl = land + [-bp, -bp * 0.5, 0, bp * 0.5, bp][k]!;
        const dn = prog(t, tl - 0.75, tl, ease.inCubic);
        const after = Math.max(0, t - tl);
        const bounce = after > 0 ? 0.018 * Math.exp(-after * 7) * Math.sin(after * 26) : 0;
        const zf = -0.2 * Math.abs(i);
        const y = lerp(2.08, 1.3 + yk * 0.04, dn) + bounce + (dn < 1 ? 0.01 * Math.sin(t * 5 + k) : 0);
        const z = lerp(0.1, 0.14, dn) + zf;
        const sw = (1 - dn) * 0.25 * Math.sin(t * 3.1 + k * 2) + (after > 0 ? 0.3 * Math.exp(-after * 5) * Math.sin(after * 14) : 0);
        bd[k]!.set(i * 0.78, y, z, sw);
      });
      post.rays = 0.18; post.raysAt = [0.3, 1.2];
      light = project(ro, ta, 1.25, [-1.2, 4.8, 3.2]);
    } else if (t < db[6]!) {
      // ---------------------------------------------------------------- D2: the rivals all agree; two hands shake
      pass = this.D2;
      const s = t - db[5]!, D = db[6]! - db[5]!;
      const agree = this.word(this.L3, 'agree').start;
      const inn = prog(t, db[5]!, agree, (x) => ease.inOutCubic(x) * 0.8 + x * 0.2);
      const pump = t > agree ? yank(audio, t) * 0.028 : 0;
      const ro: V3 = [0.0, lerp(0.2, 0.16, prog(s, 0, D)), lerp(0.88, 0.7, prog(s, 0, D, inOutSine))];
      const ta: V3 = [0, 0, 0];
      this.cam(pass, t, ro, ta, 1.5);
      // both hands hang off one grip centre (the pump moves them together); they slide in open, in their own
      // planes either side of the contact plane, and close round each other as they arrive
      (pass.u.gc!.value as THREE.Vector3).set(0, 0.03 - pump, 0);
      pass.u.gOff!.value = lerp(0.42, 0, inn);
      pass.u.grip!.value = prog(t, agree - 0.06, agree + 0.2, ease.inOutCubic);
      post.rays = 0.2; post.raysAt = [0.4, 1.2];
      if (t > agree) post.shake = [0, 3 * Math.exp(-(t - agree) * 14)];
      light = { x: 700, y: -300 };
    } else {
      // ---------------------------------------------------------------- E: a door that closes quietly; hairline; click
      pass = this.E;
      const s = t - db[6]!, D = this.ctx.end - db[6]!;
      const click = this.word(this.L4, 'me').start;
      const u = prog(s, 0, D, inOutSine);
      const ro: V3 = [lerp(1.1, 0.85, u), lerp(0.72, 0.62, u), lerp(5.0, 4.3, u)];
      const ta: V3 = [lerp(-1.35, -1.25, u), 1.5, 0];
      this.cam(pass, t, ro, ta, 1.15);
      const close = prog(t, this.word(this.L4, 'closes').start, db[7]!, inOutSine);
      const theta = lerp(1.25, 0, close);
      pass.u.theta!.value = theta;
      const vOn = 1 - prog(t, click, click + 0.06);
      pass.u.slitA!.value = vOn * (1 - prog(theta, 0.0, 0.12));
      const toUV = (q: { x: number; y: number }) => new THREE.Vector2((q.x - 960) / 1080, (540 - q.y) / 1080);
      (pass.u.gA!.value as THREE.Vector2).copy(toUV(project(ro, ta, 1.15, [0.658, 2.21, 0])));
      (pass.u.gB!.value as THREE.Vector2).copy(toUV(project(ro, ta, 1.15, [0.658, 0.0, 0])));
      (pass.u.fA!.value as THREE.Vector2).copy(toUV(project(ro, ta, 1.15, [0.658, 0.0, 0])));
      (pass.u.fB!.value as THREE.Vector2).copy(toUV(project(ro, ta, 1.15, [0.658 + 1.2, 0.0, 2.4])));
      pass.u.vaultOn!.value = 1 - prog(t, click, click + 0.06);
      pass.u.wheel!.value = prog(t, click - 0.14, click, ease.outCubic) * (Math.PI / 3);
      const gap = project(ro, ta, 1.15, [0.66, 1.1, 0]);
      post.rays = (0.12 + 0.3 * prog(theta, 0.05, 0.4)) * (1 - prog(t, click, click + 0.06));
      post.raysAt = [gap.x / 1920, 1 - gap.y / 1080];
      if (t > click) post.shake = [2.5 * Math.exp(-(t - click) * 25) * Math.sin((t - click) * 120), 0];
      light = gap;
      post.fade = prog(t, this.ctx.end - 0.25, this.ctx.end) * 0.0;
    }

    if (shotIs3D) {
      pass.render(renderer, this.rt);
      comp.draw(renderer, this.rt.texture, out, { mode: 'replace' });
    }

    // ------------------------------------------------------------------ the lyric
    const c = this.text.ctx; this.text.clear();
    const common = { weight: 700, light, shadowAlpha: 0.6 } as const;
    drawSplitLyric(c, this.L1, t, { ...common, x: 150, y: 520, size: 84, maxWidth: 800, split: this.L1.words.findIndex((w) => w.w === 'and'), gap: 34,
      shadow: 170, from: this.L1.start - 0.45, to: db[2]! + 0.02, fadeOut: 0.25 });
    drawSplitLyric(c, this.L2, t, { ...common, x: 140, y: 300, size: 64, maxWidth: 1660, split: this.L2.words.findIndex((w) => w.w === 'fund'), gap: 4,
      shadow: 120, from: this.L2.start - 0.4, to: db[4]! + 0.02, fadeOut: 0.2 });
    drawSplitLyric(c, this.L3, t, { ...common, x: 140, y: 872, size: 66, maxWidth: 1660, split: this.L3.words.findIndex((w) => w.w === 'and'), gap: 4,
      shadow: 130, from: Math.max(this.L3.start - 0.4, db[4]! - 0.25), to: this.L3.end + 0.5 });
    drawSplitLyric(c, this.L4, t, { ...common, x: 140, y: 200, size: 66, maxWidth: 1660, split: this.L4.words.findIndex((w, i) => i > 0 && w.w.toLowerCase() === 'on'), gap: 4,
      shadow: 200, from: this.L4.start - 0.4, to: this.ctx.end - 0.05, fadeOut: 0.6 });
    comp.draw(renderer, this.text.upload(), out);
    return post;
  }
}
