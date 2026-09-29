// The final-chorus stage, shared by the `strings` (cold, stripped) and `money` (brass, full band) plates.
// One raymarched set: a glossy floor, a tall porcelain facade at the back (the "screen" the big shadow is thrown on),
// a crowd of marionettes by domain repetition (one pose for all: perfect puppet unison) with a central aisle, the
// small tin robot in a clearing in front of the facade, a floor spotlight held on a rod by a giant cuffed hand (its
// light throws the robot's shadow huge up the facade), and, above, a sky of control crosses and hands.
// Strings and falling coins are analytic (ray vs segments / layered particles along the crowd rows), not in the SDF:
// every string gets a crisp >= 1 px silver line whatever its distance.
import * as THREE from 'three';
import { FSPass } from '@engine/gl';
import { aaPass } from './_aa';
import { GLSL_CAST_SDF, GLSL_CAST_SHADE } from './_cast';

export const STAGE = {
  CX: 1.5, CZ: 1.7, Z0: -1.5, NX: 12, NZ: 40, HCROSS: 8.5, WALLZ: -9.5,
  robot: [0, 0, -5.7] as [number, number, number],
};

const f = (x: number) => x.toFixed(4);

const FRAG = /* glsl */ `
uniform float uT;
uniform vec3 camPos, camTa; uniform float camFocal, camRoll;
uniform vec4 limbs; uniform vec3 headP; uniform float bodyLift, sway, tremble;
// per-cell variety (cellVar 0 = perfect unison): a cell picks pose A (limbs/headP) or pose B (limbs2/headP2), and
// scales its lift and lean (rigid, so its strings follow exactly)
uniform vec4 limbs2; uniform vec3 headP2; uniform float cellVar;
uniform float smile, crowdOn, crowdFar, crowdW;
uniform vec3 lampPos; uniform float lampPitch, lampPow, lampCone;
uniform vec3 robotPos; uniform float robotWalk, robotLook;
uniform float handOn, handPinch, handScale; uniform vec3 handGrip;
uniform float skyHands, skyPinch;
uniform float stringGlow, stringTop;
uniform float coins, coinPhase, coinStop;
uniform float money;
uniform vec3 keyTa, fillPos; uniform float keyCone;
uniform vec3 keyPos, keyCol, fillCol, rimCol, wallTint, lampCol, skyCol, hazeCol;
uniform float ticker, tickScroll; uniform sampler2D tickTex;
uniform float lampHaze, floorRefl, shadowLift, rodLen, marchMax;

#define CX ${f(STAGE.CX)}
#define CZ ${f(STAGE.CZ)}
#define Z0 ${f(STAGE.Z0)}
#define NX ${f(STAGE.NX)}
#define NZ ${f(STAGE.NZ)}
#define HCROSS ${f(STAGE.HCROSS)}
#define WALLZ ${f(STAGE.WALLZ)}
#define PIVY 1.95
#define MAT_WALL 22.0
#define MAT_LAMP 23.0

${GLSL_CAST_SDF}

// figure-local position for a point in cell-local coords: lifted, swung like a pendulum from above the head, and
// turned to face the facade (-z)
float cLift = 0.0, cSway = 0.0; // the current cell's lift and lean (see cellPose)
vec3 figLocal(vec3 q) {
  q.y -= cLift;
  q.y -= PIVY;
  q.xy = cs_rot(cSway) * q.xy;
  q.y += PIVY;
  q.xz = -q.xz;
  return q;
}
vec3 figWorld(vec3 l) { // inverse of figLocal (cell-local)
  l.xz = -l.xz;
  l.y -= PIVY;
  l.xy = cs_rot(-cSway) * l.xy;
  l.y += PIVY + cLift;
  return l;
}
// per-cell variant from the cell origin: sets cLift/cSway, returns 1 for pose B
float cellPose(vec2 oxz) {
  vec2 hh = vec2(hash12(floor(oxz * 0.66 + 0.5) + 11.3), hash12(floor(oxz * 0.66 + 0.5) + 27.9));
  float k = 1.0 + cellVar * (hh.x - 0.5) * 0.6; // 0.7..1.3
  cLift = 0.04 + (bodyLift - 0.04) * k;
  cSway = sway * mix(1.0, 0.8 + 0.4 * hh.y, cellVar);
  return cellVar > 0.0 && hh.y > 0.5 ? 1.0 : 0.0;
}
vec2 cellJit(float ix, float iz) { return (vec2(hash12(vec2(ix, iz) + 0.37), hash12(vec2(iz, ix) + 5.1)) - 0.5) * vec2(0.4, 0.45); }
float rowStagger(float iz) { return mod(iz, 2.0) * 0.5 * CX; }
// cell of p; returns cell origin (world). cell.w = 1 if the cell holds a figure (not the aisle / out of range)
vec4 cellOf(vec3 p) {
  float iz = clamp(floor((p.z - Z0) / CZ + 0.5), 0.0, NZ - 1.0);
  float st = rowStagger(iz);
  float ix = clamp(floor((p.x - st) / CX + 0.5), -NX, NX);
  vec3 o = vec3(ix * CX + st, 0.0, Z0 + iz * CZ);
  o.xz += cellJit(ix, iz);
  float on = abs(o.x) < 0.8 && iz < 10.0 ? 0.0 : 1.0; // the aisle to the show
  if (abs(ix) > crowdW) on = 0.0;
  if (iz >= crowdFar) on = 0.0;
  return vec4(o, on);
}
float sdSmile(vec3 f, vec3 hd) {
  // same head frame as the cast's marionette (neck pivot; tilt, yaw, droop)
  vec3 hp = f - CS_M_NECK;
  hp.xz = cs_rot(hd.y) * hp.xz; hp.xy = cs_rot(hd.x) * hp.xy; hp.yz = cs_rot(hd.z + 0.06) * hp.yz;
  vec2 xy = hp.xy - vec2(0.0, 0.125);
  float a = length(xy) - 0.042;
  float d = length(vec2(a, hp.z - 0.118)) - 0.0065;
  return max(d, xy.y + 0.022);
}
vec2 sdLampRig(vec3 p) {
  vec3 lp = p - lampPos;
  lp.yz = cs_rot(-lampPitch) * lp.yz; // aim: -z tilted up by lampPitch
  float body = cs_cyl(lp.xzy, 0.14, 0.11);           // can, axis z
  body = min(body, cs_cyl((lp - vec3(0.0, 0.0, -0.15)).xzy, 0.02, 0.125)); // front ring
  vec2 r = vec2(body, MAT_LAMP);
  r = opU(r, vec2(cs_cyl((lp - vec3(0.0, 0.0, -0.16)).xzy, 0.008, 0.1), MAT_GLOW)); // the lens
  // yoke + rod up to the giant hand; its pinstripe sleeve rises out of frame into the dark
  vec3 rp = p - lampPos;
  float hs = handScale;
  vec3 grip = handGrip - vec3(0.0, 0.13 * hs, 0.0);
  vec3 rodEnd = grip + normalize(lampPos + vec3(0.0, 0.1, 0.0) - grip) * rodLen;
  r = opU(r, vec2(cs_cap(p, rodEnd, grip, 0.02), MAT_CHROME));
  r = opU(r, vec2(cs_box(rp, vec3(0.15, 0.015, 0.02), 0.008), MAT_CHROME));
  if (handOn > 0.5) {
    vec3 hp = (p - handGrip) / hs;
    float hb = length(hp - vec3(0.0, -0.05, 0.0)) - 0.3;
    vec2 hh = hb < 0.05 ? sdHand(hp, handPinch, 0.0) : vec2(hb, MAT_NONE);
    r = opU(r, vec2(hh.x * hs, hh.y));
    r = opU(r, vec2(cs_cap(p, handGrip + vec3(0.0, 0.16 * hs, 0.0), handGrip + vec3(0.0, 0.16 * hs + 14.0, 0.0), 0.05 * hs), MAT_CLOTH));
  }
  return r;
}
float gNoRig = 0.0;
vec2 map(vec3 p) {
  vec2 r = vec2(gNoRig > 0.5 ? 1e3 : p.y, MAT_FLOOR);
  // the facade: a tall porcelain building front with a cornice; dark sky above it
  float wall = cs_box(p - vec3(0.0, 3.9, WALLZ - 1.0), vec3(15.0, 3.9, 1.0), 0.03);
  wall = min(wall, cs_box(p - vec3(0.0, 7.9, WALLZ - 0.8), vec3(15.3, 0.12, 1.0), 0.03));
  if (gNoRig < 0.5) r = opU(r, vec2(wall, MAT_WALL));
  if (crowdOn > 0.5) {
    // The 2x2 cells around p (the two rows either side of it, and in each row the two figures either side), not just
    // the nearest cell: a jittered, swaying figure reaches right up to its cell's edge, so a one-cell field lets a ray
    // stride across the edge into the neighbour's figure (it came out as sliced heads, legs with gaps, banded faces).
    // Outside the active block the edge cells stand in, so the field still bounds the crowd from beyond it.
    float zMax = min(NZ, crowdFar) - 2.0, xMax = min(NX, crowdW);
    float iz0 = clamp(floor((p.z - Z0) / CZ), 0.0, max(zMax, 0.0));
    for (int a = 0; a < 2; a++) {
      float iz = iz0 + float(a);
      if (iz >= crowdFar) continue;
      float st = rowStagger(iz);
      float ix0 = clamp(floor((p.x - st) / CX), -xMax, xMax - 1.0);
      for (int b2 = 0; b2 < 2; b2++) {
        float ix = ix0 + float(b2);
        vec3 o = vec3(ix * CX + st, 0.0, Z0 + iz * CZ);
        o.xz += cellJit(ix, iz);
        if (abs(o.x) < 0.8 && iz < 10.0) continue; // the aisle to the show
        float pb = cellPose(o.xz);
        vec3 f = figLocal(p - o);
        float b = cs_cap(f, vec3(0.0, 0.25, 0.0), vec3(0.0, 1.7, 0.0), 0.62);
        if (b < 0.2) {
          vec3 hd = pb > 0.5 ? headP2 : headP;
          r = opU(r, sdMarionette(f, pb > 0.5 ? limbs2 : limbs, hd, step(0.5, hash12(floor(o.xz * 0.66 + 0.5)))));
          if (smile > 0.01) r = opU(r, vec2(sdSmile(f, hd), MAT_GLOW));
        } else r = opU(r, vec2(b, MAT_NONE));
      }
    }
    // a row further out can still be nearer than all four (a point right on a row, between two figures): cap the
    // stride inside the crowd's height
    if (p.y < 2.6 + bodyLift * 1.3) r.x = min(r.x, 1.0);
  }
  // the robot
  vec3 rq = p - robotPos;
  float rb = length(rq - vec3(0.0, 0.3, 0.0)) - 0.5;
  r = opU(r, rb < 0.6 ? sdTinRobot(rq, robotWalk, robotLook, 0.0) : vec2(rb, MAT_NONE));
  // the spotlight rig
  if (gNoRig < 0.5) {
    vec3 gq = handGrip - vec3(0.0, 0.13 * handScale, 0.0);
    vec3 re = gq + normalize(lampPos + vec3(0.0, 0.1, 0.0) - gq) * rodLen;
    float lb = min(min(cs_cap(p, lampPos, lampPos + vec3(0.0, 0.2, 0.0), 0.3), cs_cap(p, re, handGrip, 0.12 + 0.12 * handScale)), cs_cap(p, handGrip, handGrip + vec3(0.0, 14.0, 0.0), 0.1 * handScale));
    r = opU(r, lb < 0.1 ? sdLampRig(p) : vec2(lb, MAT_NONE));
  }
  // the sky of hands working the crosses
  if (skyHands > 0.01 && p.y > HCROSS - 1.0) {
    // same 2x2 neighbourhood as the crowd (a single cell sliced the sleeves and hands at the cell edges)
    float zMax = min(NZ, crowdFar) - 2.0, xMax = min(NX, crowdW);
    float iz0 = clamp(floor((p.z - Z0) / CZ), 0.0, max(zMax, 0.0));
    vec2 h = vec2(max(p.y - HCROSS - 11.5, 0.3), MAT_NONE);
    for (int a = 0; a < 2; a++) {
      float iz = iz0 + float(a);
      if (iz >= crowdFar) continue;
      float st = rowStagger(iz);
      float ix0 = clamp(floor((p.x - st) / CX), -xMax, xMax - 1.0);
      for (int b2 = 0; b2 < 2; b2++) {
        float ix = ix0 + float(b2);
        vec3 o = vec3(ix * CX + st, 0.0, Z0 + iz * CZ);
        o.xz += cellJit(ix, iz);
        if (abs(o.x) < 0.8 && iz < 10.0) continue;
        cellPose(o.xz);
        vec3 q = p - o - vec3(cSway * 0.9, HCROSS, 0.0);
        q.xy = cs_rot(cSway * 0.6) * q.xy;
        float cr = min(cs_box(q, vec3(0.42, 0.025, 0.03), 0.01), cs_box(q, vec3(0.03, 0.025, 0.2), 0.01));
        h = opU(h, vec2(cr, MAT_WOOD));
        float s = 3.4;
        vec3 hp = (q - vec3(0.0, 0.2 * s + 0.02, 0.0)) / s;
        // bound the whole hand incl. its sleeve stub (hand space y -0.22..0.28 -> q.y -0.05..1.66)
        float hb = cs_cap(q, vec3(0.0, 0.15, 0.0), vec3(0.0, 1.5, 0.0), 0.5);
        if (hb < 0.1) { vec2 hh = sdHand(hp, skyPinch, 0.0); h = opU(h, vec2(hh.x * s, hh.y)); }
        else h = opU(h, vec2(hb, MAT_NONE));
        // the hand's own sleeve stops flat at q.y 1.62; carry the jacket sleeve on up into the dark
        vec3 sv = q - vec3(0.0, 0.0, -0.007); sv.x *= 0.94;
        h = opU(h, vec2(cs_cap(sv, vec3(0.0, 1.5, 0.0), vec3(0.0, 11.0, 0.0), 0.18), MAT_CLOTH));
      }
    }
    if (p.y < HCROSS + 11.0) h.x = min(h.x, 1.0);
    r = opU(r, h);
  }
  return r;
}

${GLSL_CAST_SHADE}

float segRay(vec3 ro, vec3 rd, vec3 a, vec3 b, out float s, out float u) {
  vec3 ba = b - a, oa = ro - a;
  float d = dot(rd, ba), e = dot(ba, ba), f2 = dot(rd, oa), g = dot(ba, oa);
  u = clamp((g - d * f2) / max(e - d * d, 1e-6), 0.0, 1.0);
  s = max(d * u - f2, 0.0);
  // re-project u for the clamped s
  u = clamp(dot(ro + rd * s - a, ba) / e, 0.0, 1.0);
  return length(ro + rd * s - (a + ba * u));
}

float keyShadow(vec3 p, vec3 ld) {
  float res = 1.0, t = 0.03;
  for (int i = 0; i < 26; i++) {
    float h = map(p + ld * t).x;
    res = min(res, 8.0 * h / t);
    t += clamp(h, 0.04, 0.7);
    if (res < 0.01 || t > 9.0 || p.y + ld.y * t > 2.4) break;
  }
  return clamp(res, 0.0, 1.0);
}
float lampShadow(vec3 p, vec3 n, vec3 lpos) {
  vec3 ld = lpos - p; float dist = length(ld); ld /= dist;
  gNoRig = 1.0;
  vec3 ro = p + n * 0.004;
  float res = 1.0, t = 0.02;
  for (int i = 0; i < 48; i++) {
    float h = map(ro + ld * t).x;
    res = min(res, 30.0 * h / t);
    t += clamp(h, 0.01, 0.4);
    if (res < 0.002 || t > dist - 0.05) break;
  }
  gNoRig = 0.0;
  return smoothstep(0.0, 1.0, clamp(res, 0.0, 1.0));
}
vec3 wallAlbedo(vec3 p) {
  vec2 g = p.xy / vec2(1.6, 1.2);
  vec2 fg = abs(fract(g) - 0.5);
  float groove = smoothstep(0.485, 0.5, max(fg.x, fg.y));
  vec3 a = mix(vec3(0.62, 0.64, 0.68), wallTint, 0.6) * (1.0 - 0.45 * groove);
  return a;
}

void main() {
  vec2 uv = (vUv - 0.5) * vec2(16.0 / 9.0, 1.0);
  uv = cs_rot(camRoll) * uv;
  vec3 ro = camPos;
  vec3 fw = normalize(camTa - ro), rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0))), up = cross(rt, fw);
  vec3 rd = normalize(fw * camFocal + rt * uv.x + up * uv.y);
  float pixAng = 1.0 / (1080.0 * camFocal);

  vec2 h = castMarch(ro, rd, marchMax);
  float ht = h.x > 0.0 ? h.x : 1e4;
  vec3 col;
  // sky: dark, a faint lifted band where the strings vanish
  col = skyCol * (0.35 + 0.65 * smoothstep(-0.1, 0.5, rd.y));

  StageLight key = StageLight(keyPos, normalize(keyTa - keyPos), keyCol, keyCone);
  StageLight fill = StageLight(fillPos, vec3(0.0), fillCol, -1.0);
  StageLight rim = StageLight(vec3(0.0, 6.0, -12.0), vec3(0.0), rimCol, -1.0);
  vec3 ldir = vec3(0.0, sin(lampPitch), -cos(lampPitch));
  StageLight lamp = StageLight(lampPos + ldir * 0.17, ldir, lampCol * lampPow, lampCone);

  if (h.x > 0.0) {
    vec3 p = ro + rd * h.x, n = castNormal(p);
    float m = h.y;
    float id = floor(m + 0.001);
    if (id == MAT_WALL || id == MAT_LAMP) {
      vec3 alb = id == MAT_WALL ? wallAlbedo(p) : vec3(0.05, 0.055, 0.07);
      float metal = id == MAT_WALL ? 0.0 : 0.6, rough = id == MAT_WALL ? 0.45 : 0.3;
      col = cs_light(key, p, n, rd, alb, metal, rough, false) * 0.6;
      col += cs_light(fill, p, n, rd, alb, metal, rough, false);
      col += cs_light(rim, p, n, rd, alb, metal, rough, false) * 0.5;
      vec3 lit = cs_light(lamp, p, n, rd, alb, metal, rough, false);
      if (id == MAT_WALL && dot(lit, vec3(1.0)) > 1e-4) lit *= lampShadow(p, n, lamp.pos);
      col += lit;
      if (id == MAT_WALL) {
        // the shadow is indigo: lift it where the lamp's cone is but its light is blocked
        vec3 ld = normalize(p - lamp.pos);
        float inCone = smoothstep(lamp.cone, mix(lamp.cone, 1.0, 0.25), dot(ld, lamp.dir));
        float litAmt = clamp(dot(lit, vec3(0.33)) / max(lampPow * 0.02, 1e-3), 0.0, 1.0);
        col += C_SHADOW * shadowLift * inCone * (1.0 - litAmt);
        // the LED ticker band
        if (ticker > 0.01 && p.y > 5.4 && p.y < 6.6 && abs(p.x) < 14.0) {
          vec2 tuv = vec2((p.x + tickScroll) / 14.0, (p.y - 5.4) / 1.2);
          vec2 cell = vec2(tuv.x * 420.0, tuv.y * 22.0);
          vec2 cf = fract(cell) - 0.5;
          vec2 tc = (floor(cell) + 0.5) / vec2(420.0, 22.0);
          float lum = texture(tickTex, vec2(fract(tc.x), tc.y)).r;
          float dotm = smoothstep(0.5, 0.25, length(cf));
          col += (mix(C_BRASS * 0.12, C_SIGNAL * 5.0, lum) * dotm + C_BRASS * 0.03) * ticker;
        }
      }
      if (id == MAT_LAMP) col += C_BRASS * 0.02;
    } else {
      float rough; vec3 emit;
      vec4 mat = castMaterial(m, p, rough, emit);
      vec3 alb = mat.rgb; float metal = mat.a;
      if (id == MAT_FLOOR) { alb = mix(alb, alb * vec3(1.1, 0.95, 0.7) * 1.3, money); }
      float ao = h.x < 14.0 ? castAO(p, n) : 0.8;
      bool floorShadow = id == MAT_FLOOR;
      col = cs_light(key, p, n, rd, alb, metal, rough, false);
      if (floorShadow && p.z > -4.0 && dot(col, vec3(1.0)) > 1e-4) col *= keyShadow(p, normalize(key.pos - p));
      vec3 ll = cs_light(lamp, p, n, rd, alb, metal, rough, false);
      if (p.z < -2.0 && dot(ll, vec3(1.0)) > 1e-4) ll *= lampShadow(p, n, lamp.pos);
      col += ll;
      col += cs_light(fill, p, n, rd, alb, metal, rough, false) * ao;
      col += cs_light(rim, p, n, rd, alb, metal, rough, false) * 0.9;
      vec3 r = reflect(rd, n);
      vec3 env = mix(skyCol * 0.5, hazeCol * 0.35, smoothstep(-0.2, 0.8, r.y));
      col += env * mix(0.12, 0.9, metal) * ao * mix(alb, vec3(1.0), 1.0 - metal);
      col += emit * (id == MAT_GLOW && p.y > 1.0 && p.y < 4.0 ? mix(1.0, 0.9, smile) : 1.0);
      if (id == MAT_FLOOR) {
        // polished floor: a cheap reflection march
        float fres = 0.04 + 0.5 * pow(1.0 - max(dot(-rd, n), 0.0), 4.0);
        if (floorRefl > 0.01 && h.x < 22.0) {
          vec3 rr = reflect(rd, n);
          float tt = 0.02; vec2 hh = vec2(-1.0);
          for (int i = 0; i < 32; i++) { vec2 q = map(p + rr * tt); if (q.x < 0.002 * tt) { hh = vec2(tt, q.y); break; } tt += q.x; if (tt > 18.0) break; }
          vec3 rc = skyCol * 0.4;
          if (hh.x > 0.0) {
            vec3 pp = p + rr * hh.x;
            float rid = floor(hh.y + 0.001);
            float rough2; vec3 emit2;
            vec4 m2 = castMaterial(hh.y, pp, rough2, emit2);
            vec3 a2 = rid == MAT_WALL ? wallAlbedo(pp) : m2.rgb;
            rc = a2 * (keyCol * 0.02 + fillCol * 0.05) + emit2;
            if (rid == MAT_WALL) {
              vec3 ld = normalize(pp - lamp.pos);
              rc += a2 * lamp.col * 0.02 * smoothstep(lamp.cone, mix(lamp.cone, 1.0, 0.25), dot(ld, lamp.dir)) / (1.0 + 0.02 * dot(pp - lamp.pos, pp - lamp.pos)) * 3.0;
            }
          }
          col += rc * fres * floorRefl;
        }
      }
    }
    // distance haze
    col = mix(col, hazeCol * 0.25, smoothstep(12.0, 60.0, h.x) * 0.85);
  }

  // ---- strings (lit silver) and coins: walk the crowd rows along the ray
  if (crowdOn > 0.5 && (stringGlow > 0.001 || coins > 0.001)) {
    // unison pose: anchors and cross points in cell-local coords, computed once
    // anchors in figure space for both poses (placed per cell below, with that cell's lift and lean)
    vec3 A[5]; vec3 A2[5]; vec3 B[5];
    for (int i = 0; i < 5; i++) {
      A[i] = marionetteAnchor(i, limbs, headP);
      A2[i] = cellVar > 0.0 ? marionetteAnchor(i, limbs2, headP2) : A[i];
    }
    B[0] = vec3(0.0, HCROSS, 0.0);
    B[1] = vec3(0.36, HCROSS, 0.0); // figure's left hand is on world +x (it faces -z)
    B[2] = vec3(-0.36, HCROSS, 0.0);
    B[3] = vec3(0.12, HCROSS, 0.18);
    B[4] = vec3(-0.12, HCROSS, 0.18);
    vec3 strAcc = vec3(0.0), coinAcc = vec3(0.0);
    float coinA = 0.0;
    for (int k = 0; k < int(NZ); k++) {
      float iz = float(k);
      if (iz >= crowdFar) break;
      float zc = Z0 + iz * CZ;
      if (abs(rd.z) < 1e-4) break;
      float s0 = (zc - ro.z) / rd.z;
      if (s0 < -3.0 || s0 > ht + 2.0) continue;
      vec3 pp = ro + rd * s0;
      float st = rowStagger(iz);
      float fx = (pp.x - st) / CX;
      float ix0 = floor(fx + 0.5);
      float side = fx - ix0 > 0.0 ? 1.0 : -1.0;
      if (stringGlow > 0.001 && pp.y > -0.5 && pp.y < HCROSS + 1.5) {
        for (int j = 0; j <= 1; j++) {
          float ix = ix0 + float(j) * side;
          if (abs(ix) > crowdW) continue;
          vec3 o = vec3(ix * CX + st, 0.0, zc);
          if (abs(o.x) < 0.8 && iz < 10.0) continue;
          o.xz += cellJit(ix, iz);
          float trem = tremble * sin(uT * 61.0 + ix * 3.1 + iz * 1.7) * 0.004;
          float pb = cellPose(o.xz);
          float cx = cSway * 0.9;
          for (int i = 0; i < 5; i++) {
            float s, u;
            vec3 a = o + figWorld(pb > 0.5 ? A2[i] : A[i]), b = o + B[i] + vec3(cx + trem, 0.0, 0.0);
            float d = segRay(ro, rd, a, b, s, u);
            if (s <= 0.0 || s > ht) continue;
            float w = max(pixAng * s * 1.0, 0.0022);
            float cov = clamp(1.0 - d / w, 0.0, 1.0);
            float glow = exp(-d / (w * 4.0));
            float y = mix(a.y, b.y, u);
            float fade = 1.0 - smoothstep(stringTop - 2.5, stringTop, y);
            strAcc += (cov * 0.8 + glow * 0.06) * fade * exp(-s * 0.07);
          }
        }
      }
      if (coins > 0.001) {
        // a coin layer halfway between rows
        float zc2 = zc + CZ * 0.5;
        float s1 = (zc2 - ro.z) / rd.z;
        if (s1 > 0.3 && s1 < ht) {
          vec3 cp = ro + rd * s1;
          float P = 2.2;
          float lane = floor(cp.x / 0.55);
          float hl = hash12(vec2(lane, iz * 7.1));
          if (hl < coins) {
            float ph = coinPhase + hl * P * 3.0;
            float lx = (lane + 0.2 + 0.6 * hash12(vec2(lane, iz + 3.3))) * 0.55;
            float ytop = 11.0;
            float nn = clamp(floor((cp.y - ytop + ph) / P + 0.5), max(0.0, ceil((ph - coinStop) / P)), floor(ph / P));
            float cy = ytop - (ph - nn * P);
            if (nn * P <= ph && cy > -0.2) {
              float ang = uT * (4.0 + 5.0 * hl) + nn * 1.7 + hl * 20.0;
              float swayx = sin(uT * 2.0 + nn + hl * 9.0) * 0.08;
              vec2 dcp = vec2(cp.x - lx - swayx, cp.y - cy);
              float R = 0.075;
              float ca = abs(cos(ang));
              float e = length(dcp / vec2(R, max(R * ca, R * 0.12)));
              float pw = pixAng * s1 / R;
              float cov = clamp((1.0 - e) / max(pw * 1.5, 0.02), 0.0, 1.0);
              if (cov > 0.0) {
                float glint = pow(ca, 12.0);
                vec3 cc = C_BRASS * (0.35 + 0.8 * ca) * (1.0 + 0.6 * money) + C_EMBER * glint * 4.0;
                cc *= 0.6 + 0.4 * smoothstep(1.0, 0.3, e);
                coinAcc += cc * cov * (1.0 - coinA);
                coinA += cov * (1.0 - coinA);
              }
            }
          }
        }
      }
    }
    vec3 silver = mix(vec3(0.78, 0.84, 0.95), vec3(1.0, 0.86, 0.55), money);
    col += silver * (1.0 - exp(-strAcc * 1.2)) * stringGlow;
    col = mix(col, coinAcc / max(coinA, 1e-3), coinA * coins);
  }

  // the lamp's beam in the haze (unshadowed cone)
  if (lampPow > 0.01 && lampHaze > 0.0) {
    float acc = 0.0;
    float tmax = min(ht, 30.0);
    float jit = hash12(FRAG_PX);
    for (int i = 0; i < 20; i++) {
      float s = (float(i) + jit) / 20.0 * tmax;
      vec3 q = ro + rd * s;
      vec3 ld = q - lamp.pos; float dl = length(ld);
      float c = smoothstep(lamp.cone, mix(lamp.cone, 1.0, 0.3), dot(ld / dl, lamp.dir));
      acc += c / (1.0 + 0.15 * dl * dl) * (q.z > WALLZ ? 1.0 : 0.0);
    }
    col += lampCol * acc / 20.0 * tmax * 0.01 * lampPow * lampHaze;
  }
  fragColor = vec4(col, 1.0);
}
`;

