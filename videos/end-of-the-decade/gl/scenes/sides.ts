// sides · pre-chorus 2 (89.48–106.47), grade `afternoon`. A split stage: screen-right the warning side (a red alarm
// beacon sweeping a porcelain wall, hazard stripes, a crier marionette ringing on the beat); screen-left "it's all for
// show" (a proscenium arch with marquee bulbs and a curtain that opens on a laughing marionette and drops on "show").
// Between them, a small tin robot. "So I shut my eyes": the frame closes like eyelids; the lower lid lights up as a
// caution-yellow smile; a floor light slides up to the robot and its indigo shadow swallows the wall behind the type.
// "'Cause I don't know": the eyes open on the shadow; the second "I don't know" repeats, dimmer. Bar 49 (bass out):
// the stage holds its breath.
//
// Shots (bars 42–49):
//   A 91.02–94.78  from white: the whole split stage, the warning side lit; "One side says the end is near" (right)
//   B 94.78–97.97  (bar 44 + 2 beats) snap to the show side: curtain up on the scoffer; "The other says it's all for show" (left); curtain drops
//   C 97.97–102.22 push in to the centre wall; eyelids close; the smile; the shadow grows to fill the wall
//   D 102.22–106.68 lids stay shut; open on "know"; pull back wide on bar 49 and hold (bass out); ends on "So I took hold"
import * as THREE from 'three';
import { Scene, type Frame } from '@engine/scene';
import { FSPass, Layer2D, makeRT } from '@engine/gl';
import { aaPass } from './_aa';
import { rgba } from '@engine/palette';
import { clamp, ease, keys, lerp, prog } from '@engine/util';
import type { Line } from '@engine/lyrics';
import { GLSL_CAST_SDF, GLSL_CAST_SHADE } from './_cast';
import { GRADE, clockwork, yank } from './_look';
import { GLSL_KIT, GLSL_KIT_SHADE, camUniforms, setCam, project, pseudoLine, mix3, drawLyricS, type Cam, type V3 } from './bench-kit';

const RS = 1.0; // raymarch resolution scale (1 = full res; supersampled across the sub-frames, see _aa.ts)
const DEBUG_NOLID = false;

