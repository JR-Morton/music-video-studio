// decade: chorus 1 (34.25–66.11), "spot" grade. Stage night in the town square. The hook is a marquee light box on
// the town-hall wall; the warning spreads through a sea of marionettes; a floor spotlight blows one small tin robot's
// shadow up into a monster over the crowd; smile and sing along; a cuffed hand flips an hourglass once.
// Shots (cuts on downbeats):
//   S1 34.25 stop bar: dark square, the marquee lights word by word, the year rolls to 2030, the spot stabs on "decade"
//   S2 36.38 the key image: tiny robot, giant indigo shadow up the wall; the front rows shriek, the ripple goes back
//   S3 40.63 crane up: the crowd fills to the horizon, phones lit; the view counter rolls to 100,000,000
//   S4 44.87 "put that shadow in their head": high wide; the lamp creeps in, the shadow swallows the square and sign
//   S5 51.25 "so smile and sing along": the front row, caution-yellow smiles, arms up on the beat
//   S6 55.49 "and don't you be afraid": low on the small robot in its light; the monster looms behind (small type)
//   S7 59.74 the cuffed hand flips the hourglass (a cameo), sand pours
//   S8 61.87 the title returns; the year counter lands on 2030 with "decade"
import * as THREE from 'three';
import { Scene, type Frame } from '@engine/scene';
import { Layer2D, W, H } from '@engine/gl';
import { LineBatch } from '@engine/lines';
import { LIN, rgba } from '@engine/palette';
import { F, font, layout } from '@engine/type';
import { Lyrics, type Line } from '@engine/lyrics';
import { clamp, ease, keys, lerp } from '@engine/util';
import { GRADE, drawLyric, drawEcho, clockwork, yank } from './_look';
import { makeWorldPass, makeSignTexture, project, syncThreeCam, lerpCam, cellCenter, SIGN, type Cam } from './decade-world';

const WALL_Z = -20;
const CROWD = { x: 17, front: -2.2, back: -18.5 };
const ROBOT = { x: 0, z: 1.2 };
const LAMP0: [number, number, number] = [-0.5, 0.22, 2.55];

interface State {
  cam: Cam;
  lamp: [number, number, number]; lampAim: [number, number, number]; lampOn: number; lampPow: number; lampCone: number;
  crowd: [number, number, number, number]; pose: [number, number, number, number];
  rippleZ: number; smile: number; lookUp: number;
  wallOn: number; signOn: number; sw: number[]; chase: number;
  haze: number; fill: number; farFog: number;
  hg: [number, number, number, number]; hgSand: number; hand: [number, number, number, number]; handRot: [number, number];
  robLook: number; robYaw: number;
}

export default class Decade extends Scene {
  world!: ReturnType<typeof makeWorldPass>;
  text = new Layer2D();
  strings = new LineBatch(6000, { screen2D: false, blend: 'add' });
  cam3 = new THREE.PerspectiveCamera();
  L!: Record<string, Line>;
  backing!: Line;

  override async init() {
    this.world = makeWorldPass(makeSignTexture());
    const ly = this.ctx.lyrics;
    this.L = {
      by: ly.get('By the end of the decade'),
      warning: ly.get("That's what the warning said"),
      hundred: ly.get('A hundred million people'),
      shadow: ly.get('Put that shadow in their head'),
      smile: ly.get('So smile and sing along'),
      afraid: ly.get("And don't you be afraid"),
      got: ly.get("We've got till the end of the decade"),
    };
    this.backing = ly.lines.find((l) => l.backing && l.start > 34 && l.start < 45)!;
  }

  /** downbeat times of this plate */
  db(i: number) { return this.ctx.audio.timeOfBeat(Math.round(this.ctx.audio.beatAt(34.254)) + i * 4); }

