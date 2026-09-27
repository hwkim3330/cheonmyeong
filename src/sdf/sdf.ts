/**
 * Signed-distance sculpting. A character is a set of groups; each group smooth-blends its
 * primitives (so a shoulder flows into the chest, a jaw into the skull), and groups combine by
 * hard union (so an arm never melts into the ribs). Every primitive carries a material id and
 * the bone it moves with (or a function of position for cloth that follows several bones).
 * Pure math, no DOM: it runs in the offline baker and could run in a worker.
 */

export type V3 = [number, number, number];

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const len = (a: V3) => Math.sqrt(dot(a, a));
export const norm = (a: V3): V3 => mul(a, 1 / (len(a) || 1));
export const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Polynomial smooth minimum. */
export function smin(a: number, b: number, k: number): number {
  if (k <= 0 || a === Infinity || b === Infinity) return Math.min(a, b);
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return b + (a - b) * h - k * h * (1 - h);
}

export type BoneW = [number, number][];

export interface Prim {
  d(p: V3): number;
  /** Axis-aligned bounds (min, max) for culling. */
  lo: V3;
  hi: V3;
  /** Material id, or a function of position (a collar band, a sash, a hem). */
  mat: number | ((p: V3) => number);
  bone: number | ((p: V3) => BoneW);
}

export type Mat = Prim["mat"];
export const matAt = (q: Prim, p: V3): number => (typeof q.mat === "number" ? q.mat : q.mat(p));

export interface Group {
  prims: Prim[];
  k: number;
  /** Carve these out of the group (smooth subtraction with the same k). */
  cut?: Prim[];
  /** Meshing pass this group belongs to (0 body at coarse, 1 head/hair/hands at fine). */
  pass: number;
}

const box = (lo: V3, hi: V3, pad: number): [V3, V3] => [
  [lo[0] - pad, lo[1] - pad, lo[2] - pad],
  [hi[0] + pad, hi[1] + pad, hi[2] + pad],
];

// ------------------------------------------------------------------ primitives

export function sphere(c: V3, r: number, mat: Mat, bone: Prim["bone"]): Prim {
  const [lo, hi] = box(c, c, r);
  return { lo, hi, mat, bone, d: (p) => len(sub(p, c)) - r };
}

export function ellipsoid(c: V3, r: V3, mat: Mat, bone: Prim["bone"], rot?: number[]): Prim {
  const m = Math.max(r[0], r[1], r[2]);
  const [lo, hi] = box(c, c, m);
  return {
    lo,
    hi,
    mat,
    bone,
    d: (p) => {
      let q = sub(p, c);
      if (rot) q = mulM(rot, q);
      const k0 = len([q[0] / r[0], q[1] / r[1], q[2] / r[2]]);
      const k1 = len([q[0] / (r[0] * r[0]), q[1] / (r[1] * r[1]), q[2] / (r[2] * r[2])]);
      return k1 > 0 ? (k0 * (k0 - 1)) / k1 : -Math.min(...r);
    },
  };
}

/** A capsule tapering from r0 at a to r1 at b (a round cone). */
export function cone(a: V3, b: V3, r0: number, r1: number, mat: Mat, bone: Prim["bone"]): Prim {
  const lo: V3 = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])];
  const hi: V3 = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])];
  const [blo, bhi] = box(lo, hi, Math.max(r0, r1));
  const ba = sub(b, a);
  const l2 = dot(ba, ba);
  const rr = r0 - r1;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  return {
    lo: blo,
    hi: bhi,
    mat,
    bone,
    d: (p) => {
      // Inigo Quilez's exact round cone.
      const pa = sub(p, a);
      const y = dot(pa, ba);
      const z = y - l2;
      const xv = sub(mul(pa, l2), mul(ba, y));
      const x2 = dot(xv, xv);
      const y2 = y * y * l2;
      const z2 = z * z * l2;
      const k = Math.sign(rr) * rr * rr * x2;
      if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r1;
      if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r0;
      return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r0;
    },
  };
}

export function capsule(a: V3, b: V3, r: number, mat: Mat, bone: Prim["bone"]): Prim {
  return cone(a, b, r, r, mat, bone);
}

/** A rounded box, optionally rotated (row-major 3x3 world→local). */
export function rbox(c: V3, half: V3, round: number, mat: Mat, bone: Prim["bone"], rot?: number[]): Prim {
  const m = len(half) + round;
  const [lo, hi] = box(c, c, m);
  return {
    lo,
    hi,
    mat,
    bone,
    d: (p) => {
      let q = sub(p, c);
      if (rot) q = mulM(rot, q);
      const dx = Math.abs(q[0]) - half[0];
      const dy = Math.abs(q[1]) - half[1];
      const dz = Math.abs(q[2]) - half[2];
      const out = len([Math.max(dx, 0), Math.max(dy, 0), Math.max(dz, 0)]);
      return out + Math.min(Math.max(dx, dy, dz), 0) - round;
    },
  };
}

