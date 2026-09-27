/**
 * Procedural animation. Locomotion is computed, not stored: a stride phase advanced by
 * distance drives legs, arms, hip bob and lean, blended from idle breathing to a walk, a run
 * and a sprint; in the air the body tucks or opens into a glide. Combat moves are short
 * keyframed clips per weapon class (polearm sweeps and thrusts, quick sword cuts, fan
 * gestures, a drawn bow) laid over the locomotion with a fade in and out. Hair, sash ends and
 * tassels are damped springs driven by the body's acceleration; capes and skirts bend in
 * their vertex shaders from speed and leg swing. The eyes blink.
 */
import * as THREE from "three";
import { WEAPON_CLASS, type WeaponClass } from "./weapon";
import { JOINTS, type Joint, type Rig } from "./model";

const D = Math.PI / 180;
type R3 = [number, number, number];
export type Pose = Partial<Record<Joint | "body" | "wpn", R3>>;
export interface Clip {
  dur: number;
  keys: [number, Pose][];
  /** Root-motion lunges: [t0, t1, metres forward]. */
  lunge?: [number, number, number][];
  /** Show the weapon during this clip. */
  armed?: boolean;
  /** Upper body only (legs keep walking). */
  upper?: boolean;
  /** Vertical hop: [t0, t1, height]. */
  hop?: [number, number, number];
}

const P = (x: number, y = 0, z = 0): R3 => [x * D, y * D, z * D];

/** Idle/hold poses per weapon class (weapon out). */
const HOLD: Record<WeaponClass, Pose> = {
  polearm: { armR: P(-20, 0, -12), foreR: P(-70, 20, 0), wpn: P(90, 0, -10), armL: P(-25, 0, 18), foreL: P(-50, -20, 0), chest: P(0, -10, 0) },
  sword: { armR: P(-10, 0, -14), foreR: P(-35, 0, 0), wpn: P(90, 0, 25), armL: P(-5, 0, 12), foreL: P(-25, 0, 0) },
  catalyst: { armR: P(-30, 0, -10), foreR: P(-95, 30, 0), wpn: P(70, 0, 0), armL: P(-10, 0, 10), foreL: P(-60, -20, 0) },
  bow: { armL: P(-15, 0, 12), foreL: P(-20, 0, 0), wpn: P(90, 0, 0), armR: P(-5, 0, -10), foreR: P(-15, 0, 0) },
};