  state(t: number): { s: State; shot: number } {
    const d = (i: number) => this.db(i); // d(0)=34.25 (bar 16), d(1)=36.38 ...
    const base: State = {
      cam: { ro: [0, 2, 10], ta: [0, 5, -20], focal: 1.4 },
      lamp: [...LAMP0], lampAim: [0.6, 5.5, WALL_Z], lampOn: 1, lampPow: 5, lampCone: 0.8,
      crowd: [CROWD.x, CROWD.front, CROWD.back, -999], pose: [0.45, 0, 0, 0.2],
      rippleZ: 99, smile: 0, lookUp: 0.15,
      wallOn: 1, signOn: 1, sw: [1, 1, 1, 1, 1], chase: 0,
      haze: 1, fill: 1, farFog: 0,
      hg: [-3.1, 0.6, 0, 0], hgSand: 0, hand: [0, 0, 0, 0], handRot: [0, 0],
      robLook: 0.35 * Math.sin(clockwork(t, 0.9, 3) * 1.3), robYaw: 0,
    };
    const s = base;
    // Shot cuts inside the chorus land on the next line's first word, so a held last word ("people", "head", "along")
    // finishes its fill on screen before the cut.
    const c4 = this.L.shadow.start, c5 = this.L.smile.start, c6 = this.L.afraid.start;
    const signFrom = (line: Line, first: number) => [0, 1, 2, 3, 4].map((i) => Lyrics.wordProgress(line.words[first + i]!, t));
    if (t < d(1)) {
      // S1: the stop bar. Dark; the marquee lights word by word; the spot stabs on "decade".
      const u = clamp((t - d(0)) / (d(1) - d(0)), 0, 1);
      s.cam = lerpCam({ ro: [0, 1.5, 13], ta: [0, 7.2, -20], focal: 1.45 }, { ro: [0, 1.75, 9.5], ta: [0, 7.6, -20], focal: 1.5 }, ease.inOutCubic(u));
      const stab = this.L.by.words[5]!.start;
      s.lampOn = t < stab ? 0 : clamp((t - stab) / 0.05, 0, 1);
      s.lampPow = 4 + 5 * Math.exp(-(t - stab) * 6) * (t > stab ? 1 : 0);
      s.sw = signFrom(this.L.by, 1);
      s.fill = 0.35; s.haze = 1.4; s.pose = [0.0, 0, 0, 0];
      s.lookUp = 0.35;
      return { s, shot: 1 };
    }
    if (t < d(3)) {
      // S2: the key image. Behind the lamp, low: tiny robot, giant shadow up the wall; front rows shriek, ripple back.
      const u = clamp((t - d(1)) / (d(3) - d(1)), 0, 1);
      s.cam = lerpCam({ ro: [1.75, 0.7, 4.6], ta: [0.75, 4.3, -20], focal: 1.1 }, { ro: [1.6, 0.75, 4.1], ta: [0.7, 4.7, -20], focal: 1.13 }, ease.outCubic(u));
      { const r = ease.outCubic(clamp((t - d(1)) / 0.7, 0, 1)); s.lamp = [lerp(-0.45, -0.3, r), 0.08, ROBOT.z + lerp(1.5, 0.68, r)]; }
      s.lampAim = [0.5, 7.0, WALL_Z]; s.lampCone = 0.7;
      const bk = this.backing;
      // the sign stays lit; each backing word pops its sign word off-and-on as it's sung
      s.sw = [0, 1, 2, 3, 4].map((i) => { const w = bk.words[i]!; const k = t - w.start; return k > 0 && k < 0.12 ? 0 : 1; });
      s.chase = Math.floor(this.ctx.audio.beatAt(t) * 2) / 3;
      s.lampPow = 5 + 4 * Math.exp(-(t - d(1)) * 3);
      const shriek = bk.words[1]!.start; // the echo's "end"
      s.pose = [0.5, t > shriek ? clamp((t - shriek) / 0.15, 0, 1) : 0, 0, 0.25];
      s.rippleZ = keys(t, [[shriek, CROWD.front + 1.5], [shriek + 0.4, CROWD.front - 3.0, ease.outQuad], [40.6, CROWD.back - 3, ease.inOutQuad]]);
      s.lookUp = 0.45;
      return { s, shot: 2 };
    }
    if (t < c4) {
      // S3: crane up and back; the crowd fills to the horizon; phones.
      const u = clamp((t - d(3)) / (c4 - d(3)), 0, 1);
      const c = ease.inOutCubic(clamp(u * 1.15, 0, 1));
      s.cam = lerpCam({ ro: [1.5, 3.2, 3.0], ta: [0, 1.4, -14], focal: 1.35 }, { ro: [0, 24, 18], ta: [0, 0, -70], focal: 1.55 }, c);
      s.wallOn = 0; s.signOn = 0; s.farFog = 1;
      const fillEnd = -420;
      s.crowd = [260, CROWD.front, -430, keys(t, [[d(3), -10], [this.L.hundred.words[1]!.start, -90, ease.inQuad], [this.L.hundred.words[3]!.start, fillEnd, ease.outCubic]])];
      s.pose = [0.35, 0, 1, 0.15];
      s.lookUp = 0.1;
      s.lampPow = 3; s.haze = 0.5; s.fill = 1.3;
      return { s, shot: 3 };
    }
    if (t < c5) {
      // S4: put that shadow in their head. High 3/4 wide; the lamp creeps toward the robot, the shadow grows.
      const u = clamp((t - c4) / (c5 - c4), 0, 1);
      s.cam = lerpCam({ ro: [-9.5, 7.5, 9.5], ta: [3.0, 3.6, -11], focal: 1.3 }, { ro: [-6.5, 5.5, 10.5], ta: [3.0, 4.6, -11], focal: 1.3 }, ease.inOutQuad(u));
      const g = keys(t, [[this.L.shadow.words[2]!.start, 0], [this.L.shadow.words[5]!.start, 0.55], [this.L.shadow.words[5]!.start + 1.2, 1, ease.outCubic]]);
      s.lamp = [lerp(LAMP0[0], -0.25, g), lerp(0.22, 0.2, g), lerp(LAMP0[2], ROBOT.z + 0.62, g)];
      s.lampAim = [0.4, lerp(5.5, 7.5, g), WALL_Z];
      s.lampCone = lerp(0.8, 0.7, g);
      s.lampPow = lerp(5, 6.5, g);
      s.pose = [0.4, 1, 0, 0.1];
      s.rippleZ = keys(t, [[this.L.shadow.words[2]!.start, CROWD.front + 2], [this.L.shadow.words[5]!.start + 0.5, CROWD.back - 3]]);
      s.lookUp = 0.5;
      
      return { s, shot: 4 };
    }
    if (t < c6) {
      // S5: so smile and sing along. The front row, dolly left to right; smiles; arms up on the beat.
      const u = clamp((t - c5) / (c6 - c5), 0, 1);
      s.cam = lerpCam({ ro: [-3.2, 1.55, 0.9], ta: [-1.2, 1.45, -5], focal: 1.35 }, { ro: [2.6, 1.6, 0.7], ta: [0.9, 1.5, -5], focal: 1.35 }, ease.inOutQuad(u));
      s.smile = clamp((t - this.L.smile.words[1]!.start + 0.15) / 0.3, 0, 1);
      s.pose = [1.25, 0, 0, 0.45];
      s.lookUp = -0.05;
      s.fill = 1.3;
      return { s, shot: 5 };
    }
    if (t < d(12)) {
      // S6: and don't you be afraid. Low on the robot in its light, the monster behind.
      const u = clamp((t - c6) / (d(12) - c6), 0, 1);
      s.cam = lerpCam({ ro: [1.25, 0.34, 3.4], ta: [-0.1, 1.0, -8], focal: 1.45 }, { ro: [0.95, 0.32, 2.75], ta: [-0.1, 1.1, -8], focal: 1.5 }, ease.inOutQuad(u));
      s.lamp = [-0.3, 0.2, ROBOT.z + 0.85]; s.lampAim = [0.3, 6.5, WALL_Z]; s.lampCone = 0.74; s.lampPow = 5.5;
      s.pose = [0.35, 0.6, 0, 0.1]; s.rippleZ = -99; s.lookUp = 0.5;
      s.smile = 0.0;
      s.robLook = 0.5 * Math.sin(clockwork(t, 0.7, 5) * 1.1) + 0.25;
      return { s, shot: 6 };
    }
    if (t < d(13)) {
      // S7: the hourglass. A cuffed hand dips in and flips it (a cameo); sand pours.
      const u = clamp((t - d(12)) / (d(13) - d(12)), 0, 1);
      s.cam = lerpCam({ ro: [-0.6, 2.1, 5.6], ta: [-3.1, 1.75, 0.6], focal: 1.75 }, { ro: [-0.9, 2.0, 5.1], ta: [-3.1, 1.7, 0.6], focal: 1.8 }, ease.inOutQuad(u));
      this.hourglass(s, t);
      s.pose = [0.3, 0, 0, 0.1]; s.lookUp = 0.1;
      return { s, shot: 7 };
    }
    // S8: the title returns; the year lands on 2030 with "decade"
    const u = clamp((t - d(13)) / (d(15) - d(13)), 0, 1);
    s.cam = lerpCam({ ro: [0, 2.0, 11.5], ta: [0, 7.0, -20], focal: 1.4 }, { ro: [0, 3.0, 7.0], ta: [0, 8.8, -20], focal: 1.45 }, ease.inOutQuad(u));
    s.sw = signFrom(this.L.got, 3);
    s.chase = Math.floor(this.ctx.audio.beatAt(t) * 2) / 3;
    this.hourglass(s, t);
    s.pose = [0.6, 0, 0, 0.2]; s.smile = 1; s.lookUp = 0.3;
    s.lampPow = 4; s.lamp = [LAMP0[0], LAMP0[1], LAMP0[2] + 0.6];
    return { s, shot: 8 };
  }

