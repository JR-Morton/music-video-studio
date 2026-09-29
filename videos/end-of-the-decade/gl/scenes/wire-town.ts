// wire plate: the toy town on a glossy floor, the string-sun, and (from above) many towns on a map for the network.
import * as THREE from 'three';
import { FSPass } from '@engine/gl';
import { aaPass } from './_aa';
import { LIN } from '@engine/palette';
import { GLSL_WIRE_CAM, camUniforms } from './wire-cam';

const v3 = (c: readonly number[]) => `vec3(${c.map((x) => x.toFixed(4)).join(', ')})`;

// coarse city grid: 7 x 5 cells of 10 m, centred so cell (3, 1) sits on the origin
export const CITY_CC = 10, CITY_NX = 7, CITY_NZ = 5, CITY_OX = -35, CITY_OZ = -15;

export interface City { x: number; z: number; r: number; lit: number }

export function makeTownPass() {
  const cities = Array.from({ length: CITY_NX * CITY_NZ }, () => new THREE.Vector4(0, 0, 0, 1e9));
  const pass = aaPass(/* glsl */ `
    uniform float onlyHome, t, day, skyDay, sunGlow, winAll, fogK;
    uniform vec3 sunPos, keyPos; uniform float sunR;
    uniform vec4 cities[${CITY_NX * CITY_NZ}];
    ${GLSL_WIRE_CAM}
    const float CS = 0.7;
    // house params for a cell: x = half width, y = body height, z = half depth, w = kind (0 none, 1 gable, 2 tower)
    vec4 houseAt(vec2 c, out float cityLit) {
      vec2 wc = (c + 0.5) * CS;
      vec2 cc = floor((wc - vec2(${CITY_OX}.0, ${CITY_OZ}.0)) / ${CITY_CC}.0);
      cityLit = 1e9;
      if (cc.x < 0.0 || cc.y < 0.0 || cc.x > ${CITY_NX - 1}.0 || cc.y > ${CITY_NZ - 1}.0) return vec4(0.0);
      vec4 ci = cities[int(cc.y) * ${CITY_NX} + int(cc.x)];
      if (ci.z <= 0.0 || onlyHome > 0.5 && ci.z < 4.0) return vec4(0.0);
      float d = length(wc - ci.xy) / ci.z;
      float h = hash12(c * 1.37 + 3.1);
      if (d > 1.0 || h < 0.18 + 0.5 * d * d) return vec4(0.0);
      if (abs(wc.x) < 0.5 && ci.xy == vec2(0.0)) return vec4(0.0); // the high street of the home town
      cityLit = ci.w;
      float h2 = hash12(c * 2.91 + 7.7), h3 = hash12(c * 0.73 - 1.3);
      float tall = (1.0 - d) * (1.0 - d);
      if (h2 > 0.86 - 0.25 * tall) return vec4(0.13 + 0.05 * h3, 0.45 + 0.9 * tall * h3 + 0.2 * h2, 0.13 + 0.05 * h2, 2.0);
      return vec4(0.16 + 0.07 * h3, 0.16 + 0.14 * h2 + 0.2 * tall, 0.13 + 0.08 * h, 1.0);
    }
    float houseSd(vec3 q, vec4 hp) {
      float body = sdBox(q - vec3(0.0, hp.y * 0.5, 0.0), vec3(hp.x, hp.y * 0.5, hp.z));
      if (hp.w > 1.5) return body;
      vec3 r = q - vec3(0.0, hp.y, 0.0);
      r.xy = rot2(0.785398) * r.xy;
      float roof = max(sdBox(r, vec3(hp.x * 0.72, hp.x * 0.72, hp.z + 0.015)), -(q.y - hp.y));
      return min(body, roof);
    }
    vec2 map(vec3 p) {
      vec2 res = vec2(p.y, 9.0);
      vec2 c = floor(p.xz / CS);
      vec2 q2 = p.xz - (c + 0.5) * CS;
      float cl; vec4 hp = houseAt(c, cl);
      float dBound = CS * 0.5 - max(abs(q2.x), abs(q2.y)) + CS * 0.14;
      float dh = hp.w > 0.5 ? houseSd(vec3(q2.x, p.y, q2.y), hp) : 1e9;
      float d = max(p.y - 1.45, min(dh, max(dBound, 0.02)));
      if (d < res.x) res = vec2(d, 20.0);
      return res;
    }
    vec2 march(vec3 ro, vec3 rd, float tmax) {
      float tt = 0.0;
      for (int i = 0; i < 110; i++) {
        vec3 p = ro + rd * tt;
        vec2 h = map(p);
        if (h.x < 0.0008 * max(1.0, tt)) return vec2(tt, h.y);
        tt += h.x;
        if (tt > tmax || p.y > 3.0 && rd.y > 0.0) break;
      }
      return vec2(-1.0, 0.0);
    }
    vec3 nrm(vec3 p) {
      const vec2 e = vec2(0.0008, -0.0008);
      return normalize(e.xyy * map(p + e.xyy).x + e.yyx * map(p + e.yyx).x + e.yxy * map(p + e.yxy).x + e.xxx * map(p + e.xxx).x);
    }
    float shadow(vec3 ro, vec3 rd) {
      float res = 1.0, tt = 0.02;
      for (int i = 0; i < 40; i++) {
        vec3 p = ro + rd * tt;
        if (p.y > 1.5) break;
        float h = map(p).x;
        res = min(res, 10.0 * h / tt);
        tt += clamp(h, 0.02, 0.4);
        if (res < 0.01) break;
      }
      return clamp(res, 0.0, 1.0);
    }
    vec3 sky(vec3 rd) {
      vec3 night = mix(C_INK * 0.5, C_INK2 * 1.2, smoothstep(-0.1, 0.4, rd.y));
      vec3 morn = mix(C_LILAC * 0.55 + C_BONE * 0.1, C_LILAC * 0.28 + C_INK2 * 0.4, smoothstep(0.0, 0.5, rd.y));
      vec3 c = mix(night, morn, skyDay);
      vec3 sd = normalize(sunPos - camRo);
      float g = max(dot(rd, sd), 0.0);
      c += C_SIGNAL * (pow(g, 200.0) * 0.5 + pow(g, 12.0) * 0.06) * sunGlow;
      return c;
    }
    // sun: ray/sphere, returns hit distance or -1
    float sunHit(vec3 ro, vec3 rd) {
      vec3 oc = ro - sunPos; float b = dot(oc, rd), c = dot(oc, oc) - sunR * sunR, h = b * b - c;
      return h < 0.0 ? -1.0 : -b - sqrt(h);
    }
    vec3 sunShade(vec3 ro, vec3 rd, float ts) {
      vec3 n = normalize(ro + rd * ts - sunPos);
      float f = pow(1.0 - max(dot(n, -rd), 0.0), 2.0);
      // a painted prop sun: glossy caution-yellow ball, hot core, a highlight ring
      return mix(C_EMBER * 1.5, C_SIGNAL * 0.95, smoothstep(0.2, 0.9, f)) * (0.8 + 0.2 * sunGlow) + vec3(1.0) * pow(max(dot(reflect(rd, n), normalize(vec3(0.3, 0.8, -0.5))), 0.0), 40.0) * 2.0;
    }
    void main() {
      vec2 uv = (vUv - 0.5) * vec2(16.0 / 9.0, 1.0);
      vec3 ro = camRo, rd = camRay(uv);
      vec2 h = march(ro, rd, 90.0);
      float ts = sunHit(ro, rd);
      vec3 col;
      if (h.x < 0.0) {
        col = sky(rd);
        if (ts > 0.0) col = sunShade(ro, rd, ts);
      } else {
        vec3 p = ro + rd * h.x;
        vec3 n = h.y > 10.0 ? nrm(p) : vec3(0.0, 1.0, 0.0);
        vec3 ld = normalize(keyPos - p);
        vec3 keyC = mix(C_SIGNAL, C_EMBER, 0.5) * (0.25 + 2.6 * day);
        float ndl = max(dot(n, ld), 0.0);
        float sh = ndl > 0.0 ? shadow(p + n * 0.004, ld) : 0.0;
        vec3 alb; float spec = 0.0, rough = 0.5;
        vec3 emit = vec3(0.0);
        if (h.y > 10.0) {
          vec2 c = floor(p.xz / CS); float cl; vec4 hp = houseAt(c, cl);
          vec2 q2 = p.xz - (c + 0.5) * CS;
          bool roof = p.y > hp.y + 0.003 && hp.w < 1.5 || n.y > 0.7;
          float hv = hash12(c + 11.0);
          alb = roof ? mix(C_LILAC * 0.55, C_LILAC * 0.3 + C_ASH * 0.2, hv) : mix(C_BONE * 0.85, C_LILAC * 0.8, 0.25 + 0.3 * hv);
          if (roof && hv > 0.8) alb = C_ASH * 0.55;
          spec = 0.5; rough = 0.3;
          // windows: a grid on the walls, lit (caution yellow) when the post reaches this town
          if (!roof && abs(n.y) < 0.3) {
            float u = abs(n.x) > 0.5 ? q2.y : q2.x;
            vec2 wg = vec2(u / 0.075, (p.y - 0.03) / 0.09);
            vec2 wf = abs(fract(wg) - 0.5);
            float win = step(wf.x, 0.22) * step(wf.y, 0.2) * step(0.5, p.y / 0.09) * step(p.y, hp.y - 0.05);
            float lit = smoothstep(cl, cl + 0.25, t + 0.4 * hash12(floor(wg) + c * 3.0)) * step(0.35, hash12(floor(wg) * 1.7 + c));
            lit = max(lit, winAll * step(0.75, hash12(floor(wg) * 2.3 + c)));
            alb = mix(alb, C_INK2 * 0.6, win);
            emit = C_SIGNAL * 2.4 * win * lit;
          }
        } else {
          alb = mix(C_INK2 * 1.0, C_LILAC * 0.12, skyDay);
          spec = 0.9; rough = 0.15;
          // the home town's high street: a pale strip of paving
          if (abs(p.x) < 0.33 && length(p.xz) < 4.8) alb = mix(alb, C_ASH * 0.4, 0.6);
        }
        vec3 hl = normalize(ld - rd);
        vec3 c = alb * ndl * sh * keyC;
        c += alb * mix(C_INK2 * 1.5, C_LILAC * 0.3, skyDay) * (0.35 + 0.65 * max(n.y, 0.0));
        c += keyC * pow(max(dot(n, hl), 0.0), mix(200.0, 20.0, rough)) * spec * sh * 0.6;
        // floor: glossy reflection of the sky and the sun
        if (h.y < 10.0) {
          vec3 rr = reflect(rd, n);
          vec3 refl = sky(rr);
          float tsr = sunHit(p, rr);
          if (tsr > 0.0) refl = sunShade(p, rr, tsr);
          float fres = 0.08 + 0.5 * pow(1.0 - max(dot(-rd, n), 0.0), 4.0);
          c += refl * fres * (0.4 + 0.6 * sh);
        }
        col = c + emit;
        // distance haze toward the sky colour
        col = mix(col, sky(rd), 1.0 - exp(-h.x * fogK));
        if (ts > 0.0 && ts < h.x) col = sunShade(ro, rd, ts);
      }
      fragColor = vec4(col, 1.0);
    }`, {
    ...camUniforms(),
    onlyHome: { value: 0 }, t: { value: 0 }, day: { value: 0 }, skyDay: { value: 0 }, sunGlow: { value: 1 }, winAll: { value: 0 }, fogK: { value: 0.02 },
    sunPos: { value: new THREE.Vector3(0, -5, 40) }, keyPos: { value: new THREE.Vector3(0, 10, 40) }, sunR: { value: 2.5 },
    cities: { value: cities },
  });
  return { pass, cities };
}

export const _unused = v3(LIN.ink);
