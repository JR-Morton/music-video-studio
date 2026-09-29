// The cast, as GLSL: signed-distance models of the tin robot, the marionette, the cuffed hand and the strings, plus
// a stage-lighting toolkit (march, normals, soft shadows, AO, materials, spotlight shading). Units are metres,
// +y up, figures stand on y = 0 and face +z.
//
// HOW TO USE (in your scene's fragment shader, e.g. an FSPass):
//   ${GLSL_CAST_SDF}                       // the models (no dependencies)
//   vec2 map(vec3 p) { ... return opU(sdTinRobot(p - pos, walk, look, variant), floor); }   // YOU define map()
//   ${GLSL_CAST_SHADE}                     // needs map(); gives castMarch, castNormal, castShadow, castAO, stageShade
//   void main() { ... vec2 h = castMarch(ro, rd, 40.0); ... col = stageShade(p, n, rd, h.y, key, fill, rim); }
// map() returns vec2(distance, material id). Material ids are the MAT_* constants; a variant/colour can ride in the
// fractional part: m = MAT_TIN + 0.1 * variant (variant 0..9) — castMaterial() decodes it.
//
// API CONTRACT (signatures must not change):
//   vec2  sdTinRobot(vec3 p, float walk, float look, float variant)  ~0.5 m tall 1950s wind-up tin robot; walk = gait
//         phase (radians, use clockwork()), look = head yaw (radians), variant 0..3 = paint colour / shape
//   vec2  sdMarionette(vec3 p, vec4 limbs, vec3 head, float variant)  ~1.75 m wooden lay figure with ball joints;
//         limbs = swing angles (armL, armR, legL, legR) radians, head = (tilt, yaw, droop), variant 0..3
//   vec3  marionetteAnchor(int i, vec4 limbs, vec3 head)  string attach points in figure space: 0 head, 1 hand L,
//         2 hand R, 3 knee L, 4 knee R
//   vec2  sdHand(vec3 p, float pinch, float variant)  a man's hand, wrist at the origin, hanging down -y, navy
//         pinstripe cuff above (+y) with a brass cufflink; pinch 0 = relaxed open, 1 = thumb and finger closed
//   float sdString(vec3 p, vec3 a, vec3 b)  a 2 mm string between a and b (material MAT_STRING)
//   vec2  opU(vec2 a, vec2 b)  union keeping the material
//
// DETAILS (v2):
//   Robot: ~0.55 m to the antenna bulb. walk: legs swing +-0.42 rad, arms counter-swing, body bobs and waddles, the
//     key on its back turns with walk. Variant 0 caution yellow (square head, bulb antenna), 1 toy red (round drum
//     head, twin antennae), 2 toy blue (dome head), 3 bare tin (tall head, ringed antenna). Eyes are MAT_GLOW.
//   Marionette: limbs swing about the x axis (+ = forward/up; pi = straight up). Elbows/knees flex by themselves
//     (a yanked puppet's forearm and shin dangle). head.x = tilt (sideways cock, + toward +x), head.y = yaw,
//     head.z = droop (chin toward the chest). Anchors are small chrome screw-eyes on the model: head top, the back
//     of each hand, the front of each knee. Variant 0 maple, 1 walnut, 2 pale birch, 3 dark stained.
//   Hand: palm faces +z, thumb on +x, fingers curl toward +z. Pinch 1: thumb tip meets index tip at about
//     (0.034, -0.128, 0.074) (hang a string from there). Variant 1 adds a brass signet ring on the little finger.
//     Navy pinstripe jacket sleeve (to y = +0.27) over a white double shirt cuff with a brass cufflink on +x.
//   Shading: glossy tin with clearcoat and edge wear, chrome, varnished wood, skin with soft wrap light, a glossy
//     navy floor. Optional soft reflection of the cast in the floor: #define CAST_REFLECT before GLSL_CAST_SHADE
//     (costs ~4 ms at 1080p when the floor fills half the frame; worth it for hero shots). Good starting lights: key spotlight col ~ mix(C_SIGNAL, 1, 0.35) * 6..8,
//     fill C_LILAC * 1.0..1.5 (omni), rim vec3(0.6, 0.7, 1.0) * 2..3 (omni, behind the cast).
import { LIN } from '@engine/palette';

const v3 = (c: readonly number[]) => `vec3(${c.map((x) => x.toFixed(4)).join(', ')})`;

