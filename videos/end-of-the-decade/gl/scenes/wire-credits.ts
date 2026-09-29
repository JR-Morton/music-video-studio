// wire plate, shot "credits": a holographic panel rolls the post's credits while two navy-cuffed hands come down out
// of the dark and launch a paper plane (the post) on "hand".
import * as THREE from 'three';
import { FSPass } from '@engine/gl';
import { aaPass } from './_aa';
import { F, font } from '@engine/type';
import { GLSL_CAST_SDF, GLSL_CAST_SHADE } from './_cast';
import { GLSL_WIRE_CAM, camUniforms } from './wire-cam';
import { GLSL_WIRE_SHADE } from './wire-puppet';

export const PANEL = { cx: -0.55, cy: 1.02, cz: -0.5, hx: 0.5, hy: 0.62, yaw: 0.42 };

/** Credits card: rows scroll; `roll` = y offset in px of the texture (0 = first row at the top). */
export function makeCreditsTexture() {
  const Wt = 1024, Ht = 1270;
  const cv = document.createElement('canvas');
  cv.width = Wt; cv.height = Ht;
  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  const c = cv.getContext('2d')!;
  type Row = { s: string; kind: 'label' | 'name' | 'gap' | 'dots' };
  const rows: Row[] = [
    { s: 'A POST', kind: 'label' }, { s: '', kind: 'gap' },
    { s: 'WRITTEN BY', kind: 'label' }, { s: 'HIM', kind: 'name' }, { s: '& A FRIEND', kind: 'name' }, { s: '', kind: 'gap' },
    { s: 'WITH A HAND FROM', kind: 'label' }, { s: 'A FEW FRIENDS', kind: 'name' }, { s: '', kind: 'gap' },
    { s: '· · ·', kind: 'dots' },
  ];
  const rowH = (r: Row) => (r.kind === 'name' ? 120 : r.kind === 'gap' ? 90 : 80);
  const ys: number[] = []; let acc = 0;
  for (const r of rows) { ys.push(acc + rowH(r) * 0.75); acc += rowH(r); }
  /** centre-of-panel y (texture px) of a row, for syncing */
  const rowY = (i: number) => ys[i]!;
  const draw = (roll: number, hi: number[]) => {
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = '#000'; c.fillRect(0, 0, Wt, Ht);
    c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    rows.forEach((r, i) => {
      const y = ys[i]! - roll + Ht / 2;
      if (y < -100 || y > Ht + 100) return;
      const edge = Math.min(1, Math.min(y, Ht - y) / 220);
      if (r.kind === 'gap') return;
      const h = hi[i] ?? 0;
      if (r.kind === 'name') { c.font = font(F.display(700), 84); }
      else { c.font = font(F.mono(500, 112.5), 40); (c as any).letterSpacing = '8px'; }
      // red = text, green = highlight (the row being sung)
      c.fillStyle = `rgba(${Math.round(255 * edge)},${Math.round(255 * edge * h)},0,1)`;
      c.fillText(r.s, Wt / 2, y);
      (c as any).letterSpacing = '0px';
    });
    // thin rules at top and bottom of the card (the thread doing an ordinary job)
    c.fillStyle = 'rgb(120,0,0)';
    c.fillRect(120, 70, Wt - 240, 3); c.fillRect(120, Ht - 73, Wt - 240, 3);
    tex.needsUpdate = true;
  };
  return { tex, draw, rowY, rows };
}

