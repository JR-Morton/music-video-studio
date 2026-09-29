// wire plate: a look-at camera shared by the GLSL passes and the TS overlays (projection of 3D points to px), so
// 2D lines/threads line up exactly with the raymarched set.
import * as THREE from 'three';

export type V3 = [number, number, number];

/** GLSL: camera ray for the FSPass uv convention (uv.x in ±0.889, uv.y in ±0.5). */
export const GLSL_WIRE_CAM = /* glsl */ `
uniform vec3 camRo, camTa; uniform float camFl, camRoll;
vec3 camRay(vec2 uv) {
  vec3 fw = normalize(camTa - camRo);
  vec3 wu = vec3(sin(camRoll), cos(camRoll), 0.0);
  vec3 rt = normalize(cross(fw, wu)), up = cross(rt, fw);
  return normalize(fw * camFl + rt * uv.x + up * uv.y);
}
float sdBox(vec3 p, vec3 b) { vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }
float sdRBox(vec3 p, vec3 b, float r) { vec3 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r; }
`;

export function camUniforms() {
  return {
    camRo: { value: new THREE.Vector3(0, 1, -5) },
    camTa: { value: new THREE.Vector3(0, 1, 0) },
    camFl: { value: 1.6 },
    camRoll: { value: 0 },
  };
}

export class Cam {
  ro: V3 = [0, 1, -5]; ta: V3 = [0, 1, 0]; fl = 1.6; roll = 0;
  set(ro: V3, ta: V3, fl = 1.6, roll = 0) { this.ro = ro; this.ta = ta; this.fl = fl; this.roll = roll; return this; }
  apply(u: Record<string, THREE.IUniform>) {
    (u.camRo!.value as THREE.Vector3).set(...this.ro);
    (u.camTa!.value as THREE.Vector3).set(...this.ta);
    u.camFl!.value = this.fl; u.camRoll!.value = this.roll;
  }
  /** World point -> logical px (x right, y down) and depth; z <= 0 = behind the camera. */
  project(p: V3): { x: number; y: number; z: number } {
    const [rx, ry, rz] = this.ro;
    let fx = this.ta[0] - rx, fy = this.ta[1] - ry, fz = this.ta[2] - rz;
    const fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl;
    const wx = Math.sin(this.roll), wy = Math.cos(this.roll), wz = 0;
    // rt = normalize(cross(fw, wu))
    let tx = fy * wz - fz * wy, ty = fz * wx - fx * wz, tz = fx * wy - fy * wx;
    const tl = Math.hypot(tx, ty, tz); tx /= tl; ty /= tl; tz /= tl;
    // up = cross(rt, fw)
    const ux = ty * fz - tz * fy, uy = tz * fx - tx * fz, uz = tx * fy - ty * fx;
    const dx = p[0] - rx, dy = p[1] - ry, dz = p[2] - rz;
    const z = dx * fx + dy * fy + dz * fz;
    const x = (dx * tx + dy * ty + dz * tz) / z * this.fl;
    const y = (dx * ux + dy * uy + dz * uz) / z * this.fl;
    return { x: 960 + x * 1080, y: 540 - y * 1080, z };
  }
}
