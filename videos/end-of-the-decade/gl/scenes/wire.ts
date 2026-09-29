// wire (verse 2, 72.49–89.48, grade `flash`): the reaction. The string-sun is hauled up over the toy town; the post
// spreads town to town as a glowing network; PLANNED lights up screen-left; the credits roll while two cuffed hands
// launch a paper plane; four day cards flip like a departures board; the boss's metronome slows while the band
// doesn't; the rivals slide together into one huddle. Cuts on downbeats (and on the beat for the day cards).
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '@engine/scene';
import { Layer2D } from '@engine/gl';
import { LineBatch } from '@engine/lines';
import { LIN, rgba } from '@engine/palette';
import { F, font } from '@engine/type';
import { clamp, ease, hash, keys, lerp } from '@engine/util';
import type { Line } from '@engine/lyrics';
import { GRADE, drawLyric, drawThread, yank, type LyricOpts } from './_look';
import { Cam, type V3 } from './wire-cam';
import { makePlannedPass, makeSignTexture } from './wire-planned';
import { makeCreditsPass, makeCreditsTexture } from './wire-credits';
import { makePodiumPass, PODIUM, METRO } from './wire-podium';
import { makeTownPass, CITY_CC, CITY_NX, CITY_NZ, CITY_OX, CITY_OZ, type City } from './wire-town';

type ShotId = 'sun' | 'net' | 'planned' | 'credits' | 'board' | 'podium' | 'huddle';
interface Shot { id: ShotId; t0: number; t1: number }

const pr = (t: number, a: number, b: number, fn: (x: number) => number = ease.linear) => fn(clamp((t - a) / (b - a), 0, 1));

export default class Wire extends Scene {
  town = makeTownPass();
  sign = makeSignTexture();
  planned = makePlannedPass(this.sign.tex);
  cred = makeCreditsTexture();
  credits = makeCreditsPass(this.cred.tex);
  podium = makePodiumPass();
  text = new Layer2D();
  arcs = new LineBatch(4000, { screen2D: true, blend: 'add' });
  cam = new Cam();
  shots: Shot[] = [];
  lines: Line[] = [];
  cities: (City & { parent: number })[] = [];
  beats: number[] = []; // beat times inside the plate

  override async init() {
    const { lyrics: ly, audio: au } = this.ctx;
    const S = this.ctx.start, E = this.ctx.end;
    const db = au.downbeats.filter((d) => d > S - 0.05 && d < E + 0.05);
    const L1 = ly.get('By morning it was everywhere'), L2 = ly.get('written it up with a friend');
    const L3 = ly.get('Four days later'), L4 = ly.get('rivals who agree on nothing');
    this.lines = [L1, L2, L3, L4];
    const b0 = Math.round(au.beatAt(L3.start));
    const boardEnd = au.timeOfBeat(b0 + 3); // the fourth day card lands on the podium
    const d = (i: number) => db[i] ?? S + i * 2.124;
    this.shots = [
      { id: 'sun', t0: S, t1: d(1) },
      { id: 'net', t0: d(1), t1: d(2) },
      { id: 'planned', t0: d(2), t1: d(3) },
      { id: 'credits', t0: d(3), t1: L3.start },
      { id: 'board', t0: L3.start, t1: boardEnd },
      { id: 'podium', t0: boardEnd, t1: d(7) },
      { id: 'huddle', t0: d(7), t1: E + 1 },
    ];
    for (let i = Math.floor(au.beatAt(S)) - 1; au.timeOfBeat(i) < E + 1; i++) this.beats.push(au.timeOfBeat(i));
    this.buildCities(L1);
  }

  shotAt(t: number): Shot { return this.shots.find((s) => t < s.t1) ?? this.shots[this.shots.length - 1]!; }