export interface Cam { pos: [number, number, number]; ta: [number, number, number]; focal: number; roll: number }

export class Stage {
  tickTex: THREE.Texture;
  pass: FSPass;
  constructor(tickTex?: THREE.Texture) {
    this.tickTex = tickTex ?? new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    this.tickTex.needsUpdate = true;
    const v3 = (x = 0, y = 0, z = 0) => ({ value: new THREE.Vector3(x, y, z) });
    const n = (x = 0) => ({ value: x });
    this.pass = aaPass(FRAG, {
      uT: n(), camPos: v3(0, 2, 8), camTa: v3(0, 1, 0), camFocal: n(1.6), camRoll: n(),
      limbs: { value: new THREE.Vector4(0, 0, 0, 0) }, headP: v3(), bodyLift: n(), sway: n(), tremble: n(),
      limbs2: { value: new THREE.Vector4(0, 0, 0, 0) }, headP2: v3(), cellVar: n(),
      smile: n(), crowdOn: n(1), crowdFar: n(STAGE.NZ), crowdW: n(STAGE.NX),
      lampPos: v3(0, 0.15, -5.1), lampPitch: n(0.25), lampPow: n(0), lampCone: n(0.6),
      robotPos: v3(...STAGE.robot), robotWalk: n(), robotLook: n(),
      handOn: n(1), handPinch: n(0.8), handScale: n(3), handGrip: v3(-0.4, 1.4, -4.5),
      skyHands: n(), skyPinch: n(0.8),
      stringGlow: n(1), stringTop: n(8),
      coins: n(), coinPhase: n(), coinStop: n(1e5), money: n(),
      keyPos: v3(3, 14, 6), keyTa: v3(0, 0, 0), fillPos: v3(-6, 4, 12), keyCone: n(-1), keyCol: v3(1, 1, 1), fillCol: v3(0.2, 0.2, 0.3), rimCol: v3(0.5, 0.5, 0.6), wallTint: v3(0.6, 0.6, 0.6),
      lampCol: v3(1, 1, 1), skyCol: v3(0.01, 0.012, 0.02), hazeCol: v3(0.1, 0.1, 0.15),
      ticker: n(), tickScroll: n(), tickTex: { value: this.tickTex },
      lampHaze: n(0.35), floorRefl: n(1), shadowLift: n(0.25), rodLen: n(1.5), marchMax: n(70),
    });
  }
  get u() { return this.pass.u; }
  set(name: string, v: number | number[]) {
    const u = this.pass.u[name];
    if (!u) throw new Error(`no uniform ${name}`);
    if (typeof v === 'number') u.value = v;
    else (u.value as THREE.Vector3 | THREE.Vector4).fromArray(v);
  }
  cam(c: Cam) { this.set('camPos', c.pos); this.set('camTa', c.ta); this.set('camFocal', c.focal); this.set('camRoll', c.roll); }
  /** Project a world point to screen px (1920x1080, y down) with the current camera. */
  project(c: Cam, p: [number, number, number]): { x: number; y: number; z: number } {
    const ro = new THREE.Vector3(...c.pos), ta = new THREE.Vector3(...c.ta);
    const fw = ta.clone().sub(ro).normalize();
    const rt = fw.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
    const up = rt.clone().cross(fw);
    const d = new THREE.Vector3(...p).sub(ro);
    const z = d.dot(fw);
    let ux = (d.dot(rt) / z) * c.focal, uy = (d.dot(up) / z) * c.focal;
    // undo roll (uv was rotated by roll before building the ray)
    const cr = Math.cos(-c.roll), sr = Math.sin(-c.roll);
    const rx = cr * ux + sr * uy, ry = -sr * ux + cr * uy; ux = rx; uy = ry;
    return { x: 960 + ux * 1080, y: 540 - uy * 1080, z };
  }
}

