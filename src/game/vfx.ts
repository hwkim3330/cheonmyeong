/**
 * Effects: bright additive shapes that live for a moment — the arc of a slash in the hero's
 * element colour, sparks where a blow lands, rings and pillars for blasts, formations and
 * tornadoes for fields, arrows, orbs and crescent blades in flight, a rain of burning arrows,
 * red telegraph circles for enemy attacks, and a burst of petals when heroes swap.
 */
import * as THREE from "three";

interface Fx {
  obj: THREE.Object3D;
  t: number;
  life: number;
  update?: (k: number, dt: number) => void;
}

const additive = (color: number, opacity = 1) =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

export class Vfx {
  readonly group = new THREE.Group();
  private list: Fx[] = [];
  private readonly sparkGeo = new THREE.OctahedronGeometry(0.12, 0);
  private readonly ringGeo = new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2);
  private readonly discGeo = new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2);

  add(obj: THREE.Object3D, life: number, update?: Fx["update"]): void {
    this.group.add(obj);
    this.list.push({ obj, t: 0, life, update });
  }

  update(dt: number): void {
    for (const f of this.list) {
      f.t += dt;
      f.update?.(Math.min(1, f.t / f.life), dt);
    }
    const dead = this.list.filter((f) => f.t >= f.life);
    for (const f of dead) {
      this.group.remove(f.obj);
      f.obj.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry && m.geometry !== this.sparkGeo && m.geometry !== this.ringGeo && m.geometry !== this.discGeo) m.geometry.dispose();
        const mat = m.material as THREE.Material | undefined;
        mat?.dispose?.();
      });
    }
    this.list = this.list.filter((f) => f.t < f.life);
  }

  /** A crescent sweep round `at`, facing `yaw`, of `arc` radians and radius `r`. */
  slash(at: THREE.Vector3, yaw: number, r: number, arc: number, color: number, tilt = 0, width = 0.9): void {
    const seg = 40;
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= seg; i++) {
      const u = i / seg;
      const a = -arc / 2 + u * arc;
      const w = width * Math.sin(u * Math.PI);
      for (const [rr, v] of [
        [r, 1],
        [r - w, 0],
      ] as [number, number][]) {
        pos.push(Math.sin(a) * rr, 0, Math.cos(a) * rr);
        uv.push(u, v);
      }
    }
    for (let i = 0; i < seg; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    const m = new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color(color) }, uK: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 uColor; uniform float uK; varying vec2 vUv;
        void main() {
          // The sweep reveals from one end and fades from the other.
          float head = smoothstep(uK * 1.6 - 0.1, uK * 1.6, vUv.x);
          float tail = smoothstep(uK * 1.6 - 0.9, uK * 1.6 - 0.2, vUv.x);
          float y = clamp(vUv.y, 0.0, 1.0);
          float a = clamp((1.0 - head) * tail * pow(y, 1.5), 0.0, 1.0);
          vec3 c = mix(uColor, vec3(1.0), pow(y, 6.0) * 0.8);
          gl_FragColor = vec4(c * 2.0, a);
        }`,
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.position.copy(at);
    mesh.rotation.set(tilt, yaw, 0, "YXZ");
    this.add(mesh, 0.32, (k) => (m.uniforms.uK.value = k));
  }

  sparks(at: THREE.Vector3, color: number, n = 10, speed = 6): void {
    const g = new THREE.Group();
    g.position.copy(at);
    const vel: THREE.Vector3[] = [];
    const mat = additive(color);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.sparkGeo, mat);
      m.scale.set(0.5, 0.5, 2.5);
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.5 + Math.random()));
      m.lookAt(v);
      g.add(m);
      vel.push(v);
    }
    // A flash disc.
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), additive(0xffffff, 0.9));
    g.add(flash);
    this.add(g, 0.35, (k, dt) => {
      g.children.forEach((c, i) => {
        if (i < vel.length) {
          c.position.addScaledVector(vel[i], dt);
          vel[i].y -= 12 * dt;
        }
      });
      mat.opacity = 1 - k;
      flash.scale.setScalar(1 + k * 2);
      (flash.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 * (1 - k * 2));
    });
  }

  ring(at: THREE.Vector3, r: number, color: number, life = 0.5, width = 1): void {
    const m = additive(color, 0.9);
    const mesh = new THREE.Mesh(this.ringGeo, m);
    mesh.position.copy(at).add(new THREE.Vector3(0, 0.2, 0));
    this.add(mesh, life, (k) => {
      mesh.scale.set(r * (0.3 + k * 0.8), 1, r * (0.3 + k * 0.8));
      m.opacity = 0.9 * (1 - k);
      mesh.scale.y = width;
    });
  }

  pillar(at: THREE.Vector3, r: number, color: number, h = 12): void {
    const m = additive(color, 0.8);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.2, h, 24, 1, true).translate(0, h / 2, 0), m);
    mesh.position.copy(at);
    this.add(mesh, 0.7, (k) => {
      mesh.scale.set(1 - k * 0.6, 1 + k * 0.3, 1 - k * 0.6);
      m.opacity = 0.8 * (1 - k);
    });
    this.ring(at, r * 2.4, color, 0.6);
    this.sparks(at.clone().add(new THREE.Vector3(0, 1, 0)), color, 18, 10);
  }

  burst(at: THREE.Vector3, r: number, color: number): void {
    const m = additive(color, 0.85);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), m);
    mesh.position.copy(at).add(new THREE.Vector3(0, 0.8, 0));
    this.add(mesh, 0.5, (k) => {
      mesh.scale.setScalar(r * (0.3 + k * 0.9));
      m.opacity = 0.85 * (1 - k) * (1 - k);
    });
    this.ring(at, r * 1.4, color, 0.6);
    this.sparks(mesh.position, color, 24, 12);
  }

  /** A red warning circle that fills before an enemy's blow lands. */
  telegraph(at: THREE.Vector3, r: number, life: number, color = 0xff3a2a): void {
    const g = new THREE.Group();
    g.position.copy(at).add(new THREE.Vector3(0, 0.15, 0));
    const rim = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }));
    rim.scale.set(r, 1, r);
    const fill = new THREE.Mesh(this.discGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false }));
    g.add(rim, fill);
    this.add(g, life, (k) => fill.scale.set(r * k, 1, r * k));
  }

  /** A field on the ground for `life` seconds (formation, tornado, fire, moon). */
  field(at: THREE.Vector3, r: number, life: number, color: number, kind: string): THREE.Object3D {
    const g = new THREE.Group();
    g.position.copy(at);
    const U = { uColor: { value: new THREE.Color(color) }, uT: { value: 0 }, uFade: { value: 1 } };
    const disc = new THREE.Mesh(
      this.discGeo,
      new THREE.ShaderMaterial({
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        uniforms: U,
        vertexShader: `varying vec2 vP; void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform vec3 uColor; uniform float uT; uniform float uFade; varying vec2 vP;
          void main() {
            float r = length(vP);
            float a = atan(vP.y, vP.x) + uT * 0.4;
            // Rings, eight spokes (팔괘), and a rim.
            float rings = smoothstep(0.03, 0.0, abs(fract(r * 3.0) - 0.5) - 0.44);
            float spokes = smoothstep(0.06, 0.0, abs(sin(a * 4.0))) * step(0.3, r);
            float rim = smoothstep(0.08, 0.0, abs(r - 0.96));
            float v = max(max(rings * 0.6, spokes * 0.5), rim) * smoothstep(1.0, 0.95, r);
            gl_FragColor = vec4(uColor * 1.6, v * uFade);
          }`,
      }),
    );
    disc.scale.set(r, 1, r);
    disc.position.y = 0.12;
    g.add(disc);
    if (kind === "tornado") {
      for (let k = 0; k < 3; k++) {
        const tw = new THREE.Mesh(new THREE.CylinderGeometry(r * (0.35 + k * 0.2), r * (0.12 + k * 0.08), 9 + k * 2, 24, 8, true).translate(0, (9 + k * 2) / 2, 0), additive(color, 0.28));
        tw.userData.spin = 3 + k;
        g.add(tw);
      }
    }
    if (kind === "fire") {
      for (let k = 0; k < 8; k++) {
        const f = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2, 8, 1, true), additive(0xff8a2a, 0.6));
        const a = (k / 8) * Math.PI * 2;
        f.position.set(Math.cos(a) * r * 0.6, 1, Math.sin(a) * r * 0.6);
        g.add(f);
      }
    }
    if (kind === "moon") {
      const moon = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 12), additive(0xe8f4ff, 0.7));
      moon.position.y = 4;
      g.add(moon);
    }
    this.add(g, life, (k) => {
      U.uT.value += 1 / 60;
      U.uFade.value = Math.min(1, k * 8) * Math.min(1, (1 - k) * 6);
      g.children.forEach((c) => {
        if (c.userData.spin) c.rotation.y += c.userData.spin / 60;
      });
    });
    return g;
  }

  /** Something flying: returns the object so the caller moves it. */
  projectile(kind: string, color: number): THREE.Object3D {
    const g = new THREE.Group();
    if (kind === "arrow") {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.1, 5).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x5a3a1a }));
      g.add(shaft);
      const trail = new THREE.Mesh(new THREE.CylinderGeometry(0.0, 0.12, 2.2, 8, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -1.4), additive(color, 0.6));
      g.add(trail);
    } else if (kind === "blade") {
      const m = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.12, 6, 24, Math.PI).rotateX(Math.PI / 2), additive(color, 0.9));
      g.add(m);
    } else {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), additive(color, 0.95));
      const halo = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), additive(color, 0.3));
      g.add(m, halo);
    }
    this.group.add(g);
    return g;
  }

  remove(o: THREE.Object3D): void {
    this.group.remove(o);
  }

  petals(at: THREE.Vector3, color = 0xffb0d0): void {
    this.sparks(at.clone().add(new THREE.Vector3(0, 1, 0)), color, 26, 4);
    this.ring(at, 2.5, color, 0.6);
  }
}
