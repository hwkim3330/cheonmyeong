// Bake every character: sculpt → surface nets → skin weights → one binary per model.
// npx tsx tools/bake.ts [ids...] [--coarse]
import { mkdirSync, writeFileSync } from "node:fs";
import { MeshoptSimplifier } from "meshoptimizer";
import { HEROES, TURBAN_LOOKS } from "../src/data/heroes";
import type { Look } from "../src/char/model";
import { sculptHero, M } from "../src/sdf/hero";
import { mesh } from "../src/sdf/mesher";
import { APOSE } from "../src/sdf/rig";
import { norm, sub, type V3 } from "../src/sdf/sdf";

const ELDER: Look = { ...TURBAN_LOOKS.grunt, hair: 0xd8d4cc, hairStyle: "topknot", headgear: "guan", gearColor: 0x3a2a1a, robe: 0x8a6a4a, robe2: 0xe8dcc0, trim: 0x5a3a2a, sash: 0x5a3a2a, beard: "long", stern: 0.2, robeLen: 0.85, sleeves: "wide", weapon: { kind: "staff", shaft: 0x5a3a1a, accent: 0x8a6a2a } };
export const BAKE: Record<string, { look: Look; coarse?: boolean }> = {
  ...Object.fromEntries(HEROES.map((h) => [h.id, { look: h.look }])),
  ...Object.fromEntries(Object.entries(TURBAN_LOOKS).map(([k, l]) => [`turban-${k}`, { look: l, coarse: true }])),
  "turban-boss": { look: { ...TURBAN_LOOKS.sorcerer, robe: 0xe8c43a, robe2: 0x5a1a1a, gearColor: 0xe8c43a, cape: 0x8a2a1a, bulk: 1.2 } },
  elder: { look: ELDER, coarse: true },
};

const args = process.argv.slice(2);
const ids = args.filter((a) => !a.startsWith("--"));
const forceCoarse = args.includes("--coarse");
mkdirSync("public/models", { recursive: true });

await MeshoptSimplifier.ready;

/**
 * Decimate (keeping material borders and the face texture's layout), then give every
 * triangle a single material by splitting vertices that sit on a border.
 */
function finish(pos: number[], nor: number[], mat: number[], uv: number[], wts: [number, number][][], idx: number[], keep: number) {
  const nv = pos.length / 3;
  const attrs = new Float32Array(nv * 6);
  for (let i = 0; i < nv; i++) {
    attrs.set([nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2], uv[i * 2] * 4, uv[i * 2 + 1] * 4, mat[i] * 2], i * 6);
  }
  const [simp] = MeshoptSimplifier.simplifyWithAttributes(new Uint32Array(idx), new Float32Array(pos), 3, attrs, 6, [0.4, 0.4, 0.4, 1, 1, 3], null, Math.floor((idx.length * keep) / 3) * 3, 0.01);
  const out = { pos: [] as number[], nor: [] as number[], mat: [] as number[], uv: [] as number[], wts: [] as [number, number][][], idx: [] as number[] };
  const map = new Map<string, number>();
  for (let t = 0; t < simp.length; t += 3) {
    const vs = [simp[t], simp[t + 1], simp[t + 2]];
    const ms = vs.map((v) => mat[v]);
    const m = ms[0] === ms[1] || ms[0] === ms[2] ? ms[0] : ms[1] === ms[2] ? ms[1] : Math.min(...ms);
    for (const v of vs) {
      const key = `${v}|${m}`;
      let n = map.get(key);
      if (n === undefined) {
        n = out.pos.length / 3;
        map.set(key, n);
        out.pos.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
        out.nor.push(nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]);
        out.uv.push(uv[v * 2], uv[v * 2 + 1]);
        out.mat.push(m);
        out.wts.push(wts[v]);
      }
      out.idx.push(n);
    }
  }
  return out;
}