// ------------------------------------------------------------------ the crowd's unison pose (TS side)
import type { AudioData } from '@engine/audio';
import { yank, drawLyric, type LyricOpts } from './_look';
import { clamp, ease } from '@engine/util';

export interface Pose { limbs: [number, number, number, number]; head: [number, number, number]; lift: number; sway: number }

/**
 * One pose for the whole crowd (perfect puppet unison). `amp` scales the yank (stripped ~0.6, money ~1.4); the body
 * swings left/right on alternate beats (`swayAmt` radians); arms are pulled alternately. `mirror` swaps which
 * arm/knee is pulled on which beat (the lean is not mirrored, so neighbours never lean into each other).
 */
export function crowdPose(au: AudioData, t: number, amp: number, swayAmt: number, offbeats = false, mirror = false): Pose {
  const y = yank(au, t, offbeats);
  const b = au.beatAt(t);
  const bi = Math.floor(b), ph = b - bi;
  const side = bi % 2 === 0 ? 1 : -1;
  const arm = mirror ? -side : side;
  // lean: snaps to the new side over the first 35% of each beat
  const s = ease.outCubic(clamp(ph / 0.35, 0, 1));
  const sway = swayAmt * (-side + 2 * side * s);
  const up = y * amp;
  const armA = 0.12 + up * (arm > 0 ? 2.3 : 0.5);
  const armB = 0.12 + up * (arm > 0 ? 0.5 : 2.3);
  return {
    limbs: [armA, armB, 0.12 + up * (arm > 0 ? 0.55 : 0.1), 0.12 + up * (arm > 0 ? 0.1 : 0.55)],
    head: [sway * 0.8, 0, 0.22 * (1 - y) * Math.min(amp, 1)],
    lift: 0.04 + up * 0.14,
    sway,
  };
}
/**
 * Set the crowd pose. With `p2` and `vary` > 0, half the cells (by hash) take pose `p2` (same lift and lean, so give it
 * the same timing), and every cell scales its lift/lean by up to ±30% x `vary`. Without them: perfect unison.
 */
