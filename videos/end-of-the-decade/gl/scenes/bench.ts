// bench · pre-chorus 1 (18.28–34.25), grade `candy`. The too-neat daytime park under a lilac cloud ceiling: a wooden
// marionette on a bench with his phone; his quote composes as a generic glass post card; "he swore": the card flips
// to a sworn statement signed by the thread; "he swore on everything": he slaps a growing pile on the beats; the band
// thins and the park lights go down to one spot on his blank, sweating face.
//
// Shots (bars 8–15, cuts on downbeats):
//   A 18.28–21.51  crane down from the cloud ceiling to the park; a robot zips past; "On a park bench, a young man said,"
//   B 21.51–25.76  3/4 two-shot of him and the post card his phone projects: "They believe what they're building …"
//   C 25.76–30.01  low angle: he stands on the bench in an oath pose; the card flips to a sworn statement
//   D 30.01–32.13  close: three slaps on a growing pile (book, book, cap) · 32.13–34.25 his face, a sweat drop, lights down
import * as THREE from 'three';
import { Scene, type Frame } from '@engine/scene';
import { FSPass, Layer2D, makeRT } from '@engine/gl';
import { aaPass } from './_aa';
import { rgba } from '@engine/palette';
import { F, font } from '@engine/type';
import { clamp, ease, keys, lerp, prog, smoothstep, type Key } from '@engine/util';
import type { Line } from '@engine/lyrics';
import { GLSL_CAST_SDF, GLSL_CAST_SHADE } from './_cast';
import { GRADE, drawLyric, drawThread, clockwork, yank } from './_look';
import { GLSL_KIT, GLSL_KIT_SHADE, camUniforms, setCam, project, pseudoLine, drawComposing, drawLyricS, rrect, mix3, type Cam, type V3 } from './bench-kit';

const RS = 1.0; // raymarch resolution scale (1 = full res; supersampled across the sub-frames, see _aa.ts)
const CEIL = 7.5; // the cloud ceiling
// The phone in his right hand (FRAG builds it, phoneWorld aims the hologram beam from it): the centre of the phone is
// PHONE_X in from the middle of the mitten (flat against the palm) and PHONE_RISE up from the middle of the palm.
const PHONE_X = 0.035, PHONE_RISE = 0.045;