/** Clips: attacks by class, skills and bursts by name. */
function clips(cls: WeaponClass): Record<string, Clip> {
  const c: Record<string, Clip> = {};
  if (cls === "polearm") {
    c.atk0 = { dur: 0.42, armed: true, lunge: [[0.05, 0.18, 0.8]], keys: [
      [0, { chest: P(0, 40, 0), armR: P(-150, 0, -30), foreR: P(-40, 0, 0), wpn: P(90, 0, 40), armL: P(-80, 0, 30), foreL: P(-60, 0, 0) }],
      [0.14, { chest: P(10, -45, 0), armR: P(-70, 0, 40), foreR: P(-10, 0, 0), wpn: P(90, 0, -60), armL: P(-60, 0, 10), foreL: P(-40, 0, 0), hips: P(10, -20, 0) }],
      [0.42, { chest: P(5, -30, 0), armR: P(-50, 0, 20), foreR: P(-40, 0, 0), wpn: P(90, 0, -40), armL: P(-40, 0, 10), foreL: P(-50, 0, 0) }],
    ] };
    c.atk1 = { dur: 0.42, armed: true, lunge: [[0.05, 0.18, 0.8]], keys: [
      [0, { chest: P(0, -50, 0), armR: P(-90, 0, 50), foreR: P(-20, 0, 0), wpn: P(90, 0, -70), armL: P(-70, 0, 0), foreL: P(-50, 0, 0) }],
      [0.15, { chest: P(10, 45, 0), armR: P(-95, 0, -60), foreR: P(-10, 0, 0), wpn: P(90, 0, 60), armL: P(-60, 0, 30), foreL: P(-30, 0, 0), hips: P(10, 20, 0) }],
      [0.42, { chest: P(5, 30, 0), armR: P(-60, 0, -30), foreR: P(-40, 0, 0), wpn: P(90, 0, 40), armL: P(-40, 0, 20), foreL: P(-40, 0, 0) }],
    ] };
    c.atk2 = { dur: 0.46, armed: true, lunge: [[0.08, 0.2, 1.4]], keys: [
      [0, { chest: P(-5, 35, 0), armR: P(-40, 0, -20), foreR: P(-110, 0, 0), wpn: P(60, 0, 0), armL: P(-60, 20, 20), foreL: P(-80, 0, 0), thighR: P(20), thighL: P(-30) }],
      [0.14, { chest: P(15, -25, 0), armR: P(-95, 0, 0), foreR: P(-5, 0, 0), wpn: P(90, 0, 0), armL: P(-85, 0, -10), foreL: P(-20, 0, 0), thighL: P(-50), shinL: P(40), thighR: P(30), hips: P(15) }],
      [0.46, { chest: P(5, -10, 0), armR: P(-60, 0, -10), foreR: P(-50, 0, 0), wpn: P(90, 0, 0), armL: P(-50, 0, 10), foreL: P(-50, 0, 0) }],
    ] };
    c.atk3 = { dur: 0.62, armed: true, lunge: [[0.1, 0.3, 1.6]], hop: [0.05, 0.32, 0.9], keys: [
      [0, { chest: P(-20, 10, 0), armR: P(-170, 0, -10), foreR: P(-20, 0, 0), wpn: P(90, 0, 0), armL: P(-160, 0, 20), foreL: P(-20, 0, 0), thighL: P(-40), shinL: P(60), thighR: P(-10), shinR: P(40) }],
      [0.28, { chest: P(35, 0, 0), armR: P(-50, 0, 0), foreR: P(-10, 0, 0), wpn: P(150, 0, 0), armL: P(-50, 0, 0), foreL: P(-20, 0, 0), hips: P(20), thighL: P(-60), shinL: P(70), thighR: P(20), shinR: P(40) }],
      [0.62, { chest: P(15, 0, 0), armR: P(-40, 0, -10), foreR: P(-50, 0, 0), wpn: P(110, 0, 0), armL: P(-40, 0, 10), foreL: P(-50, 0, 0) }],
    ] };
    c.atk4 = { dur: 0.6, armed: true, keys: [
      [0, { body: P(0, 0, 0), armR: P(-90, 0, -60), foreR: P(-10, 0, 0), wpn: P(90, 0, 80), armL: P(-90, 0, 60), foreL: P(-10, 0, 0) }],
      [0.4, { body: P(0, -360, 0), armR: P(-90, 0, -60), foreR: P(-10, 0, 0), wpn: P(90, 0, 80), armL: P(-90, 0, 60), foreL: P(-10, 0, 0) }],
      [0.6, { body: P(0, -360, 0), armR: P(-50, 0, -20), foreR: P(-50, 0, 0), wpn: P(90, 0, 40), armL: P(-40, 0, 20), foreL: P(-40, 0, 0) }],
    ] };
  } else if (cls === "sword") {
    const cut = (from: number, to: number, lunge = 0.5): Clip => ({ dur: 0.3, armed: true, lunge: [[0.03, 0.12, lunge]], keys: [
      [0, { chest: P(0, from * 0.4, 0), armR: P(-120, 0, from < 0 ? 40 : -40), foreR: P(-50, 0, 0), wpn: P(90, 0, from), armL: P(-40, 0, 20), foreL: P(-60, 0, 0) }],
      [0.1, { chest: P(8, to * 0.4, 0), armR: P(-70, 0, to < 0 ? 40 : -30), foreR: P(-5, 0, 0), wpn: P(90, 0, to), armL: P(-30, 0, 20), foreL: P(-40, 0, 0) }],
      [0.3, { chest: P(4, to * 0.3, 0), armR: P(-50, 0, -10), foreR: P(-40, 0, 0), wpn: P(90, 0, to * 0.5), armL: P(-20, 0, 15), foreL: P(-40, 0, 0) }],
    ] });
    c.atk0 = cut(70, -60);
    c.atk1 = cut(-70, 60);
    c.atk2 = cut(80, -80, 0.8);
    c.atk3 = { ...cut(-40, 90, 0.8), keys: [
      [0, { chest: P(-10, 0, 0), armR: P(-170, 0, 0), foreR: P(-10, 0, 0), wpn: P(90, 0, 0), armL: P(-170, 0, 0), foreL: P(-10, 0, 0) }],
      [0.12, { chest: P(30, 0, 0), armR: P(-60, 0, 0), foreR: P(0, 0, 0), wpn: P(150, 0, 0), armL: P(-60, 0, 0), foreL: P(0, 0, 0), hips: P(15) }],
      [0.36, { chest: P(10, 0, 0), armR: P(-40, 0, -10), foreR: P(-40, 0, 0), wpn: P(100, 0, 0), armL: P(-30, 0, 10), foreL: P(-40, 0, 0) }],
    ], dur: 0.36 };
    c.atk4 = { dur: 0.5, armed: true, lunge: [[0.05, 0.3, 2]], keys: [
      [0, { body: P(0, 0, 0), armR: P(-90, 0, -80), foreR: P(0), wpn: P(90, 0, 90), armL: P(-90, 0, 80), foreL: P(0) }],
      [0.35, { body: P(0, -360, 0), armR: P(-90, 0, -80), foreR: P(0), wpn: P(90, 0, 90), armL: P(-90, 0, 80), foreL: P(0) }],
      [0.5, { body: P(0, -360, 0), armR: P(-40, 0, -20), foreR: P(-40), wpn: P(90, 0, 30), armL: P(-30, 0, 20), foreL: P(-40) }],
    ] };
  } else if (cls === "catalyst") {
    const flick = (side: number): Clip => ({ dur: 0.36, armed: true, upper: true, keys: [
      [0, { chest: P(0, side * 30, 0), armR: P(-60, 0, side * 40 - 20), foreR: P(-90, 0, 0), wpn: P(70, 0, side * 30), armL: P(-20, 0, 20), foreL: P(-60, 0, 0) }],
      [0.12, { chest: P(5, -side * 30, 0), armR: P(-95, 0, -side * 50 - 10), foreR: P(-10, 0, 0), wpn: P(90, 0, -side * 40), armL: P(-40, 0, 30), foreL: P(-40, 0, 0) }],
      [0.36, { chest: P(0, -side * 10, 0), armR: P(-40, 0, -10), foreR: P(-70, 0, 0), wpn: P(70, 0, 0), armL: P(-20, 0, 15), foreL: P(-50, 0, 0) }],
    ] });
    c.atk0 = flick(1);
    c.atk1 = flick(-1);
    c.atk2 = { dur: 0.55, armed: true, upper: true, keys: [
      [0, { chest: P(-10, 0, 0), armR: P(-160, 0, -20), foreR: P(-20, 0, 0), wpn: P(90, 0, 0), armL: P(-160, 0, 20), foreL: P(-20, 0, 0) }],
      [0.2, { chest: P(15, 0, 0), armR: P(-90, 0, -40), foreR: P(0, 0, 0), wpn: P(90, 0, 0), armL: P(-90, 0, 40), foreL: P(0, 0, 0) }],
      [0.55, { chest: P(0, 0, 0), armR: P(-40, 0, -10), foreR: P(-70, 0, 0), wpn: P(70, 0, 0), armL: P(-20, 0, 15), foreL: P(-50, 0, 0) }],
    ] };
  } else {
    const shot: Clip = { dur: 0.42, armed: true, upper: true, keys: [
      [0, { chest: P(0, 60, 0), armL: P(-90, 0, 0), foreL: P(0, 0, 0), wpn: P(90, 0, 0), armR: P(-90, 0, -10), foreR: P(-150, 0, 0), head: P(0, -50, 0) }],
      [0.14, { chest: P(0, 70, 0), armL: P(-90, 0, 0), foreL: P(0, 0, 0), wpn: P(90, 0, 0), armR: P(-80, 30, -30), foreR: P(-140, 0, 0), head: P(0, -60, 0) }],
      [0.2, { chest: P(0, 70, 0), armL: P(-90, 0, 0), foreL: P(0, 0, 0), wpn: P(90, 0, 0), armR: P(-60, 30, -70), foreR: P(-30, 0, 0), head: P(0, -60, 0) }],
      [0.42, { chest: P(0, 40, 0), armL: P(-60, 0, 10), foreL: P(-20, 0, 0), wpn: P(90, 0, 0), armR: P(-30, 0, -20), foreR: P(-30, 0, 0), head: P(0, -30, 0) }],
    ] };
    c.atk0 = shot;
    c.atk1 = shot;
    c.atk2 = shot;
    c.atk3 = { ...shot, dur: 0.5 };
  }
  // Skills and bursts, shared.
  const armedIdle = HOLD[cls];
  c.spin = { dur: 0.8, armed: true, keys: [
    [0, { body: P(0, 0, 0), armR: P(-90, 0, -70), foreR: P(-10), wpn: P(90, 0, 90), armL: P(-90, 0, 70), foreL: P(-10), hips: P(-5) }],
    [0.55, { body: P(0, -540, 0), armR: P(-90, 0, -70), foreR: P(-10), wpn: P(90, 0, 90), armL: P(-90, 0, 70), foreL: P(-10), hips: P(10) }],
    [0.8, { body: P(0, -720, 0), ...armedIdle }],
  ] };
  c.spin3 = { dur: 2.0, armed: true, keys: [
    [0, { body: P(0, 0, 0), armR: P(-90, 0, -70), foreR: P(-10), wpn: P(90, 0, 90), armL: P(-90, 0, 70), foreL: P(-10) }],
    [1.75, { body: P(0, -2160, 0), armR: P(-90, 0, -70), foreR: P(-10), wpn: P(90, 0, 90), armL: P(-90, 0, 70), foreL: P(-10) }],
    [2.0, { body: P(0, -2160, 0), ...armedIdle }],
  ] };
  c.sweep = { dur: 0.9, armed: true, lunge: [[0.2, 0.4, 1.5]], keys: [
    [0, { chest: P(-5, 70, 0), hips: P(0, 30, 0), armR: P(-100, 0, -80), foreR: P(-10, 0, 0), wpn: P(90, 0, 90), armL: P(-80, 0, 40), foreL: P(-30, 0, 0), thighL: P(-30), shinL: P(30) }],
    [0.25, { chest: P(-5, 80, 0), hips: P(0, 35, 0), armR: P(-100, 0, -90), foreR: P(-10, 0, 0), wpn: P(90, 0, 100), armL: P(-80, 0, 40), foreL: P(-30, 0, 0), thighL: P(-40), shinL: P(40) }],
    [0.45, { chest: P(15, -80, 0), hips: P(10, -30, 0), armR: P(-90, 0, 70), foreR: P(0, 0, 0), wpn: P(90, 0, -90), armL: P(-60, 0, 20), foreL: P(-20, 0, 0), thighL: P(-50), shinL: P(50), thighR: P(30) }],
    [0.9, { ...armedIdle, chest: P(5, -30, 0) }],
  ] };
  c.thrust = { dur: 0.7, armed: true, keys: [
    [0, { chest: P(-10, 40, 0), armR: P(-30, 0, -20), foreR: P(-120, 0, 0), wpn: P(60, 0, 0), armL: P(-60, 20, 30), foreL: P(-90, 0, 0), thighR: P(30), thighL: P(-40), shinL: P(50) }],
    [0.15, { chest: P(25, -20, 0), hips: P(25), armR: P(-95, 0, 0), foreR: P(0, 0, 0), wpn: P(90, 0, 0), armL: P(-40, 0, 40), foreL: P(-20, 0, 0), thighL: P(-70), shinL: P(60), thighR: P(40), shinR: P(20) }],
    [0.45, { chest: P(25, -20, 0), hips: P(25), armR: P(-95, 0, 0), foreR: P(0, 0, 0), wpn: P(90, 0, 0), armL: P(-40, 0, 40), foreL: P(-20, 0, 0), thighL: P(-70), shinL: P(60), thighR: P(40), shinR: P(20) }],
    [0.7, armedIdle],
  ] };
  c.dashes = { dur: 2.2, armed: true, keys: [
    [0, { chest: P(20, 40, 0), hips: P(20), armR: P(-60, 0, -60), foreR: P(-20), wpn: P(90, 0, 70), armL: P(-40, 0, 40), foreL: P(-40), thighL: P(-50), shinL: P(60), thighR: P(30) }],
    [2.0, { chest: P(20, 40, 0), hips: P(20), armR: P(-60, 0, -60), foreR: P(-20), wpn: P(90, 0, 70), armL: P(-40, 0, 40), foreL: P(-40), thighL: P(-50), shinL: P(60), thighR: P(30) }],
    [2.2, armedIdle],
  ] };
  c.charge = { ...c.dashes, dur: 1.4, keys: [c.dashes.keys[0], [1.2, c.dashes.keys[1][1]], [1.4, armedIdle]] };
  c.roar = { dur: 0.9, armed: false, keys: [
    [0, { chest: P(-20, 0, 0), head: P(-20), armR: P(-30, 0, -70), foreR: P(-70), armL: P(-30, 0, 70), foreL: P(-70), thighL: P(-20, 0, 10), thighR: P(-20, 0, -10), shinL: P(30), shinR: P(30) }],
    [0.35, { chest: P(25, 0, 0), head: P(15), armR: P(-10, 0, -40), foreR: P(-110), armL: P(-10, 0, 40), foreL: P(-110), thighL: P(-30, 0, 20), thighR: P(-30, 0, -20), shinL: P(50), shinR: P(50), hips: P(10) }],
    [0.9, { chest: P(10), armR: P(-10, 0, -20), foreR: P(-40), armL: P(-10, 0, 20), foreL: P(-40) }],
  ] };
  c.leapstrike = { dur: 1.4, armed: true, hop: [0.05, 0.7, 5], keys: [
    [0, { chest: P(-10), armR: P(-170, 0, 0), foreR: P(-10), wpn: P(90, 0, 0), armL: P(-170, 0, 0), foreL: P(-10), thighL: P(-80), shinL: P(110), thighR: P(-60), shinR: P(100) }],
    [0.55, { chest: P(-20), armR: P(-180, 0, 0), foreR: P(0), wpn: P(90, 0, 0), armL: P(-180, 0, 0), foreL: P(0), thighL: P(-90), shinL: P(120), thighR: P(-70), shinR: P(110) }],
    [0.72, { chest: P(40), hips: P(30), armR: P(-40), foreR: P(0), wpn: P(170, 0, 0), armL: P(-40), foreL: P(0), thighL: P(-80), shinL: P(90), thighR: P(10), shinR: P(80) }],
    [1.4, armedIdle],
  ] };
  c.cast = { dur: 0.8, armed: true, upper: true, keys: [
    [0, { armR: P(-40, 0, -20), foreR: P(-110, 30, 0), wpn: P(70), armL: P(-40, 0, 20), foreL: P(-110, -30, 0), chest: P(-5) }],
    [0.35, { armR: P(-100, 0, -30), foreR: P(-10, 0, 0), wpn: P(90), armL: P(-70, 0, 40), foreL: P(-20, 0, 0), chest: P(10) }],
    [0.8, HOLD.catalyst],
  ] };
  c.raise = { dur: 1.2, armed: true, keys: [
    [0, { armR: P(-20, 0, -10), foreR: P(-60), wpn: P(90), armL: P(-20, 0, 10), foreL: P(-60), chest: P(10), head: P(15) }],
    [0.5, { armR: P(-175, 0, -10), foreR: P(0), wpn: P(90, 0, 0), armL: P(-20, 0, 40), foreL: P(-30), chest: P(-15), head: P(-30) }],
    [0.9, { armR: P(-175, 0, -10), foreR: P(0), wpn: P(90, 0, 0), armL: P(-20, 0, 40), foreL: P(-30), chest: P(-15), head: P(-30) }],
    [1.2, armedIdle],
  ] };
  c.slashwave = { dur: 0.6, armed: true, lunge: [[0.05, 0.2, 0.8]], keys: [
    [0, { chest: P(0, 60, 0), armR: P(-130, 0, -60), foreR: P(-20), wpn: P(90, 0, 70), armL: P(-40, 0, 30), foreL: P(-50) }],
    [0.22, { chest: P(10, -60, 0), armR: P(-80, 0, 70), foreR: P(0), wpn: P(90, 0, -80), armL: P(-30, 0, 20), foreL: P(-40) }],
    [0.6, armedIdle],
  ] };
  c.aim = { dur: 0.8, armed: true, upper: true, keys: [
    [0, { chest: P(0, 60, 0), armL: P(-90), foreL: P(0), wpn: P(90), armR: P(-90, 0, -10), foreR: P(-150), head: P(0, -50, 0) }],
    [0.45, { chest: P(0, 72, 0), armL: P(-90), foreL: P(0), wpn: P(90), armR: P(-70, 40, -40), foreR: P(-150), head: P(0, -62, 0) }],
    [0.5, { chest: P(0, 72, 0), armL: P(-90), foreL: P(0), wpn: P(90), armR: P(-50, 40, -80), foreR: P(-20), head: P(0, -62, 0) }],
    [0.8, HOLD.bow],
  ] };
  c.skyshot = { dur: 1.0, armed: true, keys: [
    [0, { chest: P(-30, 60, 0), armL: P(-160), foreL: P(0), wpn: P(90), armR: P(-150, 0, -10), foreR: P(-140), head: P(-30, -40, 0) }],
    [0.45, { chest: P(-35, 60, 0), armL: P(-165), foreL: P(0), wpn: P(90), armR: P(-140, 30, -30), foreR: P(-150), head: P(-35, -40, 0) }],
    [0.52, { chest: P(-35, 60, 0), armL: P(-165), foreL: P(0), wpn: P(90), armR: P(-120, 30, -70), foreR: P(-20), head: P(-35, -40, 0) }],
    [1.0, HOLD.bow],
  ] };
  c.hit = { dur: 0.35, keys: [
    [0, { chest: P(-25, 0, 0), head: P(-20), armL: P(-20, 0, 30), armR: P(-20, 0, -30), hips: P(-10) }],
    [0.35, {}],
  ] };
  c.dead = { dur: 0.9, keys: [
    [0, { hips: P(0), chest: P(0) }],
    [0.5, { hips: P(-80, 0, 0), chest: P(-10), head: P(-20), armL: P(-160, 0, 30), armR: P(-160, 0, -30), thighL: P(-80), thighR: P(-70), shinL: P(20), shinR: P(40) }],
    [0.9, { hips: P(-88, 0, 0), chest: P(-5), head: P(-10), armL: P(-170, 0, 40), armR: P(-170, 0, -40), thighL: P(-85), thighR: P(-80), shinL: P(10), shinR: P(20) }],
  ] };
  // A standing portrait pose: the weapon upright at the side, not across the face.
  const show: Pose =
    cls === "polearm"
      ? { armR: P(-12, 0, -22), foreR: P(-75, 10, 0), wpn: P(90, 0, 8), armL: P(-8, 0, 14), foreL: P(-30, 0, 0) }
      : cls === "sword"
        ? { armR: P(-8, 0, -18), foreR: P(-30, 0, 0), wpn: P(60, 0, 40), armL: P(-8, 0, 14), foreL: P(-30, 0, 0) }
        : armedIdle;
  c.pose = { dur: 2.4, armed: true, keys: [
    [0, { ...show, chest: P(0, -15, 0), head: P(0, 12, 0) }],
    [2.4, { ...show, chest: P(0, -15, 0), head: P(0, 12, 0) }],
  ] };
  return c;
}

