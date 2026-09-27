/**
 * The skeleton shared by the sculptor (which weights every vertex to it) and the runtime
 * (which animates it): the body joints the animator knows, and spring bones for a ponytail,
 * a cape, the sash ends and the hanging sleeves. Positions are for the rest pose (arms
 * down); the mesh is sculpted in an A-pose so arms and body never touch, and bound there.
 */
import type { V3 } from "./sdf";

export const APOSE = (38 * Math.PI) / 180;

export interface BoneDef {
  name: string;
  parent: number;
  /** World position in the rest pose (arms hanging). */
  at: V3;
}

export interface Proportions {
  fem: boolean;
  bulk: number;
  legLen: number;
  shW: number;
  upper: number;
  fore: number;
  headR: number;
}

export function proportions(fem: boolean, bulk: number): Proportions {
  return { fem, bulk, legLen: fem ? 0.9 : 0.92, shW: (fem ? 0.165 : 0.2) * bulk, upper: fem ? 0.27 : 0.3, fore: fem ? 0.24 : 0.27, headR: fem ? 0.112 : 0.114 };
}

export function skeleton(P: Proportions): BoneDef[] {
  const b: BoneDef[] = [];
  const add = (name: string, parent: string | null, at: V3) => {
    b.push({ name, parent: parent ? b.findIndex((x) => x.name === parent) : -1, at });
  };
  const hy = P.legLen + 0.06;
  add("hips", null, [0, hy, 0]);
  add("spine", "hips", [0, hy + 0.1, 0]);
  add("chest", "spine", [0, hy + 0.28, 0]);
  add("neck", "chest", [0, hy + 0.55, 0]);
  add("head", "neck", [0, hy + 0.63, 0.01]);
  for (const [s, sd] of [["L", 1], ["R", -1]] as [string, number][]) {
    add(`sh${s}`, "chest", [sd * P.shW, hy + 0.5, 0]);
    add(`arm${s}`, `sh${s}`, [sd * (P.shW + 0.03), hy + 0.5, 0]);
    add(`fore${s}`, `arm${s}`, [sd * (P.shW + 0.03), hy + 0.5 - P.upper, 0]);
    add(`hand${s}`, `fore${s}`, [sd * (P.shW + 0.03), hy + 0.5 - P.upper - P.fore, 0]);
    add(`slv${s}`, `fore${s}`, [sd * (P.shW + 0.03), hy + 0.5 - P.upper - P.fore * 0.5, 0]);
  }
  for (const [s, sd] of [["L", 1], ["R", -1]] as [string, number][]) {
    add(`thigh${s}`, "hips", [sd * 0.1, hy - 0.02, 0]);
    add(`shin${s}`, `thigh${s}`, [sd * 0.1, hy - 0.02 - P.legLen * 0.5, 0]);
    add(`foot${s}`, `shin${s}`, [sd * 0.1, hy - 0.02 - P.legLen * 0.95, 0]);
  }
  // Ponytail from the back of the crown.
  const hc: V3 = [0, hy + 0.63 + P.headR * 0.95, 0.01];
  add("pony0", "head", [0, hc[1] + P.headR * 0.6, hc[2] - P.headR * 0.85]);
  for (let k = 1; k < 4; k++) add(`pony${k}`, `pony${k - 1}`, [0, hc[1] + P.headR * 0.6 - k * 0.14, hc[2] - P.headR * 1.1 - k * 0.02]);
  // Twin tails.
  for (const [s, sd] of [["L", 1], ["R", -1]] as [string, number][]) {
    add(`twin${s}0`, "head", [sd * P.headR * 0.9, hc[1] + P.headR * 0.5, hc[2] - P.headR * 0.3]);
    for (let k = 1; k < 3; k++) add(`twin${s}${k}`, `twin${s}${k - 1}`, [sd * P.headR * 1.1, hc[1] + P.headR * 0.5 - k * 0.14, hc[2] - P.headR * 0.4]);
  }
  // Cape from the shoulders.
  add("cape0", "chest", [0, hy + 0.48, -0.15 * P.bulk]);
  for (let k = 1; k < 4; k++) add(`cape${k}`, `cape${k - 1}`, [0, hy + 0.48 - k * 0.3, -0.17 * P.bulk - k * 0.02]);
  // Sash ends.
  add("sash0", "hips", [0.06, hy + 0.02, 0.13 * P.bulk]);
  for (let k = 1; k < 3; k++) add(`sash${k}`, `sash${k - 1}`, [0.06, hy + 0.02 - k * 0.12, 0.135 * P.bulk]);
  return b;
}

export function boneIndex(b: BoneDef[], name: string): number {
  const i = b.findIndex((x) => x.name === name);
  if (i < 0) throw new Error(`no bone ${name}`);
  return i;
}

/** Where a rest-pose point on an arm sits in the A-pose (rotated out about the shoulder). */
export function toApose(p: V3, sd: number, shoulder: V3): V3 {
  const a = sd * APOSE;
  const x = p[0] - shoulder[0];
  const y = p[1] - shoulder[1];
  // Rotation about z: a limb pointing down swings outward.
  return [shoulder[0] + x * Math.cos(a) - y * Math.sin(a), shoulder[1] + x * Math.sin(a) + y * Math.cos(a), p[2]];
}