const FRAG = /* glsl */ `
uniform float t, shot, dim, pile, pileJolt, phone;
uniform vec3 figPos; uniform float figYaw; uniform vec4 limbs; uniform vec3 head;
uniform vec3 robPos; uniform float robWalk, robLook;
uniform vec3 rob2Pos; uniform float rob2Walk, rob2Look;
uniform vec4 sweat;
uniform vec3 keyPos, keyTa, keyCol; uniform float keyCone;
${GLSL_CAST_SDF}
${GLSL_KIT}
#define CEIL ${CEIL.toFixed(2)}
#define PHONE_X ${PHONE_X.toFixed(4)}
#define PHONE_RISE ${PHONE_RISE.toFixed(4)}
#define M_LAWN 20.0
#define M_CANOPY 22.0
#define M_BENCH 23.0
#define M_SCREEN 24.0
#define M_IRON 25.0
#define M_BOOK 28.0
#define M_PORC 29.0
#define M_WATER 30.0

bool gDrop = true; // the sweat drop is seen but casts no shadow/AO (switched off after the primary hit)
vec3 figLocal(vec3 p) { vec3 q = p - figPos; q.xz = cs_rot(figYaw) * q.xz; return q; }
vec3 figWorld(vec3 a) { vec3 w = a; w.xz = cs_rot(-figYaw) * w.xz; return w + figPos; }

vec2 benchSDF(vec3 p) {
  vec3 q = p; q.x -= 0.0;
  float d = 1e9;
  // seat slats (3) and back slats (2)
  for (int i = 0; i < 3; i++) d = min(d, cs_box(q - vec3(0.0, 0.46, -0.16 + float(i) * 0.15), vec3(0.95, 0.018, 0.058), 0.012));
  for (int i = 0; i < 2; i++) d = min(d, cs_box(q - vec3(0.0, 0.66 + float(i) * 0.2, -0.27 - float(i) * 0.03), vec3(0.95, 0.06, 0.016), 0.012));
  vec2 r = vec2(d, M_BENCH);
  // cast-iron ends
  vec3 e = q; e.x = abs(e.x) - 0.84;
  float fr = cs_box(e - vec3(0.0, 0.22, 0.0), vec3(0.025, 0.22, 0.2), 0.01);
  fr = min(fr, cs_box(e - vec3(0.0, 0.62, -0.28), vec3(0.025, 0.36, 0.02), 0.01));
  fr = min(fr, cs_box(e - vec3(0.0, 0.43, -0.03), vec3(0.03, 0.02, 0.24), 0.008));
  return opU(r, vec2(fr, M_IRON));
}

vec2 pileSDF(vec3 p) {
  // on the seat right of him: book, book, cap (appear on the slaps)
  vec3 q = p - vec3(0.3, 0.475, 0.1);
  float j = pileJolt * 0.03;
  vec2 r = vec2(1e9, 0.0);
  if (pile > 0.5) r = opU(r, vec2(cs_box(q - vec3(0.0, 0.035 + j, 0.0), vec3(0.17, 0.035, 0.12), 0.008), M_BOOK + 0.1));
  if (pile > 1.5) { vec3 b = q - vec3(0.01, 0.105 + j * 1.5, 0.01); b.xz = cs_rot(0.25) * b.xz; r = opU(r, vec2(cs_box(b, vec3(0.15, 0.032, 0.11), 0.008), M_BOOK + 0.2)); }
  if (pile > 2.5) {
    vec3 c = q - vec3(0.0, 0.14 + j * 2.0, 0.0);
    float cap = max(length(c * vec3(1.0, 1.25, 1.0)) - 0.1, -c.y);
    cap = min(cap, cs_box(c - vec3(0.0, 0.004, 0.12), vec3(0.075, 0.005, 0.07), 0.004));
    r = opU(r, vec2(cap, M_BOOK + 0.3));
  }
  return r;
}

vec2 treeSDF(vec3 p, vec3 at, float s, float v) {
  vec3 q = p - at;
  float bound = length(q - vec3(0.0, 1.7 * s, 0.0)) - 1.8 * s;
  if (bound > 0.4) return vec2(bound, M_CANOPY);
  vec2 r = vec2(length(q - vec3(0.0, 2.25 * s, 0.0)) - 0.85 * s, M_CANOPY + v * 0.1);
  return opU(r, vec2(cs_cap(q, vec3(0.0), vec3(0.0, 1.6 * s, 0.0), 0.07 * s), M_PORC));
}

vec2 map(vec3 p) {
  vec2 r = vec2(p.y, M_LAWN);
  // bench (bounded)
  float bb = cs_box(p - vec3(0.0, 0.5, -0.05), vec3(1.0, 0.56, 0.36), 0.0);
  r = opU(r, bb > 0.1 ? vec2(bb, M_BENCH) : benchSDF(p));
  if (pile > 0.5) { float pb = cs_box(p - vec3(0.3, 0.62, 0.1), vec3(0.25, 0.2, 0.2), 0.0); r = opU(r, pb > 0.1 ? vec2(pb, M_BOOK) : pileSDF(p)); }
  // the young man (bounded)
  vec3 fp = figLocal(p);
  float fb = cs_box(fp - vec3(0.0, 1.05, 0.15), vec3(0.6, 1.2, 0.85), 0.0);
  if (fb > 0.15) r = opU(r, vec2(fb, MAT_WOOD));
  else {
    r = opU(r, sdMarionette(fp, limbs, head, 0.0));
    if (phone > -0.5) {
      // The phone, held upright in the right hand: built in the mitten's own frame (the same forward kinematics as
      // sdMarionette's right arm), flat against the inside of the palm with its back 8 mm clear of the palm and 6 mm
      // clear of the thumb, the bottom in the grip and the top standing clear. It can't pass through the hand in any pose.
      float a = limbs.y, fa = cs_foreAng(a);
      vec3 w = cs_limb(cs_limb(CS_M_SH, a, CS_M_UA), fa, CS_M_FA);
      vec3 hq = fp - w; hq.yz = cs_rot(-fa) * hq.yz;               // hand frame: -y down the fingers, palm faces -x
      vec2 up = vec2(cos(fa), sin(fa));                            // figure up, in the hand's yz plane
      vec3 d = hq - vec3(-PHONE_X, -0.075 + up.x * PHONE_RISE, up.y * PHONE_RISE);
      vec3 ph = vec3(dot(d.yz, vec2(-up.y, up.x)), dot(d.yz, up), d.x); // width, height, thickness
      r = opU(r, vec2(cs_box(ph, vec3(0.04, 0.075, 0.006), 0.005), M_SCREEN));
    }
    if (sweat.w > 0.0 && gDrop) {
      // a teardrop in head space (same rotations as sdMarionette's head), so it rides the head
      vec3 hq = fp - vec3(0.0, 1.5, 0.0);
      hq.xz = cs_rot(head.y) * hq.xz; hq.xy = cs_rot(head.x) * hq.xy; hq.yz = cs_rot(head.z + 0.06) * hq.yz;
      vec3 dq = hq - sweat.xyz; float dr = sweat.w;
      float drop = cs_smin(length(dq * vec3(1.0, 0.9, 1.0)) - dr, length(dq - vec3(0.0, dr * 1.05, 0.0)) - dr * 0.35, dr * 0.9);
      r = opU(r, vec2(drop, M_WATER));
    }
  }
  // tin robots (bounded)
  float rb = length(robPos + vec3(0.0, 0.3, 0.0) - p) - 0.45;
  r = opU(r, rb > 0.1 ? vec2(rb, MAT_TIN) : sdTinRobot(p - robPos, robWalk, robLook, 0.0));
  float rb2 = length(rob2Pos + vec3(0.0, 0.3, 0.0) - p) - 0.45;
  r = opU(r, rb2 > 0.1 ? vec2(rb2, MAT_TIN) : sdTinRobot(p - rob2Pos, rob2Walk, rob2Look, 2.0));
  // lamp post
  vec3 lp = p - vec3(2.7, 0.0, -1.7);
  float lb = cs_box(lp - vec3(0.0, 1.6, 0.0), vec3(0.3, 1.7, 0.3), 0.0);
  if (lb > 0.1) r = opU(r, vec2(lb, MAT_CHROME));
  else {
    r = opU(r, vec2(cs_cap(lp, vec3(0.0), vec3(0.0, 3.0, 0.0), 0.04), MAT_CHROME));
    r = opU(r, vec2(cs_cyl(lp - vec3(0.0, 0.05, 0.0), 0.05, 0.12), MAT_CHROME));
    r = opU(r, vec2(length(lp - vec3(0.0, 3.12, 0.0)) - 0.16, M_SCREEN + 0.1));
  }
  // box hedges (repeated, too neat)
  vec3 hq = p - vec3(0.0, 0.32, -2.7);
  float cell = 2.3; float hid = floor(hq.x / cell + 0.5); hq.x -= hid * cell;
  float hedge = abs(hid) < 5.5 ? cs_box(hq, vec3(0.95, 0.32, 0.38), 0.12) : 1e9;
  r = opU(r, vec2(hedge, M_CANOPY + 0.2));
  // lollipop trees
  r = opU(r, treeSDF(p, vec3(-3.4, 0.0, -4.2), 1.0, 0.0));
  r = opU(r, treeSDF(p, vec3(3.6, 0.0, -5.0), 1.15, 1.0));
  r = opU(r, treeSDF(p, vec3(-7.5, 0.0, -9.0), 1.3, 1.0));
  r = opU(r, treeSDF(p, vec3(7.8, 0.0, -10.0), 1.2, 0.0));
  r = opU(r, treeSDF(p, vec3(0.8, 0.0, -13.0), 1.4, 0.0));
  r = opU(r, treeSDF(p, vec3(-4.8, 0.0, 3.2), 1.0, 1.0));
  // the lab tower, far away, into the clouds
  vec3 tq = p - vec3(-15.0, 0.0, -34.0);
  float tower = cs_cyl(tq - vec3(0.0, 5.0, 0.0), 5.0, 1.3);
  tower = min(tower, cs_cyl(tq - vec3(0.0, 5.6, 0.0), 0.12, 1.6));
  tower = min(tower, cs_cyl(tq - vec3(0.0, 3.2, 0.0), 0.12, 1.5));
  r = opU(r, vec2(tower, M_PORC));
  r = opU(r, vec2(length(tq - vec3(1.3, 5.9, 0.0)) - 0.14, MAT_GLOW));
  return r;
}

void sceneMaterial(float id, float v, vec3 p, inout vec3 alb, inout float metal, inout float rough, inout vec3 emit) {
  if (id == M_LAWN) {
    // mown stripes, a neat gravel path in front of the bench
    float stripe = step(0.5, fract(p.x * 0.42));
    alb = mix(C_LILAC * 0.42 + C_BONE * 0.18, C_LILAC * 0.52 + C_BONE * 0.24, stripe);
    rough = 0.75;
    float path = smoothstep(0.03, 0.0, abs(p.z - 1.25) - 0.7);
    alb = mix(alb, mix(C_BONE, C_LILAC, 0.25) * 0.8, path); rough = mix(rough, 0.35, path);
    float edge = smoothstep(0.02, 0.0, abs(abs(p.z - 1.25) - 0.72));
    alb = mix(alb, C_BONE * 0.95, edge);
  } else if (id == M_CANOPY) {
    alb = v < 0.5 ? C_LILAC * 0.85 : v < 1.5 ? vec3(0.95, 0.62, 0.82) : C_LILAC * 0.5;
    rough = 0.3;
  } else if (id == M_BENCH) { alb = mix(vec3(0.55, 0.3, 0.16), vec3(0.62, 0.36, 0.2), 0.5 + 0.5 * sin(p.x * 60.0 + sin(p.z * 30.0))); rough = 0.4; }
  else if (id == M_IRON) { alb = C_INK2 * 1.2; metal = 0.6; rough = 0.3; }
  else if (id == M_SCREEN) { alb = vec3(0.05); rough = 0.2; emit = v < 0.5 ? mix(C_BONE, C_LILAC, 0.5) * (1.0 + 3.0 * phone) : C_BONE * 1.4 * (1.0 - dim * 0.9); }
  else if (id == M_BOOK) { alb = v < 1.5 ? vec3(0.55, 0.06, 0.05) : v < 2.5 ? vec3(0.05, 0.2, 0.5) : C_LILAC * 0.7; rough = 0.35; }
  else if (id == M_PORC) { alb = C_BONE * 0.9; rough = 0.22; }
  else if (id == M_WATER) { alb = vec3(0.62, 0.4, 0.24); metal = 0.0; rough = 0.03; }
}
${GLSL_CAST_SHADE}
${GLSL_KIT_SHADE}

vec3 skyCol(vec3 rd) {
  vec3 horizon = mix(C_LILAC, C_BONE, 0.3) * 0.5;
  vec3 col = horizon;
  if (rd.y > 0.0) {
    float tc = (CEIL - ro.y) / rd.y;
    vec3 q = ro + rd * tc;
    float n = fbm(q.xz * 0.22 + vec2(t * 0.02, 0.0), 4);
    float puff = smoothstep(-0.25, 0.55, n);
    vec3 under = mix(C_LILAC * 0.2 + C_SHADOW * 0.3, mix(C_LILAC, C_BONE, 0.2) * 0.55, puff);
    under += C_BONE * 0.12 * smoothstep(0.25, 0.65, n) * smoothstep(0.1, -0.2, fbm(q.xz * 0.22 + vec2(0.3, 0.2), 3));
    col = mix(under, horizon, smoothstep(12.0, 70.0, tc));
  }
  return col;
}

void main() {
  vec2 uv = (vUv - 0.5) * vec2(16.0 / 9.0, 1.0);
  vec3 fw; vec3 rd = camRay(uv, fw);
  float pix = 1.0 / (focal * rtRes.y);
  StageLight key = StageLight(keyPos, normalize(keyTa - keyPos), keyCol, keyCone);
  StageLight fill = StageLight(vec3(4.0, 3.5, 7.0), vec3(0.0), C_LILAC * mix(0.6, 0.12, dim), -1.0);
  StageLight rim = StageLight(vec3(-1.0, 4.0, -6.0), vec3(0.0), mix(vec3(0.75, 0.8, 1.0) * 1.3, vec3(0.5, 0.45, 0.9) * 0.9, dim), -1.0);
  vec3 envLo = C_LILAC * 0.12 * (1.0 - dim * 0.8), envHi = mix(C_LILAC, C_BONE, 0.3) * 0.45 * (1.0 - dim * 0.85);
  vec2 h = castMarch(ro, rd, 70.0);
  vec3 sky = skyCol(rd) * mix(1.0, 0.12, dim);
  vec3 col = sky;
  if (h.x > 0.0) {
    vec3 p = ro + rd * h.x, n = castNormal(p);
    gDrop = false;
    col = kShade(p, n, rd, h.y, key, fill, rim, 1.0, envLo, envHi);
    if (abs(h.y - M_WATER) < 0.5) {
      // clear glossy drop: the wood seen through it (darker at the refracting rim), a hard key glint, a softbox
      // catchlight, a bright caustic crescent at its bottom and a fresnel edge
      float fv = max(dot(n, -rd), 0.0);
      vec3 rf = reflect(rd, n);
      vec3 kd = normalize(key.pos - p);
      float glint = pow(max(dot(rf, kd), 0.0), 220.0);
      vec3 cr = normalize(cross(fw, vec3(0.0, 1.0, 0.0))), cu = cross(cr, fw);
      float soft = smoothstep(0.955, 0.985, dot(n, normalize(-rd + cu * 0.75 - cr * 0.45)));   // view-locked catchlight
      float caus = smoothstep(-0.15, -0.7, n.y) * smoothstep(0.2, 0.7, fv);
      col = col * mix(0.15, 1.15, smoothstep(0.15, 0.7, fv));
      col += C_BONE * (glint * 9.0 + soft * 2.2) + vec3(1.0, 0.88, 0.65) * caus * 0.6;
      col += mix(C_LILAC, C_BONE, 0.5) * pow(1.0 - fv, 4.0) * 0.6;
    }
    vec3 haze = mix(C_LILAC, C_BONE, 0.3) * 0.5 * mix(1.0, 0.12, dim);
    col = mix(col, haze, 1.0 - exp(-h.x * 0.02));
    if (rd.y > 0.0 && h.x > (CEIL - ro.y) / rd.y) col = sky; // into the clouds
  }
  // the strings: thin, pale, vanishing up into the cloud ceiling
  for (int i = 0; i < 5; i++) {
    vec3 a = figWorld(marionetteAnchor(i, limbs, head));
    vec3 b = vec3(a.x, CEIL + 0.5, a.z);
    vec2 s = hairline(ro, rd, a, b, h.x, pix, 0.0025);
    float fade = 1.0 - smoothstep(CEIL - 3.5, CEIL - 0.3, s.y);
    col = mix(col, mix(C_BONE, C_LILAC, 0.2) * mix(0.95, 0.5, dim), s.x * 0.55 * fade);
  }
  // the key's cone in the air (a breath of haze), stronger when the park goes dark
  float cone = 0.0;
  float tm = h.x > 0.0 ? min(h.x, 14.0) : 14.0;
  for (int i = 0; i < 12; i++) {
    float s = (float(i) + hash12(gl_FragCoord.xy + float(i)) ) / 12.0 * tm;
    vec3 q = ro + rd * s; vec3 ld = normalize(q - key.pos);
    cone += smoothstep(key.cone, mix(key.cone, 1.0, 0.3), dot(ld, key.dir)) / 12.0;
  }
  col += mix(C_BONE, C_SIGNAL, 0.35) * cone * mix(0.012, 0.05, dim) * tm / 14.0;
  fragColor = vec4(col, 1.0);
}`;

