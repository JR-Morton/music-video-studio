// GLSL for the `string` plate (verse 3): one fragment shader per shot. Shared: camera, night sky, cloud sea, a march
// that also accumulates anti-aliased string coverage (strings are too thin to sphere-trace), and shading helpers.
import { GLSL_CAST_SDF, GLSL_CAST_SHADE } from './_cast';

/** Uniforms + helpers every 3D shot shares (before the cast SDF). */
const HEAD = /* glsl */ `
uniform float t, fl, roll, pxA, yk;
uniform vec3 ro, ta;
#define MAT_BULB 13.0
#define MAT_VAULT 15.0
vec3 camRay(vec2 uv) {
  vec3 fw = normalize(ta - ro), rt = normalize(cross(fw, vec3(0, 1, 0))), up = cross(rt, fw);
  float c = cos(roll), s = sin(roll);
  vec3 r2 = rt * c + up * s, u2 = -rt * s + up * c;
  return normalize(fw * fl + r2 * uv.x + u2 * uv.y);
}
vec2 scrUV() { return (vUv - 0.5) * vec2(16.0 / 9.0, 1.0); }
vec3 nightSky(vec3 rd) {
  float h = rd.y;
  vec3 c = mix(C_INK * 0.7, C_INK2 * 1.5 + vec3(0.0, 0.004, 0.018), smoothstep(-0.05, 0.6, h));
  c += C_BRASS * 0.035 * exp(-abs(h - 0.02) * 9.0);
  vec3 d = rd * 120.0; vec3 id = floor(d); float hs = hash13(id);
  float st = step(0.992, hs) * smoothstep(0.35, 0.0, length(fract(d) - 0.5)) * smoothstep(0.05, 0.3, h);
  c += vec3(0.75, 0.8, 1.0) * st * (0.4 + 0.8 * fract(hs * 91.7));
  return c;
}
// a moonlit / lamp-lit sea of cloud at height y0, seen from above (the gallery floats over it)
vec3 cloudSea(vec3 ro, vec3 rd, float y0, float zLamp, vec3 sky) {
  if (rd.y > -0.002) return sky;
  float t0 = (y0 - ro.y) / rd.y;
  vec3 p = ro + rd * t0;
  vec2 q = p.xz * vec2(0.32, 0.5) + vec2(t * 0.035, 0.0);
  float d = fbm(q, 4) * 0.5 + 0.5;
  float d2 = fbm(q * 2.7 + 3.1, 2) * 0.5 + 0.5;
  float hgt = d * 0.75 + d2 * 0.25;
  vec3 c = mix(C_INK2 * 0.7, C_ASH * 0.16 + C_LILAC * 0.07, smoothstep(0.3, 0.85, hgt));
  c += C_BONE * 0.05 * smoothstep(0.62, 0.95, hgt);
  c += C_BRASS * 0.22 * exp(-abs(p.z - zLamp) * 0.9) * smoothstep(0.25, 0.85, hgt);
  return mix(c, sky, 1.0 - exp(-t0 * 0.03));
}
`;

/** Our march: returns the hit and the strongest string coverage in front of it (pixel-footprint AA). */
const MARCH = /* glsl */ `
struct Hit { float t; float m; float sc; float st; };
Hit marchS(vec3 ro, vec3 rd, float tmax, float rStr) {
  Hit H; H.t = -1.0; H.m = 0.0; H.sc = 0.0; H.st = 0.0;
  float t = 0.02;
  for (int i = 0; i < 140; i++) {
    vec3 p = ro + rd * t;
    vec2 h = map(p);
    float s = strDist(p);
    float pw = t * pxA;
    float w = max(2.0 * rStr, 1.3 * pw);
    float inten = pow(min(1.0, 2.0 * rStr / (1.3 * pw)), 0.45);
    float cov = clamp((0.5 * w + 0.5 * pw - s) / pw, 0.0, 1.0) * inten;
    if (cov > H.sc) { H.sc = cov; H.st = t; }
    if (h.x < 0.0003 * t + 0.0002) { H.t = t; H.m = h.y; return H; }
    t += min(h.x * 0.9, max(s, pw * 0.6));
    if (t > tmax) break;
  }
  return H;
}
vec3 shadeM(vec3 p, vec3 pm, vec3 n, vec3 rd, float m, StageLight key, StageLight fill, StageLight rim) {
  float rough; vec3 emit;
  vec4 mat = castMaterial(m, pm, rough, emit);
  float ao = castAO(p, n);
  vec3 c = cs_light(key, p, n, rd, mat.rgb, mat.a, rough, true);
  c += cs_light(fill, p, n, rd, mat.rgb, mat.a, rough, false) * ao;
  c += cs_light(rim, p, n, rd, mat.rgb, mat.a, rough, false) * 0.8;
  vec3 r = reflect(rd, n);
  vec3 env = mix(C_INK * 0.6, C_LILAC * 0.25, smoothstep(-0.2, 0.8, r.y));
  c += env * mix(0.12 * (1.0 - mat.a), 0.8 * mat.a, 1.0) * ao * mix(mat.rgb, vec3(1.0), 1.0 - mat.a);
  return c + emit;
}
vec3 shadeAll(vec3 p, vec3 n, vec3 rd, float m, StageLight key, StageLight fill, StageLight rim) {
  if (floor(m + 0.001) == MAT_BULB) return mix(C_BRASS, C_EMBER, 0.55) * 5.0;
  vec3 c = stageShade(p, n, rd, m, key, fill, rim);
  if (floor(m + 0.001) == MAT_BRASS) c += C_BRASS * (0.12 + 0.35 * pow(max(n.y, 0.0), 2.0));
  return c;
}
`;

const pre = (decl: string, map: string) => `${HEAD}\n${decl}\n${GLSL_CAST_SDF}\n${map}\n${GLSL_CAST_SHADE}\n${MARCH}\n`;

