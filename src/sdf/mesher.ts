/**
 * Surface nets over a sparse grid: the bounds are cut into 8³ blocks, a block is only filled
 * if its centre is within reach of the surface, each cell that straddles the surface gets
 * one vertex (the mean of its edge crossings, then pulled onto the true surface along the
 * gradient), and every crossing edge makes a quad between its four cells. Normals come from
 * the distance field's gradient, so the result is smooth without any smoothing pass.
 */
import { type Group, matAt, type Sculpt, type V3, norm, sub } from "./sdf";

export interface RawMesh {
  pos: number[];
  nor: number[];
  mat: number[];
  idx: number[];
  weights: [number, number][][];
}

const B = 8;

export function mesh(S: Sculpt, groups: Group[], lo: V3, hi: V3, h: number, weightRange = 0.035): RawMesh {
  const nx = Math.ceil((hi[0] - lo[0]) / h) + 1;
  const ny = Math.ceil((hi[1] - lo[1]) / h) + 1;
  const nz = Math.ceil((hi[2] - lo[2]) / h) + 1;
  const bx = Math.ceil(nx / B);
  const by = Math.ceil(ny / B);
  const bz = Math.ceil(nz / B);
  const f = (p: V3) => S.eval(p, groups).d;
  // Pass 1: samples in blocks near the surface.
  const blocks = new Map<number, Float32Array>();
  const rb = (B * h * Math.sqrt(3)) / 2;
  for (let k = 0; k < bz; k++)
    for (let j = 0; j < by; j++)
      for (let i = 0; i < bx; i++) {
        const c: V3 = [lo[0] + (i + 0.5) * B * h, lo[1] + (j + 0.5) * B * h, lo[2] + (k + 0.5) * B * h];
        if (Math.abs(f(c)) > rb + h * 2) continue;
        const s = new Float32Array((B + 2) ** 3);
        for (let z = 0; z <= B + 1; z++)
          for (let y = 0; y <= B + 1; y++)
            for (let x = 0; x <= B + 1; x++) s[(z * (B + 2) + y) * (B + 2) + x] = f([lo[0] + (i * B + x) * h, lo[1] + (j * B + y) * h, lo[2] + (k * B + z) * h]);
        blocks.set((k * by + j) * bx + i, s);
      }
  // A sample on a block's far faces is stored in that block too (it keeps B + 2 per side), so
  // try the owning block first and then the ones below it.
  const sample = (x: number, y: number, z: number): number => {
    for (let di = 0; di <= 1; di++)
      for (let dj = 0; dj <= 1; dj++)
        for (let dk = 0; dk <= 1; dk++) {
          const i = Math.floor(x / B) - di;
          const j = Math.floor(y / B) - dj;
          const k = Math.floor(z / B) - dk;
          if (i < 0 || j < 0 || k < 0) continue;
          const s = blocks.get((k * by + j) * bx + i);
          if (!s) continue;
          const lx = x - i * B;
          const ly = y - j * B;
          const lz = z - k * B;
          if (lx > B + 1 || ly > B + 1 || lz > B + 1) continue;
          return s[(lz * (B + 2) + ly) * (B + 2) + lx];
        }
    return f([lo[0] + x * h, lo[1] + y * h, lo[2] + z * h]);
  };
  // Pass 2: a vertex in every cell with a sign change.
  const vid = new Map<number, number>();
  const out: RawMesh = { pos: [], nor: [], mat: [], idx: [], weights: [] };
  const key = (x: number, y: number, z: number) => (z * ny + y) * nx + x;
  const corners: V3[] = [];
  for (let c = 0; c < 8; c++) corners.push([c & 1, (c >> 1) & 1, (c >> 2) & 1]);
  const edges: [number, number][] = [
    [0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  const e = h * 0.5;
  for (const [bk, s] of blocks) {
    void s;
    const i0 = bk % bx;
    const j0 = Math.floor(bk / bx) % by;
    const k0 = Math.floor(bk / (bx * by));
    for (let z = k0 * B; z < Math.min(nz - 1, k0 * B + B); z++)
      for (let y = j0 * B; y < Math.min(ny - 1, j0 * B + B); y++)
        for (let x = i0 * B; x < Math.min(nx - 1, i0 * B + B); x++) {
          const v: number[] = [];
          let neg = 0;
          for (const [cx, cy, cz] of corners) {
            const d = sample(x + cx, y + cy, z + cz);
            v.push(d);
            if (d < 0) neg++;
          }
          if (neg === 0 || neg === 8) continue;
          let px = 0;
          let py = 0;
          let pz = 0;
          let n = 0;
          for (const [a, b] of edges) {
            if (v[a] < 0 === v[b] < 0) continue;
            const t = v[a] / (v[a] - v[b]);
            const A = corners[a];
            const Bc = corners[b];
            px += A[0] + (Bc[0] - A[0]) * t;
            py += A[1] + (Bc[1] - A[1]) * t;
            pz += A[2] + (Bc[2] - A[2]) * t;
            n++;
          }
          let p: V3 = [lo[0] + (x + px / n) * h, lo[1] + (y + py / n) * h, lo[2] + (z + pz / n) * h];
          // Two Newton steps onto the surface.
          let g: V3 = [0, 1, 0];
          for (let it = 0; it < 2; it++) {
            const d = f(p);
            g = norm([f([p[0] + e, p[1], p[2]]) - f([p[0] - e, p[1], p[2]]), f([p[0], p[1] + e, p[2]]) - f([p[0], p[1] - e, p[2]]), f([p[0], p[1], p[2] + e]) - f([p[0], p[1], p[2] - e])]);
            const step = Math.max(-h * 0.5, Math.min(h * 0.5, d));
            p = sub(p, [g[0] * step, g[1] * step, g[2] * step]);
          }
          const r = S.eval(p, groups);
          vid.set(key(x, y, z), out.pos.length / 3);
          out.pos.push(p[0], p[1], p[2]);
          out.nor.push(g[0], g[1], g[2]);
          out.mat.push(r.prim ? matAt(r.prim, p) : 0);
          out.weights.push(S.weights(p, groups, weightRange));
        }
  }
  // Pass 3: quads across every crossing edge. Each edge is taken from the cell whose min
  // corner it starts at; the four cells round a crossing edge all have vertices. Winding is
  // chosen to agree with the field's gradient.
  const P = out.pos;
  const N = out.nor;
  const quad = (q: (number | undefined)[]) => {
    if (q.some((v) => v === undefined)) return;
    const [a, b, c, d] = q as number[];
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    const nx2 = N[a * 3] + N[b * 3] + N[c * 3] + N[d * 3];
    const ny2 = N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1] + N[d * 3 + 1];
    const nz2 = N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2] + N[d * 3 + 2];
    if (fx * nx2 + fy * ny2 + fz * nz2 >= 0) out.idx.push(a, b, c, a, c, d);
    else out.idx.push(a, c, b, a, d, c);
  };
  for (const [k] of vid) {
    const x = k % nx;
    const y = Math.floor(k / nx) % ny;
    const z = Math.floor(k / (nx * ny));
    const d0 = sample(x, y, z);
    if (d0 < 0 !== sample(x + 1, y, z) < 0 && y > 0 && z > 0) quad([vid.get(key(x, y - 1, z - 1)), vid.get(key(x, y, z - 1)), vid.get(key(x, y, z)), vid.get(key(x, y - 1, z))]);
    if (d0 < 0 !== sample(x, y + 1, z) < 0 && x > 0 && z > 0) quad([vid.get(key(x - 1, y, z - 1)), vid.get(key(x, y, z - 1)), vid.get(key(x, y, z)), vid.get(key(x - 1, y, z))]);
    if (d0 < 0 !== sample(x, y, z + 1) < 0 && x > 0 && y > 0) quad([vid.get(key(x - 1, y - 1, z)), vid.get(key(x, y - 1, z)), vid.get(key(x, y, z)), vid.get(key(x - 1, y, z))]);
  }
  return out;
}