// ------------------------------------------------------------------ choreography helpers

const HEAD_Y = 1.64;
const SWEAT_X = -0.6; // brow, on the camera-facing side of the face (head-local x, fraction of the egg)
/** head-local point on the _cast.ts egg (centre neck+(0,.145,.012), radii .098/.125/.108) at height v (−1..1 of the
 *  egg), on the camera-side temple; the drop sits half proud of the surface. Returns [x, y, z, radius]. */
function sweatAt(v: number, r: number): number[] {
  const R = [0.098, 0.125, 0.108], C = [0, 0.145, 0.012];
  const dy = v, dx = SWEAT_X, dz = Math.sqrt(Math.max(0, 1 - dy * dy - dx * dx));
  const nx = dx / R[0]!, ny = dy / R[1]!, nz = dz / R[2]!, nl = Math.hypot(nx, ny, nz);
  const off = r * 0.45;
  return [C[0]! + R[0]! * dx + (nx / nl) * off, C[1]! + R[1]! * dy + (ny / nl) * off, C[2]! + R[2]! * dz + (nz / nl) * off, r > 0.001 ? r : 0];
}

export default class Bench extends Scene {
  rt = makeRT(1920 * RS, 1080 * RS);
  stage = aaPass(FRAG, {
    t: { value: 0 }, shot: { value: 0 }, dim: { value: 0 }, pile: { value: 0 }, pileJolt: { value: 0 }, phone: { value: 0 },
    figPos: { value: [0, 0, 0] }, figYaw: { value: 0 }, limbs: { value: [0, 0, 0, 0] }, head: { value: [0, 0, 0] },
    robPos: { value: [0, -5, 0] }, robWalk: { value: 0 }, robLook: { value: 0 },
    rob2Pos: { value: [0, -5, 0] }, rob2Walk: { value: 0 }, rob2Look: { value: 0 },
    sweat: { value: [0, 0, 0, 0] },
    keyPos: { value: [-4, 7, 5] }, keyTa: { value: [0, 0.8, 0] }, keyCol: { value: [8, 8, 8] }, keyCone: { value: 0.9 },
    rtRes: { value: [1440, 810] },
    ...camUniforms(),
  });
  text = new Layer2D();
  L1!: Line; L2!: Line; L3!: Line; L4!: Line;
  narr!: Line; quote!: Line;
  bars: number[] = [];

