// dawn: the ending (155.32–170.0; the song ends at 158.9, then silence). A real sun rises with no string. The small
// tin robot on a grassy knoll above the town (the same ridge of roofs the sandbox showed at night); the chorus
// spotlight fades to nothing and the daylight takes over; it blinks, looks around; then, on its own (no hand, no
// string: nobody steers it now), it turns to look off into the sunrise and watches it with us while the camera pulls
// back and up behind it. Fade to black by 170.
import * as THREE from 'three';
import { Scene, type Frame } from '@engine/scene';
import { FSPass } from '@engine/gl';
import { aaPass } from './_aa';
import { clamp, ease, keys, lerp } from '@engine/util';
import { GRADE, clockwork } from './_look';
import { DAWN_FRAG } from './dawn-gl';

type V3 = [number, number, number];
const mix3 = (a: V3, b: V3, u: number): V3 => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
const yawTo = (dx: number, dz: number) => -Math.atan2(dx, dz);

export default class Dawn extends Scene {
  stage = aaPass(DAWN_FRAG, {
    uT: { value: 0 }, uSun: { value: 0 }, uSpot: { value: 0 }, uFoc: { value: 1.7 }, uEye: { value: 1 }, uTouch: { value: 0 },
    uRo: { value: new THREE.Vector3() }, uTa: { value: new THREE.Vector3() }, uRob: { value: new THREE.Vector3() },
    uHand: { value: new THREE.Vector3() }, uHandDir: { value: new THREE.Vector3(1, -0.3, 0) }, uRw: { value: new THREE.Vector3() },
  });

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer } = this.ctx;
    const t = f.t, t0 = this.ctx.start, end = this.ctx.end;
    const db = this.ctx.audio.downbeats.filter((x) => x >= t0 - 0.01);
    const D1 = db[1] ?? t0 + 2.12; // 157.44: the last downbeat inside the song
    const tTurn = D1 + 0.8; // ~158.2: after its last look around, it turns to the sun by itself
    const tPull = tTurn + 1.0;

    // the sun: just under the rooftops at the cut, clearing them by the end
    const sun = lerp(-0.035, 0.1, ease.inOutQuad(clamp((t - t0) / (end - t0), 0, 1)));
    const spot = 1 - ease.inOutQuad(clamp((t - t0) / (D1 - t0), 0, 1));

    // camera: a slow push in, then (after the touch) a long, slow pull back and up
    const push = ease.inOutCubic(clamp((t - t0) / (tTurn + 0.8 - t0), 0, 1));
    let ro = mix3([0.12, 0.4, 2.0], [-0.35, 0.4, 1.35], push);
    let ta = mix3([0.3, 0.3, -3], [0.0, 0.36, -1.5], push);
    const pull = ease.inOutCubic(clamp((t - tPull) / (end - 0.6 - tPull), 0, 1));
    ro = mix3(ro, [-0.5, 1.45, 5.6], pull);
    ta = mix3(ta, [-0.7, 0.95, -10], pull);

    // the robot: blinks, looks around (left, then right), then turns by itself to face the sunrise, a small shuffle of
    // steps as it turns, and stands watching it; the camera ends up behind it, the sun beyond
    const rx = 0.28, rz = 0.0;
    const faceSun = ease.inOutCubic(clamp((t - tTurn) / 1.6, 0, 1));
    const step = ease.inOutQuad(clamp((t - tTurn - 0.3) / 1.2, 0, 1));
    const yaw = lerp(0.3, yawTo(-0.45, -1), faceSun);
    const x = rx - 0.06 * step, z = rz - 0.05 * step;
    const turning = faceSun > 0 && faceSun < 1;
    const walk = turning ? clockwork(t, 6.1, 3) * 1.2 : 0;
    let look = keys(t, [[t0, 0.1], [156.4, 0.1], [156.7, -0.55, ease.outCubic], [157.5, -0.55], [157.8, 0.35, ease.outCubic], [tTurn, 0.35]]);
    look = lerp(look, 0.0, faceSun);
    const blink = (b: number) => (t > b && t < b + 0.1 ? 0.05 : 1);
    const eye = blink(156.2) * blink(158.05) * blink(161.4) * blink(165.9);
    const hop = 0;
    const glee = 0;
    const tipDir: V3 = [0.75, -0.3, -0.6];
    const tip: V3 = [-50, 0, 0]; // no hand in this plate

    const u = this.stage.u;
    u.uT!.value = t; u.uSun!.value = sun; u.uSpot!.value = spot; u.uEye!.value = eye; u.uTouch!.value = glee;
    (u.uRo!.value as THREE.Vector3).set(...ro); (u.uTa!.value as THREE.Vector3).set(...ta);
    (u.uRob!.value as THREE.Vector3).set(x, z, yaw);
    (u.uRw!.value as THREE.Vector3).set(walk, look, hop);
    (u.uHand!.value as THREE.Vector3).set(...tip); (u.uHandDir!.value as THREE.Vector3).set(...tipDir);
    void walk;
    this.stage.render(renderer, out);

    // where the sun sits in frame (for the light shafts)
    const fw = new THREE.Vector3(ta[0] - ro[0], ta[1] - ro[1], ta[2] - ro[2]).normalize();
    const rt = new THREE.Vector3().crossVectors(fw, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(rt, fw);
    const sd = new THREE.Vector3(-0.45, sun, -1).normalize();
    const zc = sd.dot(fw);
    const foc = 1.7;
    const sx = 0.5 + ((sd.dot(rt) / zc) * foc) / (16 / 9);
    const sy = 0.5 + (sd.dot(up) / zc) * foc;
    u.uFoc!.value = foc;

    const fade = ease.inOutQuad(clamp((t - (end - 1.6)) / 1.5, 0, 1));
    return { ...GRADE.dawn, bloom: 0.5, raysAt: [sx, sy] as [number, number], rays: 0.25 + 0.15 * (1 - spot), fade, exposure: 1.0 };
  }
}
