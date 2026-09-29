// The town square at night, shared by the `decade` (chorus 1) and `hook` (dance break) plates: a glossy navy stage
// floor, a pale town-hall wall with a marquee light box ("THE END OF THE DECADE"), a sea of marionettes (domain
// repetition, LOD), one small tin robot in front of a floor spotlight that blows its shadow up the wall, a few extra
// robots / an hourglass / a cuffed hand / a hook for the cameos, haze. One fullscreen raymarch.
// Plane geometry (floor, wall, sign, sky) is analytic; only the figures are marched.
import * as THREE from 'three';
import { FSPass } from '@engine/gl';
import { aaPass } from './_aa';
import { F, font, layout } from '@engine/type';
import { GLSL_CAST_SDF, GLSL_CAST_SHADE } from './_cast';

// ------------------------------------------------------------------ crowd grid (shared TS/GLSL, float-exact hashes)
export const CX = 1.3, CZ = 1.55;
/** R2 low-discrepancy "hash" of an integer cell: exact enough in GLSL float for |i| < 1000. */
export const h1 = (ix: number, iz: number) => { const v = ix * 0.7548776662 + iz * 0.5698402910 + 0.31; return v - Math.floor(v); };
export const h2 = (ix: number, iz: number) => { const v = ix * 0.5698402910 + iz * 0.7548776662 + 0.77; return v - Math.floor(v); };
export const cellCenter = (ix: number, iz: number) => {
  const off = (((iz % 2) + 2) % 2) * 0.5 * CX;
  return { x: ix * CX + off + (h1(ix, iz) - 0.5) * 0.22, z: iz * CZ + (h2(ix, iz) - 0.5) * 0.22 };
};

// ------------------------------------------------------------------ camera
export interface Cam { ro: [number, number, number]; ta: [number, number, number]; focal: number; roll?: number }
const sub = (a: number[], b: number[]) => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const cross = (a: number[], b: number[]) => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
const norm = (a: number[]) => { const l = Math.hypot(a[0]!, a[1]!, a[2]!) || 1; return [a[0]! / l, a[1]! / l, a[2]! / l]; };
export function camBasis(c: Cam) {
  const fw = norm(sub(c.ta, c.ro));
  const rt = norm(cross(fw, [0, 1, 0]));
  const up = cross(rt, fw);
  return { fw, rt, up };
}
/** World point -> screen px (1920x1080, y down). z = depth (negative = behind the camera). */
export function project(c: Cam, p: number[]) {
  const { fw, rt, up } = camBasis(c);
  const d = sub(p, c.ro);
  const z = dot(d, fw);
  const u = (dot(d, rt) / z) * c.focal, v = (dot(d, up) / z) * c.focal;
  return { x: u * 1080 + 960, y: 540 - v * 1080, z };
}
export function syncThreeCam(cam3: THREE.PerspectiveCamera, c: Cam) {
  cam3.fov = (2 * Math.atan(0.5 / c.focal) * 180) / Math.PI;
  cam3.aspect = 16 / 9; cam3.near = 0.05; cam3.far = 2000;
  cam3.position.set(...c.ro); cam3.up.set(0, 1, 0); cam3.lookAt(...c.ta);
  cam3.updateProjectionMatrix(); cam3.updateMatrixWorld(true);
}
export const lerpCam = (a: Cam, b: Cam, u: number): Cam => ({
  ro: [0, 1, 2].map((i) => a.ro[i]! + (b.ro[i]! - a.ro[i]!) * u) as [number, number, number],
  ta: [0, 1, 2].map((i) => a.ta[i]! + (b.ta[i]! - a.ta[i]!) * u) as [number, number, number],
  focal: a.focal + (b.focal - a.focal) * u,
});

