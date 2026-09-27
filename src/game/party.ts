/**
 * The party: up to four heroes, one on the field at a time. Each keeps its own health, energy
 * and cooldowns; switching swaps the model in a burst of petals. A fallen hero can't be sent
 * out until revived at a beacon.
 */
import * as THREE from "three";
import { Animator } from "../char/anim";
import { buildGlider } from "../char/glider";
import type { Rig } from "../char/model";
import { rigFor } from "../char/skinned";
import { HERO, type HeroDef } from "../data/heroes";

export interface Member {
  def: HeroDef;
  rig: Rig;
  anim: Animator;
  glider: THREE.Group;
  hp: number;
  maxHp: number;
  atk: number;
  def_: number;
  energy: number;
  cdE: number;
  cdQ: number;
  level: number;
  cons: number;
}

export function stats(def: HeroDef, level: number, cons: number): { hp: number; atk: number; def: number } {
  const k = 1 + (level - 1) * 0.085;
  return { hp: Math.round(def.hp * k), atk: Math.round(def.atk * k * (1 + cons * 0.08)), def: Math.round(def.def * k) };
}

export class Party {
  readonly members: Member[] = [];
  active = 0;
  readonly root = new THREE.Group();
  swapT = 0;

  set(list: { id: string; level: number; cons: number }[]): void {
    for (const m of this.members) this.root.remove(m.rig.root);
    this.members.length = 0;
    for (const e of list) {
      const def = HERO[e.id];
      const rig = rigFor(def.id, def.look);
      const anim = new Animator(rig);
      const glider = buildGlider(def.look.cape ?? def.look.robe, def.look.trim);
      rig.j.chest.add(glider);
      glider.position.set(0, 0.35, -0.22);
      const s = stats(def, e.level, e.cons);
      this.members.push({ def, rig, anim, glider, hp: s.hp, maxHp: s.hp, atk: s.atk, def_: s.def, energy: 0, cdE: 0, cdQ: 0, level: e.level, cons: e.cons });
      rig.root.visible = false;
      this.root.add(rig.root);
    }
    this.active = Math.min(this.active, this.members.length - 1);
    this.members[this.active].rig.root.visible = true;
  }

  get cur(): Member {
    return this.members[this.active];
  }

  swap(i: number): boolean {
    if (i === this.active || i >= this.members.length || this.members[i].hp <= 0 || this.swapT > 0) return false;
    this.cur.rig.root.visible = false;
    this.active = i;
    this.cur.rig.root.visible = true;
    this.swapT = 0.8;
    return true;
  }

  /** Move to the next living member (after one falls). */
  next(): boolean {
    for (let k = 1; k <= this.members.length; k++) {
      const i = (this.active + k) % this.members.length;
      if (this.members[i].hp > 0) {
        this.swapT = 0;
        return this.swap(i);
      }
    }
    return false;
  }
}
