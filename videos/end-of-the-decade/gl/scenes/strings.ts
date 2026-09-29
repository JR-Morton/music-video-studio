// `strings`: final chorus, stripped (123.46–138.33, `cold`). Back down in the town, cold and quiet; the same crowd,
// but now every string is lit silver all the way up. Shots cut on the downbeats (bars 58–64):
//   S1 b58–59  wide over the crowd to the facade: "By the end of the decade" + the backing echo
//   S2 b60     the clearing: a cuffed hand swings the floor spotlight onto the small tin robot; on "warning" its shadow
//              swells up the facade ("That's what the warning said"; the echo lingers)
//   S3 b61     near-silent: one puppet, close; the dance goes small and eerie, strings taut and trembling
//   S4 b62     "A hundred million people": over the crowd to the horizon, all dancing (half the cells mirrored)
//   S5 b63     "Moving just the way they're led": low along the rows, the unison lean left/right on the beats
//   S6 b64     tilt up the strings to a sky of hands working the crosses, arriving on "led"
import * as THREE from 'three';
import { Scene, type Frame } from '@engine/scene';
import { Layer2D } from '@engine/gl';
import { LIN } from '@engine/palette';
import { clamp, ease, keys, lerp } from '@engine/util';
import { GRADE, drawLyric, drawEcho, clockwork } from './_look';
import { Stage, STAGE, crowdPose, applyPose, lineIn, drawLines, type Cam } from './strings-stage';
import type { Line } from '@engine/lyrics';

type V3 = [number, number, number];
/** where the lead line sits in each shot (S1..S6), and the backing echo (S1, S2) */
const LYR = [{ y: 270, size: 96 }, { y: 210, size: 84 }, { y: 200, size: 88 }, { y: 230, size: 96 }, { y: 230, size: 90 }, { y: 860, size: 88 }];
const ECHO = [{ y: 450, size: 44 }, { y: 340, size: 34 }];
/** a line sung less than this long before its home shot's cut waits for the cut (see Strings.home) */
const HOLD = 0.5;
const mixV = (a: V3, b: V3, u: number): V3 => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
const sc = (c: readonly number[], k: number): V3 => [c[0]! * k, c[1]! * k, c[2]! * k];

export default class Strings extends Scene {
  stage = new Stage();
  text = new Layer2D();
  db: number[] = [];

  override async init() {
    const { audio } = this.ctx;
    this.db = audio.downbeats.filter((d) => d > this.ctx.start - 0.05 && d < this.ctx.end + 0.05);
  }

  /** the cuts: shot i runs bounds[i]..bounds[i+1] */
  bounds(): number[] {
    const d = this.db;
    return [d[0]!, d[2]!, d[3]!, d[4]!, d[5]!, d[6]!, this.ctx.end];
  }

  /** shot index and local 0..1 */
  shot(t: number): [number, number, number] {
    const bounds = this.bounds();
    for (let i = 0; i < 6; i++) if (t < bounds[i + 1]!) return [i, (t - bounds[i]!) / (bounds[i + 1]! - bounds[i]!), t - bounds[i]!];
    return [5, 1, t - bounds[5]!];
  }

  /**
   * Type never jumps on a cut. A line is laid out once, for its home shot (the one it's sung in longest), and keeps
   * that layout (place, size, light) for as long as it's on screen, across any cut. A line whose home shot starts less
   * than HOLD s after the line does (or during its fade-in) waits for that cut instead of flashing up in the last frames of the shot before
   * (it appears on the cut with its first word already lit).
   */
  home(l: Line): { si: number; show: number } {
    const b = this.bounds();
    let si = 0, best = -1;
    for (let i = 0; i < 6; i++) {
      const o = Math.min(l.end, b[i + 1]!) - Math.max(l.start, b[i]!);
      if (o > best) { best = o; si = i; }
    }
    const early = b[si]! - l.start; // sung before its home shot starts
    return { si, show: early > -0.35 && early < HOLD ? b[si]! : -Infinity }; // (-0.35: or during its fade-in)
  }

