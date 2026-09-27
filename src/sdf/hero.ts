/**
 * Sculpting a hero from their look. The body is one smooth form in an A-pose (pelvis, waist
 * and chest flowing together, shoulders into arms, a neck into a small-jawed anime head),
 * with hands that have fingers. Over it the clothes: a 한푸 body with its crossed collar and
 * the under-robe showing at the throat, a sash, bell sleeves open at the cuff with the long
 * hanging sleeve, a pleated skirt that parts with the legs; lamellar armour whose plates are
 * real bumps in the surface, layered pauldrons, tassets, a cape. The hair is a cap with a
 * hairline plus clumps — bangs, side locks, back hair, ponytail, topknot, twin tails, a wild
 * crown — and beards, crowns, helmets, plumes. Every primitive knows its material and bone.
 */
import type { Look } from "../char/model";
import { APOSE, type BoneDef, boneIndex, proportions, type Proportions, skeleton, toApose } from "./rig";
import { add, type BoneW, capsule, chain, clamp, cone, custom, dot, ellipsoid, type Group, len, lerp3, lock, type Mat, mul, norm, type Prim, rbox, rotAxis, Sculpt, smoothstep, sphere, sub, type V3 } from "./sdf";

export const M = { skin: 0, hair: 1, robe: 2, robe2: 3, trim: 4, pants: 5, boots: 6, sash: 7, armor: 8, armorTrim: 9, cape: 10, gear: 11, dark: 12, metal: 13, plume: 14, lip: 15, drape: 16 } as const;

export interface Sculpted {
  S: Sculpt;
  bones: BoneDef[];
  P: Proportions;
  head: V3;
  /** Meshing passes: groups, bounds, cell size. */
  passes: { groups: Group[]; lo: V3; hi: V3; h: number }[];
  /** Where the shader draws collar, V, sash, hems, cuffs, plates (rest-pose metres). */
  garment: Garment;
}

export interface Garment {
  hy: number;
  yN: number;
  yV: number;
  sash: [number, number];
  hem: number;
  capeHem: number;
  armorTop: number;
  armorBot: number;
  tassetHem: number;
  cuffs: { E: V3; dir: V3; reach: number }[];
  drapeY: number;
  armored: boolean;
  fem: boolean;
}

const TAU = Math.PI * 2;

/** Weights along a chain of joints (nearest segment, blended between its two ends). */
function along(p: V3, joints: V3[], bones: number[]): BoneW {
  let best = Infinity;
  let bi = 0;
  let bt = 0;
  for (let i = 0; i + 1 < joints.length; i++) {
    const a = joints[i];
    const ba = sub(joints[i + 1], a);
    const t = clamp(dot(sub(p, a), ba) / dot(ba, ba), 0, 1);
    const d = len(sub(p, add(a, mul(ba, t))));
    if (d < best) {
      best = d;
      bi = i;
      bt = t;
    }
  }
  if (bi + 1 >= bones.length) return [[bones[bi], 1]];
  return [
    [bones[bi], 1 - bt * 0.8],
    [bones[bi + 1], bt * 0.8],
  ];
}