  // ------------------------------------------------------------------ the towns and the network
  buildCities(L1: Line) {
    const every = L1.words.find((w) => w.w.toLowerCase().startsWith('everywhere'))!.start;
    const morning = L1.words.find((w) => w.w.toLowerCase().startsWith('morning'))!.start;
    const list: (City & { parent: number; cell: number })[] = [];
    for (let j = 0; j < CITY_NZ; j++) for (let i = 0; i < CITY_NX; i++) {
      const cell = j * CITY_NX + i;
      const cx = CITY_OX + (i + 0.5) * CITY_CC, cz = CITY_OZ + (j + 0.5) * CITY_CC;
      const home = Math.abs(cx) < 1 && Math.abs(cz) < 1;
      if (!home && hash(i, j, 3) < 0.22) continue;
      const r = home ? 4.6 : 1.7 + 1.6 * hash(i, j, 5);
      const jx = home ? 0 : (hash(i, j, 7) - 0.5) * (9 - 2 * r), jz = home ? 0 : (hash(i, j, 8) - 0.5) * (9 - 2 * r);
      list.push({ x: cx + jx, z: cz + jz, r, lit: 0, parent: -1, cell });
    }
    // light order: by distance from home, with the burst on "everywhere"
    const home = list.findIndex((c) => c.r > 4)!;
    const dist = (a: City, b: City) => Math.hypot(a.x - b.x, a.z - b.z);
    const order = list.map((_, i) => i).sort((a, b) => dist(list[a]!, list[home]!) - dist(list[b]!, list[home]!));
    const maxD = Math.max(...list.map((c) => dist(c, list[home]!)));
    order.forEach((ci, k) => {
      const c = list[ci]!;
      if (ci === home) { c.lit = morning + 0.25; return; }
      const f = dist(c, list[home]!) / maxD;
      c.lit = every - 0.35 + Math.pow(f, 1.3) * 1.25 + (hash(k, 9) - 0.5) * 0.12;
      // parent: the nearest town lit before this one
      let best = home, bd = 1e9;
      for (const cj of order.slice(0, k)) { const dd = dist(c, list[cj]!); if (dd < bd && list[cj]!.lit < c.lit - 0.1) { bd = dd; best = cj; } }
      c.parent = best;
    });
    this.cities = list;
    for (const c of list) this.town.cities[c.cell]!.set(c.x, c.z, c.r, c.lit);
  }

  sunY(t: number): number {
    // hauled up in jerks on the beats, then bounced into place on "morning"
    const L1 = this.lines[0]!;
    const morning = L1.words[1]!.start;
    const bs = this.beats.filter((b) => b >= this.ctx.start - 0.01 && b < morning - 0.1);
    let y = -2.8;
    const step = 2.5;
    bs.forEach((b, i) => { const k = pr(t, b, b + 0.2, (x) => ease.outBack(x, 2.2)); y += step * k * (i < 3 ? 1 : 0); });
    const top = 10.5;
    const k = t < morning ? 0 : ease.outElastic(clamp((t - morning) / 0.9, 0, 1));
    return lerp(y, top, k);
  }

