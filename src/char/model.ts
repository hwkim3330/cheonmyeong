/**
 * An anime-proportioned hero built from smooth shapes on a joint hierarchy (hips → spine →
 * chest → neck → head; shoulders → upper arm → forearm → hand; thigh → shin → foot). The
 * clothes are 한푸 cut: a crossed collar folded right over left, a sash, wide sleeves that
 * flare past the wrist, a long skirt that swings with the legs (vertex shader); armour adds a
 * lamellar cuirass, layered pauldrons and a beast-face belt buckle. Hair is a painted cap and
 * swept locks (bangs, side locks, ponytail/topknot/long hair) with springy tails; beards,
 * crowns, helmets, pheasant plumes; a cape and sash ends that stream behind.
 */
import * as THREE from "three";
import { addOutlines, toon } from "../engine/toon";
import { makeFace, type Face } from "./face";
import { lathe, limb, merge, sph, strand, V } from "./geo";
import { buildWeapon, type WeaponLook } from "./weapon";

export type HairStyle = "topknot" | "long" | "ponytail" | "twin" | "bun" | "short" | "wild";
export type Headgear = "none" | "guan" | "helm" | "plume" | "scholar" | "headband" | "hood" | "pins";

export interface Look {
  skin: number;
  hair: number;
  iris: number;
  hairStyle: HairStyle;
  headgear: Headgear;
  gearColor?: number;
  female?: boolean;
  height?: number;
  bulk?: number;
  robe: number;
  robe2: number;
  trim: number;
  pants: number;
  boots: number;
  sash: number;
  armor?: number;
  armorTrim?: number;
  cape?: number;
  beard?: "long" | "bushy" | "goatee" | "none";
  stern?: number;
  flush?: number;
  robeLen?: number;
  sleeves?: "wide" | "fitted";
  weapon: WeaponLook;
  scarf?: number;
}

export type Joint = "hips" | "spine" | "chest" | "neck" | "head" | "shL" | "shR" | "armL" | "armR" | "foreL" | "foreR" | "handL" | "handR" | "thighL" | "thighR" | "shinL" | "shinR" | "footL" | "footR";
export const JOINTS: Joint[] = ["hips", "spine", "chest", "neck", "head", "shL", "shR", "armL", "armR", "foreL", "foreR", "handL", "handR", "thighL", "thighR", "shinL", "shinR", "footL", "footR"];

export interface Chain {
  joints: THREE.Object3D[];
  /** Spring state (angle about x and z per link). */
  ax: number[];
  az: number[];
  vx: number[];
  vz: number[];
  stiff: number;
  rest: number;
}

export interface Rig {
  root: THREE.Group;
  body: THREE.Group;
  j: Record<Joint, THREE.Object3D>;
  rest: Record<Joint, THREE.Euler>;
  face: Face;
  faceMat: THREE.MeshToonMaterial;
  weapon: THREE.Group;
  weapon2: THREE.Group | null;
  chains: Chain[];
  skirt: { u: { uLegL: { value: number }; uLegR: { value: number }; uSway: { value: number } } } | null;
  cape: { u: { uBack: { value: number }; uSide: { value: number }; uTime: { value: number } } } | null;
  height: number;
  look: Look;
  glowMats: THREE.MeshToonMaterial[];
  /** Hanging sleeves: kept vertical in world space. */
  drapes: THREE.Object3D[];
}

const hexStr = (c: number) => "#" + c.toString(16).padStart(6, "0");

