/**
 * What grows and flows: the water (a flat toon surface coloured by depth read from the height
 * texture — turquoise shallows, deep blue, a white foam line at every shore, glints of sun),
 * the grass (tens of thousands of blades wrapped round the camera, their roots the ground's
 * own colour, pale at the tips, bending with the wind and away from the player, flowers in
 * the meadows), and the trees — 복숭아꽃 in pink clouds, pines with flat layered crowns on the
 * peaks and cliffs, bamboo in groves by the river, willows trailing over the water, broadleaf
 * woods on the hills — all instanced, all inked.
 */
import * as THREE from "three";
import { NOISE_GLSL } from "../engine/stage";
import { addOutlines, toon } from "../engine/toon";
import { BEACONS, CAMPS, HALF, LAKE, PEACH, RIVER, VILLAGE, WATER, WORLD } from "./layout";
import { rng } from "./noise";
import { GROUND_GLSL, N, type Terrain } from "./terrain";

export interface WorldU {
  uHeight: { value: THREE.Texture };
  uSplat: { value: THREE.Texture };
  uWorld: { value: number };
  uTime: { value: number };
  uPlayer: { value: THREE.Vector3 };
  uCam: { value: THREE.Vector3 };
  uSun: { value: THREE.Vector3 };
}

const HEIGHT_GLSL = /* glsl */ `
uniform sampler2D uHeight;
float hAt(vec2 w) {
  vec2 f = (w + uWorld * 0.5) / uWorld * ${(N - 1).toFixed(1)};
  vec2 i = floor(f);
  vec2 u = f - i;
  float a = texture2D(uHeight, (i + 0.5) / ${N.toFixed(1)}).r;
  float b = texture2D(uHeight, (i + vec2(1, 0) + 0.5) / ${N.toFixed(1)}).r;
  float c = texture2D(uHeight, (i + vec2(0, 1) + 0.5) / ${N.toFixed(1)}).r;
  float d = texture2D(uHeight, (i + vec2(1, 1) + 0.5) / ${N.toFixed(1)}).r;
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}`;

// ------------------------------------------------------------------ water

