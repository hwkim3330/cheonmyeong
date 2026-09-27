/**
 * Moving about the world: run by default, sprint with Shift (stamina), jump, open the kite
 * wings (비연) in the air to glide, climb any face too steep to walk (hold toward it; Space
 * leaps up), swim in deep water, and don't walk through houses, stakes or trees. The camera
 * orbits behind with the mouse and pulls in rather than sink into a hillside.
 */
import * as THREE from "three";
import { WATER } from "../world/layout";
import type { Collider } from "../world/structures";
import type { Terrain } from "../world/terrain";
import type { Input } from "./input";

export type Mode = "ground" | "air" | "glide" | "climb" | "swim";

export const STAMINA = 240;

export class Player {
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  yaw = 0;
  mode: Mode = "ground";
  stamina = STAMINA;
  staminaShow = 0;
  sprinting = false;
  turn = 0;
  /** Seconds since the last stamina use (regen waits a moment). */
  private rest = 0;
  climbPhase = 0;
  /** Movement is locked (attacking, dialogue). */
  rooted = 0;
  /** Where the player last stood on solid, dry ground. */
  readonly safe = new THREE.Vector3();
  readonly cam = { yaw: 0, pitch: 0.25, dist: 5.2, x: 0, y: 0, z: 0 };
  shake = 0;
  fovKick = 0;
  onLand: ((speed: number) => void) | null = null;
  drowned: (() => void) | null = null;
  gliderOpen = false;
  private dashT = 0;
  private readonly dashV = new THREE.Vector3();

  /** A burst of speed along the facing (a dodge, or a skill's charge). */
  dash(speed: number, dur = 0.3): void {
    if (dur <= 0.35) this.useStamina(18);
    this.dashT = dur;
    this.dashV.set(Math.sin(this.yaw) * speed, 0, Math.cos(this.yaw) * speed);
    this.rooted = 0;
  }

  /** A skill's jump: up and forward. */
  leap(dist: number, height: number, dur: number): void {
    this.vel.y = (4 * height) / dur;
    this.vel.x = Math.sin(this.yaw) * (dist / dur);
    this.vel.z = Math.cos(this.yaw) * (dist / dur);
    this.mode = "air";
    this.leapT = dur;
  }
  private leapT = 0;

  constructor(
    readonly t: Terrain,
    readonly colliders: Collider[],
    readonly trunks: [number, number, number][],
  ) {}