/** The robe's body texture: crossed collar with a broad trim band, sash, lamellar if armoured. */
function robeTexture(L: Look): THREE.CanvasTexture {
  const W = 1024;
  const H = 512;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = hexStr(L.robe);
  g.fillRect(0, 0, W, H);
  // Subtle weave.
  g.globalAlpha = 0.05;
  for (let y = 0; y < H; y += 4) {
    g.fillStyle = y % 8 ? "#000" : "#fff";
    g.fillRect(0, y, W, 2);
  }
  g.globalAlpha = 1;
  // Under-robe showing at the collar (a V at the front, u = 0.5).
  const fx = W * 0.5;
  const neckY = 18;
  g.fillStyle = hexStr(L.robe2);
  g.beginPath();
  g.moveTo(fx - 90, neckY);
  g.lineTo(fx + 90, neckY);
  g.lineTo(fx + 10, H * 0.36);
  g.closePath();
  g.fill();
  // The crossed collar: right over left (the wearer's right panel goes to their left hip).
  // The outer panel sweeps from the left of the neck across to under the right arm.
  g.fillStyle = hexStr(L.robe);
  g.beginPath();
  g.moveTo(fx - 80, neckY - 10);
  g.lineTo(fx + 260, H * 0.5);
  g.lineTo(fx + 260, H * 0.62);
  g.lineTo(fx - 10, H * 0.62);
  g.closePath();
  g.fill();
  g.strokeStyle = hexStr(L.trim);
  g.lineWidth = 40;
  g.lineCap = "butt";
  g.beginPath();
  g.moveTo(fx - 80, neckY - 20);
  g.quadraticCurveTo(fx + 40, H * 0.3, fx + 260, H * 0.5);
  g.stroke();
  g.beginPath();
  g.moveTo(fx + 80, neckY - 20);
  g.lineTo(fx + 8, H * 0.3);
  g.stroke();
  // A thin light line inside the band.
  g.strokeStyle = "rgba(255,245,215,0.55)";
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(fx - 70, neckY - 20);
  g.quadraticCurveTo(fx + 50, H * 0.3, fx + 260, H * 0.49);
  g.stroke();
  // Sash at the waist (v ≈ 0.25 of the torso profile).
  if (!L.armor) {
    g.fillStyle = hexStr(L.sash);
    g.fillRect(0, H * 0.7, W, H * 0.13);
    g.fillStyle = "rgba(0,0,0,0.12)";
    g.fillRect(0, H * 0.79, W, H * 0.02);
  }
  if (L.armor) {
    // Lamellar cuirass: rows of small plates laced together, trim at top and bottom.
    const rows = 9;
    for (let r = 0; r < rows; r++) {
      const y = H * 0.3 + r * ((H * 0.55) / rows);
      for (let x = (r % 2) * 14; x < W; x += 28) {
        const gr = g.createLinearGradient(0, y, 0, y + 26);
        gr.addColorStop(0, hexStr(L.armor));
        gr.addColorStop(1, "rgba(0,0,0,0.35)");
        g.fillStyle = gr;
        g.beginPath();
        g.roundRect(x + 1, y, 26, 30, 5);
        g.fill();
      }
    }
    g.fillStyle = hexStr(L.armorTrim ?? L.trim);
    g.fillRect(0, H * 0.28, W, 14);
    g.fillRect(0, H * 0.84, W, 16);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Skirt that swings with the legs: vertices below the hips follow the thigh they're nearer. */
function skirtMaterial(color: number, map: THREE.Texture | null): { mat: THREE.MeshToonMaterial; u: NonNullable<Rig["skirt"]>["u"] } {
  const mat = toon(color, { side: THREE.DoubleSide, map });
  const u = { uLegL: { value: 0 }, uLegR: { value: 0 }, uSway: { value: 0 } };
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev(sh, r);
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uLegL; uniform float uLegR; uniform float uSway;").replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
float depth = max(0.0, -transformed.y);
float side = smoothstep(-0.08, 0.08, transformed.x);
float swing = mix(uLegL, uLegR, side);
// A thigh swung forward (negative angle about x) pushes the cloth forward and up.
transformed.z += -sin(swing) * depth * 0.95;
transformed.y += (1.0 - cos(swing)) * depth * 0.4;
transformed.z -= uSway * depth * depth * 0.6;`,
    );
  };
  mat.customProgramCacheKey = () => "skirt";
  return { mat, u };
}

function capeMaterial(color: number): { mat: THREE.MeshToonMaterial; u: NonNullable<Rig["cape"]>["u"] } {
  const mat = toon(color, { side: THREE.DoubleSide, soft: 0.4 });
  const u = { uBack: { value: 0 }, uSide: { value: 0 }, uTime: { value: 0 } };
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev(sh, r);
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uBack; uniform float uSide; uniform float uTime;").replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
float d = max(0.0, -transformed.y);
float lift = uBack * d * d * 0.9;
transformed.z -= lift + d * 0.06;
transformed.y += uBack * d * d * 0.35;
transformed.x += uSide * d * d * 0.5;
transformed.z += sin(uTime * 5.0 + d * 6.0 + transformed.x * 4.0) * d * (0.02 + uBack * 0.08);`,
    );
  };
  mat.customProgramCacheKey = () => "cape";
  return { mat, u };
}