  /** camera of shot si at song time t (progress clamped, so a line lingering past its home shot can still use it) */
  camAt(si: number, t: number): Cam {
    const b = this.bounds();
    const sp = clamp((t - b[si]!) / (b[si + 1]! - b[si]!), 0, 1);
    switch (si) {
      case 0: return { pos: mixV([5.5, 7.5, 19], [3.2, 4.4, 13], ease.outCubic(sp)), ta: mixV([0, 3.4, -6], [0, 3.0, -7], ease.inOutQuad(sp)), focal: 1.55, roll: 0 };
      case 1: return { pos: mixV([1.6, 0.75, -1.9], [1.2, 0.6, -2.4], ease.inOutQuad(sp)), ta: mixV([0.1, 2.0, -9.5], [0.0, 2.4, -9.5], sp), focal: 1.15, roll: 0 };
      case 2: return { pos: mixV([0.55, 1.2, -4.1], [0.75, 1.25, -3.6], ease.inOutCubic(sp)), ta: [1.5, 1.75, -1.5], focal: 1.25, roll: 0.02 };
      case 3: return { pos: mixV([0.6, 5.0, -3.3], [0.6, 6.4, -3.6], ease.outCubic(sp)), ta: mixV([0.4, 1.4, 10], [0.4, 0.8, 16], sp), focal: 1.3, roll: 0 };
      case 4: return { pos: mixV([-12.5, 1.0, 10.0], [-11.6, 1.1, 9.2], sp), ta: mixV([-2, 1.7, 3.5], [-1.5, 1.8, 3.0], sp), focal: 1.6, roll: 0 };
      default: {
        // S6: tilt up the strings to the hands (arrive on "led")
        const led = lineIn(this.ctx.lyrics, 'way they', this.ctx.start, this.ctx.end).words[5]!.start;
        const tu = ease.inOutCubic(clamp((t - this.db[6]!) / (led - this.db[6]!), 0, 1));
        return { pos: mixV([2.3, 1.6, -3.4], [2.3, 4.4, -3.6], tu), ta: mixV([2.3, 1.7, 3.0], [2.3, 9.8, 1.2], tu), focal: 1.45, roll: 0 };
      }
    }
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp, lyrics, audio } = this.ctx;
    const st = this.stage;
    const t = f.t;
    const [si] = this.shot(t);
    const R = STAGE.robot;
    const L = (s: string) => lineIn(lyrics, s, this.ctx.start, this.ctx.end);
    const warning = L('warning said').words[3]!.start;

    // ---- the crowd dances on the beat (yanked up on each beat, alternate arm lifted, lean left/right, head nods), smaller
    // and eerier than `money`; half the cells pull the other arm, and every cell's bob/lean is scaled a little. Bar 61
    // (S3, near-silent): smaller still, strings taut and trembling, the head turning slowly on the half-bar.
    const quiet = si === 2;
    const amp = quiet ? 0.8 : 0.95, swayAmt = quiet ? 0.08 : 0.11;
    const pose = crowdPose(audio, t, amp, swayAmt);
    const pose2 = crowdPose(audio, t, amp, swayAmt, false, true);
    // head: a slow look side to side, turning on every other beat (B looks the other way)
    const hb = audio.beatAt(t) / 2, hi = Math.floor(hb);
    const look = (hi % 2 === 0 ? 1 : -1) * (2 * ease.outCubic(clamp((hb - hi) / 0.3, 0, 1)) - 1) * (quiet ? 0.3 : 0.2);
    pose.head[1] = look; pose2.head[1] = -look;
    // a deeper bob than the shared pose: the lift reads in the wide and overhead shots
    pose.lift = pose2.lift = 0.04 + (pose.lift - 0.04) * 1.4;
    applyPose(st, pose, pose2, 1);
    st.set('tremble', quiet ? 1 : 0.15);
    st.set('uT', t);

    // ---- light: cold moon + the floor spotlight (off until the hand swings it on in S2)
    st.set('keyPos', [-5, 18, 1]);
    st.set('keyTa', [0, 0, 5]);
    st.set('keyCone', 0.87);
    st.set('keyCol', sc([0.72, 0.84, 1.0], 9));
    st.set('fillCol', [0.1, 0.13, 0.24]);
    st.set('rimCol', [0.35, 0.45, 0.7]);
    st.set('wallTint', [0.22, 0.26, 0.36]); st.set('crowdW', STAGE.NX);
    st.set('skyCol', [0.008, 0.011, 0.022]);
    st.set('hazeCol', [0.1, 0.13, 0.2]);
    st.set('lampCol', mixV(LIN.signal as V3, [1, 1, 1], 0.55));
    st.set('money', 0); st.set('coins', 0); st.set('ticker', 0);
    st.set('stringGlow', 1.0); st.set('stringTop', 9.5);
    st.set('skyHands', 0); st.set('fillPos', [-6, 4, 12]); st.set('marchMax', 60); st.set('crowdFar', STAGE.NZ);
    st.set('robotWalk', clockwork(t, 3.1, 2) * 1.1);
    st.set('robotLook', 0.5 * Math.sin(clockwork(t, 0.9, 5) * 1.3));
    st.set('handPinch', 0.9);