for (const id of ids.length ? ids : Object.keys(BAKE)) {
  const t0 = Date.now();
  const { look, coarse } = BAKE[id];
  const sc = sculptHero(look, coarse || forceCoarse);
  let pos: number[] = [];
  let nor: number[] = [];
  let mat: number[] = [];
  let uv: number[] = [];
  let idx: number[] = [];
  let wts: [number, number][][] = [];
  const headB = sc.bones.findIndex((b) => b.name === "head");
  for (const pass of sc.passes) {
    const m = mesh(sc.S, pass.groups, pass.lo, pass.hi, pass.h);
    const base = pos.length / 3;
    for (let i = 0; i < m.pos.length / 3; i++) {
      const p: V3 = [m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]];
      let n: V3 = [m.nor[i * 3], m.nor[i * 3 + 1], m.nor[i * 3 + 2]];
      const w = m.weights[i];
      const onHead = w.length && w[0][0] === headB;
      let u = 0;
      let v = 0;
      if (onHead && m.mat[i] === M.skin) {
        // Face texture: the equirectangular layout the face painter uses (front at u = 0.25).
        const d = norm(sub(p, sc.head));
        const phi = Math.atan2(d[2], -d[0]);
        u = (phi < 0 ? phi + Math.PI * 2 : phi) / (Math.PI * 2);
        v = 1 - Math.acos(Math.max(-1, Math.min(1, d[1]))) / Math.PI;
        // Anime face lighting: bend the face's normals toward a sphere's.
        if (p[2] > sc.head[2] - 0.02) {
          const s = norm(sub(p, [sc.head[0], sc.head[1] - 0.01, sc.head[2] - 0.04]));
          n = norm([n[0] * 0.3 + s[0] * 0.7, n[1] * 0.3 + s[1] * 0.7, n[2] * 0.3 + s[2] * 0.7]);
        }
      }
      pos.push(p[0], p[1], p[2]);
      nor.push(n[0], n[1], n[2]);
      mat.push(m.mat[i]);
      uv.push(u, v);
      wts.push(w);
    }
    for (const k of m.idx) idx.push(k + base);
  }
  const before = pos.length / 3;
  const fin = finish(pos, nor, mat, uv, wts, idx, coarse || forceCoarse ? 0.1 : 0.14);
  ({ pos, nor, mat, uv, wts, idx } = fin);
  const nv = pos.length / 3;
  console.log(`  decimated ${before} → ${nv} verts`);
  // Pack: positions u16×3 (quantised to the bounds, padded to 8 bytes), normals i8×3 + material u8,
  // uv u16×2, skin index u8×4, weight u8×4, indices u16 (or u32 past 65535 verts).
  const lo = [0, 1, 2].map((a) => Math.min(...pos.filter((_, i) => i % 3 === a)));
  const hi = [0, 1, 2].map((a) => Math.max(...pos.filter((_, i) => i % 3 === a)));
  const i32 = nv > 65535;
  const buf = Buffer.alloc(nv * (8 + 4 + 4 + 4 + 4) + idx.length * (i32 ? 4 : 2));
  let o = 0;
  for (let i = 0; i < nv; i++, o += 8) for (let a = 0; a < 3; a++) buf.writeUInt16LE(Math.round(((pos[i * 3 + a] - lo[a]) / (hi[a] - lo[a])) * 65535), o + a * 2);
  for (let i = 0; i < nv; i++) {
    for (let k = 0; k < 3; k++) buf.writeInt8(Math.round(Math.max(-1, Math.min(1, nor[i * 3 + k])) * 127), o++);
    buf.writeUInt8(mat[i], o++);
  }
  for (let i = 0; i < nv * 2; i++, o += 2) buf.writeUInt16LE(Math.round(uv[i] * 65535), o);
  for (let i = 0; i < nv; i++) for (let k = 0; k < 4; k++) buf.writeUInt8(wts[i][k]?.[0] ?? 0, o++);
  for (let i = 0; i < nv; i++) {
    const w = wts[i];
    const q = [0, 1, 2, 3].map((k) => Math.round((w[k]?.[1] ?? 0) * 255));
    // Make the bytes sum to 255 exactly.
    const s = q.reduce((a, b) => a + b, 0);
    if (s !== 255) q[0] += 255 - s;
    for (let k = 0; k < 4; k++) buf.writeUInt8(Math.max(0, Math.min(255, q[k])), o++);
  }
  for (const k of idx) {
    if (i32) buf.writeUInt32LE(k, o);
    else buf.writeUInt16LE(k, o);
    o += i32 ? 4 : 2;
  }
  writeFileSync(`public/models/${id}.bin`, buf);
  writeFileSync(`public/models/${id}.json`, JSON.stringify({ v: 2, verts: nv, tris: idx.length / 3, lo, hi, i32, head: sc.head, apose: APOSE, bones: sc.bones.map((b) => ({ name: b.name, parent: b.parent, at: b.at.map((x) => +x.toFixed(5)) })), garment: sc.garment }));
  console.log(`${id}: ${nv} verts, ${idx.length / 3} tris, ${(buf.length / 1e6).toFixed(2)} MB, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