  hourglass(s: State, t: number) {
    const t0 = 59.8; // the hand arrives just after the downbeat
    const flipA = t0 + 0.3, flipB = flipA + 0.42;
    const hy = keys(t, [[t0 - 0.2, 9], [t0 + 0.28, 3.05, ease.outCubic], [flipB + 0.08, 3.05], [flipB + 0.55, 9, ease.inCubic]]);
    const ang = keys(t, [[flipA, 0], [flipB, Math.PI, ease.inOutCubic]]);
    s.hg = [-3.1, 0.6, ang, 1];
    s.hgSand = clamp((t - flipB - 0.1) / 9, 0, 1);
    s.hand = [-3.1, hy, 0.6, t > t0 - 0.25 && t < flipB + 0.6 ? 1 : 0];
    s.handRot = [t > t0 + 0.2 && t < flipB + 0.1 ? 0.9 : 0.2, ang * 0.35];
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp, audio } = this.ctx;
    const t = f.t;
    const { s, shot } = this.state(t);
    const u = this.world.u;
    (u.camPos!.value as THREE.Vector3).set(...s.cam.ro);
    (u.camTa!.value as THREE.Vector3).set(...s.cam.ta);
    u.camFocal!.value = s.cam.focal;
    (u.lampPos!.value as THREE.Vector3).set(...s.lamp);
    const ad = [s.lampAim[0] - s.lamp[0], s.lampAim[1] - s.lamp[1], s.lampAim[2] - s.lamp[2]];
    (u.lampDir!.value as THREE.Vector3).set(ad[0]!, ad[1]!, ad[2]!).normalize();
    u.lampOn!.value = s.lampOn; u.lampPow!.value = s.lampPow; u.lampCone!.value = s.lampCone;
    const rob = u.rob!.value as THREE.Vector4[], robB = u.robB!.value as THREE.Vector4[];
    rob[0]!.set(ROBOT.x, ROBOT.z, s.robYaw, clockwork(t, 2.3, 1) * 0.6);
    robB[0]!.set(s.robLook, 0, 1, 1);
    for (let i = 1; i < 4; i++) robB[i]!.set(0, 0, 0, 1);
    (u.crowdBox!.value as THREE.Vector4).set(...s.crowd);
    const yk = [0, 0.035, 0.07, 0.11].map((dd) => yank(audio, t - dd));
    (u.yk!.value as THREE.Vector4).set(yk[0]!, yk[1]!, yk[2]!, yk[3]!);
    (u.pose!.value as THREE.Vector4).set(...s.pose);
    u.rippleZ!.value = s.rippleZ; u.smile!.value = s.smile; u.lookUp!.value = s.lookUp;
    u.beatPar!.value = Math.floor(audio.beatAt(t)) % 2;
    u.dance!.value = 0;
    u.wallZ!.value = WALL_Z; u.wallOn!.value = s.wallOn; u.signOn!.value = s.signOn; u.chase!.value = s.chase;
    u.sw!.value = s.sw;
    (u.hg!.value as THREE.Vector4).set(...s.hg); u.hgSand!.value = s.hgSand;
    (u.hand!.value as THREE.Vector4).set(...s.hand); (u.handRot!.value as THREE.Vector3).set(s.handRot[0], s.handRot[1], 4.2);
    (u.hookP!.value as THREE.Vector4).set(0, 0, 0, 0);
    u.haze!.value = s.haze; u.fillLev!.value = s.fill; u.time!.value = t; u.night!.value = 0; u.farFog!.value = s.farFog; u.spots!.value = 0;
    this.world.render(renderer, out);

