/**
 * Baked characters: one seamless skinned mesh per hero (sculpted as signed distances and
 * meshed offline, see src/sdf), on a skeleton the procedural animator drives. The mesh is
 * bound in its A-pose; at rest the arms hang. One material does it all: a palette looked up
 * by the vertex's material id, the painted face (with blinking) where the head has UVs, a
 * sheen band on the hair, stepped highlights on metal and lacquer, the cel ramp and violet
 * shade from the toon base, and an ink outline shell that skins with the body.
 */
import * as THREE from "three";
import { M, type Garment } from "../sdf/hero";
import { addOutlines, SHADE_TINT, toon } from "../engine/toon";
import { makeFace } from "./face";
import type { Chain, Joint, Look, Rig } from "./model";
import { buildHero, JOINTS } from "./model";
import { buildWeapon, WEAPON_CLASS } from "./weapon";

interface ModelData {
  bones: { name: string; parent: number; at: [number, number, number] }[];
  apose: number;
  head: [number, number, number];
  geo: THREE.BufferGeometry;
  garment?: Garment;
}

const cache = new Map<string, ModelData>();
const pending = new Map<string, Promise<ModelData | null>>();

export function hasModel(id: string): boolean {
  return cache.has(id);
}

export function loadModel(id: string): Promise<ModelData | null> {
  const c = cache.get(id);
  if (c) return Promise.resolve(c);
  let p = pending.get(id);
  if (p) return p;
  const base = import.meta.env.BASE_URL + "models/";
  p = Promise.all([fetch(`${base}${id}.json`).then((r) => (r.ok ? r.json() : null)), fetch(`${base}${id}.bin`).then((r) => (r.ok ? r.arrayBuffer() : null))])
    .then(([meta, bin]) => {
      if (!meta || !bin) return null;
      const nv = meta.verts as number;
      const nt = meta.tris as number;
      let o = 0;
      const q = new Uint16Array(bin, o, nv * 4);
      const pos = new Float32Array(nv * 3);
      const lo = meta.lo as number[];
      const hi = meta.hi as number[];
      for (let i = 0; i < nv; i++) for (let a = 0; a < 3; a++) pos[i * 3 + a] = lo[a] + (q[i * 4 + a] / 65535) * (hi[a] - lo[a]);
      o += nv * 8;
      const nm = new Int8Array(bin, o, nv * 4);
      const nmU = new Uint8Array(bin, o, nv * 4);
      o += nv * 4;
      const uv = new Uint16Array(bin, o, nv * 2);
      o += nv * 4;
      const si = new Uint8Array(bin, o, nv * 4);
      o += nv * 4;
      const sw = new Uint8Array(bin, o, nv * 4);
      o += nv * 4;
      const idx = meta.i32 ? new Uint32Array(bin, o, nt * 3) : new Uint16Array(bin, o, nt * 3);
      const nor = new Int8Array(nv * 3);
      const mat = new Float32Array(nv);
      for (let i = 0; i < nv; i++) {
        nor[i * 3] = nm[i * 4];
        nor[i * 3 + 1] = nm[i * 4 + 1];
        nor[i * 3 + 2] = nm[i * 4 + 2];
        mat[i] = nmU[i * 4 + 3];
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("normal", new THREE.BufferAttribute(nor, 3, true));
      g.setAttribute("uv", new THREE.BufferAttribute(uv, 2, true));
      g.setAttribute("skinIndex", new THREE.BufferAttribute(si, 4));
      g.setAttribute("skinWeight", new THREE.BufferAttribute(sw, 4, true));
      g.setAttribute("aMat", new THREE.BufferAttribute(mat, 1));
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      g.computeBoundingSphere();
      const d: ModelData = { bones: meta.bones, apose: meta.apose, head: meta.head, geo: g, garment: meta.garment };
      cache.set(id, d);
      return d;
    })
    .catch(() => null);
  pending.set(id, p);
  return p;
}

export function palette(L: Look): THREE.Color[] {
  const c = (h: number) => new THREE.Color(h);
  const out: THREE.Color[] = [];
  out[M.skin] = c(L.skin);
  // Near-black hair reads as a hole under cel shading: lift it toward a cool violet.
  const hc = c(L.hair);
  const lum = hc.r * 0.3 + hc.g * 0.59 + hc.b * 0.11;
  out[M.hair] = lum < 0.05 ? hc.lerp(new THREE.Color(0x2a2438), 1 - lum / 0.05) : hc;
  out[M.robe] = c(L.robe);
  out[M.robe2] = c(L.robe2);
  out[M.trim] = c(L.trim);
  out[M.pants] = c(L.pants);
  out[M.boots] = c(L.boots);
  out[M.sash] = c(L.sash);
  out[M.armor] = c(L.armor ?? L.robe);
  out[M.armorTrim] = c(L.armorTrim ?? L.trim);
  out[M.cape] = c(L.cape ?? L.robe);
  out[M.gear] = c(L.gearColor ?? 0xc8a040);
  out[M.dark] = c(0x1a1a22);
  out[M.metal] = c(L.gearColor ?? 0xdfe6ee);
  out[M.plume] = c(0xb86a2a);
  out[M.lip] = c(0xe0405a);
  out[M.drape] = c(L.robe);
  return out;
}

/**
 * Garment detail drawn per pixel from the bind-pose position: the crossed collar and its
 * band, the under-robe V, the sash, hems and cuffs on the robe; lamellar rows on armour;
 * a hem band on the cape. Edges are anti-aliased with screen derivatives.
 */
const GARMENT_GLSL = /* glsl */ `
float aa(float edge, float x) { float w = fwidth(x) * 0.75 + 1e-5; return smoothstep(edge - w, edge + w, x); }
vec3 garment(int mi, vec3 c) {
  vec3 p = vRest;
  float hy = uG0.x, yN = uG0.y, yV = uG0.z, hem = uG0.w;
  vec3 trim = uPal[4], inner = uPal[3], sash = uPal[7];
  if (mi == 2) {
    // Crossed collar: the wearer's right lapel over the left, meeting low at yV.
    float t = clamp((p.y - yV) / (yN - yV), 0.0, 1.0);
    float front = aa(0.0, p.z);
    float cx = p.x + 0.012 * (1.0 - t);
    float w = mix(0.0, 0.07, pow(t, 0.8));
    float inV = (1.0 - aa(w, abs(cx))) * aa(yV, p.y) * front;
    float band = (1.0 - aa(w + 0.022, abs(cx))) * aa(yV - 0.02, p.y) * front * (1.0 - inV);
    // Collar band carries on round the back of the neck.
    float ring = aa(yN - 0.035, p.y) * (1.0 - front * aa(0.0, abs(cx) - w));
    c = mix(c, inner, inV);
    c = mix(c, trim, max(band, ring * aa(yN - 0.035, p.y)));
    // Sash.
    float s = aa(uG1.x, p.y) * (1.0 - aa(uG1.y, p.y));
    float se = s * (1.0 - aa(uG1.x + 0.012, p.y) * (1.0 - aa(uG1.y - 0.012, p.y)));
    c = mix(c, sash, s);
    c = mix(c, trim, se * 0.7);
    // Hem.
    if (hem > -5.0) c = mix(c, trim, 1.0 - aa(hem + 0.04, p.y));
    // Cuffs.
    for (int i = 0; i < 2; i++) {
      vec3 q = p - uCufE[i];
      float a = dot(q, uCufD[i].xyz);
      float r = length(q - uCufD[i].xyz * a);
      if (uCufD[i].w < 50.0 && r < 0.15 && a > -0.05) c = mix(c, trim, aa(uCufD[i].w - 0.04, a));
    }
  } else if (mi == 16) {
    c = mix(c, trim, 1.0 - aa(uG2.w + 0.045, p.y));
  } else if (mi == 8) {
    // Lamellar: staggered rows of small plates with dark lacing between.
    float ang = atan(p.x, p.z) * 0.17;
    float ry = (p.y - hy) / 0.03;
    float row = floor(ry);
    float fy = fract(ry);
    float fx = fract(ang / 0.024 + row * 0.5);
    float gap = max(1.0 - aa(0.08, fy), 1.0 - aa(0.07, min(fx, 1.0 - fx)));
    c *= mix(1.0, 0.82, smoothstep(0.3, 1.0, fy));
    c = mix(c, uPal[12] * 1.2, gap * 0.75);
    if (uG2.x > -5.0) {
      float edge = aa(uG2.x - 0.022, p.y) + (1.0 - aa(uG2.y + 0.018, p.y)) * aa(hy - 0.02, p.y);
      c = mix(c, uPal[9], clamp(edge, 0.0, 1.0));
    }
    if (uG1.w > -5.0) c = mix(c, uPal[9], 1.0 - aa(uG1.w + 0.025, p.y));
  } else if (mi == 10) {
    if (uG1.z > -5.0) c = mix(c, trim, 1.0 - aa(uG1.z + 0.045 + p.x * p.x * 0.35, p.y));
  }
  return c;
}
`;

function characterMaterial(L: Look, face: THREE.Texture, G?: Garment): { mat: THREE.MeshToonMaterial; faceU: { value: THREE.Texture } } {
  const m = toon(0xffffff, { rim: 0.35, soft: 0.2 });
  const faceU = { value: face };
  const pal = palette(L);
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev(sh, r);
    sh.uniforms.uPal = { value: pal };
    sh.uniforms.uFace = faceU;
    sh.uniforms.uShade2 = { value: SHADE_TINT };
    const g = G ?? { hy: 0, yN: 9, yV: 9, sash: [9, 9], hem: -9, capeHem: -9, armorTop: -9, armorBot: -9, tassetHem: -9, cuffs: [], drapeY: -9, armored: false, fem: false };
    sh.uniforms.uG0 = { value: new THREE.Vector4(g.hy, g.yN, g.yV, g.hem) };
    sh.uniforms.uG1 = { value: new THREE.Vector4(g.sash[0], g.sash[1], g.capeHem, g.tassetHem) };
    sh.uniforms.uG2 = { value: new THREE.Vector4(g.armorTop, g.armorBot, g.armored ? 1 : 0, g.drapeY ?? -9) };
    const cu = [0, 1].map((i) => g.cuffs[i] ?? { E: [0, -9, 0], dir: [0, -1, 0], reach: 99 });
    sh.uniforms.uCufE = { value: cu.map((c) => new THREE.Vector3(...c.E)) };
    sh.uniforms.uCufD = { value: cu.map((c) => new THREE.Vector4(c.dir[0], c.dir[1], c.dir[2], c.reach)) };
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aMat; varying float vMat; varying vec2 vFUv; varying vec3 vRest;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvMat = aMat; vFUv = uv; vRest = position;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uPal[17]; uniform sampler2D uFace; varying float vMat; varying vec2 vFUv; varying vec3 vRest;\nuniform vec4 uG0, uG1, uG2; uniform vec3 uCufE[2]; uniform vec4 uCufD[2];\n" + GARMENT_GLSL)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
{
  int mi = int(vMat + 0.5);
  vec3 c = uPal[0];
  for (int k = 0; k < 17; k++) if (k == mi) c = uPal[k];
  if (mi == 0 && vFUv.x > 0.0005) c = texture2D(uFace, vFUv).rgb;
  c = garment(mi, c);
  diffuseColor.rgb = c;
}`,
      )
      .replace(
        "#include <opaque_fragment>",
        `{
  int mi = int(vMat + 0.5);
  vec3 V = normalize(vViewPosition);
  // Hair: a bright sheen band that rides the top of the head (the "angel ring").
  if (mi == 1) {
    float band = smoothstep(0.28, 0.4, normal.y) * smoothstep(0.62, 0.48, normal.y);
    outgoingLight += diffuseColor.rgb * band * 0.9 + vec3(0.05) * band;
  }
  // Metal, lacquer, armour trim: hard stepped highlights.
  if (mi == 9 || mi == 13 || mi == 12) {
    #if NUM_DIR_LIGHTS > 0
      vec3 H = normalize(directionalLights[0].direction + V);
      float s = smoothstep(0.955, 0.965, dot(normal, H));
      outgoingLight += mix(diffuseColor.rgb, vec3(1.0, 0.97, 0.9), 0.5) * s * (mi == 12 ? 0.2 : mi == 8 ? 0.25 : 0.4);
    #endif
  }
}
#include <opaque_fragment>`,
      );
  };
  m.customProgramCacheKey = () => "character";
  return { mat: m, faceU };
}

