/**
 * The ground: one heightfield (2 m cells over 2 km) that is also the physics — rolling
 * farmland round the village, ridged hills in the north and west, the limestone peaks rising
 * sheer from the fields (steep enough that you have to climb them), the river cut down to the
 * lake, flat terraces where the village and the camps stand, and a wall of peaks at the edge.
 *
 * Drawn in chunks (two levels of detail) with a painted ground shader: patchy greens that
 * drift from yellow to blue-green, grey cliff faces banded with strata wherever the slope is
 * steep, dusty paths, ploughed fields, sand at the water. A float height texture feeds the
 * grass and the water shader.
 */
import * as THREE from "three";
import { NOISE_GLSL } from "../engine/stage";
import { toon } from "../engine/toon";
import { BEACONS, CAMPS, HALF, LAKE, PEACH, peaks, RIVER, VILLAGE, WATER, WORLD, type Peak } from "./layout";
import { Noise } from "./noise";

export const N = 1025;
const CELL = WORLD / (N - 1);

function segDist(x: number, z: number, pts: [number, number][]): [number, number] {
  let best = Infinity;
  let bt = 0;
  let acc = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const l2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
    if (d < best) {
      best = d;
      bt = acc + t * Math.sqrt(l2);
    }
    acc += Math.sqrt(l2);
  }
  return [best, bt];
}

