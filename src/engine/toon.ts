/**
 * The cel look. Every surface is lit in a few hard bands (a gradient ramp) with a warm tint
 * in the lit band and a cool violet in the shade, a thin rim of light on the silhouette facing
 * away from the sun, and an ink outline drawn as an inflated back-face shell whose thickness
 * stays roughly constant on screen. Everything is written in linear colour.
 */
import * as THREE from "three";

let ramp: THREE.DataTexture | null = null;
/** Three bands: deep shade, soft shade, lit. */
export function rampTexture(): THREE.DataTexture {
  if (ramp) return ramp;
  const d = new Uint8Array([160, 160, 160, 255, 205, 205, 205, 255, 255, 255, 255, 255, 255, 255, 255, 255]);
  ramp = new THREE.DataTexture(d, 4, 1, THREE.RGBAFormat);
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
  ramp.needsUpdate = true;
  return ramp;
}

export interface ToonOpts {
  map?: THREE.Texture | null;
  rim?: number;
  side?: THREE.Side;
  emissive?: number;
  /** Shading softness: 0 hard bands, 1 smooth. */
  soft?: number;
  transparent?: boolean;
  alphaTest?: number;
}

export const SHADE_TINT = new THREE.Color(0.62, 0.58, 0.9);

export function toon(color: THREE.ColorRepresentation, o: ToonOpts = {}): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({ color, gradientMap: rampTexture(), map: o.map ?? null, side: o.side ?? THREE.FrontSide, transparent: o.transparent ?? false, alphaTest: o.alphaTest ?? 0 });
  if (o.emissive) m.emissive = new THREE.Color(o.emissive);
  const rim = o.rim ?? 0.35;
  const soft = o.soft ?? 0;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = { value: rim };
    sh.uniforms.uShade = { value: SHADE_TINT };
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uRim; uniform vec3 uShade;")
      .replace(
        "#include <gradientmap_pars_fragment>",
        `uniform sampler2D gradientMap;
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
  float dotNL = dot( normal, lightDirection );
  vec2 coord = vec2( dotNL * 0.5 + 0.5, 0.0 );
  float g = ${soft > 0 ? `mix(texture2D( gradientMap, coord ).r, smoothstep(0.2, 0.8, coord.x), ${soft.toFixed(2)})` : "texture2D( gradientMap, coord ).r"};
  return vec3(g);
}`,
      )
      .replace(
        "#include <opaque_fragment>",
        `// Shade tint: whatever the light didn't reach leans violet, like painted shadow.
float lum = dot(outgoingLight, vec3(0.3, 0.59, 0.11));
float base = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)) + 1e-4;
float lit = clamp(lum / (base * 1.4), 0.0, 1.0);
outgoingLight = mix(outgoingLight * uShade * 1.35 + diffuseColor.rgb * 0.06, outgoingLight, smoothstep(0.5, 0.85, lit));
// Rim light on the silhouette.
float fr = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 3.0);
outgoingLight += diffuseColor.rgb * uRim * smoothstep(0.55, 0.8, fr) * 1.4;
#include <opaque_fragment>`,
      );
  };
  m.customProgramCacheKey = () => `toon-${rim}-${soft}`;
  return m;
}

/** Ink outline: a back-face shell pushed out along the normals, scaled with distance. */
const outlineMats = new Map<string, THREE.ShaderMaterial>();
export function outlineMaterial(color = 0x2a1a22, width = 0.0035): THREE.ShaderMaterial {
  const k = `${color}|${width}`;
  let m = outlineMats.get(k);
  if (m) return m;
  const c = new THREE.Color(color);
  m = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { uColor: { value: c }, uWidth: { value: width }, ...THREE.UniformsLib.fog },
    fog: true,
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      uniform float uWidth;
      void main() {
        #include <beginnormal_vertex>
        #include <begin_vertex>
        #ifdef USE_INSTANCING
          transformed = (instanceMatrix * vec4(transformed, 1.0)).xyz;
          objectNormal = mat3(instanceMatrix) * objectNormal;
        #endif
        vec4 mv = modelViewMatrix * vec4(transformed, 1.0);
        vec3 n = normalize(normalMatrix * objectNormal);
        // Constant-ish screen width, but thin up close and not huge far away.
        float w = uWidth * clamp(-mv.z, 1.5, 40.0);
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
  outlineMats.set(k, m);
  return m;
}

/** Give every mesh under `root` an outline shell (skip ones flagged noOutline). */
export function addOutlines(root: THREE.Object3D, color?: number, width?: number): void {
  const list: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !m.userData.noOutline && !m.userData.isOutline) list.push(m);
  });
  for (const m of list) {
    const inst = (m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh) : null;
    const mat = outlineMaterial(m.userData.outlineColor ?? color, m.userData.outlineWidth ?? width);
    const o = inst ? new THREE.InstancedMesh(m.geometry, mat, inst.count) : new THREE.Mesh(m.geometry, mat);
    if (inst) {
      (o as THREE.InstancedMesh).instanceMatrix = inst.instanceMatrix;
      (o as THREE.InstancedMesh).count = inst.count;
    }
    o.userData.isOutline = true;
    o.castShadow = false;
    o.receiveShadow = false;
    o.frustumCulled = m.frustumCulled;
    m.add(o);
  }
}

/** sRGB hex → linear THREE.Color (for shader constants). */
export function lin(hex: number): THREE.Color {
  return new THREE.Color(hex);
}