export function makeCreditsPass(tex: THREE.Texture) {
  const P = PANEL;
  return aaPass(/* glsl */ `
    uniform float t, handsY, pinch, fly, glow;
    uniform vec3 planePos; uniform vec3 planeRot;
    uniform sampler2D credTex;
    ${GLSL_WIRE_CAM}
    ${GLSL_CAST_SDF}
    const vec3 PC = vec3(${P.cx}, ${P.cy}, ${P.cz});
    float udTri(vec3 p, vec3 a, vec3 b, vec3 c) {
      vec3 ba = b - a, pa = p - a, cb = c - b, pb = p - b, ac = a - c, pc = p - c;
      vec3 nor = cross(ba, ac);
      return sqrt((sign(dot(cross(ba, nor), pa)) + sign(dot(cross(cb, nor), pb)) + sign(dot(cross(ac, nor), pc)) < 2.0)
        ? min(min(dot(ba * clamp(dot(ba, pa) / dot(ba, ba), 0.0, 1.0) - pa, ba * clamp(dot(ba, pa) / dot(ba, ba), 0.0, 1.0) - pa),
                  dot(cb * clamp(dot(cb, pb) / dot(cb, cb), 0.0, 1.0) - pb, cb * clamp(dot(cb, pb) / dot(cb, cb), 0.0, 1.0) - pb)),
                  dot(ac * clamp(dot(ac, pc) / dot(ac, ac), 0.0, 1.0) - pc, ac * clamp(dot(ac, pc) / dot(ac, ac), 0.0, 1.0) - pc))
        : dot(nor, pa) * dot(nor, pa) / dot(nor, nor));
    }
    vec3 planeLocal(vec3 p) {
      vec3 q = p - planePos;
      q.xz = rot2(planeRot.y) * q.xz; q.xy = rot2(planeRot.z) * q.xy; q.yz = rot2(planeRot.x) * q.yz;
      return q;
    }
    float sdPlane(vec3 q) {
      float bb = length(q) - 0.26;
      if (bb > 0.05) return bb;
      vec3 n = vec3(0.2, 0.0, 0.0), tc = vec3(-0.18, 0.0, 0.0);
      float d = udTri(q, n, tc, vec3(-0.18, 0.035, 0.13));
      d = min(d, udTri(q, n, tc, vec3(-0.18, 0.035, -0.13)));
      d = min(d, udTri(q, n, tc, vec3(-0.16, -0.05, 0.0)));
      return d - 0.0025;
    }
    vec2 map(vec3 p) {
      vec2 r = vec2(p.y, MAT_FLOOR);
      r = opU(r, vec2(sdPlane(planeLocal(p)), MAT_PAPER));
      // two hands on sleeves reaching down out of the dark
      for (int i = 0; i < 2; i++) {
        float sd = i == 0 ? -1.0 : 1.0;
        vec3 hp = vec3(0.3 + sd * 0.15, handsY + (i == 0 ? 0.0 : 0.03), 0.06 - sd * 0.03);
        vec3 q = p - hp;
        q.xz = rot2(sd * 1.35) * q.xz;
        q.xy = rot2(sd * 0.22) * q.xy;
        float bb = sdBox(q - vec3(0.0, 2.0, 0.0), vec3(0.14, 2.3, 0.14));
        if (bb > 0.1) { r = opU(r, vec2(bb, MAT_CLOTH)); continue; }
        r = opU(r, sdHand(q, pinch, 0.0));
        r = opU(r, vec2(cs_cap(q, vec3(0.0, 0.16, 0.0), vec3(0.0, 4.0, 0.0), 0.055), MAT_CLOTH));
      }
      return r;
    }
    ${GLSL_CAST_SHADE}
    ${GLSL_WIRE_SHADE}
    // the holographic panel: returns rgb emission and hit distance
    vec4 panel(vec3 ro, vec3 rd) {
      vec3 o = ro - PC; o.xz = rot2(${P.yaw}) * o.xz; vec3 d = rd; d.xz = rot2(${P.yaw}) * d.xz;
      if (abs(d.z) < 1e-4) return vec4(0.0, 0.0, 0.0, -1.0);
      float tp = -o.z / d.z; if (tp < 0.0) return vec4(0.0, 0.0, 0.0, -1.0);
      vec3 hp = o + d * tp;
      vec2 q = hp.xy / vec2(${P.hx}, ${P.hy});
      if (abs(q.x) > 1.02 || abs(q.y) > 1.02) return vec4(0.0, 0.0, 0.0, -1.0);
      vec4 tx = texture(credTex, q * 0.5 + 0.5);
      float edge = smoothstep(0.985, 1.0, max(abs(q.x), abs(q.y)));
      float scan = 0.85 + 0.15 * sin(hp.y * 900.0);
      vec3 c = C_LILAC * 0.035 + C_LILAC * edge * 0.9;
      c += mix(C_BONE * 1.1, C_SIGNAL * 1.5, tx.g / max(tx.r, 1e-3)) * tx.r * scan;
      return vec4(c * glow, tp);
    }
    void main() {
      vec2 uv = (vUv - 0.5) * vec2(16.0 / 9.0, 1.0);
      vec3 ro = camRo, rd = camRay(uv);
      StageLight key = StageLight(vec3(1.4, 4.2, 2.0), normalize(vec3(0.3, 1.0, 0.0) - vec3(1.4, 4.2, 2.0)), mix(C_SIGNAL, vec3(1.0), 0.55) * 5.5, 0.95);
      StageLight fill = StageLight(PC + vec3(0.3, 0.0, 0.8), vec3(0.0), C_LILAC * 0.9, -1.0);
      StageLight rim = StageLight(vec3(0.5, 2.5, -2.5), vec3(0.0), vec3(0.6, 0.65, 1.0) * 2.4, -1.0);
      vec2 h = castMarch(ro, rd, 20.0);
      vec3 col = C_INK * 0.25;
      if (h.x > 0.0) {
        vec3 p = ro + rd * h.x, n = castNormal(p);
        col = wShade(p, n, rd, h.y, vec4(0.0), key, fill, rim);
        if (floor(h.y + 0.001) == MAT_FLOOR) {
          vec3 rr = reflect(rd, n);
          vec4 pr = panel(p, rr);
          if (pr.w > 0.0) col += pr.rgb * 0.35;
        }
        col = mix(col, C_INK * 0.25, smoothstep(6.0, 14.0, h.x));
      }
      vec4 pn = panel(ro, rd);
      if (pn.w > 0.0 && (h.x < 0.0 || pn.w < h.x)) col = col * 0.9 + pn.rgb;
      col += mix(C_SIGNAL, vec3(1.0), 0.5) * coneHaze(ro, rd, h.x > 0.0 ? min(h.x, 8.0) : 8.0, key, 12) * 0.06;
      fragColor = vec4(col, 1.0);
    }`, {
    ...camUniforms(),
    t: { value: 0 }, handsY: { value: 1.2 }, pinch: { value: 1 }, fly: { value: 0 }, glow: { value: 1 },
    planePos: { value: new THREE.Vector3(0.3, 1.0, 0.1) }, planeRot: { value: new THREE.Vector3(0, 0, 0) },
    credTex: { value: tex },
  });
}