// ============================================================================ shot A: the thread, extreme close-up
// Analytic 2D (a lit 3-ply cord in a dark void, bokeh of far strings). Cheap, full resolution.
export const SHOT_A = /* glsl */ `
uniform float t, cx, w0, sway, twA, twS, slide, glintY, glintA, bgx, lightUp, pinch, pinchY;
void main() {
  vec2 P = vUv * vec2(1920.0, 1080.0);
  vec3 col = C_INK * 0.28;
  float pool = exp(-pow(length((P - vec2(560.0, 700.0)) * vec2(0.8, 1.0)) / 820.0, 2.0));
  col += mix(C_INK2 * 0.55, C_LILAC * 0.06, 0.3) * pool;
  // far strings, out of focus (every line in the film was a string)
  for (int i = 0; i < 9; i++) {
    float fi = float(i);
    float x = mod(hash11(fi * 3.1 + 0.3) * 2600.0 + bgx * (0.35 + hash11(fi + 0.7) * 0.8), 2600.0) - 340.0;
    float bw = 10.0 + hash11(fi + 7.0) * 34.0;
    float a = exp(-pow((P.x - x) / bw, 2.0)) * (0.015 + 0.03 * hash11(fi + 2.0)) * (0.5 + 0.5 * smoothstep(0.0, 1080.0, P.y));
    col += C_ASH * a * (1.0 + lightUp * 4.0);
  }
  float yy = P.y;
  float xc = cx + sway * sin(yy * 0.0023 + t * 0.9) + twA * sin(yy / 1080.0 * 3.14159 * 2.0 + 0.4) * sin(twS * 48.0) * exp(-twS * 3.2);
  // the grip: the frame takes hold at pinchY, squeezing the cord
  float pg = exp(-pow((yy - pinchY) / 70.0, 2.0));
  float w = w0 * (1.0 - 0.3 * pinch * pg);
  float dx = P.x - xc;
  float cov = clamp(w * 0.5 - abs(dx) + 0.5, 0.0, 1.0);
  col += C_BONE * (0.035 + 0.06 * lightUp) * exp(-abs(dx) / (w * 1.4));
  if (cov > 0.0) {
    float uu = clamp(dx / (w * 0.5), -0.999, 0.999);
    vec3 n = vec3(uu, 0.0, sqrt(1.0 - uu * uu));
    float ph = (yy + slide) / (w * 0.95) + asin(uu) / 3.14159 * 0.85;
    float ply = fract(ph);
    float groove = smoothstep(0.0, 0.22, ply) * smoothstep(1.0, 0.78, ply);
    n.y += (ply - 0.5) * 0.9; n = normalize(n);
    float fib = 0.82 + 0.18 * snoise(vec2(uu * 5.0 + ply * 3.0, (yy + slide) * 0.35 / max(w, 1.0) * 8.0));
    vec3 L = normalize(vec3(-0.55, 0.65, 0.55));
    float dif = max(dot(n, L), 0.0);
    float spec = pow(max(dot(n, normalize(L + vec3(0, 0, 1))), 0.0), 36.0);
    vec3 tc = C_BONE * (0.05 + 0.85 * dif) * mix(0.3, 1.0, groove) * fib + vec3(1.0, 0.97, 0.9) * spec * 0.7 * groove;
    tc *= 0.9 + lightUp * 0.9;
    tc *= 1.0 - 0.55 * pinch * (exp(-pow((yy - pinchY - 78.0) / 16.0, 2.0)) + exp(-pow((yy - pinchY + 78.0) / 16.0, 2.0)));
    tc += C_BONE * pinch * 0.5 * pg * (0.3 + dif);
    tc += C_BONE * glintA * exp(-pow((yy - glintY) / 90.0, 2.0)) * 2.2 * (0.4 + 0.6 * dif);
    col = mix(col, tc, cov);
  }
  fragColor = vec4(col, 1.0);
}`;

// ============================================================================ shot B: every string lights up; climb
// A field of vertical strings (xz grid DDA, analytic coverage) under a cloud ceiling; the camera climbs ours.
export const SHOT_B = /* glsl */ `
uniform float t, fl, roll, pxA, litR, cloudB, mist;
uniform vec3 ro, ta;
vec3 camRay(vec2 uv) {
  vec3 fw = normalize(ta - ro), rt = normalize(cross(fw, vec3(0, 1, 0))), up = cross(rt, fw);
  float c = cos(roll), s = sin(roll);
  vec3 r2 = rt * c + up * s, u2 = -rt * s + up * c;
  return normalize(fw * fl + r2 * uv.x + u2 * uv.y);
}
float dens(vec3 p) {
  float base = smoothstep(cloudB, cloudB + 1.2, p.y) * (1.0 - smoothstep(cloudB + 3.0, cloudB + 4.0, p.y));
  float n = fbm(p * vec3(0.12, 0.25, 0.12) + vec3(t * 0.03, 0.0, 0.0), 3) * 0.5 + 0.5;
  // a clear shaft straight above our string (the gap the camera climbs through)
  float gap = smoothstep(1.0, 3.2, length(p.xz));
  return clamp(base * (n * 2.2 - 0.7) * mix(0.25, 1.0, gap), 0.0, 1.0);
}
void main() {
  vec2 uv = (vUv - 0.5) * vec2(16.0 / 9.0, 1.0);
  vec3 rd = camRay(uv - vec2(0.22, 0.0));
  // backdrop: dusk town sky below the cloud (navy -> lilac haze at the horizon)
  vec3 sky = mix(C_LILAC * 0.06 + C_INK2 * 0.35, C_INK * 0.5, smoothstep(0.0, 0.4, rd.y));
  // beyond the gap: the night above the clouds, a brass glow where the gallery is
  sky += (C_BRASS * 0.35 + C_BONE * 0.05) * smoothstep(0.93, 1.0, rd.y);
  vec3 col = sky;
  float tGround = rd.y < 0.0 ? -ro.y / rd.y : 1e9;
  if (rd.y < 0.0) {
    vec3 gp = ro + rd * tGround;
    float win = step(0.93, hash12(floor(gp.xz * 1.5))) * 0.6;
    vec3 g = C_INK * 0.6 + C_BRASS * win * 0.25;
    col = mix(g, sky, 1.0 - exp(-tGround * 0.03));
  }
  // cloud ceiling: short volumetric march through the slab
  float tc0 = -1.0, tc1 = -1.0;
  if (ro.y < cloudB) { if (rd.y > 0.0) { tc0 = (cloudB - ro.y) / rd.y; tc1 = (cloudB + 4.0 - ro.y) / rd.y; } }
  else { tc0 = 0.0; tc1 = rd.y > 0.0 ? (cloudB + 4.0 - ro.y) / rd.y : (rd.y < 0.0 ? (cloudB - ro.y) / rd.y : 20.0); }
  vec4 cl = vec4(0.0);
  if (tc0 >= 0.0) {
    float len = min(tc1 - tc0, 30.0);
    for (int i = 0; i < 12; i++) {
      float s = tc0 + (float(i) + 0.5) / 12.0 * len;
      vec3 p = ro + rd * s;
      float d = dens(p) * len / 12.0 * 0.7;
      float lightH = smoothstep(cloudB, cloudB + 4.0, p.y);
      float hi = smoothstep(0.45, 0.8, fbm(p.xz * 0.2 + 7.0, 2) * 0.5 + 0.5);
      vec3 cc = mix(C_INK * 0.7, C_INK2 * 0.8 + C_LILAC * 0.06, clamp(lightH * 0.5 + hi * 0.7, 0.0, 1.0));
      cc += (C_BRASS * 0.5 + C_BONE * 0.08) * exp(-length(p.xz) / 2.2) * lightH;
      float a = 1.0 - exp(-d * 1.6);
      cl.rgb += (1.0 - cl.a) * cc * a; cl.a += (1.0 - cl.a) * a;
    }
  }
  // strings: DDA over the xz grid, front to back
  vec4 acc = vec4(0.0);
  vec2 o = ro.xz; vec2 d2 = rd.xz; float hl = length(d2);
  if (hl > 1e-4) {
    vec2 dn = d2 / hl;
    const float S = 1.9;
    vec2 cell = floor(o / S + 0.5);
    vec2 stp = sign(dn);
    vec2 tDelta = abs(S / dn);
    vec2 tMax = ((cell + 0.5 * stp) * S - o) / dn;
    for (int i = 0; i < 44; i++) {
      vec2 c = cell * S;
      if (dot(cell, cell) > 0.0) c += (hash22(cell) - 0.5) * S * 0.75;
      vec2 oc = c - o;
      float th = dot(oc, dn);
      if (th > 0.0) {
        float tt = th / hl;
        float y = ro.y + rd.y * tt;
        if (tt < tGround && y < cloudB + 2.5) {
          float dist = abs(oc.x * dn.y - oc.y * dn.x);
          float r = dot(cell, cell) > 0.0 ? 0.0028 : 0.004;
          float pw = tt * pxA;
          float w = max(2.0 * r, 1.3 * pw);
          float inten = pow(min(1.0, 2.0 * r / (1.3 * pw)), 0.45);
          float cov = clamp((0.5 * w + 0.5 * pw - dist) / pw, 0.0, 1.0) * inten;
          float cd = length(c);
          float lit = smoothstep(litR, litR - 3.0, cd);
          float fade = (1.0 - smoothstep(cloudB, cloudB + 2.5, y)) * exp(-tt * 0.012);
          float uu = clamp(dist / max(r, 1e-5), 0.0, 1.0);
          vec3 sc = mix(C_GRAPHITE * 0.7, C_BONE * (1.0 + 0.6 * (1.0 - uu * uu)), lit);
          // light runs up each lit string as the veil lifts
          sc += C_BONE * lit * 1.2 * exp(-pow((y - (litR * 0.6 - cd * 0.6 + 1.0)) * 0.35, 2.0));
          if (dot(cell, cell) == 0.0) sc *= 1.25;
          float a = cov * fade;
          float halo = lit * fade * 0.05 * exp(-dist / max(pw * 2.5, 0.01)) * (1.0 - acc.a);
          acc.rgb += (1.0 - acc.a) * sc * a + C_BONE * halo;
          acc.a += (1.0 - acc.a) * a;
          if (acc.a > 0.98) break;
        }
      }
      if (min(tMax.x, tMax.y) / hl > 70.0) break;
      if (tMax.x < tMax.y) { tMax.x += tDelta.x; cell.x += stp.x; } else { tMax.y += tDelta.y; cell.y += stp.y; }
    }
  }
  // composite: sky/ground, cloud over it, strings in front of the cloud base (attenuated inside)
  col = col * (1.0 - cl.a) + cl.rgb;
  col = col * (1.0 - acc.a) + acc.rgb * (1.0 - cl.a * 0.5);
  // mist whiteout as we enter the cloud
  vec3 mc = mix(C_INK2 * 0.9 + C_LILAC * 0.1, C_LILAC * 0.3 + C_BONE * 0.2, 0.5 + 0.5 * fbm(uv * 1.6 + vec2(0.0, -t * 0.9), 3));
  col = mix(col, mc, mist);
  // our string stays on top: it leads the climb into the cloud
  vec3 fw = normalize(ta - ro);
  vec2 oc = -ro.xz; float hl2 = length(rd.xz);
  if (hl2 > 1e-4) {
    vec2 dn = rd.xz / hl2; float th = dot(oc, dn); float tt = th / hl2;
    if (th > 0.0) {
      float dist = abs(oc.x * dn.y - oc.y * dn.x); float pw = tt * pxA;
      float cov = clamp((0.5 * max(0.008, 1.3 * pw) + 0.5 * pw - dist) / pw, 0.0, 1.0) * pow(min(1.0, 0.008 / (1.3 * pw)), 0.45);
      col = mix(col, C_BONE * 1.6, cov * mist);
      col += C_BONE * 0.12 * mist * exp(-dist / max(pw * 6.0, 0.01));
    }
  }
  fragColor = vec4(col, 1.0);
}`;