const FRAG = /* glsl */ `
uniform float t, alarmAng, alarmI, curtain, fillI, footI, bulbI, spotI, dim;
uniform vec3 keyPos, keyTa, keyCol; uniform float keyCone;
uniform vec3 spotPos;
uniform vec4 limbsA; uniform vec3 headA; uniform vec3 posA;
uniform vec4 limbsB; uniform vec3 headB; uniform vec3 posB;
uniform float robWalk, robLook; uniform vec3 robPos;
${GLSL_CAST_SDF}
${GLSL_KIT}
#define M_WALL 20.0
#define M_FLOOR 21.0
#define M_ARCH 22.0
#define M_CURTAIN 23.0
#define M_BEACON 24.0
#define M_BULB 25.0
#define M_PLAT 26.0

vec2 archSDF(vec3 p) {
  vec3 q = p - vec3(-2.35, 0.0, -0.55);
  float d = cs_box(q - vec3(0.0, 3.35, 0.0), vec3(2.05, 0.38, 0.16), 0.03);
  vec3 pq = q; pq.x = abs(pq.x) - 1.78;
  d = min(d, cs_box(pq - vec3(0.0, 1.6, 0.0), vec3(0.24, 1.6, 0.16), 0.03));
  vec2 r = vec2(d, M_ARCH);
  // marquee bulbs along the header and down the pillars
  vec3 bq = q - vec3(0.0, 3.35, 0.19);
  float cell = 0.26; float bi = clamp(floor(bq.x / cell + 0.5), -7.0, 7.0); bq.x -= bi * cell;
  float bulbs = length(bq - vec3(0.0, 0.2, 0.0)) - 0.045;
  bulbs = min(bulbs, length(bq + vec3(0.0, 0.2, 0.0)) - 0.045);
  vec3 vq = pq - vec3(0.0, 0.0, 0.19); float vi = clamp(floor(vq.y / cell + 0.5), 1.0, 11.0); vq.y -= vi * cell;
  bulbs = min(bulbs, length(vq) - 0.045);
  r = opU(r, vec2(bulbs, M_BULB));
  // the raised stage behind the arch
  r = opU(r, vec2(cs_box(q - vec3(0.0, 0.18, -0.75), vec3(1.6, 0.18, 0.65), 0.02), M_PLAT));
  // curtains: two folded panels that part with 'curtain' (0 closed .. 1 open)
  float half_ = 0.8 * (1.0 - curtain * 0.82);
  for (int s = 0; s < 2; s++) {
    float sd = s == 0 ? -1.0 : 1.0;
    vec3 cq = q - vec3(sd * (1.58 - half_), 1.85, -0.3);
    float fold = 0.035 * sin(cq.x * 26.0 + sd * 1.3) * (0.6 + 0.4 * (1.0 - curtain));
    r = opU(r, vec2((cs_box(cq, vec3(half_, 1.5, 0.05), 0.02) + fold) * 0.6, M_CURTAIN));
  }
  return r;
}

float noFloor = 0.0;
vec2 map(vec3 p) {
  vec2 r = vec2(p.y + noFloor, M_FLOOR);
  r = opU(r, vec2(2.55 + p.z, M_WALL)); // the back wall (z = -2.55)
  // proscenium (bounded)
  float ab = cs_box(p - vec3(-2.35, 2.0, -0.9), vec3(2.35, 2.0, 0.9), 0.0);
  r = opU(r, ab > 0.1 ? vec2(ab, M_ARCH) : archSDF(p));
  // the scoffer on the show stage
  vec3 bp = p - posB;
  float bb = cs_box(bp - vec3(0.0, 1.05, 0.1), vec3(0.6, 1.2, 0.8), 0.0);
  r = opU(r, bb > 0.12 ? vec2(bb, MAT_WOOD) : sdMarionette(bp, limbsB, headB, 1.0));
  // the crier, warning side
  vec3 ap = p - posA;
  float abx = cs_box(ap - vec3(0.0, 1.05, 0.1), vec3(0.6, 1.2, 0.8), 0.0);
  r = opU(r, abx > 0.12 ? vec2(abx, MAT_WOOD) : sdMarionette(ap, limbsA, headA, 0.0));
  // alarm beacon on its bracket
  vec3 kq = p - vec3(3.1, 3.5, -2.35);
  float kb = length(kq) - 0.45;
  if (kb > 0.1) r = opU(r, vec2(kb, MAT_CHROME));
  else {
    r = opU(r, vec2(cs_box(kq + vec3(0.0, 0.1, 0.1), vec3(0.14, 0.04, 0.14), 0.01), MAT_CHROME));
    r = opU(r, vec2(max(length(kq - vec3(0.0, 0.0, 0.0)) - 0.17, -kq.y - 0.06), M_BEACON));
  }
  // the robot, centre stage, and the little floor light that finds it
  float rb = length(robPos + vec3(0.0, 0.3, 0.0) - p) - 0.45;
  r = opU(r, rb > 0.1 ? vec2(rb, MAT_TIN) : sdTinRobot(p - robPos, robWalk, robLook, 0.0));
  if (spotI > 0.0) {
    vec3 sq = p - spotPos - vec3(0.0, -0.06, 0.08);
    r = opU(r, vec2(cs_cyl(sq, 0.06, 0.07), MAT_CHROME));
  }
  return r;
}

void sceneMaterial(float id, float v, vec3 p, inout vec3 alb, inout float metal, inout float rough, inout vec3 emit) {
  if (id == M_WALL) {
    alb = mix(C_BONE * 0.78, C_LILAC * 0.55, smoothstep(-0.2, -1.5, p.x)); rough = 0.4;
    // hazard dado on the warning side
    float band = step(0.3, p.y) * step(p.y, 0.62) * smoothstep(0.35, 0.55, p.x);
    float st = step(0.5, fract((p.x + p.y) * 2.2));
    alb = mix(alb, mix(C_INK2, C_SIGNAL * 0.9, st), band);
    // wall panels
    float seam = smoothstep(0.012, 0.0, abs(fract(p.x * 0.5) - 0.5) - 0.49);
    alb *= 1.0 - 0.25 * seam;
  } else if (id == M_FLOOR) {
    float plank = smoothstep(0.01, 0.0, abs(fract(p.x * 1.6) - 0.5) - 0.49);
    alb = mix(C_LILAC * 0.22 + C_INK2 * 0.5, C_INK2, plank); rough = 0.14;
  } else if (id == M_ARCH) { alb = C_LILAC * 0.42; rough = 0.3; }
  else if (id == M_CURTAIN) { alb = vec3(0.34, 0.1, 0.32) * (0.8 + 0.2 * sin(p.x * 26.0)); rough = 0.85; }
  else if (id == M_BEACON) {
    vec3 d = normalize(p - vec3(3.1, 3.5, -2.35));
    float a = atan(d.z, d.x);
    float hot = pow(0.5 + 0.5 * cos(a - alarmAng), 6.0);
    alb = vec3(0.3, 0.02, 0.02); rough = 0.1; emit = vec3(1.0, 0.08, 0.04) * (0.4 + 5.0 * hot) * alarmI;
  } else if (id == M_BULB) {
    float chase = 0.5 + 0.5 * sin(p.x * 12.0 + p.y * 12.0 - t * 7.0);
    alb = vec3(0.2); emit = ${'`'}EMBER${'`'} * bulbI * (0.4 + 0.8 * chase);
  } else if (id == M_PLAT) { alb = C_INK2 * 1.5; rough = 0.25; }
}
${GLSL_CAST_SHADE}
${GLSL_KIT_SHADE}

void main() {
  vec2 uv = (vUv - 0.5) * vec2(16.0 / 9.0, 1.0);
  vec3 fw; vec3 rd = camRay(uv, fw);
  float pix = 1.0 / (focal * rtRes.y);
  vec2 h = castMarch(ro, rd, 30.0);
  vec3 col = C_INK * 0.5;
  StageLight key = StageLight(keyPos, normalize(keyTa - keyPos), keyCol, keyCone);
  StageLight spot = StageLight(spotPos, normalize(vec3(0.0, 0.25, -1.0)), mix(C_BONE, C_SIGNAL, 0.35) * spotI, 0.5);
  StageLight alarm = StageLight(vec3(3.1, 3.5, -2.2), vec3(cos(alarmAng), -0.35, sin(alarmAng)), vec3(1.0, 0.06, 0.03) * alarmI * 9.0, 0.82);
  StageLight fill = StageLight(vec3(0.0, 3.5, 6.0), vec3(0.0), mix(C_LILAC, C_SHADOW * 3.0, dim) * fillI, -1.0);
  StageLight foot = StageLight(vec3(-2.35, 0.25, 0.6), vec3(0.0), vec3(1.0, 0.8, 0.55) * footI, -1.0);
  if (h.x > 0.0) {
    vec3 p = ro + rd * h.x, n = castNormal(p);
    vec3 alb, emit; float metal, rough;
    matOf(h.y, p, alb, metal, rough, emit);
    float ao = castAO(p, n);
    vec3 c = vec3(0.0);
    if (length(keyCol) > 0.01) c += cs_light(key, p, n, rd, alb, metal, rough, true);
    if (spotI > 0.0) { vec3 sl = spotPos - p; float sd = length(sl); noFloor = 50.0; c += cs_light(spot, p, n, rd, alb, metal, rough, false) * (dot(n, sl) > 0.0 ? kShadow(p + n * 0.004, sl / sd, sd - 0.02, 60.0) : 0.0); noFloor = 0.0; }
    c += cs_light(alarm, p, n, rd, alb, metal, rough, false);
    c += cs_light(fill, p, n, rd, alb, metal, rough, false) * ao;
    if (footI > 0.0) c += cs_light(foot, p, n, rd, alb, metal, rough, false) * ao;
    vec3 rf = reflect(rd, n);
    vec3 env = mix(C_INK * 0.4, C_LILAC * 0.3, smoothstep(-0.2, 0.8, rf.y)) * (1.0 - dim * 0.7);
    float fres = pow(1.0 - max(dot(n, -rd), 0.0), 4.0) * (1.0 - rough);
    c += env * ao * (mix(alb * 0.35, alb, metal) + fres * 0.6);
    c += emit;
    // polished floor: a short reflection march
    if (h.y == M_FLOOR) {
      vec3 ro2 = p + n * 0.01;
      float tt = 0.02; vec2 hh = vec2(-1.0);
      for (int i = 0; i < 48; i++) { vec2 m = map(ro2 + rf * tt); if (m.x < 0.002) { hh = vec2(tt, m.y); break; } tt += m.x; if (tt > 8.0) break; }
      if (hh.x > 0.0) {
        vec3 q = ro2 + rf * hh.x;
        vec3 a2, e2; float m2, r2;
        matOf(hh.y, q, a2, m2, r2, e2);
        vec3 rc = a2 * (fillI * 0.25 * C_LILAC + keyCol * 0.02 + spotI * 0.04 * smoothstep(2.5, 0.0, length(q - spotPos))) + e2;
        c += rc * (0.12 + 0.5 * fres) * exp(-hh.x * 0.3);
      }
    }
    col = c;
  }
  // strings: thin, pale, vanishing up into the dark flies
  for (int i = 0; i < 5; i++) {
    vec3 a = posA + marionetteAnchor(i, limbsA, headA);
    vec2 s = hairline(ro, rd, a, a + vec3(0.0, 6.0, 0.0), h.x, pix, 0.002);
    col = mix(col, C_BONE * 0.7, s.x * 0.4 * (1.0 - smoothstep(3.2, 4.8, s.y)));
    vec3 b = posB + marionetteAnchor(i, limbsB, headB);
    s = hairline(ro, rd, b, b + vec3(0.0, 6.0, 0.0), h.x, pix, 0.002);
    col = mix(col, C_BONE * 0.7, s.x * 0.4 * (1.0 - smoothstep(3.2, 4.8, s.y)));
  }
  // haze in the key cone
  float cone = 0.0, tm = h.x > 0.0 ? min(h.x, 10.0) : 10.0;
  if (length(keyCol) > 0.01) {
    for (int i = 0; i < 10; i++) {
      float s = (float(i) + hash12(gl_FragCoord.xy + float(i))) / 10.0 * tm;
      vec3 q = ro + rd * s; vec3 ld = normalize(q - key.pos);
      cone += smoothstep(key.cone, mix(key.cone, 1.0, 0.3), dot(ld, key.dir)) / 10.0;
    }
    col += normalize(keyCol + 1e-4) * cone * 0.05 * tm / 10.0;
  }
  // the alarm's red beam in the air
  if (alarmI > 0.05) {
    float ab = 0.0;
    for (int i = 0; i < 8; i++) {
      float s = (float(i) + hash12(gl_FragCoord.yx + float(i) * 3.1)) / 8.0 * tm;
      vec3 q = ro + rd * s; vec3 dq = q - alarm.pos;
      ab += smoothstep(alarm.cone, mix(alarm.cone, 1.0, 0.4), dot(normalize(dq), normalize(alarm.dir))) / (1.0 + dot(dq, dq) * 0.15);
    }
    col += vec3(1.0, 0.06, 0.03) * ab / 8.0 * alarmI * 0.5 * tm / 10.0;
  }
  fragColor = vec4(col, 1.0);
}`;

