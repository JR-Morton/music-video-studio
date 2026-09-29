// dawn plate: a real sunrise over the sleeping town (the same ridge and roofs as the sandbox's night horizon), a grassy
// knoll and the small tin robot, alone, watching the sun come up. One shader. (hand() is unused.)
import { GLSL_CAST_SDF, GLSL_CAST_SHADE } from './_cast';

export const DAWN_FRAG = /* glsl */ `
uniform float uT, uSun, uSpot, uFoc, uEye, uTouch;
uniform vec3 uRo, uTa, uRob, uHand, uHandDir;  // uRob = (x, z, yaw); hand = fingertip position, direction it points
uniform vec3 uRw;                               // walk, look, y
${GLSL_CAST_SDF}

#define M_GRASS 40.0
#define M_HOUSE 41.0
#define M_ROOF 42.0
#define M_EYE 20.0
#define M_SLEEVE 43.0

float groundH(vec2 xz) {
  float k = 0.32 * exp(-dot(xz, xz) / 10.0);                 // the knoll the robot stands on
  float v = -2.9 * smoothstep(3.0, 30.0, -xz.y);              // falls away to the valley and the town
  float w = 0.05 * sin(xz.x * 0.7 + 1.0) * sin(xz.y * 0.5) * exp(-dot(xz, xz) / 60.0);
  return k + v + w - 0.32;
}

vec2 town(vec3 p) {
  // two ragged rows of houses in the valley (domain repetition along x)
  vec2 res = vec2(1e5, MAT_NONE);
  for (int row = 0; row < 2; row++) {
    float z0 = row == 0 ? -62.0 : -78.0, sp = row == 0 ? 4.2 : 4.7, off = row == 0 ? 0.0 : 1.7;
    vec3 q = p - vec3(off, -3.2, z0);
    float id = floor(q.x / sp + 0.5);
    if (abs(id) > 16.0) continue;
    q.x -= id * sp;
    float r = hash11(id * 3.7 + float(row) * 11.0);
    if (hash11(id * 5.1 + float(row)) > 0.78) continue;
    float hgt = 1.4 + 2.4 * r * r, wid = 1.0 + 0.7 * hash11(id + 7.0 + float(row));
    q.z += (hash11(id * 1.3 + 2.0) - 0.5) * 2.0;
    float body = cs_box(q - vec3(0.0, hgt * 0.5, 0.0), vec3(wid, hgt * 0.5, 1.4), 0.02);
    vec3 rq = q - vec3(0.0, hgt, 0.0);
    float roof = max(abs(rq.x) * 0.8 + rq.y * 0.6 - wid * 0.8, max(-rq.y, abs(rq.z) - 1.5));
    if (body < res.x) res = vec2(body, M_HOUSE);
    if (roof < res.x) res = vec2(roof, M_ROOF);
    // a steeple, once
    if (row == 1 && abs(id - 3.0) < 0.5) { float st = max(length(q.xz) - 0.7 + (q.y - 6.0) * 0.12, -q.y) ; st = max(st, q.y - 11.0); if (st < res.x) res = vec2(st, M_ROOF); }
  }
  return res;
}

vec2 hand(vec3 p) {
  // a plain human hand, index finger extended, reaching in from off-frame (no cuff, no strings)
  vec3 d = normalize(uHandDir);
  vec3 tip = uHand;
  vec3 k2 = tip - d * 0.024, k1 = k2 - d * 0.028, k0 = k1 - d * 0.042;   // phalanges back to the knuckle
  float b = length(p - k1) - 0.35;
  if (b > 0.1) return vec2(b, MAT_NONE);
  float f = cs_cap(p, k0, k1, 0.0105);
  f = smin(f, cs_cap(p, k1, k2, 0.0095), 0.004);
  f = smin(f, cs_cap(p, k2, tip - d * 0.007, 0.0088), 0.003);
  vec3 side = normalize(cross(d, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(side, d);
  // palm / back of the hand behind the knuckle, curled fingers under it, the thumb
  vec3 pc = k0 - d * 0.05 - up * 0.012;
  vec3 lp = p - pc; lp = vec3(dot(lp, side), dot(lp, up), dot(lp, d));
  float palm = cs_box(lp, vec3(0.038, 0.014, 0.05), 0.014);
  float curl = cs_cap(lp, vec3(-0.03, -0.025, 0.035), vec3(0.018, -0.03, 0.04), 0.013);
  float thumb = cs_cap(lp, vec3(0.03, -0.01, -0.02), vec3(0.042, -0.02, 0.03), 0.011);
  float wrist = cs_cap(lp, vec3(0.0, 0.0, -0.05), vec3(0.0, 0.01, -0.1), 0.024);
  float h = smin(f, smin(palm, smin(curl, smin(thumb, wrist, 0.02), 0.012), 0.012), 0.01);
  vec2 res = vec2(h, MAT_SKIN);
  float sleeve = cs_cap(lp, vec3(0.0, 0.01, -0.1), vec3(0.0, 0.06, -2.5), 0.043 + clamp(-lp.z - 0.1, 0.0, 0.5) * 0.05);
  if (sleeve < res.x) res = vec2(sleeve, M_SLEEVE);
  return res;
}

vec2 robot(vec3 p) {
  vec3 q = p - vec3(uRob.x, groundH(uRob.xy) + uRw.z, uRob.y);
  float b = length(q - vec3(0.0, 0.32, 0.0)) - 0.5;
  if (b > 0.35) return vec2(b, MAT_NONE);
  q.xz = cs_rot(uRob.z) * q.xz;
  vec2 h = sdTinRobot(q, uRw.x, uRw.y, 0.0);
  if (abs(h.y - MAT_GLOW) < 0.01) h.y = M_EYE;
  return h;
}

vec2 map(vec3 p) {
  vec2 res = vec2((p.y - groundH(p.xz)) * 0.8, M_GRASS);
  if (p.z < -50.0) res = opU(res, town(p));
  res = opU(res, robot(p));
  // (no hand: the robot turns to the sun on its own)
  return res;
}
${GLSL_CAST_SHADE}

vec3 sunDir() { return normalize(vec3(-0.45, uSun, -1.0)); }

vec3 skyCol(vec3 rd) {
  vec3 sd = sunDir();
  float y = max(rd.y, -0.1);
  float sunUp = smoothstep(-0.06, 0.1, uSun);
  vec3 zen = mix(vec3(0.03, 0.06, 0.16), vec3(0.1, 0.2, 0.42), sunUp);
  vec3 mid = mix(vec3(0.2, 0.16, 0.25), vec3(0.4, 0.38, 0.5), sunUp);
  vec3 hor = C_DAWN * mix(0.45, 0.62, sunUp);
  vec3 c = mix(hor, mid, smoothstep(0.0, 0.12, y));
  c = mix(c, zen, smoothstep(0.08, 0.6, y));
  float mu = max(dot(rd, sd), 0.0);
  c += C_DAWN * 0.22 * pow(mu, 16.0) * (0.5 + sunUp) * smoothstep(0.3, -0.02, y);
  c += vec3(1.0, 0.78, 0.5) * 0.35 * pow(mu, 300.0);
  c += vec3(1.0, 0.86, 0.62) * 3.5 * smoothstep(0.99955, 0.9998, mu);   // the disc
  // ordinary morning clouds on a high plane, drifting
  if (rd.y > 0.01) {
    vec2 cp = rd.xz / rd.y * 1.1 + vec2(uT * 0.01, 0.0);
    float dn = fbm(cp * 0.8 + vec2(3.0, 1.0), 4) * 0.5 + 0.5;
    float cov = smoothstep(0.6, 0.82, dn) * smoothstep(0.03, 0.22, rd.y);
    vec3 cc = mix(C_DAWN * 0.9 + vec3(0.1, 0.08, 0.08), vec3(0.45, 0.42, 0.55), smoothstep(0.05, 0.5, rd.y)) * (0.6 + 0.6 * pow(mu, 4.0));
    c = mix(c, cc, cov * 0.7);
  }
  return c;
}
vec3 hazeCol(vec3 rd) {
  vec3 sd = sunDir();
  float mu = max(dot(normalize(vec3(rd.x, 0.0, rd.z)), normalize(vec3(sd.x, 0.0, sd.z))), 0.0);
  return C_DAWN * (0.3 + 0.25 * pow(mu, 6.0)) + vec3(0.05, 0.06, 0.1);
}

float shadowS(vec3 ro, vec3 rd, float tmax) {
  float res = 1.0, t = 0.01;
  for (int i = 0; i < 40; i++) {
    float h = map(ro + rd * t).x;
    res = min(res, 10.0 * h / t);
    t += clamp(h, 0.01, 0.8);
    if (res < 0.003 || t > tmax) break;
  }
  return clamp(res, 0.0, 1.0);
}

vec3 shade(vec3 p, vec3 n, vec3 rd, float m, float dist) {
  vec3 sd = sunDir();
  float sunUp = smoothstep(-0.1, 0.1, uSun);
  vec3 sunC = mix(C_DAWN * 1.2, vec3(1.25, 1.0, 0.8), smoothstep(0.02, 0.25, uSun)) * (0.3 + 2.2 * sunUp);
  float rough = 0.5; vec3 emit = vec3(0.0); vec3 alb; float metal = 0.0;
  if (m >= M_EYE - 0.01 && m < M_EYE + 0.5) { emit = C_SIGNAL * 1.7 * uEye; alb = vec3(0.05); }
  else if (abs(m - M_GRASS) < 0.01) {
    float g = fbm(p.xz * 6.0, 3) * 0.5 + 0.5;
    alb = mix(vec3(0.09, 0.13, 0.045), vec3(0.2, 0.22, 0.09), g);
    alb = mix(alb, vec3(0.08, 0.09, 0.1), smoothstep(-8.0, -30.0, p.z)); rough = 0.85;
  }
  else if (abs(m - M_HOUSE) < 0.01) { alb = vec3(0.35, 0.3, 0.3) * (0.8 + 0.3 * hash11(floor(p.x * 0.3))); rough = 0.8; }
  else if (abs(m - M_ROOF) < 0.01) { alb = vec3(0.25, 0.12, 0.1); rough = 0.6; }
  else if (abs(m - M_SLEEVE) < 0.01) { alb = vec3(0.7, 0.56, 0.4) * (0.95 + 0.05 * smoothstep(-0.3, 0.3, sin(dot(p, normalize(uHandDir)) * 260.0))); rough = 0.95; }
  else { vec4 cm = castMaterial(m, p, rough, emit); alb = cm.rgb; metal = cm.a; }
  float ndl = max(dot(n, sd), 0.0);
  float sh = ndl > 0.0 && dist < 20.0 ? shadowS(p + n * 0.004, sd, 12.0) : 1.0;
  vec3 h = normalize(sd - rd);
  float spec = pow(max(dot(n, h), 0.0), mix(200.0, 10.0, rough)) * (1.0 - rough * 0.85);
  vec3 f0 = mix(vec3(0.04), alb, metal);
  vec3 c = (alb * (1.0 - metal) * ndl + f0 * spec * 4.0 * ndl) * sunC * sh;
  // skylight: blue from above, peach from the sun side, bounce from the grass
  vec3 skyA = mix(vec3(0.08, 0.1, 0.18), vec3(0.28, 0.32, 0.46), sunUp);
  float ao = 1.0;
  if (dist < 12.0) { float o = 0.0, w = 1.0; for (int i = 1; i <= 3; i++) { float hh = 0.03 + 0.07 * float(i); o += (hh - map(p + n * hh).x) * w; w *= 0.6; } ao = clamp(1.0 - 2.5 * o, 0.0, 1.0); }
  vec3 amb = skyA * (0.75 + 0.35 * n.y) + C_DAWN * 0.12 * max(dot(n, -normalize(vec3(sd.x, 0.0, sd.z))), 0.0) + C_DAWN * 0.25 * max(dot(n, normalize(vec3(sd.x, 0.2, sd.z))), 0.0) * (0.3 + sunUp) + vec3(0.05, 0.06, 0.03) * max(-n.y, 0.0);
  c += alb * (1.0 - metal) * amb * ao;
  // skin: a soft warm wrap (light through the fingertip)
  if (abs(m - MAT_SKIN) < 0.01) c += alb * vec3(1.0, 0.45, 0.3) * pow(max(dot(-n, sd) * 0.5 + 0.5, 0.0), 3.0) * 0.4 * sunC;
  // rim from the low sun
  c += (alb * 0.6 + f0) * pow(1.0 - max(dot(n, -rd), 0.0), 4.0) * sunC * 0.5 * max(dot(-rd, sd) * 0.5 + 0.5, 0.0) * ao;
  // the fading spotlight from the chorus (warm yellow, from above)
  if (uSpot > 0.001) {
    vec3 lp = vec3(uRob.x + 0.6, 5.5, uRob.y + 1.2);
    vec3 ld = normalize(lp - p);
    float cone = smoothstep(0.985, 0.996, dot(-ld, normalize(vec3(uRob.x, 0.3, uRob.y) - lp)));
    c += (alb * (1.0 - metal) * max(dot(n, ld), 0.0) + f0 * pow(max(dot(n, normalize(ld - rd)), 0.0), 60.0) * 3.0) * mix(C_SIGNAL, vec3(1.0), 0.35) * 3.0 * cone * uSpot;
  }
  // metals reflect the sky
  vec3 r = reflect(rd, n);
  c += skyCol(r) * f0 * (metal > 0.5 ? 1.0 : 0.25) * ao;
  // aerial perspective toward the sun-lit haze
  float fogK = 1.0 - exp(-dist * 0.012);
  c = mix(c, hazeCol(rd), fogK);
  return c + emit;
}

void main() {
  vec2 uv = (vUv - 0.5) * vec2(16.0 / 9.0, 1.0);
  vec3 ro = uRo;
  vec3 fw = normalize(uTa - ro), rt = normalize(cross(fw, vec3(0, 1, 0))), up = cross(rt, fw);
  vec3 rd = normalize(fw * uFoc + rt * uv.x + up * uv.y);
  float t = 0.0; vec2 hit = vec2(-1.0, 0.0);
  for (int i = 0; i < 150; i++) {
    vec2 h = map(ro + rd * t);
    if (h.x < 0.0006 * max(1.0, t)) { hit = vec2(t, h.y); break; }
    t += h.x;
    if (t > 160.0) break;
  }
  if (hit.x < 0.0 && rd.y < 0.0 && t < 160.0) hit = vec2(t, M_GRASS);
  vec3 col = skyCol(rd);
  if (hit.x > 0.0) {
    vec3 p = ro + rd * hit.x, n = castNormal(p);
    col = shade(p, n, rd, hit.y, hit.x);
  }
  // the spotlight's haze cone, fading
  if (uSpot > 0.001) {
    vec3 lp = vec3(uRob.x + 0.6, 5.5, uRob.y + 1.2), ax = normalize(vec3(uRob.x, 0.3, uRob.y) - lp);
    float acc = 0.0; float tm = hit.x > 0.0 ? min(hit.x, 8.0) : 8.0;
    for (int i = 0; i < 16; i++) {
      float s = (float(i) + 0.5) / 16.0 * tm;
      vec3 q = ro + rd * s;
      acc += smoothstep(0.985, 0.997, dot(normalize(q - lp), ax)) / 16.0;
    }
    col += C_SIGNAL * acc * 0.35 * uSpot;
  }
  fragColor = vec4(col, 1.0);
}
`;