// ============================================================================ shot C1: the gallery of hands; cheques
export const SHOT_C1 = pre(/* glsl */ `
uniform vec4 chq0, chq1, chq2; // cheque xyz + flip angle
uniform float mist;
const float SP = 0.8, HY = 1.5;
`, /* glsl */ `
float handIdx(float x) { return clamp(floor(x / SP + 0.5), -7.0, 7.0); }
float nearCheque(float hx) {
  float m = 0.0;
  m = max(m, exp(-pow((chq0.x - hx) / 0.1, 2.0)));
  m = max(m, exp(-pow((chq1.x - hx) / 0.1, 2.0)));
  m = max(m, exp(-pow((chq2.x - hx) / 0.1, 2.0)));
  return m;
}
float handLift(float i) { return yk * (0.03 + 0.04 * hash11(i + 3.0)); }
vec2 cheque(vec3 p, vec4 c) {
  vec3 q = (p - c.xyz) / 1.3;
  q.yz = cs_rot(c.w) * q.yz;
  vec2 r = vec2(cs_box(q, vec3(0.075, 0.034, 0.0012), 0.001), MAT_PAPER);
  float fr = max(cs_box(q, vec3(0.071, 0.030, 0.0026), 0.001), -cs_box(q, vec3(0.064, 0.024, 0.01), 0.0));
  r = opU(r, vec2(fr, MAT_BRASS));
  r = opU(r, vec2(cs_cyl((q - vec3(0.042, -0.004, 0.0)).xzy, 0.0032, 0.013), MAT_BRASS));
  r = opU(r, vec2(cs_box(q - vec3(-0.02, 0.008, 0.0), vec3(0.03, 0.0022, 0.0022), 0.0005), MAT_BRASS));
  r = opU(r, vec2(cs_box(q - vec3(-0.012, -0.008, 0.0), vec3(0.038, 0.0016, 0.0019), 0.0005), MAT_BRASS));
  r.x *= 1.3;
  return r;
}
vec2 map(vec3 p) {
  vec2 r = vec2(1e9, 0.0);
  float i = handIdx(p.x);
  vec3 q = p - vec3(i * SP, HY + handLift(i), 0.03 * sin(i * 2.3));
  if (length(q - vec3(0.0, 0.3, 0.0)) < 1.4 || q.y > 0.0) {
    r = opU(r, sdHand(q, 0.35 + 0.65 * nearCheque(i * SP), 0.0));
    r = opU(r, vec2(cs_cap(q, vec3(0.0, 0.15, 0.0), vec3(0.0, 3.0, -0.9), 0.052), MAT_CLOTH));
    vec3 cq = q - vec3(0.0, -0.165, 0.0);
    cq.xy = cs_rot(0.12 * sin(i * 1.7 + yk * 1.5)) * cq.xy;
    r = opU(r, vec2(cs_box(cq, vec3(0.15, 0.011, 0.011), 0.004), MAT_WOOD));
    r = opU(r, vec2(cs_box(cq - vec3(0.0, 0.0, -0.08), vec3(0.011, 0.01, 0.085), 0.004), MAT_WOOD));
  }
  // the gallery rail behind (brass) with marquee bulbs
  vec3 rp = p - vec3(0.0, 1.02, -0.85);
  r = opU(r, vec2(length(rp.yz) - 0.022, MAT_BRASS));
  vec3 bp = rp - vec3(0.0, 0.06, 0.0); bp.x = mod(bp.x + 0.2, 0.4) - 0.2;
  r = opU(r, vec2(length(bp) - 0.02, MAT_BULB));
  vec3 pp = p - vec3(0.0, 0.5, -0.85); pp.x = mod(pp.x + 0.8, 1.6) - 0.8;
  r = opU(r, vec2(cs_cap(pp, vec3(0.0, -0.8, 0.0), vec3(0.0, 0.52, 0.0), 0.016), MAT_BRASS));
  r = opU(r, cheque(p, chq0)); r = opU(r, cheque(p, chq1)); r = opU(r, cheque(p, chq2));
  return r;
}
float strDist(vec3 p) {
  float i = handIdx(p.x);
  vec3 q = p - vec3(i * SP, HY + handLift(i), 0.03 * sin(i * 2.3));
  vec3 cq = q - vec3(0.0, -0.165, 0.0);
  cq.xy = cs_rot(0.12 * sin(i * 1.7 + yk * 1.5)) * cq.xy;
  if (cq.y > 0.0) return length(cq) + 0.01;
  float d = length(cq.xz - vec2(0.14, 0.0));
  d = min(d, length(cq.xz - vec2(-0.14, 0.0)));
  d = min(d, length(cq.xz - vec2(0.0, -0.16)));
  return d;
}`) + /* glsl */ `
void main() {
  vec2 uv = scrUV();
  vec3 rd = camRay(uv);
  vec3 sky = nightSky(rd);
  vec3 col = cloudSea(ro, rd, 0.0, -0.85, sky);
  StageLight key = StageLight(vec3(1.6, 4.2, 2.8), normalize(vec3(-1.4, -2.8, -2.8)), mix(C_BRASS, vec3(1.0), 0.5) * 3.6, 0.9);
  StageLight fill = StageLight(vec3(-3.0, 1.5, 3.0), vec3(0.0), C_LILAC * 0.35 + C_INK2, -1.0);
  StageLight rim = StageLight(vec3(0.0, 1.3, -1.4), vec3(0.0), C_BRASS * 0.9, -1.0);
  Hit H = marchS(ro, rd, 30.0, 0.0022);
  float tHit = 1e9;
  if (H.t > 0.0) {
    vec3 p = ro + rd * H.t, n = castNormal(p);
    vec3 c = shadeAll(p, n, rd, H.m, key, fill, rim);
    col = mix(c, col, 1.0 - exp(-H.t * 0.04));
    tHit = H.t;
  }
  if (H.sc > 0.0 && H.st < tHit) {
    vec3 sp = ro + rd * H.st;
    float lit = 0.55 + 0.45 * smoothstep(-0.5, 1.2, sp.y);
    col = mix(col, C_BONE * 0.9 * lit, H.sc * smoothstep(-0.2, 0.3, sp.y));
  }
  vec3 mc = mix(C_LILAC * 0.28, C_BONE * 0.5, 0.5 + 0.5 * snoise(uv * 1.7 + vec2(t * 0.3, t * 0.5)));
  col = mix(col, mc, mist * (0.75 + 0.25 * snoise(uv * 3.0 - t)));
  fragColor = vec4(col, 1.0);
}`;