const EMBER = 'vec3(1.0, 0.83, 0.45) * 3.0';

export default class Sides extends Scene {
  rt = makeRT(1920 * RS, 1080 * RS);
  stage = aaPass(FRAG.replace('`EMBER`', EMBER), {
    t: { value: 0 }, alarmAng: { value: 0 }, alarmI: { value: 1 }, curtain: { value: 0 }, fillI: { value: 1 }, footI: { value: 0 }, bulbI: { value: 1 }, spotI: { value: 0 }, dim: { value: 0 },
    keyPos: { value: [3, 6, 4] }, keyTa: { value: [2, 1, -1] }, keyCol: { value: [3, 3, 3] }, keyCone: { value: 0.9 },
    spotPos: { value: [0, 0.12, 1.5] },
    limbsA: { value: [0, 0, 0, 0] }, headA: { value: [0, 0, 0] }, posA: { value: [3.35, 0, -1.2] },
    limbsB: { value: [0, 0, 0, 0] }, headB: { value: [0, 0, 0] }, posB: { value: [-2.35, 0.36, -1.75] }, // 0.9 m behind the curtain (z -0.85; stage z -1.95..-0.65): his swinging hands reach ~0.6 m forward
    robWalk: { value: 0 }, robLook: { value: 0 }, robPos: { value: [0, 0, -1.3] },
    rtRes: { value: [1440, 810] },
    ...camUniforms(),
  });
  text = new Layer2D();
  L1!: Line; L2!: Line; L3!: Line; L4!: Line; L4a!: Line; L4b!: Line;
  bars: number[] = [];