export function buildHero(L: Look): Rig {
  const fem = !!L.female;
  const H = L.height ?? (fem ? 1.64 : 1.8);
  const s = H / 1.8;
  const bulk = L.bulk ?? 1;
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(s);
  root.add(body);
  const skin = toon(L.skin, { rim: 0.25, soft: 0.5 });
  const robeTex = robeTexture(L);
  const robeMat = toon(0xffffff, { map: robeTex });
  const robe = toon(L.robe);
  const robe2 = toon(L.robe2);
  const trim = toon(L.trim, { rim: 0.5 });
  const pants = toon(L.pants);
  const boots = toon(L.boots);
  const hair = toon(L.hair, { rim: 0.5, soft: 0.25 });
  const armor = L.armor ? toon(L.armor, { rim: 0.6 }) : null;
  const armorTrim = toon(L.armorTrim ?? L.trim, { rim: 0.6 });
  const gear = toon(L.gearColor ?? 0xc8a040, { rim: 0.6 });
  const glowMats: THREE.MeshToonMaterial[] = [];
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, p?: THREE.Vector3) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    if (p) m.position.copy(p);
    parent.add(m);
    return m;
  };
  const joint = (name: Joint, parent: THREE.Object3D, x: number, y: number, z: number) => {
    const o = new THREE.Object3D();
    o.name = name;
    o.position.set(x, y, z);
    parent.add(o);
    return o;
  };
  const legLen = fem ? 0.9 : 0.92;
  const j = {} as Record<Joint, THREE.Object3D>;
  j.hips = joint("hips", body, 0, legLen + 0.06, 0);
  j.spine = joint("spine", j.hips, 0, 0.1, 0);
  j.chest = joint("chest", j.spine, 0, 0.18, 0);
  j.neck = joint("neck", j.chest, 0, 0.27, 0);
  j.head = joint("head", j.neck, 0, 0.08, 0.01);
  const shW = (fem ? 0.17 : 0.2) * bulk;
  j.shL = joint("shL", j.chest, shW, 0.22, 0);
  j.shR = joint("shR", j.chest, -shW, 0.22, 0);
  j.armL = joint("armL", j.shL, 0.03, 0, 0);
  j.armR = joint("armR", j.shR, -0.03, 0, 0);
  const upper = fem ? 0.27 : 0.3;
  const fore = fem ? 0.24 : 0.27;
  j.foreL = joint("foreL", j.armL, 0, -upper, 0);
  j.foreR = joint("foreR", j.armR, 0, -upper, 0);
  j.handL = joint("handL", j.foreL, 0, -fore, 0);
  j.handR = joint("handR", j.foreR, 0, -fore, 0);
  const hipW = fem ? 0.1 : 0.1;
  j.thighL = joint("thighL", j.hips, hipW, -0.02, 0);
  j.thighR = joint("thighR", j.hips, -hipW, -0.02, 0);
  const thigh = legLen * 0.5;
  j.shinL = joint("shinL", j.thighL, 0, -thigh, 0);
  j.shinR = joint("shinR", j.thighR, 0, -thigh, 0);
  j.footL = joint("footL", j.shinL, 0, -legLen * 0.45, 0);
  j.footR = joint("footR", j.shinR, 0, -legLen * 0.45, 0);

  // ---------------------------------------------------------------- torso
  const tp: [number, number][] = fem
    ? [[0.0001, -0.12], [0.13, -0.1], [0.165, -0.02], [0.155, 0.06], [0.115, 0.17], [0.125, 0.25], [0.15, 0.33], [0.155, 0.4], [0.14, 0.46], [0.08, 0.53], [0.05, 0.56]]
    : [[0.0001, -0.12], [0.14, -0.1], [0.16, -0.02], [0.15, 0.06], [0.14, 0.16], [0.16, 0.26], [0.18, 0.36], [0.18, 0.43], [0.16, 0.48], [0.08, 0.55], [0.055, 0.58]];
  const torso = mesh(lathe(tp.map(([r, y]) => [r * bulk, y] as [number, number]), 32, 1.18, 0.74), robeMat, j.hips);
  torso.position.y = 0.02;
  // Neck and head.
  mesh(limb(0.1, 0.045, 0.05, 12), skin, j.neck, V(0, 0.07, 0));
  const R = 0.118;
  const headGeo = new THREE.SphereGeometry(R, 48, 32);
  {
    // Narrow the jaw into a soft point, flatten the back a touch.
    const p = headGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i);
      let y = p.getY(i);
      let z = p.getZ(i);
      if (y < 0) {
        const k = -y / R;
        x *= 1 - k * k * 0.32;
        z *= 1 - k * k * (z < 0 ? 0.35 : 0.12);
        if (z > 0) y -= k * k * z * 0.35;
      }
      if (z < 0) z *= 0.94;
      p.setXYZ(i, x * 0.93, y * 1.04, z);
    }
    headGeo.computeVertexNormals();
  }
  const face = makeFace({ skin: L.skin, iris: L.iris, brow: L.hair, female: fem, stern: L.stern ?? (fem ? 0 : 0.4), flush: L.flush });
  const faceMat = toon(0xffffff, { map: face.open, rim: 0.15, soft: 0.8 });
  const headMesh = mesh(headGeo, faceMat, j.head, V(0, R * 0.95, 0));
  // Ears.
  for (const sd of [-1, 1]) mesh(new THREE.SphereGeometry(0.022, 10, 8).scale(0.5, 1, 0.8), skin, headMesh, V(sd * R * 0.9, 0, -0.005));
  buildHair(L, headMesh, R, hair, gear);

  // ---------------------------------------------------------------- arms
  for (const sd of [-1, 1] as const) {
    const arm = sd > 0 ? j.armL : j.armR;
    const foreJ = sd > 0 ? j.foreL : j.foreR;
    const hand = sd > 0 ? j.handL : j.handR;
    mesh(limb(upper, 0.055 * bulk, 0.046 * bulk, 14, 0.1), L.armor ? robe2 : robe, arm);
    mesh(limb(fore, 0.044, 0.034, 12), skin, foreJ);
    // Hand: a soft mitten with a thumb.
    const hm = mesh(new THREE.SphereGeometry(0.042, 14, 10).scale(0.75, 1.15, 0.6), skin, hand, V(0, -0.04, 0.005));
    mesh(new THREE.SphereGeometry(0.018, 8, 6).scale(1, 1.6, 1), skin, hm, V(-sd * 0.025, 0.01, 0.02));
    if (L.sleeves !== "fitted") {
      // The wide hanfu sleeve: a full lantern over the forearm closing at the wrist, and the
      // hanging part of the sleeve, which the animator keeps pointing at the ground.
      mesh(lathe([[0.056, 0.03], [0.075, -0.05], [0.092, -0.14], [0.085, -0.22], [0.058, -0.27], [0.052, -0.28]], 20, 1, 0.9), robe, foreJ);
      mesh(new THREE.TorusGeometry(0.052, 0.012, 6, 18).rotateX(Math.PI / 2), trim, foreJ, V(0, -0.275, 0));
      const drape = new THREE.Object3D();
      drape.position.set(0, -0.14, 0);
      foreJ.add(drape);
      const dg = new THREE.PlaneGeometry(0.2, 0.3, 4, 6).translate(0, -0.15, 0);
      const pp = dg.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pp.count; i++) {
        const y = pp.getY(i);
        const x = pp.getX(i);
        // A rounded, slightly cupped bottom edge.
        pp.setZ(i, -Math.cos(x * 12) * 0.03 * (-y / 0.3));
        if (y < -0.25) pp.setY(i, y + (1 - Math.cos(x * 10)) * 0.04);
      }
      dg.rotateY(Math.PI / 2);
      dg.computeVertexNormals();
      const dm = mesh(dg, toon(L.robe, { side: THREE.DoubleSide, soft: 0.3 }), drape);
      dm.userData.outlineWidth = 0.0022;
      const hem = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.03, 0.21).translate(0, -0.29, 0), trim);
      drape.add(hem);
      drape.userData.drape = sd;
    } else {
      // Bracers.
      mesh(lathe([[0.05, 0], [0.052, -0.06], [0.048, -0.18], [0.046, -0.2]], 16), armor ?? trim, foreJ, V(0, -0.02, 0));
    }
    if (L.armor) {
      // Pauldrons: three overlapping curved plates.
      const sh = sd > 0 ? j.shL : j.shR;
      for (let k = 0; k < 3; k++) {
        const pl = new THREE.SphereGeometry(0.1 - k * 0.012, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.42);
        const m = mesh(pl, k === 0 ? armorTrim : armor!, sh, V(sd * 0.04, 0.03 - k * 0.045, 0));
        m.rotation.z = -sd * (0.55 + k * 0.1);
        m.scale.set(1.1, 0.9, 1.05);
      }
    }
  }
  // ---------------------------------------------------------------- legs
  for (const sd of [-1, 1] as const) {
    const th = sd > 0 ? j.thighL : j.thighR;
    const sh = sd > 0 ? j.shinL : j.shinR;
    const ft = sd > 0 ? j.footL : j.footR;
    mesh(limb(thigh, 0.075 * bulk, 0.058, 14, 0.05), pants, th);
    mesh(limb(legLen * 0.45, 0.056, 0.042, 14, 0.1), boots, sh);
    // Boot: a rounded toe with an upturned tip (운혜 style) and a sole.
    const bm = mesh(new THREE.CapsuleGeometry(0.045, 0.12, 6, 12).rotateX(Math.PI / 2).scale(1, 0.72, 1), boots, ft, V(0, -0.02, 0.05));
    mesh(new THREE.SphereGeometry(0.02, 8, 6), boots, bm, V(0, 0.018, 0.095));
    mesh(lathe([[0.06, 0], [0.058, 0.08], [0.06, 0.16]], 14), trim, sh, V(0, -0.3, 0)).scale.setScalar(0.95);
  }

  // ---------------------------------------------------------------- robe, armour, cape
  let skirt: Rig["skirt"] = null;
  const rl = L.robeLen ?? 0.62;
  if (rl > 0) {
    const sm = skirtMaterial(L.robe, null);
    const sk = lathe([[0.17 * bulk, 0.02], [0.18 * bulk, -0.06], [0.2 * bulk, -rl * 0.4], [0.24 * bulk, -rl * 0.8], [0.26 * bulk, -rl]], 32, 1.12, 0.9);
    mesh(sk, sm.mat, j.hips).userData.noOutline = true;
    // Hem trim.
    
    skirt = { u: sm.u };
  }
  if (L.armor) {
    // Tassets over the skirt front and sides.
    for (const a of [-0.9, 0, 0.9]) {
      const pl = new THREE.CylinderGeometry(0.2 * bulk, 0.24 * bulk, 0.26, 16, 1, true, a - 0.45, 0.9);
      const m = mesh(pl, armor!, j.hips, V(0, -0.12, 0));
      m.scale.set(1.12, 1, 0.92);
      (m.material as THREE.Material).side = THREE.DoubleSide;
    }
    // Beast-face buckle.
    mesh(new THREE.SphereGeometry(0.05, 14, 10).scale(1, 0.85, 0.4), armorTrim, j.hips, V(0, 0.02, 0.14 * bulk));
    mesh(new THREE.TorusGeometry(0.165 * bulk, 0.02, 8, 32).rotateX(Math.PI / 2).scale(1.18, 1, 0.76), armorTrim, j.hips, V(0, 0.02, 0));
  } else {
    // Sash knot and hanging ends.
    mesh(new THREE.SphereGeometry(0.035, 12, 8).scale(1.2, 0.8, 0.6), toon(L.sash), j.hips, V(0.06, 0.05, 0.12));
  }
  const chains: Chain[] = [];
  const scarfChains: Chain[] = [];
  // Sash ends / jade pendant: a short chain at the front.
  {
    const c0 = new THREE.Object3D();
    c0.position.set(0.06, 0.02, 0.125 * bulk);
    j.hips.add(c0);
    const links: THREE.Object3D[] = [c0];
    let parent = c0;
    for (let k = 0; k < 3; k++) {
      const seg = new THREE.Object3D();
      seg.position.y = k === 0 ? 0 : -0.1;
      parent.add(seg);
      mesh(new THREE.BoxGeometry(0.05, 0.11, 0.008).translate(0, -0.05, 0), toon(L.sash, { side: THREE.DoubleSide }), seg);
      links.push(seg);
      parent = seg;
    }
    chains.push({ joints: links.slice(1), ax: [0, 0, 0], az: [0, 0, 0], vx: [0, 0, 0], vz: [0, 0, 0], stiff: 30, rest: 0 });
  }
  let cape: Rig["cape"] = null;
  if (L.cape) {
    const cm = capeMaterial(L.cape);
    // A trapezoid of cloth: narrow at the shoulders, wide and rounded at the hem, cupped round the back.
    const cg = new THREE.PlaneGeometry(1, 1.05, 10, 18).translate(0, -0.525, 0);
    const p = cg.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i);
      const d = -p.getY(i);
      const w = (0.32 + d * 0.3) * bulk;
      const x = u * w;
      let y = -d;
      // Rounded hem: the sides hang a little shorter.
      if (d > 0.85) y += (Math.abs(u) * 2) ** 2 * (d - 0.85) * 0.8;
      p.setXYZ(i, x, y, -Math.cos(u * 2.2) * 0.07 * (1 + d * 0.4) + d * 0.02);
    }
    cg.computeVertexNormals();
    const m = mesh(cg, cm.mat, j.chest, V(0, 0.44, -0.14 * bulk));
    m.userData.noOutline = true;
    cape = { u: cm.u };
  }
  if (L.scarf) {
    // 披帛: two light ribbons from the shoulders that flutter as springy chains.
    for (const sd of [-1, 1]) {
      const segs = [0, 1, 2, 3, 4].map((k) => ({ len: 0.16, w: 0.03 - k * 0.003, t: 0.004 }));
      const ch = hairChain(j.chest, V(sd * 0.2 * bulk, 0.4, -0.06), segs, toon(L.scarf, { side: THREE.DoubleSide, soft: 0.5 }), 18, 0.3);
      scarfChains.push(ch);
    }
  }
  // ---------------------------------------------------------------- weapon
  const weapon = buildWeapon(L.weapon);
  j.handR.add(weapon);
  weapon.position.set(0, -0.05, 0.02);
  let weapon2: THREE.Group | null = null;
  if (L.weapon.kind === "twin") {
    weapon2 = buildWeapon(L.weapon);
    j.handL.add(weapon2);
    weapon2.position.set(0, -0.05, 0.02);
  }
  weapon.traverse((o) => {
    const mm = (o as THREE.Mesh).material as THREE.MeshToonMaterial | undefined;
    if (mm && mm.emissive && mm.emissive.getHex() !== 0) glowMats.push(mm);
  });
  // Hair chains (ponytails, long hair) are registered by buildHair on the head mesh.
  headMesh.traverse((o) => {
    if (o.userData.chain) chains.push(o.userData.chain as Chain);
  });
  chains.push(...scarfChains);
  addOutlines(root, 0x2a1820, 0.0032);
  const rest = {} as Record<Joint, THREE.Euler>;
  for (const k of JOINTS) rest[k] = j[k].rotation.clone();
  const drapes: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (o.userData.drape) drapes.push(o);
    if ((o as THREE.Mesh).isMesh && !o.userData.isOutline) (o as THREE.Mesh).receiveShadow = true;
  });
  return { root, body, j, rest, face, faceMat, weapon, weapon2, chains, skirt, cape, height: H, look: L, glowMats, drapes };
}