    // the spotlight rig: parked dark to the left, then swung in on "warning" (S2) and left on
    const swing = ease.inOutCubic(clamp((t - (warning - 0.75)) / 0.75, 0, 1));
    const lampOn = clamp((t - (warning - 0.1)) / 0.25, 0, 1);
    const lx = lerp(-1.6, 0, swing);
    const lz = lerp(-3.8, R[2] + 0.85, swing);
    st.set('lampPos', [lx, 0.16, lz]);
    st.set('lampPitch', 0.22);
    st.set('lampPow', 1.7 * lampOn * (1 + 0.05 * Math.sin(t * 40)));
    st.set('lampCone', 0.55);
    st.set('lampHaze', 0.35);
    st.set('handGrip', [lx - 0.3, lerp(2.6, 1.5, swing), lz + 0.5]);
    st.set('handScale', 3.2);
    st.set('rodLen', Math.hypot(0.3, 1.5 - 0.13 * 3.2 - 0.1, 0.5));
    st.set('handOn', 1);

    const cam = this.camAt(si, t);
    if (si === 0) {
      // S1: wide, a slow crane down over the crowd towards the facade
      st.set('crowdFar', 8);
    } else if (si === 2) {
      // S3: the freeze: one puppet in the front row, strings taut and trembling; a slow push
      st.set('keyPos', [-1, 12, -7]); st.set('keyTa', [1.5, 0.8, -1.5]); st.set('keyCone', 0.985); st.set('keyCol', sc([0.72, 0.84, 1.0], 9)); st.set('fillCol', [0.05, 0.065, 0.12]); st.set('lampHaze', 0.1);
    } else if (si === 3) {
      // S4: over the crowd to the horizon
      st.set('crowdFar', 24); st.set('marchMax', 45); st.set('keyPos', [-3, 16, -6]); st.set('keyTa', [0, 0, 8]); st.set('keyCone', 0.85); st.set('keyCol', sc([0.72, 0.84, 1.0], 14));
    } else if (si === 4) {
      // S5: low along the rows, the unison lean
      st.set('crowdW', 6);
    } else if (si === 5) {
      // S6: tilt up the strings to the hands (arrive on "led")
      const led = L('way they').words[5]!.start;
      const tu = ease.inOutCubic(clamp((t - this.db[6]!) / (led - this.db[6]!), 0, 1));
      st.set('skyHands', 1);
      st.set('skyPinch', 0.6 + 0.4 * pose.lift * 3);
      st.set('fillCol', [1.1, 1.3, 2.0]); st.set('fillPos', [1.5, 5.5, 3.5]); st.set('rimCol', [0.9, 1.0, 1.3]);
      st.set('stringTop', lerp(9.5, 14, tu));
    }
    st.cam(cam);
    st.pass.render(renderer, out);

    // ---- type
    const c = this.text.ctx; this.text.clear();
    const lines = ['By the end', 'warning said', 'hundred million', 'way they'].map((s) => L(s));
    const onScreen = lines.filter((l) => t >= this.home(l).show);
    drawLines(c, onScreen, t, (ln) => {
      const h = this.home(ln).si, y = LYR[h]!;
      // the light that casts the type's shadow: the swung spotlight in S2 (seen from S2's camera), else the moon
      const light = h === 1 ? st.project(this.camAt(1, t), [lx, 0.2, lz]) : { x: 960, y: -300 };
      return { x: 960, y: y.y, size: y.size, align: 'center', weight: 700, light, shadow: h === 1 ? 180 : 140, linger: ln.text.startsWith('Moving') ? 2 : 0.5, maxWidth: 1500 };
    });
    const back = lyrics.lines.find((l) => l.backing && t >= l.start - 0.2 && t < l.end + 0.8);
    if (back) {
      const e = ECHO[this.home(back).si] ?? { y: 380, size: 28 };
      drawEcho(c, lyrics, t, { x: 960, y: e.y, size: e.size, align: 'center', dy: e.size * 1.2 });
    }
    comp.draw(renderer, this.text.upload(), out);

    const lp = st.project(cam, [lx, 0.3, lz]);
    return { ...GRADE.cold, raysAt: [lp.x / 1920, 1 - lp.y / 1080] as [number, number], rays: 0.3 * lampOn };
  }
}