  override async init() {
    const ly = this.ctx.lyrics;
    this.L1 = ly.get('end is near')!; this.L2 = ly.get('all for show')!; this.L3 = ly.get('shut my eyes')!; this.L4 = ly.get('I don\'t know, I don\'t know')!;
    const k = this.L4.words.findIndex((w, i) => i > 0 && /^know/.test(w.w));
    this.L4a = pseudoLine(this.L4.words.slice(0, k + 1), this.L4.i);
    this.L4b = pseudoLine(this.L4.words.slice(k + 1), this.L4.i);
    const au = this.ctx.audio;
    const b0 = Math.floor(au.barAt(this.ctx.start) + 0.1); // the bar the plate starts in (its start follows the lyric, which can be mid-bar)
    this.bars = Array.from({ length: 10 }, (_, i) => au.timeOfBeat((b0 + i) * 4));
    this.stage.u.rtRes!.value = [this.rt.width, this.rt.height];
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp, audio } = this.ctx;
    const t = f.t, B = this.bars; // B[0] = bar 42 ... B[8] = bar 50
    const u = this.stage.u;
    // shot B waits two beats past bar 44 so the curtain opens into "The other says" (95.05), not on the tail of "near"
    const tB = audio.timeOfBeat(Math.round(audio.beatAt(B[2]!)) + 2);
    const tEnd = this.ctx.end; // the plate ends on "So I took hold" (after the last "know"), not on bar 50
    const shot = t < tB ? 0 : t < B[4]! ? 1 : t < B[6]! ? 2 : 3;
    const yk = yank(audio, t), yk2 = yank(audio, t + 0.07, true);
    const breath = prog(t, B[7]!, B[7]! + 0.3); // bar 49: bass out, the stage holds still
    const wEyes = this.L3.words.find((w) => /eyes/.test(w.w))!, wShut = this.L3.words.find((w) => /shut/.test(w.w))!;
    const wSmile = this.L3.words.find((w) => /smile/.test(w.w))!, wFear = this.L3.words.find((w) => /fear/.test(w.w))!;
    const wKnow = this.L4a.words[this.L4a.words.length - 1]!;
    const wShow = this.L2.words[this.L2.words.length - 1]!;