  place(x: number, z: number, yaw = 0): void {
    this.pos.set(x, this.t.height(x, z), z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.cam.yaw = yaw + Math.PI;
    this.mode = "ground";
    this.safe.copy(this.pos);
    this.cam.x = x;
    this.cam.y = this.pos.y + 1.5;
    this.cam.z = z;
  }

  private useStamina(n: number): boolean {
    if (this.stamina <= 0) return false;
    this.stamina = Math.max(0, this.stamina - n);
    this.rest = 0;
    this.staminaShow = 2;
    return true;
  }

  /** The move the player wants (world xz, length 0..1). */
  private wish(inp: Input): THREE.Vector2 {
    let f = 0;
    let r = 0;
    if (inp.down("KeyW")) f += 1;
    if (inp.down("KeyS")) f -= 1;
    if (inp.down("KeyD")) r += 1;
    if (inp.down("KeyA")) r -= 1;
    const v = new THREE.Vector2(r, f);
    if (v.lengthSq() > 1) v.normalize();
    // Camera-relative: forward is away from the camera.
    const cy = this.cam.yaw;
    const fx = -Math.sin(cy);
    const fz = -Math.cos(cy);
    const rx = Math.cos(cy);
    const rz = -Math.sin(cy);
    return new THREE.Vector2(fx * v.y + rx * v.x, fz * v.y + rz * v.x);
  }

  update(dt: number, inp: Input): void {
    const t = this.t;
    // Camera look.
    this.cam.yaw -= inp.mouseDX * 0.0025;
    this.cam.pitch = Math.max(-0.7, Math.min(1.25, this.cam.pitch + inp.mouseDY * 0.0022));
    this.cam.dist = Math.max(2.2, Math.min(12, this.cam.dist * Math.exp(inp.wheel * 0.001)));
    const w = this.rooted > 0 ? new THREE.Vector2() : this.wish(inp);
    this.rooted = Math.max(0, this.rooted - dt);
    const moving = w.lengthSq() > 0.01;
    this.rest += dt;
    const g = 24;
    const ground = t.height(this.pos.x, this.pos.z);
    const prevYaw = this.yaw;
    switch (this.mode) {
      case "ground": {
        this.sprinting = moving && inp.down("ShiftLeft") && this.stamina > 0;
        if (this.sprinting) this.useStamina(18 * dt);
        const target = moving ? (this.sprinting ? 9.2 : inp.down("ControlLeft") ? 2.4 : 6.0) : 0;
        const desired = new THREE.Vector3(w.x, 0, w.y).normalize().multiplyScalar(target);
        if (!moving) desired.set(0, 0, 0);
        const k = 1 - Math.exp(-dt * (moving ? 10 : 14));
        if (this.dashT > 0) {
          this.dashT -= dt;
          this.vel.x = this.dashV.x;
          this.vel.z = this.dashV.z;
          if (moving && this.dashV.lengthSq() < 400) this.faceToward(Math.atan2(w.x, w.y), dt, 20);
          this.dashV.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(this.dashV.length());
        } else {
          this.vel.x += (desired.x - this.vel.x) * k;
          this.vel.z += (desired.z - this.vel.z) * k;
        }
        if (moving && this.dashT <= 0) this.faceToward(Math.atan2(w.x, w.y), dt, 12);
        // Steep ground ahead: climb it.
        const n = t.normal(this.pos.x, this.pos.z);
        if (moving && this.stamina > 5) {
          const ax = this.pos.x + w.x * 0.8;
          const az = this.pos.z + w.y * 0.8;
          const na = t.normal(ax, az);
          if (na.y < 0.62 && t.height(ax, az) > this.pos.y + 0.8) {
            this.mode = "climb";
            this.vel.set(0, 0, 0);
            break;
          }
        }
        // Too steep to stand: slide.
        if (n.y < 0.6) {
          this.vel.x += n.x * 20 * dt;
          this.vel.z += n.z * 20 * dt;
        }
        if (inp.hit("Space") && this.rooted <= 0) {
          this.vel.y = 8.2;
          this.mode = "air";
        }
        this.pos.x += this.vel.x * dt;
        this.pos.z += this.vel.z * dt;
        const h = t.height(this.pos.x, this.pos.z);
        if (this.pos.y - h > 0.6 && this.mode === "ground") {
          this.mode = "air";
          this.vel.y = 0;
        } else if (this.mode === "ground") {
          this.pos.y = h;
          this.vel.y = 0;
          if (WATER - h < 1.1 && n.y > 0.7) this.safe.copy(this.pos);
        }
        if (WATER - h > 1.25) this.mode = "swim";
        break;
      }
      case "air":
      case "glide": {
        const glide = this.mode === "glide";
        if (inp.hit("Space")) {
          if (!glide && this.pos.y - ground > 2.5) this.mode = "glide";
          else if (glide) this.mode = "air";
        }
        if (glide && !this.useStamina(9 * dt)) this.mode = "air";
        if (this.leapT > 0) {
          this.leapT -= dt;
          this.vel.y -= g * dt * 0.8;
          this.pos.addScaledVector(this.vel, dt);
          const hh = t.height(this.pos.x, this.pos.z);
          if (this.pos.y <= hh) {
            this.pos.y = hh;
            this.vel.set(0, 0, 0);
            this.mode = "ground";
            this.leapT = 0;
          }
          break;
        }
        const air = moving ? (glide ? 8.5 : 6.5) : glide ? 2 : 0;
        const k = 1 - Math.exp(-dt * (glide ? 2.2 : 2.5));
        const desired = moving ? new THREE.Vector3(w.x, 0, w.y).normalize().multiplyScalar(air) : new THREE.Vector3(this.vel.x, 0, this.vel.z).multiplyScalar(glide ? 0.98 : 1);
        this.vel.x += (desired.x - this.vel.x) * k;
        this.vel.z += (desired.z - this.vel.z) * k;
        if (moving) this.faceToward(Math.atan2(w.x, w.y), dt, glide ? 3 : 6);
        else if (glide) this.faceToward(this.yaw, dt, 3);
        this.vel.y -= g * dt * (glide ? 0.25 : 1);
        if (glide) this.vel.y = Math.max(this.vel.y, -2.4);
        this.pos.addScaledVector(this.vel, dt);
        const h = t.height(this.pos.x, this.pos.z);
        // Into a wall while falling: grab it.
        if (moving && this.vel.y < 2) {
          const ax = this.pos.x + w.x * 0.7;
          const az = this.pos.z + w.y * 0.7;
          if (t.normal(ax, az).y < 0.62 && t.height(ax, az) > this.pos.y + 0.6 && this.stamina > 5) {
            this.mode = "climb";
            this.vel.set(0, 0, 0);
            break;
          }
        }
        if (this.pos.y <= h) {
          if (WATER - h > 1.25) {
            this.mode = "swim";
          } else {
            this.onLand?.(-this.vel.y);
            this.pos.y = h;
            this.vel.y = 0;
            this.mode = "ground";
          }
        } else if (this.pos.y < WATER - 0.9 && WATER - h > 1.25) {
          this.mode = "swim";
          this.vel.y = 0;
        }
        break;
      }
      case "climb": {
        const n = t.normal(this.pos.x, this.pos.z);
        const grad = new THREE.Vector2(-n.x, -n.z);
        const s = grad.length() / Math.max(0.05, n.y);
        const up = grad.lengthSq() > 1e-6 ? grad.clone().normalize() : new THREE.Vector2(Math.sin(this.yaw), Math.cos(this.yaw));
        const lat = new THREE.Vector2(-up.y, up.x);
        // Input relative to the wall: W up, S down, A/D sideways (as seen from behind).
        let fu = 0;
        let fs = 0;
        if (inp.down("KeyW")) fu += 1;
        if (inp.down("KeyS")) fu -= 1;
        if (inp.down("KeyD")) fs -= 1;
        if (inp.down("KeyA")) fs += 1;
        const speed = 1.7;
        if (fu || fs) {
          if (!this.useStamina(11 * dt)) {
            this.mode = "air";
            break;
          }
          this.climbPhase += dt * 6;
        }
        const L = speed * dt;
        const kh = 1 / Math.sqrt(1 + s * s);
        this.pos.x += (up.x * fu * kh + lat.x * fs * 0.8) * L;
        this.pos.z += (up.y * fu * kh + lat.y * fs * 0.8) * L;
        if (inp.hit("Space") && this.useStamina(24)) {
          // Leap up the face.
          this.pos.x += up.x * 1.6 * kh;
          this.pos.z += up.y * 1.6 * kh;
          this.climbPhase += 2;
          this.shake = Math.max(this.shake, 0.1);
        }
        this.faceToward(Math.atan2(up.x, up.y), dt, 10);
        const h = t.height(this.pos.x, this.pos.z);
        this.pos.y = h;
        // Stand the body a little off the rock.
        const nn = t.normal(this.pos.x, this.pos.z);
        if (nn.y > 0.7) {
          // Over the top: a small vault onto the ledge.
          this.mode = "ground";
          this.pos.x += up.x * 0.5;
          this.pos.z += up.y * 0.5;
          this.pos.y = t.height(this.pos.x, this.pos.z);
        } else if (fu < 0 && this.pos.y - (t.height(this.pos.x - up.x * 1.2, this.pos.z - up.y * 1.2)) < 0.4) {
          this.mode = "ground";
        }
        if (inp.hit("KeyX") || this.stamina <= 0) {
          this.mode = "air";
          this.vel.set(-up.x * 2, 0, -up.y * 2);
        }
        break;
      }
      case "swim": {
        const fast = inp.down("ShiftLeft") && moving;
        const target = moving ? (fast ? 4.2 : 2.4) : 0;
        if (moving && !this.useStamina((fast ? 20 : 7) * dt)) {
          this.drowned?.();
          break;
        }
        if (!moving && this.stamina > 0) this.useStamina(1.5 * dt);
        const k = 1 - Math.exp(-dt * 4);
        const desired = moving ? new THREE.Vector3(w.x, 0, w.y).normalize().multiplyScalar(target) : new THREE.Vector3();
        this.vel.x += (desired.x - this.vel.x) * k;
        this.vel.z += (desired.z - this.vel.z) * k;
        if (moving) this.faceToward(Math.atan2(w.x, w.y), dt, 5);
        this.pos.x += this.vel.x * dt;
        this.pos.z += this.vel.z * dt;
        this.pos.y += (WATER - 1.15 - this.pos.y) * Math.min(1, dt * 6);
        const h = t.height(this.pos.x, this.pos.z);
        if (WATER - h < 1.1) {
          this.mode = "ground";
          this.pos.y = h;
        }
        this.climbPhase += dt * (moving ? 5 : 1.5);
        break;
      }
    }
    this.gliderOpen = this.mode === "glide";
    this.collide();
    // Stamina regen when resting on the ground.
    if ((this.mode === "ground" && !this.sprinting) || this.mode === "air") {
      if (this.rest > 0.8) this.stamina = Math.min(STAMINA, this.stamina + 45 * dt);
    }
    this.staminaShow = this.stamina < STAMINA ? 2 : Math.max(0, this.staminaShow - dt);
    let dy = this.yaw - prevYaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.turn += (dy / Math.max(dt, 1e-3) - this.turn) * Math.min(1, dt * 8);
    // Keep inside the world.
    const lim = 1010;
    this.pos.x = Math.max(-lim, Math.min(lim, this.pos.x));
    this.pos.z = Math.max(-lim, Math.min(lim, this.pos.z));
    if (this.pos.y < -30) this.drowned?.();
  }

  private faceToward(target: number, dt: number, rate: number): void {
    let d = target - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, dt * rate);
  }

