// Cast model sheet: the 4 tin robots (one mid-walk), a marionette in 3 poses with strings, the cuffed hand relaxed
// and pinching, on the glossy navy stage under a caution-yellow-white key + lilac fill + cool rim.
// Views by time: t < 10.6 wide sheet · 10.6..12 robots · 12..13 marionettes · >= 13 hands.
// bun scripts/render.ts stills --video end-of-the-decade --sheet castsheet --t 10,11.3,12.5,13.8 --out ../../videos/end-of-the-decade/gl/out/wip/cast
import * as THREE from 'three';
import { Scene, type Frame } from '@engine/scene';
import { FSPass } from '@engine/gl';
import { GLSL_CAST_SDF, GLSL_CAST_SHADE } from './_cast';
import { GRADE, clockwork, yank } from './_look';

export default class CastSheet extends Scene {
  stage = new FSPass(/* glsl */ `
    uniform float t, walk, lift, view;
    ${GLSL_CAST_SDF}
    const vec4 LA = vec4(0.06, -0.04, 0.02, -0.03);  const vec3 HA = vec3(0.05, 0.0, 0.3);
    const vec4 LC = vec4(-0.35, 0.25, -0.25, 0.35);  const vec3 HC = vec3(-0.3, 0.2, 0.65);
    vec4 limbsB() { return vec4(2.3 + 0.3 * lift, 0.5 + 0.4 * lift, 0.8 * lift + 0.4, -0.05); }
    vec3 headB() { return vec3(0.25, 0.35, -0.1 + 0.1 * lift); }
    vec2 hand(vec3 p, vec3 at, float s, float ry, float pinch, float v) { vec3 q = (p - at) / s; q.xz = cs_rot(ry) * q.xz; vec2 h = sdHand(q, pinch, v); h.x *= s; return h; }
    vec3 pinchAt() { vec3 l = vec3(0.034, -0.128, 0.074); l.xz = cs_rot(1.1) * l.xz; return vec3(0.3, 0.92, 1.0) + l * 1.6; }
    vec2 map(vec3 p) {
      vec2 r = vec2(p.y, MAT_FLOOR);
      r = opU(r, sdTinRobot(p - vec3(-2.25, 0.0, 1.0), walk, 0.35, 0.0));
      r = opU(r, sdTinRobot(p - vec3(-1.7, 0.0, 1.05), 0.0, -0.25, 1.0));
      r = opU(r, sdTinRobot(p - vec3(-1.15, 0.0, 1.0), 0.0, 0.5, 2.0));
      r = opU(r, sdTinRobot(p - vec3(-0.6, 0.0, 1.05), 0.0, -0.1, 3.0));
      r = opU(r, hand(p, vec3(-0.12, 0.92, 1.0), 1.6, 0.6, 0.0, 0.0));
      r = opU(r, hand(p, vec3(0.3, 0.92, 1.0), 1.6, -1.1, 1.0, 1.0));
      r = opU(r, vec2(sdString(p, pinchAt(), vec3(0.35, -0.2, 1.1)), MAT_STRING));
      // marionettes
      vec3 m1 = p - vec3(0.95, 0.03, -0.4);
      r = opU(r, sdMarionette(m1, LA, HA, 0.0));
      vec4 lb = limbsB(); vec3 hb = headB();
      vec3 m2 = p - vec3(1.75, 0.03 + 0.12 * lift + 0.1, -0.6);
      m2.xz = cs_rot(0.35) * m2.xz;
      r = opU(r, sdMarionette(m2, lb, hb, 1.0));
      vec3 m3 = p - vec3(2.55, 0.06, -0.4);
      m3.xz = cs_rot(-0.3) * m3.xz;
      r = opU(r, sdMarionette(m3, LC, HC, 2.0));
      if (p.x < 0.45) r.x = min(r.x, 0.5 - p.x); else {
        for (int i = 0; i < 5; i++) {
          vec3 a = marionetteAnchor(i, LA, HA); r = opU(r, vec2(sdString(m1, a, vec3(a.x * 0.4, 7.0, a.z + 0.3)), MAT_STRING));
          a = marionetteAnchor(i, lb, hb); r = opU(r, vec2(sdString(m2, a, vec3(a.x * 0.4, 7.0, a.z + 0.3)), MAT_STRING));
          a = marionetteAnchor(i, LC, HC); r = opU(r, vec2(sdString(m3, a, vec3(a.x * 0.4, 7.0, a.z + 0.3)), MAT_STRING));
        }
      }
      return r;
    }
    #define CAST_REFLECT
    ${GLSL_CAST_SHADE}
    void main() {
      vec2 uv = (vUv - 0.5) * vec2(16.0 / 9.0, 1.0);
      vec3 ro, ta; float fl;
      if (view < 0.5) { ro = vec3(0.2, 1.45, 6.4); ta = vec3(0.15, 0.85, 0.0); fl = 1.6; }
      else if (view < 1.5) { ro = vec3(-1.35, 0.8, 3.3); ta = vec3(-1.3, 0.42, 1.0); fl = 1.7; }
      else if (view < 2.5) { ro = vec3(1.75, 1.4, 3.6); ta = vec3(1.75, 1.0, -0.5); fl = 1.5; }
      else { ro = vec3(0.09, 0.78, 2.15); ta = vec3(0.09, 0.8, 1.0); fl = 1.6; }
      vec3 fw = normalize(ta - ro), rt = normalize(cross(fw, vec3(0, 1, 0))), up = cross(rt, fw);
      vec3 rd = normalize(fw * fl + rt * uv.x + up * uv.y);
      StageLight key = StageLight(vec3(-0.8, 5.5, 3.0), normalize(vec3(0.15, -1.0, -0.5)), mix(C_SIGNAL, vec3(1.0), 0.35) * 7.0, 0.88);
      StageLight fill = StageLight(vec3(4.0, 2.5, 4.0), vec3(0.0), C_LILAC * 1.2, -1.0);
      StageLight rim = StageLight(vec3(-1.0, 3.0, -4.0), vec3(0.0), vec3(0.6, 0.7, 1.0) * 2.5, -1.0);
      vec2 h = castMarch(ro, rd, 30.0);
      vec3 col = C_INK * 0.4;
      if (h.x > 0.0) {
        vec3 p = ro + rd * h.x, n = castNormal(p);
        col = stageShade(p, n, rd, h.y, key, fill, rim);
        col = mix(col, C_INK * 0.4, smoothstep(8.0, 20.0, h.x));
      }
      float cone = 0.0;
      for (int i = 0; i < 24; i++) {
        float s = (float(i) + 0.5) / 24.0 * min(h.x > 0.0 ? h.x : 12.0, 12.0);
        vec3 q = ro + rd * s; vec3 ld = normalize(q - key.pos);
        cone += smoothstep(key.cone, mix(key.cone, 1.0, 0.3), dot(ld, key.dir)) / 24.0;
      }
      col += C_SIGNAL * cone * 0.03;
      fragColor = vec4(col, 1.0);
    }`, { t: { value: 0 }, walk: { value: 0 }, lift: { value: 0 }, view: { value: 0 } });

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, audio } = this.ctx;
    this.stage.u.t!.value = f.t;
    this.stage.u.walk!.value = clockwork(f.t, 5.3) * 1.2 + 0.9;
    this.stage.u.lift!.value = yank(audio, f.t);
    this.stage.u.view!.value = f.t < 10.6 ? 0 : f.t < 12 ? 1 : f.t < 13 ? 2 : 3;
    this.stage.render(renderer, out);
    return { ...GRADE.spot, rays: 0.25, raysAt: [0.35, 1.2] as [number, number] };
  }
}