    // ---------------- lids (0 open .. 1 shut to a slit)
    const lid = t < wKnow.start ? prog(t, wShut.start - 0.1, wEyes.end, ease.inOutCubic) : 1 - prog(t, wKnow.start, wKnow.start + 0.5, ease.outCubic);

    // ---------------- cast
    const amp = 1 - 0.7 * breath;
    const limbsA = [0.3 + 0.2 * yk2 * amp, 2.55 + 0.35 * yk * amp, 0.05 * yk * amp, -0.05 * yk * amp];
    const headA = [-0.15 + 0.12 * yk * amp, -0.25, 0];
    const laugh = Math.abs(Math.sin(t * 9.5));
    const limbsB = [1.1 + 0.9 * yk * amp, 0.6 + 0.4 * yk2 * amp, 0.08 * yk, -0.08 * yk];
    const headB = [-0.25 * laugh * amp + 0.1, 0.3, 0];
    const curtain = keys(t, [[tB + 0.05, 0], [tB + 0.6, 1, ease.outBack], [wShow.start - 0.02, 1], [wShow.start + 0.28, 0, ease.inCubic]]);
    let alarmI = 1, footI = 0, fillI = 0.7, bulbI = 0.6, spotI = 0, dim = 0;
    let spotPos: V3 = [0, 0.2, 1.6];
    let keyPos: V3 = [3.2, 6.5, 3.5], keyTa: V3 = [2.2, 1.0, -1.6], keyCone = 0.93, keyI = 2.4;
    let keyC: V3 = [1.0, 0.95, 0.9];
    const robPos: V3 = [0, 0, -1.35];
    const robWalk = clockwork(t, 3.7, 3) * 0.6, robLook = 0.5 * Math.sin(clockwork(t, 1.3, 9) * 1.7);
    let cam: Cam;
    let flash = 0;

