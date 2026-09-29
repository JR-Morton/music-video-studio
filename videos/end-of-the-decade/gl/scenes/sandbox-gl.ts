// sandbox plate: the raymarched world (one shader, four sets chosen by uMode).
//   mode 0  the porcelain test chamber (panel with the system prompt, a hatch with a chrome padlock, the crack)
//   mode 1  boxes inside boxes (the chamber is a box inside a bigger box inside a bigger box)
//   mode 2  the chamber with a porcelain crate ("lock it in")
//   mode 3  the floor grid runs out into the real world (a horizon under a deep night-blue sky)
import { GLSL_CAST_SDF, GLSL_CAST_SHADE } from './_cast';

export const SANDBOX_FRAG = /* glsl */ `
uniform float uPanelOn;
uniform float uT, uMode, uLights, uCrack, uCrackLen, uHatch, uLockY, uShk, uLid, uShk2, uEdgeZ, uScreen, uFoc, uFlash;
uniform vec3 uRo, uTa;
uniform vec4 uRb[3];      // robot x, z, yaw, walk
uniform vec3 uRl;         // head yaw per robot
uniform vec3 uEye;        // eye brightness per robot
uniform vec3 uRy;         // y offset per robot (hops)
uniform sampler2D uPanel; // the system-prompt screen
${GLSL_CAST_SDF}

#define M_TILE 30.0
#define M_SCREEN 31.0
#define M_HAZARD 32.0
#define M_GROUND 34.0
#define M_EYE 20.0
const float K = 3.5;

// a porcelain room, open front (+z) and open top; s = scale
vec2 sdRoom(vec3 p, float s, bool hatch) {
  float th = 0.08 * s, W = 2.4 * s, D = 2.0 * s, Hh = 1.1 * s, F = 4.0 * s, r = th * 0.45;
  float bk = cs_box(p - vec3(0.0, Hh * 0.5, -D - th * 0.5), vec3(W + th, Hh * 0.5, th * 0.5), r);
  if (hatch) bk = max(bk, -cs_box(p - vec3(1.025, 0.29, -D), vec3(0.265, 0.29, 0.3), 0.01));
  float sd = cs_box(vec3(abs(p.x) - W - th * 0.5, p.y - Hh * 0.5, p.z - (F - D - th) * 0.5), vec3(th * 0.5, Hh * 0.5, (F + D + th) * 0.5), r);
  vec2 res = vec2(min(bk, sd), MAT_PORCELAIN);
  // the screen: a slim dark glass slab hung above the back wall on two pale lines that vanish upward
  vec3 sp = p - vec3(0.55 * s, 1.9 * s, -D - 0.04 * s);
  float sc = cs_box(sp, vec3(1.2 * s, 0.675 * s, 0.025 * s), 0.03 * s);
  if (sc < res.x && (uMode < 1.5 || s > 1.5) && uPanelOn > 0.5) res = vec2(sc, M_SCREEN);
  vec3 sq = vec3(abs(sp.x) - 1.05 * s, sp.y, sp.z);
  if (s < 1.5 && uMode < 0.5 && uPanelOn > 0.5) {
    float str = cs_cap(sq, vec3(0.0, 0.66 * s, 0.0), vec3(0.0, 30.0 * s, 0.0), 0.0035 * s);
    if (str < res.x) res = vec2(str, MAT_STRING);
  }
  return res;
}

// chrome padlock: body centred at origin, shackle above (lift = 0 closed .. 1 open)
float sdPadlock(vec3 p, float sz, float lift) {
  p /= sz;
  float body = cs_box(p, vec3(0.05, 0.042, 0.018), 0.012);
  vec3 q = p - vec3(0.0, 0.045 + lift * 0.03, 0.0);
  float arc = length(vec2(length(q.xy) - 0.03, q.z)) - 0.0075;
  arc = max(arc, -q.y);
  float legL = cs_cap(q, vec3(-0.03, 0.0, 0.0), vec3(-0.03, -0.03 - lift * -0.0, 0.0), 0.0075);
  float legR = cs_cap(q, vec3(0.03, 0.0, 0.0), vec3(0.03, -0.03 + lift * 0.03, 0.0), 0.0075);
  return min(body, min(arc, min(legL, legR))) * sz;
}

vec2 robot(vec3 p, int i) {
  vec4 r = uRb[i];
  if (r.x > 90.0) return vec2(1e5, MAT_NONE);
  vec3 q = p - vec3(r.x, uRy[i], r.y);
  float b = length(q - vec3(0.0, 0.32, 0.0)) - 0.5;
  if (b > 0.35) return vec2(b, MAT_NONE);
  q.xz = cs_rot(r.z) * q.xz;
  vec2 h = sdTinRobot(q, r.w, uRl[i], float(i));
  if (abs(h.y - MAT_GLOW) < 0.01) h.y = M_EYE + float(i);
  return h;
}

vec2 map(vec3 p) {
  vec2 res;
  if (uMode > 2.5) {
    // the edge of the game: a porcelain slab floor ending at z = uEdgeZ, the real ground below it
    float slab = cs_box(p - vec3(0.0, -0.3, uEdgeZ + 50.0), vec3(60.0, 0.3, 50.0), 0.012);
    res = vec2(slab, M_TILE);
    res = opU(res, vec2(p.y + 0.3 - 0.03 * sin(p.x * 0.7) * sin(p.z * 0.5), M_GROUND));
  } else {
    res = vec2(p.y, M_TILE);
    res = opU(res, sdRoom(p, 1.0, uMode < 0.5));
    if (uMode > 0.5 && uMode < 1.5) {
      res = opU(res, sdRoom(p, K, false));
      res = opU(res, sdRoom(p, K * K, false));
    }
    if (uMode < 0.5) {
      // the hatch door (hinged at its left edge) and the padlock
      vec3 hp = p - vec3(0.76, 0.0, -2.0);
      hp.xz = cs_rot(-uHatch) * hp.xz;
      float door = cs_box(hp - vec3(0.265, 0.29, -0.02), vec3(0.255, 0.28, 0.018), 0.012);
      res = opU(res, vec2(door, MAT_PORCELAIN + 0.1));
      vec3 lp = p - vec3(1.22, 0.24 + uLockY, -1.955);
      if (length(lp) < 0.2) res = opU(res, vec2(sdPadlock(lp, 1.2, uShk), MAT_CHROME));
      else res = opU(res, vec2(length(lp) - 0.15, MAT_NONE));
    }
    if (uMode > 1.5) {
      // the crate: porcelain, hollow, a slot window at eye height, a lid hinged at the back, a chrome padlock
      vec3 c = p - vec3(0.0, 0.0, 0.0);
      float outer = cs_box(c - vec3(0.0, 0.36, 0.0), vec3(0.45, 0.36, 0.36), 0.03);
      float inner = cs_box(c - vec3(0.0, 0.42, 0.0), vec3(0.4, 0.36, 0.31), 0.02);
      float slot = cs_box(c - vec3(0.0, 0.47, 0.36), vec3(0.2, 0.035, 0.1), 0.02);
      float crate = max(max(outer, -inner), -slot);
      res = opU(res, vec2(crate, MAT_PORCELAIN + 0.2));
      vec3 lq = c - vec3(0.0, 0.72, -0.36);
      lq.yz = cs_rot(uLid) * lq.yz;
      float lid = cs_box(lq - vec3(0.0, 0.025, 0.36), vec3(0.465, 0.025, 0.375), 0.02);
      res = opU(res, vec2(lid, MAT_PORCELAIN + 0.2));
      vec3 pl = lq - vec3(0.0, -0.06, 0.745);
      res = opU(res, vec2(sdPadlock(pl, 1.4, uShk2), MAT_CHROME));
    }
  }
  res = opU(res, robot(p, 0));
  res = opU(res, robot(p, 1));
  res = opU(res, robot(p, 2));
  return res;
}
${GLSL_CAST_SHADE}

vec3 sky(vec3 rd) {
  if (uMode > 2.5) {
    float y = rd.y;
    vec3 c = mix(vec3(0.05, 0.075, 0.2), vec3(0.006, 0.01, 0.035), smoothstep(0.0, 0.5, y));
    c = mix(c, vec3(0.1, 0.13, 0.3), exp(-max(y, 0.0) * 14.0) * 0.9);
    // stars
    vec2 sp = rd.xz / max(rd.y, 0.05) * 40.0;
    vec2 cell = floor(sp); float h = hash12(cell);
    float st = step(0.985, h) * smoothstep(0.08, 0.0, length(fract(sp) - 0.5)) * smoothstep(0.03, 0.2, y);
    c += vec3(0.8, 0.85, 1.0) * st * 0.6;
    // a far ridge and a sleeping town
    float ang = atan(rd.x, -rd.z);
    float ridge = 0.012 + 0.008 * sin(ang * 9.0 + 1.0) + 0.006 * sin(ang * 23.0);
    float town = step(abs(ang - 0.18), 0.2) * (0.004 + 0.007 * step(0.35, hash11(floor(ang * 60.0))) * (0.4 + 0.6 * hash11(floor(ang * 60.0) + 3.0)));
    float sil = max(ridge, ridge + town);
    if (y < sil) {
      c = vec3(0.012, 0.016, 0.04);
      float win = step(abs(ang - 0.18), 0.2) * step(0.97, hash12(floor(vec2(ang * 700.0, y * 1400.0)))) * step(0.004, y) * step(y, sil - 0.001);
      c += C_EMBER * win * 0.5;
    }
    return c;
  }
  return C_INK * mix(0.35, 0.8, smoothstep(-0.2, 0.6, rd.y));
}

float shadowK(vec3 ro, vec3 rd, float tmax, float k, float sc) {
  float res = 1.0, t = 0.012 * sc;
  for (int i = 0; i < 34; i++) {
    float h = map(ro + rd * t).x;
    res = min(res, k * h / t);
    t += clamp(h, 0.012 * sc, 0.6 * sc);
    if (res < 0.003 || t > tmax) break;
  }
  return clamp(res, 0.0, 1.0);
}

vec2 march(vec3 ro, vec3 rd, float tmax, int steps, float eps) {
  float t = 0.0;
  for (int i = 0; i < 140; i++) {
    if (i >= steps) break;
    vec2 h = map(ro + rd * t);
    if (h.x < eps * max(1.0, t)) return vec2(t, h.y);
    t += h.x * 0.92;
    if (t > tmax) break;
  }
  return vec2(-1.0, MAT_NONE);
}

float boxScale(vec3 p) {
  if (uMode < 0.5 || uMode > 1.5) return 1.0;
  if (abs(p.x) < 2.4 && p.z > -2.0 && p.z < 4.0) return 1.0;
  if (abs(p.x) < 2.4 * K && p.z > -2.0 * K && p.z < 4.0 * K) return K;
  if (abs(p.x) < 2.4 * K * K && p.z > -2.0 * K * K && p.z < 4.0 * K * K) return K * K;
  return -1.0;
}

const vec3 KEYP = vec3(0.9, 7.5, 0.6);
const vec3 KEYAIM = vec3(-0.1, 0.0, -0.5);
vec3 keyDir(vec3 p) { return uMode > 0.5 && uMode < 1.5 ? normalize(vec3(0.3, 1.0, 0.5)) : normalize(KEYP - p); }
float keySpot(vec3 p) {
  if (uMode > 0.5 && uMode < 1.5) return 1.0;
  vec3 d = normalize(p - KEYP), a = normalize(KEYAIM - KEYP);
  return smoothstep(0.9, 0.965, dot(d, a));
}

// albedo, metal, rough, emission for any material id
vec4 matAt(float m, vec3 p, vec3 n, out float rough, out vec3 emit) {
  emit = vec3(0.0); rough = 0.3;
  if (m >= M_EYE - 0.01 && m < M_EYE + 2.5) { emit = C_SIGNAL * 4.5 * uEye[int(m - M_EYE + 0.5)]; return vec4(vec3(0.06), 0.0); }
  if (abs(m - M_TILE) < 0.01) {
    float s = boxScale(p);
    if (uMode > 2.5 && p.z < uEdgeZ + 0.02 && n.y < 0.5) { rough = 0.2; return vec4(C_BONE * 0.8, 0.0); }
    if (s < 0.0) { rough = 0.3; return vec4(C_INK2 * 1.2, 0.0); }
    vec2 g = abs(fract(p.xz / (0.5 * s)) - 0.5);
    float seam = smoothstep(0.492, 0.498, max(g.x, g.y));
    vec3 a = mix(C_BONE * 0.86, C_ASH * 0.55, seam * 0.8);
    // hazard band in front of the back wall
    float zb = p.z + 2.0 * s;
    if (uMode < 2.5 && zb > 0.05 * s && zb < 0.3 * s && abs(p.x) < 2.35 * s) {
      float st = step(0.5, fract((p.x + p.z) / (0.18 * s)));
      a = mix(C_INK * 1.5, C_SIGNAL * 0.9, st);
    }
    rough = 0.12;
    return vec4(a, 0.0);
  }
  if (abs(m - M_SCREEN) < 0.01) { rough = 0.05; return vec4(vec3(0.01), 0.0); }
  if (abs(m - M_GROUND) < 0.01) {
    float g = 0.5 + 0.5 * fbm(p.xz * 3.0, 3);
    rough = 0.9; return vec4(mix(vec3(0.1, 0.12, 0.13), vec3(0.2, 0.22, 0.22), g), 0.0);
  }
  if (floor(m + 0.001) == MAT_PORCELAIN) {
    vec3 a = C_BONE * 0.9;
    float v = floor((m - MAT_PORCELAIN) * 10.0 + 0.5);
    if (v > 1.5 && abs(p.y - 0.11) < 0.04) a = mix(C_INK * 1.5, C_SIGNAL * 0.9, step(0.5, fract((p.x + p.y + p.z) * 6.0)));
    if (v > 0.5 && v < 1.5) a = mix(a, C_SIGNAL * 0.9, step(0.5, fract((p.x - p.y) * 7.0)) * step(0.49, p.y) * step(p.y, 0.56));
    rough = 0.18;
    return vec4(a, 0.0);
  }
  vec4 cm = castMaterial(m, p, rough, emit);
  return cm;
}

vec3 envC(vec3 r) {
  if (uMode > 2.5) return sky(r);
  // the lab: a big softbox overhead, dark stage around
  float box = smoothstep(0.8, 0.92, dot(r, normalize(KEYP))) * uLights;
  return mix(C_INK * 0.5, C_LILAC * 0.3, smoothstep(-0.3, 0.6, r.y)) + C_BONE * 0.35 * smoothstep(-0.05, 0.05, r.y) * smoothstep(0.5, 0.2, r.y) + vec3(1.0, 0.98, 0.95) * box * 2.5;
}

vec3 crackPos() { return vec3(2.38, 0.5, -0.6); }

vec3 light(vec3 p, vec3 n, vec3 rd, float m, float t) {
  float rough; vec3 emit;
  vec4 ma = matAt(m, p, n, rough, emit);
  vec3 alb = ma.rgb; float metal = ma.a;
  float sc = uMode > 0.5 && uMode < 1.5 ? max(1.0, boxScale(p)) : 1.0;
  vec3 KEYD = keyDir(p);
  float keyI = 0.95 * uLights * (uMode > 2.5 ? 1.0 : keySpot(p));
  if (uMode > 2.5) keyI *= smoothstep(uEdgeZ - 1.2, uEdgeZ + 1.5, p.z);
  vec3 kc = vec3(1.0, 0.97, 0.92) * keyI;
  float ndl = max(dot(n, KEYD), 0.0);
  float sh = ndl > 0.0 && keyI > 0.01 ? shadowK(p + n * 0.004 * sc, KEYD, uMode > 0.5 && uMode < 1.5 ? 120.0 * sc : length(KEYP - p), 7.0, sc) : 0.0;
  float ao = 1.0;
  { float o = 0.0, w = 1.0; for (int i = 1; i <= 3; i++) { float h = (0.04 + 0.09 * float(i)) * sc; o += (h - map(p + n * h).x) * w / sc; w *= 0.6; } ao = clamp(1.0 - 2.0 * o, 0.0, 1.0); }
  vec3 h = normalize(KEYD - rd);
  float spec = pow(max(dot(n, h), 0.0), mix(200.0, 10.0, rough)) * (1.0 - rough * 0.85);
  vec3 f0 = mix(vec3(0.04), alb, metal);
  vec3 c = (alb * (1.0 - metal) * ndl + f0 * spec * 4.0 * ndl) * kc * sh;
  // lilac fill (soft, from the front right) + hemisphere
  vec3 hemi = mix(C_INK * 0.5, C_LILAC * 0.16, n.y * 0.5 + 0.5) * (0.3 + 0.7 * uLights);
  vec3 fillD = normalize(vec3(-0.8, 0.35, 0.6));
  hemi += C_LILAC * 0.22 * max(dot(n, fillD), 0.0) * uLights;
  if (uMode > 2.5) {
    hemi = mix(vec3(0.01, 0.012, 0.03), vec3(0.08, 0.1, 0.22), n.y * 0.5 + 0.5) + hemi * smoothstep(uEdgeZ - 1.0, uEdgeZ + 1.5, p.z);
    // cool moonlight rim from the horizon
    c += alb * (1.0 - metal) * max(dot(n, normalize(vec3(0.3, 0.6, -1.0))), 0.0) * vec3(0.25, 0.32, 0.6) * 0.9;
  }
  c += alb * (1.0 - metal) * hemi * ao;
  // rim from behind
  c += alb * pow(1.0 - max(dot(n, -rd), 0.0), 3.0) * vec3(0.7, 0.75, 1.0) * 0.12 * ao * uLights;
  // the crack's light
  if (uMode < 0.5 && uCrack > 0.0) {
    vec3 lc = crackPos() - p; float d = length(lc); lc /= d;
    c += alb * (1.0 - metal) * max(dot(n, lc), 0.0) * vec3(1.0, 0.95, 0.85) * uCrack * 0.9 / (0.3 + d * d);
  }
  // metal reflections of the environment
  vec3 r = reflect(rd, n);
  c += envC(r) * f0 * (metal > 0.5 ? 1.0 : 0.0) * ao;
  return c + emit;
}

// the screen and the crack are emissive surface details
vec3 surfaceEmit(vec3 p, float m, float s) {
  vec3 e = vec3(0.0);
  if (abs(m - M_SCREEN) < 0.01) {
    s = p.y < 1.9 * K * 0.55 ? 1.0 : p.y < 1.9 * K * K * 0.55 ? K : K * K;
    vec2 uv = vec2((p.x - 0.55 * s) / (2.4 * s) + 0.5, (p.y - 1.9 * s) / (1.35 * s) + 0.5);
    if (p.z < -2.0 * s - 0.04 * s) uv = vec2(-1.0);
    if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) e = texture(uPanel, uv).rgb * 1.5 * uScreen;
  }
  if (uMode < 0.5 && uCrack > 0.0 && p.x > 2.39 && p.x < 2.45) {
    float y = p.y;
    float zc = -0.6 + 0.008 * (abs(fract(y * 4.1) - 0.5) * 4.0 - 1.0) + 0.0025 * (abs(fract(y * 17.7 + 0.3) - 0.5) * 4.0 - 1.0);
    float d = abs(p.z - zc);
    float along = smoothstep(uCrackLen + 0.05, uCrackLen - 0.05, y) * smoothstep(0.0, 0.03, y);
    float w = mix(0.0015, 0.007, uCrack);
    e += vec3(1.0, 0.96, 0.88) * (smoothstep(w, w * 0.2, d) * 3.2 + exp(-d / 0.02) * 0.25 * uCrack) * along * min(1.0, uCrack * 4.0);
  }
  return e;
}

void main() {
  vec2 uv = (vUv - 0.5) * vec2(16.0 / 9.0, 1.0);
  vec3 ro = uRo;
  vec3 fw = normalize(uTa - ro), rt = normalize(cross(fw, vec3(0, 1, 0))), up = cross(rt, fw);
  vec3 rd = normalize(fw * uFoc + rt * uv.x + up * uv.y);
  float tmax = uMode > 0.5 && uMode < 1.5 ? 400.0 : 80.0;
  vec2 hit = march(ro, rd, tmax, 110, 0.0007);
  vec3 col = sky(rd);
  if (hit.x > 0.0) {
    vec3 p = ro + rd * hit.x, n = castNormal(p);
    float s = uMode > 0.5 && uMode < 1.5 ? max(1.0, boxScale(p)) : 1.0;
    col = light(p, n, rd, hit.y, hit.x) + surfaceEmit(p, hit.y, s);
    // glossy floor / glass: one reflection bounce
    bool floorish = abs(hit.y - M_TILE) < 0.01 && n.y > 0.5;
    bool glass = abs(hit.y - M_SCREEN) < 0.01;
    if (floorish || glass) {
      float fr = pow(1.0 - max(dot(n, -rd), 0.0), 4.0);
      float k = glass ? mix(0.05, 0.6, fr) : mix(0.1, 0.65, fr);
      if (floorish && boxScale(p) < 0.0) k = mix(0.2, 0.8, fr);
      vec3 r = reflect(rd, n);
      vec3 ro2 = p + n * 0.003 * s;
      vec2 h2 = march(ro2, r, 14.0 * s, 48, 0.003);
      vec3 rc = envC(r);
      if (h2.x > 0.0) {
        vec3 q = ro2 + r * h2.x; vec3 n2 = castNormal(q);
        float rough; vec3 em; vec4 ma = matAt(h2.y, q, n2, rough, em);
        vec3 amb = mix(C_INK * 0.6, C_LILAC * 0.6, n2.y * 0.5 + 0.5) * (0.3 + 0.7 * uLights);
        if (uMode > 2.5) amb = mix(amb, vec3(0.03, 0.04, 0.09), smoothstep(uEdgeZ + 1.0, uEdgeZ - 1.0, q.z));
        rc = ma.rgb * (amb * 0.4 + max(dot(n2, keyDir(q)), 0.0) * 0.9 * keySpot(q) * uLights) + em + surfaceEmit(q, h2.y, uMode > 0.5 && uMode < 1.5 ? max(1.0, boxScale(q)) : 1.0);
      }
      col = mix(col, rc, k);
    }
    if (uMode < 2.5) col = mix(col, sky(rd), smoothstep(40.0, 120.0, hit.x) * (uMode > 0.5 && uMode < 1.5 ? 0.0 : 1.0));
  }
  col *= mix(1.0, 1.0, uLights);
  col += vec3(1.0, 0.98, 0.94) * uFlash;
  fragColor = vec4(col, 1.0);
}
`;
