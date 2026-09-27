/** Smooth shape builders for the characters: lathed bodies, tapered limbs, swept hair strands. */
import * as THREE from "three";

export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** A lathe from (radius, y) pairs, seam at the back (front of the texture is u = 0.5). */
export function lathe(profile: [number, number][], seg = 28, sx = 1, sz = 1): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg, Math.PI, Math.PI * 2);
  g.scale(sx, 1, sz);
  g.computeVertexNormals();
  return g;
}

/** A limb hanging down from its joint: rounded at both ends, tapering r0 → r1 over len. */
export function limb(len: number, r0: number, r1: number, seg = 16, bulge = 0): THREE.BufferGeometry {
  const p: [number, number][] = [
    [0.0001, r0 * 0.95],
    [r0 * 0.72, r0 * 0.65],
    [r0 * 0.96, r0 * 0.15],
    [r0 * (1 + bulge), -len * 0.3],
    [(r0 + r1) * 0.5 * (1 + bulge * 0.5), -len * 0.62],
    [r1, -len],
    [r1 * 0.72, -len - r1 * 0.6],
    [0.0001, -len - r1 * 0.92],
  ];
  return lathe(p, seg);
}

/** Point on a sphere of radius r (theta from the top, phi from the front, +z forward). */
export function sph(theta: number, phi: number, r: number): THREE.Vector3 {
  return V(Math.sin(theta) * Math.sin(phi) * r, Math.cos(theta) * r, Math.sin(theta) * Math.cos(phi) * r);
}

/**
 * A lock of hair (or a feather, or a beard): an elliptical cross-section swept along a smooth
 * curve through `pts`, `w` wide and `t` thick at the root, tapering to a point.
 */
export function strand(pts: THREE.Vector3[], w: number, t: number, opts: { taper?: number; seg?: number; flatUp?: THREE.Vector3; tip?: number } = {}): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
  const N = opts.seg ?? 14;
  const R = 7;
  const taper = opts.taper ?? 1.2;
  const tip = opts.tip ?? 0.02;
  const pos: number[] = [];
  const idx: number[] = [];
  const up = opts.flatUp ?? V(0, 1, 0);
  const frames = curve.computeFrenetFrames(N, false);
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const c = curve.getPointAt(u);
    const tan = frames.tangents[i];
    // Keep the lock flat against the head: the wide axis is perpendicular to both the tangent and "out".
    let side = new THREE.Vector3().crossVectors(tan, up);
    if (side.lengthSq() < 1e-6) side = frames.normals[i].clone();
    side.normalize();
    const nrm = new THREE.Vector3().crossVectors(side, tan).normalize();
    const k = Math.max(tip, Math.pow(1 - u, taper)) * (u < 0.12 ? 0.75 + u * 2 : 1);
    for (let j = 0; j < R; j++) {
      const a = (j / R) * Math.PI * 2;
      const p = c.clone().addScaledVector(side, Math.cos(a) * w * k).addScaledVector(nrm, Math.sin(a) * t * k);
      pos.push(p.x, p.y, p.z);
    }
  }
  for (let i = 0; i < N; i++)
    for (let j = 0; j < R; j++) {
      const a = i * R + j;
      const b = i * R + ((j + 1) % R);
      const c = (i + 1) * R + j;
      const d = (i + 1) * R + ((j + 1) % R);
      idx.push(a, c, b, b, c, d);
    }
  // Caps.
  const s0 = pos.length / 3;
  const c0 = curve.getPointAt(0);
  pos.push(c0.x, c0.y, c0.z);
  for (let j = 0; j < R; j++) idx.push(s0, j, (j + 1) % R);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Merge geometries (all indexed, position + normal [+ uv]) into one, keeping smooth normals. */
export function merge(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let base = 0;
  for (const g of gs) {
    const p = g.attributes.position;
    const n = g.attributes.normal;
    const t = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      uv.push(t ? t.getX(i) : 0, t ? t.getY(i) : 0);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + base);
    else for (let i = 0; i < p.count; i++) idx.push(i + base);
    base += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
}

/** A flat extruded shape (blades, fan feathers), centred on its thickness. */
export function blade(shape: THREE.Shape, depth: number, bevel = 0.004): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 16 });
  g.translate(0, 0, -depth / 2);
  g.computeVertexNormals();
  return g;
}
