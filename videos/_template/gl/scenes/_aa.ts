// Anti-aliasing for the plates' full-screen shaders: rotated-grid supersampling spread over the motion-blur sub-frames.
//
// The engine renders each exported frame as `--samples` sub-frames (a multiple of 4) and sets SS_TAP to 0..3 on them in
// turn (see SS_TAP in @engine/gl). A pass built with aaPass reads vUv at that tap's sub-pixel offset (rgss), so every
// ray, SDF edge, hairline and pixel-space pattern is sampled at 4 points per pixel across the frame, for no extra
// shading cost. With SS_TAP = -1 (the preview, single-sample stills) vUv is the pixel centre, as before.
//
// Only for the plates' own passes: never for compositing or post passes (a jittered texture read there just blurs).
import { FSPass, SS_TAP } from '@engine/gl';
import type * as THREE from 'three';

/**
 * GLSL prelude: every later read of vUv in the shader is jittered to this sub-frame's tap. gl_FragCoord.xy / vUv is
 * the render target's size in pixels (vUv spans the whole target), so the offset needs no size uniform and no
 * derivatives (safe inside loops and branches).
 */
export const GLSL_AA = /* glsl */ `
uniform int ssTap;
vec2 ssUv() { return ssTap < 0 ? vUv : vUv + rgss(ssTap) * vUv / gl_FragCoord.xy; }
#define vUv ssUv()
`;

/** An FSPass for a plate's shader, supersampled across the sub-frames (see above). */
export function aaPass(frag: string, uniforms: Record<string, THREE.IUniform> = {}, opts: { blending?: THREE.Blending; transparent?: boolean } = {}) {
  return new FSPass(GLSL_AA + frag, { ...uniforms, ssTap: SS_TAP }, opts);
}
