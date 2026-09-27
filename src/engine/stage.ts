/**
 * Renderer, sky and light. The sky is painted rather than simulated: a deep blue zenith
 * fading to a pale warm horizon, a soft sun with a halo, and drifting cumulus drawn from fbm
 * with lit tops and violet bellies. Fog is the horizon colour, so the far peaks go pale blue
 * like ink wash. A sun with a shadow box that follows the player, a sky/ground hemisphere
 * fill, then a post chain: MSAA, a gentle bloom, a grade (saturation, warm highlights).
 */
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

export const NOISE_GLSL = /* glsl */ `
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += vnoise(p) * a; p = p * 2.03 + 17.1; a *= 0.5; } return s; }`;

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 4000);
  readonly sun = new THREE.DirectionalLight(0xfff0dc, 2.4);
  readonly hemi = new THREE.HemisphereLight(0xc4d8ff, 0x8a8a6a, 0.55);
  readonly sunDir = new THREE.Vector3(0.55, 0.62, 0.35).normalize();
  readonly horizon = new THREE.Color(0xcfe2f0);
  readonly time = { value: 0 };
  private readonly composer: EffectComposer;
  readonly sky: THREE.Mesh;
  readonly bloom: UnrealBloomPass;

  constructor(canvas: HTMLCanvasElement) {
    const r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.0;
    this.renderer = r;
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.05;
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -60;
    sc.right = sc.top = 60;
    sc.near = 1;
    sc.far = 400;
    this.scene.add(this.sun, this.sun.target, this.hemi);
    this.scene.fog = new THREE.FogExp2(this.horizon, 0.0016);
    this.sky = this.makeSky();
    this.scene.add(this.sky);
    const size = new THREE.Vector2(window.innerWidth, window.innerHeight);
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(r, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(size, 0.28, 0.5, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new ShaderPass(GRADE));
    this.composer.addPass(new OutputPass());
    window.addEventListener("resize", () => this.resize());
    const asked = new URLSearchParams(location.search).get("q");
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("cm.quality");
    } catch {}
    const pick = asked ?? saved;
    this.autoQuality = !asked;
    this.setQuality(pick !== null && QUALITY[+pick] ? +pick : QUALITY.length - 1);
  }

  /** Current preset index into QUALITY (0 lowest). */
  quality = 0;
  private autoQuality = true;
  private frames = 0;
  private slow = 0;

  setQuality(q: number, manual = false): void {
    if (manual) this.autoQuality = false;
    const Q = QUALITY[q];
    this.quality = q;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, Q.dpr));
    if (this.sun.shadow.mapSize.x !== Q.shadow) {
      this.sun.shadow.mapSize.set(Q.shadow, Q.shadow);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    for (const t of [this.composer.renderTarget1, this.composer.renderTarget2]) {
      if (t.samples !== Q.msaa) {
        t.samples = Q.msaa;
        t.dispose();
      }
    }
    this.bloom.enabled = Q.bloom;
    this.resize();
    try {
      localStorage.setItem("cm.quality", String(q));
    } catch {}
  }

  private makeSky(): THREE.Mesh {
    const g = new THREE.SphereGeometry(3000, 48, 24);
    const m = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { uSun: { value: this.sunDir }, uTime: this.time, uHorizon: { value: this.horizon } },
      vertexShader: /* glsl */ `varying vec3 vDir; void main() { vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSun; uniform float uTime; uniform vec3 uHorizon; varying vec3 vDir;
        ${NOISE_GLSL}
        void main() {
          vec3 d = normalize(vDir);
          float h = clamp(d.y, -0.2, 1.0);
          vec3 zen = vec3(0.09, 0.27, 0.72);
          vec3 mid = vec3(0.28, 0.55, 0.92);
          vec3 c = mix(uHorizon, mid, smoothstep(0.0, 0.25, h));
          c = mix(c, zen, smoothstep(0.25, 0.9, h));
          // Sun and halo.
          float s = max(dot(d, uSun), 0.0);
          c += vec3(1.0, 0.85, 0.6) * pow(s, 8.0) * 0.35 + vec3(1.0, 0.95, 0.85) * smoothstep(0.9975, 0.999, s) * 6.0;
          // Clouds on a flat layer above.
          if (d.y > 0.02) {
            vec2 uv = d.xz / (d.y + 0.12) * 1.6 + vec2(uTime * 0.004, uTime * 0.002);
            float n = fbm(uv * 0.9);
            float cov = smoothstep(0.52, 0.7, n);
            float top = smoothstep(0.52, 0.85, fbm(uv * 0.9 + uSun.xz * 0.06));
            vec3 cloud = mix(vec3(0.72, 0.72, 0.9), vec3(1.0, 0.98, 0.95), top);
            cloud += vec3(1.0, 0.8, 0.6) * pow(s, 4.0) * 0.25;
            c = mix(c, cloud, cov * smoothstep(0.02, 0.2, d.y) * 0.95);
          }
          // Below the horizon: the fog colour.
          c = mix(uHorizon * 0.95, c, smoothstep(-0.05, 0.02, d.y));
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    mesh.renderOrder = -10;
    return mesh;
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Keep the sun's shadow box centred on (x, y, z), snapped to texels so it doesn't shimmer. */
  follow(p: THREE.Vector3): void {
    const texel = 120 / 4096;
    const x = Math.round(p.x / texel) * texel;
    const z = Math.round(p.z / texel) * texel;
    this.sun.target.position.set(x, p.y, z);
    this.sun.position.set(x, p.y, z).addScaledVector(this.sunDir, 200);
    this.sky.position.copy(this.camera.position);
  }

  render(dt: number): void {
    this.time.value += dt;
    // Step the preset down while frames run long (under ~40 fps for two seconds straight).
    if (this.autoQuality && this.quality > 0 && dt > 0 && dt < 0.5) {
      this.frames++;
      if (dt > 1 / 40) this.slow++;
      if (this.frames >= 120) {
        if (this.slow > 90) this.setQuality(this.quality - 1);
        this.frames = this.slow = 0;
      }
    }
    this.composer.render();
  }
}

/** Render presets, lowest first. */
export const QUALITY = [
  { name: "낮음", dpr: 0.75, shadow: 1024, msaa: 0, bloom: false },
  { name: "보통", dpr: 1, shadow: 2048, msaa: 4, bloom: true },
  { name: "높음", dpr: 1.5, shadow: 4096, msaa: 4, bloom: true },
];

const GRADE = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      // Never let a negative or NaN pixel through (it would smear across the bloom).
      vec3 x = clamp(c.rgb, 0.0, 64.0);
      if (any(isnan(x))) x = vec3(0.0);
      float l = dot(x, vec3(0.299, 0.587, 0.114));
      x = mix(vec3(l), x, 1.12);
      x *= mix(vec3(0.97, 0.98, 1.04), vec3(1.03, 1.0, 0.96), smoothstep(0.2, 0.9, l));
      vec2 d = vUv - 0.5;
      x *= 1.0 - dot(d, d) * 0.35;
      gl_FragColor = vec4(x, 1.0);
    }`,
};
