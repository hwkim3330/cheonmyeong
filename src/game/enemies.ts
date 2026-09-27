/**
 * The Yellow Turbans (황건적). Each camp keeps a roster; its men are built only while the
 * player is near, and remember who has died. They idle round their fire, notice you, shout,
 * close in; every blow is telegraphed (a flash, a wind-up, a red circle on the ground for the
 * big ones) so it can be dodged. Archers keep their distance; sorcerers of the 태평도 call
 * down yellow fire; captains shrug off light hits until their poise breaks; 장보, the Lord of
 * Earth, calls lightning and summons his followers.
 */
import * as THREE from "three";
import { Animator } from "../char/anim";
import type { Rig } from "../char/model";
import { rigFor } from "../char/skinned";
import { TURBAN_LOOKS, type Element } from "../data/heroes";
import { CAMPS } from "../world/layout";
import type { Terrain } from "../world/terrain";
import type { Vfx } from "./vfx";

export type EnemyKind = "grunt" | "spear" | "archer" | "sorcerer" | "captain" | "boss";

export interface EnemyDef {
  name: string;
  look: keyof typeof TURBAN_LOOKS;
  hp: number;
  atk: number;
  def: number;
  speed: number;
  range: number;
  windup: number;
  cooldown: number;
  poise: number;
  scale: number;
}

export const ENEMY: Record<EnemyKind, EnemyDef> = {
  grunt: { name: "황건적", look: "grunt", hp: 320, atk: 22, def: 20, speed: 3.6, range: 2.0, windup: 0.55, cooldown: 1.6, poise: 0, scale: 1 },
  spear: { name: "황건 창병", look: "spear", hp: 360, atk: 26, def: 25, speed: 3.4, range: 3.0, windup: 0.65, cooldown: 1.8, poise: 0, scale: 1 },
  archer: { name: "황건 궁수", look: "archer", hp: 240, atk: 20, def: 15, speed: 3.2, range: 22, windup: 0.9, cooldown: 2.6, poise: 0, scale: 1 },
  sorcerer: { name: "태평도 술사", look: "sorcerer", hp: 420, atk: 34, def: 22, speed: 2.6, range: 16, windup: 1.3, cooldown: 3.6, poise: 60, scale: 1 },
  captain: { name: "황건 두목", look: "captain", hp: 1600, atk: 48, def: 40, speed: 3.0, range: 3.4, windup: 0.9, cooldown: 2.4, poise: 400, scale: 1.12 },
  boss: { name: "지공장군 장보", look: "sorcerer", hp: 9000, atk: 60, def: 50, speed: 3.2, range: 18, windup: 1.2, cooldown: 2.8, poise: 99999, scale: 1.35 },
};

export interface Enemy {
  id: number;
  kind: EnemyKind;
  def: EnemyDef;
  level: number;
  camp: number;
  home: THREE.Vector3;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  yaw: number;
  hp: number;
  maxHp: number;
  poise: number;
  state: "idle" | "alert" | "chase" | "windup" | "strike" | "hit" | "stun" | "dead";
  st: number;
  cd: number;
  aura: { el: Element; t: number } | null;
  rig: Rig | null;
  anim: Animator | null;
  knock: THREE.Vector3;
  alive: boolean;
  deadT: number;
  aimAt: THREE.Vector3;
  phase: number;
}

export interface EnemyHit {
  enemy: Enemy;
  kind: "melee" | "shot" | "area";
  at: THREE.Vector3;
  radius: number;
  dmg: number;
  el?: Element;
  delay: number;
}

let nextId = 1;

export class Enemies {
  readonly group = new THREE.Group();
  readonly list: Enemy[] = [];
  /** Attacks in flight / on their way down. */
  readonly pending: (EnemyHit & { t: number; obj?: THREE.Object3D; from?: THREE.Vector3 })[] = [];
  onKill: ((e: Enemy) => void) | null = null;
  onHitPlayer: ((dmg: number, from: THREE.Vector3, el?: Element) => void) | null = null;
  onCampCleared: ((camp: number) => void) | null = null;
  /** Camps already cleared (saved). */
  cleared = new Set<number>();
  private readonly rosters: Map<number, Enemy[]> = new Map();

