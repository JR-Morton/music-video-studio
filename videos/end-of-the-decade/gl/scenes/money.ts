// `money`: final chorus, full band (138.33–155.32, `money`). The band slams back: garish brass money light, coins
// out of the sky, an LED ticker on the facade, the crowd yanked hardest, a cuffed hand pumping the floor spotlight so
// the robot's shadow swells. Then the turn: the camera stops dancing, walks up the aisle into the big shadow and finds
// the small tin robot standing in the light (the `dawn` plate cuts in from there). Shots on the downbeats (bars 65–72):
//   M1 b65     SLAM, wide: the town yanked into the biggest dance, coins burst out of the dark ("...they're led" held)
//   M2 b66     "So smile and sing along": the crowd's faces, caution-yellow smiles, yanked on the beat
//   M3 b67     the widest shot: the crowd under the giant shadow, the ticker "THE MONEY’S BEING MADE"
//   M4 b68     "The money's being made": up at the hands working the crosses, coins pouring down
//   M5 b69     the cuffed hand pumps the spotlight on the beats; the shadow swells over everything
//   M6 b70–72  "We've got till the end of the decade": the camera stops; four steps up the aisle into the shadow;
//              the small tin robot, lit, looks up
import * as THREE from 'three';
import { Scene, type Frame } from '@engine/scene';
import { Layer2D } from '@engine/gl';
import { LIN } from '@engine/palette';
import { F, font } from '@engine/type';
import { clamp, ease, lerp } from '@engine/util';
import { GRADE, clockwork, yank } from './_look';
import { Stage, STAGE, crowdPose, applyPose, lineIn, drawLines, type Cam } from './strings-stage';
import type { Line } from '@engine/lyrics';

/** a line sung less than HOLD s before its home shot's cut waits for the cut; ANTICIPATE: the lines' fade-in */
const HOLD = 0.5, ANTICIPATE = 0.3;

type V3 = [number, number, number];
const mixV = (a: V3, b: V3, u: number): V3 => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
const sc = (c: readonly number[], k: number): V3 => [c[0]! * k, c[1]! * k, c[2]! * k];

