/**
 * The famous arms, built from shapes. Each is a group whose origin is the grip, the shaft
 * along +y: 청룡언월도 (a great crescent glaive with a dragon's-head collar and red tassel),
 * 방천화극 (a spear with a crescent blade each side), 장팔사모 (the serpent spear, wavy blade),
 * 애각창 (a slim silver spear), 쌍고검 (twin swords), 우선 (the white feather fan), 검, 궁.
 */
import * as THREE from "three";
import { blade, lathe, merge, strand, V } from "./geo";
import { toon } from "../engine/toon";

export type WeaponKind = "glaive" | "halberd" | "serpent" | "spear" | "twin" | "fan" | "sword" | "bow" | "club" | "staff";
export type WeaponClass = "polearm" | "sword" | "catalyst" | "bow";

export const WEAPON_CLASS: Record<WeaponKind, WeaponClass> = { glaive: "polearm", halberd: "polearm", serpent: "polearm", spear: "polearm", twin: "sword", fan: "catalyst", sword: "sword", bow: "bow", club: "polearm", staff: "catalyst" };

export interface WeaponLook {
  kind: WeaponKind;
  metal?: number;
  shaft?: number;
  accent?: number;
  glow?: number;
}

function shaftGeo(len: number, r: number): THREE.BufferGeometry {
  return lathe([[0.0001, -0.02], [r * 1.2, -0.01], [r, 0.02], [r, len * 0.5], [r * 0.95, len], [0.0001, len + 0.01]], 12);
}

function tassel(color: number, at: number): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    parts.push(strand([V(0, at, 0), V(Math.cos(a) * 0.03, at - 0.08, Math.sin(a) * 0.03), V(Math.cos(a) * 0.05, at - 0.2, Math.sin(a) * 0.05)], 0.018, 0.01));
  }
  parts.push(lathe([[0.0001, at + 0.03], [0.03, at + 0.01], [0.022, at - 0.03], [0.0001, at - 0.04]], 10));
  const m = new THREE.Mesh(merge(parts), toon(color));
  m.userData.tassel = true;
  return m;
}

