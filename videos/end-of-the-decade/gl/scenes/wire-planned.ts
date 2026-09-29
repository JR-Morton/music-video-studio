// wire plate, shot "planned": the other side (a marionette in a loud checked blazer, screen-left) swings into an
// accusing point while a huge marquee sign PLANNED bangs on behind him, letter by letter, screen-left.
import * as THREE from 'three';
import { FSPass } from '@engine/gl';
import { aaPass } from './_aa';
import { F, font, fitSize, layout } from '@engine/type';
import { GLSL_CAST_SDF, GLSL_CAST_SHADE } from './_cast';
import { GLSL_WIRE_CAM, camUniforms } from './wire-cam';
import { GLSL_WIRE_SHADE } from './wire-puppet';

export const SIGN = { cx: -2.3, cy: 2.75, cz: -2.0, hx: 2.5, hy: 0.62, hz: 0.12, yaw: 0.38 };

export function makeSignTexture() {
  const cv = document.createElement('canvas');
  cv.width = 2048; cv.height = 512;
  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false; tex.flipY = true;
  const c = cv.getContext('2d')!;
  const word = 'PLANNED';
  const fam = F.display(900);
  const size = Math.min(330, fitSize(word, fam, 2048 - 300, 400, 20));
  const L = layout(word, fam, size, 20);
  const x0 = (2048 - L.width) / 2, base = 256 + size * 0.36;
  /** letters: per-letter brightness 0..1; bulbs: chase phase (<0 = off) */
  const draw = (letters: number[], chase: number, bulbsOn: number) => {
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = '#000'; c.fillRect(0, 0, 2048, 512);
    c.globalCompositeOperation = 'lighter';
    c.font = font(fam, size);
    (c as any).letterSpacing = '0px';
    for (let i = 0; i < word.length; i++) {
      const v = Math.round(40 + 215 * (letters[i] ?? 0));
      c.fillStyle = `rgb(${v},0,0)`;
      c.fillText(word[i]!, x0 + L.glyphs[i]!.x, base);
    }
    // marquee bulbs round the border (green channel), chasing
    const pts: [number, number][] = [];
    const m = 44, sp = 62;
    for (let x = m; x <= 2048 - m; x += sp) { pts.push([x, m]); }
    for (let y = m + sp; y <= 512 - m; y += sp) pts.push([2048 - m, y]);
    for (let x = 2048 - m; x >= m; x -= sp) pts.push([x, 512 - m]);
    for (let y = 512 - m - sp; y > m; y -= sp) pts.push([m, y]);
    pts.forEach(([x, y], i) => {
      const on = bulbsOn * (chase < 0 ? 0 : ((i + Math.floor(chase)) % 3 === 0 ? 0.25 : 1));
      const v = Math.round(50 + 205 * on);
      c.fillStyle = `rgb(0,${v},0)`;
      c.beginPath(); c.arc(x, y, 15, 0, Math.PI * 2); c.fill();
    });
    tex.needsUpdate = true;
  };
  return { tex, draw };
}