  override async init() {
    const ly = this.ctx.lyrics;
    this.L1 = ly.get('park bench')!; this.L2 = ly.get('could kill us')!; this.L3 = ly.get('wasn\'t marketing')!; this.L4 = ly.get('swore on everything')!;
    const split = this.L1.words.findIndex((w) => /They/.test(w.w));
    this.narr = pseudoLine(this.L1.words.slice(0, split), this.L1.i);
    this.quote = pseudoLine([...this.L1.words.slice(split), ...this.L2.words], this.L2.i);
    const au = this.ctx.audio;
    const b0 = Math.floor(au.barAt(this.ctx.start) + 0.1); // the bar the plate starts in (its start follows the lyric, which can be mid-bar)
    this.bars = Array.from({ length: 10 }, (_, i) => au.timeOfBeat((b0 + i) * 4));
    this.stage.u.rtRes!.value = [this.rt.width, this.rt.height];
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp, audio } = this.ctx;
    const t = f.t, B = this.bars; // B[0] = bar 8 downbeat ... B[8] = bar 16
    const u = this.stage.u;
    const shot = t < B[2]! ? 0 : t < B[4]! ? 1 : t < B[6]! ? 2 : 3;
    const beat = (i: number) => audio.timeOfBeat(Math.round(audio.barAt(B[0]!) * 4) + i); // beat i of the plate
    const yk = yank(audio, t);