export const GLSL_CAST_SDF = /* glsl */ `
#define MAT_NONE 0.0
#define MAT_TIN 1.0
#define MAT_CHROME 2.0
#define MAT_WOOD 3.0
#define MAT_JOINT 4.0
#define MAT_CLOTH 5.0
#define MAT_BRASS 6.0
#define MAT_SKIN 7.0
#define MAT_STRING 8.0
#define MAT_FLOOR 9.0
#define MAT_GLOW 10.0
#define MAT_PORCELAIN 11.0
#define MAT_PAPER 12.0

vec2 opU(vec2 a, vec2 b) { return a.x < b.x ? a : b; }
float cs_box(vec3 p, vec3 b, float r) { vec3 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r; }
float cs_cap(vec3 p, vec3 a, vec3 b, float r) { vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h) - r; }
float cs_ell(vec3 p, vec3 r) { float k0 = length(p / r); float k1 = length(p / (r * r)); return k0 * (k0 - 1.0) / k1; }
float cs_cyl(vec3 p, float h, float r) { vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h); return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)); }
mat2 cs_rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float cs_smin(float a, float b, float k) { float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }
// rounded cylinder along y: half height h, radius r, edge radius e
float cs_rcyl(vec3 p, float h, float r, float e) { vec2 d = vec2(length(p.xz) - r + e, abs(p.y) - h + e); return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - e; }
// torus in the xz plane
float cs_tor(vec3 p, float R, float r) { return length(vec2(length(p.xz) - R, p.y)) - r; }
// arc of a torus in the xy plane, centred on +y with half-angle sc = (sin, cos)
float cs_ctor(vec3 p, vec2 sc, float R, float r) { p.x = abs(p.x); float k = (sc.y * p.x > sc.x * p.y) ? dot(p.xy, sc) : length(p.xy); return sqrt(max(dot(p, p) + R * R - 2.0 * R * k, 0.0)) - r; }
// tapered capsule from a (radius ra) to b (radius rb)
float cs_cone(vec3 p, vec3 a, vec3 b, float ra, float rb) {
  vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - mix(ra, rb, h);
}
// unsigned-outside distance to an axis-aligned box (bounding volumes)
float cs_bound(vec3 p, vec3 c, vec3 b) { vec3 q = abs(p - c) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }

// ================================================================ tin robot
vec2 sdTinRobot(vec3 p, float walk, float look, float variant) {
  float vi = clamp(floor(variant + 0.5), 0.0, 9.0);
  float mv = MAT_TIN + 0.1 * vi;
  float bb = cs_bound(p, vec3(0.0, 0.32, 0.0), vec3(0.2, 0.33, 0.18));
  if (bb > 0.16) return vec2(bb, mv);
  float vs = mod(vi, 4.0);
  float sw = sin(walk), cw = cos(walk);
  float bob = 0.013 * abs(cw);
  float roll = sw * 0.075, twist = sw * 0.07;
  vec3 L = p - vec3(0.0, 0.158 + bob, 0.0);                       // hip frame (legs)
  vec2 res = vec2(1e9, mv);
  // ---- legs + feet (both, they are close together)
  for (int s = 0; s < 2; s++) {
    float sd = s == 0 ? -1.0 : 1.0;
    float a = sw * 0.42 * sd;
    vec3 lp = L - vec3(sd * 0.056, 0.0, 0.0);
    lp.yz = cs_rot(a) * lp.yz;
    float leg = cs_rcyl(lp - vec3(0.0, -0.055, 0.0), 0.055, 0.024, 0.006);
    leg += 0.0012 * smoothstep(0.3, 0.9, abs(fract(lp.y * 45.0) - 0.5) * 2.0);   // accordion ribs
    res = opU(res, vec2(leg, MAT_CHROME));
    vec3 fp = lp - vec3(0.0, -0.118, 0.0); fp.yz = cs_rot(-a) * fp.yz;          // feet stay level
    float foot = cs_box(fp - vec3(0.0, -0.014, 0.022), vec3(0.042, 0.026, 0.068), 0.022);
    foot = max(foot, -fp.y - 0.037);                                               // flat sole
    res = opU(res, vec2(foot, mv));
  }
  // ---- body frame: waddle roll + twist about the hips
  vec3 B = L; B.xy = cs_rot(roll) * B.xy; B.xz = cs_rot(twist) * B.xz;
  vec3 bq = B - vec3(0.0, 0.095, 0.0);
  vec3 bh = vs == 1.0 ? vec3(0.098, 0.088, 0.078) : vec3(0.1, 0.09, 0.074);
  float body = cs_box(bq, bh, vs == 1.0 ? 0.055 : 0.04);
  body += 0.0024 * (1.0 - smoothstep(0.0, 0.0035, abs(bq.y + 0.035)));               // pressed waist seam
  res = opU(res, vec2(body, mv));
  float zf = bh.z;
  // chest plate with pressed ribs, and three buttons in another toy colour
  vec3 cp = bq - vec3(0.0, 0.028, zf);
  float plate = cs_box(cp, vec3(0.058, 0.034, 0.007), 0.007);
  plate += 0.0016 * smoothstep(0.35, 0.8, abs(fract(cp.y * 55.0) - 0.5) * 2.0) * step(cp.x, 0.018);
  res = opU(res, vec2(plate, MAT_CHROME));
  vec3 bt = vec3(cp.x - 0.036, cp.y - 0.018 * clamp(floor(cp.y / 0.018 + 0.5), -1.0, 1.0), cp.z - 0.006);
  float btn = length(bt) - 0.0085;
  float bv = vs == 1.0 ? 0.0 : 1.0;
  res = opU(res, vec2(btn, MAT_TIN + 0.1 * bv));
  // rivets along the waist seam (front and back) and the shoulder line
  vec3 rq = vec3(bq.x - 0.03 * clamp(floor(bq.x / 0.03 + 0.5), -2.0, 2.0), bq.y + 0.052, abs(bq.z) - zf + 0.0015);
  res = opU(res, vec2(length(rq) - 0.0055, MAT_CHROME));
  // neck collar
  res = opU(res, vec2(cs_rcyl(bq - vec3(0.0, bh.y + 0.012, 0.0), 0.014, 0.036, 0.006), MAT_CHROME));
  // ---- arms (counter-swing), shoulder bolts, clamp hands
  for (int s = 0; s < 2; s++) {
    float sd = s == 0 ? -1.0 : 1.0;
    float a = -sw * 0.55 * sd - 0.1;
    vec3 ap = bq - vec3(sd * (bh.x + 0.018), 0.045, 0.0);
    res = opU(res, vec2(length(ap) - 0.03, MAT_CHROME));
    ap.yz = cs_rot(a) * ap.yz;
    ap.xy = cs_rot(sd * 0.16) * ap.xy;
    float arm = cs_cone(ap, vec3(0.0, -0.01, 0.0), vec3(0.0, -0.105, 0.0), 0.024, 0.019);
    res = opU(res, vec2(arm, mv));
    res = opU(res, vec2(cs_rcyl(ap - vec3(0.0, -0.112, 0.0), 0.008, 0.021, 0.004), MAT_CHROME));   // wrist ring
    vec3 hp = ap - vec3(0.0, -0.148, 0.004);
    float claw = cs_ctor(vec3(hp.z, hp.y, hp.x), vec2(sin(2.3), cos(2.3)), 0.027, 0.0085);
    res = opU(res, vec2(claw, MAT_CHROME));
  }
  // ---- wind-up key on the back, turning with walk
  vec3 kq = bq - vec3(0.0, 0.01, -zf);
  res = opU(res, vec2(cs_cap(kq, vec3(0.0), vec3(0.0, 0.0, -0.045), 0.0065), MAT_CHROME));
  kq.z += 0.05; kq.xy = cs_rot(walk * 0.5) * kq.xy;
  vec3 kl = vec3(abs(kq.x) - 0.028, kq.y, kq.z);
  float bow = cs_tor(kl.xzy, 0.019, 0.0055);
  bow = min(bow, cs_box(kq, vec3(0.012, 0.01, 0.005), 0.004));
  res = opU(res, vec2(bow, MAT_CHROME));
  // ---- head (keeps level against the waddle, yaw from look)
  vec3 hq = bq - vec3(0.0, bh.y + 0.09, 0.0);
  hq.xy = cs_rot(-roll * 0.6) * hq.xy;
  hq.xz = cs_rot(look) * hq.xz;
  float head, hz, htop;
  if (vs == 1.0) { head = cs_rcyl(hq, 0.058, 0.08, 0.022); hz = 0.072; htop = 0.058; }                     // drum
  else if (vs == 2.0) { head = cs_box(hq, vec3(0.082, 0.052, 0.068), 0.028); head = cs_smin(head, length(hq - vec3(0.0, 0.03, 0.0)) - 0.072, 0.02); hz = 0.068; htop = 0.102; } // dome
  else if (vs == 3.0) { head = cs_box(hq - vec3(0.0, 0.01, 0.0), vec3(0.072, 0.07, 0.066), 0.026); hz = 0.066; htop = 0.08; }  // tall
  else { head = cs_box(hq, vec3(0.086, 0.06, 0.07), 0.03); hz = 0.07; htop = 0.06; }                                          // square
  head += 0.002 * (1.0 - smoothstep(0.0, 0.003, abs(hq.y + 0.045)));                   // jaw seam
  res = opU(res, vec2(head, mv));
  // eyes: glowing domes in chrome bezels
  vec3 eq = vec3(abs(hq.x) - 0.036, hq.y - 0.012, hq.z - hz);
  res = opU(res, vec2(cs_tor(eq.xzy, 0.02, 0.0055), MAT_CHROME));
  res = opU(res, vec2(length(eq + vec3(0.0, 0.0, 0.006)) - 0.0185, MAT_GLOW));
  // smiling grille mouth
  vec3 mq = hq - vec3(0.0, -0.03, hz - 0.002);
  mq.y -= 3.2 * mq.x * mq.x;
  float mouth = cs_box(mq, vec3(0.03, 0.007, 0.006), 0.0045);
  mouth += 0.0016 * smoothstep(0.3, 0.8, abs(fract(mq.x * 90.0) - 0.5) * 2.0);
  res = opU(res, vec2(mouth, MAT_CHROME));
  // ear bolts
  vec3 xq = vec3(hq.y, abs(hq.x) - (vs == 1.0 ? 0.08 : vs == 3.0 ? 0.072 : 0.086), hq.z);
  res = opU(res, vec2(cs_rcyl(xq, 0.012, 0.024, 0.005), MAT_CHROME));
  res = opU(res, vec2(cs_rcyl(xq - vec3(0.0, 0.012, 0.0), 0.008, 0.009, 0.003), MAT_CHROME));
  // antennae
  if (vs == 1.0) {
    vec3 aq = vec3(abs(hq.x), hq.y - htop, hq.z);
    vec3 tip = vec3(0.05, 0.06, 0.0);
    res = opU(res, vec2(cs_cap(aq, vec3(0.03, 0.0, 0.0), tip, 0.0035), MAT_CHROME));
    res = opU(res, vec2(length(aq - tip - vec3(0.004, 0.006, 0.0)) - 0.011, MAT_GLOW));
  } else {
    vec3 aq = hq - vec3(0.0, htop, 0.0);
    float len = vs == 2.0 ? 0.035 : vs == 3.0 ? 0.075 : 0.058;
    res = opU(res, vec2(cs_rcyl(aq, 0.006, 0.014, 0.004), MAT_CHROME));
    res = opU(res, vec2(cs_cap(aq, vec3(0.0), vec3(0.0, len, 0.0), 0.0038), MAT_CHROME));
    if (vs == 3.0) res = opU(res, vec2(cs_tor(aq - vec3(0.0, len * 0.6, 0.0), 0.014, 0.0028), MAT_CHROME));
    if (vs == 2.0) res = opU(res, vec2(cs_tor(aq - vec3(0.0, len * 0.7, 0.0), 0.02, 0.003), MAT_CHROME));
    res = opU(res, vec2(length(aq - vec3(0.0, len + 0.012, 0.0)) - 0.014, MAT_GLOW));
  }
  return res;
}

// ================================================================ marionette (wooden lay figure)
// Shared forward kinematics: the SDF and marionetteAnchor use the same joints.
const vec3 CS_M_SH = vec3(0.205, 1.425, 0.0);
const vec3 CS_M_HIP = vec3(0.092, 0.905, 0.0);
const vec3 CS_M_NECK = vec3(0.0, 1.5, 0.0);
const float CS_M_UA = 0.29;   // upper arm
const float CS_M_FA = 0.26;   // forearm
const float CS_M_TH = 0.43;   // thigh
const float CS_M_SN = 0.41;   // shin
vec3 cs_limb(vec3 root, float ang, float len) { return root + vec3(0.0, -cos(ang), sin(ang)) * len; }
float cs_foreAng(float a) { return a + 0.14 + 0.32 * abs(a); }      // the elbow flexes forward as the arm is yanked
float cs_shinAng(float a) { return a * 0.75 - abs(a) * 0.55 - 0.05; } // the knee flexes back, shin dangles
vec3 marionetteAnchor(int i, vec4 limbs, vec3 head) {
  if (i == 0) {
    vec3 w = vec3(0.0, 0.27, 0.0);
    w.yz = cs_rot(-(head.z + 0.06)) * w.yz; w.xy = cs_rot(-head.x) * w.xy; w.xz = cs_rot(-head.y) * w.xz;
    return CS_M_NECK + w;
  }
  if (i <= 2) {
    float sd = i == 1 ? -1.0 : 1.0, a = i == 1 ? limbs.x : limbs.y;
    vec3 e = cs_limb(CS_M_SH * vec3(sd, 1.0, 1.0), a, CS_M_UA);
    float fa = cs_foreAng(a);
    vec3 w = cs_limb(e, fa, CS_M_FA + 0.07);
    return w + vec3(0.0, sin(fa), cos(fa)) * -0.03;                   // on the back of the mitten
  }
  float sd = i == 3 ? -1.0 : 1.0, a = i == 3 ? limbs.z : limbs.w;
  vec3 k = cs_limb(CS_M_HIP * vec3(sd, 1.0, 1.0), a, CS_M_TH);
  return k + vec3(0.0, sin(a), cos(a)) * 0.062;                        // front of the knee
}
vec2 sdMarionette(vec3 p, vec4 limbs, vec3 head, float variant) {
  float vi = clamp(floor(variant + 0.5), 0.0, 9.0);
  float mw = MAT_WOOD + 0.1 * vi, mj = MAT_JOINT + 0.1 * vi;
  float bb = cs_bound(p, vec3(0.0, 1.05, 0.0), vec3(0.45, 1.13, 0.76));
  if (bb > 0.3) return vec2(bb, mw);
  // Each part is first bounded by a fat capsule/sphere proxy (a true lower bound); only near parts are detailed.
  vec2 res = vec2(1e9, mw);
  // ---- head (slightly oversized egg) with two painted dots and the head screw-eye
  vec3 hp = p - CS_M_NECK;
  hp.xz = cs_rot(head.y) * hp.xz; hp.xy = cs_rot(head.x) * hp.xy; hp.yz = cs_rot(head.z + 0.06) * hp.yz;
  float hprox = length(hp - vec3(0.0, 0.145, 0.012)) - 0.165;
  if (hprox > 0.05) res.x = hprox;
  else {
    float hd = cs_ell(hp - vec3(0.0, 0.145, 0.012), vec3(0.098, 0.125, 0.108));
    hd = cs_smin(hd, cs_ell(hp - vec3(0.0, 0.09, 0.04), vec3(0.068, 0.07, 0.07)), 0.05);   // chin
    res = vec2(hd, mw);
    res = opU(res, vec2(length(vec3(abs(hp.x) - 0.036, hp.y - 0.148, hp.z - 0.108)) - 0.0105, MAT_JOINT + 0.9)); // painted dots
    res = opU(res, vec2(cs_tor(vec3(hp.x, hp.z, hp.y - 0.27), 0.007, 0.0022), MAT_CHROME));   // screw-eye
  }
  // ---- torso: neck, chest block + shoulder yoke, waist ball, pelvis
  float tprox = cs_cap(p, vec3(0.0, 0.86, 0.0), vec3(0.0, 1.52, 0.0), 0.215);
  if (tprox > 0.05) res.x = min(res.x, tprox);
  else {
    res = opU(res, vec2(cs_cone(hp, vec3(0.0, -0.05, 0.0), vec3(0.0, 0.07, 0.01), 0.036, 0.03), mw));
    res = opU(res, vec2(length(hp) - 0.04, mj));
    float ch = cs_ell(p - vec3(0.0, 1.25, 0.0), vec3(0.158, 0.2, 0.098));
    ch = cs_smin(ch, cs_cap(p, vec3(-0.14, 1.39, -0.005), vec3(0.14, 1.39, -0.005), 0.062), 0.08);
    ch = max(ch, 1.03 - p.y);
    res = opU(res, vec2(ch, mw));
    res = opU(res, vec2(length(p - vec3(0.0, 1.045, 0.0)) - 0.07, mj));
    float pel = cs_ell(p - vec3(0.0, 0.93, 0.0), vec3(0.148, 0.095, 0.088));
    pel = max(pel, p.y - 1.0);
    res = opU(res, vec2(pel, mw));
  }
  // ---- arms
  for (int s = 0; s < 2; s++) {
    float sd = s == 0 ? -1.0 : 1.0, a = s == 0 ? limbs.x : limbs.y;
    vec3 sh = CS_M_SH * vec3(sd, 1.0, 1.0);
    vec3 e = cs_limb(sh, a, CS_M_UA);
    float fa = cs_foreAng(a);
    vec3 w = cs_limb(e, fa, CS_M_FA);
    float aprox = min(cs_cap(p, sh, e, 0.08), cs_cap(p, e, cs_limb(w, fa, 0.14), 0.08));
    if (aprox > 0.05) { res.x = min(res.x, aprox); continue; }
    res = opU(res, vec2(length(p - sh) - 0.05, mj));
    res = opU(res, vec2(cs_cone(p, sh, e, 0.043, 0.032), mw));
    res = opU(res, vec2(length(p - e) - 0.036, mj));
    res = opU(res, vec2(cs_cone(p, e, w, 0.033, 0.025), mw));
    res = opU(res, vec2(length(p - w) - 0.027, mj));
    vec3 q = p - w; q.yz = cs_rot(-fa) * q.yz;                            // hand frame: -y along the forearm
    float mit = cs_ell(q - vec3(0.0, -0.075, 0.0), vec3(0.021, 0.075, 0.046));
    mit = cs_smin(mit, cs_ell(q - vec3(-sd * 0.006, -0.05, 0.045), vec3(0.017, 0.038, 0.017)), 0.02);   // thumb
    res = opU(res, vec2(mit, mw));
    res = opU(res, vec2(cs_tor(q - vec3(0.0, -0.07, -0.03), 0.007, 0.0022), MAT_CHROME));             // screw-eye
  }
  // ---- legs
  for (int s = 0; s < 2; s++) {
    float sd = s == 0 ? -1.0 : 1.0, a = s == 0 ? limbs.z : limbs.w;
    vec3 hip = CS_M_HIP * vec3(sd, 1.0, 1.0);
    vec3 k = cs_limb(hip, a, CS_M_TH);
    float sa = cs_shinAng(a);
    vec3 an = cs_limb(k, sa, CS_M_SN);
    float lprox = min(min(cs_cap(p, hip, k, 0.09), cs_cap(p, k, an, 0.07)), length(p - an) - 0.165);
    if (lprox > 0.05) { res.x = min(res.x, lprox); continue; }
    res = opU(res, vec2(length(p - hip) - 0.058, mj));
    res = opU(res, vec2(cs_cone(p, hip, k, 0.058, 0.041), mw));
    res = opU(res, vec2(length(p - k) - 0.045, mj));
    res = opU(res, vec2(cs_cone(p, k, an, 0.041, 0.028), mw));
    res = opU(res, vec2(length(p - an) - 0.03, mj));
    vec3 q = p - an; q.yz = cs_rot(-sa + 0.3 * abs(a) - 0.05) * q.yz;   // foot, toe dropping as it lifts
    float ft = cs_ell(q - vec3(0.0, -0.035, 0.045), vec3(0.042, 0.03, 0.105));
    ft = max(ft, -q.y - 0.062);
    res = opU(res, vec2(ft, mw));
    vec3 kn = vec3(0.0, sin(a), cos(a));
    res = opU(res, vec2(cs_tor(p - k - kn * 0.062, 0.007, 0.0022), MAT_CHROME));   // knee screw-eye on a peg
    res = opU(res, vec2(cs_cap(p, k, k + kn * 0.055, 0.0025), MAT_CHROME));
  }
  return res;
}

// ================================================================ the hand (pulling the strings)
// finger chain in the yz plane (curling toward +z), with a little x splay; returns distance, tip in 'tip'
float cs_finger(vec3 p, vec3 base, vec3 ang, vec3 len, float r, float splay, out vec3 tip, out vec3 j1) {
  float a = ang.x;
  vec3 d = normalize(vec3(splay, -cos(a), sin(a)));
  j1 = base + d * len.x;
  float f = cs_cone(p, base, j1, r, r * 0.93);
  a += ang.y; d = normalize(vec3(splay, -cos(a), sin(a)));
  vec3 j2 = j1 + d * len.y;
  f = min(f, cs_cone(p, j1, j2, r * 0.93, r * 0.84));
  a += ang.z; d = normalize(vec3(splay, -cos(a), sin(a)));
  tip = j2 + d * len.z;
  f = min(f, cs_cone(p, j2, tip, r * 0.84, r * 0.74));
  return f;
}
vec2 sdHand(vec3 p, float pinch, float variant) {
  float bb = cs_bound(p, vec3(0.0, 0.03, 0.02), vec3(0.09, 0.25, 0.09));
  if (bb > 0.12) return vec2(bb, MAT_SKIN);
  float pc = clamp(pinch, 0.0, 1.0);
  // ---- sleeve: navy pinstripe jacket over a white double shirt cuff with a brass cufflink
  vec3 sq = p - vec3(0.0, 0.0, -0.002); sq.x *= 0.94;
  float sleeve = cs_cone(sq, vec3(0.0, 0.07, 0.0), vec3(0.0, 0.34, 0.0), 0.047, 0.056);
  sleeve = max(max(sleeve, p.y - 0.27), 0.058 - p.y);
  vec2 res = vec2(sleeve, MAT_CLOTH);
  res = opU(res, vec2(cs_ell(vec3(p.x + 0.048, p.y - 0.085 - 0.015 * clamp(floor((p.y - 0.085) / 0.015 + 0.5), 0.0, 2.0), p.z), vec3(0.0025, 0.0055, 0.0055)), MAT_JOINT + 0.3)); // sleeve buttons
  float cuff = cs_rcyl(p - vec3(0.0, 0.04, 0.0), 0.022, 0.039, 0.007);
  res = opU(res, vec2(cuff, MAT_PAPER));
  vec3 lq = p - vec3(0.0, 0.039, 0.0); lq.xz = cs_rot(0.7) * lq.xz; lq.x -= 0.042;   // square cufflink, front-outer
  res = opU(res, vec2(cs_box(lq, vec3(0.0035, 0.0105, 0.0105), 0.004), MAT_BRASS));
  // ---- wrist + palm
  float h = cs_ell(p - vec3(0.0, 0.01, 0.0), vec3(0.03, 0.05, 0.022));
  vec3 pq = p - vec3(0.0, -0.05, 0.0);
  pq.z -= 0.18 * pq.x * pq.x - 0.004;                                           // slight cup
  float palm = cs_box(pq, vec3(0.036 + 0.05 * clamp(-pq.y, -0.04, 0.04), 0.046, 0.011), 0.011);
  h = cs_smin(h, palm, 0.025);
  // ---- fingers (index on +x next to the thumb)
  vec3 tipI, j1, tmp;
  vec4 kx = vec4(0.027, 0.009, -0.009, -0.026);
  vec4 ky = vec4(-0.093, -0.097, -0.094, -0.086);
  float fing = 1e9;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec3 relax = vec3(0.24 + 0.08 * fi, 0.34 + 0.07 * fi, 0.2 + 0.05 * fi);
    vec3 pin = i == 0 ? vec3(0.6, 0.9, 0.3) : vec3(0.4 + 0.12 * fi, 0.65 + 0.05 * fi, 0.35);
    vec3 ang = mix(relax, pin, pc);
    vec3 len = i == 0 ? vec3(0.044, 0.026, 0.021) : i == 1 ? vec3(0.048, 0.03, 0.022) : i == 2 ? vec3(0.045, 0.028, 0.021) : vec3(0.035, 0.021, 0.018);
    float r = i == 3 ? 0.0078 : i == 1 ? 0.009 : 0.0086;
    float splay = (0.03 - 0.035 * fi) * (1.0 - 0.5 * pc);
    vec3 tip;
    float f = cs_finger(p, vec3(kx[i], ky[i], 0.002), ang, len, r, splay, tip, tmp);
    if (i == 0) tipI = tip;
    if (i == 3) j1 = tmp;
    fing = min(fing, f);
  }
  h = cs_smin(h, fing, 0.012);
  // ---- thumb: meets the index tip when pinching
  vec3 t0 = vec3(0.028, -0.02, 0.008);
  vec3 t1 = vec3(0.05, -0.056, 0.026);
  vec3 tR = vec3(0.047, -0.106, 0.044);
  vec3 tP = tipI + vec3(0.011, -0.004, 0.002);
  vec3 tt = mix(tR, tP, pc);
  vec3 tm = mix(t1, tt, 0.52) + vec3(0.009, 0.0, 0.006);
  float th = cs_cone(p, t0, t1, 0.016, 0.0115);
  th = min(th, cs_cone(p, t1, tm, 0.0115, 0.0105));
  th = min(th, cs_cone(p, tm, tt, 0.0105, 0.0088));
  h = cs_smin(h, th, 0.014);
  res = opU(res, vec2(h, MAT_SKIN));
  // ---- signet ring (variant 1): on the little finger's first segment
  if (variant > 0.5) {
    vec3 c0 = vec3(kx.w, ky.w, 0.002);
    vec3 d = normalize(j1 - c0);
    vec3 c = mix(c0, j1, 0.45);
    vec3 v = p - c; float hh = dot(v, d); float rr = length(v - d * hh);
    float ring = length(vec2(rr - 0.0098, hh)) - 0.0024;
    vec3 bk = normalize(cross(d, vec3(1.0, 0.0, 0.0)));                          // toward -z (back of the hand)
    ring = cs_smin(ring, length(p - (c - bk * 0.0105) ) - 0.0048, 0.004);
    res = opU(res, vec2(ring, MAT_BRASS));
  }
  return res;
}

float sdString(vec3 p, vec3 a, vec3 b) { return cs_cap(p, a, b, 0.002); }
`;