export function applyPose(st: Stage, p: Pose, p2?: Pose, vary = 0) {
  st.set('limbs', p.limbs); st.set('headP', p.head); st.set('bodyLift', p.lift); st.set('sway', p.sway);
  const q = p2 ?? p;
  st.set('limbs2', q.limbs); st.set('headP2', q.head); st.set('cellVar', p2 ? vary : 0);
}

/** The line containing `text` whose start falls in [t0, t1] (the chorus lines repeat: never take the first match). */
export function lineIn(ly: { lines: import('@engine/lyrics').Line[] }, text: string, t0: number, t1: number) {
  const norm = (s: string) => s.replace(/[’‘]/g, "'").toLowerCase();
  const l = ly.lines.find((x) => !x.backing && x.start >= t0 - 0.5 && x.start <= t1 && norm(x.text).includes(norm(text)));
  if (!l) throw new Error(`no line "${text}" in ${t0}..${t1}`);
  return l;
}

/**
 * Draw a sequence of lead lines with drawLyric, trimming each line's linger and the next line's anticipation so two
 * lines never share the screen (the chorus lines follow each other with no gap). `opt(line)` gives per-line options.
 */
export function drawLines(c: CanvasRenderingContext2D, lines: import('@engine/lyrics').Line[], t: number, opt: (l: import('@engine/lyrics').Line) => LyricOpts) {
  lines.forEach((l, i) => {
    const o = opt(l);
    const prev = lines[i - 1], next = lines[i + 1];
    const gapBefore = prev ? l.start - prev.end : 9;
    const gapAfter = next ? next.start - l.end : 9;
    const anticipate = Math.max(0, Math.min(o.anticipate ?? 0.35, gapBefore * 0.5));
    const linger = Math.max(0, Math.min(o.linger ?? 0.5, gapAfter * 0.5 - 0.01));
    drawLyric(c, l, t, { ...o, anticipate, linger });
  });
}