// ------------------------------------------------------------------ the marquee sign texture
export const SIGN_WORDS = ['THE', 'END', 'OF', 'THE', 'DECADE'];
export const SIGN = { w: 17.0, h: 2.7, y: 10.2 }; // metres (centre y), on the wall
/** R = glyph coverage, G = word index/5 (×R), B = x within the word 0..1 (×R). Built once. */
export function makeSignTexture(): THREE.Texture {
  const TW = 2048, TH = Math.round((2048 * SIGN.h) / SIGN.w);
  const cv = document.createElement('canvas'); cv.width = TW; cv.height = TH;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#000'; c.fillRect(0, 0, TW, TH);
  const fam = F.display(900);
  let size = 200; const tr = 10;
  const meas = (sz: number) => {
    const sp = layout(' ', fam, sz, tr).width * 1.7;
    const widths = SIGN_WORDS.map((w) => layout(w, fam, sz, tr).width);
    return { sp, widths, total: widths.reduce((a, b) => a + b, 0) + sp * (SIGN_WORDS.length - 1) };
  };
  size = Math.min(size, size * (TW * 0.86) / meas(size).total);
  const { sp, widths, total } = meas(size);
  let x = (TW - total) / 2;
  c.font = font(fam, size); (c as any).letterSpacing = `${tr}px`; c.textBaseline = 'alphabetic';
  SIGN_WORDS.forEach((w, i) => {
    const g = c.createLinearGradient(x, 0, x + widths[i]!, 0);
    const G = Math.round((i / 5) * 255 + 20);
    g.addColorStop(0, `rgb(255,${G},0)`); g.addColorStop(1, `rgb(255,${G},255)`);
    c.fillStyle = g;
    c.fillText(w, x, TH * 0.5 + size * 0.36);
    x += widths[i]! + sp;
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true; tex.needsUpdate = true;
  return tex;
}

// ------------------------------------------------------------------ the shader
export const WORLD_FRAG = /* glsl */ `
uniform vec3 camPos, camTa; uniform float camFocal;
uniform vec3 lampPos, lampDir; uniform float lampCone, lampPow, lampOn;
uniform vec4 rob[4];      // x, z, yaw, walk   (rob[0] = the spotlit robot)
uniform vec4 robB[4];     // look, variant, active, scale
uniform vec4 crowdBox;    // xHalf, zFront, zBack, fillZ (cells with z > fillZ exist)
uniform vec4 yk;          // yank at 4 small delays
uniform vec4 pose;        // armSwing, clutch, phone, legKick
uniform float rippleZ, smile, beatPar, dance, lookUp;
uniform float wallZ, wallOn, signOn, chase;
uniform float sw[5];      // sign word progress 0..1
uniform sampler2D signTex;
uniform vec4 hg;          // hourglass x, z, angle, on
uniform float hgSand;     // 0..1 sand fallen since the flip
uniform vec4 hand;        // x, y, z, on
uniform vec3 handRot;     // pinch, twist, scale
uniform vec4 hookP;       // x, y, z, on (hook tip position; string up to +inf)
uniform float keyCrowd, keyRobot, wallAlb;
uniform float haze, fillLev, time, night, farFog, spots;
uniform vec4 beamA, beamB; // extra sweeping beams: x, z (floor aim), angle, intensity

${GLSL_CAST_SDF}

#define MAT_PHONE 13.0
#define MAT_LENS 15.0
#define MAT_HOUSING 16.0
#define MAT_SAND 17.0

float r2a(vec2 i) { return fract(i.x * 0.7548776662 + i.y * 0.5698402910 + 0.31); }
float r2b(vec2 i) { return fract(i.x * 0.5698402910 + i.y * 0.7548776662 + 0.77); }

// ---- one crowd cell: returns local figure-space point, lift, id
vec3 cellLocal(vec3 p, out vec2 id, out float bnd) {
  float iz = floor(p.z / ${CZ.toFixed(4)} + 0.5);
  float off = mod(iz, 2.0) * 0.5 * ${CX.toFixed(4)};
  float ix = floor((p.x - off) / ${CX.toFixed(4)} + 0.5);
  id = vec2(ix, iz);
  vec2 cc = vec2(ix * ${CX.toFixed(4)} + off, iz * ${CZ.toFixed(4)});
  bnd = min(${(CX * 0.5).toFixed(4)} - abs(p.x - cc.x), ${(CZ * 0.5).toFixed(4)} - abs(p.z - cc.y));
  vec2 j = (vec2(r2a(id), r2b(id)) - 0.5) * 0.22;
  return p - vec3(cc.x + j.x, 0.0, cc.y + j.y);
}
bool cellOn(vec2 id) {
  float z = id.y * ${CZ.toFixed(4)};
  float x = id.x * ${CX.toFixed(4)};
  return z <= crowdBox.y + 0.01 && z >= crowdBox.z && z > crowdBox.w && abs(x) <= crowdBox.x;
}
float cellLift(vec2 id) {
  float h = r2a(id * 1.7 + 3.0);
  float y = h < 0.25 ? yk.x : h < 0.5 ? yk.y : h < 0.75 ? yk.z : yk.w;
  return y;
}
void cellPose(vec2 id, float y, out vec4 limbs, out vec3 head) {
  float h = r2b(id + 5.0);
  float cz = id.y * ${CZ.toFixed(4)};
  float cl = pose.y * smoothstep(rippleZ - 1.5, rippleZ + 1.5, cz);          // clutching (fright ripple, front first)
  float par = mod(id.x + id.y + beatPar, 2.0) < 1.0 ? 1.0 : -1.0;
  float aL = 0.18 + y * pose.x * (0.9 + 0.3 * h) + dance * (par > 0.0 ? 1.9 : 0.4) * y;
  float aR = 0.12 + y * pose.x * (0.8 + 0.4 * h) + dance * (par > 0.0 ? 0.4 : 1.9) * y;
  aL = mix(aL, 2.75, cl); aR = mix(aR, 2.65, cl);
  aR = mix(aR, 1.3 + 0.12 * y, pose.z);
  float kick = pose.w * y;
  limbs = vec4(-aL, -aR, par > 0.0 ? kick : -0.15 * kick, par > 0.0 ? -0.15 * kick : kick);
  // head = (sideways tilt, yaw, droop/nod): a small cock of the head per figure, nod falls when the string is slack,
  // looking up (at the sign / the shadow) is a negative nod
  head = vec3((h - 0.5) * 0.3 * (1.0 - cl), (h - 0.5) * 0.7 * (1.0 - cl), 0.28 * (1.0 - y) - 0.08 - lookUp * (0.6 + 0.4 * h) - 0.25 * cl);
}
vec2 crowd(vec3 p, float lod) {
  // outside the crowd block: distance to it
  vec3 bc = vec3(0.0, 1.1, 0.5 * (crowdBox.y + crowdBox.z));
  vec3 bh = vec3(crowdBox.x + 1.0, 1.15, 0.5 * (crowdBox.y - crowdBox.z) + 1.0);
  vec3 dq = abs(p - bc) - bh;
  float db = length(max(dq, 0.0));
  if (db > 0.3) return vec2(db, MAT_NONE);
  vec2 id; float bnd;
  vec3 q = cellLocal(p, id, bnd);
  float dEdge = max(bnd, 0.0) + 0.03;
  if (!cellOn(id)) return vec2(dEdge, MAT_NONE);
  float y = cellLift(id);
  q.y -= 0.07 * y;
  // bounding capsule
  float dcap = length(vec2(length(q.xz), max(abs(q.y - 1.05) - 0.95, 0.0))) - 0.75;
  if (dcap > 0.1) return vec2(min(dcap, dEdge), MAT_NONE);
  float v = floor(r2a(id + 11.0) * 1.999); // maple / walnut
  vec2 r;
  if (lod < 0.5) {
    vec4 limbs; vec3 head; cellPose(id, y, limbs, head);
    r = sdMarionette(q, limbs, head, v);
    if (pose.z > 0.01) {
      vec3 hp = marionetteAnchor(2, limbs, head);
      r = opU(r, vec2(cs_box(q - hp - vec3(0.0, 0.07, 0.02), vec3(0.045 * pose.z, 0.075 * pose.z, 0.006), 0.006), MAT_PHONE));
    }
  } else {
    float mw = MAT_WOOD + 0.1 * v;
    r = vec2(cs_cap(q, vec3(0.0, 0.5, 0.0), vec3(0.0, 1.35, 0.0), 0.17), mw);
    r = opU(r, vec2(length(q - vec3(0.0, 1.64, 0.0)) - 0.12, mw));
    if (pose.z > 0.01) r = opU(r, vec2(length(q - vec3(0.2, 1.42, 0.35)) - 0.06 * pose.z, MAT_PHONE));
    if (pose.y > 0.01 || dance > 0.01) {
      float up = max(pose.y * smoothstep(rippleZ - 1.5, rippleZ + 1.5, id.y * ${CZ.toFixed(4)}), dance * y);
      r = opU(r, vec2(cs_cap(vec3(abs(q.x), q.yz), vec3(0.2, 1.4, 0.0), vec3(0.28, mix(0.8, 1.95, up), 0.0), 0.05), mw));
    }
  }
  r.x = min(r.x, dEdge);
  return r;
}

vec2 robotAt(vec3 p, int i) {
  vec4 a = rob[i], b = robB[i];
  vec3 q = p - vec3(a.x, 0.0, a.y);
  if (length(q - vec3(0.0, 0.32 * b.w, 0.0)) > 0.55 * b.w) return vec2(length(q - vec3(0.0, 0.32 * b.w, 0.0)) - 0.5 * b.w, MAT_NONE);
  q.xz = cs_rot(a.z) * q.xz;
  vec2 r = sdTinRobot(q / b.w, a.w, b.x, b.y);
  r.x *= b.w;
  return r;
}
vec2 robots(vec3 p) {
  vec2 r = vec2(1e5, MAT_NONE);
  for (int i = 0; i < 4; i++) if (robB[i].z > 0.5) r = opU(r, robotAt(p, i));
  return r;
}
// hourglass: frame discs + posts, sand (glass is analytic, see glassHit)
const float HG_H = 0.62; // half height, metres
vec3 hgLocal(vec3 p) {
  vec3 q = p - vec3(hg.x, 1.0 + HG_H + 0.08, hg.y);
  q.xy = cs_rot(hg.z) * q.xy;
  return q;
}
vec2 hourglass(vec3 p) {
  vec3 q = hgLocal(p);
  float bb = length(q) - 1.0;
  vec3 pl = p - vec3(hg.x, 0.5, hg.y);                                  // plinth
  vec2 r = vec2(cs_box(pl, vec3(0.45, 0.5, 0.45), 0.03), MAT_PORCELAIN);
  if (bb > 0.2) return opU(r, vec2(bb, MAT_NONE));
  vec3 qa = vec3(q.x, abs(q.y) - HG_H - 0.04, q.z);
  r = opU(r, vec2(cs_cyl(qa, 0.04, 0.42), MAT_CHROME));
  vec3 qp = vec3(abs(q.x), q.y, abs(q.z));
  r = opU(r, vec2(cs_cap(qp, vec3(0.3, -HG_H, 0.3), vec3(0.3, HG_H, 0.3), 0.025), MAT_CHROME));
  // sand, in the glass's own frame (it turns with the flip). Before the flip it has all run into the q.y<0 bulb;
  // after the flip that bulb is on top and the sand runs from its neck end into the q.y>0 bulb.
  float bulb = length(vec3(q.x, abs(q.y) - HG_H * 0.5, q.z)) - HG_H * 0.44;
  bool flipped = hg.z > 1.5708;
  float sA, sB, stream = 1e5;
  if (!flipped) {
    sA = max(bulb, max(q.y - (-HG_H * 0.2), -q.y - HG_H));
    sB = 1e5;
  } else {
    float s = hgSand;
    sA = max(bulb, max(q.y + HG_H * 0.06, -q.y - (HG_H * 0.06 + 0.8 * HG_H * (1.0 - s))));
    sB = max(bulb, max(q.y - HG_H, -q.y + (HG_H - 0.8 * HG_H * s)));
    if (s < 0.98) stream = cs_cap(q, vec3(0.0, -0.05, 0.0), vec3(0.0, HG_H - 0.8 * HG_H * s, 0.0), 0.01);
  }
  float lower = min(sA, sB), upper = 1e5;
  r = opU(r, vec2(min(min(lower, upper), stream), MAT_SAND));
  return r;
}
vec2 handSDF(vec3 p) {
  vec3 q = p - hand.xyz;
  float bb = length(q - vec3(0.0, 0.07 * handRot.z, 0.0)) - 0.4 * handRot.z;
  if (bb > 0.2) return vec2(min(bb, max(length(q.xz) - 0.06 * handRot.z, -q.y)), MAT_NONE);
  q.xz = cs_rot(handRot.y) * q.xz;
  float S = handRot.z;
  vec2 r = sdHand(q / S, handRot.x, 0.0); r.x *= S;
  r = opU(r, vec2(cs_cap(q, vec3(0.0, 0.12 * S, 0.0), vec3(0.0, 40.0, 0.0), 0.052 * S), MAT_CLOTH)); // the sleeve up out of frame
  return r;
}
vec2 hookSDF(vec3 p) {
  vec3 q = p - hookP.xyz;
  float bb = length(q - vec3(0.0, 0.1, 0.0)) - 0.35;
  vec2 r = vec2(1e5, MAT_NONE);
  // string: up out of frame
  r = opU(r, vec2(cs_cap(q, vec3(0.0, 0.26, 0.0), vec3(0.0, 60.0, 0.0), 0.006), MAT_STRING));
  if (bb > 0.1) return opU(r, vec2(bb, MAT_NONE));
  r = opU(r, vec2(cs_cap(q, vec3(0.0, 0.26, 0.0), vec3(0.0, 0.02, 0.0), 0.018), MAT_CHROME));      // shank
  vec3 hq = q - vec3(0.07, 0.02, 0.0);
  float ang = atan(hq.y, hq.x);
  float tor = length(vec2(length(hq.xy) - 0.07, hq.z)) - 0.018;
  tor = max(tor, hq.y - 0.0 + 0.0 * ang); // lower half
  r = opU(r, vec2(tor, MAT_CHROME));
  r = opU(r, vec2(cs_cap(q, vec3(0.14, 0.02, 0.0), vec3(0.15, 0.09, 0.0), 0.016), MAT_CHROME));  // barb
  r = opU(r, vec2(length(q - vec3(0.0, 0.27, 0.0)) - 0.03, MAT_BRASS));                          // eye
  return r;
}
vec2 lamp(vec3 p) {
  vec3 q = p - lampPos;
  if (length(q) > 0.6) return vec2(length(q) - 0.5, MAT_NONE);
  // can light aimed along lampDir (yaw only + pitch): build a frame
  vec3 f = normalize(lampDir); vec3 s = normalize(cross(f, vec3(0.0, 1.0, 0.0))); vec3 u = cross(s, f);
  vec3 lq = vec3(dot(q, s), dot(q, u), dot(q, f));
  float body = max(length(lq.xy) - 0.17, abs(lq.z + 0.12) - 0.2);
  float lens = max(length(lq.xy) - 0.14, abs(lq.z - 0.08) - 0.01);
  vec2 r = vec2(body, MAT_HOUSING);
  r = opU(r, vec2(lens, MAT_LENS));
  vec3 yq = q - vec3(0.0, -0.1, 0.0);
  r = opU(r, vec2(cs_box(yq - vec3(0.0, -0.05, 0.0), vec3(0.22, 0.03, 0.18), 0.02), MAT_HOUSING)); // base
  return r;
}

float gLod = 0.0;
vec2 map(vec3 p) {
  vec2 r = crowd(p, gLod);
  if (lampOn > -0.5) r = opU(r, lamp(p));
  r = opU(r, robots(p));
  if (hg.w > 0.5) r = opU(r, hourglass(p));
  if (hand.w > 0.5) r = opU(r, handSDF(p));
  if (hookP.w > 0.5) r = opU(r, hookSDF(p));
  return r;
}

${GLSL_CAST_SHADE}

// ---- the spotlit robot's shadow: march only the robot, from p toward the lamp
float robShadow(vec3 p) {
  if (robB[0].z < 0.5) return 1.0;
  vec3 ld = lampPos - p; float L = length(ld); ld /= L;
  vec3 c = vec3(rob[0].x, 0.32 * robB[0].w, rob[0].y);
  vec3 oc = p - c; float b = dot(oc, ld); float cc = dot(oc, oc) - 0.36 * robB[0].w * robB[0].w;
  float disc = b * b - cc;
  if (disc < 0.0) return 1.0;
  float sq = sqrt(disc);
  float t0 = max(-b - sq, 0.0), t1 = min(-b + sq, L);
  if (t1 <= t0) return 1.0;
  float res = 1.0, t = t0;
  for (int i = 0; i < 40; i++) {
    float h = robotAt(p + ld * t, 0).x;
    float w = 0.025 * t / L + 0.003;   // penumbra: the lamp's radius seen from p, at the occluder
    res = min(res, smoothstep(-w, w, h));
    t += max(h, 0.004);
    if (res < 0.01 || t > t1) break;
  }
  return res;
}
float spotCone(vec3 p) {
  vec3 ld = normalize(p - lampPos);
  return smoothstep(lampCone, mix(lampCone, 1.0, 0.18), dot(ld, normalize(lampDir)));
}
// extra sweeping beams (hook): vertical-ish beams from high above toward floor points
float beamCone(vec3 p, vec4 B, out vec3 bpos) {
  bpos = vec3(B.x + sin(B.z) * 9.0, 18.0, B.y + 6.0);
  vec3 aim = vec3(B.x, 0.0, B.y);
  vec3 d = normalize(aim - bpos);
  return smoothstep(0.988, 0.995, dot(normalize(p - bpos), d)) * B.w;
}
vec3 keyLight(vec3 p, vec3 n, vec3 rd, vec3 alb, float metal, float rough, bool shadowed) {
  vec3 ld = lampPos - p; float dist = length(ld); ld /= dist;
  float cone = spotCone(p) * lampOn;
  if (cone <= 0.0) return vec3(0.0);
  float ndl = max(dot(n, ld), 0.0);
  float sh = shadowed ? robShadow(p) : 1.0;
  vec3 h = normalize(ld - rd);
  float spec = pow(max(dot(n, h), 0.0), mix(160.0, 12.0, rough)) * (1.0 - rough * 0.8);
  vec3 f0 = mix(vec3(0.04), alb, metal);
  vec3 lc = mix(C_SIGNAL, vec3(1.0), 0.45) * lampPow / (1.0 + 0.15 * dist);
  vec3 lit = (alb * (1.0 - metal) * ndl + f0 * spec * 3.0 * ndl) * lc * cone;
  return lit * sh + C_SHADOW * (1.0 - sh) * cone * alb.g * 0.0;
}
vec3 skyCol(vec3 rd) {
  float y = rd.y;
  vec3 c = mix(C_INK * 0.9, C_INK2 * 1.2, smoothstep(-0.1, 0.5, y));
  // cloud ceiling far above
  if (y > 0.02) {
    vec2 cp = rd.xz / y * 30.0;
    float cl = fbm(cp * 0.04 + vec2(time * 0.01, 0.0), 4);
    c += C_LILAC * 0.05 * smoothstep(-0.1, 0.6, cl) * smoothstep(0.02, 0.2, y) * (1.0 - night * 0.6);
  }
  return c;
}
// the marquee sign on the wall: emission at a wall-plane point (x, y)
vec3 signAt(vec2 wp, out float onSign) {
  vec2 s = (wp - vec2(0.0, ${SIGN.y.toFixed(3)})) / vec2(${(SIGN.w / 2).toFixed(3)}, ${(SIGN.h / 2).toFixed(3)});
  onSign = step(abs(s.x), 1.0) * step(abs(s.y), 1.0);
  if (onSign < 0.5 || signOn <= 0.0) return vec3(0.0);
  vec2 uv = s * 0.5 + 0.5;
  // bulb grid in texture space
  vec2 G = vec2(${Math.round(SIGN.w / 0.085)}.0, ${Math.round(SIGN.h / 0.085)}.0);
  vec2 cell = floor(uv * G) + 0.5;
  vec2 f = fract(uv * G) - 0.5;
  vec4 m = texture(signTex, vec2(cell.x / G.x, cell.y / G.y));
  float cov = m.r;
  float wid = floor(clamp((m.g / max(cov, 0.01) * 255.0 - 20.0) / 51.0 + 0.5, 0.0, 4.0));
  float xw = m.b / max(cov, 0.01);
  float prog = wid < 0.5 ? sw[0] : wid < 1.5 ? sw[1] : wid < 2.5 ? sw[2] : wid < 3.5 ? sw[3] : sw[4];
  float lit = step(0.5, cov) * step(xw, prog * 1.02 + (prog > 0.0 ? 0.02 : -1.0));
  float bulb = smoothstep(0.42, 0.18, length(f));
  float glassB = step(0.5, cov) * bulb;
  vec3 col = C_INK2 * 0.5;                                               // the box face
  col += glassB * mix(C_BLOOD * 0.08, mix(C_SIGNAL, C_EMBER, 0.5 * bulb) * 9.0, lit) * signOn;
  // soft glow panel behind lit letters
  vec4 mg = textureLod(signTex, uv, 3.5);
  col += C_SIGNAL * 0.35 * mg.r * signOn * max(max(sw[0], sw[1]), max(max(sw[2], sw[3]), sw[4]));
  // chasing border bulbs
  vec2 e = abs(s);
  float border = max(smoothstep(0.93, 0.95, e.x), smoothstep(0.84, 0.88, e.y));
  if (border > 0.5) {
    vec2 bp = wp * 5.5;
    float along = e.x > 0.93 ? bp.y : bp.x;
    vec2 bf = fract(bp) - 0.5;
    float b2 = smoothstep(0.33, 0.12, length(bf));
    float on = step(0.5, fract(floor(along) / 3.0 + chase));
    col = C_INK2 * 0.3 + b2 * mix(C_BLOOD * 0.1, C_EMBER * 5.0, on) * signOn;
  }
  return col;
}
float wallPanel(vec2 wp) {
  vec2 g = abs(fract(vec2(wp.x / 3.2, wp.y / 2.4)) - 0.5);
  float groove = smoothstep(0.495, 0.485, max(g.x * 3.2 / 2.4 * 0.74, g.y));
  return groove;
}
vec3 wallShade(vec3 p, vec3 rd, out float onSign) {
  vec3 n = vec3(0.0, 0.0, 1.0);
  vec3 e = signAt(p.xy, onSign);
  if (onSign > 0.5 && signOn > 0.0) {
    float shS = robShadow(p);
    vec3 c = e * mix(0.3, 1.0, mix(1.0, shS, spotCone(p) * lampOn));
    c += C_SHADOW * 0.5 * (1.0 - shS) * spotCone(p) * lampOn;
    c += keyLight(p, n, rd, vec3(0.05), 0.0, 0.3, true);
    return c;
  }
  float cornice = step(13.2, p.y);
  vec3 alb = C_BONE * wallAlb * mix(1.0, 0.7, cornice) * (0.85 + 0.15 * wallPanel(p.xy));
  alb *= 1.0 - 0.5 * smoothstep(0.6, 0.0, p.y); // skirting
  vec3 c = keyLight(p, n, rd, alb, 0.0, 0.7, true);
  // the shadow is bruise indigo, not black: the fill in the robot's shadow region
  float sh = robShadow(p) ;
  float cone = spotCone(p) * lampOn;
  c += C_SHADOW * 0.9 * (1.0 - sh) * cone * lampPow / 5.0;
  c += alb * C_LILAC * 0.05 * fillLev;
  c += alb * 0.012;
  if (p.y > 14.0) c = skyCol(rd);
  return c;
}
vec3 floorShade(vec3 p, vec3 rd, float tHit) {
  vec3 n = vec3(0.0, 1.0, 0.0);
  vec2 g = abs(fract(p.xz / 1.0) - 0.5);
  float w = fwidth(p.x) + fwidth(p.z);
  float grid = smoothstep(0.5 - w * 1.2, 0.5, max(g.x, g.y)) * 0.8;
  vec3 alb = C_INK2 * 1.3 + C_GRAPHITE * 0.05 * grid;
  vec3 c = keyLight(p, n, rd, alb, 0.0, 0.25, true);
  float sh = robShadow(p);
  c += C_SHADOW * 0.25 * (1.0 - sh) * spotCone(p) * lampOn * lampPow / 5.0;
  // grid lines lit a little by the spot and the sign
  c += C_ASH * 0.02 * grid * (0.3 + fillLev);
  // contact darkness under the crowd
  vec2 id; float bnd; vec3 q = cellLocal(p, id, bnd);
  float ao = cellOn(id) ? smoothstep(0.1, 0.55, length(q.xz)) : 1.0;
  c *= mix(0.35, 1.0, ao);
  c += C_LILAC * 0.012 * fillLev;
  // beams on the floor
  vec3 bp;
  c += C_LILAC * 0.5 * beamCone(p, beamA, bp) * spots;
  c += mix(C_SIGNAL, vec3(1.0), 0.3) * 0.5 * beamCone(p, beamB, bp) * spots;
  // glossy reflection of the wall/sign (analytic)
  vec3 rr = reflect(rd, n);
  float fres = 0.04 + 0.5 * pow(1.0 - max(dot(-rd, n), 0.0), 5.0);
  vec3 refl = skyCol(rr) * 0.5;
  if (wallOn > 0.5 && rr.z < 0.0) {
    float tw = (wallZ - p.z) / rr.z;
    vec3 wp = p + rr * tw;
    if (wp.y < 14.0) {
      float os; vec3 se = signAt(wp.xy + vec2(0.0, 0.0), os);
      refl = exp(-0.06 * tw) * (os > 0.5 ? se * 0.6 : vec3(0.0)) + C_BONE * 0.02 * fillLev + C_SIGNAL * 0.06 * spotCone(wp) * lampOn * lampPow / 5.0;
    }
  }
  float rough = 0.25 + 0.1 * grid;
  c += refl * fres * 0.9 * ao;
  return c;
}

// analytic glass for the hourglass: two spheres (bulbs); returns fresnel highlight
vec3 glassOver(vec3 ro, vec3 rd, float tMax) {
  if (hg.w < 0.5) return vec3(0.0);
  vec3 acc = vec3(0.0);
  for (int k = 0; k < 2; k++) {
    vec3 cLoc = vec3(0.0, k == 0 ? HG_H * 0.5 : -HG_H * 0.5, 0.0);
    cLoc.xy = cs_rot(-hg.z) * cLoc.xy;
    vec3 c = vec3(hg.x, 1.0 + HG_H + 0.08, hg.y) + cLoc;
    float R = HG_H * 0.52;
    vec3 oc = ro - c; float b = dot(oc, rd); float cc = dot(oc, oc) - R * R; float d = b * b - cc;
    if (d < 0.0) continue;
    float t = -b - sqrt(d);
    if (t < 0.0 || t > tMax) continue;
    vec3 p = ro + rd * t, n = normalize(p - c);
    float fr = pow(1.0 - max(dot(-rd, n), 0.0), 3.0);
    vec3 ld = normalize(lampPos - p);
    vec3 h = normalize(ld - rd);
    float sp = pow(max(dot(n, h), 0.0), 90.0);
    acc += C_LILAC * 0.12 * fr + vec3(1.0) * sp * 2.0 * spotCone(p) * lampOn + C_BONE * 0.03;
    vec3 h2 = normalize(normalize(vec3(-0.5, 1.0, 0.6)) - rd);
    acc += C_BONE * pow(max(dot(n, h2), 0.0), 60.0) * 0.8;
  }
  return acc;
}

void main() {
  vec2 uv = (vUv - 0.5) * vec2(16.0 / 9.0, 1.0);
  vec3 ro = camPos;
  vec3 fw = normalize(camTa - ro), rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0))), up = cross(rt, fw);
  vec3 rd = normalize(fw * camFocal + rt * uv.x + up * uv.y);

  // analytic planes
  float tFloor = rd.y < 0.0 ? -ro.y / rd.y : 1e9;
  float tWall = (wallOn > 0.5 && rd.z < 0.0) ? (wallZ - ro.z) / rd.z : 1e9;
  float tPlane = min(tFloor, tWall);
  float tMax = min(tPlane, farFog > 0.0 ? 420.0 : 160.0);

  // march the figures (start where the ray enters the figure slab y in [0, 2.3] unless something is up high)
  float t = 0.0;
  bool high = hand.w > 0.5 || hookP.w > 0.5 || hg.w > 0.5;
  if (!high && ro.y > 2.4) { t = rd.y < 0.0 ? (ro.y - 2.4) / -rd.y : 1e9; }
  vec2 hit = vec2(-1.0, MAT_NONE);
  if (t < tMax) {
    for (int i = 0; i < 150; i++) {
      vec3 p = ro + rd * t;
      gLod = t > 28.0 ? 1.0 : 0.0;
      vec2 h = map(p);
      if (h.x < 0.0006 * max(1.0, t)) { hit = vec2(t, h.y); break; }
      t += h.x * 0.92;
      if (t > tMax) break;
      if (!high && p.y > 2.45 && rd.y > 0.0) break;
    }
  }
  vec3 col;
  float tHit;
  if (hit.x > 0.0) {
    tHit = hit.x;
    vec3 p = ro + rd * tHit;
    gLod = tHit > 28.0 ? 1.0 : 0.0;
    vec3 n = castNormal(p);
    float m = hit.y;
    float id = floor(m + 0.001);
    if (id == MAT_PHONE) {
      col = mix(C_BONE, C_SIGNAL, 0.5) * 1.6;
    } else if (id == MAT_LENS) {
      col = C_EMBER * (1.0 + 7.0 * lampOn * max(dot(n, normalize(lampDir)), 0.0));
    } else if (id == MAT_SAND) {
      col = C_SIGNAL * 0.5 + keyLight(p, n, rd, C_SIGNAL * 0.8, 0.0, 0.6, false) + C_BLOOD * 0.2;
    } else {
      float rough; vec3 emit;
      vec4 mat = id == MAT_HOUSING ? vec4(C_INK2 * 1.5, 0.8) : castMaterial(m, p, rough, emit);
      if (id == MAT_HOUSING) rough = 0.3;
      vec3 alb = mat.rgb; float metal = mat.a;
      bool isCrowd = (id == MAT_WOOD || id == MAT_JOINT) && abs(p.z - rob[0].y) > 0.8;
      float ao = isCrowd ? mix(0.25, 1.0, smoothstep(0.3, 1.6, p.y)) : castAO(p, n);
      bool isRobot = length(p.xz - rob[0].xy) < 0.6;
      col = keyLight(p, n, rd, alb, metal, rough, true) * (isCrowd ? keyCrowd : isRobot ? keyRobot : 1.0);
      float sh = robShadow(p);
      col += C_SHADOW * 0.5 * (1.0 - sh) * spotCone(p) * lampOn * lampPow / 5.0 * ao;
      // fill: soft lilac from above (the cloud ceiling), warm bounce from the lit wall, cool rim
      col += alb * (1.0 - metal) * C_LILAC * (0.05 + 0.1 * max(n.y, 0.0)) * fillLev * ao;
      col += alb * (1.0 - metal) * C_SIGNAL * 0.06 * max(-n.z, 0.0) * lampOn * ao * (wallOn);
      float rim = pow(1.0 - max(dot(-rd, n), 0.0), 3.0);
      col += vec3(0.55, 0.62, 1.0) * rim * 0.12 * (0.4 + fillLev) * ao;
      // sign light (warm, from above-behind) when the sign is on
      col += alb * C_SIGNAL * 0.12 * signOn * max(dot(n, normalize(vec3(0.0, 10.0, wallZ) - p)), 0.0) * ao * wallOn;
      // metals reflect the environment
      vec3 r = reflect(rd, n);
      vec3 env = mix(C_INK * 0.6, C_LILAC * 0.25, smoothstep(-0.2, 0.8, r.y)) + C_SIGNAL * 0.4 * smoothstep(0.6, 1.0, dot(r, normalize(lampPos - p))) * lampOn;
      col += env * mix(0.1, 0.8, metal) * ao * mix(alb, vec3(1.0), 1.0 - metal);
      col += emit;
      if (hand.w > 0.5 && (id == MAT_SKIN || id == MAT_CLOTH || id == MAT_BRASS)) {
        vec3 fl = normalize(ro - p + vec3(-1.0, 2.0, 0.0));
        vec3 hh = normalize(fl - rd);
        col += (alb * (1.0 - metal) * max(dot(n, fl), 0.0) + mix(vec3(0.04), alb, metal) * pow(max(dot(n, hh), 0.0), 60.0) * 3.0) * 0.9;
      }
      // beams
      vec3 bp;
      col += alb * C_LILAC * 1.2 * beamCone(p, beamA, bp) * spots;
      col += alb * mix(C_SIGNAL, vec3(1.0), 0.3) * 1.2 * beamCone(p, beamB, bp) * spots;
      // the smile: a caution-yellow curve on each face
      if (smile > 0.0 && (id == MAT_WOOD)) {
        vec2 cid; float bnd; vec3 q = cellLocal(p, cid, bnd);
        if (cellOn(cid)) {
          float y = cellLift(cid);
          vec4 limbs; vec3 head; cellPose(cid, y, limbs, head);
          vec3 hq = q - vec3(0.0, 1.5 + 0.07 * y, 0.0);   // same head frame as sdMarionette
          hq.xz = cs_rot(head.y) * hq.xz; hq.xy = cs_rot(head.x) * hq.xy; hq.yz = cs_rot(head.z + 0.06) * hq.yz;
          if (hq.z > 0.05 && length(hq - vec3(0.0, 0.13, 0.0)) < 0.2) {
            vec2 f = hq.xy - vec2(0.0, 0.125);
            float d = abs(length(f) - 0.05);
            float arc = smoothstep(0.011, 0.005, d) * step(f.y, -0.022) * step(abs(f.x), 0.046);
            col = mix(col, C_SIGNAL * 2.2, arc * smile);
          }
        }
      }
    }
    // distance fog
    col = mix(col, C_INK * 0.7 + C_LILAC * 0.02, smoothstep(40.0, farFog > 0.0 ? 400.0 : 150.0, tHit));
  } else if (tPlane < 1e8) {
    tHit = tPlane;
    vec3 p = ro + rd * tPlane;
    if (tWall < tFloor) { float os; col = wallShade(p, rd, os); }
    else col = floorShade(p, rd, tPlane);
    col = mix(col, C_INK * 0.7 + C_LILAC * 0.02, smoothstep(40.0, farFog > 0.0 ? 400.0 : 150.0, tHit));
  } else {
    tHit = 400.0;
    col = skyCol(rd);
  }
  col += glassOver(ro, rd, tHit);

  // haze: the spotlight cone as a volume, with the robot's silhouette cut out of it (the shadow in the air)
  if (haze > 0.0 && lampOn > 0.0) {
    float L = min(tHit, 45.0);
    float acc = 0.0;
    const int N = 22;
    float jit = hash12(gl_FragCoord.xy + fract(time) * 17.0);
    for (int i = 0; i < N; i++) {
      float s = (float(i) + jit) / float(N) * L;
      vec3 q = ro + rd * s;
      float cone = spotCone(q);
      if (cone <= 0.0) continue;
      // cross-section shadow: project q toward the lamp onto the robot's plane
      float occ = 1.0;
      if (robB[0].z > 0.5 && (q.z - lampPos.z) * (rob[0].y - lampPos.z) > 0.0 && abs(q.z - lampPos.z) > abs(rob[0].y - lampPos.z)) {
        float k = (rob[0].y - lampPos.z) / (q.z - lampPos.z);
        vec3 pr = lampPos + (q - lampPos) * k;
        occ = smoothstep(-0.005, 0.02, robotAt(pr, 0).x);
      }
      float dl = length(q - lampPos);
      acc += cone * occ / (1.0 + 0.02 * dl * dl) * exp(-0.03 * q.y);
    }
    col += mix(C_SIGNAL, vec3(1.0), 0.35) * acc / float(N) * L * haze * 0.006 * lampPow / 5.0;
  }
  if (spots > 0.0) {
    // sweeping beams in the air (no shadows)
    float L = min(tHit, 60.0); float accA = 0.0, accB = 0.0; vec3 bp;
    for (int i = 0; i < 12; i++) { float s = (float(i) + 0.5) / 12.0 * L; vec3 q = ro + rd * s; accA += beamCone(q, beamA, bp); accB += beamCone(q, beamB, bp); }
    col += (C_LILAC * accA + mix(C_SIGNAL, vec3(1.0), 0.3) * accB) / 12.0 * L * 0.012 * spots;
  }
  col *= 1.0 - night * 0.55;
  fragColor = vec4(col, 1.0);
}
`;

export function makeWorldPass(signTex: THREE.Texture) {
  const v3 = () => ({ value: new THREE.Vector3() });
  const v4 = () => ({ value: new THREE.Vector4() });
  return aaPass(WORLD_FRAG, {
    camPos: v3(), camTa: v3(), camFocal: { value: 1.6 },
    lampPos: v3(), lampDir: v3(), lampCone: { value: 0.8 }, lampPow: { value: 30 }, lampOn: { value: 1 },
    rob: { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) }, robB: { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) },
    crowdBox: v4(), yk: v4(), pose: v4(),
    rippleZ: { value: 99 }, smile: { value: 0 }, beatPar: { value: 0 }, dance: { value: 0 }, lookUp: { value: 0 },
    wallZ: { value: -18 }, wallOn: { value: 1 }, signOn: { value: 0 }, chase: { value: 0 },
    sw: { value: [0, 0, 0, 0, 0] }, signTex: { value: signTex },
    hg: v4(), hgSand: { value: 0 }, hand: v4(), handRot: { value: new THREE.Vector3(0, 0, 4.2) }, hookP: v4(),
    haze: { value: 1 }, keyCrowd: { value: 0.35 }, keyRobot: { value: 0.35 }, wallAlb: { value: 0.5 }, fillLev: { value: 1 }, time: { value: 0 }, night: { value: 0 }, farFog: { value: 0 }, spots: { value: 0 },
    beamA: v4(), beamB: v4(),
  });
}

