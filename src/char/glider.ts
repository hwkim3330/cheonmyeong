/** 비연(飛鳶): kite wings of silk on a bamboo frame, opened on the back to glide. */
import * as THREE from "three";
import { addOutlines, toon } from "../engine/toon";

export function buildGlider(color = 0xe84a4a, trim = 0xf6e0a0): THREE.Group {
  const g = new THREE.Group();
  const silk = toon(color, { side: THREE.DoubleSide, soft: 0.5, rim: 0.3 });
  const bamboo = toon(0x8a6a3a);
  const edge = toon(trim, { side: THREE.DoubleSide });
  for (const sd of [-1, 1]) {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.bezierCurveTo(0.6, 0.35, 1.3, 0.3, 1.9, 0.05);
    s.bezierCurveTo(1.5, -0.25, 1.1, -0.55, 0.9, -0.9);
    s.bezierCurveTo(0.6, -0.55, 0.3, -0.3, 0, -0.25);
    s.lineTo(0, 0);
    const wing = new THREE.Mesh(new THREE.ShapeGeometry(s, 16), silk);
    wing.scale.x = sd;
    wing.rotation.x = -0.25;
    g.add(wing);
    const ribs = [0.2, 0.55, 0.9];
    for (const r of ribs) {
      const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.7, 5).rotateZ(Math.PI / 2 - r * sd * 0.6), bamboo);
      rib.position.set(sd * 0.85, -r * 0.2, 0.02);
      g.add(rib);
    }
    const tail = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.5).translate(0, -0.25, 0), edge);
    tail.position.set(sd * 1.05, -0.8, 0);
    tail.rotation.x = -0.6;
    g.add(tail);
  }
  const spar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 3.9, 6).rotateZ(Math.PI / 2), bamboo);
  g.add(spar);
  addOutlines(g, 0x2a1418, 0.002);
  g.visible = false;
  return g;
}