    // ---------------- defaults: seated with the phone
    let figPos: V3 = [-0.35, -0.4, -0.02], figYaw = 0;
    let limbs = [0.9, 0.95, 1.45, 1.45], hd = [0.3, 0.0, 0.0];
    let cam: Cam = { ro: [0, 1.2, 5], ta: [0, 1, 0], focal: 1.6 };
    let dim = 0, pile = 0, jolt = 0, phoneGlow = 0.2;
    let keyPos: V3 = [-4.5, 7.5, 5.5], keyTa: V3 = [0, 0.8, 0], keyCone = 0.9, keyI = 3.8;
    let robPos: V3 = [0, -5, 0], robWalk = clockwork(t, 9.3, 1) * 1.7, robLook = 0.3 * Math.sin(clockwork(t, 1.7, 2));
    let rob2Pos: V3 = [0, -5, 0];
    const rob2Walk = clockwork(t, 6.1, 5) * 1.3, rob2Look = 0.6 * Math.sin(clockwork(t, 2.3, 7) * 1.3);
    let sweat = [0, 0, 0, 0];
    let shake: [number, number] = [0, 0], flash = 0;

    // head bob on the beat (a marionette never sits still)
    hd[0] += 0.06 * yk;
    limbs[2]! -= 0.05 * yk; limbs[3]! -= 0.08 * yank(audio, t + 0.1);