  constructor(
    readonly t: Terrain,
    readonly vfx: Vfx,
  ) {
    CAMPS.forEach((c, ci) => {
      const kinds: EnemyKind[] =
        ci === 0 ? ["grunt", "grunt", "grunt", "archer"] : ci === 1 ? ["grunt", "grunt", "spear", "spear", "archer", "archer"] : ci === 2 ? ["grunt", "spear", "spear", "archer", "sorcerer", "captain"] : ["boss", "spear", "spear", "grunt", "grunt", "archer", "archer", "sorcerer"];
      const list: Enemy[] = kinds.map((k, i) => {
        const a = (i / kinds.length) * Math.PI * 2 + ci;
        const r = k === "boss" ? 0 : c.r * (0.25 + (i % 3) * 0.15);
        const x = c.x + Math.cos(a) * r;
        const z = c.z + Math.sin(a) * r + (k === "boss" ? -12 : 0);
        return this.make(k, c.level + (k === "captain" ? 2 : k === "boss" ? 4 : 0), ci, new THREE.Vector3(x, t.height(x, z), z));
      });
      this.rosters.set(ci, list);
      this.list.push(...list);
    });
  }

  private make(kind: EnemyKind, level: number, camp: number, home: THREE.Vector3): Enemy {
    const d = ENEMY[kind];
    const k = 1 + (level - 1) * 0.18;
    return { id: nextId++, kind, def: d, level, camp, home: home.clone(), pos: home.clone(), vel: new THREE.Vector3(), yaw: Math.random() * 6.28, hp: d.hp * k, maxHp: d.hp * k, poise: d.poise, state: "idle", st: Math.random() * 2, cd: 1, aura: null, rig: null, anim: null, knock: new THREE.Vector3(), alive: true, deadT: 0, aimAt: new THREE.Vector3(), phase: 0 };
  }

  /** Spawn more at runtime (the boss's summons). */
  summon(kind: EnemyKind, at: THREE.Vector3, level: number, camp: number): Enemy {
    const e = this.make(kind, level, camp, at);
    e.state = "chase";
    this.list.push(e);
    this.rosters.get(camp)?.push(e);
    this.vfx.ring(at, 3, 0xffd040, 0.6);
    return e;
  }

  atk(e: Enemy): number {
    return e.def.atk * (1 + (e.level - 1) * 0.16);
  }

  private build(e: Enemy): void {
    const look = { ...TURBAN_LOOKS[e.def.look] };
    if (e.kind === "boss") Object.assign(look, { robe: 0xe8c43a, robe2: 0x5a1a1a, gearColor: 0xe8c43a, cape: 0x8a2a1a, bulk: 1.2 });
    const rig = rigFor(e.kind === "boss" ? "turban-boss" : `turban-${e.def.look}`, look);
    rig.root.scale.setScalar(e.def.scale);
    this.group.add(rig.root);
    e.rig = rig;
    e.anim = new Animator(rig);
    e.anim.alwaysArmed = true;
  }

  private unbuild(e: Enemy): void {
    if (!e.rig) return;
    this.group.remove(e.rig.root);
    e.rig.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    e.rig = null;
    e.anim = null;
  }