  renderTown(f: Frame, out: THREE.WebGLRenderTarget, shot: Shot) {
    const { renderer } = this.ctx;
    const t = f.t, u = this.town.pass.u;
    const p = (t - shot.t0) / (shot.t1 - shot.t0);
    let sun: V3, key: V3, day: number, winAll = 0, skyDay = 0, glow = 1;
    if (shot.id === 'sun') {
      const sy = this.sunY(t);
      sun = [-7.5, sy, 40]; key = sun;
      day = clamp((sy + 0.5) / 10, 0, 1);
      skyDay = day * 0.85; glow = clamp((sy + 2.8) / 7, 0, 1);
      winAll = 1 - day;
      const e = ease.inOutCubic(p);
      this.cam.set([0.35, lerp(0.3, 0.42, e), lerp(-7.2, -6.2, e)], [0, lerp(1.9, 3.2, e), 12], 1.45);
      u.fogK!.value = 0.012;
    } else {
      sun = [0, 22, 75]; key = [6, 24, 60]; day = 1; skyDay = 0.3;
      const e = ease.inOutQuad(p);
      const a = lerp(-0.25, 0.1, e);
      const R = lerp(24, 21, e);
      this.cam.set([Math.sin(a) * R, lerp(15, 13.5, e), 4 - Math.cos(a) * R], [0, 0, 6], 1.5);
      u.fogK!.value = 0.018;
    }
    this.cam.apply(u);
    u.onlyHome!.value = shot.id === 'sun' ? 1 : 0;
    u.t!.value = t; u.day!.value = day; u.skyDay!.value = skyDay; u.winAll!.value = winAll;
    (u.sunPos!.value as THREE.Vector3).set(...sun);
    (u.keyPos!.value as THREE.Vector3).set(...key);
    u.sunR!.value = shot.id === 'sun' ? 2.7 : 3.5;
    u.sunGlow!.value = glow;
    this.town.pass.render(renderer, out);
    const sp = this.cam.project(sun);
    // the network arcs, city to city
    if (shot.id === 'net') {
      const B = this.arcs; B.clear();
      for (const c of this.cities) {
        if (c.parent < 0) continue;
        const a = this.cities[c.parent]!;
        const dur = 0.32, t0 = c.lit - dur;
        const k = clamp((t - t0) / dur, 0, 1);
        if (k <= 0) continue;
        const D = Math.hypot(c.x - a.x, c.z - a.z), hgt = 0.6 + D * 0.22;
        const N = 28, head = ease.outQuad(k);
        const since = t - c.lit;
        const glow = since > 0 ? 1.1 + 2.5 * Math.exp(-since * 5) : 2.2;
        let prev = null as null | { x: number; y: number; z: number };
        for (let i = 0; i <= N; i++) {
          const s = (i / N) * head;
          const P: V3 = [lerp(a.x, c.x, s), 0.05 + Math.sin(s * Math.PI) * hgt, lerp(a.z, c.z, s)];
          const q = this.cam.project(P);
          if (prev && q.z > 0 && prev.z > 0) {
            const nearHead = k < 1 ? Math.exp(-(head - s) * 12) : 0;
            const I = glow + nearHead * 5;
            B.seg2(prev.x, prev.y, q.x, q.y, 2.2 + nearHead * 2.5, [LIN.signal[0] * I, LIN.signal[1] * I, LIN.signal[2] * I], 1);
          }
          prev = q;
        }
        // arrival ring
        if (since > 0 && since < 0.7) {
          const rr = c.r * (0.4 + since * 2.2), al = 1 - since / 0.7;
          let pv = null as null | { x: number; y: number; z: number };
          for (let i = 0; i <= 40; i++) {
            const an = (i / 40) * Math.PI * 2;
            const q = this.cam.project([c.x + Math.cos(an) * rr, 0.03, c.z + Math.sin(an) * rr]);
            if (pv) B.seg2(pv.x, pv.y, q.x, q.y, 1.8, [LIN.ember[0] * 3 * al, LIN.ember[1] * 3 * al, LIN.ember[2] * 3 * al], 1);
            pv = q;
          }
        }
      }
      B.render(renderer, out);
    }
    return { sp, sunUV: [sp.x / 1920, 1 - sp.y / 1080] as [number, number] };
  }

  // ------------------------------------------------------------------ PLANNED
  renderPlanned(f: Frame, out: THREE.WebGLRenderTarget, shot: Shot): PostOverrides {
    const { renderer, audio } = this.ctx;
    const t = f.t, u = this.planned.u;
    const L1 = this.lines[0]!;
    const tp = L1.words[L1.words.length - 1]!.start; // "Planned"
    const p = (t - shot.t0) / (shot.t1 - shot.t0);
    const e = ease.inOutCubic(p);
    const punch = t > tp ? Math.exp(-(t - tp) * 7) : 0;
    this.cam.set([lerp(1.6, 1.1, e), lerp(1.15, 1.3, e), lerp(6.8, 5.8, e) - punch * 0.25], [lerp(-0.2, -0.35, e), 1.75, -1.2], 1.4);
    this.cam.apply(u);
    const wind = pr(t, shot.t0, tp - 0.08, ease.inOutQuad);
    const snap = pr(t, tp - 0.08, tp + 0.06, (x) => ease.outBack(x, 2.5));
    u.armR!.value = lerp(lerp(-0.15, -0.75, wind), 1.55, snap);
    u.armL!.value = lerp(-0.1, -0.35, wind) + 0.08 * yank(audio, t);
    u.headYaw!.value = lerp(-0.2, 0.25, snap);
    u.figYaw!.value = -1.2;
    u.lift!.value = yank(audio, t) * 0.8 + punch * 0.6;
    const litT = (i: number) => pr(t, tp + i * 0.04, tp + i * 0.04 + 0.05);
    this.sign.draw([0, 1, 2, 3, 4, 5, 6].map(litT), t > tp ? (t - tp) * 14 : -1, pr(t, tp + 0.28, tp + 0.34));
    u.lit!.value = pr(t, tp, tp + 0.3) * (1 + 0.6 * punch);
    u.t!.value = t;
    this.planned.render(renderer, out);
    return { zoom: 1 + 0.035 * punch, shake: [punch * 4 * Math.sin(t * 90), punch * 3 * Math.cos(t * 77)] as [number, number], raysAt: [0.3, 0.75] as [number, number], rays: 0.25 * pr(t, tp, tp + 0.2) };
  }

