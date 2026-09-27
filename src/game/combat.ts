/**
 * Fighting. Left click chains the normal attack combo (it snaps to the nearest foe in
 * front); E casts the hero's skill, Q the burst once energy is full; Shift dashes with a
 * moment of invulnerability. Skills are run from their effect lists (slashes, dashes, blasts,
 * shots, fields, rains, heals, buffs). Elements stick to enemies as auras and react with the
 * next one: 증발 (fire × water, heavy damage), 감전 (water × thunder, chains and stuns),
 * 폭뢰 (fire × thunder, an explosion), 확산 (wind spreads whatever it touches). Hits give energy,
 * stop time for a blink, shake the camera and throw up numbers.
 */
import * as THREE from "three";
import { WEAPON_CLASS } from "../char/weapon";
import { ELEMENT_COLOR, type Effect, type Element, type Skill } from "../data/heroes";
import type { Enemies, Enemy } from "./enemies";
import type { Input } from "./input";
import type { Member, Party } from "./party";
import type { Player } from "./player";
import type { Vfx } from "./vfx";

export interface Popup {
  pos: THREE.Vector3;
  text: string;
  color: string;
  size: number;
}

interface Cast {
  who: Member;
  skill: Skill;
  t: number;
  done: boolean[];
  origin: THREE.Vector3;
  yaw: number;
  energyGiven: boolean;
}

interface Shot {
  obj: THREE.Object3D;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  dmg: number;
  el: Element | null;
  splash: number;
  who: Member;
  hit: Set<number>;
}

interface Field {
  pos: THREE.Vector3;
  r: number;
  t: number;
  life: number;
  tick: number;
  next: number;
  dmg: number;
  el: Element | null;
  pull: number;
  heal: number;
  who: Member;
}

interface Rain {
  pos: THREE.Vector3;
  r: number;
  left: number;
  every: number;
  next: number;
  dmg: number;
  el: Element | null;
  who: Member;
}

const REACT_COLOR: Record<string, string> = { 증발: "#ffb050", 감전: "#c890ff", 폭뢰: "#ff6aa0", 확산: "#7affd0" };

export class Combat {
  combo = 0;
  private comboT = 0;
  private attackHitAt = -1;
  private attackT = 0;
  private casts: Cast[] = [];
  private shots: Shot[] = [];
  private fields: Field[] = [];
  private rains: Rain[] = [];
  iframes = 0;
  timeScale = 1;
  private hitStop = 0;
  buff = { atk: 0, t: 0 };
  readonly popups: Popup[] = [];
  inCombat = 0;
  onWipe: (() => void) | null = null;
  onMemberDown: ((m: Member) => void) | null = null;
  onBurst: ((m: Member) => void) | null = null;

  constructor(
    readonly party: Party,
    readonly player: Player,
    readonly enemies: Enemies,
    readonly vfx: Vfx,
  ) {
    enemies.onHitPlayer = (dmg, from, el) => this.hurtPlayer(dmg, from, el);
    enemies.onKill = (e) => {
      this.popups.push({ pos: e.pos.clone().add(new THREE.Vector3(0, 2.4, 0)), text: "격파", color: "#ffe8a0", size: 18 });
      for (const m of this.party.members) m.energy = Math.min(this.cost(m), m.energy + (m === this.party.cur ? 6 : 3));
    };
  }

  cost(m: Member): number {
    return m.def.burst.energy ?? 60;
  }

  private target(range = 9): Enemy | null {
    const p = this.player.pos;
    const fx = Math.sin(this.player.yaw);
    const fz = Math.cos(this.player.yaw);
    let best: Enemy | null = null;
    let bs = Infinity;
    for (const e of this.enemies.near(p, range)) {
      const dx = e.pos.x - p.x;
      const dz = e.pos.z - p.z;
      const d = Math.hypot(dx, dz);
      const front = (dx * fx + dz * fz) / (d || 1);
      const s = d - front * 3;
      if (s < bs) {
        bs = s;
        best = e;
      }
    }
    return best;
  }

  private faceTarget(e: Enemy | null): void {
    if (!e) return;
    this.player.yaw = Math.atan2(e.pos.x - this.player.pos.x, e.pos.z - this.player.pos.z);
  }