  update(dt: number, player: THREE.Vector3, playerAlive: boolean): void {
    for (const e of this.list) {
      const near = e.pos.distanceTo(player) < 150;
      if (near && !e.rig && (e.alive || e.deadT < 3)) this.build(e);
      if (!near && e.rig) this.unbuild(e);
      if (!e.alive) {
        e.deadT += dt;
        if (e.rig) {
          e.anim!.update(dt, this.still(e));
          // Sink and fade away.
          if (e.deadT > 1.6) e.rig.root.position.y -= dt * 0.8;
          if (e.deadT > 3) this.unbuild(e);
        }
        continue;
      }
      if (!e.rig) continue;
      this.think(e, dt, player, playerAlive);
      // Move.
      e.pos.addScaledVector(e.vel, dt);
      e.pos.addScaledVector(e.knock, dt);
      e.knock.multiplyScalar(Math.exp(-dt * 6));
      e.pos.y = this.t.height(e.pos.x, e.pos.z);
      // Keep apart from each other.
      for (const o of this.list) {
        if (o === e || !o.alive || !o.rig) continue;
        const dx = e.pos.x - o.pos.x;
        const dz = e.pos.z - o.pos.z;
        const d = Math.hypot(dx, dz);
        const m = 0.9 * (e.def.scale + o.def.scale);
        if (d < m && d > 1e-3) {
          e.pos.x += (dx / d) * (m - d) * 0.5;
          e.pos.z += (dz / d) * (m - d) * 0.5;
        }
      }
      e.rig.root.position.copy(e.pos);
      e.rig.root.rotation.y = e.yaw;
      e.anim!.update(dt, { speed: Math.hypot(e.vel.x, e.vel.z), grounded: true, vy: 0, gliding: false, turn: 0, vel: e.vel, sprint: false });
    }
    this.updatePending(dt, player);
    // Camps emptied?
    for (const [ci, list] of this.rosters) {
      if (this.cleared.has(ci)) continue;
      if (list.every((e) => !e.alive)) {
        this.cleared.add(ci);
        this.onCampCleared?.(ci);
      }
    }
  }

  private still(e: Enemy) {
    return { speed: 0, grounded: true, vy: 0, gliding: false, turn: 0, vel: e.vel, sprint: false };
  }

  private face(e: Enemy, x: number, z: number, dt: number, rate = 8): void {
    let d = Math.atan2(x - e.pos.x, z - e.pos.z) - e.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    e.yaw += d * Math.min(1, dt * rate);
  }

  private think(e: Enemy, dt: number, P: THREE.Vector3, alive: boolean): void {
    const d = Math.hypot(P.x - e.pos.x, P.z - e.pos.z);
    const D = e.def;
    e.st -= dt;
    e.cd -= dt;
    const want = new THREE.Vector3();
    switch (e.state) {
      case "idle": {
        if (alive && d < (e.kind === "boss" ? 30 : 20)) {
          e.state = "alert";
          e.st = 0.6;
          // The whole camp hears the shout.
          for (const o of this.list) if (o.camp === e.camp && o.alive && o.state === "idle" && o.pos.distanceTo(e.pos) < 40) {
            o.state = "alert";
            o.st = 0.6 + Math.random() * 0.4;
          }
          break;
        }
        // Wander near home.
        if (e.st < 0) {
          e.st = 2 + Math.random() * 3;
          e.aimAt.set(e.home.x + (Math.random() - 0.5) * 8, 0, e.home.z + (Math.random() - 0.5) * 8);
        }
        if (Math.hypot(e.aimAt.x - e.pos.x, e.aimAt.z - e.pos.z) > 1 && e.st < 1.5) {
          want.set(e.aimAt.x - e.pos.x, 0, e.aimAt.z - e.pos.z).normalize().multiplyScalar(1.3);
          this.face(e, e.aimAt.x, e.aimAt.z, dt, 3);
        }
        break;
      }
      case "alert":
        this.face(e, P.x, P.z, dt);
        if (e.st < 0) e.state = "chase";
        break;
      case "chase": {
        if (!alive || d > 60 || e.pos.distanceTo(e.home) > 90) {
          // Give up; go home.
          e.state = "idle";
          e.st = 0;
          e.aimAt.copy(e.home);
          break;
        }
        this.face(e, P.x, P.z, dt);
        const ranged = e.kind === "archer" || e.kind === "sorcerer" || e.kind === "boss";
        const ideal = ranged ? (e.kind === "boss" ? 9 : D.range * 0.65) : D.range * 0.8;
        const dir = new THREE.Vector3(P.x - e.pos.x, 0, P.z - e.pos.z).normalize();
        if (ranged && d < ideal * 0.6 && e.kind !== "boss") want.copy(dir).multiplyScalar(-D.speed * 0.8);
        else if (d > ideal) want.copy(dir).multiplyScalar(D.speed);
        else {
          // Circle a little.
          want.set(-dir.z, 0, dir.x).multiplyScalar(Math.sin(e.id + performance.now() * 0.0005) * 1.2);
        }
        if (e.cd <= 0 && d < D.range * (ranged ? 1 : 1.1)) {
          e.state = "windup";
          e.st = D.windup;
          e.aimAt.copy(P);
          this.startAttack(e, P, d);
        }
        break;
      }
      case "windup":
        if (e.kind !== "archer" && e.kind !== "sorcerer" && e.kind !== "boss") this.face(e, P.x, P.z, dt, 3);
        if (e.st <= 0) {
          e.state = "strike";
          e.st = 0.45;
          e.cd = D.cooldown * (0.8 + Math.random() * 0.4);
        }
        break;
      case "strike":
        if (e.st <= 0) e.state = "chase";
        break;
      case "hit":
      case "stun":
        if (e.st <= 0) e.state = "chase";
        break;
    }
    const k = 1 - Math.exp(-dt * 8);
    e.vel.x += (want.x - e.vel.x) * k;
    e.vel.z += (want.z - e.vel.z) * k;
    if (e.state === "windup" || e.state === "strike" || e.state === "hit" || e.state === "stun") e.vel.multiplyScalar(Math.exp(-dt * 10));
  }

