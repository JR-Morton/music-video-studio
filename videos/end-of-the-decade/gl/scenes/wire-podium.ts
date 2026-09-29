// wire plate, shots "podium" + "huddle": the steps of a grand building. The boss (grey suit) at a podium pats the air
// while the metronome on the podium slows down (the band doesn't); then the two rival groups (red suits screen-left,
// blue suits screen-right) stop squabbling and slide in to huddle round him for the photo.
import * as THREE from 'three';
import { FSPass } from '@engine/gl';
import { aaPass } from './_aa';
import { GLSL_CAST_SDF, GLSL_CAST_SHADE } from './_cast';
import { GLSL_WIRE_CAM, camUniforms } from './wire-cam';
import { GLSL_WIRE_SHADE } from './wire-puppet';

export const PODIUM = { x: 0, y: 0.52, z: 0.62, hx: 0.4, hy: 0.52, hz: 0.2 };
export const METRO = { x: 0.24, y: 1.04, z: 0.6 };

export function makePodiumPass() {
  const P = PODIUM, M = METRO;
  return aaPass(/* glsl */ `
    uniform float rivYaw, t, lift, bossArm, bossNod, metro, gl, gr, gz, sp, rivArm, rivLift, rivHead, flashK, spill;
    ${GLSL_WIRE_CAM}
    ${GLSL_CAST_SDF}
    const vec3 BOSS = vec3(0.0, 0.0, 0.12);
    vec3 bossLocal(vec3 p) { return p - BOSS - vec3(0.0, 0.04 * lift, 0.0); }
    // one-handed pat: the right hand (+x) would pat straight through the metronome, so it hangs behind the podium
    // with a small twitch on the pat (hand ~z 0.35, clear of the podium's back face at z 0.42)
    vec4 bossLimbs() { return vec4(bossArm, 0.18 + 0.08 * clamp((bossArm - 0.95) / 0.3, 0.0, 1.0), 0.0, 0.0); }
    vec3 bossHead() { return vec3(bossNod, 0.0, 0.0); }
    // rival groups: 3 figures per group by domain repetition
    vec3 rivLocalId(vec3 p, float gc, float id) {
      vec3 q = p - vec3(gc, 0.0, gz);
      q.x -= id * sp;
      q.z += abs(id) * 0.18;
      q.xz = rot2(-sign(gc) * rivYaw) * q.xz;
      q.y -= 0.05 * rivLift * (0.7 + 0.3 * sin(id * 2.0 + gc));
      return q;
    }
    vec3 rivLocal(vec3 p, float gc, out float id) {
      vec3 q = p - vec3(gc, 0.0, gz);
      id = clamp(floor(q.x / sp + 0.5), -1.0, 1.0);
      q.x -= id * sp;
      q.z += abs(id) * 0.18;
      q.xz = rot2(-sign(gc) * rivYaw) * q.xz;
      q.y -= 0.05 * rivLift * (0.7 + 0.3 * sin(id * 2.0 + gc));
      return q;
    }
    vec4 rivLimbs(float id, float side) {
      float ph = sin(t * 9.0 + id * 2.1 + side);
      return vec4(rivArm + 0.35 * ph * (1.0 - flashK), rivArm - 0.35 * ph * (1.0 - flashK), 0.1 * ph, -0.1 * ph);
    }
    vec3 rivHeadV(float id, float side) { return vec3(0.1, -side * rivHead * (0.6 + 0.2 * id * side), 0.0); }
    float sdMetro(vec3 p, out float m) {
      vec3 q = (p - vec3(${M.x}, ${M.y}, ${M.z})) / 1.5;
      float bb = (length(q - vec3(0.0, 0.18, 0.0)) - 0.3) * 1.5;
      m = MAT_FLOOR;
      if (bb > 0.05) return bb;
      // tapered body
      float h = 0.3, taper = 1.0 - 0.6 * clamp(q.y / h, 0.0, 1.0);
      float body = sdBox(vec3(q.x / taper, q.y - h * 0.5, q.z / taper), vec3(0.085, h * 0.5, 0.07)) * taper;
      body = max(body, -sdBox(q - vec3(0.0, 0.17, 0.07), vec3(0.028 * taper + 0.01, 0.1, 0.02))); // slot
      float d = body;
      // pendulum: pivot low on the front, swinging
      vec3 r = q - vec3(0.0, 0.05, 0.075);
      r.xy = rot2(metro) * r.xy;
      float rod = cs_cap(r, vec3(0.0), vec3(0.0, 0.33, 0.0), 0.005);
      float wt = sdBox(r - vec3(0.0, 0.22, 0.0), vec3(0.022, 0.02, 0.012));
      if (rod < d) { d = rod; m = MAT_CHROME; }
      if (wt < d) { d = wt; m = MAT_BRASS; }
      if (m == MAT_FLOOR) m = 41.0;
      return d * 1.5;
    }
    vec2 map(vec3 p) {
      // stage + three steps down toward the camera
      float st = min(min(max(p.y, p.z - 1.6), max(p.y + 0.18, p.z - 2.0)), min(max(p.y + 0.36, p.z - 2.4), p.y + 0.54));
      vec2 r = vec2(st, MAT_FLOOR);
      // back wall + columns
      r = opU(r, vec2(3.2 + p.z, MAT_PORCELAIN + 0.1));
      vec3 cq = p - vec3(0.0, 0.0, -2.6);
      cq.x = mod(cq.x + 0.9, 1.8) - 0.9;
      r = opU(r, vec2(max(length(cq.xz) - 0.26 + 0.012 * smoothstep(0.7, 1.0, abs(sin(atan(cq.z, cq.x) * 10.0))), -p.y), MAT_PORCELAIN));
      // podium + brass emblem
      vec3 pq = p - vec3(${P.x}, ${P.y}, ${P.z});
      r = opU(r, vec2(sdRBox(pq, vec3(${P.hx} - 0.03 * (pq.y / ${P.hy}), ${P.hy}, ${P.hz}), 0.02), 40.0));
      r = opU(r, vec2(cs_cyl((pq - vec3(0.0, -0.08, ${P.hz})).xzy, 0.012, 0.12), MAT_BRASS));
      float mm; float md = sdMetro(p, mm);
      r = opU(r, vec2(md, mm));
      // the boss
      vec3 bq = bossLocal(p);
      float bb = sdBox(bq - vec3(0.0, 1.0, 0.0), vec3(0.7, 1.0, 0.7));
      r = opU(r, bb < 0.2 ? sdMarionette(bq, bossLimbs(), bossHead(), 3.0) : vec2(bb, MAT_WOOD));
      for (int i = 0; i < 3; i++) { vec3 a = marionetteAnchor(i, bossLimbs(), bossHead()); r = opU(r, vec2(sdString(bq, a, a + vec3(0.0, 9.0, 0.0)), MAT_STRING)); }
      // the rivals
      for (int g = 0; g < 2; g++) {
        float side = g == 0 ? -1.0 : 1.0;
        float gc = g == 0 ? gl : gr;
        // the bounds are tall columns (y -0.1..11.2), not figure-sized boxes: the control strings run 9 m up from their
        // attach points, and a figure-height bound (top ~2.3 m) cut them off in mid-air
        float gb = sdBox(p - vec3(gc, 5.55, gz), vec3(sp * 1.5 + 0.6, 5.65, 0.8));
        if (gb > 0.2) { r = opU(r, vec2(gb, MAT_WOOD)); continue; }
        // all three figures, not just the nearest cell: at the huddle spacing (0.46 m) the swinging arms reach past the
        // cell edge, and a one-cell field sliced them (and let rays stride into the neighbour)
        for (int k = 0; k < 3; k++) {
          float id = float(k) - 1.0;
          vec3 q = rivLocalId(p, gc, id);
          float fcol = sdBox(q - vec3(0.0, 5.55, 0.0), vec3(0.75, 5.7, 0.8));
          if (fcol > 0.2) { r = opU(r, vec2(fcol, MAT_WOOD)); continue; }
          vec4 L = rivLimbs(id, side); vec3 hd = rivHeadV(id, side);
          float fb = sdBox(q - vec3(0.0, 1.0, 0.0), vec3(0.75, 1.15, 0.8));   // the figure itself (strings excluded)
          r = opU(r, fb > 0.2 ? vec2(fb, MAT_WOOD) : sdMarionette(q, L, hd, 0.0));
          for (int i = 0; i < 3; i++) { vec3 a = marionetteAnchor(i, L, hd); r = opU(r, vec2(sdString(q, a, a + vec3(0.0, 9.0, 0.0)), MAT_STRING)); }
        }
      }
      return r;
    }
    ${GLSL_CAST_SHADE}
    ${GLSL_WIRE_SHADE}
    vec4 costumeAt(vec3 p) {
      vec3 bq = bossLocal(p);
      if (abs(bq.x) < 0.42 && abs(bq.z) < 0.4) {
        if (bq.y > 0.3 && bq.y < 1.47) {
          vec3 suit = C_ASH * 0.55;
          if (abs(bq.x) < 0.028 && bq.z > 0.05 && bq.y > 1.05 && bq.y < 1.42) suit = C_BLOOD * 0.9; // the tie
          return vec4(suit, 1.0);
        }
        return vec4(0.0);
      }
      for (int g = 0; g < 2; g++) {
        float gc = g == 0 ? gl : gr;
        if (abs(p.x - gc) > sp * 1.5 + 0.7) continue;
        float id; vec3 q = rivLocal(p, gc, id);
        if (q.y > 0.3 && q.y < 1.47) return vec4(g == 0 ? vec3(0.55, 0.06, 0.05) : vec3(0.05, 0.16, 0.5), 1.0);
      }
      return vec4(0.0);
    }
    void main() {
      vec2 uv = (vUv - 0.5) * vec2(16.0 / 9.0, 1.0);
      vec3 ro = camRo, rd = camRay(uv);
      StageLight key = StageLight(vec3(1.2, 6.5, 3.2), normalize(vec3(0.0, 1.0, 0.4) - vec3(1.2, 6.5, 3.2)), mix(C_SIGNAL, vec3(1.0), 0.5) * (4.2 + 5.0 * flashK), mix(0.955, 0.9, spill));
      StageLight fill = StageLight(vec3(-3.0, 2.5, 3.5), vec3(0.0), C_LILAC * (0.35 + 2.0 * flashK), -1.0);
      StageLight rim = StageLight(vec3(0.0, 3.5, -2.0), vec3(0.0), vec3(0.6, 0.65, 1.0) * 2.4, -1.0);
      vec2 h = castMarch(ro, rd, 30.0);
      vec3 col = C_INK * 0.3;
      if (h.x > 0.0) {
        vec3 p = ro + rd * h.x, n = castNormal(p);
        float id = floor(h.y + 0.001);
        if (id == 41.0) {
          col = wShade(p, n, rd, MAT_CHROME, vec4(C_INK2 * 0.5, 1.0), key, fill, rim) + C_BRASS * 0.25 * smoothstep(0.004, 0.0, abs(fract(p.y * 30.0) - 0.5) - 0.46);
        } else if (id == 40.0) {
          // podium: glossy navy lacquer with a brass edge line
          vec3 pq = p - vec3(${P.x}, ${P.y}, ${P.z});
          vec4 cost = vec4(C_INK2 * 1.4, 1.0);
          col = wShade(p, n, rd, MAT_CHROME, cost, key, fill, rim);
          col += C_BRASS * 1.2 * smoothstep(0.012, 0.0, abs(pq.y - (${P.hy} - 0.06))) * step(0.5, n.z);
        } else if (id == MAT_PORCELAIN) {
          // the building: porcelain wall and columns, a warm pool of light
          col = wShade(p, n, rd, h.y, vec4(0.0), key, fill, rim) * (h.y > MAT_PORCELAIN + 0.05 ? 0.3 : 0.5);
        } else {
          col = wShade(p, n, rd, h.y, id == MAT_WOOD ? costumeAt(p) : vec4(0.0), key, fill, rim);
        }
        col = mix(col, C_INK * 0.3, smoothstep(12.0, 28.0, h.x));
      }
      col += mix(C_SIGNAL, vec3(1.0), 0.5) * coneHaze(ro, rd, h.x > 0.0 ? min(h.x, 12.0) : 12.0, key, 12) * 0.025;
      fragColor = vec4(col, 1.0);
    }`, {
    ...camUniforms(),
    t: { value: 0 }, lift: { value: 0 }, bossArm: { value: 0 }, bossNod: { value: 0 }, metro: { value: 0 },
    rivYaw: { value: 0 }, gl: { value: -4 }, gr: { value: 4 }, gz: { value: 0.4 }, sp: { value: 0.6 }, rivArm: { value: 0 }, rivLift: { value: 0 }, rivHead: { value: 0 },
    flashK: { value: 0 }, spill: { value: 0 },
  });
}