const sm = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class Terrain {
  readonly h = new Float32Array(N * N);
  /** r path, g meadow flowers, b sand, a farmland. */
  readonly splat = new Uint8Array(N * N * 4);
  readonly peaks: Peak[];
  readonly paths: [number, number][][];
  private readonly noise = new Noise(77);
  heightTex!: THREE.DataTexture;
  splatTex!: THREE.DataTexture;

  constructor() {
    this.peaks = peaks();
    const nz = this.noise;
    const flats = [VILLAGE, PEACH, ...CAMPS];
    // Paths between the places.
    this.paths = [
      [[VILLAGE.x, VILLAGE.z], [-100, 290], [PEACH.x, PEACH.z]],
      [[VILLAGE.x, VILLAGE.z], [-80, 200], [40, 150], [CAMPS[0].x, CAMPS[0].z]],
      [[VILLAGE.x, VILLAGE.z], [-300, 150], [-400, 20], [CAMPS[1].x, CAMPS[1].z]],
      [[CAMPS[0].x, CAMPS[0].z], [300, 0], [CAMPS[2].x, CAMPS[2].z]],
      [[CAMPS[0].x, CAMPS[0].z], [60, -150], [-60, -330], [60, -470], [CAMPS[3].x, CAMPS[3].z]],
      [[VILLAGE.x, VILLAGE.z], [-300, 420], [-420, 600]],
      [[-80, 200], [BEACONS[0].x, BEACONS[0].z]],
    ];
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const x = i * CELL - HALF;
        const z = j * CELL - HALF;
        let h = 8 + nz.fbm(x / 420, z / 420, 4) * 16 + nz.fbm(x / 110 + 9, z / 110, 3) * 3.5;
        // Northern ridges and western hills.
        const north = sm(-250, -850, z);
        h += north * (40 + nz.ridge(x / 260 + 3, z / 260, 5) * 150);
        const west = sm(-250, -800, x) * (1 - north * 0.5);
        h += west * nz.ridge(x / 200, z / 200 + 5, 4) * 70;
        // The edge rises into hills behind the ring of peaks.
        const e = Math.max(Math.abs(x), Math.abs(z)) / HALF;
        h += sm(0.8, 1, e) * 90;
        // Terraces for the village and the camps.
        for (const p of flats) {
          const d = Math.hypot(x - p.x, z - p.z);
          if (p.flat !== undefined && d < p.r * 1.8) h = h + (p.flat - h) * (1 - sm(p.r, p.r * 1.8, d));
        }
        // The river and the lake.
        const [rd, rt] = segDist(x, z, RIVER);
        const rw = 13 + Math.sin(rt / 90) * 4 + (rt / 1600) * 6;
        if (rd < rw * 4) {
          const bed = WATER - 2.6 - Math.min(1.5, rt / 900);
          const k = sm(rw * 0.55, rw * 2.2, rd);
          h = bed + (Math.max(h, WATER + 0.6) - bed) * k;
          if (rd < rw * 1.3) this.splat[(j * N + i) * 4 + 2] = Math.round(255 * (1 - sm(rw * 0.6, rw * 1.3, rd)));
        }
        const ld = Math.hypot(x - LAKE.x, z - LAKE.z) + nz.n2(x / 60, z / 60) * 22;
        if (ld < LAKE.r * 1.4) {
          const k = sm(LAKE.r * 0.6, LAKE.r * 1.3, ld);
          h = WATER - 4.5 + (Math.max(h, WATER + 0.8) - (WATER - 4.5)) * k;
          if (ld < LAKE.r * 1.15) this.splat[(j * N + i) * 4 + 2] = Math.max(this.splat[(j * N + i) * 4 + 2], Math.round(255 * (1 - sm(LAKE.r * 0.85, LAKE.r * 1.15, ld))));
        }
        this.h[j * N + i] = h;
      }
    // Peaks: sheer sides, a rounded wooded top, ledges.
    for (const p of this.peaks) {
      const R = p.r * 1.25;
      const i0 = Math.max(0, Math.floor((p.x - R + HALF) / CELL));
      const i1 = Math.min(N - 1, Math.ceil((p.x + R + HALF) / CELL));
      const j0 = Math.max(0, Math.floor((p.z - R + HALF) / CELL));
      const j1 = Math.min(N - 1, Math.ceil((p.z + R + HALF) / CELL));
      let base = Infinity;
      for (let j = j0; j <= j1; j += 4) for (let i = i0; i <= i1; i += 4) base = Math.min(base, this.h[j * N + i]);
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const x = i * CELL - HALF;
          const z = j * CELL - HALF;
          const a = Math.atan2(z - p.z, x - p.x);
          const wob = 1 + nz.n2(Math.cos(a) * 2 + p.x, Math.sin(a) * 2 + p.z) * 0.16 + nz.n2(Math.cos(a) * 6 + p.z, Math.sin(a) * 6) * 0.06;
          const d = Math.hypot(x - p.x, z - p.z) / (p.r * wob);
          if (d > 1.1) continue;
          // Profile: a tower that bulges then rounds over — sheer below, a domed cap above,
          // with a ledge or two and knobbly weathering.
          const u = Math.max(0, 1 - d);
          const prof = Math.pow(u, 0.42) * (1 - 0.12 * Math.sin(u * 7 + p.x) * u);
          const ph = base + p.h * prof + nz.n2(x / 7, z / 7) * 2.5 * Math.min(1, u * 4) + nz.n2(x / 20 + p.z, z / 20) * 5 * u;
          const k = j * N + i;
          if (ph > this.h[k]) this.h[k] = ph;
        }
    }
    this.paint();
  }

  private paint(): void {
    const nz = this.noise;
    for (const path of this.paths) {
      let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
      for (const [px, pz] of path) {
        minx = Math.min(minx, px);
        maxx = Math.max(maxx, px);
        minz = Math.min(minz, pz);
        maxz = Math.max(maxz, pz);
      }
      const i0 = Math.max(0, Math.floor((minx - 10 + HALF) / CELL));
      const i1 = Math.min(N - 1, Math.ceil((maxx + 10 + HALF) / CELL));
      const j0 = Math.max(0, Math.floor((minz - 10 + HALF) / CELL));
      const j1 = Math.min(N - 1, Math.ceil((maxz + 10 + HALF) / CELL));
      for (let j = j0; j <= j1; j++) {
        const z = j * CELL - HALF;
        for (let i = i0; i <= i1; i++) {
          const x = i * CELL - HALF;
          const [d] = segDist(x, z, path);
          const w = 2.6 + nz.n2(x / 30, z / 30) * 0.8;
          if (d < w * 1.8) {
            const k = (j * N + i) * 4;
            this.splat[k] = Math.max(this.splat[k], Math.round(255 * (1 - sm(w * 0.6, w * 1.8, d))));
          }
        }
      }
    }
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const x = i * CELL - HALF;
        const z = j * CELL - HALF;
        const k = (j * N + i) * 4;
        // Meadows of flowers.
        this.splat[k + 1] = Math.round(255 * sm(0.25, 0.55, nz.fbm(x / 70 + 3, z / 70 - 2, 3)));
        // Fields round the village.
        const fd = Math.hypot(x - (VILLAGE.x - 40), z - (VILLAGE.z + 90));
        if (fd < 130 && Math.hypot(x - VILLAGE.x, z - VILLAGE.z) > 70) this.splat[k + 3] = Math.round(255 * (1 - sm(100, 130, fd)));
      }
  }

  private idx(x: number, z: number): [number, number] {
    return [(x + HALF) / CELL, (z + HALF) / CELL];
  }

  height(x: number, z: number): number {
    const [fx, fz] = this.idx(x, z);
    const i = Math.max(0, Math.min(N - 2, Math.floor(fx)));
    const j = Math.max(0, Math.min(N - 2, Math.floor(fz)));
    const u = Math.max(0, Math.min(1, fx - i));
    const v = Math.max(0, Math.min(1, fz - j));
    const h = this.h;
    const a = h[j * N + i];
    const b = h[j * N + i + 1];
    const c = h[(j + 1) * N + i];
    const d = h[(j + 1) * N + i + 1];
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }

  normal(x: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
    const e = CELL;
    const hx = this.height(x + e, z) - this.height(x - e, z);
    const hz = this.height(x, z + e) - this.height(x, z - e);
    return out.set(-hx, 2 * e, -hz).normalize();
  }

  sample(x: number, z: number, ch: number): number {
    const [fx, fz] = this.idx(x, z);
    const i = Math.max(0, Math.min(N - 1, Math.round(fx)));
    const j = Math.max(0, Math.min(N - 1, Math.round(fz)));
    return this.splat[(j * N + i) * 4 + ch] / 255;
  }

  textures(): void {
    this.heightTex = new THREE.DataTexture(this.h, N, N, THREE.RedFormat, THREE.FloatType);
    this.heightTex.minFilter = this.heightTex.magFilter = THREE.NearestFilter;
    this.heightTex.needsUpdate = true;
    this.splatTex = new THREE.DataTexture(this.splat, N, N, THREE.RGBAFormat);
    this.splatTex.minFilter = this.splatTex.magFilter = THREE.LinearFilter;
    this.splatTex.needsUpdate = true;
  }
}