// ============================================================================ shot C2: the front row (the voices)
export const SHOT_C2 = pre(/* glsl */ `
const float SX = 0.85, HANDY = 3.35;
`, /* glsl */ `
float seatIdx(float x) { return clamp(floor(x / SX + 0.5), -6.0, 6.0); }
float lf(float i) { return yk * (0.6 + 0.4 * hash11(i * 1.3 + 0.2)); }
vec4 limbsOf(float i) { float y = lf(i); return vec4(0.25 + 1.3 * y + 0.1 * hash11(i), 0.3 + 1.2 * y, 1.3, 1.25 + 0.1 * hash11(i + 5.0)); }
vec3 headOf(float i) { float y = lf(i); return vec3(0.08 * sin(i * 3.7), 0.25 * sin(i * 2.1), 0.12 - 0.35 * y); }
vec2 map(vec3 p) {
  vec2 r = vec2(p.y, MAT_FLOOR);
  float i = seatIdx(p.x);
  vec3 q = p - vec3(i * SX, 0.0, 0.0);
  // the seat: velvet (navy pinstripe cloth), brass arm caps
  r = opU(r, vec2(cs_box(q - vec3(0.0, 0.44, 0.02), vec3(0.3, 0.07, 0.25), 0.05), MAT_CLOTH));
  r = opU(r, vec2(cs_box(q - vec3(0.0, 0.92, -0.26), vec3(0.3, 0.44, 0.06), 0.06), MAT_CLOTH));
  r = opU(r, vec2(cs_box(q - vec3(0.0, 0.18, -0.05), vec3(0.22, 0.18, 0.18), 0.02), MAT_FLOOR));
  vec3 aq = q - vec3(SX * 0.5, 0.64, 0.0);
  aq.x = aq.x < -SX * 0.5 ? aq.x + SX : aq.x;
  r = opU(r, vec2(cs_box(aq, vec3(0.035, 0.02, 0.24), 0.018), MAT_BRASS));
  r = opU(r, vec2(cs_box(aq - vec3(0.0, -0.32, -0.05), vec3(0.03, 0.3, 0.03), 0.01), MAT_FLOOR));
  // the voice, seated, yanked on the beat
  vec4 L = limbsOf(i); vec3 hd = headOf(i);
  float lift = lf(i) * 0.05;
  r = opU(r, sdMarionette(q - vec3(0.0, -0.36 + lift, 0.06), L, hd, mod(i + 7.0, 3.0)));
  // the hand above, holding the cross
  vec3 hq = q - vec3(0.0, HANDY + lf(i) * 0.06, 0.1);
  r = opU(r, sdHand(hq, 0.6, 0.0));
  r = opU(r, vec2(cs_cap(hq, vec3(0.0, 0.15, 0.0), vec3(0.0, 2.0, -0.6), 0.052), MAT_CLOTH));
  vec3 cq = hq - vec3(0.0, -0.165, 0.0);
  r = opU(r, vec2(cs_box(cq, vec3(0.2, 0.011, 0.011), 0.004), MAT_WOOD));
  r = opU(r, vec2(cs_box(cq - vec3(0.0, 0.0, 0.0), vec3(0.011, 0.01, 0.1), 0.004), MAT_WOOD));
  return r;
}
float strDist(vec3 p) {
  float i = seatIdx(p.x);
  vec3 q = p - vec3(i * SX, 0.0, 0.0);
  vec4 L = limbsOf(i); vec3 hd = headOf(i);
  vec3 off = vec3(0.0, -0.36 + lf(i) * 0.05, 0.06);
  vec3 top = vec3(0.0, HANDY + lf(i) * 0.06 - 0.165, 0.1);
  float d = sdString(q, marionetteAnchor(0, L, hd) + off, top + vec3(0.0, 0.0, 0.1));
  d = min(d, sdString(q, marionetteAnchor(1, L, hd) + off, top + vec3(-0.19, 0.0, 0.0)));
  d = min(d, sdString(q, marionetteAnchor(2, L, hd) + off, top + vec3(0.19, 0.0, 0.0)));
  return d + 0.002;
}`) + /* glsl */ `
void main() {
  vec2 uv = scrUV();
  vec3 rd = camRay(uv);
  vec3 col = C_INK * 0.35 + C_INK2 * 0.3 * smoothstep(0.0, 0.6, rd.y);
  StageLight key = StageLight(vec3(0.8, 5.5, 5.0), normalize(vec3(-0.8, -4.5, -5.0)), mix(C_BRASS, vec3(1.0), 0.5) * 3.8, 0.88);
  StageLight fill = StageLight(vec3(-3.0, 1.0, 4.0), vec3(0.0), C_LILAC * 0.3 + C_INK2, -1.0);
  StageLight rim = StageLight(vec3(0.0, 4.0, -2.5), vec3(0.0), C_BRASS * 1.1, -1.0);
  Hit H = marchS(ro, rd, 25.0, 0.0022);
  float tHit = 1e9;
  if (H.t > 0.0) {
    vec3 p = ro + rd * H.t, n = castNormal(p);
    vec3 c = shadeAll(p, n, rd, H.m, key, fill, rim);
    // footlight wash along the row
    c += C_BRASS * 0.05 * smoothstep(1.2, 0.0, p.y) * smoothstep(-1.0, 0.5, p.z);
    col = mix(c, col, 1.0 - exp(-H.t * 0.05));
    tHit = H.t;
  }
  if (H.sc > 0.0 && H.st < tHit) col = mix(col, C_BONE, H.sc * 0.9);
  fragColor = vec4(col, 1.0);
}`;