/** A chain of round cones through points with radii (a lock of hair, a sash, a feather). */
export function chain(pts: V3[], radii: number[], mat: Mat, bone: Prim["bone"], k = 0): Prim {
  const segs: Prim[] = [];
  for (let i = 0; i + 1 < pts.length; i++) segs.push(cone(pts[i], pts[i + 1], radii[i], radii[i + 1], mat, bone));
  const lo: V3 = [Infinity, Infinity, Infinity];
  const hi: V3 = [-Infinity, -Infinity, -Infinity];
  for (const s of segs)
    for (let a = 0; a < 3; a++) {
      lo[a] = Math.min(lo[a], s.lo[a]);
      hi[a] = Math.max(hi[a], s.hi[a]);
    }
  return {
    lo,
    hi,
    mat,
    bone,
    d: (p) => {
      let d = Infinity;
      for (const s of segs) {
        if (p[0] < s.lo[0] - k - 0.02 || p[0] > s.hi[0] + k + 0.02 || p[1] < s.lo[1] - k - 0.02 || p[1] > s.hi[1] + k + 0.02 || p[2] < s.lo[2] - k - 0.02 || p[2] > s.hi[2] + k + 0.02) {
          continue;
        }
        d = smin(d, s.d(p), k);
      }
      return d === Infinity ? 1 : d;
    },
  };
}

/** A flattened lock (a ribbon of hair): chain whose cross-section is squashed along `flat`. */
export function lock(pts: V3[], w: number[], thick: number, flat: V3, mat: Mat, bone: Prim["bone"]): Prim {
  const f = norm(flat);
  const base = chain(pts, w, mat, bone, 0.004);
  const sq = thick;
  return {
    ...base,
    d: (p) => {
      // Stretch space along the flat axis so the round chain reads as a ribbon.
      const c = pts[Math.floor(pts.length / 2)];
      const q = sub(p, c);
      const along = dot(q, f);
      const pp = add(c, add(sub(q, mul(f, along)), mul(f, along / sq)));
      return base.d(pp) * Math.min(1, sq * 1.2);
    },
  };
}

/** Anything with a custom distance (shells, skirts, capes): supply bounds. */
export function custom(lo: V3, hi: V3, mat: Mat, bone: Prim["bone"], d: (p: V3) => number): Prim {
  return { lo, hi, mat, bone, d };
}

export function mulM(m: number[], v: V3): V3 {
  return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
}

/** Rotation matrix (world → local) about an axis. */
export function rotAxis(axis: V3, ang: number): number[] {
  const [x, y, z] = norm(axis);
  const c = Math.cos(-ang);
  const s = Math.sin(-ang);
  const t = 1 - c;
  return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
}

// ------------------------------------------------------------------ the scene

export class Sculpt {
  groups: Group[] = [];

  group(k: number, pass = 0): Group {
    const g: Group = { prims: [], k, pass };
    this.groups.push(g);
    return g;
  }

  /** Distance and the winning primitive at p, considering only `groups`. */
  eval(p: V3, groups: Group[]): { d: number; prim: Prim | null } {
    let best = Infinity;
    let prim: Prim | null = null;
    for (const g of groups) {
      let d = Infinity;
      let gp: Prim | null = null;
      let gd = Infinity;
      for (const q of g.prims) {
        const m = g.k + 0.03;
        if (p[0] < q.lo[0] - m || p[0] > q.hi[0] + m || p[1] < q.lo[1] - m || p[1] > q.hi[1] + m || p[2] < q.lo[2] - m || p[2] > q.hi[2] + m) continue;
        const dq = q.d(p);
        d = smin(d, dq, g.k);
        if (dq < gd) {
          gd = dq;
          gp = q;
        }
      }
      if (g.cut && d < 0.05)
        for (const c of g.cut) {
          const dc = c.d(p);
          // Smooth subtraction.
          const h = clamp(0.5 - (0.5 * (d + dc)) / Math.max(1e-5, g.k), 0, 1);
          d = d + (-dc - d) * h + g.k * h * (1 - h);
        }
      if (d < best) {
        best = d;
        prim = gp;
      }
    }
    return { d: best, prim };
  }

  /** Bone weights at p: primitives near the surface each lend their bone(s). */
  weights(p: V3, groups: Group[], range = 0.035): BoneW {
    const acc = new Map<number, number>();
    let dmin = Infinity;
    const cand: [Prim, number][] = [];
    for (const g of groups)
      for (const q of g.prims) {
        const m = range + 0.02;
        if (p[0] < q.lo[0] - m || p[0] > q.hi[0] + m || p[1] < q.lo[1] - m || p[1] > q.hi[1] + m || p[2] < q.lo[2] - m || p[2] > q.hi[2] + m) continue;
        const dq = q.d(p);
        cand.push([q, dq]);
        dmin = Math.min(dmin, dq);
      }
    for (const [q, dq] of cand) {
      const w = Math.max(0, 1 - (dq - dmin) / range) ** 2;
      if (w <= 0) continue;
      const bw: BoneW = typeof q.bone === "number" ? [[q.bone, 1]] : q.bone(p);
      for (const [b, x] of bw) acc.set(b, (acc.get(b) ?? 0) + w * x);
    }
    const out = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const s = out.reduce((t, [, w]) => t + w, 0) || 1;
    return out.map(([b, w]) => [b, w / s]);
  }
}