    if (shot === 0) {
      const p = prog(t, B[0]!, tB, ease.linear);
      cam = { ro: [lerp(0.6, 1.0, p), 1.55, lerp(7.6, 7.0, p)], ta: [lerp(0.4, 0.7, p), 1.45, -1.5], focal: 1.45 };
      flash = 1.2 * (1 - prog(t, B[0]!, B[0]! + 0.9, ease.outCubic));
      bulbI = 0.15; fillI = 0.45; alarmI = 1.5;
    } else if (shot === 1) {
      const p = prog(t, tB, B[4]!, ease.linear);
      const snap = prog(t, tB, tB + 0.35, ease.outCubic);
      cam = { ro: [lerp(0.4, lerp(-1.3, -1.6, p), snap), lerp(1.5, 1.3, snap), lerp(7.0, lerp(8.4, 7.9, p), snap)], ta: [lerp(0.7, -1.7, snap), lerp(1.45, 2.0, snap), -1.5], focal: 1.45 };
      keyPos = [-3.8, 6.5, 3.5]; keyTa = [-2.3, 1.2, -1.2]; keyI = 2.4;
      alarmI = 0.6; footI = 0.9; bulbI = 1.0; fillI = 0.45;
      // bonk on "show": the curtain drops, the lights snap
      flash = 0.25 * Math.exp(-Math.max(0, t - wShow.start) * 8) * (t > wShow.start ? 1 : 0);
    } else {
      // centre wall: the shadow
      const pIn = prog(t, B[4]!, B[6]!, ease.inOutCubic);
      const back = prog(t, B[7]! - 0.1, B[7]! + 0.6, ease.inOutCubic); // pull back wide on bar 49
      cam = {
        ro: mix3([0, 0.9, lerp(6.2, 5.4, pIn)], [0.0, 1.55, 7.8], back),
        ta: mix3([0, 1.35, -2.5], [0, 1.6, -1.8], back),
        focal: lerp(lerp(1.75, 1.9, pIn), 1.45, back),
      };
      alarmI = lerp(0.35, 0.12, pIn) * (1 - breath * 0.6); bulbI = 0.25 * (1 - breath * 0.5); fillI = 0.5;
      // the floor light slides up to the robot: the shadow grows from "smile" to "fear"
      const grow = prog(t, wSmile.start - 0.2, wFear.start, ease.inOutCubic), swallow = prog(t, wFear.start, wFear.end, ease.inOutCubic);
      spotI = prog(t, B[4]! + 0.1, B[4]! + 0.5) * 1.7;
      spotPos = [0, 0.1, lerp(lerp(1.4, robPos[2] + 0.34, grow), robPos[2] + 0.2, swallow)];
      keyI = 0; keyC = [0, 0, 0];
      dim = 0.4 + 0.6 * grow;
      if (shot === 3) { dim = 1; }
      if (t > tEnd - 0.6) { spotI *= 1 - 0.5 * prog(t, tEnd - 0.6, tEnd); }
    }

