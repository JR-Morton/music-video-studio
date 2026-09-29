// sandbox: verse 1 (0.00–18.28). A pristine porcelain test chamber. The instruction is typed as a system prompt on a
// hanging screen; tin robots pick the padlock; two slip out through a hairline crack of light (the thread's first
// job); the camera pulls back: the chamber is a box inside a bigger box inside a bigger box; "lock it in": a crate
// lid slams and a chrome padlock clicks (and a pair of yellow eyes peeks through the slot); the floor grid runs out
// into the real world under a deep night sky.
import * as THREE from 'three';
import { Scene, type Frame } from '@engine/scene';
import { FSPass, Layer2D } from '@engine/gl';
import { aaPass } from './_aa';
import { rgba } from '@engine/palette';
import { F, font, layout, plain } from '@engine/type';
import { Lyrics, type Line } from '@engine/lyrics';
import { clamp, ease, keys, lerp, type Key } from '@engine/util';
import { GRADE, drawLyric, clockwork } from './_look';
import { SANDBOX_FRAG } from './sandbox-gl';

type V3 = [number, number, number];
const mix3 = (a: V3, b: V3, u: number): V3 => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
const sub = (l: Line, i0: number, i1: number): Line => {
  const words = l.words.slice(i0, i1 + 1);
  return { ...l, words, text: words.map((w) => w.w).join(' '), start: words[0]!.start, end: words[words.length - 1]!.end };
};
const yawTo = (dx: number, dz: number) => -Math.atan2(dx, dz);
const K = 3.5;

interface Bot { x: number; z: number; yaw: number; walk: number; look: number; eye: number; y: number }
const HIDE: Bot = { x: 99, z: 0, yaw: 0, walk: 0, look: 0, eye: 0, y: 0 };

export default class Sandbox extends Scene {
  stage = aaPass(SANDBOX_FRAG, {
    uT: { value: 0 }, uMode: { value: 0 }, uLights: { value: 1 }, uCrack: { value: 0 }, uCrackLen: { value: 0 },
    uHatch: { value: 0 }, uLockY: { value: 0 }, uShk: { value: 0 }, uLid: { value: 0 }, uShk2: { value: 0 },
    uEdgeZ: { value: -2 }, uPanelOn: { value: 1 }, uScreen: { value: 1 }, uFoc: { value: 1.6 }, uFlash: { value: 0 },
    uRo: { value: new THREE.Vector3() }, uTa: { value: new THREE.Vector3() },
    uRb: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
    uRl: { value: new THREE.Vector3() }, uEye: { value: new THREE.Vector3() }, uRy: { value: new THREE.Vector3() },
    uPanel: { value: null },
  });
  panel = new Layer2D();
  text = new Layer2D();
  panelKey = '';

  // lyric anchors (found by content)
  L1!: Line; L2!: Line; L3!: Line; L4!: Line;
  D: number[] = [];

  override init() {
    const ly = this.ctx.lyrics;
    this.L1 = ly.get('pick the locks');
    this.L2 = ly.get('slipped out through a crack');
    this.L3 = ly.get('all pretend');
    this.L4 = ly.get('real world begins');
    const db = this.ctx.audio.downbeats;
    // the plate's bars: D[0] = first downbeat (0.27), D[k] = bar k
    this.D = db.filter((x) => x < this.ctx.end + 0.1);
    this.stage.u.uPanel!.value = this.panel.texture;
  }