  // ------------------------------------------------------------------ credits + the paper plane
  renderCredits(f: Frame, out: THREE.WebGLRenderTarget, shot: Shot): PostOverrides {
    const { renderer } = this.ctx;
    const t = f.t, u = this.credits.u;
    const L2 = this.lines[1]!;
    const W = (s: string, n = 0) => L2.words.filter((w) => w.w.toLowerCase().startsWith(s))[n]!;
    const tFriend = W('friend').start, tFew = W('few').start, tHand = W('hand').start;
    const p = (t - shot.t0) / (shot.t1 - shot.t0);
    const e = ease.inOutQuad(p);
    const pan = pr(t, tFriend + 0.1, tFew + 0.3, ease.inOutCubic); // hold on the credits, then pan to the hands
    this.cam.set([lerp(0.6, 0.35, e) + lerp(-0.45, 0, pan), lerp(1.5, 1.42, e), lerp(3.0, 2.5, e)], [lerp(-0.1, 0.0, e) + lerp(-0.4, 0, pan), 0.95, -0.2], 1.45);
    this.cam.apply(u);
    const R = this.cred;
    const roll = keys(t, [[shot.t0, R.rowY(2)], [tFriend, R.rowY(4), ease.inOutCubic], [tFew + 0.2, R.rowY(7), ease.inOutCubic], [shot.t1, R.rowY(9), ease.inOutCubic]]);
    const hi = R.rows.map((_, i) => (i === 3 ? pr(t, L2.start, L2.start + 0.3) * (1 - pr(t, tFriend - 0.1, tFriend + 0.1))
      : i === 4 ? pr(t, tFriend, tFriend + 0.15) * (1 - pr(t, tFew - 0.1, tFew + 0.1))
      : i === 6 || i === 7 ? pr(t, tFew, tFew + 0.15) : 0));
    R.draw(roll, hi);
    // hands come down, hold the plane, and give it a push on "hand"
    const down = pr(t, tFew - 0.55, tFew + 0.25, ease.outCubic);
    const push = pr(t, tHand - 0.12, tHand + 0.05, ease.outQuad);
    const fly = Math.max(0, t - tHand);
    const hy = lerp(2.9, 1.2, down) + 0.06 * Math.sin(t * 2.1) * down - push * 0.03 + pr(t, tHand + 0.05, tHand + 0.4, ease.outCubic) * 0.25;
    u.handsY!.value = hy;
    u.pinch!.value = lerp(1, 0.1, pr(t, tHand - 0.02, tHand + 0.1));
    const px = 0.33 + push * 0.05 + fly * 2.6 + fly * fly * 3.0, py = (t < tHand ? hy : 1.2) - 0.175 + fly * 0.8 + fly * fly * 1.5, pz = 0.08 + fly * 1.2;
    (u.planePos!.value as THREE.Vector3).set(px, py, pz);
    (u.planeRot!.value as THREE.Vector3).set(-0.25 - fly * 2.2, -0.45 - fly * 0.4, 0.1 + fly * 0.5);
    u.glow!.value = 0.9 + 0.1 * Math.sin(t * 13);
    u.t!.value = t;
    this.credits.render(renderer, out);
    return {};
  }