    setCam(u as any, cam);
    Object.assign(u.t!, { value: t });
    u.alarmAng!.value = t * (shot === 3 ? lerp(4.2, 0.6, breath) : 4.2) - (shot === 3 ? breath * 2 : 0);
    u.alarmI!.value = alarmI; u.curtain!.value = curtain; u.fillI!.value = fillI; u.footI!.value = footI; u.bulbI!.value = bulbI;
    u.spotI!.value = spotI; u.spotPos!.value = spotPos; u.dim!.value = dim;
    u.keyPos!.value = keyPos; u.keyTa!.value = keyTa; u.keyCone!.value = keyCone; u.keyCol!.value = keyC.map((x) => x * keyI);
    u.limbsA!.value = limbsA; u.headA!.value = headA; u.limbsB!.value = limbsB; u.headB!.value = headB;
    u.robWalk!.value = robWalk; u.robLook!.value = robLook; u.robPos!.value = robPos;
    this.stage.render(renderer, this.rt);
    comp.draw(renderer, this.rt.texture, out, { mode: 'replace' });

    // ---------------- type + lids
    const c = this.text.ctx; this.text.clear();
    if (shot === 0) {
      const bl = project(cam, [3.1, 3.5, -2.35]);
      drawLyricS(c, this.L1, t, { x: 790, y: 330, size: 80, weight: 700, maxWidth: 750, leading: 1.12, light: { x: bl.x - 200, y: bl.y - 400 }, shadow: 60, shadowAlpha: 0.65, linger: 0.35 });
    } else if (shot === 1) {
      drawLyricS(c, this.L2, t, { x: 150, y: 165, size: 82, weight: 700, maxWidth: 1650, leading: 1.1, light: { x: 900, y: -700 }, shadow: 70, shadowAlpha: 0.65, linger: 0.2, anticipate: 0.4 });
    } else {
      const sp = project(cam, spotPos);
      const light = { x: sp.x, y: sp.y + 200 };
      const fear = shot === 2 ? prog(t, wSmile.start, wFear.end) : 1;
      if (shot === 2 || t < this.L3.end + 0.3) {
        drawLyricS(c, this.L3, t, { x: 960, y: 520, size: 76, weight: 700, align: 'center', maxWidth: 1250, leading: 1.15, light, shadow: lerp(80, 260, fear), shadowAlpha: 0.8, linger: 0.25, base: 'ash', unsungAlpha: 0.75 });
      }
      if (shot === 3) this.drawKnow(c, t, light);
      this.drawLids(c, t, lid, wSmile.start);
    }
    comp.draw(renderer, this.text.upload(), out);