// ============================================================================ shot D1: referees wear badges
export const SHOT_D1 = pre(/* glsl */ `
uniform vec4 bdg[5]; // badge xyz + swing angle, per referee
const float RX = 0.78, RHY = 2.32;
`, /* glsl */ `
float refIdx(float x) { return clamp(floor(x / RX + 0.5), -2.0, 2.0); }
vec4 bdgOf(float i) { int k = int(i + 2.5); return k == 0 ? bdg[0] : k == 1 ? bdg[1] : k == 2 ? bdg[2] : k == 3 ? bdg[3] : bdg[4]; }
float sdStar(vec2 p, float r, float rf) {
  const vec2 k1 = vec2(0.809016994375, -0.587785252292);
  const vec2 k2 = vec2(-k1.x, k1.y);
  p.x = abs(p.x);
  p -= 2.0 * max(dot(k1, p), 0.0) * k1;
  p -= 2.0 * max(dot(k2, p), 0.0) * k2;
  p.x = abs(p.x);
  p.y -= r;
  vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0, 1);
  float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}
vec2 badge(vec3 p, vec4 b) {
  vec3 q = p - b.xyz; q.xy = cs_rot(b.w) * q.xy; q.yz = cs_rot(-0.35) * q.yz;
  float s = sdStar(q.xy, 0.075, 0.45);
  float d = max(s + 0.004, abs(q.z) - 0.005) - 0.003;
  vec2 r = vec2(d, MAT_BRASS);
  r = opU(r, vec2(length(q - vec3(0.0, 0.0, 0.009)) - 0.014, MAT_BRASS));
  return r;
}
vec4 refLimbs(float i) { float y = yk * (0.5 + 0.5 * hash11(i + 9.0)); return vec4(0.12 + 0.5 * y, -0.1 - 0.4 * y, 0.08 * y, -0.06); }
vec3 refHead(float i) { return vec3(0.05 * sin(i * 2.9), 0.18 * sin(i * 1.9), 0.06 - 0.15 * yk); }
vec2 map(vec3 p) {
  vec2 r = vec2(p.y, MAT_FLOOR);
  float i = refIdx(p.x);
  vec3 q = p - vec3(i * RX, 0.0, -0.2 * abs(i));
  float lift = yk * 0.04;
  vec3 mq = q - vec3(0.0, lift, 0.0);
  vec4 L = refLimbs(i); vec3 hd = refHead(i);
  r = opU(r, sdMarionette(mq, L, hd, 1.0));
  // referee shirt: a striped shell over the torso (white / navy vertical stripes)
  float sh = cs_ell(mq - vec3(0.0, 1.2, 0.0), vec3(0.185, 0.275, 0.125));
  sh = max(sh, mq.y - 1.44);
  float stripe = step(0.5, fract(mq.x * 11.0 + 0.25));
  r = opU(r, vec2(sh, stripe > 0.5 ? MAT_PORCELAIN : MAT_FLOOR));
  // the hand above
  vec3 hq = q - vec3(0.0, RHY + yk * 0.05, 0.05);
  r = opU(r, sdHand(hq, 0.75, 0.0));
  r = opU(r, vec2(cs_cap(hq, vec3(0.0, 0.15, 0.0), vec3(0.0, 2.0, -0.7), 0.052), MAT_CLOTH));
  vec3 cq = hq - vec3(0.0, -0.165, 0.0);
  r = opU(r, vec2(cs_box(cq, vec3(0.2, 0.011, 0.011), 0.004), MAT_WOOD));
  r = opU(r, badge(p, bdgOf(i)));
  return r;
}
float strDist(vec3 p) {
  float i = refIdx(p.x);
  vec3 q = p - vec3(i * RX, 0.0, -0.2 * abs(i));
  vec4 L = refLimbs(i); vec3 hd = refHead(i);
  vec3 off = vec3(0.0, yk * 0.04, 0.0);
  vec3 top = vec3(0.0, RHY + yk * 0.05 - 0.165, 0.05);
  float d = sdString(q, marionetteAnchor(0, L, hd) + off, top);
  d = min(d, sdString(q, marionetteAnchor(1, L, hd) + off, top + vec3(-0.19, 0.0, 0.0)));
  d = min(d, sdString(q, marionetteAnchor(2, L, hd) + off, top + vec3(0.19, 0.0, 0.0)));
  // the lanyard: a V from the badge's shoulders up to a knot, then one line to the fingers
  vec4 b = bdgOf(i);
  vec3 bl = b.xyz - vec3(i * RX, 0.0, -0.2 * abs(i));
  vec3 knot = bl + vec3(0.0, 0.2, -0.02);
  d = min(d, sdString(q, bl + vec3(-0.04, 0.03, 0.0), knot));
  d = min(d, sdString(q, bl + vec3(0.04, 0.03, 0.0), knot));
  d = min(d, sdString(q, knot, top + vec3(0.0, 0.03, 0.03)));
  return d + 0.002;
}`) + /* glsl */ `
void main() {
  vec2 uv = scrUV();
  vec3 rd = camRay(uv);
  vec3 col = C_INK * 0.4 + C_INK2 * 0.5 * smoothstep(-0.2, 0.5, rd.y);
  StageLight key = StageLight(vec3(-1.2, 4.8, 3.2), normalize(vec3(1.2, -3.4, -3.3)), mix(C_BRASS, vec3(1.0), 0.5) * 3.8, 0.9);
  StageLight fill = StageLight(vec3(3.0, 1.5, 3.0), vec3(0.0), C_LILAC * 0.28 + C_INK2, -1.0);
  StageLight rim = StageLight(vec3(0.5, 3.0, -2.5), vec3(0.0), C_BRASS * 1.1, -1.0);
  Hit H = marchS(ro, rd, 25.0, 0.0022);
  float tHit = 1e9;
  if (H.t > 0.0) {
    vec3 p = ro + rd * H.t, n = castNormal(p);
    vec3 c = shadeAll(p, n, rd, H.m, key, fill, rim);
    c *= mix(0.12, 1.0, smoothstep(0.85, 1.25, p.y));
    col = mix(c, col, 1.0 - exp(-H.t * 0.05));
    tHit = H.t;
  }
  if (H.sc > 0.0 && H.st < tHit) col = mix(col, C_BONE * 0.95, H.sc * 0.9);
  fragColor = vec4(col, 1.0);
}`;