  // ------------------------------------------------------------------ four days: the split-flap card over the whipping sun
  renderBoard(f: Frame, out: THREE.WebGLRenderTarget, shot: Shot, c: CanvasRenderingContext2D): PostOverrides {
    const { renderer, audio: au } = this.ctx;
    const t = f.t, u = this.town.pass.u;
    const b0 = Math.round(au.beatAt(shot.t0));
    const bt = au.beatAt(t) - b0; // 0..3 across the four days
    const ph = bt - Math.floor(bt);
    // the sun whips across the sky once per beat; day/night flickers
    const ang = lerp(-1.25, 1.25, ease.inOutCubic(clamp(ph / 0.8, 0, 1)));
    const sun: V3 = [-Math.sin(ang) * 30, Math.cos(ang) * 21 - 6, 40];
    const day = clamp(Math.cos(ang) * 1.3 - 0.2, 0, 1);
    this.cam.set([0.3, 0.45, -6.8], [0, 2.9, 12], 1.35, 0.03 * Math.sin(bt * Math.PI));
    this.cam.apply(u);
    u.onlyHome!.value = 1; u.t!.value = t; u.day!.value = day; u.skyDay!.value = day * 0.85; u.winAll!.value = 1 - day;
    (u.sunPos!.value as THREE.Vector3).set(...sun); (u.keyPos!.value as THREE.Vector3).set(...sun);
    u.sunR!.value = 2.7; u.sunGlow!.value = day; u.fogK!.value = 0.012;
    this.town.pass.render(renderer, out);
    const sp = this.cam.project(sun);
    if (sp.z > 0) drawThread(c, sp.x, sp.y - 2.7 * 1080 * this.cam.fl / sp.z, sp.x + 4, -20, t, { alpha: 0.4, width: 1.1, sway: 2 });
    // the split-flap card
    const n = clamp(Math.floor(bt) + 1, 1, 4);
    const flipT = ph * au.beatAt(0) * 0 + (t - au.timeOfBeat(b0 + n - 1)); // seconds since this card's flip
    const k = clamp(flipT / 0.2, 0, 1);
    const cx = 960, cy = 420, cw = 400, ch = 470, r = 26;
    const face = (num: string, half: 'top' | 'bottom', sy = 1) => {
      c.save();
      c.translate(cx, cy); c.scale(1, sy);
      c.beginPath();
      if (half === 'top') c.roundRect(-cw / 2, -ch / 2, cw, ch / 2 - 3, [r, r, 0, 0]); else c.roundRect(-cw / 2, 3, cw, ch / 2 - 3, [0, 0, r, r]);
      c.clip();
      const g = c.createLinearGradient(0, -ch / 2, 0, ch / 2);
      g.addColorStop(0, '#222a44'); g.addColorStop(0.5, '#141a2c'); g.addColorStop(0.5, '#10152a'); g.addColorStop(1, '#1a2138');
      c.fillStyle = g; c.fillRect(-cw / 2, -ch / 2, cw, ch);
      c.fillStyle = rgba('bone', 1);
      c.font = font(F.display(900), 380); c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(num, 0, -26);
      c.restore();
    };
    // board frame + shadow
    c.save();
    c.save();
    c.fillStyle = 'rgba(5,7,14,0.55)'; c.beginPath(); c.roundRect(cx - cw / 2 - 40 + 30, cy - ch / 2 - 40 + 40, cw + 80, ch + 150, 34); c.fill();
    c.fillStyle = '#0b0f1c'; c.beginPath(); c.roundRect(cx - cw / 2 - 40, cy - ch / 2 - 40, cw + 80, ch + 150, 34); c.fill();
    c.restore();
    const cur = String(n), prev = String(n - 1);
    face(cur, 'top');
    face(k < 1 ? prev : cur, 'bottom');
    if (k < 0.5) face(prev, 'top', 1 - k * 2); // old top falls
    else if (k < 1) face(cur, 'bottom', (k - 0.5) * 2); // new bottom lands
    c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(cx - cw / 2, cy - 3, cw, 6);
    c.fillStyle = rgba('graphite', 1); c.fillRect(cx - cw / 2 - 12, cy - 9, 12, 18); c.fillRect(cx + cw / 2, cy - 9, 12, 18);
    c.font = font(F.mono(800, 112.5), 34); c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    (c as any).letterSpacing = '10px';
    c.fillStyle = rgba('signal', 1);
    c.fillText(`DAY ${n}`, cx, cy + ch / 2 + 70);
    (c as any).letterSpacing = '0px';
    c.restore();
    const whip = Math.exp(-flipT * 9);
    return { rays: 0.3 * day, raysAt: [sp.x / 1920, 1 - sp.y / 1080] as [number, number], flash: 0.12 * whip * day, zoom: 1 + 0.015 * whip };
  }

