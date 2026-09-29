// Look test / model sheet: the cast under a stage spotlight + a lyric with its cast shadow and the backing echo.
// bun scripts/render.ts stills --video end-of-the-decade --sheet looktest --t 38,40 --out ../../videos/end-of-the-decade/gl/out/wip/looktest
import * as THREE from 'three';
import { Scene, type Frame } from '@engine/scene';
import { FSPass, Layer2D } from '@engine/gl';
import { GLSL_CAST_SDF, GLSL_CAST_SHADE } from './_cast';
import { GRADE, drawLyric, drawEcho, clockwork, yank } from './_look';

export default class LookTest extends Scene {
  stage = new FSPass(/* glsl */ `
    uniform float t, walk, lift;
    ${GLSL_CAST_SDF}
    vec2 map(vec3 p) {
      vec2 r = vec2(p.y, MAT_FLOOR);
      r = opU(r, sdTinRobot(p - vec3(-0.9, 0.0, 0.6), walk, 0.4, 0.0));
      r = opU(r, sdTinRobot(p - vec3(-0.35, 0.0, 0.9), walk + 1.7, -0.3, 1.0));
      r = opU(r, sdTinRobot(p - vec3(0.2, 0.0, 1.0), walk + 3.1, 0.0, 2.0));
      vec4 limbs = vec4(-0.5 - lift * 0.6, 0.3 + lift * 0.5, 0.15 * lift, -0.1);
      vec3 mp = p - vec3(1.0, 0.08 * lift, -0.4);
      r = opU(r, sdMarionette(mp, limbs, vec3(0.1, -0.2, 0.0), 0.0));
      for (int i = 0; i < 5; i++) { vec3 a = marionetteAnchor(i, limbs, vec3(0.1, -0.2, 0.0)); r = opU(r, vec2(sdString(mp, a, a + vec3(0.0, 6.0, 0.0)), MAT_STRING)); }
      r = opU(r, sdHand(p - vec3(1.0, 2.35, -0.4), 0.6, 0.0));
      return r;
    }
    ${GLSL_CAST_SHADE}
    void main() {
      vec2 uv = (vUv - 0.5) * vec2(16.0 / 9.0, 1.0);
      vec3 ro = vec3(0.3, 1.25, 4.2), ta = vec3(0.1, 0.75, 0.0);
      vec3 fw = normalize(ta - ro), rt = normalize(cross(fw, vec3(0, 1, 0))), up = cross(rt, fw);
      vec3 rd = normalize(fw * 1.6 + rt * uv.x + up * uv.y);
      StageLight key = StageLight(vec3(-0.6, 5.5, 2.0), normalize(vec3(0.15, -1.0, -0.45)), mix(C_SIGNAL, vec3(1.0), 0.35) * 7.0, 0.93);
      StageLight fill = StageLight(vec3(3.0, 2.5, 4.0), vec3(0.0), C_LILAC * 1.2, -1.0);
      StageLight rim = StageLight(vec3(0.0, 3.0, -4.0), vec3(0.0), vec3(0.6, 0.7, 1.0) * 2.0, -1.0);
      vec2 h = castMarch(ro, rd, 30.0);
      vec3 col = C_INK * 0.4;
      if (h.x > 0.0) {
        vec3 p = ro + rd * h.x, n = castNormal(p);
        col = stageShade(p, n, rd, h.y, key, fill, rim);
        col = mix(col, C_INK * 0.4, smoothstep(8.0, 20.0, h.x));
      }
      // haze in the spotlight cone
      float cone = 0.0;
      for (int i = 0; i < 24; i++) {
        float s = (float(i) + 0.5) / 24.0 * min(h.x > 0.0 ? h.x : 12.0, 12.0);
        vec3 q = ro + rd * s; vec3 ld = normalize(q - key.pos);
        cone += smoothstep(key.cone, mix(key.cone, 1.0, 0.3), dot(ld, key.dir)) / 24.0;
      }
      col += C_SIGNAL * cone * 0.06;
      fragColor = vec4(col, 1.0);
    }`, { t: { value: 0 }, walk: { value: 0 }, lift: { value: 0 } });
  text = new Layer2D();

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp, lyrics, audio } = this.ctx;
    this.stage.u.t!.value = f.t;
    this.stage.u.walk!.value = clockwork(f.t, 5.3) * 1.2;
    this.stage.u.lift!.value = yank(audio, f.t);
    this.stage.render(renderer, out);
    const c = this.text.ctx; this.text.clear();
    const line = lyrics.lineAt(f.t) ?? lyrics.lastLine(f.t);
    if (line) drawLyric(c, line, f.t, { x: 960, y: 250, size: 84, align: 'center', light: { x: 700, y: -200 }, shadow: 260 });
    drawEcho(c, lyrics, f.t, { x: 960, y: 380, size: 26 });
    comp.draw(renderer, this.text.upload(), out);
    return { ...GRADE.spot, raysAt: [0.42, 1.25] as [number, number] };
  }
}
