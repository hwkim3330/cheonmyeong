/**
 * Portraits and full-length cards of the heroes, rendered from their own 3D models into
 * images (so the HUD, the party screen and the summon reveal all show the real character):
 * a head-and-shoulders bust on a soft element-coloured ground, and a standing card.
 */
import * as THREE from "three";
import { Animator } from "../char/anim";
import { buildHero } from "../char/model";
import { ELEMENT_COLOR, HERO } from "../data/heroes";

const cache = new Map<string, string>();

export function portrait(renderer: THREE.WebGLRenderer, id: string, kind: "bust" | "card" = "bust"): string {
  const key = `${id}|${kind}`;
  const c = cache.get(key);
  if (c) return c;
  const def = HERO[id];
  const W = kind === "bust" ? 256 : 512;
  const H = kind === "bust" ? 256 : 768;
  const scene = new THREE.Scene();
  const rig = buildHero(def.look);
  scene.add(rig.root);
  const anim = new Animator(rig);
  anim.alwaysArmed = kind === "card";
  anim.play("pose");
  const still = { speed: 0, grounded: true, vy: 0, gliding: false, turn: 0, vel: new THREE.Vector3(), sprint: false };
  for (let k = 0; k < 40; k++) anim.update(1 / 30, still);
  rig.faceMat.map = rig.face.open;
  const sun = new THREE.DirectionalLight(0xfff4e8, 2.4);
  sun.position.set(1.5, 2.5, 3);
  scene.add(sun, new THREE.HemisphereLight(0xd8e8ff, 0x8a7a6a, 0.9));
  const cam = new THREE.PerspectiveCamera(kind === "bust" ? 22 : 30, W / H, 0.1, 50);
  const h = rig.height;
  if (kind === "bust") {
    cam.position.set(0.35, h * 0.9, 1.35);
    cam.lookAt(0, h * 0.88, 0);
  } else {
    cam.position.set(1.2, h * 0.62, 4.6);
    cam.lookAt(0, h * 0.55, 0);
    rig.root.rotation.y = 0.35;
  }
  const rt = new THREE.WebGLRenderTarget(W, H, { samples: 4 });
  const prevTarget = renderer.getRenderTarget();
  const prevTone = renderer.toneMapping;
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scene, cam);
  const px = new Uint8Array(W * H * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, W, H, px);
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevAlpha);
  renderer.toneMapping = prevTone;
  rt.dispose();
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const g = cv.getContext("2d")!;
  // Background: a soft glow in the hero's element colour.
  const col = new THREE.Color(ELEMENT_COLOR[def.element]);
  const gr = g.createRadialGradient(W / 2, H * 0.48, 10, W / 2, H * 0.5, W * 0.5);
  gr.addColorStop(0, `rgba(${(col.r * 255) | 0},${(col.g * 255) | 0},${(col.b * 255) | 0},0.55)`);
  gr.addColorStop(1, "rgba(20,24,40,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
  const img = g.createImageData(W, H);
  // Flip rows (GL is bottom-up), and linear → sRGB.
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const s = ((H - 1 - y) * W + x) * 4;
      const d = (y * W + x) * 4;
      for (let k = 0; k < 3; k++) {
        const v = px[s + k] / 255;
        img.data[d + k] = Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
      }
      img.data[d + 3] = px[s + 3];
    }
  const tmp = document.createElement("canvas");
  tmp.width = W;
  tmp.height = H;
  tmp.getContext("2d")!.putImageData(img, 0, 0);
  g.drawImage(tmp, 0, 0);
  const url = cv.toDataURL();
  cache.set(key, url);
  rig.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  return url;
}
