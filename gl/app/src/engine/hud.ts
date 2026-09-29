// Global overlay. The studio engine draws no frame, captions or readout: every plate stages its own type.
// Kept as an (empty) layer so the post chain's HUD input stays valid.
import type * as THREE from 'three';
import { Layer2D } from './gl';

export class Hud {
  private layer = new Layer2D(64, 36, 1);
  private tex: THREE.Texture | null = null;
  draw(_t: number, _o: { opacity: number }): THREE.Texture {
    if (!this.tex) { this.layer.clear(); this.tex = this.layer.upload(); }
    return this.tex;
  }
}