    if (shot === 0) {
      // crane down from the clouds to the park
      const c0 = Math.max(B[0]!, this.ctx.start), c1 = B[2]!; // the plate starts on "On" (after the bar 8 downbeat)
      // already under way on the cut: high over the park, the strings leading the eye down to him; decelerates
      const k = prog(t, c0, c0 + 2.1, ease.outCubic);
      const d = prog(t, c0 + 2.1, c1, ease.linear);
      cam = {
        ro: mix3([0.2, 5.4, 9.6], [1.4, lerp(2.0, 1.75, d), lerp(8.4, 6.4, d)], k),
        ta: mix3([-0.1, 1.9, -0.4], [0.1, 1.05, 0], k),
        focal: 1.5,
      };
      // a robot zips across the path, left to right
      const rx = lerp(-7, 7, prog(t, c0 + 0.35, c0 + 2.3, ease.linear));
      robPos = [rx, 0, 1.6]; robLook = -0.5 + 0.25 * Math.sin(clockwork(t, 3.1, 4));
      phoneGlow = 0.3 + 0.2 * prog(t, 19.2, 19.6);
      hd = [0.35 + 0.05 * yk, 0, 0];
    } else if (shot === 1) {
      // 3/4 two-shot: him (left) and the post card his phone projects (right)
      const p = prog(t, B[2]!, B[4]!, ease.linear);
      cam = { ro: [lerp(2.3, 1.95, p), lerp(1.3, 1.25, p), lerp(3.5, 3.0, p)], ta: [0.25, 1.02, -0.3], focal: 1.55 };
      phoneGlow = 1;
      rob2Pos = [-2.1 + 0.25 * Math.sin(clockwork(t, 0.9, 3)), 0, -1.7];
      // gestures: point to the tower ("believe"), yank on "kill", point at you, then himself ("you and me")
      const wBel = this.quote.words.find((w) => /believe/.test(w.w))!, wKill = this.L2.words.find((w) => /kill/.test(w.w))!;
      const wYou = this.L2.words.find((w) => /you/.test(w.w))!, wMe = this.L2.words[this.L2.words.length - 1]!;
      const aL = keys(t, [[wBel.start - 0.25, 0.9], [wBel.start, 2.25, ease.outBack], [wBel.end + 0.6, 2.2], [wBel.end + 1.0, 0.9], [wYou.start - 0.15, 0.9], [wYou.start + 0.05, 1.55, ease.outBack], [wMe.start - 0.08, 1.55], [wMe.start + 0.1, 0.35, ease.outCubic], [wMe.end + 0.4, 0.35], [wMe.end + 0.8, 0.9]]);
      const aR = keys(t, [[wKill.start - 0.12, 0.95], [wKill.start + 0.04, 1.7, ease.outCubic], [wKill.end + 0.1, 1.6], [wKill.end + 0.35, 0.95]]);
      limbs[0] = aL + 0.08 * yk; limbs[1] = aR;
      figYaw = keys(t, [[wBel.start - 0.3, 0], [wBel.start + 0.1, 0.45, ease.outBack], [wBel.end + 0.7, 0.45], [wBel.end + 1.1, -0.2], [wMe.end + 0.5, -0.2], [wMe.end + 0.9, 0]]);
      hd = [keys(t, [[wBel.start - 0.3, 0.3], [wBel.start, -0.15], [wBel.end + 0.8, -0.15], [wBel.end + 1.1, 0.05]]) + 0.05 * yk, 0, 0];
    } else if (shot === 2) {
      // oath: standing on the bench, right hand up (a little too perfectly), left on heart
      const p = prog(t, B[4]!, B[6]!, ease.linear);
      const snap = prog(t, B[5]! - 0.08, B[5]! + 0.25, ease.outCubic);
      cam = {
        ro: mix3([-1.9 + p * 0.5, 0.45, 3.9], [-1.2 + p * 0.3, 0.55, 3.0], snap),
        ta: [lerp(0.6, 0.15, snap), 1.55, 0], focal: lerp(1.45, 1.6, snap),
      };
      figPos = [-0.05, 0.47 + 0.035 * yk, -0.05];
      const up = prog(t, B[4]!, B[4]! + 0.35, ease.outBack);
      limbs = [lerp(0.2, 1.25, up), lerp(0.1, 2.95, up) - 0.12 * (1 - yk), 0.05 * yk, -0.05 * yk];
      hd = [-0.12 + 0.08 * yk, 0.15, 0];
      // fervent nods after "marketing"
      const wM = this.L3.words[this.L3.words.length - 1]!;
      if (t > wM.end) hd[0] = -0.12 + 0.3 * Math.max(0, Math.sin((t - wM.end) * Math.PI * 2 / (audio.timeOfBeat(1) - audio.timeOfBeat(0))));
      phoneGlow = 0.15;
      keyPos = [-3, 7.5, 5]; keyTa = [0, 1.5, 0];
      rob2Pos = [1.1, 0, 0.9]; // a robot watches him from the path
    } else {
      // close and quiet: slaps on a growing pile, then his face
      const slaps = [beat(25), beat(26), beat(27), beat(28)]; // 30.54, 31.07, 31.60, 32.13
      pile = slaps.filter((s) => t >= s).length;
      let raise = 0;
      for (const s of slaps) raise = Math.max(raise, smoothstep(s - 0.32, s - 0.1, t) * (1 - smoothstep(s - 0.05, s, t)));
      jolt = slaps.reduce((a, s) => a + (t >= s ? Math.exp(-(t - s) * 18) : 0), 0);
      figYaw = -0.8;
      figPos = [-0.32, -0.4, -0.02];
      limbs = [0.5, 1.15 + 1.5 * raise, 1.45, 1.45];
      hd = [0.1 - 0.15 * raise, -0.3, 0];
      phoneGlow = -1;
      dim = lerp(0.35, 0.6, prog(t, B[6]!, B[7]!));
      keyPos = [-1.2, 6.5, 3.2]; keyTa = [0.0, 0.8, 0.0]; keyCone = 0.955; keyI = 3.2;
      const hit = slaps.reduce((a, s) => a + (t >= s ? Math.exp(-(t - s) * 14) : 0), 0);
      shake = [0, 6 * hit];
      if (t < B[7]!) {
        const p = prog(t, B[6]!, B[7]!, ease.linear);
        cam = { ro: [lerp(1.35, 1.15, p), lerp(1.2, 1.12, p), lerp(2.7, 2.35, p)], ta: [lerp(-1.05, -1.0, p), 0.82, 0.0], focal: 1.6 };
      } else {
        // the face: blank wooden head, a sweat drop, the park lights going down to one spot
        pile = 4; jolt = Math.exp(-(t - B[7]!) * 18);
        const p = prog(t, B[7]!, B[8]!, ease.linear);
        const hw: V3 = [figPos[0], figPos[1] + HEAD_Y, figPos[2]];
        cam = { ro: [hw[0] + lerp(0.62, 0.5, p), hw[1] + 0.02, hw[2] + lerp(0.95, 0.78, p)], ta: [hw[0] - 0.2, hw[1] - 0.04, hw[2] + 0.1], focal: 1.75 };
        limbs = [0.5, 1.15, 1.45, 1.45];
        hd = [0.02 + 0.03 * yk, -0.25, 0];
        // the drop beads up on the downbeat (the cut), swells for two beats, then runs down on beat 3
        const bl = beat(29) - beat(28);
        const grow = prog(t, B[7]!, B[7]! + 0.18, ease.outBack) * (1 + 0.25 * prog(t, B[7]! + 0.2, B[7]! + 2 * bl, ease.inOutCubic));
        const run = prog(t, B[7]! + 2 * bl, B[7]! + 3.4 * bl, ease.inCubic);
        sweat = sweatAt(lerp(0.5, -0.3, run), 0.012 * grow * (1 - 0.15 * run));
        dim = lerp(0.6, 1.0, prog(t, B[7]! + 0.8, B[8]! - 0.1, ease.inOutCubic));
        keyPos = [hw[0] - 1.0, hw[1] + 4.0, hw[2] + 2.2]; keyTa = [hw[0], hw[1] - 0.3, hw[2]]; keyCone = 0.975; keyI = 2.2;
      }
    }