function tickerTexture(): THREE.Texture {
  const cv = document.createElement('canvas');
  cv.width = 1280; cv.height = 80;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#000'; c.fillRect(0, 0, cv.width, cv.height);
  c.fillStyle = '#fff';
  c.font = font(F.mono(800, 100), 62);
  c.textBaseline = 'middle';
  const msg = 'THE MONEY’S BEING MADE  +$2,000,000,000  ';
  const w = c.measureText(msg).width;
  const k = cv.width / w; // fit exactly once across the strip so it tiles seamlessly
  c.save(); c.scale(k, 1); c.fillText(msg, 0, cv.height / 2 + 3); c.restore();
  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

export default class Money extends Scene {
  stage!: Stage;
  text = new Layer2D();
  db: number[] = [];

  override async init() {
    const { audio } = this.ctx;
    this.db = audio.downbeats.filter((d) => d > this.ctx.start - 0.05 && d < this.ctx.end + 0.05);
    this.stage = new Stage(tickerTexture());
  }

  /** the cuts: shot i runs bounds[i]..bounds[i+1] */
  bounds(): number[] {
    const d = this.db;
    return [d[0]!, d[1]!, d[2]!, d[3]!, d[4]!, d[5]!, this.ctx.end];
  }

  shot(t: number): [number, number] {
    const bounds = this.bounds();
    for (let i = 0; i < 6; i++) if (t < bounds[i + 1]!) return [i, (t - bounds[i]!) / (bounds[i + 1]! - bounds[i]!)];
    return [5, 1];
  }

  /**
   * Type never jumps on a cut (as in `strings`): a line is laid out once, for its home shot (the one it's sung in
   * longest), and keeps that layout and light across cuts. A line whose home shot starts less than HOLD s after the
   * line does (or during its fade-in) waits for that cut instead of flashing up in the shot before.
   */
  home(l: Line): { si: number; show: number } {
    const b = this.bounds();
    let si = 0, best = -1;
    for (let i = 0; i < 6; i++) {
      const o = Math.min(l.end, b[i + 1]!) - Math.max(l.start, b[i]!);
      if (o > best) { best = o; si = i; }
    }
    const early = b[si]! - l.start;
    return { si, show: early > -ANTICIPATE && early < HOLD ? b[si]! : -Infinity };
  }

  /** M6's walk up the aisle: 0..1 over the four steps, and the settle after it */
  walk(t: number) {
    const { audio } = this.ctx;
    const walk0 = this.db[6]!, walk1 = this.db[7]!;
    const bt = audio.beatAt(t) - audio.beatAt(walk0); // beats since the walk began
    let steps = 0;
    if (t >= walk0) {
      const i = Math.min(4, Math.floor(bt));
      const ph = bt - Math.floor(bt);
      steps = i >= 4 ? 4 : i + ease.inOutCubic(clamp(ph / 0.7, 0, 1));
    }
    return { s4: steps / 4, settle: ease.inOutCubic(clamp((t - walk1) / (this.ctx.end - walk1), 0, 1)) };
  }

  /** the spotlight's distance from the robot in shot si at t: the cuffed hand pumps it on every beat (b65–69) */
  lamp(si: number, t: number) {
    const { audio } = this.ctx;
    const loud = t < this.db[5]!;
    const bph = audio.beatAt(t) - Math.floor(audio.beatAt(t));
    const pumpAmt = si === 4 ? 0.6 : loud ? 0.25 : 0;
    const pump = pumpAmt * (bph < 0.12 ? ease.outCubic(bph / 0.12) : 1 - ease.inOutQuad(clamp((bph - 0.12) / 0.8, 0, 1)));
    const dist = (si === 4 ? 1.0 : si >= 5 ? 0.75 : si === 2 ? 0.62 : si === 3 ? 0.6 : 0.7) - pump * (si === 4 ? 0.85 : 0.3);
    return { pump, lz: STAGE.robot[2] + dist };
  }

  /** camera of shot si at t (progress clamped, so a line lingering past its home shot can still use its light) */
  camAt(si: number, t: number): Cam {
    const b = this.bounds();
    const sp = clamp((t - b[si]!) / (b[si + 1]! - b[si]!), 0, 1);
    // camera dance (b65–69): a beat sway; gone after the turn
    const beatSway = t < this.db[5]! ? Math.sin(this.ctx.audio.beatAt(t) * Math.PI) * 0.12 : 0;
    switch (si) {
      case 0: return { pos: mixV([-4.5, 6.2, 17], [-3.2, 5.0, 14.5], ease.outCubic(sp)), ta: [0.5, 2.6, -6], focal: 1.35, roll: -0.04 + beatSway * 0.2 };
      case 1: return { pos: mixV([1.4, 1.75, -4.4], [0.6, 1.7, -4.2], ease.inOutQuad(sp)), ta: [2.4, 1.55, 2.5], focal: 1.6, roll: beatSway * 0.25 };
      case 2: { const u = ease.inOutQuad(sp); return { pos: mixV([0.5, 3.6, 17], [0.3, 3.1, 15], u), ta: mixV([0, 3.2, -9.5], [0, 3.4, -9.5], u), focal: 1.2, roll: beatSway * 0.1 }; }
      case 3: return { pos: mixV([2.4, 5.6, 6.2], [2.2, 6.0, 5.6], sp), ta: mixV([2.0, 9.4, 3.2], [1.9, 9.6, 2.6], sp), focal: 1.3, roll: beatSway * 0.2 };
      case 4: return { pos: mixV([2.6, 0.9, -2.0], [2.3, 0.85, -2.4], sp), ta: [0.2, 2.0, -8.5], focal: 1.15, roll: beatSway * 0.3 };
      default: {
        // M6: the turn. Held still for the first bar, then four steps up the aisle on the beats into the shadow
        const { s4, settle } = this.walk(t);
        const path: V3[] = [[0, 2.2, 9.0], [0, 1.7, 3.5], [0.05, 1.2, -0.8], [0.3, 0.7, -2.6], [0.5, 0.42, -3.55]];
        const k = s4 * 4;
        const i0 = Math.min(3, Math.floor(k));
        const pos = mixV(path[i0]!, path[i0 + 1]!, k - i0);
        const ta0: V3 = [0, 2.2, -9.5], ta1: V3 = [0, 1.25, -9.5];
        return { pos: mixV(pos, [0.62, 0.36, -3.75], settle * 0.6), ta: mixV(ta0, ta1, ease.inOutQuad(s4)), focal: lerp(1.3, 1.15, s4), roll: 0 };
      }
    }
  }

  /** where the lead type sits in shot si (M6's shrinks and rises as we walk into the shadow) */
  lyrAt(si: number, t: number): { y: number; size: number; upper: boolean; shadow: number } {
    switch (si) {
      case 0: return { y: 420, size: 112, upper: true, shadow: 160 };
      case 1: return { y: 200, size: 96, upper: false, shadow: 160 };
      case 2: return { y: 900, size: 92, upper: false, shadow: 160 };
      case 3: return { y: 900, size: 96, upper: false, shadow: 160 };
      case 4: return { y: 900, size: 92, upper: false, shadow: 260 };
      default: {
        // the wall shadow is the frame now: keep the type high, over it. Size and place stay fixed through the walk
        // (a size change re-wrapped the line mid-walk and a word jumped a line); only its shadow softens.
        const { s4 } = this.walk(t);
        return { y: 200, size: 76, upper: false, shadow: lerp(200, 120, s4) };
      }
    }
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp, lyrics, audio } = this.ctx;
    const st = this.stage;
    const t = f.t;
    const [si, sp] = this.shot(t);
    const R = STAGE.robot;
    const L = (s: string) => lineIn(lyrics, s, this.ctx.start - 6, this.ctx.end);
    const turn = this.db[5]!; // b70: the camera stops dancing
    const walk0 = this.db[6]!, walk1 = this.db[7]!; // four steps up the aisle (b71)
    const loud = t < turn;

    // ---- the crowd: yanked hardest (b65–69), still dancing after the turn but less
    const amp = loud ? 1.35 : 0.9;
    const pose = crowdPose(audio, t, amp, loud ? 0.15 : 0.1, loud);
    applyPose(st, pose);
    st.set('tremble', 0.3);
    st.set('uT', t);
    st.set('crowdW', STAGE.NX); st.set('crowdFar', STAGE.NZ);

    // ---- money light
    st.set('money', 1);
    st.set('keyPos', [4, 18, 3]);
    st.set('keyTa', [0, 0, 6]);
    st.set('keyCone', 0.9);
    st.set('keyCol', sc([1.0, 0.72, 0.32], 13 * (loud ? 1 + 0.25 * f.a.kick : 0.8)));
    st.set('fillCol', mixV([0.22, 0.12, 0.05], [0.07, 0.06, 0.16], clamp((t - turn) / 3, 0, 1)));
    st.set('rimCol', [1.2, 0.8, 0.35]);
    st.set('wallTint', [0.5, 0.36, 0.16]);
    st.set('skyCol', [0.02, 0.014, 0.01]);
    st.set('hazeCol', [0.25, 0.16, 0.07]);
    st.set('lampCol', mixV(LIN.signal as V3, [1, 1, 1], 0.45));
    st.set('stringGlow', 0.9); st.set('stringTop', 9.5);
    st.set('skyHands', 0); st.set('fillPos', [-6, 4, 12]); st.set('marchMax', 60); st.set('smile', 0);
    // the ticker lights up on b67 (with a flicker) and goes dark when the camera stops
    const tOn = t >= this.db[2]! ? (t - this.db[2]! < 0.25 ? (Math.floor((t - this.db[2]!) * 24) % 2) : 1) : 0;
    st.set('ticker', tOn * (1 - clamp((t - turn) / 0.4, 0, 1))); st.set('tickScroll', t * 2.2);
    // coins: burst out of the dark on the slam, pour through b69, stop at the turn
    const T0 = this.db[0]! - 0.15, speed = 3.4;
    st.set('coins', t < turn + 3.5 ? (si === 0 || si === 3 ? 0.55 : 0.3) : 0);
    st.set('coinPhase', Math.max(0, t - T0) * speed);
    st.set('coinStop', (turn - T0) * speed);

    // ---- the robot on its own clock; it looks round at us at the end
    const look = t > walk1 ? lerp(0.5 * Math.sin(clockwork(t, 0.9, 5) * 1.3), -0.45, ease.inOutCubic(clamp((t - walk1 - 0.3) / 0.8, 0, 1))) : 0.5 * Math.sin(clockwork(t, 0.9, 5) * 1.3);
    st.set('robotWalk', clockwork(t, 3.1, 2) * 1.1 * (t > walk1 ? 0.3 : 1));
    st.set('robotLook', look);

    // ---- the spotlight rig: the cuffed hand pumps it at the robot on every beat (b65–69), hardest in b69
    const { pump, lz } = this.lamp(si, t);
    st.set('lampPos', [0, 0.16, lz]);
    st.set('lampPitch', 0.22);
    st.set('lampPow', (t > walk0 ? lerp(3.2, 1.25, clamp((t - walk0) / 3, 0, 1)) : 3.2) * (1 + 0.04 * Math.sin(t * 37)));
    st.set('lampCone', 0.55);
    st.set('lampHaze', 0.45);
    // after the turn the hand lets go and withdraws up into the dark with its pole (b71, while we walk in)
    const letGo = ease.inOutCubic(clamp((t - walk0) / (walk1 - walk0), 0, 1));
    const grip: V3 = [-0.3, 1.5 + pump * 0.3 + letGo * 9, lz + 0.5];
    st.set('handGrip', grip);
    st.set('rodLen', Math.hypot(0.3, 1.5 - 0.13 * 3.2 - 0.1, 0.5));
    st.set('shadowLift', loud ? 0.25 : lerp(0.25, 0.6, letGo));
    st.set('handScale', 3.2);
    st.set('handPinch', 0.9);

    const cam = this.camAt(si, t);
    // camera dance (b65–69): a kick bump; gone after the turn
    const bump = loud ? f.a.kick : 0;
    if (si === 0) {
      // M1: the slam, wide and high behind the crowd
      st.set('crowdFar', 8);
    } else if (si === 1) {
      // M2: the faces, smiling in caution yellow (camera in the clearing looking back at the front rows)
      st.set('smile', 1);
      st.set('lampPow', 0.0); // the lamp is behind us here; its glare would spoil the faces
    } else if (si === 2) {
      // M3: the widest shot: the crowd under the giant shadow, the ticker
      st.set('stringGlow', 0.35); st.set('lampHaze', 0.2); st.set('crowdFar', 8);
    } else if (si === 3) {
      // M4: the hands above, working the crosses; coins pouring past
      st.set('skyHands', 1);
      st.set('fillCol', [2.0, 1.3, 0.55]); st.set('fillPos', [1.5, 5.5, 3.5]);
      st.set('skyPinch', 0.4 + 0.6 * yank(audio, t));
      st.set('stringTop', 14);
    } else if (si === 4) {
      // M5: the hand pumping the spotlight; the shadow swells over everything
      st.set('lampPow', 2.4);
    } else {
      // M6: the turn (camera in camAt)
      st.set('crowdFar', 6);
    }
    st.cam(cam);
    st.pass.render(renderer, out);

    // ---- type
    const c = this.text.ctx; this.text.clear();
    const lampPx = st.project(cam, [0, 0.35, lz]);
    // the light that casts a line's shadow: the spotlight, seen from its home shot's camera (overhead if behind it)
    const lightFor = (h: number) => {
      const p = st.project(this.camAt(h, t), [0, 0.35, this.lamp(h, t).lz]);
      return p.z > 0 ? { x: p.x, y: p.y } : { x: 960, y: -400 };
    };
    const seq = ['way they', 'smile and sing', 'being made', 'got till'].map((s) => L(s));
    drawLines(c, seq.filter((l) => l === seq[0] || t >= this.home(l).show), t, (ln) => {
      // "…the way they're led" is carried over from `strings` (its "led" is held across the slam): exactly as it sat
      // there (strings' last shot), so the type doesn't jump on the plate cut; the slam is the picture's
      if (ln === seq[0]) return { x: 960, y: 860, size: 88, align: 'center', weight: 700, light: { x: 960, y: -300 }, shadow: 140, linger: 0, maxWidth: 1500 };
      const h = this.home(ln).si, y = this.lyrAt(h, t), last = ln === seq[3];
      // the last line: one line across the top (no re-wrap), and its fade-out finishes before the cut to `dawn`
      return { x: 960, y: y.y, size: y.size, align: 'center', weight: 700, upper: false, light: lightFor(h), shadow: y.shadow,
        linger: last ? Math.max(0.1, this.ctx.end - ln.end - 0.02) : 0.45, anticipate: 0.3, maxWidth: last ? 1800 : 1500, unsungAlpha: 0.45 };
    });
    comp.draw(renderer, this.text.upload(), out);

    const shake: [number, number] = loud ? [Math.sin(t * 71) * 6 * bump, Math.cos(t * 53) * 6 * bump] : [0, 0];
    const slam = Math.max(0, 1 - (t - this.db[0]!) / 0.35);
    return {
      ...GRADE.money,
      raysAt: [lampPx.x / 1920, 1 - lampPx.y / 1080] as [number, number],
      rays: si >= 5 ? lerp(0.3, 0.08, clamp((t - walk0) / 2, 0, 1)) : lampPx.z > 0 ? 0.35 : 0.1,
      shake, zoom: 1 + 0.02 * bump + 0.05 * slam, flash: 0.35 * slam,
    };
  }
}