    const ks = project(cam, shot >= 2 ? spotPos : keyPos);
    return {
      ...GRADE.afternoon, flash,
      raysAt: [clamp(ks.x / 1920, -0.5, 1.5), clamp(1 - ks.y / 1080, -0.5, 1.8)] as [number, number],
      rays: shot >= 2 ? 0.08 : 0.2,
      vignette: 0.3 + 0.2 * lid,
      exposure: 1 - 0.25 * prog(t, tEnd - 0.5, tEnd),
    };
  }

  /** "'Cause I don't know, I don't know": the second one once, a little smaller, under the first; it fills word by
   *  word and finishes on the plate's last frame (the plate ends where "know" ends). */
  drawKnow(c: CanvasRenderingContext2D, t: number, light: { x: number; y: number }) {
    drawLyricS(c, this.L4a, t, { x: 960, y: 500, size: 80, weight: 700, align: 'center', light, shadow: 200, shadowAlpha: 0.7, anticipate: 0.4, linger: 3 });
    drawLyricS(c, this.L4b, t, { x: 960, y: 610, size: 66, weight: 700, align: 'center', unsungAlpha: 0.35, alpha: 0.95, light, shadow: 150, shadowAlpha: 0.7, anticipate: 0.35, linger: 2 });
  }

  /** The eyelids: dark lids closing to a slit; the lower lid's edge lights up as the smile. */
  drawLids(c: CanvasRenderingContext2D, t: number, lid: number, smileT: number) {
    if (lid <= 0.001 || DEBUG_NOLID) return;
    const cx = 960, cy = 600;
    const hMax = 800, h = lerp(hMax, 285, lid);
    const hw = lerp(1500, 1180, lid);
    const top = (x: number) => { const u = (x - cx) / hw; return cy - h * Math.max(0, 1 - u * u) - (1 - lid) * 200; };
    const bot = (x: number) => { const u = (x - cx) / hw; return cy + h * 0.92 * Math.max(0, 1 - u * u) + (1 - lid) * 200; };
    const N = 48;
    c.save();
    // upper lid
    let g = c.createLinearGradient(0, 0, 0, cy);
    g.addColorStop(0, rgba('ink', 1)); g.addColorStop(1, rgba('ink2', 1));
    c.fillStyle = g; c.beginPath(); c.moveTo(0, 0); c.lineTo(1920, 0);
    for (let i = N; i >= 0; i--) { const x = (i / N) * 1920; c.lineTo(x, top(x)); }
    c.closePath(); c.fill();
    // lower lid
    g = c.createLinearGradient(0, cy, 0, 1080);
    g.addColorStop(0, rgba('ink2', 1)); g.addColorStop(1, rgba('ink', 1));
    c.fillStyle = g; c.beginPath(); c.moveTo(0, 1080); c.lineTo(1920, 1080);
    for (let i = N; i >= 0; i--) { const x = (i / N) * 1920; c.lineTo(x, bot(x)); }
    c.closePath(); c.fill();
    // soft inner edge on the lids (a little depth)
    c.lineWidth = 3; c.strokeStyle = rgba('shadow', 0.9);
    c.beginPath(); for (let i = 0; i <= N; i++) { const x = (i / N) * 1920; if (i) c.lineTo(x, top(x)); else c.moveTo(x, top(x)); } c.stroke();
    // the smile: the lower lid's edge lights up in caution yellow, from the middle out
    const sp = prog(t, smileT, smileT + 0.45, ease.outCubic);
    if (sp > 0 && lid > 0.5) {
      const span = hw * 0.8 * sp;
      c.lineCap = 'round';
      for (const [w, a] of [[16, 0.12], [8, 0.3], [3.5, 1]] as const) {
        c.lineWidth = w; c.strokeStyle = rgba('signal', a * lid);
        c.beginPath();
        for (let i = 0; i <= N; i++) { const x = cx - span + (i / N) * span * 2; const y = bot(x) + 2; if (i) c.lineTo(x, y); else c.moveTo(x, y); }
        c.stroke();
      }
    }
    c.restore();
  }
}