    // ---------------- uniforms
    setCam(u as any, cam);
    u.t!.value = t; u.shot!.value = shot; u.dim!.value = dim; u.pile!.value = pile; u.pileJolt!.value = jolt; u.phone!.value = phoneGlow;
    u.figPos!.value = figPos; u.figYaw!.value = figYaw; u.limbs!.value = limbs; u.head!.value = hd;
    u.robPos!.value = robPos; u.robWalk!.value = robWalk; u.robLook!.value = robLook;
    u.rob2Pos!.value = rob2Pos; u.rob2Walk!.value = rob2Walk; u.rob2Look!.value = rob2Look;
    u.sweat!.value = sweat;
    u.keyPos!.value = keyPos; u.keyTa!.value = keyTa; u.keyCone!.value = keyCone;
    const kc: V3 = [1.0, 0.96, 0.9]; u.keyCol!.value = kc.map((x) => x * keyI);
    this.stage.render(renderer, this.rt);
    comp.draw(renderer, this.rt.texture, out, { mode: 'replace' });

    // ---------------- type
    const c = this.text.ctx; this.text.clear();
    const keyScr = project(cam, keyPos);
    const light = { x: clamp(keyScr.x, -1500, 3400), y: clamp(keyScr.y, -1500, 2500) };
    if (shot === 0) {
      drawLyricS(c, this.narr, t, { x: 150, y: 250, size: 96, weight: 700, maxWidth: 1300, light, shadow: 50, shadowAlpha: 0.7, linger: 0.4, anticipate: 0.4, base: 'ash', unsungAlpha: 0.75 });
    } else if (shot === 1 || shot === 2) {
      this.drawCard(c, t, shot, cam, figPos, figYaw, limbs);
    } else {
      drawLyricS(c, this.L4, t, { x: 150, y: 300, size: 118, weight: 900, maxWidth: 1000, leading: 1.05, light: { x: -400, y: -900 }, shadow: t < B[7]! ? 120 : 220, shadowAlpha: 0.8, linger: 1.6, anticipate: 0.4 });
    }
    comp.draw(renderer, this.text.upload(), out);