export function makePlannedPass(signTex: THREE.Texture) {
  const S = SIGN;
  return aaPass(/* glsl */ `
    uniform float t, lit, lift, armR, armL, headYaw, figYaw;
    uniform vec3 figPos;
    uniform sampler2D signTex;
    ${GLSL_WIRE_CAM}
    ${GLSL_CAST_SDF}
    const vec3 SC = vec3(${S.cx}, ${S.cy}, ${S.cz});
    const vec3 SH = vec3(${S.hx}, ${S.hy}, ${S.hz});
    vec3 signLocal(vec3 p) { vec3 q = p - SC; q.xz = rot2(${S.yaw}) * q.xz; return q; }
    vec3 figLocal(vec3 p) { vec3 q = p - figPos - vec3(0.0, 0.06 * lift, 0.0); q.xz = rot2(figYaw) * q.xz; return q; }
    vec4 limbsNow() { return vec4(armL, armR, 0.12 * lift, -0.1 * lift); }
    vec2 map(vec3 p) {
      vec2 r = vec2(p.y, MAT_FLOOR);
      r = opU(r, vec2(4.2 + p.z, 30.0)); // back wall (curtain)
      vec3 sq = signLocal(p);
      r = opU(r, vec2(sdRBox(sq, SH, 0.04), 31.0));
      // sign's hanging rods: up out of frame
      r = opU(r, vec2(length(vec2(abs(sq.x) - SH.x * 0.8, sq.z)) - 0.012 + max(0.0, -(sq.y - SH.y)) * 1e3, MAT_CHROME));
      vec3 q = figLocal(p);
      vec3 head = vec3(0.05, headYaw, 0.0);
      vec4 L = limbsNow();
      float bb = sdBox(q - vec3(0.0, 1.0, 0.0), vec3(0.95, 1.05, 0.95));
      if (bb < 0.3) r = opU(r, sdMarionette(q, L, head, 1.0));
      else r = opU(r, vec2(bb, MAT_WOOD));
      for (int i = 0; i < 3; i++) {
        vec3 a = marionetteAnchor(i, L, head);
        r = opU(r, vec2(sdString(q, a, a + vec3(0.0, 8.0, 0.0)) - 0.002, MAT_STRING));
      }
      return r;
    }
    ${GLSL_CAST_SHADE}
    ${GLSL_WIRE_SHADE}
    vec3 signEmit(vec2 suv) {
      vec4 tx = texture(signTex, suv);
      return tx.r * mix(C_BONE, C_EMBER, 0.35) * (0.04 + 1.25 * lit) + tx.g * C_SIGNAL * 1.8 * lit;
    }
    void main() {
      vec2 uv = (vUv - 0.5) * vec2(16.0 / 9.0, 1.0);
      vec3 ro = camRo, rd = camRay(uv);
      StageLight key = StageLight(vec3(2.2, 6.0, 3.0), normalize(figPos + vec3(0.0, 1.0, 0.0) - vec3(2.2, 6.0, 3.0)), mix(C_SIGNAL, vec3(1.0), 0.45) * 7.5, 0.95);
      vec3 sFront = SC; vec3 sN = vec3(0.0, 0.0, 1.0); sN.xz = rot2(-${S.yaw}) * sN.xz;
      StageLight fill = StageLight(sFront + sN * 1.2 + vec3(0.0, -0.6, 0.0), vec3(0.0), mix(C_LILAC * 0.5, C_EMBER * 3.2, lit), -1.0);
      StageLight rim = StageLight(vec3(-1.0, 3.5, -3.5), vec3(0.0), vec3(0.55, 0.6, 1.0) * 2.2, -1.0);
      vec2 h = castMarch(ro, rd, 25.0);
      vec3 col = C_INK * 0.3;
      if (h.x > 0.0) {
        vec3 p = ro + rd * h.x, n = castNormal(p);
        float id = floor(h.y + 0.001);
        if (id == 30.0) {
          // curtain: deep navy velvet folds, lit by the sign
          float fold = 0.5 + 0.5 * sin(p.x * 7.0 + sin(p.x * 2.3) * 1.5);
          vec3 alb = C_INK2 * (0.6 + 0.6 * fold);
          float sd = length(p - fill.pos);
          col = alb * (0.35 + fill.col * 1.4 / (1.0 + 0.25 * sd * sd));
          col += alb * key.col * 0.02;
        } else if (id == 31.0) {
          vec3 sq = signLocal(p);
          vec3 alb = C_INK2 * 1.3;
          col = wShade(p, n, rd, MAT_CHROME, vec4(alb, 0.8), key, fill, rim) * 0.6;
          if (sq.z > SH.z - 0.01) {
            vec2 suv = vec2(sq.x / SH.x, sq.y / SH.y) * 0.5 + 0.5;
            col += signEmit(suv);
          }
        } else {
          vec4 cost = vec4(0.0);
          if (id == MAT_WOOD) {
            vec3 q = figLocal(p);
            if (q.y > 0.86 && q.y < 1.47) cost = vec4(checkCloth(q, C_BLOOD * 0.9, C_BONE * 0.55), 1.0);
          }
          col = wShade(p, n, rd, h.y, cost, key, fill, rim);
          if (id == MAT_FLOOR) {
            // glossy stage floor: reflection of the lit sign
            vec3 rr = reflect(rd, n);
            vec3 o = p - SC; o.xz = rot2(${S.yaw}) * o.xz; vec3 dl = rr; dl.xz = rot2(${S.yaw}) * dl.xz;
            float tp = (SH.z - o.z) / dl.z;
            if (tp > 0.0) {
              vec3 hp = o + dl * tp;
              if (abs(hp.x) < SH.x && abs(hp.y) < SH.y) col += signEmit(vec2(hp.x / SH.x, hp.y / SH.y) * 0.5 + 0.5) * 0.3;
            }
          }
        }
        col = mix(col, C_INK * 0.3, smoothstep(10.0, 22.0, h.x));
      }
      col += mix(C_SIGNAL, vec3(1.0), 0.5) * coneHaze(ro, rd, h.x > 0.0 ? min(h.x, 12.0) : 12.0, key, 14) * 0.07;
      fragColor = vec4(col, 1.0);
    }`, {
    ...camUniforms(),
    t: { value: 0 }, lit: { value: 0 }, lift: { value: 0 }, armR: { value: 0 }, armL: { value: 0 }, headYaw: { value: 0 }, figYaw: { value: 0 },
    figPos: { value: new THREE.Vector3(-1.5, 0, 0.7) },
    signTex: { value: signTex },
  });
}