  /** Begin an attack: the wind-up animation and whatever lands later. */
  private startAttack(e: Enemy, P: THREE.Vector3, d: number): void {
    const D = e.def;
    const atk = this.atk(e);
    const fwd = new THREE.Vector3(Math.sin(e.yaw), 0, Math.cos(e.yaw));
    switch (e.kind) {
      case "grunt":
      case "spear":
      case "captain": {
        e.anim!.play(e.kind === "spear" ? "atk2" : e.kind === "captain" && Math.random() < 0.5 ? "atk3" : "atk0", e.kind === "captain" ? 0.75 : 0.9);
        const big = e.kind === "captain";
        const at = e.pos.clone().addScaledVector(fwd, big ? 2.4 : D.range * 0.6);
        if (big) this.vfx.telegraph(at, 3.4, D.windup);
        this.pending.push({ enemy: e, kind: big ? "area" : "melee", at, radius: big ? 3.4 : D.range * 0.75, dmg: atk * (big ? 1.4 : 1), delay: D.windup + 0.1, t: 0 });
        break;
      }
      case "archer": {
        e.anim!.play("aim", 0.8);
        this.pending.push({ enemy: e, kind: "shot", at: P.clone(), radius: 1.2, dmg: atk, delay: D.windup, t: 0 });
        break;
      }
      case "sorcerer": {
        e.anim!.play("cast", 0.7);
        const at = P.clone();
        this.vfx.telegraph(at, 3, D.windup, 0xffc040);
        this.pending.push({ enemy: e, kind: "area", at, radius: 3, dmg: atk * 1.2, el: "fire", delay: D.windup, t: 0 });
        break;
      }
      case "boss": {
        e.phase++;
        const hpK = e.hp / e.maxHp;
        if (e.phase % 4 === 0 && hpK < 0.7) {
          // Call the faithful.
          e.anim!.play("raise", 0.8);
          for (let k = 0; k < 2; k++) {
            const a = Math.random() * Math.PI * 2;
            this.summon(Math.random() < 0.5 ? "grunt" : "spear", e.pos.clone().add(new THREE.Vector3(Math.cos(a) * 5, 0, Math.sin(a) * 5)), e.level - 3, e.camp);
          }
        } else if (d < 5) {
          e.anim!.play("roar", 0.8);
          this.vfx.telegraph(e.pos.clone(), 6, D.windup * 0.8, 0xffd040);
          this.pending.push({ enemy: e, kind: "area", at: e.pos.clone(), radius: 6, dmg: atk * 1.3, el: "thunder", delay: D.windup * 0.8, t: 0 });
        } else {
          // Lightning from a clear sky: three strikes round the player.
          e.anim!.play("raise", 0.8);
          const n = hpK < 0.5 ? 5 : 3;
          for (let k = 0; k < n; k++) {
            const off = k === 0 ? new THREE.Vector3() : new THREE.Vector3((Math.random() - 0.5) * 9, 0, (Math.random() - 0.5) * 9);
            const at = P.clone().add(off);
            at.y = this.t.height(at.x, at.z);
            this.vfx.telegraph(at, 2.6, D.windup + k * 0.15, 0xb46aff);
            this.pending.push({ enemy: e, kind: "area", at, radius: 2.6, dmg: atk * 1.1, el: "thunder", delay: D.windup + k * 0.15, t: 0 });
          }
        }
        break;
      }
    }
  }