    const g = GRADE.candy!;
    return { ...g, shake, flash, raysAt: [clamp(keyScr.x / 1920, -0.5, 1.5), clamp(1 - keyScr.y / 1080, -0.5, 1.8)] as [number, number], rays: 0.25 + dim * 0.3, vignette: 0.22 + dim * 0.35 };
  }

  /** The post card: a smoked-glass hologram projected by his phone (B), flipped to a sworn statement (C). */
  drawCard(c: CanvasRenderingContext2D, t: number, shot: number, cam: Cam, figPos: V3, figYaw: number, limbs: number[]) {
    const B = this.bars;
    const x = shot === 1 ? 1010 : 1060, y = shot === 1 ? 170 : 190, w = 780, h = shot === 1 ? 560 : 600;
    // appear / flip
    let sx = 1, face = 0; // face 0 = post, 1 = sworn statement
    if (shot === 1) sx = ease.outBack(prog(t, B[2]!, B[2]! + 0.35));
    else { const fl = prog(t, B[4]!, B[4]! + 0.45, ease.inOutCubic); sx = Math.abs(Math.cos(fl * Math.PI)); face = fl > 0.5 ? 1 : 0; if (fl < 0.5) face = 0; }
    const alpha = shot === 2 ? 1 - prog(t, B[6]! - 0.2, B[6]!) : 1;
    // hologram beam from the phone (shot B only)
    if (shot === 1) {
      const a = [0.9, limbs[1]!];
      const hand = this.phoneWorld(figPos, figYaw, limbs);
      const ps = project(cam, hand);
      const g = c.createLinearGradient(ps.x, ps.y, x + 40, y + h);
      g.addColorStop(0, rgba('bone', 0.28 * sx)); g.addColorStop(1, rgba('lilac', 0.04 * sx));
      c.fillStyle = g;
      c.beginPath(); c.moveTo(ps.x, ps.y); c.lineTo(x + 20, y + 40); c.lineTo(x + 30, y + h - 10); c.closePath(); c.fill();
      void a;
    }
    c.save();
    c.globalAlpha = alpha;
    const cx = x + w / 2;
    c.translate(cx, y + h / 2); c.transform(1, -0.035, 0, 1, 0, 0); c.scale(Math.max(0.001, sx), 1); c.translate(-cx, -(y + h / 2));
    // glass body
    const g = c.createLinearGradient(x, y, x + w * 0.4, y + h);
    g.addColorStop(0, 'rgba(40,36,78,0.86)'); g.addColorStop(1, 'rgba(14,16,34,0.92)');
    c.fillStyle = g; rrect(c, x, y, w, h, 28); c.fill();
    c.fillStyle = rgba('bone', 0.08); rrect(c, x + 6, y + 6, w - 12, 60, 22); c.fill();
    c.strokeStyle = rgba('lilac', 0.55); c.lineWidth = 1.5; rrect(c, x, y, w, h, 28); c.stroke();
    // scan sheen
    const sh = ((t * 0.35) % 1) * (h + 200) - 100;
    const sg = c.createLinearGradient(0, y + sh - 60, 0, y + sh + 60);
    sg.addColorStop(0, 'rgba(184,166,255,0)'); sg.addColorStop(0.5, 'rgba(184,166,255,0.07)'); sg.addColorStop(1, 'rgba(184,166,255,0)');
    c.save(); rrect(c, x, y, w, h, 28); c.clip(); c.fillStyle = sg; c.fillRect(x, y, w, h); c.restore();
    if (face === 0) {
      // header: generic avatar + placeholder bars (no real UI), a mono timestamp
      c.fillStyle = rgba('lilac', 0.9); c.beginPath(); c.arc(x + 62, y + 70, 26, 0, Math.PI * 2); c.fill();
      c.fillStyle = rgba('ink', 0.9); c.beginPath(); c.arc(x + 62, y + 63, 9, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(x + 62, y + 88, 15, Math.PI, 0); c.fill();
      c.fillStyle = rgba('bone', 0.75); rrect(c, x + 104, y + 52, 190, 16, 8); c.fill();
      c.fillStyle = rgba('ash', 0.5); rrect(c, x + 104, y + 78, 120, 12, 6); c.fill();
      c.font = font(F.mono(500, 100), 18); c.fillStyle = rgba('ash', 0.8); c.textAlign = 'right';
      c.fillText('POSTING…', x + w - 40, y + 76); c.textAlign = 'left';
      drawComposing(c, this.quote, t, { x: x + 48, y: y + 185, size: 58, weight: 700, maxWidth: w - 96, leading: 1.18, lead: 0.3, unsungAlpha: 0.45, light: { x: x - 300, y: y - 600 }, shadow: 40, shadowAlpha: 0.9 });
      // the reply thread under the post (the thread's ordinary job)
      const q = this.quote.words[this.quote.words.length - 1]!;
      const rp = prog(t, q.end - 0.2, q.end + 0.4, ease.outCubic);
      if (rp > 0) drawThread(c, x + 62, y + h - 60, x + 62 + (w - 124) * rp, y + h - 60, t, { alpha: 0.5, sway: 0 });
    } else {
      c.font = font(F.mono(500, 112.5), 20); c.fillStyle = rgba('lilac', 0.9);
      (c as any).letterSpacing = '5px';
      c.fillText('STATEMENT · UNDER OATH', x + 50, y + 78);
      (c as any).letterSpacing = '0px';
      c.fillStyle = rgba('lilac', 0.3); c.fillRect(x + 50, y + 100, w - 100, 1.5);
      drawLyric(c, this.L3, t, { x: x + 50, y: y + 225, size: 84, weight: 900, maxWidth: w - 100, leading: 1.1, anticipate: 0.3, linger: 3, light: { x: x - 300, y: y - 700 }, shadow: 50, shadowAlpha: 0.9 });
      // the signature line, drawn by the thread across "marketing"
      const wM = this.L3.words[this.L3.words.length - 1]!;
      const sp = prog(t, wM.start, wM.end + 0.2, ease.inOutCubic);
      const ly = y + h - 90;
      c.font = font(F.mono(300, 100), 16); c.fillStyle = rgba('ash', 0.7); c.fillText('SIGNED', x + 50, ly + 34);
      c.font = font(F.display(300), 34); c.fillStyle = rgba('ash', 0.6); c.fillText('×', x + 50, ly - 10);
      if (sp > 0) {
        // straight line with one loop (a flourish), drawn as it goes
        c.save(); c.strokeStyle = rgba('bone', 0.75); c.lineWidth = 1.4; c.lineCap = 'round'; c.beginPath();
        const N = 90, x0 = x + 95, x1 = x + w - 60;
        for (let i = 0; i <= N * sp; i++) {
          const f = i / N, px = lerp(x0, x1, f);
          const loop = Math.exp(-Math.pow((f - 0.3) / 0.07, 2));
          const X = px + loop * 26 * Math.sin(f * 90), Y = ly - loop * 28 * (1 - Math.cos(f * 90)) * 0.5;
          if (i === 0) c.moveTo(X, Y); else c.lineTo(X, Y);
        }
        c.stroke(); c.restore();
      }
    }
    c.restore();
  }

  /** The centre of his phone in world space: mirrors FRAG's phone (the _cast.ts forward kinematics of the right arm). */
  phoneWorld(figPos: V3, figYaw: number, limbs: number[]): V3 {
    const a = limbs[1]!, fa = a + 0.14 + 0.32 * Math.abs(a);                   // cs_foreAng
    const ey = 1.425 - Math.cos(a) * 0.29, ez = Math.sin(a) * 0.29;            // elbow (CS_M_SH, CS_M_UA)
    const wy = ey - Math.cos(fa) * 0.26, wz = ez + Math.sin(fa) * 0.26;        // wrist (CS_M_FA)
    // middle of the mitten (0.075 down the fingers), then PHONE_RISE straight up; x: in from the hand toward the body
    const hx = 0.205 - PHONE_X, hy = wy - Math.cos(fa) * 0.075 + PHONE_RISE, hz = wz + Math.sin(fa) * 0.075;
    const c = Math.cos(-figYaw), s = Math.sin(-figYaw);
    const x = c * hx + s * hz, z = -s * hx + c * hz;
    return [figPos[0] + x, figPos[1] + hy, figPos[2] + z];
  }

}