export interface MoveState {
  /** Horizontal speed, m/s. */
  speed: number;
  grounded: boolean;
  vy: number;
  gliding: boolean;
  /** Turning rate (rad/s), for leaning into turns. */
  turn: number;
  /** World velocity (for springs). */
  vel: THREE.Vector3;
  sprint: boolean;
  climbing?: boolean;
  swimming?: boolean;
  climbPhase?: number;
}

export class Animator {
  readonly cls: WeaponClass;
  private readonly clips: Record<string, Clip>;
  private phase = 0;
  private blinkT = 2;
  private action: { name: string; clip: Clip; t: number; rate: number } | null = null;
  private armedT = 0;
  private cur = new Map<string, THREE.Quaternion>();
  private readonly tmpE = new THREE.Euler();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly prevVel = new THREE.Vector3();
  private t = 0;
  private layK = 0;
  private hipBase: number;
  private weaponBase: THREE.Euler;
  /** Root motion accumulated this frame (metres forward, metres up). */
  lunge = 0;
  hop = 0;
  weaponShown = 1;
  /** Keep the weapon in hand (showcase). */
  alwaysArmed = false;

  constructor(readonly rig: Rig) {
    this.cls = WEAPON_CLASS[rig.look.weapon.kind];
    this.clips = clips(this.cls);
    this.hipBase = rig.j.hips.position.y;
    if (this.cls === "bow") {
      rig.j.handL.add(rig.weapon);
    }
    this.weaponBase = rig.weapon.rotation.clone();
    for (const k of [...JOINTS, "body", "wpn"]) this.cur.set(k, new THREE.Quaternion());
  }