  private updatePending(dt: number, P: THREE.Vector3): void {
    for (const h of this.pending) {
      h.t += dt;
      if (h.kind === "shot" && h.t >= h.delay && !h.obj) {
        // Loose the arrow.
        h.obj = this.vfx.projectile("arrow", 0xffe080);
        h.from = h.enemy.pos.clone().add(new THREE.Vector3(0, 1.4, 0));
        h.obj.position.copy(h.from);
        h.at.y += 1;
      }
      if (h.obj && h.from) {
        const dir = h.at.clone().sub(h.from);
        const L = dir.length();
        const u = Math.min(1, ((h.t - h.delay) * 32) / Math.max(1, L));
        h.obj.position.copy(h.from).addScaledVector(dir, u);
        h.obj.lookAt(h.at);
        // Hit whatever it reaches at the player's current place.
        if (h.obj.position.distanceTo(new THREE.Vector3(P.x, P.y + 1, P.z)) < 1.1) {
          this.onHitPlayer?.(h.dmg, h.enemy.pos, h.el);
          h.t = 999;
        } else if (u >= 1) h.t = 999;
      }
    }
    for (const h of this.pending) {
      if (h.kind === "shot") continue;
      if (h.t >= h.delay && h.t < 900) {
        const alive = h.enemy.alive && (h.enemy.state === "strike" || h.enemy.state === "windup" || h.kind === "area");
        if (alive) {
          if (h.kind === "area") {
            const col = h.el === "thunder" ? 0xb46aff : h.el === "fire" ? 0xffa040 : 0xff5a3a;
            if (h.el === "thunder") this.vfx.pillar(h.at, 1.2, col, 16);
            else this.vfx.burst(h.at, h.radius * 0.6, col);
          }
          const dx = P.x - h.at.x;
          const dz = P.z - h.at.z;
          if (Math.hypot(dx, dz) < h.radius + 0.4 && Math.abs(P.y - h.at.y) < 3) this.onHitPlayer?.(h.dmg, h.enemy.pos, h.el);
        }
        h.t = 999;
      }
    }
    for (let i = this.pending.length - 1; i >= 0; i--)
      if (this.pending[i].t >= 900) {
        if (this.pending[i].obj) this.vfx.remove(this.pending[i].obj!);
        this.pending.splice(i, 1);
      }
  }

  /** Damage an enemy (from the combat system). Returns true if it died. */
  hurt(e: Enemy, dmg: number, knock: THREE.Vector3, stagger: number): boolean {
    if (!e.alive) return false;
    e.hp -= dmg;
    e.poise -= dmg;
    if (e.state === "idle" || e.state === "alert") e.state = "chase";
    if (e.poise <= 0 || e.def.poise === 0) {
      e.knock.add(knock);
      if (stagger > 0 && e.state !== "stun") {
        e.state = "hit";
        e.st = Math.min(0.5, stagger);
        e.anim?.play("hit", 1.2);
      }
      if (e.def.poise > 0 && e.poise <= 0) e.poise = e.def.poise;
    }
    if (e.hp <= 0) {
      e.alive = false;
      e.state = "dead";
      e.deadT = 0;
      e.anim?.play("dead");
      this.onKill?.(e);
      return true;
    }
    return false;
  }

  stun(e: Enemy, t: number): void {
    if (!e.alive || e.kind === "boss") return;
    e.state = "stun";
    e.st = t;
  }

  near(p: THREE.Vector3, r: number): Enemy[] {
    return this.list.filter((e) => e.alive && e.rig && Math.hypot(e.pos.x - p.x, e.pos.z - p.z) < r);
  }
}