  update(rawDt: number, inp: Input): number {
    // Hit-stop: the world freezes for an instant on a heavy blow.
    if (this.hitStop > 0) {
      this.hitStop -= rawDt;
      this.timeScale = 0.08;
    } else this.timeScale += (1 - this.timeScale) * Math.min(1, rawDt * 12);
    const dt = rawDt * this.timeScale;
    const cur = this.party.cur;
    this.iframes = Math.max(0, this.iframes - rawDt);
    this.inCombat = Math.max(0, this.inCombat - rawDt);
    if (this.enemies.list.some((e) => e.alive && e.rig && (e.state === "chase" || e.state === "windup" || e.state === "strike") && e.pos.distanceTo(this.player.pos) < 30)) this.inCombat = 3;
    for (const m of this.party.members) {
      m.cdE = Math.max(0, m.cdE - dt);
      m.cdQ = Math.max(0, m.cdQ - dt);
    }
    this.buff.t = Math.max(0, this.buff.t - dt);
    if (this.buff.t <= 0) this.buff.atk = 0;
    const grounded = this.player.mode === "ground";
    // Party switching.
    for (let i = 0; i < 4; i++) if (inp.hit(`Digit${i + 1}`) && this.party.swap(i)) this.vfx.petals(this.player.pos);
    // Dash.
    if (inp.hit("ShiftLeft") && grounded && this.player.stamina > 18) {
      const p = this.player;
      p.dash(18);
      this.iframes = 0.32;
      cur.anim.stop();
      this.attackHitAt = -1;
    }
    const busy = cur.anim.busy;
    const cls = WEAPON_CLASS[cur.def.look.weapon.kind];
    // Normal attack combo.
    this.comboT -= dt;
    if (this.comboT < 0) this.combo = 0;
    if (inp.lmbPressed && grounded && !this.casts.some((c) => c.who === cur && !c.done.every(Boolean))) {
      const canChain = !busy || (busy.startsWith("atk") && cur.anim.actionT > 0.55 * this.attackT);
      if (canChain) {
        const n = cur.def.combo.length;
        const i = this.combo % n;
        const name = cur.anim.has(`atk${i}`) ? `atk${i}` : "atk0";
        const rate = cls === "bow" ? 1.4 : 1.15;
        this.attackT = cur.anim.play(name, rate);
        this.faceTarget(this.target());
        this.attackHitAt = this.attackT * (cls === "bow" ? 0.45 : 0.42);
        this.player.rooted = this.attackT * 0.7;
        this.combo = i + 1;
        this.comboT = this.attackT + 0.6;
        this.inCombat = 3;
      }
    }
    if (this.attackHitAt >= 0 && cur.anim.busy?.startsWith("atk")) {
      if (cur.anim.actionT >= this.attackHitAt) {
        this.attackHitAt = -1;
        this.normalHit(cur, cls);
      }
    } else this.attackHitAt = -1;
    // Root motion from the attack animation.
    if (cur.anim.lunge) {
      this.player.pos.x += Math.sin(this.player.yaw) * cur.anim.lunge;
      this.player.pos.z += Math.cos(this.player.yaw) * cur.anim.lunge;
    }
    // Skill and burst.
    if (inp.hit("KeyE") && cur.cdE <= 0 && (grounded || this.player.mode === "air")) this.cast(cur, cur.def.skill);
    if (inp.hit("KeyQ") && cur.energy >= this.cost(cur) && grounded) {
      cur.energy = 0;
      this.cast(cur, cur.def.burst);
      this.iframes = cur.def.burst.dur;
      this.player.fovKick = -12;
      this.hitStop = 0.25;
      this.onBurst?.(cur);
    }
    this.runCasts(dt);
    this.runShots(dt);
    this.runFields(dt);
    this.runRains(dt);
    // Enemy auras fade.
    for (const e of this.enemies.list) if (e.aura && (e.aura.t -= dt) <= 0) e.aura = null;
    return dt;
  }

  private dmgOf(m: Member, mult: number): { dmg: number; crit: boolean } {
    const crit = Math.random() < 0.18;
    return { dmg: m.atk * mult * (1 + this.buff.atk) * (crit ? 1.7 : 1) * (0.92 + Math.random() * 0.16), crit };
  }