export function buildWeapon(w: WeaponLook): THREE.Group {
  const g = new THREE.Group();
  const metal = toon(w.metal ?? 0xd8dde6, { rim: 0.6 });
  const shaft = toon(w.shaft ?? 0x5a2a1a);
  const accent = toon(w.accent ?? 0xc89a3a, { rim: 0.5 });
  const glowMat = w.glow ? toon(w.glow, { emissive: w.glow, rim: 0.8 }) : accent;
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  switch (w.kind) {
    case "glaive": {
      // 청룡언월도: grip low on the shaft, long crescent blade on top.
      add(shaftGeo(2.1, 0.026), shaft).position.y = -0.55;
      const s = new THREE.Shape();
      s.moveTo(0, 0);
      s.bezierCurveTo(0.16, 0.08, 0.26, 0.36, 0.2, 0.74);
      s.bezierCurveTo(0.12, 0.62, 0.02, 0.5, -0.06, 0.44);
      s.bezierCurveTo(-0.04, 0.3, -0.05, 0.14, -0.06, 0.02);
      s.lineTo(0, 0);
      const b = add(blade(s, 0.018, 0.006), metal);
      b.position.y = 1.55;
      // Notch spine and edge trim.
      const back = new THREE.Shape();
      back.moveTo(-0.06, 0.02);
      back.lineTo(-0.12, 0.1);
      back.lineTo(-0.08, 0.16);
      back.lineTo(-0.13, 0.24);
      back.lineTo(-0.06, 0.3);
      const bb = add(blade(back, 0.014, 0.003), metal);
      bb.position.y = 1.55;
      // Dragon collar.
      const collar = add(lathe([[0.0001, 0.0], [0.05, 0.02], [0.065, 0.08], [0.045, 0.14], [0.034, 0.16], [0.0001, 0.17]], 14), glowMat);
      collar.position.y = 1.42;
      const head = add(new THREE.SphereGeometry(0.045, 12, 10).scale(1, 0.8, 1.5), glowMat);
      head.position.set(0, 1.5, 0.05);
      g.add(tassel(0xc41a1a, 1.44));
      // Butt spike.
      add(lathe([[0.0001, 0], [0.03, 0.02], [0.02, 0.1], [0.0001, 0.2]], 10).rotateX(Math.PI), metal).position.y = -0.55;
      break;
    }
    case "halberd": {
      // 방천화극: spear point with a crescent each side.
      add(shaftGeo(2.2, 0.024), shaft).position.y = -0.6;
      add(lathe([[0.0001, 0], [0.028, 0.02], [0.04, 0.12], [0.01, 0.34], [0.0001, 0.36]], 12, 1, 0.35), metal).position.y = 1.6;
      for (const sd of [-1, 1]) {
        const s = new THREE.Shape();
        s.moveTo(0, 0);
        s.bezierCurveTo(0.14, -0.06, 0.24, 0.04, 0.24, 0.2);
        s.bezierCurveTo(0.18, 0.1, 0.1, 0.08, 0.02, 0.1);
        s.lineTo(0, 0);
        const b = add(blade(s, 0.012, 0.004), metal);
        b.position.set(0, 1.56, 0);
        b.scale.x = sd;
      }
      add(lathe([[0.0001, 0], [0.04, 0.02], [0.05, 0.06], [0.03, 0.1], [0.0001, 0.11]], 12), glowMat).position.y = 1.5;
      g.add(tassel(0xd02020, 1.52));
      break;
    }
    case "serpent": {
      add(shaftGeo(2.3, 0.024), shaft).position.y = -0.6;
      const s = new THREE.Shape();
      s.moveTo(-0.035, 0);
      for (let k = 0; k <= 6; k++) s.lineTo(Math.sin(k * 1.4) * 0.04 + 0.01, k * 0.07);
      s.lineTo(0, 0.52);
      for (let k = 6; k >= 0; k--) s.lineTo(Math.sin(k * 1.4) * 0.04 - 0.05, k * 0.07);
      add(blade(s, 0.014, 0.004), metal).position.y = 1.7;
      add(lathe([[0.0001, 0], [0.045, 0.03], [0.03, 0.09], [0.0001, 0.1]], 12), glowMat).position.y = 1.62;
      g.add(tassel(0x2a2a2a, 1.64));
      break;
    }
    case "spear": {
      // 애각창: slender silver spear, white tassel.
      add(shaftGeo(2.2, 0.02), toon(w.shaft ?? 0xe8e8ee)).position.y = -0.6;
      const s = new THREE.Shape();
      s.moveTo(0, 0);
      s.bezierCurveTo(0.06, 0.04, 0.05, 0.18, 0, 0.36);
      s.bezierCurveTo(-0.05, 0.18, -0.06, 0.04, 0, 0);
      add(blade(s, 0.02, 0.006), metal).position.y = 1.62;
      add(lathe([[0.0001, 0], [0.035, 0.02], [0.03, 0.06], [0.0001, 0.07]], 12), glowMat).position.y = 1.56;
      g.add(tassel(w.accent ?? 0xe02a2a, 1.58));
      break;
    }
    case "sword":
    case "twin": {
      // 검 (a straight jian); for 쌍고검 the second is added by the model to the left hand.
      add(lathe([[0.0001, -0.12], [0.022, -0.11], [0.018, 0], [0.0001, 0.005]], 10), shaft);
      add(new THREE.BoxGeometry(0.16, 0.03, 0.05), accent).position.y = 0.02;
      const s = new THREE.Shape();
      s.moveTo(-0.022, 0);
      s.lineTo(-0.02, 0.72);
      s.lineTo(0, 0.8);
      s.lineTo(0.02, 0.72);
      s.lineTo(0.022, 0);
      add(blade(s, 0.008, 0.003), metal).position.y = 0.035;
      add(new THREE.SphereGeometry(0.022, 10, 8), accent).position.y = -0.13;
      break;
    }
    case "fan": {
      // 우선: white crane feathers on a short handle.
      add(lathe([[0.0001, -0.16], [0.016, -0.15], [0.013, 0.05], [0.0001, 0.06]], 10), shaft);
      const feathers: THREE.BufferGeometry[] = [];
      for (let k = 0; k < 11; k++) {
        const a = -0.9 + (k / 10) * 1.8;
        const tip = V(Math.sin(a) * 0.34, 0.06 + Math.cos(a) * 0.34, 0);
        feathers.push(strand([V(0, 0.05, 0), V(tip.x * 0.4, 0.05 + (tip.y - 0.05) * 0.45, 0.005), tip], 0.05, 0.006, { taper: 0.5, flatUp: V(0, 0, 1), tip: 0.3 }));
      }
      const fm = new THREE.Mesh(merge(feathers), toon(0xf6f4f0, { rim: 0.5, side: THREE.DoubleSide }));
      fm.castShadow = true;
      g.add(fm);
      add(new THREE.SphereGeometry(0.03, 10, 8), glowMat).position.y = 0.05;
      break;
    }
    case "bow": {
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 10; k++) {
        const t = k / 10 - 0.5;
        pts.push(V(0, t * 1.3, -Math.cos(t * Math.PI) * 0.14 + Math.sign(t) * Math.max(0, Math.abs(t) - 0.38) * 0.4));
      }
      const b = strand(pts, 0.018, 0.018, { taper: 0, tip: 1 });
      add(b, toon(w.shaft ?? 0x6a3a1a));
      const str = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 1.2, 4), new THREE.MeshBasicMaterial({ color: 0xeeeeee }));
      str.position.z = 0.05;
      str.userData.noOutline = true;
      g.add(str);
      add(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 8), accent);
      break;
    }
    case "club": {
      add(shaftGeo(1.2, 0.03), shaft).position.y = -0.3;
      add(lathe([[0.0001, 0], [0.06, 0.05], [0.07, 0.3], [0.0001, 0.34]], 10), toon(0x4a3a2a)).position.y = 0.85;
      break;
    }
    case "staff": {
      add(shaftGeo(1.7, 0.02), shaft).position.y = -0.5;
      add(new THREE.TorusGeometry(0.1, 0.012, 8, 20), accent).position.y = 1.3;
      add(new THREE.SphereGeometry(0.05, 12, 10), glowMat).position.y = 1.22;
      break;
    }
  }
  return g;
}