export const GLSL_CAST_SHADE = /* glsl */ `
const vec3 CS_TIN0 = vec3(0.55, 0.32, 0.01);   // variant 0: caution-yellow tin
const vec3 CS_TIN1 = vec3(0.42, 0.028, 0.018); // variant 1: toy red
const vec3 CS_TIN2 = vec3(0.012, 0.06, 0.34);  // variant 2: toy blue
const vec3 CS_TIN3 = vec3(0.42, 0.43, 0.45);   // variant 3: bare tin
const vec3 CS_BRASS = ${v3(LIN.brass)};
const vec3 CS_BONE = ${v3(LIN.bone)};
const vec3 CS_INK = ${v3(LIN.ink)};
const vec3 CS_INK2 = ${v3(LIN.ink2)};
const vec3 CS_LILAC = ${v3(LIN.lilac)};
const vec3 CS_SIGNAL = ${v3(LIN.signal)};
const vec3 CS_EMBER = ${v3(LIN.ember)};

vec2 castMarch(vec3 ro, vec3 rd, float tmax) {
  float t = 0.0;
  for (int i = 0; i < 160; i++) {
    vec2 h = map(ro + rd * t);
    if (h.x < 0.0004 * max(1.0, t)) return vec2(t, h.y);
    t += h.x * 0.9;
    if (t > tmax) break;
  }
  return vec2(-1.0, MAT_NONE);
}
vec3 castNormal(vec3 p) {
  const vec2 e = vec2(0.0007, -0.0007);
  return normalize(e.xyy * map(p + e.xyy).x + e.yyx * map(p + e.yyx).x + e.yxy * map(p + e.yxy).x + e.xxx * map(p + e.xxx).x);
}
float castShadow(vec3 ro, vec3 rd, float tmin, float tmax, float k) {
  float res = 1.0, t = tmin;
  for (int i = 0; i < 48; i++) {
    vec2 hm = map(ro + rd * t);
    float h = hm.x;
    if (abs(hm.y - MAT_STRING) < 0.05) { t += clamp(h, 0.006, 0.3); continue; }   // strings cast no shadow
    res = min(res, k * h / t);
    t += clamp(h, 0.012, 0.35);
    if (res < 0.002 || t > tmax) break;
  }
  res = clamp(res, 0.0, 1.0);
  return res * res * (3.0 - 2.0 * res);
}
float castAO(vec3 p, vec3 n) {
  float o = 0.0, s = 1.0;
  for (int i = 1; i <= 4; i++) { float h = 0.01 + 0.06 * float(i); o += (h - map(p + n * h).x) * s; s *= 0.72; }
  return clamp(1.0 - 2.2 * o, 0.0, 1.0);
}
// material: rgb albedo, a = metalness; roughness returned via out param; emissive for MAT_GLOW
vec4 castMaterial(float m, vec3 p, out float rough, out vec3 emit) {
  float id = floor(m + 0.001), v = floor((m - id) * 10.0 + 0.5);
  emit = vec3(0.0); rough = 0.5;
  if (id == MAT_TIN) { rough = v > 2.5 ? 0.26 : 0.34; vec3 c = v < 0.5 ? CS_TIN0 : v < 1.5 ? CS_TIN1 : v < 2.5 ? CS_TIN2 : CS_TIN3; return vec4(c, v > 2.5 ? 0.85 : 0.12); }
  if (id == MAT_CHROME) { rough = 0.1; return vec4(vec3(0.86, 0.87, 0.9), 1.0); }
  if (id == MAT_WOOD) {
    // vertical-ish grain (a function of x/z, so it doesn't crawl when a puppet is yanked up and down)
    float w = p.x * 46.0 + p.z * 31.0 + sin(p.y * 2.3 + p.x * 11.0) * 0.7 + sin(p.y * 13.0 + p.z * 19.0) * 0.2;
    float g = 0.5 + 0.5 * sin(w * 6.2831);
    g = g * g * (0.6 + 0.4 * sin(p.x * 13.0 + p.z * 29.0 + p.y * 0.7));
    float fl = 0.5 + 0.5 * sin(p.x * 7.0 - p.z * 5.0 + p.y * 1.3);
    vec3 base = v < 0.5 ? vec3(0.36, 0.21, 0.095) : v < 1.5 ? vec3(0.17, 0.085, 0.04) : v < 2.5 ? vec3(0.48, 0.35, 0.22) : vec3(0.08, 0.055, 0.045);
    vec3 c = base * (0.9 + 0.12 * fl) * (1.0 - 0.1 * g);
    rough = 0.42 + 0.1 * g; return vec4(c, 0.0);
  }
  if (id == MAT_JOINT) {
    if (v > 8.5) { rough = 0.6; return vec4(0.02, 0.015, 0.012, 0.0); }                        // painted dots
    if (v > 2.5 && v < 3.5) { rough = 0.4; return vec4(0.025, 0.02, 0.03, 0.0); }                // dark horn buttons
    rough = 0.38;
    vec3 c = v < 0.5 ? vec3(0.22, 0.11, 0.045) : v < 1.5 ? vec3(0.09, 0.045, 0.022) : v < 2.5 ? vec3(0.3, 0.2, 0.11) : vec3(0.04, 0.028, 0.024);
    return vec4(c, 0.0);
  }
  if (id == MAT_CLOTH) {
    rough = 0.78;
    float s = abs(fract(p.x * 120.0 + p.z * 25.0) - 0.5);
    float stripe = 1.0 - smoothstep(0.035, 0.07, s);
    float weave = 0.92 + 0.08 * sin(p.y * 1400.0) * sin(p.x * 1300.0 + p.z * 900.0);
    return vec4(mix(vec3(0.012, 0.018, 0.05) * weave, vec3(0.3, 0.32, 0.4), stripe * 0.45), 0.0);
  }
  if (id == MAT_BRASS) { rough = 0.26; return vec4(CS_BRASS * vec3(1.1, 0.95, 0.7) + 0.1, 0.85); }
  if (id == MAT_SKIN) { rough = 0.48; return vec4(0.34, 0.2, 0.14, 0.0); }
  if (id == MAT_STRING) { rough = 0.6; return vec4(CS_BONE * 0.9, 0.0); }
  if (id == MAT_GLOW) { emit = CS_SIGNAL * 4.0; return vec4(0.1, 0.1, 0.1, 0.0); }
  if (id == MAT_PORCELAIN) { rough = 0.2; return vec4(CS_BONE * 0.92, 0.0); }
  if (id == MAT_PAPER) { rough = 0.6; return vec4(CS_BONE * 0.62, 0.0); }
  // MAT_FLOOR: glossy navy stage (lacquered boards)
  rough = 0.05;
  float bx = p.x * 3.2; float bi = floor(bx);
  float seam = 1.0 - smoothstep(0.0, 0.012, abs(fract(bx) - 0.5) - 0.488);
  float bv = fract(sin(bi * 91.7) * 4375.5);
  return vec4(CS_INK2 * (1.25 + 0.2 * bv) * (1.0 - 0.35 * seam), 0.0);
}

struct StageLight { vec3 pos; vec3 dir; vec3 col; float cone; }; // spotlight: cone = cos(half-angle); cone <= -1 = omni

// GGX specular lobe (times pi, to match the non-normalised Lambert used for diffuse)
float cs_ggx(float ndh, float ndl, float ndv, float a) {
  float a2 = a * a;
  float d = ndh * ndh * (a2 - 1.0) + 1.0;
  float D = a2 / (d * d);
  float k = a * 0.5;
  float V = 1.0 / ((ndl * (1.0 - k) + k) * (ndv * (1.0 - k) + k) * 4.0);
  return D * V;
}
float cs_specCap = 3.0;   // lobe cap (stageShade lowers it for the floor)
vec3 cs_lightC(StageLight L, vec3 p, vec3 n, vec3 rd, vec3 alb, float metal, float rough, float coat, float wrap, bool shadow) {
  vec3 ld = L.pos - p; float dist = length(ld); ld /= dist;
  float spot = L.cone > -0.99 ? smoothstep(L.cone, mix(L.cone, 1.0, 0.25), dot(-ld, normalize(L.dir))) : 1.0;
  if (spot <= 0.0) return vec3(0.0);
  float nl = dot(n, ld);
  float ndl = max(nl, 0.0);
  float wl = max((nl + wrap) / (1.0 + wrap), 0.0);
  if (wl <= 0.0) return vec3(0.0);
  float sh = shadow ? castShadow(p + n * 0.004, ld, 0.012, dist, 14.0) : 1.0;
  vec3 v = -rd, h = normalize(ld + v);
  float ndv = max(dot(n, v), 0.001), ndh = max(dot(n, h), 0.0), vdh = max(dot(v, h), 0.0);
  float fr = pow(1.0 - vdh, 5.0);
  vec3 f0 = mix(vec3(0.04), alb, metal);
  vec3 F = f0 + (1.0 - f0) * fr;
  float a = clamp(rough * rough + 0.12 / dist, 0.01, 1.0);                      // sphere-light widening
  // lobes are capped: a point spotlight on a mirror-like lobe would otherwise make HDR fireflies that bloom the frame
  vec3 spec = F * min(cs_ggx(ndh, ndl, ndv, a) * ndl, cs_specCap);
  float Fc = 0.04 + 0.96 * fr;
  float cspec = coat * Fc * min(cs_ggx(ndh, ndl, ndv, clamp(0.01 + 0.12 / dist, 0.01, 1.0)) * ndl, 6.0);
  vec3 diff = alb * (1.0 - metal) * wl;
  vec3 c = (diff * (1.0 - coat * Fc) + spec * 3.14159 + cspec * 3.14159);
  return c * L.col * spot * sh / (1.0 + 0.02 * dist * dist);
}
vec3 cs_light(StageLight L, vec3 p, vec3 n, vec3 rd, vec3 alb, float metal, float rough, bool shadow) {
  return cs_lightC(L, p, n, rd, alb, metal, rough, 0.0, 0.0, shadow);
}
// studio environment for reflections: dark navy, an overhead lilac softbox, a warm strip and a floor bounce
vec3 cs_env(vec3 r, float rough) {
  float up = r.y;
  vec3 e = mix(CS_INK * 0.35, CS_INK2 * 0.9, smoothstep(-0.25, 0.3, up));
  e += CS_LILAC * 0.5 * smoothstep(0.45, 0.95 - 0.3 * rough, up);
  e += vec3(1.0, 0.92, 0.78) * 0.55 * exp(-abs(up - 0.12) * mix(40.0, 6.0, rough)) * smoothstep(-0.6, 0.4, r.z);
  e += vec3(0.7, 0.8, 1.0) * 0.4 * smoothstep(0.75 - 0.3 * rough, 0.95, -r.z) * smoothstep(-0.1, 0.3, up);
  return e;
}
// cheap shading of what the floor reflects (no shadows, no AO)
vec3 cs_shadeCheap(vec3 p, vec3 n, vec3 rd, float m, StageLight key, StageLight fill, StageLight rim) {
  float rough; vec3 emit;
  vec4 mat = castMaterial(m, p, rough, emit);
  vec3 alb = mix(mat.rgb, mat.rgb * 0.5 + 0.2, mat.a);
  vec3 c = cs_light(key, p, n, rd, alb, 0.0, 0.6, false) + cs_light(fill, p, n, rd, alb, 0.0, 0.6, false) + cs_light(rim, p, n, rd, alb, 0.0, 0.6, false) * 0.6;
  c += alb * cs_env(reflect(rd, n), 0.6) * 0.3;
  return c + emit;
}

/** Shade a hit: key spotlight (shadowed), fill (unshadowed, soft), rim (from behind). */
vec3 stageShade(vec3 p, vec3 n, vec3 rd, float m, StageLight key, StageLight fill, StageLight rim) {
  float rough; vec3 emit;
  vec4 mat = castMaterial(m, p, rough, emit);
  float id = floor(m + 0.001);
  vec3 alb = mat.rgb; float metal = mat.a;
  float ao = castAO(p, n);
  float coat = 0.0, wrap = 0.0;
  if (id == MAT_TIN) {
    coat = 1.0;
    // edge wear: convex edges (Laplacian of the SDF) show the bare tin under the paint
    const vec2 e = vec2(0.004, -0.004);
    float cv = (map(p + e.xyy).x + map(p + e.yyx).x + map(p + e.yxy).x + map(p + e.xxx).x) / (4.0 * 0.004);
    float wear = smoothstep(0.12, 0.45, cv) * (0.55 + 0.45 * sin(p.x * 97.0 + p.y * 131.0 + p.z * 73.0));
    alb = mix(alb, vec3(0.72, 0.72, 0.7), wear * 0.55); metal = mix(metal, 1.0, wear * 0.55); rough = mix(rough, 0.25, wear);
  }
  else if (id == MAT_WOOD) { coat = 0.45; wrap = 0.25; }
  else if (id == MAT_JOINT) { coat = 0.6; }
  else if (id == MAT_SKIN) { wrap = 0.45; }
  else if (id == MAT_CLOTH) { wrap = 0.2; }
  else if (id == MAT_PORCELAIN) { coat = 0.8; }
  cs_specCap = id == MAT_FLOOR ? 1.2 : 3.0;
  vec3 c = cs_lightC(key, p, n, rd, alb, metal, rough, coat, wrap, true);
  c += cs_lightC(fill, p, n, rd, alb, metal, rough, coat, wrap, false) * (0.35 + 0.65 * ao);
  c += cs_lightC(rim, p, n, rd, alb, metal, rough, coat, wrap, false) * 0.8;
  cs_specCap = 3.0;
  // rim sheen: a thin cool edge where the surface turns away from camera toward the rim light
  vec3 rl = normalize(rim.pos - p);
  float ndv = max(dot(n, -rd), 0.0);
  float edge = pow(1.0 - ndv, 4.0) * smoothstep(-0.2, 0.6, dot(n, rl));
  c += rim.col * edge * 0.12 * (id == MAT_FLOOR ? 0.0 : 1.0) * mix(vec3(1.0), alb * 2.0, metal * 0.5);
  // environment: reflections (fresnel, blurred by roughness) + soft ambient
  vec3 r = reflect(rd, n);
  float fr = pow(1.0 - ndv, 5.0);
  vec3 f0 = mix(vec3(0.04), alb, metal);
  vec3 Fe = f0 + (max(vec3(1.0 - rough), f0) - f0) * fr;
  float so = mix(ao, 1.0, 0.25);
  float envk = id == MAT_FLOOR ? 0.3 : 1.0;
  vec3 envc = cs_env(r, rough) * Fe * so * envk;
  envc += cs_env(r, 0.05) * coat * (0.04 + 0.96 * fr) * so * envk * (id == MAT_FLOOR ? 0.0 : 1.0);
  vec3 amb = alb * (1.0 - metal) * mix(CS_INK2 * 1.2, CS_LILAC * 0.12, 0.5 + 0.5 * n.y) * ao;
#ifdef CAST_REFLECT
  if (id == MAT_FLOOR) {
    // a soft reflection of the cast in the lacquered stage
    vec3 ro2 = p + n * 0.01;
    float t = 0.02; vec2 hh = vec2(-1.0);
    float tr = min(3.0, (2.6 - ro2.y) / max(r.y, 0.05));             // reflections fade out within ~2 m
    for (int i = 0; i < 28; i++) {
      vec2 q = map(ro2 + r * t);
      if (q.x < 0.003 * t) { hh = vec2(t, q.y); break; }
      t += q.x * 1.15;
      if (t > tr) break;
    }
    if (hh.x > 0.0 && floor(hh.y + 0.001) != MAT_FLOOR) {
      vec3 p2 = ro2 + r * hh.x;
      vec3 n2 = castNormal(p2);
      vec3 rc = cs_shadeCheap(p2, n2, r, hh.y, key, fill, rim);
      float fade = exp(-hh.x * 1.1);
      envc = mix(envc, rc * (0.08 + 0.4 * fr), fade * 0.8);
    }
  }
#endif
  c += envc + amb;
  return c + emit * (0.75 + 0.5 * pow(ndv, 3.0)) + (id == MAT_GLOW ? CS_EMBER * 2.5 * pow(ndv, 6.0) : vec3(0.0));
}
`;
