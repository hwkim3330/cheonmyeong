/**
 * What the player owns and has done, saved in the browser: 원보 (the summoning currency),
 * the heroes and their levels and awakenings (각성), the party, experience books, the
 * summoning pity counters, which beacons are lit, chests opened, 천명석 taken, camps
 * cleared, how far the story has gone.
 */
import { HERO, HEROES } from "../data/heroes";

export interface Owned {
  level: number;
  exp: number;
  cons: number;
}

export interface ProfileData {
  yuanbao: number;
  books: number;
  owned: Record<string, Owned>;
  party: string[];
  pity5: number;
  pity4: number;
  guarantee: boolean;
  pulls: number;
  beacons: string[];
  chests: number[];
  orbs: number[];
  camps: number[];
  quest: number;
  talked: string[];
  pos?: [number, number];
  history: { id: string; stars: number; t: number }[];
}

const KEY = "cheonmyeong-v1";

export class Profile {
  d: ProfileData;
  constructor() {
    this.d = Profile.fresh();
    try {
      const s = localStorage.getItem(KEY);
      if (s) this.d = { ...Profile.fresh(), ...JSON.parse(s) };
    } catch {
      /* no storage */
    }
  }

  static fresh(): ProfileData {
    return {
      yuanbao: 1600,
      books: 6,
      owned: { liubei: { level: 1, exp: 0, cons: 0 }, guanyu: { level: 1, exp: 0, cons: 0 }, zhangfei: { level: 1, exp: 0, cons: 0 } },
      party: ["liubei", "guanyu", "zhangfei"],
      pity5: 0,
      pity4: 0,
      guarantee: false,
      pulls: 0,
      beacons: [],
      chests: [],
      orbs: [],
      camps: [],
      quest: 0,
      talked: [],
      history: [],
    };
  }

  save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.d));
    } catch {
      /* ignore */
    }
  }

  reset(): void {
    this.d = Profile.fresh();
    this.save();
  }

  /** Experience needed for the next level. */
  static need(level: number): number {
    return Math.round(400 + level * level * 60);
  }

  /** Spend a book (1000 exp) on a hero; returns levels gained. */
  useBook(id: string): number {
    const o = this.d.owned[id];
    if (!o || this.d.books <= 0 || o.level >= 40) return 0;
    this.d.books--;
    o.exp += 1000;
    let up = 0;
    while (o.level < 40 && o.exp >= Profile.need(o.level)) {
      o.exp -= Profile.need(o.level);
      o.level++;
      up++;
    }
    this.save();
    return up;
  }

  partyEntries(): { id: string; level: number; cons: number }[] {
    return this.d.party.filter((id) => this.d.owned[id]).map((id) => ({ id, level: this.d.owned[id].level, cons: this.d.owned[id].cons }));
  }
}

// ------------------------------------------------------------------ summoning

export interface Banner {
  id: string;
  name: string;
  featured: string;
  four: string[];
  blurb: string;
}

export const BANNERS: Banner[] = [
  { id: "zhaoyun", name: "상산의 백룡", featured: "zhaoyun", four: ["huangzhong", "diaochan", "machao"], blurb: "5★ 조운 획득 확률 대폭 상승!" },
  { id: "zhugeliang", name: "와룡의 바람", featured: "zhugeliang", four: ["sunshangxiang", "huangzhong", "diaochan"], blurb: "5★ 제갈량 획득 확률 대폭 상승!" },
];

export const PULL_COST = 160;

export interface PullResult {
  stars: 3 | 4 | 5;
  id: string | null;
  isNew: boolean;
  cons: number;
}

export function summon(p: Profile, banner: Banner, n: number): PullResult[] | null {
  if (p.d.yuanbao < PULL_COST * n) return null;
  p.d.yuanbao -= PULL_COST * n;
  const out: PullResult[] = [];
  const fives = HEROES.filter((h) => h.stars === 5 && !["guanyu"].includes(h.id)).map((h) => h.id);
  const fours = HEROES.filter((h) => h.stars === 4).map((h) => h.id);
  for (let k = 0; k < n; k++) {
    p.d.pity5++;
    p.d.pity4++;
    p.d.pulls++;
    // Soft pity from 74, hard at 90; four-star at least every 10.
    const r5 = p.d.pity5 >= 90 ? 1 : 0.006 + Math.max(0, p.d.pity5 - 73) * 0.06;
    const r4 = p.d.pity4 >= 10 ? 1 : 0.051;
    const roll = Math.random();
    let res: PullResult;
    if (roll < r5) {
      p.d.pity5 = 0;
      p.d.pity4 = 0;
      let id: string;
      if (p.d.guarantee || Math.random() < 0.5) {
        id = banner.featured;
        p.d.guarantee = false;
      } else {
        const off = fives.filter((f) => f !== banner.featured);
        id = off[Math.floor(Math.random() * off.length)];
        p.d.guarantee = true;
      }
      res = grant(p, id, 5);
    } else if (roll < r5 + r4) {
      p.d.pity4 = 0;
      const pool = Math.random() < 0.5 ? banner.four : fours;
      res = grant(p, pool[Math.floor(Math.random() * pool.length)], 4);
    } else {
      p.d.books += 1;
      res = { stars: 3, id: null, isNew: false, cons: 0 };
    }
    p.d.history.unshift({ id: res.id ?? "book", stars: res.stars, t: Date.now() });
    out.push(res);
  }
  p.d.history.length = Math.min(p.d.history.length, 90);
  p.save();
  return out;
}

function grant(p: Profile, id: string, stars: 4 | 5): PullResult {
  const o = p.d.owned[id];
  if (!o) {
    p.d.owned[id] = { level: 1, exp: 0, cons: 0 };
    if (p.d.party.length < 4) p.d.party.push(id);
    return { stars, id, isNew: true, cons: 0 };
  }
  if (o.cons < 6) o.cons++;
  else p.d.books += stars === 5 ? 10 : 3;
  return { stars, id, isNew: false, cons: o.cons };
}

export { HERO };