/** Make a springy chain of locks hanging from `anchor`: returns the chain for the animator. */
function hairChain(anchor: THREE.Object3D, at: THREE.Vector3, segs: { len: number; w: number; t: number }[], mat: THREE.Material, stiff = 40, bend = 0.25): Chain {
  const joints: THREE.Object3D[] = [];
  let parent: THREE.Object3D = anchor;
  segs.forEach((sg, k) => {
    const o = new THREE.Object3D();
    if (k === 0) o.position.copy(at);
    else o.position.y = -segs[k - 1].len;
    parent.add(o);
    const next = segs[k + 1];
    const pts = [V(0, 0.02, 0), V(0, -sg.len * 0.5, -0.005), V(0, -sg.len - 0.02, 0)];
    const geo = strand(pts, sg.w, sg.t, { taper: next ? 0 : 1.1, tip: next ? next.w / sg.w : 0.02, seg: 6 });
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    o.add(m);
    o.rotation.x = bend;
    joints.push(o);
    parent = o;
  });
  return { joints, ax: joints.map(() => 0), az: joints.map(() => 0), vx: joints.map(() => 0), vz: joints.map(() => 0), stiff, rest: bend };
}

function buildHair(L: Look, head: THREE.Mesh, R: number, hair: THREE.MeshToonMaterial, gear: THREE.MeshToonMaterial): void {
  const style = L.hairStyle;
  const Rh = R * 1.09;
  // The cap: a sphere whose lower edge rides high over the brow and low at the nape.
  const cap = (() => {
    const U = 48;
    const Vn = 18;
    const pos: number[] = [];
    const idx: number[] = [];
    for (let v = 0; v <= Vn; v++)
      for (let u = 0; u <= U; u++) {
        const phi = (u / U) * Math.PI * 2;
        const front = (1 + Math.cos(phi)) / 2; // 1 at the front, 0 at the back
        const thMax = Math.PI * (0.62 - front * 0.3);
        const th = (v / Vn) * thMax;
        const r = Rh * (1 + 0.03 * Math.sin(phi * 7 + th * 5));
        const p = sph(th, phi, r);
        pos.push(p.x * 0.95, p.y * 1.03, p.z);
      }
    for (let v = 0; v < Vn; v++)
      for (let u = 0; u < U; u++) {
        const a = v * (U + 1) + u;
        idx.push(a, a + U + 1, a + 1, a + 1, a + U + 1, a + U + 2);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  })();
  const locks: THREE.BufferGeometry[] = [cap];
  // Bangs: locks from the crown falling forward over the brow, parted slightly off-centre.
  const nB = L.female ? 9 : 7;
  for (let k = 0; k < nB; k++) {
    const phi = -0.95 + (k / (nB - 1)) * 1.9 + 0.08;
    const len = (L.female ? 0.48 : 0.4) + Math.sin(k * 2.3) * 0.05;
    const a = sph(0.18 * Math.PI, phi * 0.6, Rh * 1.02);
    const b = sph(0.33 * Math.PI, phi * 0.9, Rh * 1.12);
    const c = sph(len * Math.PI, phi * 1.05 + Math.sign(phi) * 0.05, Rh * 1.07);
    locks.push(strand([a, b, c], 0.042, 0.016, { flatUp: sph(0.3 * Math.PI, phi, 1), taper: 1.3 }));
  }
  // Side locks framing the face.
  for (const sd of [-1, 1]) {
    const long = L.female || style === "long" ? 1 : 0.55;
    const a = sph(0.3 * Math.PI, sd * 1.25, Rh);
    const b = sph(0.58 * Math.PI, sd * 1.35, Rh * 1.08);
    const c = V(sd * R * 0.95, -R * (1.2 + long * 1.4), R * 0.25);
    locks.push(strand([a, b, c], 0.04, 0.016, { flatUp: V(sd, 0, 0), taper: 1.1 }));
  }
  // Back and crown volume for the loose styles.
  if (style === "long" || style === "wild" || style === "twin" || style === "short") {
    const n = style === "short" ? 8 : 12;
    for (let k = 0; k < n; k++) {
      const phi = Math.PI + (k / (n - 1) - 0.5) * 2.6;
      const a = sph(0.25 * Math.PI, phi, Rh);
      const b = sph(0.62 * Math.PI, phi, Rh * 1.12);
      const len = style === "long" ? 3.8 : style === "wild" ? 1.6 : 1.1;
      const c = V(Math.sin(phi) * R * 0.9, -R * len, Math.cos(phi) * R * (style === "wild" ? 1.6 : 1.05));
      locks.push(strand([a, b, c], style === "wild" ? 0.055 : 0.05, 0.018, { flatUp: V(Math.sin(phi), 0, Math.cos(phi)) }));
    }
  }
  if (style === "wild") {
    // Spiky crown (장비).
    for (let k = 0; k < 10; k++) {
      const phi = (k / 10) * Math.PI * 2;
      const a = sph(0.3 * Math.PI, phi, Rh * 0.95);
      locks.push(strand([a, sph(0.3 * Math.PI, phi, Rh * 1.3), sph(0.22 * Math.PI, phi + 0.3, Rh * 1.6)], 0.035, 0.02));
    }
  }
  const capMesh = new THREE.Mesh(merge(locks), hair);
  capMesh.castShadow = true;
  head.add(capMesh);
  // Tied styles.
  if (style === "topknot" || style === "bun") {
    const bun = new THREE.Mesh(new THREE.SphereGeometry(R * 0.42, 18, 14).scale(1, 0.9, 1), hair);
    bun.position.set(0, R * 1.1, -R * 0.15);
    head.add(bun);
    if (style === "bun") {
      // Hairpins with a pearl.
      for (const sd of [-1, 1]) {
        const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.2, 5).rotateZ(sd * 1.1), gear);
        pin.position.set(0, R * 1.15, -R * 0.1);
        head.add(pin);
        const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), toon(0xfff4f0, { rim: 0.8 }));
        pearl.position.set(sd * 0.09, R * 1.15 + 0.04, -R * 0.1);
        head.add(pearl);
      }
    }
  }
  if (style === "ponytail" || style === "twin" || style === "long") {
    const tails = style === "twin" ? [-1, 1] : [0];
    for (const sd of tails) {
      const at = style === "twin" ? V(sd * R * 0.85, R * 0.55, -R * 0.3) : V(0, R * 0.7, -R * 0.85);
      // The tie.
      const tie = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.009, 6, 12), gear);
      tie.position.copy(at);
      tie.rotation.x = 0.6;
      head.add(tie);
      const segs = style === "long" ? [{ len: 0.16, w: 0.06, t: 0.03 }, { len: 0.16, w: 0.055, t: 0.025 }, { len: 0.14, w: 0.045, t: 0.02 }] : [{ len: 0.15, w: 0.05, t: 0.035 }, { len: 0.15, w: 0.045, t: 0.03 }, { len: 0.14, w: 0.035, t: 0.022 }, { len: 0.12, w: 0.025, t: 0.015 }];
      const ch = hairChain(head, at, segs, hair, 38, style === "twin" ? 0.2 : 0.45);
      const holder = new THREE.Object3D();
      holder.userData.chain = ch;
      head.add(holder);
    }
  }
  // Beards.
  if (L.beard && L.beard !== "none") {
    const parts: THREE.BufferGeometry[] = [];
    if (L.beard === "long") {
      // 美髯: a long flowing beard to the chest, and a mustache.
      for (let k = 0; k < 9; k++) {
        const x = (k / 8 - 0.5) * R * 1.1;
        parts.push(strand([V(x * 0.7, -R * 0.72, R * 0.72), V(x * 0.85, -R * 1.3, R * 0.92), V(x * 0.55, -R * 2.6, R * 0.95), V(x * 0.15, -R * 4.1, R * 0.78)], 0.026, 0.012, { flatUp: V(0, 0, 1) }));
      }
    } else if (L.beard === "bushy") {
      for (let k = 0; k < 14; k++) {
        const a = -1.3 + (k / 13) * 2.6;
        parts.push(strand([sph(0.62 * Math.PI, a, R), sph(0.78 * Math.PI, a * 1.1, R * 1.2), sph(0.9 * Math.PI, a * 1.2, R * 1.55)], 0.03, 0.02));
      }
    } else {
      parts.push(strand([V(0, -R * 0.75, R * 0.7), V(0, -R * 1.2, R * 0.72), V(0, -R * 1.7, R * 0.6)], 0.028, 0.014));
    }
    for (const sd of [-1, 1]) parts.push(strand([V(sd * 0.008, -R * 0.38, R * 0.95), V(sd * R * 0.35, -R * 0.45, R * 0.9), V(sd * R * 0.6, -R * 0.75, R * 0.72)], 0.012, 0.007));
    const m = new THREE.Mesh(merge(parts), hair);
    m.castShadow = true;
    head.add(m);
  }
  // Headgear.
  const gc = L.gearColor ?? 0xc8a040;
  switch (L.headgear) {
    case "guan": {
      // A small lacquered cap on the topknot with a hairpin through it.
      const c = new THREE.Mesh(lathe([[0.0001, 0], [0.05, 0.005], [0.055, 0.05], [0.045, 0.085], [0.0001, 0.09]], 18, 1, 1.25), toon(0x1a1a22, { rim: 0.6 }));
      c.position.set(0, R * 1.05, -R * 0.12);
      head.add(c);
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.22, 6).rotateZ(Math.PI / 2), toon(gc, { rim: 0.8 }));
      pin.position.set(0, R * 1.05 + 0.05, -R * 0.12);
      head.add(pin);
      break;
    }
    case "scholar": {
      // 윤건: a soft rounded cloth cap with two ribbons behind.
      const c = new THREE.Mesh(lathe([[0.0001, 0], [R * 0.72, 0.0], [R * 0.75, 0.05], [R * 0.62, 0.1], [R * 0.3, 0.13], [0.0001, 0.135]], 24, 1, 1.1), toon(gc, { soft: 0.5 }));
      c.position.set(0, R * 0.92, -R * 0.2);
      c.rotation.x = -0.25;
      head.add(c);
      for (const sd of [-1, 1]) {
        const ch = hairChain(head, V(sd * 0.03, R * 0.6, -R * 1.0), [{ len: 0.14, w: 0.025, t: 0.004 }, { len: 0.14, w: 0.022, t: 0.004 }], toon(gc, { side: THREE.DoubleSide }), 25, 0.35);
        const holder = new THREE.Object3D();
        holder.userData.chain = ch;
        head.add(holder);
      }
      break;
    }
    case "helm": {
      // Silver helmet: bowl, brim, cheek guards, a spike and a red tassel.
      const metal = toon(gc, { rim: 0.8 });
      const bowl = new THREE.Mesh(new THREE.SphereGeometry(R * 1.16, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.42), metal);
      bowl.position.y = R * 0.28;
      head.add(bowl);
      const brim = new THREE.Mesh(new THREE.TorusGeometry(R * 1.1, 0.014, 6, 32).rotateX(Math.PI / 2), toon(0xc89a3a, { rim: 0.8 }));
      brim.position.y = R * 0.55;
      head.add(brim);
      // A peak over the brow.
      const peak = new THREE.Mesh(new THREE.SphereGeometry(R * 0.5, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.3).scale(1.2, 0.5, 1), toon(0xc89a3a, { rim: 0.8 }));
      peak.position.set(0, R * 0.62, R * 0.85);
      peak.rotation.x = 0.5;
      head.add(peak);
      const spike = new THREE.Mesh(lathe([[0.0001, 0], [0.02, 0.01], [0.012, 0.08], [0.0001, 0.12]], 10), toon(0xc89a3a, { rim: 0.8 }));
      spike.position.y = R * 1.4;
      head.add(spike);
      const ch = hairChain(head, V(0, R * 1.3, 0), [{ len: 0.1, w: 0.04, t: 0.03 }, { len: 0.1, w: 0.035, t: 0.025 }, { len: 0.08, w: 0.02, t: 0.015 }], toon(0xd02020), 30, 1.2);
      const holder = new THREE.Object3D();
      holder.userData.chain = ch;
      head.add(holder);
      break;
    }
    case "plume": {
      // 자금관: a golden crown with two long pheasant tail feathers sweeping back.
      const crown = new THREE.Mesh(lathe([[R * 0.55, 0], [R * 0.62, 0.03], [R * 0.5, 0.07], [R * 0.3, 0.09]], 18), toon(gc, { rim: 0.9 }));
      crown.position.set(0, R * 1.02, -R * 0.1);
      head.add(crown);
      const jewel = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), toon(0xe02a4a, { emissive: 0x801020, rim: 0.9 }));
      jewel.position.set(0, R * 1.08, R * 0.45);
      head.add(jewel);
      for (const sd of [-1, 1]) {
        const pts: THREE.Vector3[] = [];
        for (let k = 0; k <= 12; k++) {
          const t = k / 12;
          // Up from the crown, then a long arc back and out, drooping at the tip.
          pts.push(V(sd * (0.03 + t * 0.28), R * 1.1 + Math.sin(t * Math.PI * 0.85) * 0.38, -R * 0.1 - t * 0.9));
        }
        const f = new THREE.Mesh(strand(pts, 0.022, 0.006, { taper: 0.6, flatUp: V(sd, 0, 0), seg: 24 }), toon(0x9a5a2a, { rim: 0.5, soft: 0.4 }));
        head.add(f);
        // Barred pattern: dark bands along the feather.
        for (let k = 1; k < 11; k += 1.4) {
          const t = k / 12;
          const b = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 4).scale(1.4, 0.35, 1.6), toon(0x2a1a10));
          b.position.set(sd * (0.03 + t * 0.28), R * 1.1 + Math.sin(t * Math.PI * 0.85) * 0.38, -R * 0.1 - t * 0.9);
          head.add(b);
        }
      }
      break;
    }
    case "headband": {
      // The yellow turban cloth of the 황건: a band and two tails.
      const band = new THREE.Mesh(new THREE.TorusGeometry(R * 1.1, 0.02, 8, 32).rotateX(Math.PI / 2 + 0.2), toon(gc));
      band.position.y = R * 0.35;
      head.add(band);
      for (const sd of [-1, 1]) {
        const ch = hairChain(head, V(sd * 0.03, R * 0.3, -R * 1.1), [{ len: 0.12, w: 0.03, t: 0.005 }, { len: 0.1, w: 0.025, t: 0.005 }], toon(gc, { side: THREE.DoubleSide }), 25, 0.5);
        const holder = new THREE.Object3D();
        holder.userData.chain = ch;
        head.add(holder);
      }
      break;
    }
    case "hood": {
      const h = new THREE.Mesh(new THREE.SphereGeometry(R * 1.35, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.62), toon(gc, { side: THREE.DoubleSide, soft: 0.5 }));
      h.position.set(0, R * 0.05, -R * 0.12);
      head.add(h);
      break;
    }
    case "pins": {
      const flower = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), toon(gc, { rim: 0.7 }));
      flower.position.copy(sph(0.3 * Math.PI, 1.2, Rh * 1.02));
      head.add(flower);
      for (let k = 0; k < 5; k++) {
        const pet = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6).scale(1, 0.4, 0.6), toon(0xffb0c8, { rim: 0.6 }));
        const a = (k / 5) * Math.PI * 2;
        pet.position.copy(flower.position).add(V(Math.cos(a) * 0.025, Math.sin(a) * 0.025, 0.01));
        head.add(pet);
      }
      break;
    }
    default:
      break;
  }
}