  has(name: string): boolean {
    return !!this.clips[name];
  }

  play(name: string, rate = 1): number {
    const clip = this.clips[name];
    if (!clip) return 0;
    this.action = { name, clip, t: 0, rate };
    if (clip.armed) this.armedT = 4;
    return clip.dur / rate;
  }

  get busy(): string | null {
    return this.action?.name ?? null;
  }
  get actionT(): number {
    return this.action ? this.action.t : 0;
  }

  stop(): void {
    this.action = null;
  }

  private sample(clip: Clip, t: number): Pose {
    const keys = clip.keys;
    let i = 0;
    while (i + 1 < keys.length && keys[i + 1][0] <= t) i++;
    const [t0, a] = keys[i];
    const [t1, b] = keys[Math.min(keys.length - 1, i + 1)];
    const u = t1 > t0 ? Math.min(1, (t - t0) / (t1 - t0)) : 1;
    const e = u * u * (3 - 2 * u);
    const out: Pose = {};
    const names = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof Pose>;
    for (const n of names) {
      const va = a[n] ?? b[n]!;
      const vb = b[n] ?? a[n]!;
      out[n] = [va[0] + (vb[0] - va[0]) * e, va[1] + (vb[1] - va[1]) * e, va[2] + (vb[2] - va[2]) * e];
    }
    return out;
  }