  // ------------------------------------------------------------------ the boss, the metronome, the rivals
  /** Metronome phase: one swing per beat until "Let's", then it slows (exponentially) while the band doesn't. */
  metroPhase(t: number): { phase: number; rate: number } {
    const au = this.ctx.audio;
    const L3 = this.lines[2]!;
    const tSlow = L3.words.find((w) => w.w.toLowerCase().includes('let'))!.start;
    const r0 = Math.PI / (60 / au.bpm);
    const tau = 0.75, floor = 0.1;
    if (t < tSlow) return { phase: Math.PI * au.beatAt(t), rate: r0 };
    const x = t - tSlow;
    const ph0 = Math.PI * au.beatAt(tSlow);
    const dec = tau * (1 - Math.exp(-x / tau));
    return { phase: ph0 + r0 * ((1 - floor) * dec + floor * x), rate: r0 * (floor + (1 - floor) * Math.exp(-x / tau)) };
  }

  renderPodium(f: Frame, out: THREE.WebGLRenderTarget, shot: Shot, c: CanvasRenderingContext2D): PostOverrides {
    const { renderer, audio: au } = this.ctx;
    const t = f.t, u = this.podium.u;
    const L4 = this.lines[3]!;
    const W4 = (s: string) => L4.words.find((w) => w.w.toLowerCase().startsWith(s))!;
    const tNothing = W4('nothing').start, tCame = W4('came').start, tAnd2 = L4.words[L4.words.length - 3]!.start;
    const p = (t - shot.t0) / (shot.t1 - shot.t0);
    const m = this.metroPhase(t);
    const slowK = 1 - m.rate / (Math.PI / (60 / au.bpm)); // 0 = in time, ~0.9 = nearly stopped
    u.metro!.value = 0.42 * Math.sin(m.phase) * (1 - 0.35 * slowK);
    // the boss pats the air in time with the (slowing) metronome
    const pat = Math.abs(Math.sin(m.phase));
    u.bossArm!.value = 0.95 + 0.3 * pat * clamp((t - shot.t0) / 0.4, 0, 1);
    u.bossNod!.value = 0.12 * Math.sin(m.phase + 0.5);
    u.lift!.value = yank(au, t) * (1 - slowK) * 0.6;
    let flashK = 0;
    if (shot.id === 'podium') {
      // the dolly runs on the metronome's clock: it slows down with it
      const m0 = this.metroPhase(shot.t0).phase, m1 = this.metroPhase(shot.t1).phase;
      const e = ease.outQuad(clamp((m.phase - m0) / (m1 - m0), 0, 1));
      this.cam.set([lerp(1.05, 0.62, e), lerp(1.62, 1.52, e), lerp(3.55, 3.0, e)], [lerp(0.22, 0.14, e), 1.1, 0.3], 1.5);
      u.gl!.value = -5; u.gr!.value = 5;
    } else {
      const e = ease.inOutQuad(p);
      this.cam.set([lerp(0.4, 0.2, e), lerp(2.0, 1.85, e), lerp(7.6, 6.9, e)], [0, 1.05, 0], 1.55);
      // squabbling at the edges, frozen on "nothing", rushing in on "came"
      const slide = pr(t, tCame - 0.05, tCame + 0.45, (x) => ease.outBack(x, 1.4));
      // they stop at +-1.32 (not 1.16): the inner figures' swinging hands otherwise reach into the metronome (x 0.11..0.37)
      u.gl!.value = lerp(-3.1, -1.32, slide); u.gr!.value = lerp(3.1, 1.32, slide);
      u.gz!.value = lerp(0.9, 0.3, slide);
      u.sp!.value = lerp(0.62, 0.46, slide);
      const frozen = t > tNothing ? 1 : 0;
      u.rivArm!.value = frozen ? lerp(0.9, 1.35, pr(t, tCame + 0.3, tCame + 0.55, ease.outBack)) : 0.6 + 0.5 * Math.sin(t * 11);
      u.rivLift!.value = frozen ? 0.3 * pr(t, tCame + 0.3, tCame + 0.6) + yank(au, t) * 0.4 * pr(t, tCame + 0.4, tCame + 0.6) : yank(au, t);
      u.rivHead!.value = lerp(-0.5, 0.45, pr(t, tNothing, tNothing + 0.15));
      u.rivYaw!.value = lerp(-0.9, 0.1, pr(t, tNothing, tNothing + 0.2, ease.outBack)) - 0.45 * pr(t, tCame + 0.25, tCame + 0.5, ease.outCubic);
      // the photo: flashbulbs pop
      flashK = Math.max(0, Math.exp(-(t - tAnd2) * 10) * (t > tAnd2 ? 1 : 0), 0.7 * Math.exp(-(t - (tAnd2 - 0.25)) * 12) * (t > tAnd2 - 0.25 ? 1 : 0));
    }
    u.flashK!.value = flashK;
    u.spill!.value = shot.id === 'huddle' ? 1 : 0;
    this.cam.apply(u);
    u.t!.value = t;
    this.podium.render(renderer, out);
    // the metronome's tempo readout on the podium front (machine voice)
    const bpm = Math.round((m.rate / Math.PI) * 60);
    const q = this.cam.project([PODIUM.x, PODIUM.y + 0.36, PODIUM.z + PODIUM.hz + 0.01]);
    const q2 = this.cam.project([PODIUM.x + 0.3, PODIUM.y + 0.36, PODIUM.z + PODIUM.hz + 0.01]);
    const scale = Math.abs(q2.x - q.x) / 0.3; // px per metre at the podium
    c.save();
    c.textAlign = 'center';
    c.font = font(F.mono(800, 100), Math.max(22, Math.round(scale * 0.1)));
    c.fillStyle = rgba('signal', 0.95);
    c.fillText(`${String(bpm).padStart(3, '0')} BPM`, q.x, q.y + scale * 0.02);
    c.restore();
    void METRO;
    return { flash: flashK * 0.3, raysAt: [0.6, 1.1] as [number, number], rays: 0.15 };
  }