// ============================================================================ shot D2: two cuffed hands shake
// A real two-right-hands grip, point-symmetric about the vertical through the grip centre: hand A (from -x) is built
// in its own frame; hand B is A rotated 180 degrees about y. Palms face each other across the contact plane z = 0 with
// a small gap; the hands bend down at the wrist so the thumb webs meet at the top; each hand's fingers pass behind the
// other's palm, clear its little-finger edge and curl round that edge (never into it); each thumb rises outside the
// other's index edge and lies across the back of that hand. Finger lengths adapt to where the other hand's edge is.
export const SHOT_D2 = pre(/* glsl */ `
uniform vec3 gc;     // grip centre (world): both hands move with it, so the pump is rigid
uniform float gOff;  // extra x distance of each wrist from its grip position (the approach)
uniform float grip;  // 0 open .. 1 closed round the other hand
const float PITCH = 0.5;  // the hand bends down from the forearm at the wrist
const float YAW = 0.32;   // forearms come in from behind / in front of the contact plane
const float WX = 0.056;   // wrist distance from the grip centre along x when gripped
const float ZC = 0.017;   // palm-centre plane distance from the contact plane
const float GAP = 0.004;  // clearance kept between the two hands
`, /* glsl */ `
// grip-frame vector (relative to hand A's wrist) <-> hand-local (hangs -y, thumb +x, palm +z; sdHand's convention)
vec3 gToL(vec3 v) { float s = sin(PITCH), c = cos(PITCH); return vec3(v.x * s + v.y * c, v.y * s - v.x * c, v.z); }
vec3 lToG(vec3 l) { float s = sin(PITCH), c = cos(PITCH); return vec3(l.x * s - l.y * c, l.x * c + l.y * s, l.z); }
// a point in the OTHER hand's local palm plane, expressed in this hand's local frame
vec2 otherL(vec2 lb) { vec3 g = lToG(vec3(lb, 0.0)); return gToL(vec3(2.0 * (WX + gOff) - g.x, g.y, 0.0)).xy; }
// outward normal of the other hand's edge through local points a, b (away from its palm centre)
vec2 edgeN(vec2 a, vec2 b) { vec2 d = normalize(b - a); vec2 n = vec2(d.y, -d.x); return dot(n, a - otherL(vec2(0.0, -0.055))) < 0.0 ? -n : n; }
float chain(vec3 p, vec3 a, vec3 b, vec3 c, vec3 d, float r) {
  return min(min(cs_cone(p, a, b, r, r * 0.93), cs_cone(p, b, c, r * 0.93, r * 0.84)), cs_cone(p, c, d, r * 0.84, r * 0.74));
}
vec2 gripHand(vec3 q) {
  // ---- forearm: navy pinstripe sleeve, white cuff, brass cufflink (as sdHand), yawed back from the contact plane
  float cy = cos(YAW), sy = sin(YAW);
  vec3 f = vec3(q.y, -(q.x * cy + q.z * sy), -q.x * sy + q.z * cy);
  vec3 sq = f - vec3(0.0, 0.0, -0.002); sq.x *= 0.94;
  float sleeve = cs_cone(sq, vec3(0.0, 0.07, 0.0), vec3(0.0, 0.34, 0.0), 0.047, 0.056);
  sleeve = max(max(sleeve, f.y - 0.27), 0.058 - f.y);
  sleeve = min(sleeve, cs_cap(f, vec3(0.0, 0.2, 0.0), vec3(0.0, 1.5, 0.15), 0.056));
  vec2 res = vec2(sleeve, MAT_CLOTH);
  res = opU(res, vec2(cs_ell(vec3(f.x + 0.048, f.y - 0.085 - 0.015 * clamp(floor((f.y - 0.085) / 0.015 + 0.5), 0.0, 2.0), f.z), vec3(0.0025, 0.0055, 0.0055)), MAT_JOINT + 0.3));
  res = opU(res, vec2(cs_rcyl(f - vec3(0.0, 0.04, 0.0), 0.022, 0.039, 0.007), MAT_PAPER));
  vec3 lq = f - vec3(0.0, 0.039, 0.0); lq.xz = cs_rot(0.7) * lq.xz; lq.x -= 0.042;
  res = opU(res, vec2(cs_box(lq, vec3(0.0035, 0.0105, 0.0105), 0.004), MAT_BRASS));
  // ---- the hand, bent down at the wrist
  vec3 p = gToL(q);
  float bb = length(p - vec3(0.0, -0.075, 0.03)) - 0.15;
  if (bb > 0.02) return opU(res, vec2(bb, MAT_SKIN));
  float g1 = smoothstep(0.0, 0.45, grip), g2 = smoothstep(0.3, 1.0, grip);
  float h = cs_ell(p - vec3(0.0, 0.01, 0.0), vec3(0.03, 0.05, 0.022));
  vec3 pq = p - vec3(0.0, -0.05, 0.0);
  pq.z -= 0.18 * pq.x * pq.x - 0.004;
  h = cs_smin(h, cs_box(pq, vec3(0.036 + 0.05 * clamp(-pq.y, -0.04, 0.04), 0.046, 0.011), 0.011), 0.025);
  // the other hand's little-finger edge (fingers wrap it) and index edge (the thumb goes over it), in this frame
  const float EX = 0.05;                                   // palm half-width incl. rounding
  const float OZ = 2.0 * ZC + 0.004;                       // the other palm plate's centre plane
  vec2 e0 = otherL(vec2(-EX, -0.02)), e1 = otherL(vec2(-EX, -0.1)), en = edgeN(e0, e1);
  vec2 u0 = otherL(vec2(EX, -0.02)), u1 = otherL(vec2(EX, -0.1)), un = edgeN(u0, u1);
  // ---- fingers
  vec4 kx = vec4(0.027, 0.009, -0.009, -0.026);
  vec4 ky = vec4(-0.093, -0.097, -0.094, -0.086);
  float fing = 1e9;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec3 len = i == 0 ? vec3(0.044, 0.026, 0.021) : i == 1 ? vec3(0.048, 0.03, 0.022) : i == 2 ? vec3(0.045, 0.028, 0.021) : vec3(0.035, 0.021, 0.018);
    float r = i == 3 ? 0.0078 : i == 1 ? 0.009 : 0.0086;
    vec3 b = vec3(kx[i], ky[i], 0.002);
    // open: nearly flat (a hair of curl), splayed a little
    float sp = 0.03 - 0.035 * fi;
    vec3 o1 = b + len.x * normalize(vec3(sp, -1.0, 0.03));
    vec3 o2 = o1 + len.y * normalize(vec3(sp, -1.0, 0.07));
    vec3 o3 = o2 + len.z * normalize(vec3(sp, -1.0, 0.1));
    // closed: the proximal phalanx runs behind the other palm until it is clear of its edge, then the finger rises
    // round that edge and the tip leans in toward its back
    vec2 ud = normalize(mix(vec2(0.0, -1.0), en, 0.55));
    float hgt = dot(b.xy - e0, en);
    float L1 = clamp((r + GAP + 0.004 - hgt) / max(dot(ud, en), 0.2), 0.03, 0.068);
    vec3 c1 = b + vec3(ud * L1, 0.0);
    vec3 c2 = c1 + len.y * normalize(vec3(-en * 0.08, 1.0));
    vec3 c3 = c2 + len.z * normalize(vec3(-en * 0.4, 1.0));
    vec3 p1 = mix(o1, c1, g1);
    vec3 p2 = p1 + (mix(o2 - o1, c2 - c1, g2));
    vec3 p3 = p2 + (mix(o3 - o2, c3 - c2, g2));
    fing = min(fing, chain(p, b, p1, p2, p3, r));
  }
  h = cs_smin(h, fing, 0.012);
  // ---- thumb: open, it stands up beside the index; closed, it rises outside the other's index edge and lies across
  // the back of that hand
  vec3 t0 = vec3(0.028, -0.02, 0.005);
  vec2 ud = normalize(u1 - u0);
  vec2 qe = u0 + ud * (dot(t0.xy - u0, ud) + 0.012);      // the other index edge, a little past our root
  vec3 a1 = vec3(0.054, -0.042, -0.002), a2 = vec3(0.077, -0.053, -0.002), a3 = vec3(0.097, -0.065, -0.001);
  vec3 b1 = vec3(qe + un * (0.0115 + GAP + 0.004), OZ);
  vec3 l2 = vec3(b1.xy + un * 0.004, OZ + 0.022), l3 = vec3(b1.xy + un * 0.004, OZ + 0.042);   // lifted, clear of it
  vec3 b2 = vec3(qe + un * 0.003 + ud * 0.002, OZ + 0.011 + 0.0105 + GAP + 0.004);
  vec3 b3 = vec3(qe - un * 0.022 - ud * 0.002, OZ + 0.011 + 0.0088 + GAP + 0.004);   // on the flat of the back
  // out past the other's index edge at palm height, then up, then laid across its back
  float gxy = smoothstep(0.0, 0.35, grip), gz = smoothstep(0.3, 0.65, grip), gp = smoothstep(0.6, 1.0, grip);
  vec3 t1 = vec3(mix(a1.xy, b1.xy, gxy), mix(a1.z, b1.z, gz));
  vec3 tm = mix(vec3(mix(a2.xy, l2.xy, gxy), mix(a2.z, l2.z, gz)), b2, gp);
  vec3 tt = mix(vec3(mix(a3.xy, l3.xy, gxy), mix(a3.z, l3.z, gz)), b3, gp);
  float th = cs_cone(p, t0, t1, 0.016, 0.0115);
  th = min(th, cs_cone(p, t1, tm, 0.0115, 0.0105));
  th = min(th, cs_cone(p, tm, tt, 0.0105, 0.0088));
  h = cs_smin(h, th, 0.014);
  return opU(res, vec2(h, MAT_SKIN));
}
vec2 handA(vec3 p) { return gripHand(p - gc - vec3(-WX - gOff, 0.0, -ZC)); }
vec2 handB(vec3 p) { vec3 v = p - gc; return gripHand(vec3(-v.x, v.y, -v.z) - vec3(-WX - gOff, 0.0, -ZC)); }
vec2 map(vec3 p) {
#ifdef SHAKE_DBG  // define to render only the overlap of the two hands (must come out empty)
  return vec2(max(handA(p).x, handB(p).x), MAT_SKIN);
#else
  return opU(handA(p), handB(p));
#endif
}
float strDist(vec3 p) { return 1e3; }`) + /* glsl */ `
void main() {
  vec2 uv = scrUV();
  vec3 rd = camRay(uv);
  // the gallery out of focus behind: navy, a soft row of brass bulbs
  vec2 bu = uv * vec2(1.0, 1.0) + vec2(t * 0.02, 0.0);
  vec3 col = C_INK * 0.5 + C_INK2 * 0.6 * smoothstep(-0.5, 0.4, uv.y);
  for (int i = 0; i < 14; i++) {
    float fi = float(i);
    vec2 c = vec2(-1.1 + fi * 0.17 + 0.02 * sin(fi * 3.1) - mod(t * 0.03, 0.17), 0.2 + 0.03 * sin(fi * 1.7));
    float d = length(uv - c - vec2(0.0, 0.04));
    col += mix(C_BRASS, C_EMBER, 0.3) * 0.22 * smoothstep(0.03, 0.022, d) * (0.4 + 0.6 * hash11(fi));
  }
  col += C_BRASS * 0.05 * exp(-pow(uv.y - 0.2, 2.0) * 30.0);
  StageLight key = StageLight(vec3(-0.4, 1.4, 1.2), normalize(vec3(0.4, -1.4, -1.2)), mix(C_BRASS, vec3(1.0), 0.5) * 2.6, 0.9);
  StageLight fill = StageLight(vec3(1.5, -0.5, 1.5), vec3(0.0), C_LILAC * 0.25 + C_INK2, -1.0);
  StageLight rim = StageLight(vec3(0.0, 0.6, -1.2), vec3(0.0), C_BRASS * 1.3, -1.0);
  Hit H = marchS(ro, rd, 6.0, 0.002);
  if (H.t > 0.0) {
    vec3 p = ro + rd * H.t, n = castNormal(p);
    col = shadeM(p, vec3(p.y * 1.3, p.x, p.z), n, rd, H.m, key, fill, rim);
  }
  fragColor = vec4(col, 1.0);
}`;