export function sculptHero(L: Look, coarse = false): Sculpted {
  const fem = !!L.female;
  const b = L.bulk ?? 1;
  const P = proportions(fem, b);
  const bones = skeleton(P);
  const B = (n: string) => boneIndex(bones, n);
  const at = (n: string) => bones[B(n)].at;
  const S = new Sculpt();
  const hy = at("hips")[1];
  const R = P.headR;
  const hc: V3 = add(at("head"), [0, R * 0.95, 0]);
  const armored = !!L.armor;
  const wide = L.sleeves !== "fitted";
  const robeLen = L.robeLen ?? 0.62;
  let garment!: Garment;

  // ------------------------------------------------------------------ body
  const body = S.group(0.045, 0);
  const torso = (inflate: number, mat: Mat): Prim[] => {
    const i = inflate;
    const ps: Prim[] = [
      ellipsoid([0, hy + 0.01, -0.005], [0.155 * b + i, 0.115 + i, 0.115 + i], mat, B("hips")),
      ellipsoid([0, hy + 0.15, 0.005], [(fem ? 0.118 : 0.135) * b + i, 0.1 + i, (fem ? 0.088 : 0.095) + i], mat, B("spine")),
      ellipsoid([0, hy + 0.33, 0.0], [(fem ? 0.14 : 0.168) * b + i, 0.13 + i, (fem ? 0.1 : 0.112) + i], mat, (p) => [
        [B("chest"), 1],
        [B("spine"), clamp((hy + 0.3 - p[1]) / 0.1, 0, 1)],
      ]),
    ];
    if (fem) for (const sd of [-1, 1]) ps.push(sphere([sd * 0.052, hy + 0.34, 0.07], 0.05 + i, mat, B("chest")));
    return ps;
  };
  body.prims.push(...torso(0, M.skin));
  body.prims.push(cone([0, hy + 0.47, -0.01], [0, hy + 0.67, 0.012], 0.052, 0.043, M.skin, (p) => [
    [B("neck"), smoothstep(hy + 0.5, hy + 0.62, p[1])],
    [B("chest"), 1 - smoothstep(hy + 0.5, hy + 0.62, p[1])],
  ]));
  for (const sd of [-1, 1]) {
    const s = sd > 0 ? "L" : "R";
    body.prims.push(cone([sd * 0.06, hy + 0.45, -0.01], [sd * (P.shW + 0.01), hy + 0.49, 0], 0.07 * b, 0.057 * b, M.skin, (p) => [
      [B("chest"), 1 - smoothstep(0.08, P.shW, Math.abs(p[0]))],
      [B(`sh${s}`), smoothstep(0.08, P.shW, Math.abs(p[0]))],
    ]));
  }
  // Arms (A-pose): each its own group so they never fuse with the ribs.
  const armPts = (sd: number) => {
    const s = sd > 0 ? "L" : "R";
    const J = at(`arm${s}`);
    const T = (p: V3) => toApose(p, sd, J);
    return { s, J, T, E: T(at(`fore${s}`)), W: T(at(`hand${s}`)) };
  };
  for (const sd of [-1, 1]) {
    const { s, J, T, E, W } = armPts(sd);
    const g = S.group(0.03, 0);
    g.prims.push(cone(T(add(J, [0, 0.01, 0])), E, 0.052 * b, 0.041, M.skin, (p) => {
      const t = clamp(dot(sub(p, J), norm(sub(E, J))) / len(sub(E, J)), 0, 1);
      return [
        [B(`arm${s}`), 1 - smoothstep(0.85, 1.05, t)],
        [B(`sh${s}`), 1 - smoothstep(0, 0.15, t)],
        [B(`fore${s}`), smoothstep(0.85, 1.05, t) * 0.5],
      ];
    }));
    g.prims.push(cone(E, W, 0.04, 0.029, M.skin, (p) => {
      const t = clamp(dot(sub(p, E), norm(sub(W, E))) / len(sub(W, E)), 0, 1);
      return [
        [B(`fore${s}`), 1],
        [B(`arm${s}`), 1 - smoothstep(0, 0.18, t)],
      ];
    }));
    // The hand: palm, four fingers slightly curled, a thumb (fine pass).
    const h = S.group(0.009, 1);
    const rot = rotAxis([0, 0, 1], sd * APOSE);
    const wr = at(`hand${s}`);
    const HB = B(`hand${s}`);
    h.prims.push(rbox(T(add(wr, [0, -0.042, 0.004])), [0.011, 0.034, 0.028], 0.008, M.skin, (p) => [
      [HB, 1],
      [B(`fore${s}`), 1 - smoothstep(0.0, 0.02, len(sub(p, W)))],
    ], rot));
    for (let f = 0; f < 4; f++) {
      const z = 0.024 - f * 0.016;
      const base = add(wr, [-sd * 0.001, -0.075, z]);
      const k1 = add(base, [-sd * 0.004, -0.026 + f * 0.002, 0.008]);
      const k2 = add(k1, [-sd * 0.008, -0.018, 0.012]);
      h.prims.push(chain([T(base), T(k1), T(k2)], [0.0085, 0.0078, 0.0068], M.skin, HB, 0.004));
    }
    const tb = add(wr, [-sd * 0.012, -0.03, 0.03]);
    h.prims.push(chain([T(tb), T(add(tb, [-sd * 0.012, -0.022, 0.014])), T(add(tb, [-sd * 0.016, -0.038, 0.02]))], [0.011, 0.009, 0.0075], M.skin, HB, 0.005));
  }
  // Legs.
  for (const sd of [-1, 1]) {
    const s = sd > 0 ? "L" : "R";
    const g = S.group(0.035, 0);
    const Hh = at(`thigh${s}`);
    const K = at(`shin${s}`);
    const A = at(`foot${s}`);
    g.prims.push(cone(add(Hh, [0, 0.02, 0]), K, 0.085 * b, 0.058, M.pants, (p) => [
      [B(`thigh${s}`), 1],
      [B("hips"), 1 - smoothstep(Hh[1] - 0.12, Hh[1] + 0.02, -p[1] + 2 * Hh[1] - 0.1)],
      [B(`shin${s}`), smoothstep(K[1] + 0.06, K[1] - 0.04, p[1])],
    ]));
    g.prims.push(cone(K, A, 0.056, 0.039, M.boots, (p) => [
      [B(`shin${s}`), 1],
      [B(`thigh${s}`), smoothstep(K[1] - 0.06, K[1] + 0.04, p[1])],
    ]));
    // Boot: a shaft over the shin, a foot with a turned-up toe, and a cuff.
    g.prims.push(cone(add(K, [0, -0.1, 0]), add(A, [0, -0.02, 0]), 0.064, 0.05, (p) => (p[1] > K[1] - 0.13 ? M.trim : M.boots), B(`shin${s}`)));
    g.prims.push(ellipsoid(add(A, [0, -0.045, 0.045]), [0.045, 0.036, 0.1], M.boots, B(`foot${s}`)));
    g.prims.push(sphere(add(A, [0, -0.03, 0.14]), 0.02, M.boots, B(`foot${s}`)));
  }

  // ------------------------------------------------------------------ head
  const head = S.group(0.035, 1);
  const HB = B("head");
  head.prims.push(ellipsoid(add(hc, [0, 0.012, -0.006]), [R * 0.93, R * 1.0, R * 0.97], M.skin, HB));
  head.prims.push(ellipsoid(add(hc, [0, -0.045, 0.018]), [R * 0.72, R * 0.62, R * 0.76], M.skin, HB));
  head.prims.push(sphere(add(hc, [0, -R * 0.9, R * 0.5]), R * 0.24, M.skin, HB));
  head.prims.push(cone(add(hc, [0, -R * 0.02, R * 0.92]), add(hc, [0, -R * 0.26, R * 0.99]), 0.004, 0.007, M.skin, HB));
  for (const sd of [-1, 1]) head.prims.push(ellipsoid(add(hc, [sd * R * 0.9, -R * 0.08, -R * 0.02]), [0.012, 0.028, 0.018], M.skin, HB));

  // ------------------------------------------------------------------ hair
  const hair = S.group(0.014, 1);
  const Rh = R * 1.08;
  const sph = (theta: number, phi: number, r: number): V3 => add(hc, [Math.sin(theta) * Math.sin(phi) * r, Math.cos(theta) * r, Math.sin(theta) * Math.cos(phi) * r]);
  const style = L.hairStyle;
  {
    const capD = ellipsoid(add(hc, [0, 0.016, -0.008]), [R * 0.93 + 0.013, R * 1.0 + 0.015, R * 0.97 + 0.013], M.hair, HB);
    const win = ellipsoid(add(hc, [0, -R * 0.52, R * 0.95]), [R * 0.82, R * 0.95, R * 0.8], M.hair, HB);
    const nape = style === "short" || style === "topknot" || style === "bun" || style === "wild" ? hc[1] - R * 0.55 : hc[1] - R * 0.9;
    hair.prims.push(custom(capD.lo, capD.hi, M.hair, HB, (p) => Math.max(capD.d(p), -win.d(p), (nape - p[1]) * 0.8, (p[2] - hc[2] > R * 0.3 && p[1] < hc[1] - R * 0.05 ? 0.02 : -1))));
  }
  // Bangs: clumps from the crown falling over the brow, parted a little off-centre.
  const nB = fem ? 9 : 7;
  for (let k = 0; k < nB; k++) {
    const phi = (k / (nB - 1) - 0.5) * 1.9 + 0.06;
    const lenT = (fem ? 0.5 : 0.44) + Math.sin(k * 2.3) * 0.035;
    const pts = [sph(0.1 * Math.PI, phi * 0.4, Rh * 0.98), sph(0.26 * Math.PI, phi * 0.85, Rh * 1.07), sph(0.4 * Math.PI, phi * 1.02, Rh * 1.1), sph(lenT * Math.PI, phi * 1.08 + Math.sign(phi) * 0.04, Rh * 1.085)];
    hair.prims.push(lock(pts, [0.022, 0.024, 0.017, 0.004], 0.45, sub(pts[2], hc), M.hair, HB));
  }
  // Side locks framing the face.
  for (const sd of [-1, 1]) {
    const longSide = fem || style === "long";
    const end: V3 = add(hc, [sd * R * 0.86, -R * (longSide ? 2.6 : 1.3), R * 0.28]);
    const pts = [sph(0.28 * Math.PI, sd * 1.25, Rh * 0.98), sph(0.55 * Math.PI, sd * 1.38, Rh * 1.08), add(hc, [sd * R * 0.98, -R * 0.75, R * 0.25]), end];
    hair.prims.push(lock(pts, [0.02, 0.022, 0.017, 0.005], 0.5, [sd, 0, 0], M.hair, HB));
  }
  const pony = [0, 1, 2, 3].map((k) => at(`pony${k}`));
  const ponyB = [0, 1, 2, 3].map((k) => B(`pony${k}`));
  if (style === "short" || style === "topknot" || style === "bun" || style === "wild") {
    for (let k = 0; k < 9; k++) {
      const phi = Math.PI + (k / 8 - 0.5) * 2.4;
      const pts = [sph(0.35 * Math.PI, phi, Rh), sph(0.6 * Math.PI, phi, Rh * 1.06), sph(0.72 * Math.PI, phi, Rh * 1.02)];
      hair.prims.push(chain(pts, [0.022, 0.018, 0.004], M.hair, HB, 0.006));
    }
  }
  if (style === "long") {
    // A sheet of locks down the back to the waist, moving with the spring chain.
    for (let k = 0; k < 9; k++) {
      const x = (k / 8 - 0.5) * 0.2;
      const phi = Math.PI - x * 6;
      const pts: V3[] = [sph(0.4 * Math.PI, phi, Rh), add(hc, [x * 1.05, -R * 1.1, -R * 1.05]), [x * 1.1, hy + 0.42, -0.15 * b - 0.02], [x * 1.2, hy + 0.2, -0.13 * b - 0.03]];
      hair.prims.push({ ...lock(pts, [0.026, 0.028, 0.022, 0.005], 0.5, [0, 0, 1], M.hair, 0), bone: (p) => (p[1] > hc[1] - R * 0.6 ? [[HB, 1]] : along(p, [add(hc, [0, -R, -R]), ...pony.slice(1)], ponyB)) });
    }
  }
  if (style === "ponytail") {
    const tie = add(pony[0], [0, 0, 0.01]);
    hair.prims.push(sphere(tie, 0.03, M.gear, HB));
    const tail: V3[] = [add(tie, [0, 0.01, -0.02]), add(pony[1], [0, 0.04, -0.03]), add(pony[2], [0, 0, -0.02]), add(pony[3], [0, -0.06, 0]), add(pony[3], [0, -0.2, 0.03])];
    for (let s2 = 0; s2 < 3; s2++) {
      const o: V3 = [(s2 - 1) * 0.018, 0, s2 === 1 ? -0.012 : 0];
      hair.prims.push({ ...chain(tail.map((q, i) => add(q, mul(o, i / 4))), [0.034, 0.036, 0.03, 0.02, 0.004], M.hair, 0, 0.01), bone: (p) => along(p, pony, ponyB) });
    }
  }
  if (style === "topknot" || style === "bun") {
    hair.prims.push(sphere(add(hc, [0, R * 1.02, -R * 0.18]), R * 0.4, M.hair, HB));
    if (style === "bun") {
      for (const sd of [-1, 1]) {
        hair.prims.push(capsule(add(hc, [sd * 0.02, R * 1.1, -R * 0.14]), add(hc, [sd * 0.1, R * 1.35, -R * 0.1]), 0.0035, M.gear, HB));
        hair.prims.push(sphere(add(hc, [sd * 0.1, R * 1.36, -R * 0.1]), 0.011, M.metal, HB));
      }
    }
  }
  if (style === "twin") {
    for (const sd of [-1, 1]) {
      const s = sd > 0 ? "L" : "R";
      const J = [0, 1, 2].map((k) => at(`twin${s}${k}`));
      const JB = [0, 1, 2].map((k) => B(`twin${s}${k}`));
      hair.prims.push(sphere(J[0], 0.024, M.gear, HB));
      const tail: V3[] = [J[0], add(J[1], [sd * 0.02, 0.04, 0]), J[2], add(J[2], [sd * 0.01, -0.14, 0.02])];
      hair.prims.push({ ...chain(tail, [0.03, 0.032, 0.022, 0.004], M.hair, 0, 0.01), bone: (p) => along(p, J, JB) });
    }
  }
  if (style === "wild") {
    for (let k = 0; k < 12; k++) {
      const phi = (k / 12) * TAU;
      hair.prims.push(cone(sph(0.3 * Math.PI, phi, Rh * 0.9), sph(0.22 * Math.PI, phi + 0.35, Rh * 1.55), 0.028, 0.003, M.hair, HB));
    }
  }
  // Beards.
  const beard = L.beard ?? "none";
  if (beard !== "none") {
    const bw = (p: V3): BoneW => [
      [HB, smoothstep(hc[1] - R * 2.6, hc[1] - R * 1.2, p[1])],
      [B("chest"), 1 - smoothstep(hc[1] - R * 2.6, hc[1] - R * 1.2, p[1])],
    ];
    if (beard === "long") {
      for (let k = 0; k < 5; k++) {
        const x = (k / 4 - 0.5) * R * 0.95;
        const ln = 3.1 - Math.abs(k - 2) * 0.35;
        const pts: V3[] = [add(hc, [x * 0.85, -R * 0.74, R * 0.7]), add(hc, [x * 0.9, -R * 1.2, R * 0.88]), add(hc, [x * 0.55, -R * 2.1, R * 0.96]), add(hc, [x * 0.15, -R * ln, R * 0.86])];
        hair.prims.push({ ...lock(pts, [0.013, 0.016, 0.012, 0.002], 0.5, [0, 0, 1], M.hair, 0), bone: bw });
      }
    } else if (beard === "bushy") {
      for (let k = 0; k < 11; k++) {
        const a = -1.3 + (k / 10) * 2.6;
        hair.prims.push({ ...cone(sph(0.68 * Math.PI, a, R * 0.95), sph(0.86 * Math.PI, a * 1.1, R * 1.45), 0.02, 0.004, M.hair, 0), bone: bw });
      }
    } else {
      hair.prims.push({ ...chain([add(hc, [0, -R * 0.82, R * 0.62]), add(hc, [0, -R * 1.2, R * 0.66]), add(hc, [0, -R * 1.7, R * 0.56])], [0.014, 0.013, 0.003], M.hair, 0), bone: bw });
    }
    for (const sd of [-1, 1]) hair.prims.push(chain([add(hc, [sd * 0.006, -R * 0.36, R * 0.96]), add(hc, [sd * R * 0.3, -R * 0.44, R * 0.9]), add(hc, [sd * R * 0.52, -R * 0.72, R * 0.72])], [0.007, 0.006, 0.002], M.hair, HB));
  }

  // ------------------------------------------------------------------ headgear
  const gear = S.group(0.01, 1);
  switch (L.headgear) {
    case "guan":
      gear.prims.push(rbox(add(hc, [0, R * 1.2, -R * 0.15]), [0.036, 0.03, 0.045], 0.012, M.dark, HB));
      gear.prims.push(capsule(add(hc, [-0.085, R * 1.22, -R * 0.15]), add(hc, [0.085, R * 1.22, -R * 0.15]), 0.0045, M.gear, HB));
      break;
    case "scholar":
      gear.prims.push(ellipsoid(add(hc, [0, R * 0.95, -R * 0.12]), [R * 0.72, R * 0.42, R * 0.78], M.gear, HB));
      for (const sd of [-1, 1]) gear.prims.push({ ...chain([add(hc, [sd * 0.025, R * 0.7, -R * 0.95]), add(hc, [sd * 0.035, R * 0.1, -R * 1.18]), add(hc, [sd * 0.04, -R * 0.8, -R * 1.2])], [0.012, 0.011, 0.009], M.gear, 0), bone: (p) => along(p, pony, ponyB) });
      break;
    case "helm": {
      const shellC = add(hc, [0, R * 0.2, -0.004]);
      const out = R * 1.18;
      gear.prims.push(custom(sub(shellC, [out, out, out]), add(shellC, [out, out, out]), M.metal, HB, (p) => Math.max(Math.abs(len(sub(p, shellC)) - out) - 0.007, shellC[1] + R * 0.25 - p[1])));
      gear.prims.push(custom(sub(shellC, [out + 0.02, 0.03, out + 0.02]), add(shellC, [out + 0.02, 0.03, out + 0.02]), M.gear, HB, (p) => {
        const q = sub(p, shellC);
        return Math.hypot(Math.hypot(q[0], q[2]) - out, q[1] - R * 0.27) - 0.011;
      }));
      gear.prims.push(cone(add(shellC, [0, out - 0.01, 0]), add(shellC, [0, out + 0.1, 0]), 0.018, 0.003, M.gear, HB));
      gear.prims.push({ ...chain([add(shellC, [0, out + 0.08, -0.01]), add(shellC, [0, out + 0.02, -0.08]), add(shellC, [0, out - 0.12, -0.16])], [0.02, 0.028, 0.01], M.plume, 0, 0.01), bone: (p) => along(p, pony, ponyB) });
      break;
    }
    case "plume": {
      gear.prims.push(custom(add(hc, [-R * 0.7, R * 0.8, -R * 0.8]), add(hc, [R * 0.7, R * 1.25, R * 0.6]), M.gear, HB, (p) => {
        const q = sub(p, add(hc, [0, R * 1.03, -R * 0.1]));
        return Math.hypot(Math.hypot(q[0], q[2] * 0.9) - R * 0.55, q[1]) - 0.02;
      }));
      gear.prims.push(sphere(add(hc, [0, R * 1.08, R * 0.47]), 0.017, M.lip, HB));
      for (const sd of [-1, 1]) {
        const pts: V3[] = [];
        for (let k = 0; k <= 8; k++) {
          const t = k / 8;
          pts.push(add(hc, [sd * (0.04 + t * 0.28), R * 1.1 + Math.sin(t * Math.PI * 0.85) * 0.36, -R * 0.1 - t * 0.9]));
        }
        gear.prims.push(chain(pts, pts.map((_, i) => 0.012 - i * 0.0011), (p) => (Math.floor(len(sub(p, hc)) * 30) % 2 ? M.plume : M.dark), HB, 0.004));
      }
      break;
    }
    case "headband": {
      gear.prims.push(custom(add(hc, [-R * 1.2, -R * 0.2, -R * 1.2]), add(hc, [R * 1.2, R * 0.8, R * 1.2]), M.gear, HB, (p) => {
        const q = sub(p, add(hc, [0, R * 0.3, -R * 0.02]));
        const y = q[1] - q[2] * 0.2;
        return Math.hypot(Math.hypot(q[0], q[2]) - R * 1.09, y) - 0.016;
      }));
      for (const sd of [-1, 1]) gear.prims.push({ ...chain([add(hc, [sd * 0.02, R * 0.3, -R * 1.1]), add(hc, [sd * 0.05, R * 0.05, -R * 1.3]), add(hc, [sd * 0.06, -R * 0.6, -R * 1.35])], [0.015, 0.013, 0.01], M.gear, 0), bone: (p) => along(p, pony, ponyB) });
      break;
    }
    case "hood": {
      const c = add(hc, [0, R * 0.05, -R * 0.12]);
      const r = R * 1.35;
      gear.prims.push(custom(sub(c, [r, r, r]), add(c, [r, r, r]), M.gear, HB, (p) => Math.max(Math.abs(len(sub(p, c)) - r) - 0.008, c[1] - R * 0.6 - p[1], p[2] - c[2] - R * 0.7)));
      break;
    }
    case "pins": {
      const f = sph(0.3 * Math.PI, 1.2, Rh * 1.02);
      gear.prims.push(sphere(f, 0.018, M.gear, HB));
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * TAU;
        gear.prims.push(ellipsoid(add(f, [Math.cos(a) * 0.024, Math.sin(a) * 0.024, 0.008]), [0.017, 0.017, 0.007], M.lip, HB));
      }
      break;
    }
    default:
      break;
  }

  // ------------------------------------------------------------------ clothes
  // Shapes only: the collar bands, the under-robe V, the sash, hems and cuffs, and the
  // lamellar plates are drawn by the shader from these measurements (crisp, not voxel-jagged).
  const cloth = S.group(0.035, 0);
  const yN = hy + 0.46;
  const yV = hy + (fem ? 0.3 : 0.28);
  const sashY: [number, number] = [hy + 0.07, hy + 0.15];
  cloth.prims.push(...torso(0.013, M.robe).map((q) => ({ ...q, d: (p: V3) => Math.max(q.d(p), p[1] - (yN + 0.03)) })));
  // The robe over the shoulders, and a soft standing collar round the neck.
  for (const sd of [-1, 1]) {
    const s2 = sd > 0 ? "L" : "R";
    cloth.prims.push(cone([sd * 0.05, hy + 0.455, -0.012], [sd * (P.shW + 0.02), hy + 0.49, 0], 0.07 * b + 0.013, 0.058 * b + 0.014, M.robe, (p) => [
      [B("chest"), 1 - smoothstep(0.08, P.shW, Math.abs(p[0]))],
      [B(`sh${s2}`), smoothstep(0.08, P.shW, Math.abs(p[0]))],
    ]));
  }
  cloth.prims.push(custom([-0.12, yN - 0.04, -0.12], [0.12, yN + 0.06, 0.12], M.robe, B("chest"), (p) => {
    const q = sub(p, [0, yN + 0.012, -0.004]);
    return Math.hypot(Math.hypot(q[0], q[2] * 1.05) - 0.058, q[1]) - 0.02;
  }));
  // Sleeves.
  const cuffs: { E: V3; dir: V3; reach: number }[] = [];
  let drapeY = -9;
  for (const sd of [-1, 1]) {
    const { s, J, E, W } = armPts(sd);
    const g = S.group(0.025, 0);
    g.prims.push(cone(add(J, [0, 0.015, 0]), E, 0.068 * b, 0.056, M.robe, (p) => {
      const t = clamp(dot(sub(p, J), norm(sub(E, J))) / len(sub(E, J)), 0, 1);
      return [
        [B(`arm${s}`), 1 - smoothstep(0.9, 1.1, t) * 0.5],
        [B(`sh${s}`), 1 - smoothstep(0, 0.2, t)],
        [B(`fore${s}`), smoothstep(0.9, 1.1, t) * 0.5],
      ];
    }));
    const dir = norm(sub(W, E));
    const L2 = len(sub(W, E));
    if (wide) {
      const reach = L2 + 0.045;
      cuffs.push({ E, dir, reach });
      g.prims.push(custom(sub(lerp3(E, W, 0.5), [0.2, 0.2, 0.2]), add(lerp3(E, W, 0.5), [0.2, 0.2, 0.2]), M.robe, B(`fore${s}`), (p) => {
        const q = sub(p, E);
        const a = dot(q, dir);
        const radial = len(sub(q, mul(dir, a)));
        const t = clamp(a / reach, 0, 1);
        const r = 0.058 + t * t * 0.07;
        return Math.max(Math.abs(radial - r) - 0.01, -a - 0.01, a - reach);
      }));
      const mid = lerp3(E, W, 0.55);
      const top: V3 = add(mid, [sd * 0.01, -0.03, 0]);
      drapeY = top[1] - 0.28;
      g.prims.push(custom(sub(top, [0.16, 0.36, 0.05]), add(top, [0.16, 0.04, 0.05]), M.drape, B(`slv${s}`), (p) => {
        const q = sub(p, top);
        const w = 0.075 + (-q[1] / 0.3) * 0.035;
        const zc = -Math.cos(q[0] * 14) * 0.012;
        const dx = Math.abs(q[0]) - w;
        const dy = Math.max(q[1], -q[1] - 0.28 - Math.cos(q[0] * 12) * 0.02);
        const dz = Math.abs(q[2] - zc) - 0.01;
        return Math.max(dx, dy, dz);
      }));
    } else {
      cuffs.push({ E, dir, reach: 99 });
      g.prims.push(cone(E, W, 0.046, 0.038, M.robe, B(`fore${s}`)));
      g.prims.push(cone(lerp3(E, W, 0.35), lerp3(E, W, 0.95), 0.05, 0.043, armored ? M.armor : M.boots, B(`fore${s}`)));
    }
  }
  // The skirt: a pleated shell from the waist, parting with the legs.
  const hemY = hy - robeLen;
  if (robeLen > 0) {
    const yt = hy + 0.03;
    const yb = hemY;
    const r0 = 0.168 * b;
    const r1 = (0.25 + robeLen * 0.08) * b;
    cloth.prims.push(custom([-r1 - 0.05, yb - 0.02, -r1 - 0.05], [r1 + 0.05, yt + 0.03, r1 + 0.05], M.robe, (p) => {
      const t = clamp((yt - p[1]) / (yt - yb), 0, 1);
      const side = smoothstep(-0.07, 0.07, p[0]);
      const k = t * 0.85;
      return [
        [B("hips"), 1 - k],
        [B("thighL"), k * side],
        [B("thighR"), k * (1 - side)],
      ];
    }, (p) => {
      const t = clamp((yt - p[1]) / (yt - yb), 0, 1);
      const a = Math.atan2(p[0], p[2]);
      const r = r0 + (r1 - r0) * t ** 1.3 + Math.sin(a * 9 + 0.5) * 0.011 * t + Math.sin(a * 23) * 0.003 * t;
      const rad = Math.hypot(p[0] / 1.12, p[2] / 0.9);
      return Math.max(Math.abs(rad - r) - 0.0095, yb - p[1], p[1] - yt - 0.02);
    }));
  }
  // Belt and the sash ends.
  const beltMat = armored ? M.armorTrim : M.sash;
  const beltY = armored ? hy + 0.04 : sashY[0] - 0.005;
  cloth.prims.push(custom([-0.25, hy - 0.02, -0.2], [0.25, hy + 0.2, 0.2], beltMat, () => [
    [B("spine"), 0.5],
    [B("hips"), 0.5],
  ], (p) => {
    const q: V3 = [p[0] / (1.02 * b), p[1] - beltY, p[2] / 0.83];
    return Math.hypot(Math.hypot(q[0], q[2]) - 0.142, q[1]) - (armored ? 0.02 : 0.012);
  }));
  const sashJ = [0, 1, 2].map((k) => at(`sash${k}`));
  const sashB = [0, 1, 2].map((k) => B(`sash${k}`));
  cloth.prims.push(sphere(add(sashJ[0], [0, 0.03, 0.005]), 0.026, beltMat, B("hips")));
  for (const o of [-0.018, 0.018]) {
    const mid = add(sashJ[1], [o * 1.5, 0, 0.015]);
    const base = chain([add(sashJ[0], [o, 0.02, 0.01]), mid, add(sashJ[2], [o * 2, -0.08, 0.01])], [0.012, 0.012, 0.014], armored ? M.armorTrim : M.sash, 0, 0.004);
    cloth.prims.push({
      ...base,
      bone: (p) => along(p, sashJ, sashB),
      d: (p) => {
        const q = sub(p, mid);
        return base.d(add(mid, [q[0] * 0.5, q[1], q[2] * 2.4])) * 0.45;
      },
    });
  }
  // Armour: cuirass, beast-face buckle, pauldrons, tassets.
  const armorTop = hy + 0.43;
  const armorBot = hy + 0.1;
  const tassetHem = hy - 0.26;
  if (armored) {
    const arm = S.group(0.035, 0);
    arm.prims.push(...torso(0.028, M.armor).map((q) => ({ ...q, d: (p: V3) => Math.max(q.d(p), p[1] - armorTop, armorBot - p[1]) })));
    arm.prims.push(ellipsoid([0, hy + 0.045, 0.15 * b], [0.045, 0.038, 0.02], M.armorTrim, B("hips")));
    for (const sd of [-1, 1]) {
      const s = sd > 0 ? "L" : "R";
      const J = at(`arm${s}`);
      const up = norm([sd * Math.sin(APOSE) * 0.8 + sd * 0.35, Math.cos(APOSE) * 0.6 + 0.35, 0]);
      for (let k = 0; k < 3; k++) {
        const c = toApose(add(J, [0, -0.02 - k * 0.04, 0]), sd, J);
        const r = 0.1 - k * 0.012;
        arm.prims.push(custom(sub(c, [r + 0.02, r + 0.02, r + 0.02]), add(c, [r + 0.02, r + 0.02, r + 0.02]), k === 0 ? M.armorTrim : M.armor, () => [
          [B(`sh${s}`), 0.45],
          [B(`arm${s}`), 0.55],
        ], (p) => {
          const q = sub(p, c);
          const shell = Math.abs(len([q[0], q[1] * 1.15, q[2] * 0.95]) - r) - 0.006;
          return Math.max(shell, -(dot(q, up) - r * 0.2));
        }));
      }
    }
    const yt = hy + 0.06;
    arm.prims.push(custom([-0.3, tassetHem - 0.02, -0.3], [0.3, yt + 0.02, 0.3], M.armor, (p) => {
      const t = clamp((yt - p[1]) / (yt - tassetHem), 0, 1);
      const side = smoothstep(-0.07, 0.07, p[0]);
      return [
        [B("hips"), 1 - t * 0.6],
        [B("thighL"), t * 0.6 * side],
        [B("thighR"), t * 0.6 * (1 - side)],
      ];
    }, (p) => {
      const t = clamp((yt - p[1]) / (yt - tassetHem), 0, 1);
      const a = Math.atan2(p[0], p[2]);
      const gap = Math.abs(Math.abs(a) - Math.PI) < 0.9 || Math.abs(Math.abs(a) - 1.1) < 0.08 || Math.abs(a) < 0.04 ? 0.05 : -1;
      const r = 0.18 * b + t * 0.07 * b;
      const rad = Math.hypot(p[0] / 1.12, p[2] / 0.9);
      return Math.max(Math.abs(rad - r) - 0.01, tassetHem - p[1], p[1] - yt, gap);
    }));
  }
  // Cape.
  const capeHem = hy - robeLen * 0.9 - 0.05;
  if (L.cape) {
    const capeJ = [0, 1, 2, 3].map((k) => at(`cape${k}`));
    const capeB = [0, 1, 2, 3].map((k) => B(`cape${k}`));
    const y0 = hy + 0.47;
    const y1 = capeHem;
    const g = S.group(0.02, 0);
    g.prims.push(custom([-0.5, y1 - 0.08, -0.5], [0.5, y0 + 0.05, 0.1], M.cape, (p) => along(p, capeJ, capeB), (p) => {
      const d = (y0 - p[1]) / (y0 - y1);
      const w = (0.2 + d * 0.2) * b;
      const zc = -0.155 * b - 0.02 - d * 0.1 + (Math.cos((p[0] / w) * 1.3) - 1) * 0.05 + Math.sin(p[0] * 34 + d * 3) * 0.009 * d;
      const dz = Math.abs(p[2] - zc) - 0.0095;
      const dx = Math.abs(p[0]) - w;
      const hem = y1 + Math.abs(p[0] / w) ** 2 * 0.06;
      const dy = Math.max(p[1] - y0, hem - p[1]);
      return Math.max(dz, dx, dy);
    }));
  }
  garment = { hy, yN, yV, sash: armored ? [0, 0] : sashY, hem: robeLen > 0 ? hemY : -9, capeHem, armorTop: armored ? armorTop : -9, armorBot, tassetHem: armored ? tassetHem : -9, cuffs: cuffs.map((c) => ({ E: c.E, dir: c.dir, reach: c.reach })), drapeY, armored, fem };

  // ------------------------------------------------------------------ passes
  const fine = S.groups.filter((g) => g.pass === 1);
  const coarseG = S.groups.filter((g) => g.pass === 0);
  const top = hc[1] + R * (L.headgear === "plume" ? 3.6 : 1.9);
  return {
    S,
    bones,
    P,
    head: hc,
    garment,
    passes: [
      { groups: coarseG, lo: [-0.75, -0.02, -0.42], hi: [0.75, hy + 0.72, 0.36], h: coarse ? 0.011 : 0.0075 },
      { groups: fine, lo: [-0.75, hy - 0.35, -0.75], hi: [0.75, top, 0.3], h: coarse ? 0.0065 : 0.0042 },
    ],
  };
}