/** Baked models are used unless the page is opened with ?old (the procedural fallback). */
export const USE_BAKED = typeof location === "undefined" || !new URLSearchParams(location.search).has("old");

/** Every baked id the game uses: heroes, the Yellow Turban kinds and their boss, the elder. */
export function preloadModels(ids: string[]): Promise<unknown> {
  return USE_BAKED ? Promise.all(ids.map(loadModel)) : Promise.resolve();
}

/** The baked rig when it's loaded, otherwise the procedural one. */
export function rigFor(id: string, L: Look): Rig {
  return (USE_BAKED && buildSkinned(id, L)) || buildHero(L);
}

/** Build a rig from a baked model (call loadModel first). */
export function buildSkinned(id: string, L: Look): Rig | null {
  const d = cache.get(id);
  if (!d) return null;
  const fem = !!L.female;
  const H = L.height ?? (fem ? 1.64 : 1.8);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const bones: THREE.Bone[] = d.bones.map((b) => {
    const bone = new THREE.Bone();
    bone.name = b.name;
    return bone;
  });
  d.bones.forEach((b, i) => {
    const p = b.parent >= 0 ? d.bones[b.parent].at : [0, 0, 0];
    bones[i].position.set(b.at[0] - p[0], b.at[1] - p[1], b.at[2] - p[2]);
    if (b.parent >= 0) bones[b.parent].add(bones[i]);
    else body.add(bones[i]);
  });
  const byName = (n: string) => bones[d.bones.findIndex((b) => b.name === n)];
  // Bind in the A-pose the mesh was sculpted in.
  byName("armL").rotation.z = d.apose;
  byName("armR").rotation.z = -d.apose;
  root.updateMatrixWorld(true);
  const face = makeFace({ skin: L.skin, iris: L.iris, brow: L.hair, female: fem, stern: L.stern ?? (fem ? 0 : 0.4), flush: L.flush });
  const { mat, faceU } = characterMaterial(L, face.open, d.garment);
  const skel = new THREE.Skeleton(bones);
  const mesh = new THREE.SkinnedMesh(d.geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  body.add(mesh);
  mesh.bind(skel);
  byName("armL").rotation.z = 0;
  byName("armR").rotation.z = 0;
  body.scale.setScalar(H / 1.8);
  // Ink outline, skinned with the body.
  const outline = new THREE.SkinnedMesh(d.geo, skinnedOutline());
  outline.frustumCulled = false;
  outline.userData.isOutline = true;
  body.add(outline);
  outline.bind(skel, mesh.bindMatrix);
  // Weapon in hand.
  const weapon = buildWeapon(L.weapon);
  const cls = WEAPON_CLASS[L.weapon.kind];
  byName(cls === "bow" ? "handL" : "handR").add(weapon);
  weapon.position.set(0, -0.06, 0.02);
  let weapon2: THREE.Group | null = null;
  if (L.weapon.kind === "twin") {
    weapon2 = buildWeapon(L.weapon);
    byName("handL").add(weapon2);
    weapon2.position.set(0, -0.06, 0.02);
  }
  addOutlines(weapon, 0x2a1820, 0.0032);
  if (weapon2) addOutlines(weapon2, 0x2a1820, 0.0032);
  const glowMats: THREE.MeshToonMaterial[] = [];
  weapon.traverse((o) => {
    const mm = (o as THREE.Mesh).material as THREE.MeshToonMaterial | undefined;
    if (mm && mm.emissive && mm.emissive.getHex() !== 0) glowMats.push(mm);
  });
  const j = {} as Record<Joint, THREE.Object3D>;
  for (const n of JOINTS) j[n] = byName(n);
  const rest = {} as Record<Joint, THREE.Euler>;
  for (const n of JOINTS) rest[n] = j[n].rotation.clone();
  const mk = (names: string[], stiff: number, rest0 = 0): Chain => ({ joints: names.map(byName), ax: names.map(() => 0), az: names.map(() => 0), vx: names.map(() => 0), vz: names.map(() => 0), stiff, rest: rest0 });
  const chains: Chain[] = [];
  if (L.hairStyle === "ponytail" || L.hairStyle === "long" || L.headgear === "helm" || L.headgear === "headband" || L.headgear === "scholar") chains.push(mk(["pony0", "pony1", "pony2", "pony3"], 36));
  if (L.hairStyle === "twin") {
    chains.push(mk(["twinL0", "twinL1", "twinL2"], 34));
    chains.push(mk(["twinR0", "twinR1", "twinR2"], 34));
  }
  if (L.cape) chains.push(mk(["cape0", "cape1", "cape2", "cape3"], 22));
  chains.push(mk(["sash0", "sash1", "sash2"], 28));
  const drapes = [byName("slvL"), byName("slvR")];
  drapes.forEach((dr, i) => (dr.userData.drape = i ? -1 : 1));
  // The face material swap for blinking goes through the uniform.
  const faceMat = mat;
  const rig: Rig = { root, body, j, rest, face, faceMat, weapon, weapon2, chains, skirt: null, cape: null, height: H, look: L, glowMats, drapes };
  rig.blink = (closed: boolean) => (faceU.value = closed ? face.closed : face.open);
  return rig;
}

function skinnedOutline(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    fog: true,
    uniforms: { uColor: { value: new THREE.Color(0x2a1820) }, uWidth: { value: 0.0032 }, ...THREE.UniformsLib.fog },
    vertexShader: /* glsl */ `
      #include <common>
      #include <skinning_pars_vertex>
      #include <fog_pars_vertex>
      uniform float uWidth;
      attribute float aMat;
      void main() {
        #include <beginnormal_vertex>
        #include <skinbase_vertex>
        #include <skinnormal_vertex>
        #include <begin_vertex>
        #include <skinning_vertex>
        vec4 mv = modelViewMatrix * vec4(transformed, 1.0);
        vec3 n = normalize(normalMatrix * objectNormal);
        // Thinner on the face and hands so features stay clean.
        float k = aMat < 0.5 ? 0.45 : 1.0;
        float w = uWidth * k * clamp(-mv.z, 1.5, 40.0);
        mv.xyz += n * w;
        gl_Position = projectionMatrix * mv;
        vec4 mvPosition = mv;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform vec3 uColor;
      void main() {
        gl_FragColor = vec4(uColor, 1.0);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}