/** The GLSL for "what colour is the ground here" — shared by the ground and the grass roots. */
export const GROUND_GLSL = /* glsl */ `
${NOISE_GLSL}
uniform sampler2D uSplat; uniform float uWorld;
vec4 splatAt(vec2 w) { return texture2D(uSplat, (w + uWorld * 0.5) / uWorld); }
vec3 grassColour(vec2 w) {
  float big = fbm(w * 0.004);
  float mid = fbm(w * 0.02 + 7.0);
  vec3 a = vec3(0.3, 0.52, 0.2);
  vec3 b = vec3(0.56, 0.68, 0.26);
  vec3 c = vec3(0.22, 0.44, 0.28);
  vec3 g = mix(a, b, smoothstep(0.35, 0.7, big));
  g = mix(g, c, smoothstep(0.55, 0.8, mid) * 0.6);
  return g;
}
`;

export interface GroundUniforms {
  uSplat: { value: THREE.Texture };
  uWorld: { value: number };
  uTime: { value: number };
}

export function groundMaterial(U: GroundUniforms): THREE.MeshToonMaterial {
  const m = toon(0xffffff, { rim: 0.05, soft: 0.6 });
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev(sh, r);
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vW; varying vec3 vN;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz; vN = normal;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying vec3 vW; varying vec3 vN; uniform float uTime;\n${GROUND_GLSL}`)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
{
  vec2 w = vW.xz;
  vec4 s = splatAt(w);
  float slope = 1.0 - normalize(vN).y;
  vec3 c = grassColour(w);
  // Flower meadows: a pale haze of colour.
  c = mix(c, vec3(0.62, 0.72, 0.3), s.g * 0.25);
  // Fields: ploughed rows.
  float rows = smoothstep(0.3, 0.5, abs(fract(w.x * 0.18 + w.y * 0.05) - 0.5) * 2.0);
  vec3 field = mix(vec3(0.62, 0.56, 0.24), vec3(0.42, 0.56, 0.2), rows);
  c = mix(c, field, s.a * 0.85);
  // Paths.
  vec3 dirt = mix(vec3(0.66, 0.54, 0.38), vec3(0.78, 0.66, 0.46), fbm(w * 0.3));
  c = mix(c, dirt, smoothstep(0.2, 0.7, s.r));
  // Sand at the water.
  c = mix(c, vec3(0.86, 0.78, 0.56), smoothstep(0.1, 0.6, s.b));
  // Cliffs: pale limestone, streaked downward by rain, mottled with moss.
  vec2 wall = vec2(w.x * 0.7 + w.y * 0.7, vW.y);
  float streak = fbm(vec2(wall.x * 0.35, wall.y * 0.04));
  float strata = 0.93 + 0.07 * sin(vW.y * 0.7 + fbm(w * 0.05) * 5.0);
  vec3 rock = mix(vec3(0.62, 0.64, 0.66), vec3(0.78, 0.78, 0.76), smoothstep(0.3, 0.7, streak)) * strata;
  rock = mix(rock, vec3(0.46, 0.5, 0.52), smoothstep(0.62, 0.8, fbm(wall * 0.06 + 3.0)) * 0.7);
  rock = mix(rock, vec3(0.36, 0.52, 0.3), smoothstep(0.58, 0.72, fbm(wall * 0.09 + 11.0)) * 0.55);
  float rk = smoothstep(0.38, 0.55, slope + (fbm(w * 0.08) - 0.5) * 0.2);
  c = mix(c, rock, rk);
  // Mossy tops and ledges stay green; under water goes teal.
  c = mix(c, vec3(0.3, 0.55, 0.52), smoothstep(${(WATER - 0.2).toFixed(2)}, ${(WATER - 2.5).toFixed(2)}, vW.y));
  diffuseColor.rgb = c * c * 1.08;
}`,
      );
  };
  m.customProgramCacheKey = () => "ground";
  return m;
}