  // ------------------------------------------------------------------ karaoke
  lyricOpts(shot: Shot, light: { x: number; y: number }): LyricOpts {
    const base: LyricOpts = { x: 130, y: 862, size: 62, weight: 700, maxWidth: 1660, light, shadow: 230, shadowAlpha: 0.7, anticipate: 0.3, linger: 0.3, unsungAlpha: 0.42 };
    return base;
  }

  drawLyrics(c: CanvasRenderingContext2D, t: number, shot: Shot, light: { x: number; y: number }) {
    this.lines.forEach((line, i) => {
      const prev = this.lines[i - 1], next = this.lines[i + 1];
      const antic = Math.max(0, Math.min(0.3, prev ? line.start - prev.end : 0.3));
      const linger = Math.max(0, Math.min(0.3, next ? next.start - line.end : 0.3));
      if (t < line.start - antic || t > line.end + linger) return;
      drawLyric(c, line, t, { ...this.lyricOpts(shot, light), anticipate: antic, linger });
    });
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    const shot = this.shotAt(t);
    const c = this.text.ctx; this.text.clear();
    let post: PostOverrides = { ...GRADE.flash };
    let light = { x: 960, y: -300 };
    if (shot.id === 'sun' || shot.id === 'net') {
      const r = this.renderTown(f, out, shot);
      light = { x: r.sp.x, y: r.sp.y };
      // the sun's string: pale, incidental, vanishing upward
      if (r.sp.z > 0) {
        const topY = r.sp.y - (shot.id === 'sun' ? 2.7 : 3.5) * 1080 * this.cam.fl / r.sp.z;
        drawThread(c, r.sp.x, topY, r.sp.x + 6, -20, t, { alpha: 0.45, width: 1.1, sway: 2 });
      }
      post = { ...post, rays: shot.id === 'sun' ? 0.35 : 0.2, raysAt: r.sunUV };
    } else if (shot.id === 'planned') {
      post = { ...post, ...this.renderPlanned(f, out, shot) };
      light = { x: 1500, y: -200 };
    } else if (shot.id === 'credits') {
      post = { ...post, ...this.renderCredits(f, out, shot) };
      light = { x: 1250, y: -250 };
    } else if (shot.id === 'board') {
      post = { ...post, ...this.renderBoard(f, out, shot, c) };
      light = { x: 960, y: -200 };
    } else {
      post = { ...post, ...this.renderPodium(f, out, shot, c) };
      light = { x: 1350, y: -350 };
    }
    this.drawLyrics(c, t, shot, light);
    comp.draw(renderer, this.text.upload(), out);
    return post;
  }
}