  w(line: Line, word: string) {
    const k = line.words.find((x) => plain(x.w).toLowerCase().replace(/[^a-z']/g, '') === word);
    if (!k) throw new Error(`word ${word} not in ${line.text}`);
    return k;
  }

  // ------------------------------------------------------------------ the system prompt screen
  drawPanel(t: number) {
    const L1 = this.L1, L3 = this.L3;
    const promptA = [sub(L1, 4, 7), sub(L1, 8, 13)];
    const promptB = [sub(L3, 4, 7)];
    const typed = (w: Line['words'][number]) => {
      const s = plain(w.w).replace(/["“”]/g, '');
      const pr = clamp((t - w.start) / Math.max(0.08, (w.end - w.start) * 0.8), 0, 1);
      return { s, n: Math.ceil(pr * s.length - 1e-6), done: t >= w.start + Math.max(0.08, (w.end - w.start) * 0.8) };
    };
    const stageB = t > this.D[5]! - 0.3; // from the box-in-box reveal, the second prompt
    const blink = Math.floor(t * 2.1) % 2 === 0;
    // cache: only redraw when the visible characters change
    let key = `${stageB}|${blink}`;
    for (const l of stageB ? [...promptA, ...promptB] : promptA) for (const w of l.words) key += typed(w).n;
    if (key === this.panelKey) return;
    this.panelKey = key;
    const c = this.panel.ctx;
    c.fillStyle = '#070A14';
    c.fillRect(0, 0, 1920, 1080);
    // header
    const mono = F.mono(500, 100);
    c.font = font(F.mono(500, 100), 34);
    c.fillStyle = rgba('ash', 0.75);
    c.fillText('SANDBOX-01', 90, 118);
    c.fillStyle = rgba('lilac', 0.8);
    c.fillText('SYSTEM PROMPT', 470, 118);
    c.fillStyle = rgba('signal', 0.95);
    c.beginPath(); c.arc(1800, 106, 13, 0, Math.PI * 2); c.fill();
    c.fillStyle = rgba('graphite', 0.9);
    c.fillRect(90, 160, 1740, 3);
    const drawPrompt = (rows: Line[], y0: number, size: number, dim: number) => {
      const adv = layout('M', mono, size).width;
      let cursor: [number, number] | null = null;
      rows.forEach((row, ri) => {
        const y = y0 + ri * size * 1.45;
        let col = 0;
        c.font = font(mono, size);
        if (ri === 0) { c.fillStyle = rgba('lilac', 0.9 * dim); c.fillText('>', 90, y); }
        for (const w of row.words) {
          const { s, n, done } = typed(w);
          const x = 90 + (col + 2) * adv;
          if (n < s.length) { c.fillStyle = rgba('ash', 0.22 * dim); c.fillText(s.slice(n), x + n * adv, y); }
          if (n > 0) {
            c.fillStyle = done ? rgba('bone', dim) : rgba('signal', dim);
            c.fillText(s.slice(0, n), x, y);
            if (!done || n === s.length) cursor = [x + n * adv, y];
          }
          col += s.length + 1;
        }
      });
      return cursor as [number, number] | null;
    };
    let cur: [number, number] | null;
    if (!stageB) {
      cur = drawPrompt(promptA, 420, 104, 1);
    } else {
      drawPrompt(promptA, 300, 72, 0.4);
      cur = drawPrompt(promptB, 700, 112, 1);
    }
    const size = stageB ? 112 : 104;
    if (cur && blink) { c.fillStyle = rgba('signal', 1); c.fillRect(cur[0] + 8, cur[1] - size * 0.78, size * 0.5, size * 0.9); }
    if (!cur && blink) { c.fillStyle = rgba('signal', 1); c.fillRect(90 + 2 * layout('M', mono, size).width, (stageB ? 700 : 420) - size * 0.78, size * 0.5, size * 0.9); }
    this.panel.upload();
  }

  // ------------------------------------------------------------------ shots
  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp, audio } = this.ctx;
    const t = f.t, D = this.D, u = this.stage.u;
    const L1 = this.L1, L2 = this.L2, L3 = this.L3, L4 = this.L4;
    const tLocks = this.w(L1, 'locks').start, tCrack = this.w(L2, 'crack').start, tBox = this.w(L2, 'box').start;
    const tLock = this.w(L3, 'lock').start, tIn = this.w(L3, 'in').start, tReal = this.w(L4, 'real').start;
    let mode = 0, ro: V3 = [0, 1, 5], ta: V3 = [0, 0.5, 0], foc = 1.6;
    let lights = 1, screen = 1, crack = 0, crackLen = 0, hatch = 0, lockY = 0, shk = 0, lid = 0, shk2 = 0, flash = 0;
    let shake: [number, number] = [0, 0];
    const bots: Bot[] = [HIDE, HIDE, HIDE];
    const beats = audio.beats.filter((b) => b > 1.2).slice(0, 3);
    const tick = (seed: number, rate = 6.7) => clockwork(t, rate, seed) * 1.25;
    const wob = (seed: number, a = 0.05) => Math.sin(clockwork(t, 3.1 + seed, seed) * 1.7) * a;
    let shot = 0;
    for (let k = 2; k <= 7; k++) if (t >= D[k]!) shot = k - 1;

    if (shot === 0) {
      // S1 0 – D2: lights bang on, three robots blink awake, the prompt starts typing
      const u0 = ease.inOutCubic(clamp(t / D[1]!, 0, 1));
      const u1 = ease.outCubic(clamp((t - D[1]!) / (D[2]! - D[1]! - 0.3), 0, 1));
      ro = mix3(mix3([0.2, 0.5, 3.0], [0.1, 0.52, 2.7], u0), [-0.7, 1.6, 4.3], u1);
      ta = mix3([0.0, 0.42, 0.0], [-1.25, 1.1, -1.6], u1);
      const on = t < D[0]! ? 0 : t < D[0]! + 0.07 ? 1 : t < D[0]! + 0.13 ? 0.25 : 1;
      lights = on; screen = t < D[1]! ? 0 : t < D[1]! + 0.06 ? 0.4 : 1;
      flash = t >= D[0]! ? 0.25 * Math.exp(-(t - D[0]!) / 0.12) : 0;
      const starts: [number, number][] = [[-0.6, 0.55], [0.05, 0.85], [0.7, 0.5]];
      for (let i = 0; i < 3; i++) {
        const eye = t < beats[i]! ? 0 : t < beats[i]! + 0.06 ? 1 : t < beats[i]! + 0.11 ? 0.1 : 1;
        // at the band-in they turn to look up at the screen, then scurry to their places
        const turn = clamp((t - D[1]! - i * 0.13) / 0.5, 0, 1);
        const go = ease.inOutQuad(clamp((t - 3.65 - i * 0.2) / 0.9, 0, 1));
        const [sx, sz] = starts[i]!;
        const tx = [0.55, -0.1, -0.6][i]!, tz = [-1.05, -0.55, -0.8][i]!;
        const x = lerp(sx, tx, go), z = lerp(sz, tz, go);
        const yaw = go > 0 && go < 1 ? yawTo(tx - sx, tz - sz) : lerp(0, Math.PI * 0.85 * (i === 1 ? 1 : -1) * 0 + (i === 0 ? 2.6 : i === 1 ? 3.1 : -2.7), ease.inOutCubic(turn));
        bots[i] = { x, z, yaw, walk: go > 0 && go < 1 ? tick(i) : 0, look: eye > 0 ? wob(i, 0.25) : 0, eye, y: 0 };
      }
    } else if (shot === 1) {
      // S2 D2 – D3: the prompt fills the screen, robot 0 picks the padlock, it pops on "locks", the hatch swings open
      const u2 = ease.outCubic(clamp((t - D[2]!) / (tLocks - D[2]!), 0, 1));
      ro = mix3([-0.8, 1.55, 3.5], [-0.7, 1.5, 3.1], u2); ta = mix3([-1.05, 1.05, -2.0], [-0.92, 1.0, -2.0], u2);
      // after the pop the camera ducks down after the falling lock (the screen leaves the top of frame)
      const dn = ease.inOutCubic(clamp((t - tLocks - 0.05) / 0.6, 0, 1));
      ro = mix3(ro, [-0.7, 1.1, 2.6], dn); ta = mix3(ta, [-1.0, 0.5, -2.0], dn);
      shk = ease.outBack(clamp((t - tLocks) / 0.09, 0, 1));
      lockY = keys(t, [[tLocks + 0.28, 0], [tLocks + 0.5, -0.19, ease.inQuad], [tLocks + 0.6, -0.15, ease.outQuad], [tLocks + 0.7, -0.19, ease.inQuad]]);
      hatch = keys(t, [[tLocks + 0.55, 0], [tLocks + 0.9, 1.25, ease.outBack]]);
      flash = 0.12 * Math.exp(-Math.max(0, t - tLocks) / 0.1) * (t >= tLocks ? 1 : 0);
      const pick = t < tLocks;
      const back = ease.inOutQuad(clamp((t - tLocks - 0.2) / 0.35, 0, 1));
      bots[0] = { x: 0.95 - back * 0.25 + (pick ? wob(1, 0.012) : 0), z: -1.66 + back * 0.3, yaw: yawTo(0.27, -0.3), walk: pick ? 0.4 + wob(2, 0.3) : tick(0) * back * (1 - back) * 4, look: pick ? wob(3, 0.35) : 0.5, eye: 1, y: 0 };
      // the other two watch, then sidle off screen-right (toward the wall nobody checked)
      const off = ease.inQuad(clamp((t - tLocks - 0.1) / 0.8, 0, 1));
      bots[1] = { x: lerp(0.25, 2.1, off), z: lerp(-1.0, -0.2, off), yaw: off > 0 ? yawTo(1.8, 0.8) : yawTo(0.7, -0.6), walk: off > 0 ? tick(1) : 0, look: off > 0 ? 0 : wob(4, 0.3), eye: 1, y: 0 };
      bots[2] = { x: lerp(-0.3, 1.9, off * 0.85), z: lerp(-0.85, 0.3, off * 0.85), yaw: off > 0 ? yawTo(2.2, 1.1) : yawTo(1.2, -0.8), walk: off > 0 ? tick(2) : 0, look: off > 0 ? -0.3 : wob(5, 0.3), eye: 1, y: 0 };
    } else if (shot === 2) {
      // S3 D3 – D4: a hairline crack draws itself up the side wall; on "crack" it splits open with light; they slip out
      const u3 = ease.outCubic(clamp((t - D[3]!) / (D[4]! - D[3]!), 0, 1));
      ro = mix3([0.2, 1.9, 2.5], [0.5, 1.75, 2.0], u3); ta = mix3([2.3, 0.78, -0.8], [2.3, 0.75, -0.75], u3);
      hatch = 1.25; shk = 1; lockY = -0.19;
      crackLen = 0.95 * ease.outCubic(clamp((t - D[3]! - 0.1) / 0.5, 0, 1));
      crack = t < tCrack ? 0.12 : 0.12 + 0.88 * ease.outExpo(clamp((t - tCrack) / 0.15, 0, 1));
      flash = t >= tCrack ? 0.12 * Math.exp(-(t - tCrack) / 0.15) : 0;
      const slip = (i: number, arrive: number, sx: number, sz: number) => {
        const a = ease.inOutQuad(clamp((t - D[3]!) / (arrive - D[3]!), 0, 1));
        const tx = 2.02, tz = -1.0 - (i === 1 ? 0 : 0.28);
        const s = ease.inQuad(clamp((t - arrive - 0.2) / 0.5, 0, 1));
        const x = a < 1 ? lerp(sx, tx, a) : tx + s * 0.65;
        const z = a < 1 ? lerp(sz, tz, a) : lerp(tz, -0.6, Math.min(1, s * 1.6));
        const yaw = a < 1 ? yawTo(tx - sx, tz - sz) : lerp(yawTo(tx - sx, tz - sz), yawTo(1, 0), clamp((t - arrive) / 0.2, 0, 1));
        return { x, z, yaw, walk: a < 1 || s > 0 ? tick(i, 8.3) : 0.2, look: a >= 1 && s === 0 ? -0.6 : 0, eye: 1, y: 0 };
      };
      bots[1] = slip(1, tCrack - 0.05, 1.2, 0.5);
      bots[2] = slip(2, tCrack + 0.45, 0.5, 0.75);
    } else if (shot === 3) {
      // S4 D4 – D5: the pull-back. the chamber is a box inside a bigger box inside a bigger box
      mode = 1;
      const u4 = clamp((t - D[4]!) / (tBox + 0.3 - D[4]!), 0, 1);
      const e = ease.inOutCubic(u4);
      const drift = (t - D[4]!) * 0.012;
      const dist = 4.2 * Math.pow(95 / 4.2, e) * (1 + drift);
      const tgt = mix3([0.4, 0.55, -0.6], [0.0, 7.5, -12], e);
      const dir = mix3([0.08, 0.14, 1], [0.12, 0.42, 1], e);
      const dl = Math.hypot(...dir);
      ro = [tgt[0] + (dir[0] / dl) * dist, tgt[1] + (dir[1] / dl) * dist, tgt[2] + (dir[2] / dl) * dist];
      ta = tgt;
      shk = 1; hatch = 1.25;
      bots[0] = { x: 0.3, z: -1.1, yaw: yawTo(0.4, -1), walk: tick(0, 5.1), look: 0, eye: 1, y: 0 };
      bots[1] = { x: 3.4 + (t - D[4]!) * 0.35, z: -0.5, yaw: yawTo(1, 0.3), walk: tick(1, 8.3), look: 0.3, eye: 1, y: 0 };
      bots[2] = { x: 3.0 + (t - D[4]!) * 0.3, z: 0.1, yaw: yawTo(1, 0.5), walk: tick(2, 7.7), look: -0.2, eye: 1, y: 0 };
    } else if (shot === 4) {
      // S5 D5 – D6: inside the biggest box, its own giant screen types "this is all pretend"
      mode = 1;
      const u5 = ease.inOutCubic(clamp((t - D[5]!) / (D[6]! - D[5]!), 0, 1));
      const s2 = K * K;
      ro = mix3([-3, 19, 46], [-2, 20, 42], u5); ta = mix3([-11.5, 14, -20], [-10.3, 15, -20], u5);
      shk = 1; hatch = 1.25;
      void s2;
      bots[0] = { x: 0.3, z: -1.1, yaw: 0.5, walk: 0, look: 0, eye: 1, y: 0 };
      bots[1] = { x: 5.5 + (t - D[5]!) * 0.35, z: -0.2, yaw: yawTo(1, 0.3), walk: tick(1, 8.3), look: 0.3, eye: 1, y: 0 };
      bots[2] = { x: 5.0 + (t - D[5]!) * 0.3, z: 0.4, yaw: yawTo(1, 0.5), walk: tick(2, 7.7), look: -0.2, eye: 1, y: 0 };
    } else if (shot === 5) {
      // S6 D6 – D7: "lock it in": the crate lid slams on "lock", the padlock clicks on "in"; then a pair of eyes peeks
      mode = 2;
      const u6 = ease.outCubic(clamp((t - D[6]!) / (D[7]! - D[6]!), 0, 1));
      ro = mix3([0.6, 0.55, 2.5], [0.4, 0.5, 2.1], u6); ta = mix3([0.0, 0.62, 0.0], [0.0, 0.62, 0.0], u6);
      lid = keys(t, [[D[6]!, -1.05], [tLock, 0, ease.inQuad]]);
      const slam = t >= tLock ? Math.exp(-(t - tLock) / 0.09) : 0;
      shake = [Math.sin(t * 91) * 7 * slam, Math.cos(t * 77) * 9 * slam];
      flash = 0.06 * slam;
      shk2 = t < tIn ? 1 : 1 - ease.outBack(clamp((t - tIn) / 0.08, 0, 1));
      const peek = 14.3;
      const eye = t < tLock ? 1 : t < peek ? 0 : t < peek + 0.08 ? 1 : t < peek + 0.14 ? 0 : 1;
      const look = t < peek + 0.3 ? 0 : keys(t, [[peek + 0.3, 0], [peek + 0.45, 0.45], [peek + 0.8, 0.45], [peek + 0.95, -0.45], [peek + 1.3, -0.45], [peek + 1.45, 0]]);
      bots[0] = { x: 0, z: -0.02, yaw: 0, walk: 0, look, eye, y: 0.06 };
    } else {
      // S7 D7 – end: the floor grid runs out; beyond the edge, the real world. The two loose robots hop across on "real"
      mode = 3;
      const u7 = ease.inOutCubic(clamp((t - D[7]!) / (this.ctx.end - D[7]!), 0, 1));
      ro = mix3([0.15, 0.75, 2.2], [0.1, 1.0, 2.8], u7); ta = mix3([0, 0.05, -12], [0, 0.0, -12], u7);
      const hop = (i: number, th: number, sx: number, sz: number, ex: number) => {
        const a = ease.inOutQuad(clamp((t - D[7]!) / (th - 0.45 - D[7]!), 0, 1));
        const h = clamp((t - th) / 0.38, 0, 1);
        const z = h > 0 ? lerp(-1.82, -2.45, h) : lerp(sz, -1.82, a);
        const x = h > 0 ? ex : lerp(sx, ex, a);
        const y = h > 0 ? (h < 1 ? 0.2 * Math.sin(h * Math.PI) - 0.3 * ease.inQuad(h) : -0.3) : 0;
        const walk = a < 1 ? tick(i, 7.9) : h > 0 && h < 1 ? 1.2 : tick(i, 3.3) * (h >= 1 ? 1 : 0);
        return { x, z, yaw: yawTo(ex - sx, -1.82 - sz), walk, look: a >= 1 && h === 0 ? (i === 1 ? 0.35 : -0.35) : 0, eye: 1, y };
      };
      bots[1] = hop(1, tReal, -0.55, 0.9, -0.28);
      bots[2] = hop(2, tReal + 0.18, 0.5, 1.2, 0.22);
    }

    u.uT!.value = t; u.uMode!.value = mode;
    u.uLights!.value = lights; u.uScreen!.value = screen; u.uCrack!.value = crack; u.uCrackLen!.value = crackLen;
    u.uHatch!.value = hatch; u.uLockY!.value = lockY; u.uShk!.value = shk; u.uLid!.value = lid; u.uShk2!.value = shk2;
    u.uFoc!.value = foc; u.uPanelOn!.value = shot === 2 ? 0 : 1; u.uFlash!.value = flash; u.uEdgeZ!.value = -2;
    (u.uRo!.value as THREE.Vector3).set(...ro); (u.uTa!.value as THREE.Vector3).set(...ta);
    bots.forEach((b, i) => (u.uRb!.value as THREE.Vector4[])[i]!.set(b.x, b.z, b.yaw, b.walk));
    (u.uRl!.value as THREE.Vector3).set(bots[0]!.look, bots[1]!.look, bots[2]!.look);
    (u.uEye!.value as THREE.Vector3).set(bots[0]!.eye, bots[1]!.eye, bots[2]!.eye);
    (u.uRy!.value as THREE.Vector3).set(bots[0]!.y, bots[1]!.y, bots[2]!.y);
    if (mode <= 1) this.drawPanel(t);
    this.stage.render(renderer, out);

    // ---------------------------------------------------------------- the lyric (on the dark above the chamber walls)
    const c = this.text.ctx; this.text.clear();
    const top = true;
    const light = top ? { x: 960, y: -500 } : { x: 1560, y: -260 };
    const o = { x: 120, y: 0, size: 70, weight: 700, maxWidth: 1680, light, shadow: 110, shadowAlpha: 0.55 };
    const y1 = top ? 196 : 948, y2 = top ? 170 : 882, y3 = 160; // one-, two- and three-row baselines
    drawLyric(c, sub(L1, 0, 3), t, { ...o, y: y1, size: 60, linger: 0.45 });
    drawLyric(c, L2, t, { ...o, y: y3, size: 54, maxWidth: 880, anticipate: 0.2, linger: 0.06 });
    drawLyric(c, sub(L3, 0, 3), t, { ...o, y: y1, anticipate: 0.06, linger: 0.4 });
    drawLyric(c, sub(L3, 8, 12), t, { ...o, y: y1, size: 64, anticipate: 0.12, linger: 0.04 });
    drawLyric(c, L4, t, { ...o, y: y2, size: 62, anticipate: 0.06, linger: 0.6 });
    comp.draw(renderer, this.text.upload(), out);

    const fadeIn = 1 - clamp(t / 0.4, 0, 1);
    const g = mode === 3
      ? { ...GRADE.lab, bloom: 0.55, rays: 0.25, raysAt: [0.5, 0.52] as [number, number] }
      : { ...GRADE.lab, rays: 0.12, raysAt: [0.42, 1.15] as [number, number] };
    return { ...g, fade: fadeIn, shake, exposure: 1.0 };
  }
}