/** Chunked ground mesh: 16×16 chunks, each built at 2 m and 8 m, swapped by distance. */
export class Ground {
  readonly group = new THREE.Group();
  private readonly chunks: { lo: THREE.Mesh; hi: THREE.Mesh; cx: number; cz: number }[] = [];

  constructor(readonly t: Terrain, mat: THREE.Material) {
    const C = 16;
    const size = WORLD / C;
    for (let cj = 0; cj < C; cj++)
      for (let ci = 0; ci < C; ci++) {
        const x0 = ci * size - HALF;
        const z0 = cj * size - HALF;
        const hi = new THREE.Mesh(this.chunk(x0, z0, size, 64), mat);
        const lo = new THREE.Mesh(this.chunk(x0, z0, size, 16), mat);
        for (const m of [hi, lo]) {
          m.receiveShadow = true;
          m.castShadow = true;
          this.group.add(m);
        }
        lo.visible = false;
        this.chunks.push({ lo, hi, cx: x0 + size / 2, cz: z0 + size / 2 });
      }
  }

  private chunk(x0: number, z0: number, size: number, seg: number): THREE.BufferGeometry {
    const t = this.t;
    const n = seg + 1;
    // One ring of skirt vertices round the edge hides cracks between detail levels.
    const pos: number[] = [];
    const nor: number[] = [];
    const idx: number[] = [];
    const nv = new THREE.Vector3();
    const vert = (i: number, j: number, drop: number) => {
      const x = x0 + (Math.max(0, Math.min(seg, i)) / seg) * size;
      const z = z0 + (Math.max(0, Math.min(seg, j)) / seg) * size;
      pos.push(x, t.height(x, z) - drop, z);
      t.normal(x, z, nv);
      nor.push(nv.x, nv.y, nv.z);
    };
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) vert(i, j, 0);
    for (let j = 0; j < seg; j++)
      for (let i = 0; i < seg; i++) {
        const a = j * n + i;
        idx.push(a, a + n, a + 1, a + 1, a + n, a + n + 1);
      }
    // Skirt: duplicate the border 3 m lower and stitch.
    const border: number[] = [];
    for (let i = 0; i < seg; i++) border.push(i);
    for (let j = 0; j < seg; j++) border.push(j * n + seg);
    for (let i = seg; i > 0; i--) border.push(seg * n + i);
    for (let j = seg; j > 0; j--) border.push(j * n);
    const base = pos.length / 3;
    for (const b of border) {
      pos.push(pos[b * 3], pos[b * 3 + 1] - 3, pos[b * 3 + 2]);
      nor.push(nor[b * 3], nor[b * 3 + 1], nor[b * 3 + 2]);
    }
    for (let k = 0; k < border.length; k++) {
      const a = border[k];
      const b = border[(k + 1) % border.length];
      const c = base + k;
      const d = base + ((k + 1) % border.length);
      idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }

  update(p: THREE.Vector3): void {
    for (const c of this.chunks) {
      const near = Math.hypot(c.cx - p.x, c.cz - p.z) < 330;
      c.hi.visible = near;
      c.lo.visible = !near;
    }
  }
}
