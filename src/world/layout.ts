/**
 * The land of 유주 탁현 and around it, as places: where the village with the peach garden
 * stands, where the river runs, where the Yellow Turbans have pitched their camps, where the
 * limestone peaks rise, where the beacon towers (waypoints), chests and 천명석 lie.
 * Coordinates are metres, x east, z south, origin at the centre of a 2 km square.
 */
import { rng } from "./noise";

export const WORLD = 2048;
export const HALF = WORLD / 2;
export const WATER = 2;

export interface Place {
  id: string;
  name: string;
  x: number;
  z: number;
  r: number;
  /** Flatten the ground to this height (else keep it). */
  flat?: number;
}

export const VILLAGE: Place = { id: "village", name: "탁현 마을", x: -180, z: 260, r: 95, flat: 9 };
export const PEACH: Place = { id: "peach", name: "도원(桃園)", x: -60, z: 330, r: 55, flat: 10 };
export const CAMPS: (Place & { level: number; boss?: boolean })[] = [
  { id: "camp1", name: "황건적 초소", x: 120, z: 120, r: 42, flat: 10, level: 1 },
  { id: "camp2", name: "황건적 산채", x: -420, z: -60, r: 50, flat: 20, level: 3 },
  { id: "camp3", name: "황건적 진영", x: 440, z: -170, r: 55, flat: 14, level: 5 },
  { id: "camp4", name: "황건 대본영", x: 120, z: -560, r: 70, flat: 34, level: 8, boss: true },
];
export const LAKE = { x: -540, z: 470, r: 150 };

/** The river: from the northern hills, past the village, to the lake. */
export const RIVER: [number, number][] = [
  [300, -1000],
  [260, -700],
  [120, -420],
  [-20, -250],
  [-40, -40],
  [-10, 120],
  [-120, 180],
  [-330, 280],
  [-520, 430],
];

/** Beacon towers (봉화대): unlock to fast-travel. */
export const BEACONS: Place[] = [
  { id: "b-village", name: "탁현 봉화대", x: -80, z: 200, r: 6 },
  { id: "b-hill", name: "서쪽 언덕 봉화대", x: -560, z: -200, r: 6 },
  { id: "b-karst", name: "석림 봉화대", x: 560, z: 120, r: 6 },
  { id: "b-north", name: "북쪽 고개 봉화대", x: -120, z: -420, r: 6 },
  { id: "b-lake", name: "호숫가 봉화대", x: -420, z: 620, r: 6 },
];

export interface Peak {
  x: number;
  z: number;
  r: number;
  h: number;
  lean: number;
}

/** Limestone peaks (석림): a forest of them in the east, a wall of them round the edge. */
export function peaks(): Peak[] {
  const R = rng(4242);
  const out: Peak[] = [];
  const clear = (x: number, z: number, r: number) =>
    [VILLAGE, PEACH, ...CAMPS, ...BEACONS].every((p) => Math.hypot(p.x - x, p.z - z) > p.r + r + 30) && Math.hypot(LAKE.x - x, LAKE.z - z) > LAKE.r + r;
  // The stone forest east of the village.
  for (let k = 0; k < 400 && out.length < 34; k++) {
    const x = 380 + R() * 560;
    const z = -80 + (R() - 0.5) * 900;
    const r = 18 + R() * 26;
    const h = 60 + R() * 110;
    if (!clear(x, z, r)) continue;
    if (out.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + r + 14)) continue;
    out.push({ x, z, r, h, lean: (R() - 0.5) * 0.3 });
  }
  // A ring round the edge: the end of the world is a wall of peaks.
  for (let k = 0; k < 90; k++) {
    const a = (k / 90) * Math.PI * 2 + R() * 0.03;
    const d = HALF - 60 - R() * 80;
    const x = Math.cos(a) * d * 1.02;
    const z = Math.sin(a) * d;
    const r = 30 + R() * 40;
    if (!clear(x, z, r)) continue;
    out.push({ x: Math.max(-HALF + 40, Math.min(HALF - 40, x)), z: Math.max(-HALF + 40, Math.min(HALF - 40, z)), r, h: 120 + R() * 180, lean: (R() - 0.5) * 0.2 });
  }
  // A few loners in the fields.
  for (const [x, z, r, h] of [
    [-280, 60, 22, 70],
    [260, 380, 26, 90],
    [-620, 180, 30, 110],
    [-260, -330, 24, 85],
  ] as [number, number, number, number][])
    out.push({ x, z, r, h, lean: 0.1 });
  return out;
}

/** Chests, by rarity. */
export const CHESTS: { x: number; z: number; kind: "common" | "fine" | "rich" }[] = [
  { x: -40, z: 300, kind: "common" },
  { x: 150, z: 110, kind: "fine" },
  { x: -300, z: 150, kind: "common" },
  { x: -420, z: -60, kind: "fine" },
  { x: 440, z: -170, kind: "rich" },
  { x: 120, z: -560, kind: "rich" },
  { x: -560, z: 520, kind: "common" },
  { x: 610, z: 250, kind: "fine" },
  { x: -620, z: -320, kind: "fine" },
  { x: 300, z: 420, kind: "common" },
  { x: 700, z: -300, kind: "fine" },
  { x: -180, z: -500, kind: "common" },
];