  update(dt: number, m: MoveState): void {
    this.t += dt;
    const rig = this.rig;
    const j = rig.j;
    // ------------------------------------------------ locomotion
    const sp = m.speed;
    const run = Math.min(1, Math.max(0, (sp - 2) / 3.5));
    const walk = Math.min(1, sp / 1.6);
    const stride = 1.1 + run * 0.9;
    this.phase += (sp / stride) * Math.PI * dt;
    const p = this.phase;
    const A = (0.45 + run * 0.35) * walk;
    const loco: Pose = {};
    const breathe = Math.sin(this.t * 2.2) * 0.03;
    loco.chest = [breathe + run * 0.12 + (m.sprint ? 0.1 : 0), Math.sin(p) * 0.12 * walk, -m.turn * 0.03];
    loco.spine = [run * 0.08, -Math.sin(p) * 0.06 * walk, 0];
    loco.head = [-run * 0.1, -Math.sin(p) * 0.05 * walk, 0];
    loco.hips = [run * 0.08, 0, m.turn * 0.04];
    loco.thighL = [-Math.sin(p) * A, 0, 0.03];
    loco.thighR = [Math.sin(p) * A, 0, -0.03];
    const kneeL = Math.max(0, Math.sin(p - 1.3)) * (0.9 + run * 0.9) * walk + 0.05;
    const kneeR = Math.max(0, Math.sin(p + Math.PI - 1.3)) * (0.9 + run * 0.9) * walk + 0.05;
    loco.shinL = [kneeL, 0, 0];
    loco.shinR = [kneeR, 0, 0];
    loco.footL = [Math.sin(p) * 0.3 * walk - kneeL * 0.3, 0, 0];
    loco.footR = [-Math.sin(p) * 0.3 * walk - kneeR * 0.3, 0, 0];
    const armA = (0.35 + run * 0.5) * walk;
    loco.armL = [Math.sin(p) * armA, 0, 0.12 + run * 0.1];
    loco.armR = [-Math.sin(p) * armA, 0, -0.12 - run * 0.1];
    loco.foreL = [-0.25 - run * 0.9, 0, 0];
    loco.foreR = [-0.25 - run * 0.9, 0, 0];
    let bob = walk * (0.5 - 0.5 * Math.cos(p * 2)) * (0.03 + run * 0.04);
    let lay = 0;
    if (m.climbing) {
      const c = m.climbPhase ?? 0;
      const a = Math.sin(c);
      Object.assign(loco, {
        chest: [0.15, 0, 0], spine: [0.1, 0, 0], head: [-0.35, 0, 0], hips: [0, 0, 0],
        armL: [-2.6 + a * 0.4, 0, 0.35], armR: [-2.6 - a * 0.4, 0, -0.35], foreL: [-0.5 - Math.max(0, a) * 0.6, 0, 0], foreR: [-0.5 - Math.max(0, -a) * 0.6, 0, 0],
        thighL: [-0.9 - a * 0.4, 0, 0.2], thighR: [-0.9 + a * 0.4, 0, -0.2], shinL: [1.3 + a * 0.3, 0, 0], shinR: [1.3 - a * 0.3, 0, 0],
      });
      bob = 0;
    } else if (m.swimming) {
      const c = m.climbPhase ?? 0;
      lay = 1.25;
      Object.assign(loco, {
        head: [-1.0, 0, 0], chest: [0, Math.sin(c) * 0.2, 0],
        armL: [-2.4 + Math.sin(c) * 1.1, 0, 0.5], armR: [-2.4 - Math.sin(c) * 1.1, 0, -0.5], foreL: [-0.3, 0, 0], foreR: [-0.3, 0, 0],
        thighL: [Math.sin(c * 1.6) * 0.35, 0, 0.05], thighR: [-Math.sin(c * 1.6) * 0.35, 0, -0.05], shinL: [0.3, 0, 0], shinR: [0.3, 0, 0],
      });
      bob = 0;
    } else if (!m.grounded) {
      bob = 0;
      if (m.gliding) {
        lay = 1.15;
        Object.assign(loco, { armL: [-0.6, 0, 1.2], armR: [-0.6, 0, -1.2], foreL: [-0.2, 0, 0], foreR: [-0.2, 0, 0], chest: [0.05, 0, m.turn * 0.1], head: [-0.9, 0, 0], thighL: [0.15, 0, 0.12], thighR: [0.05, 0, -0.12], shinL: [0.4, 0, 0], shinR: [0.3, 0, 0] });
      } else {
        const up = m.vy > 0 ? 1 : 0;
        Object.assign(loco, {
          thighL: [-0.9 * up - 0.3, 0, 0.05],
          thighR: [-0.2 * up + 0.2, 0, -0.05],
          shinL: [1.3 * up + 0.4, 0, 0],
          shinR: [0.4, 0, 0],
          armL: [-0.6, 0, 0.5],
          armR: [0.3, 0, -0.5],
          foreL: [-0.8, 0, 0],
          foreR: [-0.4, 0, 0],
        });
      }
    }
    // Weapon out: hold pose on the arms while idle.
    this.armedT -= dt;
    const armed = this.alwaysArmed || this.armedT > 0 || !!this.action?.clip.armed;
    if (armed && !this.action && m.grounded) {
      const h = HOLD[this.cls];
      const k = 1 - run * 0.6;
      for (const [n, v] of Object.entries(h) as [keyof Pose, R3][]) {
        if (n === "wpn") continue;
        const b = loco[n] ?? [0, 0, 0];
        loco[n] = [b[0] + (v[0] - (n.startsWith("arm") || n.startsWith("fore") ? b[0] : 0)) * k, b[1] + v[1] * k, b[2] + (v[2] - (n.startsWith("arm") ? b[2] : 0)) * k];
      }
    }
    // ------------------------------------------------ action overlay
    let pose: Pose = loco;
    let w = 0;
    this.lunge = 0;
    this.hop = 0;
    let wpn: R3 = HOLD[this.cls].wpn ?? [Math.PI / 2, 0, 0];
    let body: R3 = [0, 0, 0];
    if (this.action) {
      const a = this.action;
      const prevT = a.t;
      a.t += dt * a.rate;
      const c = a.clip;
      if (a.t >= c.dur) this.action = null;
      else {
        const s = this.sample(c, a.t);
        w = Math.min(1, a.t / 0.05) * Math.min(1, (c.dur - a.t) / 0.1 + (a.name === "dead" ? 1 : 0));
        if (a.name === "dead") w = 1;
        pose = { ...loco };
        for (const [n, v] of Object.entries(s) as [keyof Pose, R3][]) {
          if (n === "wpn") {
            wpn = v;
            continue;
          }
          if (n === "body") {
            body = v;
            continue;
          }
          if (c.upper && (n.startsWith("thigh") || n.startsWith("shin") || n.startsWith("foot"))) continue;
          const b = loco[n] ?? [0, 0, 0];
          pose[n] = [b[0] + (v[0] - b[0]) * w, b[1] + (v[1] - b[1]) * w, b[2] + (v[2] - b[2]) * w];
        }
        for (const [t0, t1, d] of c.lunge ?? []) {
          const u0 = Math.max(0, Math.min(1, (prevT - t0) / (t1 - t0)));
          const u1 = Math.max(0, Math.min(1, (a.t - t0) / (t1 - t0)));
          this.lunge += (u1 - u0) * d;
        }
        if (c.hop) {
          const [t0, t1, hgt] = c.hop;
          const u = (a.t - t0) / (t1 - t0);
          if (u > 0 && u < 1) this.hop = Math.sin(u * Math.PI) * hgt;
        }
      }
    }
    // ------------------------------------------------ apply (smoothed)
    const k = 1 - Math.exp(-dt * (w > 0.5 ? 40 : 16));
    for (const n of JOINTS) {
      const v = pose[n] ?? [0, 0, 0];
      const r = rig.rest[n];
      this.tmpE.set(r.x + v[0], r.y + v[1], r.z + v[2]);
      this.tmpQ.setFromEuler(this.tmpE);
      const q = this.cur.get(n)!;
      q.slerp(this.tmpQ, k);
      j[n].quaternion.copy(q);
    }
    j.hips.position.y = this.hipBase + bob + (this.action?.name === "dead" ? -0.75 * w : 0);
    rig.body.rotation.y = body[1];
    this.layK += (lay - this.layK) * Math.min(1, dt * 6);
    rig.body.rotation.x = this.layK;
    rig.body.position.y = this.hop + this.layK * 0.55;
    rig.body.position.z = m.climbing ? -0.28 : 0;
    // Weapon: in hand when armed, fading away otherwise.
    const want = armed ? 1 : 0;
    this.weaponShown += (want - this.weaponShown) * Math.min(1, dt * 8);
    const ws = this.weaponShown;
    for (const wg of [rig.weapon, rig.weapon2]) {
      if (!wg) continue;
      wg.visible = ws > 0.05;
      wg.scale.setScalar(Math.max(0.01, ws));
    }
    this.tmpE.set(this.weaponBase.x + wpn[0], this.weaponBase.y + wpn[1], this.weaponBase.z + wpn[2]);
    const wq = this.cur.get("wpn")!;
    wq.slerp(this.tmpQ.setFromEuler(this.tmpE), k);
    rig.weapon.quaternion.copy(wq);
    if (rig.weapon2) rig.weapon2.quaternion.copy(wq);
    // Hanging sleeves point at the ground whatever the arm does.
    if (rig.drapes.length) {
      rig.root.updateMatrixWorld(true);
      const rq = rig.root.getWorldQuaternion(new THREE.Quaternion());
      const pq = new THREE.Quaternion();
      for (const d of rig.drapes) {
        d.parent!.getWorldQuaternion(pq);
        d.quaternion.copy(pq.invert().multiply(rq));
      }
    }
    // ------------------------------------------------ cloth, hair, eyes
    const acc = m.vel.clone().sub(this.prevVel).divideScalar(Math.max(dt, 1e-3));
    this.prevVel.copy(m.vel);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(rig.root.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(rig.root.quaternion);
    const vF = m.vel.dot(fwd);
    const vS = m.vel.dot(right);
    if (rig.skirt) {
      rig.skirt.u.uLegL.value = (pose.thighL ?? [0])[0];
      rig.skirt.u.uLegR.value = (pose.thighR ?? [0])[0];
      rig.skirt.u.uSway.value = Math.max(-0.5, Math.min(1.2, vF * 0.12 + (m.gliding ? 0.8 : 0)));
    }
    if (rig.cape) {
      rig.cape.u.uBack.value += (Math.max(0, Math.min(1.6, vF * 0.16 + (m.grounded ? 0 : 0.6) + (m.gliding ? 0.6 : 0))) - rig.cape.u.uBack.value) * Math.min(1, dt * 5);
      rig.cape.u.uSide.value += (-vS * 0.1 - (m.turn * 0.1) - rig.cape.u.uSide.value) * Math.min(1, dt * 5);
      rig.cape.u.uTime.value = this.t;
    }
    const aF = acc.dot(fwd);
    const aS = acc.dot(right);
    for (const ch of rig.chains) {
      for (let i = 0; i < ch.joints.length; i++) {
        // Target: trail behind motion; springs pull back to rest.
        const tx = ch.rest + Math.max(-1, Math.min(1.2, vF * 0.06 + aF * 0.012 + (m.grounded ? 0 : -m.vy * 0.03))) * (1 + i * 0.3);
        const tz = Math.max(-0.8, Math.min(0.8, -vS * 0.05 - aS * 0.01 - m.turn * 0.05));
        const f = ch.stiff * (1 - i * 0.12);
        ch.vx[i] += ((tx - ch.ax[i]) * f - ch.vx[i] * 7) * dt;
        ch.vz[i] += ((tz - ch.az[i]) * f - ch.vz[i] * 7) * dt;
        ch.ax[i] += ch.vx[i] * dt;
        ch.az[i] += ch.vz[i] * dt;
        const jo = ch.joints[i];
        jo.rotation.x = i === 0 ? ch.ax[i] : (ch.ax[i] - ch.rest) * 0.5 + 0.05;
        jo.rotation.z = ch.az[i] * (i === 0 ? 1 : 0.4);
      }
    }
    this.blinkT -= dt;
    if (this.blinkT < 0) {
      rig.faceMat.map = rig.face.closed;
      if (this.blinkT < -0.12) {
        rig.faceMat.map = rig.face.open;
        this.blinkT = 2 + Math.random() * 3.5;
      }
    }
  }
}