  /** Push out of solid things the player is standing among. */
  private collide(): void {
    const p = this.pos;
    const R = 0.4;
    for (const c of this.colliders) {
      if (Math.abs(c.x - p.x) > 20 || Math.abs(c.z - p.z) > 20) continue;
      if (p.y > c.top) continue;
      if (c.r !== undefined) {
        const dx = p.x - c.x;
        const dz = p.z - c.z;
        const d = Math.hypot(dx, dz);
        const m = c.r + R;
        if (d < m && d > 1e-4) {
          p.x = c.x + (dx / d) * m;
          p.z = c.z + (dz / d) * m;
        }
      } else {
        // Oriented box: into its frame, clamp, back out.
        const cr = Math.cos(c.rot ?? 0);
        const sr = Math.sin(c.rot ?? 0);
        const dx = p.x - c.x;
        const dz = p.z - c.z;
        const lx = dx * cr - dz * sr;
        const lz = dx * sr + dz * cr;
        const hx = (c.hx ?? 1) + R;
        const hz = (c.hz ?? 1) + R;
        if (Math.abs(lx) < hx && Math.abs(lz) < hz) {
          let nx = lx;
          let nz = lz;
          if (hx - Math.abs(lx) < hz - Math.abs(lz)) nx = Math.sign(lx) * hx;
          else nz = Math.sign(lz) * hz;
          p.x = c.x + nx * cr + nz * sr;
          p.z = c.z - nx * sr + nz * cr;
        }
      }
    }
    for (const [x, z, r] of this.trunks) {
      if (Math.abs(x - p.x) > 3 || Math.abs(z - p.z) > 3) continue;
      const dx = p.x - x;
      const dz = p.z - z;
      const d = Math.hypot(dx, dz);
      const m = r * 0.7 + R;
      if (d < m && d > 1e-4) {
        p.x = x + (dx / d) * m;
        p.z = z + (dz / d) * m;
      }
    }
  }