    // strings: pale hairlines from every head up into the dark
    this.drawStrings(s, yk[0]!, t);
    syncThreeCam(this.cam3, s.cam);
    this.strings.render(renderer, out, this.cam3);

    // type
    const c = this.text.ctx; this.text.clear();
    this.drawType(c, s, shot, t);
    comp.draw(renderer, this.text.upload(), out);

    const lampScr = project(s.cam, s.lamp);
    const raysAt: [number, number] = lampScr.z > 0 ? [lampScr.x / W, 1 - lampScr.y / H] : [0.5, 1.2];
    const kick = f.a.kick;
    const slam = t >= this.db(1) && t < this.db(1) + 0.5 ? Math.exp(-(t - this.db(1)) * 7) : 0;
    return {
      ...GRADE.spot,
      raysAt, rays: shot === 3 ? 0.25 : 0.5,
      flash: slam * 0.2,
      zoom: 1 + 0.006 * kick * (shot === 1 ? 0 : 1) + slam * 0.03,
      exposure: 1.0,
    };
  }

  drawStrings(s: State, lift: number, t: number) {
    const sb = this.strings; sb.clear();
    const [xh, zf, zb, fillZ] = s.crowd;
    const ro = s.cam.ro;
    const maxD = s.farFog > 0 ? 70 : 45;
    const z0 = Math.min(zf, ro[2] + 5), z1 = Math.max(zb, fillZ, ro[2] - maxD);
    const col = LIN.bone;
    for (let iz = Math.ceil(z1 / 1.55); iz <= Math.floor(z0 / 1.55); iz++) {
      for (let ix = Math.floor((ro[0] - maxD) / 1.3); ix <= Math.ceil((ro[0] + maxD) / 1.3); ix++) {
        const x = ix * 1.3, z = iz * 1.55;
        if (Math.abs(x) > xh || z > zf + 0.01 || z < zb || z <= fillZ) continue;
        const cc = cellCenter(ix, iz);
        const dx = cc.x - ro[0], dz = cc.z - ro[2];
        const dd = Math.hypot(dx, dz);
        if (dd > maxD) continue;
        const a = 0.45 * Math.pow(clamp(1 - dd / maxD, 0, 1), s.farFog > 0 ? 2 : 1);
        const hy = 1.75 + 0.07 * lift;
        sb.seg(cc.x, hy, cc.z, cc.x, hy + 2.5, cc.z, 1.0, col[0], col[1], col[2], a * 0.3);
        sb.seg(cc.x, hy + 2.5, cc.z, cc.x, hy + 9, cc.z, 1.0, col[0], col[1], col[2], a * 0.16);
        sb.seg(cc.x, hy + 9, cc.z, cc.x, hy + 40, cc.z, 1.0, col[0], col[1], col[2], a * 0.04);
        if (sb.count > 5900) return;
      }
    }
  }

  drawType(c: CanvasRenderingContext2D, s: State, shot: number, t: number) {
    const lampScr = project(s.cam, s.lamp);
    const light = lampScr.z > 0 ? { x: lampScr.x, y: lampScr.y } : { x: 960, y: 1400 };
    const L = this.L;
    const signScr = project(s.cam, [0, SIGN.y, WALL_Z]);
    if (shot === 1) {
      // the year rolls under the sign
      const signLow = project(s.cam, [0, SIGN.y - SIGN.h / 2 - 0.9, WALL_Z]);
      this.drawYear(c, signLow.x, signLow.y, 40, this.yearU(L.by, 1, t), 0.85);
      this.scrim(c, 960, 875, 760, 130, 0.45);
      drawLyric(c, L.by, t, { x: 960, y: 900, size: 76, align: 'center', light: { x: signScr.x, y: signScr.y }, shadow: 90, anticipate: 0.35, linger: 0.3 });
    } else if (shot === 2) {
      drawLyric(c, L.by, t, { x: 1130, y: 880, size: 70, align: 'center', light, shadow: 240, linger: 0.45 });
      drawLyric(c, L.warning, t, { x: 1130, y: 880, size: 70, align: 'center', maxWidth: 1560, light, shadow: 240, anticipate: 0.45, linger: 0.5 });
      drawEcho(c, this.ctx.lyrics, t, { x: 1130, y: 940, size: 22, copies: 3, dy: 22 });
    } else if (shot === 3) {
      drawEcho(c, this.ctx.lyrics, t, { x: 960, y: 190, size: 26 });
      drawLyric(c, L.warning, t, { x: 960, y: 930, size: 84, align: 'center', light: { x: 960, y: -300 }, shadow: 160, linger: 0.45 });
      drawLyric(c, L.hundred, t, { x: 960, y: 930, size: 84, align: 'center', light: { x: 960, y: -300 }, shadow: 160, anticipate: 0.4 });
      this.drawCounter(c, t, s);
    } else if (shot === 4) {
      // (the cut is on "Put": "A hundred million people" finished in S3 and isn't redrawn here)
      drawLyric(c, L.shadow, t, { x: 1110, y: 215, size: 76, align: 'left', maxWidth: 700, light, shadow: 520, shadowAlpha: 0.75, anticipate: 0.04 });
    } else if (shot === 5) {
      { const g = c.createLinearGradient(0, 0, 0, 360); g.addColorStop(0, rgba('ink', 0.8)); g.addColorStop(0.6, rgba('ink', 0.55)); g.addColorStop(1, rgba('ink', 0)); c.fillStyle = g; c.fillRect(0, 0, W, 360); }
      drawLyric(c, L.smile, t, { x: 960, y: 205, size: 92, align: 'center', light: { x: 960, y: 1300 }, shadow: 120, anticipate: 0.3, linger: 0.6 });
      this.scrim(c, 960, 945, 520, 90, 0.5 * clamp((t - L.afraid.start + 0.4) / 0.3, 0, 1));
      drawLyric(c, L.afraid, t, { x: 960, y: 960, size: 46, weight: 500, align: 'center', light, shadow: 60, anticipate: 0.4 });
    } else if (shot === 6) {
      drawLyric(c, L.afraid, t, { x: 960, y: 960, size: 46, weight: 500, align: 'center', light, shadow: 60, anticipate: 0.4 });
    } else {
      const signLow = project(s.cam, [0, SIGN.y - SIGN.h / 2 - 0.9, WALL_Z]);
      if (shot === 8) this.drawYear(c, signLow.x, signLow.y, 42, this.yearU(L.got, 3, t), 1);
      this.scrim(c, 960, 905, 860, 150, 0.55);
      drawLyric(c, L.got, t, { x: 960, y: 930, size: 76, align: 'center', light, shadow: 200, anticipate: 0.3, linger: 1.2 });
    }
  }

  /** A soft ink scrim (elliptical falloff) that darkens the lit set behind a lyric block. */
  scrim(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, a: number) {
    c.save();
    c.translate(x, y); c.scale(1, ry / rx);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, rgba('ink', a)); g.addColorStop(0.55, rgba('ink', a * 0.75)); g.addColorStop(1, rgba('ink', 0));
    c.fillStyle = g; c.fillRect(-rx, -rx, rx * 2, rx * 2);
    c.restore();
  }

  /** Year counter progress: it sits on this year (2026), then clicks one year per word as "end · of · the · decade"
   *  are sung (the sign's first word, "the", doesn't click), each click rolling 0.16 s. */
  yearU(line: Line, first: number, t: number) {
    let v = 0;
    for (let i = 1; i < 5; i++) v += ease.outCubic(clamp((t - line.words[first + i]!.start) / 0.16, 0, 1));
    return v / 4; // 2026 until "end" ... 2030 on "decade"
  }

  /** Odometer year 2026 -> 2030 (u 0..1), Martian Mono, caution yellow. */
  drawYear(c: CanvasRenderingContext2D, x: number, y: number, size: number, u: number, a: number) {
    const v = 2026 + u * 4;
    this.odometer(c, x, y, size, v, 4, 'signal', a, 0);
  }

  drawCounter(c: CanvasRenderingContext2D, t: number, s: State) {
    const L = this.L.hundred;
    const tA = this.db(3), tH = L.words[1]!.start, tP = L.words[3]!.start;
    // views: rolls slowly, then races to 100,000,000 across "hundred million people"
    const lg = keys(t, [[tA, 2], [tH, 5.2, ease.inQuad], [tP + 0.1, 8, ease.outCubic]]);
    const v = Math.min(1e8, Math.pow(10, lg));
    const a = clamp((t - tA - 0.15) / 0.2, 0, 1);
    c.save();
    c.fillStyle = rgba('ink', 0.82 * a);
    c.beginPath(); (c as any).roundRect(960 - 330, 640 - 70, 660, 165, 18); c.fill();
    c.strokeStyle = rgba('graphite', 0.7 * a); c.lineWidth = 1.5; c.stroke();
    c.font = font(F.mono(500, 100), 20); c.fillStyle = rgba('ash', 0.9 * a); c.textAlign = 'center';
    (c as any).letterSpacing = '6px';
    c.fillText('VIEWS', 960, 606);
    c.restore();
    this.odometer(c, 960, 640 + 62, 78, v, 9, 'signal', a, 1);
  }

  /** Rolling digits (each digit column rolls continuously), grouped with commas when group=1. */
  odometer(c: CanvasRenderingContext2D, cx: number, y: number, size: number, v: number, digits: number, colKey: string, a: number, group: number) {
    const fam = F.mono(800, 100);
    const adv = layout('0', fam, size).width;
    const commaW = adv * 0.55;
    const n = digits;
    const nComma = group ? Math.floor((n - 1) / 3) : 0;
    const total = n * adv + nComma * commaW;
    let x = cx - total / 2;
    c.save();
    c.font = font(fam, size); c.textBaseline = 'alphabetic';
    c.beginPath(); c.rect(cx - total / 2 - 20, y - size * 0.92, total + 40, size * 1.08); c.clip();
    for (let i = 0; i < n; i++) {
      const p = Math.pow(10, n - 1 - i);
      const colv = v / p; // continuous
      const d = Math.floor(colv) % 10;
      // roll only in the last 10% of the lower column's cycle (odometer carry)
      const lower = (v % p) / p;
      const fast = i >= n - 3 && digits > 4;
      const frac = fast ? 0 : i === n - 1 ? colv - Math.floor(colv) : lower > 0.9 ? (lower - 0.9) / 0.1 : 0;
      const lead = v < p && i < n - 1; // leading zeros dim
      for (let k = 0; k < 2; k++) {
        const dig = (d + k) % 10;
        const yy = y + (k - frac) * size * 1.1;
        c.fillStyle = rgba(lead ? 'graphite' : colKey, a * (lead ? 0.5 : 1));
        c.fillText(String(dig), x, yy);
      }
      x += adv;
      if (group && i < n - 1 && (n - 1 - i) % 3 === 0) { c.fillStyle = rgba(colKey, a * 0.8); c.fillText(',', x + commaW * 0.05 - adv * 0.2, y); x += commaW; }
    }
    c.restore();
  }
}