export function waterMesh(U: WorldU): THREE.Mesh {
  const g = new THREE.PlaneGeometry(WORLD, WORLD, 1, 1).rotateX(-Math.PI / 2);
  const m = new THREE.ShaderMaterial({
    transparent: true,
    fog: true,
    uniforms: { ...U, ...THREE.UniformsLib.fog },
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec3 vW;
      void main() {
        vW = (modelMatrix * vec4(position, 1.0)).xyz;
        vec4 mvPosition = viewMatrix * vec4(vW, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform float uWorld; uniform float uTime; uniform vec3 uCam; uniform vec3 uSun;
      varying vec3 vW;
      ${HEIGHT_GLSL}
      ${NOISE_GLSL}
      void main() {
        float d = ${WATER.toFixed(2)} - hAt(vW.xz);
        if (d < -0.05) discard;
        vec3 shallow = vec3(0.3, 0.86, 0.84);
        vec3 deep = vec3(0.07, 0.32, 0.62);
        vec3 c = mix(shallow, deep, smoothstep(0.2, 3.5, d));
        // Moving caustic-ish bands.
        float n = fbm(vW.xz * 0.12 + vec2(uTime * 0.05, uTime * 0.03));
        c += vec3(0.12, 0.16, 0.14) * smoothstep(0.55, 0.7, n) * (1.0 - smoothstep(0.5, 3.0, d));
        // Foam: a broken white line at the shore.
        float foam = smoothstep(0.6, 0.0, d) * smoothstep(0.35, 0.55, fbm(vW.xz * 0.5 + uTime * 0.2));
        foam += smoothstep(0.12, 0.0, abs(d - 0.35 - sin(uTime * 1.3 + vW.x * 0.1) * 0.12)) * 0.6;
        c = mix(c, vec3(1.0), clamp(foam, 0.0, 1.0));
        // Sky reflection at grazing angles, and glints of sun.
        vec3 v = normalize(uCam - vW);
        float fr = pow(1.0 - max(v.y, 0.0), 4.0);
        c = mix(c, vec3(0.75, 0.88, 1.0), fr * 0.6);
        vec3 h = normalize(v + uSun);
        float glint = step(0.985, fbm(vW.xz * 0.9 + uTime * 0.4)) * pow(max(dot(h, vec3(0, 1, 0)), 0.0), 60.0);
        c += vec3(1.0, 0.95, 0.8) * glint * 3.0;
        float a = clamp(0.55 + d * 0.25, 0.55, 0.92) + foam * 0.3;
        gl_FragColor = vec4(c * c, clamp(a, 0.0, 1.0));
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.position.y = WATER;
  mesh.renderOrder = 2;
  return mesh;
}

// ------------------------------------------------------------------ grass

export function grassMesh(U: WorldU, count = 110000, radius = 52): THREE.Mesh {
  // A blade: three segments, tapering, slightly curved.
  const blade = new THREE.BufferGeometry();
  const pos: number[] = [];
  const idx: number[] = [];
  const segs = 3;
  for (let s = 0; s <= segs; s++) {
    const t = s / segs;
    const w = 0.07 * (1 - t * 0.85);
    pos.push(-w, t, 0, w, t, 0);
  }
  for (let s = 0; s < segs; s++) {
    const a = s * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  blade.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  blade.setIndex(idx);
  const g = new THREE.InstancedBufferGeometry();
  g.index = blade.index;
  g.attributes.position = blade.attributes.position;
  const off = new Float32Array(count * 4);
  const R = rng(99);
  for (let i = 0; i < count; i++) {
    const a = R() * Math.PI * 2;
    const r = Math.sqrt(R()) * radius;
    off[i * 4] = Math.cos(a) * r;
    off[i * 4 + 1] = Math.sin(a) * r;
    off[i * 4 + 2] = R() * Math.PI * 2;
    off[i * 4 + 3] = R();
  }
  g.setAttribute("aOff", new THREE.InstancedBufferAttribute(off, 4));
  g.instanceCount = count;
  const m = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    fog: true,
    uniforms: { ...U, ...THREE.UniformsLib.fog, ...THREE.UniformsLib.lights, uRadius: { value: radius } },
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      uniform float uTime; uniform vec3 uPlayer; uniform vec3 uCam; uniform float uRadius;
      attribute vec4 aOff;
      varying float vT; varying vec3 vRoot; varying float vFlower; varying float vSeed;
      ${GROUND_GLSL}
      ${HEIGHT_GLSL}
      void main() {
        // Wrap the patch round the camera, snapped so blades don't swim.
        vec2 c = floor(uCam.xz / 2.0) * 2.0;
        vec2 p = aOff.xy + c;
        vec2 rel = p - uCam.xz;
        if (rel.x > uRadius) p.x -= uRadius * 2.0; if (rel.x < -uRadius) p.x += uRadius * 2.0;
        if (rel.y > uRadius) p.y -= uRadius * 2.0; if (rel.y < -uRadius) p.y += uRadius * 2.0;
        p += vec2(fract(aOff.w * 91.3), fract(aOff.w * 57.7)) * 1.3;
        float h = hAt(p);
        float hx = hAt(p + vec2(1.0, 0.0)) - h;
        float hz = hAt(p + vec2(0.0, 1.0)) - h;
        float slope = length(vec2(hx, hz));
        vec4 s = splatAt(p);
        float dist = length(p - uCam.xz);
        float keep = (1.0 - smoothstep(0.35, 0.6, slope)) * (1.0 - smoothstep(0.2, 0.5, s.r)) * (1.0 - smoothstep(0.1, 0.4, s.b)) * step(${(WATER + 0.3).toFixed(2)}, h);
        keep *= 1.0 - smoothstep(uRadius * 0.7, uRadius, dist);
        float tall = (0.34 + aOff.w * 0.42) * keep * (1.0 - s.a * 0.4) * smoothstep(1.2, 3.5, length(vec3(p.x, h, p.y) - uCam));
        vFlower = step(0.93 - s.g * 0.12, fract(aOff.w * 13.1)) * keep;
        vSeed = aOff.w;
        vec3 v = position;
        vT = v.y;
        v.y *= tall * (vFlower > 0.5 ? 1.1 : 1.0);
        v.x *= (vFlower > 0.5 ? 2.2 : 1.0);
        float ca = cos(aOff.z), sa = sin(aOff.z);
        v = vec3(v.x * ca, v.y, v.x * sa);
        // Wind: gusts rolling across the field.
        float gust = fbm(p * 0.05 + vec2(uTime * 0.25, uTime * 0.12));
        vec2 wind = vec2(0.6, 0.35) * (0.2 + gust * 0.9) + sin(uTime * 3.0 + p.x * 0.4 + aOff.w * 6.0) * 0.06;
        // Pushed aside by the player.
        vec2 away = p - uPlayer.xz;
        float pd = length(away);
        vec2 push = pd < 1.4 && abs(uPlayer.y - h) < 2.0 ? normalize(away + 1e-4) * (1.4 - pd) * 0.9 : vec2(0.0);
        vec2 bend = (wind + push) * vT * vT * tall;
        v.xz += bend;
        v.y -= dot(bend, bend) * 0.4;
        vec3 wpos = vec3(p.x, h, p.y) + v;
        vRoot = grassColour(p);
        vRoot = mix(vRoot, vec3(0.62, 0.56, 0.24), s.a * 0.5);
        vec4 mvPosition = viewMatrix * vec4(wpos, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      varying float vT; varying vec3 vRoot; varying float vFlower; varying float vSeed;
      void main() {
        vec3 tip = mix(vRoot * 1.12, vec3(0.72, 0.78, 0.36), 0.3);
        vec3 c = mix(vRoot * 0.74, tip, smoothstep(0.0, 1.0, vT));
        c = mix(vec3(dot(c, vec3(0.3, 0.59, 0.11))), c, 0.85);
        if (vFlower > 0.5 && vT > 0.7) {
          float k = fract(vSeed * 7.3);
          c = k < 0.33 ? vec3(1.0, 0.95, 0.85) : k < 0.66 ? vec3(1.0, 0.7, 0.8) : vec3(1.0, 0.86, 0.35);
        }
        gl_FragColor = vec4(c * c * 1.08, 1.0);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  return mesh;
}

// ------------------------------------------------------------------ trees

function blobCanopy(parts: [number, number, number, number][], seed: number, squash = 0.8): THREE.BufferGeometry {
  const R = rng(seed);
  const geos: THREE.BufferGeometry[] = [];
  for (const [x, y, z, r] of parts) {
    const s = new THREE.SphereGeometry(r, 14, 10);
    const p = s.attributes.position as THREE.BufferAttribute;
    const ph = R() * 10;
    for (let i = 0; i < p.count; i++) {
      const vx = p.getX(i);
      const vy = p.getY(i);
      const vz = p.getZ(i);
      const w = 1 + 0.14 * Math.sin(vx * 5 + ph) * Math.cos(vz * 5 - ph) + 0.08 * Math.sin(vy * 9 + ph);
      p.setXYZ(i, x + vx * w, y + vy * w * squash, z + vz * w);
    }
    s.computeVertexNormals();
    // Darker underneath, lighter on top (vertex colours).
    const col: number[] = [];
    for (let i = 0; i < p.count; i++) {
      const k = 0.72 + 0.28 * Math.max(0, Math.min(1, (p.getY(i) - (y - r)) / (2 * r)));
      col.push(k, k, k);
    }
    s.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    geos.push(s);
  }
  return mergeIndexed(geos);
}

function mergeIndexed(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  let base = 0;
  for (const g of gs) {
    const p = g.attributes.position;
    const n = g.attributes.normal;
    const c = g.attributes.color;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      col.push(c ? c.getX(i) : 1, c ? c.getY(i) : 1, c ? c.getZ(i) : 1);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + base);
    else for (let i = 0; i < p.count; i++) idx.push(i + base);
    base += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  out.setIndex(idx);
  return out;
}

function trunk(h: number, r: number, bend = 0.3, seed = 1): THREE.BufferGeometry {
  const R = rng(seed);
  const pts: THREE.Vector3[] = [];
  const bx = (R() - 0.5) * bend;
  const bz = (R() - 0.5) * bend;
  for (let k = 0; k <= 5; k++) {
    const t = k / 5;
    pts.push(new THREE.Vector3(Math.sin(t * 2.2) * bx * h * 0.3, t * h, Math.sin(t * 1.7) * bz * h * 0.3));
  }
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, r, 8, false);
  // Taper.
  const p = g.attributes.position as THREE.BufferAttribute;
  const c: number[] = [];
  for (let i = 0; i < p.count; i++) c.push(1, 1, 1);
  g.setAttribute("color", new THREE.Float32BufferAttribute(c, 3));
  return g;
}

interface TreeKind {
  name: string;
  parts: { geo: THREE.BufferGeometry; mat: THREE.MeshToonMaterial; tint?: [number, number] }[];
}

function kinds(): Record<string, TreeKind> {
  const bark = toon(0x6a4a3a, { soft: 0.5 });
  const darkBark = toon(0x4a3a30, { soft: 0.5 });
  const leaf = (c: number) => {
    const m = toon(c, { soft: 0.55, rim: 0.25 });
    m.vertexColors = true;
    return m;
  };
  return {
    peach: {
      name: "peach",
      parts: [
        { geo: trunk(3.2, 0.22, 1.2, 3), mat: bark },
        { geo: blobCanopy([[0, 3.6, 0, 1.9], [1.3, 3.2, 0.4, 1.3], [-1.2, 3.4, -0.3, 1.4], [0.2, 4.4, -0.8, 1.2], [-0.4, 3.0, 1.1, 1.1]], 7), mat: leaf(0xffa8c8), tint: [0.95, 0.02] },
      ],
    },
    pine: {
      name: "pine",
      parts: [
        { geo: trunk(9, 0.3, 1.6, 5), mat: darkBark },
        { geo: blobCanopy([[0.8, 8.8, 0.2, 2.2], [-1.6, 7.2, 0.6, 1.8], [1.4, 6.0, -0.8, 1.6], [-0.2, 9.8, -0.4, 1.5]], 11, 0.38), mat: leaf(0x2e6a48), tint: [0.4, 0.04] },
      ],
    },
    broad: {
      name: "broad",
      parts: [
        { geo: trunk(5, 0.32, 0.6, 9), mat: bark },
        { geo: blobCanopy([[0, 6.2, 0, 3.0], [1.9, 5.4, 0.6, 2.2], [-1.8, 5.6, -0.4, 2.3], [0.3, 7.6, -0.6, 2.0], [-0.6, 5.2, 1.8, 1.9]], 13), mat: leaf(0x58a038), tint: [0.28, 0.06] },
      ],
    },
    willow: {
      name: "willow",
      parts: [
        { geo: trunk(5, 0.35, 1.2, 15), mat: darkBark },
        {
          geo: (() => {
            const gs: THREE.BufferGeometry[] = [blobCanopy([[0, 6.4, 0, 2.4]], 17, 0.7)];
            for (let k = 0; k < 16; k++) {
              const a = (k / 16) * Math.PI * 2;
              const s = new THREE.CylinderGeometry(0.28, 0.06, 4.2, 5, 3, true).translate(0, -2.1, 0);
              s.translate(Math.cos(a) * 2.2, 6.6, Math.sin(a) * 2.2);
              s.computeVertexNormals();
              const col: number[] = [];
              for (let i = 0; i < s.attributes.position.count; i++) col.push(0.95, 0.95, 0.95);
              s.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
              gs.push(s);
            }
            return mergeIndexed(gs);
          })(),
          mat: (() => {
            const m = leaf(0x8ac850);
            m.side = THREE.DoubleSide;
            return m;
          })(),
          tint: [0.25, 0.03],
        },
      ],
    },
    bamboo: {
      name: "bamboo",
      parts: [
        {
          geo: (() => {
            const gs: THREE.BufferGeometry[] = [];
            const R = rng(21);
            for (let k = 0; k < 7; k++) {
              const x = (R() - 0.5) * 2.2;
              const z = (R() - 0.5) * 2.2;
              const h = 7 + R() * 5;
              const s = new THREE.CylinderGeometry(0.07, 0.09, h, 7, 6).translate(x, h / 2, z);
              s.rotateZ((R() - 0.5) * 0.12);
              const col: number[] = [];
              const p = s.attributes.position;
              // Nodes: darker rings.
              for (let i = 0; i < p.count; i++) {
                const y = p.getY(i);
                const n = Math.abs(((y / (h / 6)) % 1) - 0.5) < 0.04 ? 0.7 : 1;
                col.push(n, n, n);
              }
              s.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
              gs.push(s);
            }
            return mergeIndexed(gs);
          })(),
          mat: (() => {
            const m = toon(0x7ab04a, { soft: 0.5 });
            m.vertexColors = true;
            return m;
          })(),
        },
        { geo: blobCanopy([[0, 9.5, 0, 2.2], [1.2, 8.2, 0.8, 1.5], [-1.1, 8.6, -0.9, 1.6], [0.4, 11, -0.2, 1.3]], 23, 0.6), mat: leaf(0x6aa84a), tint: [0.28, 0.04] },
      ],
    },
  };
}

export class Forest {
  readonly group = new THREE.Group();
  /** Tree positions (for collision): x, z, radius. */
  readonly trunks: [number, number, number][] = [];

  constructor(t: Terrain) {
    const K = kinds();
    const R = rng(606);
    const spots: Record<string, [number, number, number, number][]> = { peach: [], pine: [], broad: [], willow: [], bamboo: [] };
    const avoid = [VILLAGE, ...CAMPS, ...BEACONS];
    const clear = (x: number, z: number, pad = 6) => avoid.every((p) => Math.hypot(p.x - x, p.z - z) > p.r + pad) && t.sample(x, z, 0) < 0.1 && t.height(x, z) > WATER + 0.8;
    const put = (kind: string, x: number, z: number, s: number) => {
      spots[kind].push([x, t.height(x, z), z, s]);
      this.trunks.push([x, z, kind === "bamboo" ? 1.2 : 0.5 * s]);
    };
    // The peach garden, and blossom round the village.
    for (let k = 0; k < 70; k++) {
      const a = R() * Math.PI * 2;
      const r = Math.sqrt(R()) * PEACH.r;
      const x = PEACH.x + Math.cos(a) * r;
      const z = PEACH.z + Math.sin(a) * r;
      if (Math.hypot(x - PEACH.x, z - PEACH.z) < 12) continue; // the clearing where the oath was sworn
      if (spots.peach.some(([px, , pz]) => Math.hypot(px - x, pz - z) < 5.5)) continue;
      put("peach", x, z, 0.85 + R() * 0.35);
    }
    for (let k = 0; k < 30; k++) {
      const a = R() * Math.PI * 2;
      const r = VILLAGE.r + 10 + R() * 60;
      const x = VILLAGE.x + Math.cos(a) * r;
      const z = VILLAGE.z + Math.sin(a) * r;
      if (clear(x, z)) put("peach", x, z, 0.8 + R() * 0.3);
    }
    // Willows and bamboo by the river and the lake.
    for (let k = 0; k < RIVER.length - 1; k++) {
      const [ax, az] = RIVER[k];
      const [bx, bz] = RIVER[k + 1];
      for (let s = 0; s < 8; s++) {
        const u = R();
        const side = R() < 0.5 ? -1 : 1;
        const L = Math.hypot(bx - ax, bz - az);
        const nx = -(bz - az) / L;
        const nz = (bx - ax) / L;
        const d = 26 + R() * 30;
        const x = ax + (bx - ax) * u + nx * d * side;
        const z = az + (bz - az) * u + nz * d * side;
        if (clear(x, z)) put(R() < 0.55 ? "willow" : "bamboo", x, z, 0.9 + R() * 0.3);
      }
    }
    for (let k = 0; k < 40; k++) {
      const a = R() * Math.PI * 2;
      const r = LAKE.r * 1.15 + R() * 60;
      const x = LAKE.x + Math.cos(a) * r;
      const z = LAKE.z + Math.sin(a) * r;
      if (clear(x, z)) put(R() < 0.5 ? "willow" : R() < 0.5 ? "bamboo" : "broad", x, z, 0.9 + R() * 0.3);
    }
    // Woods on the hills; scattered trees on the plain.
    for (let k = 0; k < 9000 && spots.broad.length + spots.pine.length < 2600; k++) {
      const x = (R() - 0.5) * (WORLD - 140);
      const z = (R() - 0.5) * (WORLD - 140);
      const h = t.height(x, z);
      const nrm = t.normal(x, z);
      if (nrm.y < 0.8 || !clear(x, z)) continue;
      const woods = Math.sin(x * 0.006 + 1) * Math.cos(z * 0.007 - 2) + (z < -250 ? 0.6 : 0) + (x < -250 ? 0.4 : 0);
      if (woods < 0.25 && R() > 0.03) continue;
      put(h > 60 || R() < 0.3 ? "pine" : "broad", x, z, 0.8 + R() * 0.6);
    }
    // Pines on the peak tops and ledges.
    for (const p of t.peaks) {
      for (let k = 0; k < 10; k++) {
        const a = R() * Math.PI * 2;
        const r = Math.sqrt(R()) * p.r * 0.7;
        const x = p.x + Math.cos(a) * r;
        const z = p.z + Math.sin(a) * r;
        if (t.normal(x, z).y > 0.75) put("pine", x, z, 0.7 + R() * 0.5);
      }
    }
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const col = new THREE.Color();
    for (const [name, list] of Object.entries(spots)) {
      if (!list.length) continue;
      for (const part of K[name].parts) {
        const im = new THREE.InstancedMesh(part.geo, part.mat, list.length);
        list.forEach(([x, y, z, s], i) => {
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (x * 13.1 + z * 7.7) % 6.28);
          m4.compose(new THREE.Vector3(x, y - 0.2, z), q, new THREE.Vector3(s, s * (0.9 + ((x * 3.3) % 0.2)), s));
          im.setMatrixAt(i, m4);
          const [hue, spread] = part.tint ?? [0, 0];
          col.setHSL(hue + (((x * 0.37 + z * 0.13) % 1) - 0.5) * spread, 1, 1).lerp(new THREE.Color(1, 1, 1), 0.85);
          im.setColorAt(i, col);
        });
        im.castShadow = true;
        im.receiveShadow = true;
        im.computeBoundingSphere();
        this.group.add(im);
      }
    }
    addOutlines(this.group, 0x1e2a1a, 0.0024);
  }
}

// ------------------------------------------------------------------ falling petals

export function petals(U: WorldU, center: THREE.Vector3, count = 900): THREE.Points {
  const g = new THREE.BufferGeometry();
  const p = new Float32Array(count * 3);
  const R = rng(3);
  for (let i = 0; i < count; i++) {
    p[i * 3] = center.x + (R() - 0.5) * 120;
    p[i * 3 + 1] = R() * 12;
    p[i * 3 + 2] = center.z + (R() - 0.5) * 120;
  }
  g.setAttribute("position", new THREE.BufferAttribute(p, 3));
  const m = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: U.uTime, uBase: { value: center.y } },
    vertexShader: /* glsl */ `
      uniform float uTime; uniform float uBase; varying float vA;
      void main() {
        vec3 p = position;
        float t = uTime * 0.6 + p.x * 0.13;
        p.y = uBase + mod(p.y - uTime * 0.7, 12.0);
        p.x += sin(t + p.z) * 2.0 + uTime * 0.4;
        p.z += cos(t * 0.7) * 1.5;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vA = smoothstep(0.0, 1.5, mod(position.y - uTime * 0.7, 12.0)) * smoothstep(80.0, 20.0, -mv.z);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = 90.0 / -mv.z;
      }`,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        d.x *= 1.6;
        if (length(d) > 0.45) discard;
        gl_FragColor = vec4(1.0, 0.72, 0.84, vA);
      }`,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  return pts;
}

export { HALF };