// ============================================================================ shot E: the vault door
export const SHOT_E = pre(/* glsl */ `
uniform float theta, vaultOn, wheel, slitA;
uniform vec2 gA, gB, fA, fB; // slit top/bottom and floor line ends (screen uv)
const float OW = 0.66, OH = 2.22, DW = 1.315, DT = 0.34;
`, /* glsl */ `
vec2 door(vec3 p) {
  vec3 q = p - vec3(-OW, 0.0, 0.0);
  float c = cos(theta), s = sin(theta);
  vec3 l = vec3(q.x * c + q.z * s, q.y, -q.x * s + q.z * c);
  vec2 r = vec2(cs_box(l - vec3(DW * 0.5, OH * 0.5, -DT * 0.5), vec3(DW * 0.5, OH * 0.5, DT * 0.5), 0.012), MAT_FLOOR);
  // brass bands and the wheel
  r = opU(r, vec2(cs_box(l - vec3(DW * 0.5, 0.35, 0.004), vec3(DW * 0.46, 0.025, 0.01), 0.006), MAT_BRASS));
  r = opU(r, vec2(cs_box(l - vec3(DW * 0.5, OH - 0.35, 0.004), vec3(DW * 0.46, 0.025, 0.01), 0.006), MAT_BRASS));
  vec3 w = l - vec3(DW * 0.5, 1.15, 0.07);
  vec2 tq = vec2(length(w.xy) - 0.24, w.z);
  r = opU(r, vec2(length(tq) - 0.02, MAT_BRASS));
  r = opU(r, vec2(cs_cyl(w.xzy - vec3(0.0, -0.035, 0.0), 0.035, 0.05), MAT_BRASS));
  vec2 wr = cs_rot(wheel) * w.xy;
  float a = atan(wr.y, wr.x); float sec = 6.28318 / 6.0;
  a = mod(a + sec * 0.5, sec) - sec * 0.5;
  vec2 sp = length(wr) * vec2(cos(a), sin(a));
  r = opU(r, vec2(cs_cap(vec3(sp, w.z), vec3(0.04, 0.0, 0.0), vec3(0.3, 0.0, 0.0), 0.013), MAT_BRASS));
  // hinge barrels on the hinge side
  vec3 hp = l - vec3(-0.02, 0.0, 0.02); hp.y -= 0.35 + 0.75 * clamp(floor((hp.y - 0.35) / 0.75 + 0.5), 0.0, 2.0);
  r = opU(r, vec2(cs_cyl(hp, 0.12, 0.035), MAT_CHROME));
  // round bolts on the lock edge
  vec3 bp = l - vec3(DW, 0.0, -DT * 0.5); bp.y -= 0.31 + 0.4 * clamp(floor((bp.y - 0.31) / 0.4 + 0.5), 0.0, 4.0);
  r = opU(r, vec2(cs_cyl(bp.yxz, 0.03, 0.045), MAT_CHROME));
  return r;
}
vec2 map(vec3 p) {
  vec2 r = vec2(p.y, MAT_FLOOR);
  // the wall (thick), with the opening cut out
  float wall = cs_box(p - vec3(0.0, 4.0, -0.45), vec3(40.0, 4.0, 0.45), 0.0);
  float hole = cs_box(p - vec3(0.0, OH * 0.5 - 0.1, -0.45), vec3(OW, OH * 0.5 + 0.1, 0.6), 0.0);
  r = opU(r, vec2(max(wall, -hole), MAT_FLOOR));
  // brass surround
  float sur = max(cs_box(p - vec3(0.0, OH * 0.5 + 0.06, 0.02), vec3(OW + 0.14, OH * 0.5 + 0.08, 0.03), 0.01), -cs_box(p - vec3(0.0, OH * 0.5, 0.0), vec3(OW + 0.004, OH * 0.5 + 0.004, 0.2), 0.0));
  r = opU(r, vec2(sur, MAT_BRASS));
  r = opU(r, door(p));
  // the lit vault beyond
  r = opU(r, vec2(p.z + 1.4, MAT_VAULT));
  return r;
}
float strDist(vec3 p) { return 1e3; }`) + /* glsl */ `
void main() {
  vec2 uv = scrUV();
  vec3 rd = camRay(uv);
  vec3 col = C_INK * 0.3;
  vec3 vc = mix(C_BRASS, C_BONE, 0.3);
  StageLight key = StageLight(vec3(-1.8, 4.2, 4.2), normalize(vec3(1.8, -3.1, -4.2)), vec3(0.55, 0.62, 0.9) * 1.3, 0.86);
  StageLight fill = StageLight(vec3(0.15, 1.2, -1.0), vec3(0.0), vc * 10.0 * vaultOn, -1.0);
  StageLight rim = StageLight(vec3(3.0, 2.0, 3.0), vec3(0.0), C_INK2 * 0.8, -1.0);
  Hit H = marchS(ro, rd, 30.0, 0.001);
  if (H.t > 0.0) {
    vec3 p = ro + rd * H.t;
    if (floor(H.m + 0.001) == MAT_VAULT) {
      float shelf = 0.55 + 0.45 * smoothstep(0.0, 0.06, fract(p.y * 2.2)) * smoothstep(0.0, 0.05, abs(fract(p.x * 1.1) - 0.5));
      col = vc * (0.9 + 1.0 * smoothstep(2.4, 0.2, p.y)) * shelf * vaultOn;
    } else {
      vec3 n = castNormal(p);
      float rough; vec3 emit;
      vec4 mat = castMaterial(H.m, p, rough, emit);
      float ao = castAO(p, n);
      // key (shadowed), vault light (shadowed: it only leaks through the gap), dim rim
      vec3 c = cs_light(key, p, n, rd, mat.rgb, mat.a, rough, true);
      c += cs_light(fill, p, n, rd, mat.rgb, mat.a, rough, true);
      c += cs_light(rim, p, n, rd, mat.rgb, mat.a, rough, false) * ao;
      vec3 rr = reflect(rd, n);
      c += C_INK * 0.3 * mix(0.12, 0.8, mat.a) * ao;
      col = c;
      // a mirror sheen of the vault light on the polished floor
      if (p.y < 0.001) {
        float g = exp(-pow((p.x - 0.66) * 6.0, 2.0)) * smoothstep(3.5, 0.0, p.z);
        col += vc * 0.0 * g;
      }
    }
    col = mix(col, C_INK * 0.3, 1.0 - exp(-H.t * 0.03));
  }
  // the hairline: the slit of light left by the closing door, and its line across the floor
  if (slitA > 0.0) {
    float px = 1.0 / 1080.0;
    vec2 ba = gB - gA; float h = clamp(dot(uv - gA, ba) / dot(ba, ba), 0.0, 1.0);
    float d = length(uv - gA - ba * h) / px;
    vec2 fb = fB - fA; float hf = clamp(dot(uv - fA, fb) / dot(fb, fb), 0.0, 1.0);
    float df = length(uv - fA - fb * hf) / px;
    float core = smoothstep(1.6, 0.4, d) + 0.5 * smoothstep(1.4, 0.2, df) * (1.0 - hf);
    float halo = exp(-d / 7.0) * 0.35 + exp(-df / 9.0) * 0.2 * (1.0 - hf);
    col += vc * slitA * (core * 4.0 + halo);
  }
  fragColor = vec4(col, 1.0);
}`;