/** Pale strings from every visible crowd head up into the dark (LineBatch, 3D). */
export function crowdStrings(sb: { clear(): void; seg(...a: number[]): void; count: number }, crowd: number[], ro: number[], lift: number, far: boolean, bone: number[], gain = 1) {
  sb.clear();
  const [xh, zf, zb, fillZ] = crowd as [number, number, number, number];
  const maxD = far ? 70 : 45;
  const z0 = Math.min(zf, ro[2]! + 5), z1 = Math.max(zb, fillZ, ro[2]! - maxD);
  for (let iz = Math.ceil(z1 / CZ); iz <= Math.floor(z0 / CZ); iz++) {
    for (let ix = Math.floor((ro[0]! - maxD) / CX) - 1; ix <= Math.ceil((ro[0]! + maxD) / CX) + 1; ix++) {
      const x = ix * CX, z = iz * CZ;
      if (Math.abs(x) > xh || z > zf + 0.01 || z < zb || z <= fillZ) continue;
      const cc = cellCenter(ix, iz);
      const dd = Math.hypot(cc.x - ro[0]!, cc.z - ro[2]!);
      if (dd > maxD) continue;
      const a = 0.45 * gain * Math.min(1, Math.max(0, 1 - dd / maxD));
      const hy = 1.75 + 0.07 * lift;
      sb.seg(cc.x, hy, cc.z, cc.x, hy + 2.5, cc.z, 1.0, bone[0]!, bone[1]!, bone[2]!, a * 0.3);
      sb.seg(cc.x, hy + 2.5, cc.z, cc.x, hy + 9, cc.z, 1.0, bone[0]!, bone[1]!, bone[2]!, a * 0.16);
      sb.seg(cc.x, hy + 9, cc.z, cc.x, hy + 40, cc.z, 1.0, bone[0]!, bone[1]!, bone[2]!, a * 0.04);
      if (sb.count > 5900) return;
    }
  }
}