  /** Camera: behind and above, pulled in by the ground, with shake. */
  updateCamera(cam: THREE.PerspectiveCamera, dt: number): void {
    const c = this.cam;
    const target = new THREE.Vector3(this.pos.x, this.pos.y + 1.55, this.pos.z);
    const k = 1 - Math.exp(-dt * 12);
    c.x += (target.x - c.x) * k;
    c.y += (target.y - c.y) * (1 - Math.exp(-dt * 8));
    c.z += (target.z - c.z) * k;
    const cp = Math.cos(c.pitch);
    let dist = c.dist;
    const dir = new THREE.Vector3(Math.sin(c.yaw) * cp, Math.sin(c.pitch), Math.cos(c.yaw) * cp);
    // Shorten if the ground is in the way.
    for (let d = 0.6; d < dist; d += 0.3) {
      const px = c.x + dir.x * d;
      const pz = c.z + dir.z * d;
      if (this.t.height(px, pz) + 0.35 > c.y + dir.y * d) {
        dist = Math.max(0.8, d - 0.3);
        break;
      }
    }
    const pos = new THREE.Vector3(c.x, c.y, c.z).addScaledVector(dir, dist);
    pos.y = Math.max(pos.y, this.t.height(pos.x, pos.z) + 0.3);
    if (this.shake > 0) {
      pos.x += (Math.random() - 0.5) * this.shake * 0.5;
      pos.y += (Math.random() - 0.5) * this.shake * 0.5;
      this.shake = Math.max(0, this.shake - dt * 2.5);
    }
    cam.position.copy(pos);
    cam.lookAt(c.x, c.y + 0.1, c.z);
    const fov = 50 + (this.sprinting ? 6 : 0) + (this.mode === "glide" ? 8 : 0) + this.fovKick;
    cam.fov += (fov - cam.fov) * Math.min(1, dt * 4);
    this.fovKick *= Math.exp(-dt * 6);
    cam.updateProjectionMatrix();
  }
}