  /** Apply one hit: reactions, damage, knock, popups, energy. */
  hit(e: Enemy, m: Member, mult: number, el: Element | null, knock = 2, stagger = 0.25, heavy = false): void {
    if (!e.alive) return;
    let { dmg, crit } = this.dmgOf(m, mult);
    let reaction = "";
    if (el) {
      const r = this.react(e, el, m);
      dmg *= r.mult;
      reaction = r.name;
    }
    dmg *= 100 / (100 + e.def.def * (1 + (e.level - 1) * 0.1));
    const dir = new THREE.Vector3(e.pos.x - this.player.pos.x, 0, e.pos.z - this.player.pos.z).normalize();
    this.enemies.hurt(e, dmg, dir.multiplyScalar(knock), stagger);
    const col = el ? "#" + ELEMENT_COLOR[el].toString(16).padStart(6, "0") : "#ffffff";
    this.popups.push({ pos: e.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 1.9 + Math.random() * 0.5, 0)), text: String(Math.round(dmg)), color: crit ? "#ffd84a" : col, size: crit ? 30 : heavy ? 26 : 20 });
    if (reaction) this.popups.push({ pos: e.pos.clone().add(new THREE.Vector3(0, 2.8, 0)), text: reaction, color: REACT_COLOR[reaction] ?? "#fff", size: 24 });
    this.vfx.sparks(e.pos.clone().add(new THREE.Vector3(0, 1.1, 0)), el ? ELEMENT_COLOR[el] : 0xfff0c0, heavy ? 16 : 9);
    if (heavy || crit) {
      this.hitStop = Math.max(this.hitStop, heavy ? 0.07 : 0.04);
      this.player.shake = Math.max(this.player.shake, heavy ? 0.25 : 0.12);
    }
    this.inCombat = 3;
  }

  private react(e: Enemy, el: Element, m: Member): { mult: number; name: string } {
    const a = e.aura?.el;
    const pair = (x: Element, y: Element) => (a === x && el === y) || (a === y && el === x);
    if (!a) {
      if (el !== "wind") e.aura = { el, t: 7 };
      return { mult: 1, name: "" };
    }
    if (a === el) {
      e.aura!.t = 7;
      return { mult: 1, name: "" };
    }
    if (el === "wind" || a === "wind") {
      // 확산: carry the element to everyone nearby.
      const carried = el === "wind" ? a : el;
      for (const o of this.enemies.near(e.pos, 6)) {
        if (o === e) continue;
        o.aura = { el: carried, t: 7 };
        this.hit(o, m, 0.6, null, 1, 0.1);
      }
      this.vfx.ring(e.pos, 6, ELEMENT_COLOR[carried], 0.5);
      e.aura = null;
      return { mult: 1.2, name: "확산" };
    }
    e.aura = null;
    if (pair("fire", "water")) return { mult: 1.8, name: "증발" };
    if (pair("water", "thunder")) {
      for (const o of this.enemies.near(e.pos, 4)) {
        this.enemies.stun(o, 1.1);
        if (o !== e) this.hit(o, m, 0.5, null, 0.5, 0.2);
      }
      this.vfx.ring(e.pos, 4, 0xc890ff, 0.4);
      return { mult: 1.3, name: "감전" };
    }
    if (pair("fire", "thunder")) {
      this.vfx.burst(e.pos, 3, 0xff6aa0);
      for (const o of this.enemies.near(e.pos, 4)) if (o !== e) this.hit(o, m, 1.0, null, 7, 0.4, true);
      return { mult: 1.5, name: "폭뢰" };
    }
    return { mult: 1, name: "" };
  }

  private normalHit(m: Member, cls: string): void {
    const p = this.player.pos;
    const yaw = this.player.yaw;
    const i = (this.combo - 1 + m.def.combo.length) % m.def.combo.length;
    const mult = m.def.combo[i];
    const last = i === m.def.combo.length - 1;
    const col = cls === "catalyst" ? ELEMENT_COLOR[m.def.element] : 0xfff4e0;
    if (cls === "polearm" || cls === "sword") {
      const range = cls === "polearm" ? 3.4 : 2.7;
      const arc = cls === "polearm" ? 2.4 : 2.1;
      this.vfx.slash(p.clone().add(new THREE.Vector3(0, 1.1, 0)), yaw, range, arc, last ? ELEMENT_COLOR[m.def.element] : col, (i % 2 ? 1 : -1) * 0.25, 1.0);
      let hitAny = false;
      for (const e of this.enemies.near(p, range + 1)) {
        const dx = e.pos.x - p.x;
        const dz = e.pos.z - p.z;
        let da = Math.atan2(dx, dz) - yaw;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        if (Math.abs(da) < arc / 2 + 0.2 || Math.hypot(dx, dz) < 1.2) {
          this.hit(e, m, mult, null, last ? 5 : 1.5, 0.25, last);
          hitAny = true;
        }
      }
      if (hitAny) m.energy = Math.min(this.cost(m), m.energy + 1);
    } else {
      // Projectiles: fan orbs (element) or arrows (physical), at the target or straight ahead.
      const t = this.target(24);
      const from = p.clone().add(new THREE.Vector3(Math.sin(yaw) * 0.6, 1.4, Math.cos(yaw) * 0.6));
      const to = t ? t.pos.clone().add(new THREE.Vector3(0, 1, 0)) : from.clone().add(new THREE.Vector3(Math.sin(yaw) * 20, 0, Math.cos(yaw) * 20));
      const el = cls === "catalyst" ? m.def.element : null;
      this.shoot(m, from, to, cls === "catalyst" ? 22 : 45, mult, el, cls === "catalyst" ? 1.2 : 0, cls === "catalyst" ? "orb" : "arrow");
    }
  }

  private shoot(m: Member, from: THREE.Vector3, to: THREE.Vector3, speed: number, mult: number, el: Element | null, splash: number, kind: string): void {
    const obj = this.vfx.projectile(kind, el ? ELEMENT_COLOR[el] : 0xfff0c0);
    obj.position.copy(from);
    const vel = to.clone().sub(from).normalize().multiplyScalar(speed);
    obj.lookAt(to);
    this.shots.push({ obj, pos: from.clone(), vel, life: 1.6, dmg: mult, el, splash, who: m, hit: new Set() });
  }

  private cast(m: Member, s: Skill): void {
    const t = this.target(12);
    this.faceTarget(t);
    m.anim.play(s.anim, 1);
    if (s === m.def.skill) m.cdE = s.cd;
    this.player.rooted = s.dur * 0.85;
    this.casts.push({ who: m, skill: s, t: 0, done: s.fx.map(() => false), origin: this.player.pos.clone(), yaw: this.player.yaw, energyGiven: false });
    this.inCombat = 3;
  }

  private runCasts(dt: number): void {
    for (const c of this.casts) {
      c.t += dt;
      c.skill.fx.forEach((f, i) => {
        if (c.done[i] || c.t < f.at) return;
        c.done[i] = true;
        this.effect(c, f);
      });
    }
    this.casts = this.casts.filter((c) => !c.done.every(Boolean) || c.t < c.skill.dur);
  }

  private effect(c: Cast, f: Effect): void {
    const m = c.who;
    const el = "el" in f && f.el ? m.def.element : null;
    const col = ELEMENT_COLOR[m.def.element];
    const p = this.player.pos.clone();
    const yaw = this.player.yaw;
    const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const giveEnergy = (n: number) => {
      if (c.energyGiven) return;
      c.energyGiven = true;
      m.energy = Math.min(this.cost(m), m.energy + n);
    };
    switch (f.k) {
      case "slash": {
        this.vfx.slash(p.clone().add(new THREE.Vector3(0, 1.1, 0)), yaw, f.range, Math.min(f.arc, 6.28), col, 0, 1.6);
        if (f.arc > 6) this.vfx.ring(p, f.range, col, 0.4);
        for (const e of this.enemies.near(p, f.range + 0.8)) {
          let da = Math.atan2(e.pos.x - p.x, e.pos.z - p.z) - yaw;
          da = Math.atan2(Math.sin(da), Math.cos(da));
          if (f.arc > 6 || Math.abs(da) < f.arc / 2 + 0.2) {
            this.hit(e, m, f.dmg, el, f.knock ?? 3, 0.35, true);
            giveEnergy(4);
          }
        }
        break;
      }
      case "dash": {
        // Travel, cutting everything in the path.
        const from = p.clone();
        const to = p.clone().addScaledVector(fwd, f.dist);
        this.player.dash(f.dist / f.dur, f.dur);
        this.iframes = Math.max(this.iframes, f.dur + 0.1);
        const w = f.width ?? 1.6;
        this.vfx.slash(from.clone().add(new THREE.Vector3(0, 1, 0)).addScaledVector(fwd, f.dist * 0.5), yaw + Math.PI / 2, f.dist * 0.5, 1.2, col, Math.PI / 2, 0.8);
        for (const e of this.enemies.near(from.clone().lerp(to, 0.5), f.dist * 0.6 + w)) {
          const rel = e.pos.clone().sub(from);
          const along = rel.dot(fwd);
          const side = Math.abs(rel.x * fwd.z - rel.z * fwd.x);
          if (along > -1 && along < f.dist + 1 && side < w) {
            this.hit(e, m, f.dmg, el, 4, 0.4, true);
            giveEnergy(4);
          }
        }
        break;
      }
      case "blast": {
        const at = p.clone().addScaledVector(fwd, f.fwd);
        if (f.fx === "pillar") this.vfx.pillar(at, f.radius * 0.4, col, 18);
        else if (f.fx === "ring") this.vfx.ring(at, f.radius, col, 0.5);
        else this.vfx.burst(at, f.radius * 0.7, col);
        this.player.shake = Math.max(this.player.shake, 0.35);
        for (const e of this.enemies.near(at, f.radius)) {
          this.hit(e, m, f.dmg, el, f.knock ?? 4, 0.5, true);
          if (f.stun) this.enemies.stun(e, f.stun);
          giveEnergy(5);
        }
        break;
      }
      case "shot": {
        const n = f.count ?? 1;
        const t = this.target(30);
        const baseTo = t ? t.pos.clone().add(new THREE.Vector3(0, 1, 0)) : p.clone().add(new THREE.Vector3(0, 1.3, 0)).addScaledVector(fwd, 25);
        const from = p.clone().add(new THREE.Vector3(0, 1.4, 0)).addScaledVector(fwd, 0.6);
        for (let k = 0; k < n; k++) {
          const off = n > 1 ? (k / (n - 1) - 0.5) * 2 * (f.spread ?? 0.3) : 0;
          const dir = baseTo.clone().sub(from);
          dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), off);
          this.shoot(m, from, from.clone().add(dir), f.speed, f.dmg, el, f.splash ?? 0, f.fx ?? "orb");
        }
        giveEnergy(3);
        break;
      }
      case "field": {
        const at = p.clone().addScaledVector(fwd, f.fwd);
        at.y = this.player.t.height(at.x, at.z);
        this.vfx.field(at, f.radius, f.dur, col, f.fx ?? "formation");
        this.fields.push({ pos: at, r: f.radius, t: 0, life: f.dur, tick: f.tick, next: 0, dmg: f.dmg, el, pull: f.pull ?? 0, heal: f.heal ?? 0, who: m });
        giveEnergy(2);
        break;
      }
      case "rain": {
        const at = p.clone().addScaledVector(fwd, f.fwd);
        at.y = this.player.t.height(at.x, at.z);
        this.vfx.field(at, f.radius, f.dur, col, "fire");
        this.rains.push({ pos: at, r: f.radius, left: f.count, every: f.dur / f.count, next: 0, dmg: f.dmg, el, who: m });
        break;
      }
      case "heal": {
        for (const mm of this.party.members) if (mm.hp > 0) mm.hp = Math.min(mm.maxHp, mm.hp + mm.maxHp * f.amount);
        this.vfx.ring(p, 3, 0x9affc0, 0.6);
        this.popups.push({ pos: p.clone().add(new THREE.Vector3(0, 2.3, 0)), text: `+${Math.round(m.maxHp * f.amount)}`, color: "#9affc0", size: 22 });
        break;
      }
      case "buff":
        this.buff = { atk: f.atk, t: f.dur };
        break;
      case "leap":
        this.player.leap(f.dist, f.height, f.dur);
        this.iframes = Math.max(this.iframes, f.dur + 0.3);
        break;
    }
  }

  private runShots(dt: number): void {
    for (const s of this.shots) {
      s.life -= dt;
      s.pos.addScaledVector(s.vel, dt);
      s.obj.position.copy(s.pos);
      const gy = this.player.t.height(s.pos.x, s.pos.z);
      let boom = s.pos.y < gy;
      for (const e of this.enemies.near(s.pos, 1.6)) {
        if (s.hit.has(e.id) || Math.abs(e.pos.y + 1 - s.pos.y) > 1.6) continue;
        s.hit.add(e.id);
        this.hit(e, s.who, s.dmg, s.el, 2, 0.2, s.splash > 0);
        boom = true;
        if (!s.splash) break;
      }
      if (boom && s.splash > 0) {
        this.vfx.burst(s.pos, s.splash * 0.6, s.el ? ELEMENT_COLOR[s.el] : 0xffffff);
        for (const e of this.enemies.near(s.pos, s.splash)) if (!s.hit.has(e.id)) this.hit(e, s.who, s.dmg * 0.6, s.el, 3, 0.2);
      }
      if (boom) s.life = 0;
    }
    for (const s of this.shots) if (s.life <= 0) this.vfx.remove(s.obj);
    this.shots = this.shots.filter((s) => s.life > 0);
  }

  private runFields(dt: number): void {
    for (const f of this.fields) {
      f.t += dt;
      f.next -= dt;
      const inside = this.enemies.near(f.pos, f.r);
      if (f.pull)
        for (const e of inside) {
          const d = f.pos.clone().sub(e.pos).setY(0);
          if (d.length() > 0.8) e.pos.addScaledVector(d.normalize(), f.pull * dt);
        }
      if (f.next <= 0) {
        f.next = f.tick;
        for (const e of inside) this.hit(e, f.who, f.dmg, f.el, 0.5, 0.15);
        if (f.heal && this.player.pos.distanceTo(f.pos) < f.r + 1) for (const m of this.party.members) if (m.hp > 0) m.hp = Math.min(m.maxHp, m.hp + m.maxHp * f.heal);
      }
    }
    this.fields = this.fields.filter((f) => f.t < f.life);
  }

  private runRains(dt: number): void {
    for (const r of this.rains) {
      r.next -= dt;
      while (r.next <= 0 && r.left > 0) {
        r.next += r.every;
        r.left--;
        const a = Math.random() * Math.PI * 2;
        const d = Math.sqrt(Math.random()) * r.r;
        const at = r.pos.clone().add(new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d));
        at.y = this.player.t.height(at.x, at.z);
        this.vfx.pillar(at, 0.4, r.el ? ELEMENT_COLOR[r.el] : 0xffaa40, 14);
        for (const e of this.enemies.near(at, 2.2)) this.hit(e, r.who, r.dmg, r.el, 1, 0.2);
      }
    }
    this.rains = this.rains.filter((r) => r.left > 0);
  }

  hurtPlayer(dmg: number, from: THREE.Vector3, el?: Element): void {
    if (this.iframes > 0) {
      this.popups.push({ pos: this.player.pos.clone().add(new THREE.Vector3(0, 2.2, 0)), text: "회피", color: "#ffffff", size: 18 });
      return;
    }
    const m = this.party.cur;
    if (m.hp <= 0) return;
    const d = Math.max(1, dmg * (100 / (100 + m.def_)) * (0.9 + Math.random() * 0.2));
    m.hp = Math.max(0, m.hp - d);
    this.iframes = 0.35;
    this.player.shake = Math.max(this.player.shake, 0.35);
    const away = this.player.pos.clone().sub(from).setY(0).normalize();
    this.player.vel.addScaledVector(away, 5);
    m.anim.play("hit");
    this.popups.push({ pos: this.player.pos.clone().add(new THREE.Vector3(0, 2.1, 0)), text: String(Math.round(d)), color: el ? "#" + ELEMENT_COLOR[el].toString(16).padStart(6, "0") : "#ff6a5a", size: 22 });
    this.inCombat = 3;
    if (m.hp <= 0) {
      m.anim.play("dead");
      this.onMemberDown?.(m);
      setTimeout(() => {
        if (!this.party.next()) this.onWipe?.();
      }, 900);
    }
  }
}
