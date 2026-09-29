// hook: the instrumental dance break (66.11–72.49), "dusk" grade. The marionette town dances in unison under sweeping
// spotlights; tin robots zip between the rows on their own clock; a cuffed hand dangles a hook on a string to snag
// one and misses (a cameo); over the last bar night falls.
//   H1 66.11 wide and high: the whole square dancing, beams crossing on the beat
//   H2 68.24 low at robot height: the hook drops out of the dark at the red robot, which hops clear; the hook yanks up
//   H3 70.36 pull back and up: the beams narrow, night falls
import * as THREE from 'three';
import { Scene, type Frame } from '@engine/scene';
import { Layer2D } from '@engine/gl';
import { LineBatch } from '@engine/lines';
import { LIN } from '@engine/palette';
import { clamp, ease, keys, lerp } from '@engine/util';
import { GRADE, clockwork, yank } from './_look';
import { makeWorldPass, makeSignTexture, project, syncThreeCam, lerpCam, crowdStrings, type Cam } from './decade-world';

const WALL_Z = -20;
const CROWD = { x: 17, front: -2.2, back: -18.5 };
const GAP_Z = -1.2; // the aisle in front of the first row where the robots zip

export default class Hook extends Scene {
  world!: ReturnType<typeof makeWorldPass>;
  strings = new LineBatch(6000, { screen2D: false, blend: 'add' });
  cam3 = new THREE.PerspectiveCamera();

  override async init() { this.world = makeWorldPass(makeSignTexture()); }

  db(i: number) { const au = this.ctx.audio; return au.timeOfBeat(Math.round(au.beatAt(this.ctx.start)) + i * 4); }

  /** Beat k of the hook shot (H2): beat 0 is the shot's first downbeat. */
  hb(k: number) { const au = this.ctx.audio; return au.timeOfBeat(Math.round(au.beatAt(this.db(1))) + k); }

  /** The hook beats: it drops in and hovers just over the robot's antennae, the robot hops clear, THEN the hook
   *  plunges (landing on the beat), swings, and yanks up. The hook never goes below the robot's head while the
   *  robot is under it (see hookY's guard). */
  hookBeats() {
    const b = (k: number) => this.hb(k);
    return { tIn: b(0.4), tHover: b(1.2), tDodge: b(1.45), tStrike: b(1.6), tLand: b(2), tUp: b(3) };
  }

  /** The red robot's x along the aisle: clockwork steps, with a quick hop forward just as the hook strikes. */
  redX(t: number) {
    const { tDodge } = this.hookBeats();
    const base = -2.6 + (clockwork(t, 3.3, 7, 0.4) - clockwork(66.1, 3.3, 7, 0.4)) * 0.085;
    const hop = 0.55 * ease.outBack(clamp((t - tDodge) / 0.28, 0, 1));
    return base + hop;
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, audio } = this.ctx;
    const t = f.t, d = (i: number) => this.db(i);
    const u = this.world.u;
    let cam: Cam, shot = 1;
    let night = 0, spots = 1;
    const hb = this.hookBeats();
    const hookX0 = this.redX(hb.tDodge) - 0.05; // where the hand aims: where the robot WAS going to be
    if (t < d(1)) {
      const v = clamp((t - d(0)) / (d(1) - d(0)), 0, 1);
      cam = lerpCam({ ro: [-5, 3.4, 6.5], ta: [1, 1.4, -6], focal: 1.25 }, { ro: [-1.5, 3.0, 6.0], ta: [1.5, 1.4, -6], focal: 1.3 }, ease.inOutQuad(v));
    } else if (t < d(2)) {
      shot = 2;
      const v = clamp((t - d(1)) / (d(2) - d(1)), 0, 1);
      cam = lerpCam({ ro: [-0.1, 0.5, 0.75], ta: [-1.9, 0.62, -1.35], focal: 1.4 }, { ro: [-0.25, 0.52, 0.6], ta: [-1.7, 0.65, -1.35], focal: 1.45 }, ease.inOutQuad(v));
    } else {
      shot = 3;
      const v = clamp((t - d(2)) / (d(3) - d(2)), 0, 1);
      cam = lerpCam({ ro: [0, 2.2, 7], ta: [0, 2.0, -10], focal: 1.3 }, { ro: [0, 9, 17], ta: [0, 1.5, -10], focal: 1.3 }, ease.inOutCubic(v));
      night = ease.inOutQuad(v);
      spots = 1 - 0.4 * v;
    }
    if (shot !== 2) cam.ro[1] += 0.06 * yank(audio, t); // the camera bounces with the crowd
    (u.camPos!.value as THREE.Vector3).set(...cam.ro);
    (u.camTa!.value as THREE.Vector3).set(...cam.ta);
    u.camFocal!.value = cam.focal;
    // the robot lamp stays on, low (the shadow is resting)
    (u.lampPos!.value as THREE.Vector3).set(-0.5, 0.22, 3.2);
    (u.lampDir!.value as THREE.Vector3).set(0.5, 5.0, WALL_Z - 3.2).normalize();
    u.lampOn!.value = 0.6 * (1 - 0.5 * night); u.lampPow!.value = 3; u.lampCone!.value = 0.85;
    const rob = u.rob!.value as THREE.Vector4[], robB = u.robB!.value as THREE.Vector4[];
    rob[0]!.set(0, 1.2, 0.3 * Math.sin(clockwork(t, 1.7, 2)), clockwork(t, 2.9, 1) * 0.8);
    robB[0]!.set(0.4 * Math.sin(clockwork(t, 1.1, 9)), 0, 1, 1);
    // red robot: the target, walking +x along the aisle
    const rx = this.redX(t);
    const hopY = 0; // (hop is horizontal)
    rob[1]!.set(rx, GAP_Z, Math.PI / 2, clockwork(t, 5.1, 3) * 1.4);
    robB[1]!.set(t > hb.tLand && t < hb.tUp + 0.4 ? -1.1 : 0.3 * Math.sin(clockwork(t, 1.3, 4)), 1, 1, 1);
    void hopY;
    // blue robot: zips the other way further along the aisle; bare tin one in the second aisle (placed so that, seen
    // from the H2 camera, it is never lined up behind the landed hook)
    rob[2]!.set(2.2 - (clockwork(t, 4.3, 5, 0.3) - clockwork(66.1, 4.3, 5, 0.3)) * 0.11, GAP_Z + 0.25, -Math.PI / 2, clockwork(t, 6.7, 6) * 1.4);
    robB[2]!.set(0.2, 2, 1, 1);
    rob[3]!.set(-3.9 + (clockwork(t, 3.7, 8, 0.3) - clockwork(66.1, 3.7, 8, 0.3)) * 0.1, -2.2 - 1.55 * 0.5 - 0.1, Math.PI / 2, clockwork(t, 5.9, 2) * 1.4);
    robB[3]!.set(-0.3, 3, 1, 1);
    // crowd: dancing in unison
    (u.crowdBox!.value as THREE.Vector4).set(CROWD.x, CROWD.front, CROWD.back, -999);
    const yk = [0, 0.03, 0.06, 0.09].map((dd) => yank(audio, t - dd, true));
    (u.yk!.value as THREE.Vector4).set(yk[0]!, yk[1]!, yk[2]!, yk[3]!);
    (u.pose!.value as THREE.Vector4).set(0.5, 0, 0, 0.9);
    u.rippleZ!.value = 99; u.smile!.value = 1; u.lookUp!.value = 0.05; u.dance!.value = 1;
    u.beatPar!.value = Math.floor(audio.beatAt(t)) % 2;
    u.wallZ!.value = WALL_Z; u.wallOn!.value = 1;
    const kick = f.a.kick;
    u.signOn!.value = (0.55 + 0.45 * kick) * (1 - 0.6 * night);
    u.chase!.value = Math.floor(audio.beatAt(t) * 2) / 3;
    const bph = Math.floor(audio.beatAt(t) * 1) % 2;
    u.sw!.value = [1, 1, 1, 1, 1].map((_, i) => (i % 2 === bph ? 1 : 0.0));
    // the hook: drops out of the dark toward the red robot, misses, swings, yanks up
    const { tIn, tHover, tStrike, tLand, tUp } = hb;
    const HOVER = 0.86; // hook tip height while it stalks: its lowest point (tip - 0.07) clears the antennae (~0.6)
    let hy = keys(t, [[tIn, 3.2], [tHover, HOVER, ease.outCubic], [tStrike, HOVER + 0.03], [tLand, 0.12, ease.inCubic], [tUp, 0.12], [tUp + 0.45, 3.4, ease.inCubic]]);
    const swing = t > tLand ? 0.1 * Math.sin((t - tLand) * 9) * Math.exp(-(t - tLand) * 2.5) : 0;
    const hookOn = t > tIn - 0.05 && t < tUp + 0.5 ? 1 : 0;
    const hx = hookX0 + swing;
    // guard: the hook (x from hx-0.02 to hx+0.17, lowest point hy-0.07) may not dip into any robot in the aisle
    // (a robot spans about +-0.19 m along its walk and ~0.6 m up to the antenna bulbs)
    for (const i of [1, 2]) {
      const r = rob[i]!, rz = Math.abs(r.y - GAP_Z) < 0.4;
      if (rz && hx + 0.17 > r.x - 0.22 && hx - 0.02 < r.x + 0.22) hy = Math.max(hy, 0.62 + 0.07 + 0.02);
    }
    (u.hookP!.value as THREE.Vector4).set(hx, hy, GAP_Z, hookOn);
    // the cuffed hand pinching the string, just in frame at the top. The pinch point (thumb meets index tip) is at
    // (0.034, -0.128, 0.074) in hand space; place the hand so that point, scaled and yawed, sits ON the string
    // (otherwise the string runs up through the fingers).
    const HS = 1.8, HYAW = 0.4, hc = Math.cos(HYAW), hs = Math.sin(HYAW);
    const px = 0.034 * HS, py = -0.128 * HS, pz = 0.074 * HS;
    const pinchW = [hc * px - hs * pz, py, hs * px + hc * pz]; // hand space -> world offset (inverse of cs_rot(yaw))
    (u.hand!.value as THREE.Vector4).set(hx - pinchW[0]!, hy + 0.78 - pinchW[1]!, GAP_Z - pinchW[2]!, hookOn);
    (u.handRot!.value as THREE.Vector3).set(1.0, HYAW, HS);
    (u.hg!.value as THREE.Vector4).set(0, 0, 0, 0);
    u.haze!.value = 0.6; u.fillLev!.value = 1.1 - 0.5 * night; u.time!.value = t; u.night!.value = night * 0.75; u.farFog!.value = 0;
    u.spots!.value = spots;
    // beams sweep on the beat (snap on each downbeat, drift between)
    const bb = audio.beatAt(t);
    const sweep = Math.floor(bb) + ease.outCubic(clamp((bb - Math.floor(bb)) / 0.4, 0, 1));
    (u.beamA!.value as THREE.Vector4).set(-4 + 4 * Math.sin(sweep * 1.1), -7 + 3 * Math.cos(sweep * 0.7), sweep * 0.9, 1.0);
    (u.beamB!.value as THREE.Vector4).set(4 + 4 * Math.sin(sweep * 1.3 + 2), -6 + 3 * Math.sin(sweep * 0.8), -sweep * 0.8 + 1, 1.0);
    u.keyCrowd!.value = 0.35;
    this.world.render(renderer, out);

    crowdStrings(this.strings, [CROWD.x, CROWD.front, CROWD.back, -999], cam.ro, yk[0]!, false, LIN.bone, 1 - 0.4 * night);
    syncThreeCam(this.cam3, cam);
    this.strings.render(renderer, out, this.cam3);

    const lampScr = project(cam, [0, 18, -4]);
    return {
      ...GRADE.dusk,
      raysAt: [lampScr.x / 1920, 1 - lampScr.y / 1080] as [number, number],
      rays: 0.3,
      zoom: 1 + 0.012 * kick,
      flash: shot !== 2 ? 0.1 * Math.exp(-Math.max(0, t - audio.timeOfBeat(Math.floor(audio.beatAt(t)))) * 10) * (Math.floor(audio.beatAt(t)) % 2 === 0 ? 1 : 0.4) * (1 - night) : 0,
    };
  }
}
