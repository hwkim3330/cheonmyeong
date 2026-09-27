/**
 * The heroes: who they are, how they look, how they fight. Elements follow the four
 * forces of this world — 화(火) fire, 수(水) water, 뇌(雷) thunder, 풍(風) wind. Skills are
 * sequences of simple effects (slashes, dashes, blasts, projectiles, fields, heals) run by the
 * combat system; bursts need energy.
 */
import type { Look } from "../char/model";

export type Element = "fire" | "water" | "thunder" | "wind";
export const ELEMENT_NAME: Record<Element, string> = { fire: "화(火)", water: "수(水)", thunder: "뇌(雷)", wind: "풍(風)" };
export const ELEMENT_COLOR: Record<Element, number> = { fire: 0xff6a2a, water: 0x3ab8ff, thunder: 0xb46aff, wind: 0x5ae8b8 };

export type Effect =
  | { k: "slash"; at: number; range: number; arc: number; dmg: number; el?: boolean; knock?: number; height?: number }
  | { k: "dash"; at: number; dist: number; dur: number; dmg: number; el?: boolean; width?: number }
  | { k: "blast"; at: number; fwd: number; radius: number; dmg: number; el?: boolean; knock?: number; stun?: number; fx?: "ring" | "pillar" | "burst" }
  | { k: "shot"; at: number; speed: number; dmg: number; el?: boolean; splash?: number; count?: number; spread?: number; fx?: "arrow" | "orb" | "blade" }
  | { k: "field"; at: number; fwd: number; radius: number; dur: number; tick: number; dmg: number; el?: boolean; pull?: number; heal?: number; fx?: "formation" | "tornado" | "fire" | "moon" }
  | { k: "rain"; at: number; fwd: number; radius: number; count: number; dur: number; dmg: number; el?: boolean }
  | { k: "heal"; at: number; amount: number }
  | { k: "buff"; at: number; atk: number; dur: number }
  | { k: "leap"; at: number; dist: number; height: number; dur: number };

export interface Skill {
  name: string;
  desc: string;
  anim: string;
  dur: number;
  cd: number;
  fx: Effect[];
  energy?: number;
}

export interface HeroDef {
  id: string;
  name: string;
  hanja: string;
  title: string;
  stars: 4 | 5;
  element: Element;
  faction: "촉" | "위" | "오" | "군웅";
  weaponName: string;
  hp: number;
  atk: number;
  def: number;
  /** Normal-attack combo multipliers. */
  combo: number[];
  skill: Skill;
  burst: Skill;
  quote: string;
  bio: string;
  look: Look;
}

const SKIN = 0xfbe3d2;
const SKIN2 = 0xf2cfb4;

export const HEROES: HeroDef[] = [
  {
    id: "liubei",
    name: "유비",
    hanja: "劉備",
    title: "인덕의 군주",
    stars: 4,
    element: "water",
    faction: "촉",
    weaponName: "쌍고검(雙股劍)",
    hp: 1100,
    atk: 62,
    def: 60,
    combo: [0.55, 0.6, 0.7, 1.1],
    skill: { name: "인의검무", desc: "쌍검으로 원을 그리며 주변을 베고, 파티 전원의 체력을 회복한다.", anim: "spin", dur: 0.8, cd: 10, fx: [{ k: "slash", at: 0.25, range: 3.2, arc: 6.3, dmg: 1.6, el: true }, { k: "heal", at: 0.3, amount: 0.12 }] },
    burst: { name: "도원의 맹세", desc: "복숭아꽃이 흩날리는 결의의 진을 펼친다. 안의 아군은 회복하고 공격력이 오른다.", anim: "raise", dur: 1.2, cd: 16, energy: 60, fx: [{ k: "field", at: 0.6, fwd: 0, radius: 7, dur: 10, tick: 1, dmg: 0.4, el: true, heal: 0.04, fx: "moon" }, { k: "buff", at: 0.6, atk: 0.3, dur: 10 }] },
    quote: "천하의 백성을 위해, 우리 셋이 한날에 죽기를 원하노라.",
    bio: "탁현의 돗자리 장수였던 한 황실의 후예. 관우·장비와 복숭아 동산에서 의형제를 맺었다.",
    look: { skin: SKIN, hair: 0x1a1414, iris: 0x6a3a2a, hairStyle: "topknot", headgear: "guan", gearColor: 0xd8b050, robe: 0x2a6a4a, robe2: 0xf2ead8, trim: 0xd8b050, pants: 0x2a3a30, boots: 0x2a2020, sash: 0xd8b050, beard: "goatee", stern: 0.2, robeLen: 0.72, weapon: { kind: "twin", metal: 0xe6ecf2, accent: 0xd8b050, glow: 0x3ab8ff } },
  },
  {
    id: "guanyu",
    name: "관우",
    hanja: "關羽",
    title: "청룡의 무신",
    stars: 5,
    element: "thunder",
    faction: "촉",
    weaponName: "청룡언월도(靑龍偃月刀)",
    hp: 1250,
    atk: 88,
    def: 68,
    combo: [0.8, 0.85, 1.0, 1.6],
    skill: { name: "청룡참", desc: "언월도를 크게 휘둘러 앞을 쓸어 벤다. 번개가 칼날을 따라 흐른다.", anim: "sweep", dur: 0.9, cd: 8, fx: [{ k: "slash", at: 0.35, range: 5.5, arc: 2.6, dmg: 3.2, el: true, knock: 6 }] },
    burst: { name: "오관참장", desc: "청룡의 번개를 두르고 다섯 번 돌진해 베어 넘긴다.", anim: "dashes", dur: 2.2, cd: 18, energy: 70, fx: [0, 1, 2, 3, 4].map((k) => ({ k: "dash" as const, at: 0.25 + k * 0.36, dist: 7, dur: 0.18, dmg: 2.2, el: true, width: 2.2 })) },
    quote: "대장부가 세상에 나서, 의(義) 하나를 지킬 뿐이다.",
    bio: "붉은 얼굴에 긴 수염, 여든두 근 청룡언월도. 오관을 지나며 여섯 장수를 벤 의리의 화신.",
    look: { skin: 0xe8b09a, hair: 0x141012, iris: 0x2a2a2a, hairStyle: "topknot", headgear: "guan", gearColor: 0x2a6a3a, robe: 0x1f7a4a, robe2: 0xe8dcc0, trim: 0xc8a040, pants: 0x1a3a2a, boots: 0x2a1a14, sash: 0xc8a040, armor: 0x2a4a3a, armorTrim: 0xc8a040, beard: "long", stern: 0.9, flush: 0xd8806a, bulk: 1.12, height: 1.9, robeLen: 0.7, cape: 0x1f7a4a, weapon: { kind: "glaive", metal: 0xdfe6ee, shaft: 0x3a2014, accent: 0xc8a040, glow: 0x3ae07a } },
  },
  {
    id: "zhangfei",
    name: "장비",
    hanja: "張飛",
    title: "장판교의 호걸",
    stars: 4,
    element: "thunder",
    faction: "촉",
    weaponName: "장팔사모(丈八蛇矛)",
    hp: 1300,
    atk: 70,
    def: 72,
    combo: [0.7, 0.75, 0.9, 1.4],
    skill: { name: "장판대갈", desc: "천둥 같은 고함으로 주변 적을 기절시키고 날려 버린다.", anim: "roar", dur: 0.9, cd: 10, fx: [{ k: "blast", at: 0.4, fwd: 0, radius: 6, dmg: 1.8, el: true, knock: 9, stun: 2, fx: "ring" }] },
    burst: { name: "사모난무", desc: "장팔사모를 미친 듯 휘둘러 주위를 쓸어버린다.", anim: "spin3", dur: 2.0, cd: 16, energy: 60, fx: [0, 1, 2, 3, 4, 5].map((k) => ({ k: "slash" as const, at: 0.2 + k * 0.28, range: 4.2, arc: 6.3, dmg: 1.2, el: true, knock: 2 })) },
    quote: "연인 장익덕이 여기 있다! 누가 감히 나와 죽음을 겨루겠느냐!",
    bio: "고리눈에 호랑이 수염. 장판교에서 홀로 조조의 백만 대군을 멈춰 세웠다.",
    look: { skin: 0xe8c0a0, hair: 0x0e0a0a, iris: 0x3a2a1a, hairStyle: "wild", headgear: "headband", gearColor: 0x2a2a2a, robe: 0x3a3a4a, robe2: 0xc8b890, trim: 0x8a2a2a, pants: 0x2a2a30, boots: 0x1a1414, sash: 0x8a2a2a, armor: 0x3a3a3a, armorTrim: 0x8a6a3a, beard: "bushy", stern: 1, bulk: 1.22, height: 1.88, robeLen: 0.5, sleeves: "fitted", weapon: { kind: "serpent", metal: 0xcfd6de, shaft: 0x2a1a14, accent: 0x8a6a3a, glow: 0xb46aff } },
  },
  {
    id: "zhaoyun",
    name: "조운",
    hanja: "趙雲",
    title: "상산의 백룡",
    stars: 5,
    element: "water",
    faction: "촉",
    weaponName: "애각창(涯角槍)",
    hp: 1150,
    atk: 90,
    def: 62,
    combo: [0.6, 0.6, 0.75, 0.75, 1.3],
    skill: { name: "칠진칠출", desc: "창끝에 물의 용을 실어 적진을 꿰뚫고 지나간다.", anim: "thrust", dur: 0.7, cd: 7, fx: [{ k: "dash", at: 0.15, dist: 9, dur: 0.25, dmg: 2.8, el: true, width: 2 }] },
    burst: { name: "장판파의 백룡", desc: "하늘에서 물의 용을 불러 떨어뜨린다.", anim: "leapstrike", dur: 1.4, cd: 16, energy: 70, fx: [{ k: "leap", at: 0.05, dist: 6, height: 5, dur: 0.6 }, { k: "blast", at: 0.7, fwd: 0, radius: 6.5, dmg: 5.5, el: true, knock: 8, fx: "pillar" }] },
    quote: "상산 조자룡이 여기 있다!",
    bio: "장판파에서 어린 주군을 품에 안고 조조의 대군 속을 일곱 번 드나든 은빛 장수.",
    look: { skin: SKIN, hair: 0x2a2226, iris: 0x2a5a8a, hairStyle: "ponytail", headgear: "helm", gearColor: 0xe8eef6, robe: 0xf2f4f8, robe2: 0x3a6aa8, trim: 0x3a6aa8, pants: 0xe8ecf2, boots: 0xd8dde6, sash: 0x3a6aa8, armor: 0xdfe6ee, armorTrim: 0x3a6aa8, stern: 0.3, robeLen: 0.6, sleeves: "fitted", cape: 0x2a5a9a, weapon: { kind: "spear", metal: 0xf0f4f8, shaft: 0xe8e8ee, accent: 0xe02a2a, glow: 0x3ab8ff } },
  },
  {
    id: "lubu",
    name: "여포",
    hanja: "呂布",
    title: "천하무쌍",
    stars: 5,
    element: "fire",
    faction: "군웅",
    weaponName: "방천화극(方天畫戟)",
    hp: 1200,
    atk: 98,
    def: 58,
    combo: [0.85, 0.9, 1.1, 1.8],
    skill: { name: "방천일섬", desc: "방천화극을 한 바퀴 돌려 주위를 불태우며 벤다.", anim: "spin", dur: 0.8, cd: 9, fx: [{ k: "slash", at: 0.3, range: 5, arc: 6.3, dmg: 3.0, el: true, knock: 5 }] },
    burst: { name: "적토천리", desc: "적토마처럼 불길을 두르고 일직선으로 돌진한 뒤 폭발한다.", anim: "charge", dur: 1.4, cd: 18, energy: 80, fx: [{ k: "dash", at: 0.2, dist: 14, dur: 0.45, dmg: 3, el: true, width: 3 }, { k: "blast", at: 0.75, fwd: 0, radius: 6, dmg: 5, el: true, knock: 10, fx: "burst" }] },
    quote: "사람 중엔 여포, 말 중엔 적토. 누가 나를 막겠느냐.",
    bio: "호뢰관에서 유비·관우·장비 셋을 홀로 상대한 최강의 무인. 머리에 긴 꿩 깃털을 꽂았다.",
    look: { skin: SKIN, hair: 0x1a1016, iris: 0xc02a2a, hairStyle: "long", headgear: "plume", gearColor: 0xe8b83a, robe: 0x8a1a2a, robe2: 0x2a1a20, trim: 0xe8b83a, pants: 0x2a1a1e, boots: 0x2a1a1a, sash: 0xe8b83a, armor: 0x3a1a24, armorTrim: 0xe8b83a, stern: 0.7, bulk: 1.1, height: 1.9, robeLen: 0.6, sleeves: "fitted", cape: 0xb01a2a, weapon: { kind: "halberd", metal: 0xe8dcc0, shaft: 0x6a1a1a, accent: 0xe8b83a, glow: 0xff6a2a } },
  },
  {
    id: "zhugeliang",
    name: "제갈량",
    hanja: "諸葛亮",
    title: "와룡",
    stars: 5,
    element: "wind",
    faction: "촉",
    weaponName: "백우선(白羽扇)",
    hp: 1000,
    atk: 86,
    def: 55,
    combo: [0.7, 0.8, 1.2],
    skill: { name: "팔진도", desc: "바람으로 된 팔괘의 진을 펼쳐 안의 적을 끌어들이고 벤다.", anim: "cast", dur: 0.8, cd: 12, fx: [{ k: "field", at: 0.4, fwd: 5, radius: 5, dur: 6, tick: 0.8, dmg: 0.9, el: true, pull: 3, fx: "formation" }] },
    burst: { name: "동남풍", desc: "칠성단에서 빈 동남풍을 불러, 거대한 회오리로 적을 휘감는다.", anim: "raise", dur: 1.3, cd: 18, energy: 70, fx: [{ k: "field", at: 0.6, fwd: 6, radius: 6.5, dur: 7, tick: 0.5, dmg: 1.1, el: true, pull: 7, fx: "tornado" }] },
    quote: "동남풍이 불 것이오.",
    bio: "융중에서 천하삼분을 그린 와룡 선생. 흰 깃털 부채 하나로 바람과 전장을 부린다.",
    look: { skin: SKIN, hair: 0x1a1618, iris: 0x3a5a4a, hairStyle: "long", headgear: "scholar", gearColor: 0x2a3a5a, robe: 0xf0ede4, robe2: 0x2a3a5a, trim: 0x2a3a5a, pants: 0xe0dccf, boots: 0x2a2a30, sash: 0x2a3a5a, beard: "goatee", stern: 0, robeLen: 0.85, cape: 0x2a3a5a, weapon: { kind: "fan", accent: 0x2a3a5a, glow: 0x5ae8b8 } },
  },
  {
    id: "zhouyu",
    name: "주유",
    hanja: "周瑜",
    title: "적벽의 미주랑",
    stars: 5,
    element: "fire",
    faction: "오",
    weaponName: "고정도(古錠刀)",
    hp: 1050,
    atk: 92,
    def: 58,
    combo: [0.55, 0.6, 0.65, 0.8, 1.2],
    skill: { name: "화공계", desc: "불꽃 검기를 부채꼴로 날린다.", anim: "slashwave", dur: 0.6, cd: 8, fx: [{ k: "shot", at: 0.25, speed: 26, dmg: 1.6, el: true, splash: 2.2, count: 3, spread: 0.35, fx: "blade" }] },
    burst: { name: "적벽대화", desc: "하늘을 가르는 불화살의 비를 내려, 적벽의 불길을 재현한다.", anim: "raise", dur: 1.2, cd: 18, energy: 80, fx: [{ k: "rain", at: 0.5, fwd: 7, radius: 7, count: 36, dur: 3, dmg: 1.2, el: true }] },
    quote: "동풍이 불면, 조조의 수군은 재가 되리라.",
    bio: "오의 대도독. 음악을 알고 병법에 밝으며, 적벽에서 조조의 대선단을 불살랐다.",
    look: { skin: SKIN, hair: 0x2a1c1a, iris: 0x8a3a2a, hairStyle: "ponytail", headgear: "guan", gearColor: 0xe8b83a, robe: 0xc8302a, robe2: 0xf6ecd8, trim: 0xe8b83a, pants: 0x3a2020, boots: 0x2a1a1a, sash: 0xe8b83a, armor: 0x8a2a24, armorTrim: 0xe8b83a, stern: 0.2, robeLen: 0.62, cape: 0xf6ecd8, weapon: { kind: "sword", metal: 0xf0e8e0, accent: 0xe8b83a, glow: 0xff6a2a } },
  },
  {
    id: "huangzhong",
    name: "황충",
    hanja: "黃忠",
    title: "백발의 신궁",
    stars: 4,
    element: "fire",
    faction: "촉",
    weaponName: "철태궁(鐵胎弓)",
    hp: 1050,
    atk: 72,
    def: 60,
    combo: [0.6, 0.65, 0.8, 0.9],
    skill: { name: "백보천양", desc: "불붙은 화살을 힘껏 당겨 쏘아 적중한 곳을 폭발시킨다.", anim: "aim", dur: 0.8, cd: 8, fx: [{ k: "shot", at: 0.5, speed: 60, dmg: 3.0, el: true, splash: 3.5, fx: "arrow" }] },
    burst: { name: "정군산의 화살비", desc: "하늘로 쏜 화살이 불비가 되어 내린다.", anim: "skyshot", dur: 1.0, cd: 15, energy: 60, fx: [{ k: "rain", at: 0.5, fwd: 9, radius: 6, count: 28, dur: 2.5, dmg: 1.0, el: true }] },
    quote: "늙었다고? 이 활이 대답하리라!",
    bio: "예순이 넘어서도 백 보 밖의 버들잎을 꿰뚫는 노장. 정군산에서 하후연을 베었다.",
    look: { skin: 0xf0d0b8, hair: 0xe6e2dc, iris: 0x5a4a3a, hairStyle: "topknot", headgear: "guan", gearColor: 0x8a6a2a, robe: 0xc8902a, robe2: 0x5a3a1a, trim: 0x5a3a1a, pants: 0x3a2a1a, boots: 0x2a1a14, sash: 0x5a3a1a, armor: 0x8a6a3a, armorTrim: 0x5a3a1a, beard: "long", stern: 0.6, robeLen: 0.55, sleeves: "fitted", weapon: { kind: "bow", shaft: 0x3a2a1a, accent: 0x8a6a2a, glow: 0xff6a2a } },
  },
  {
    id: "diaochan",
    name: "초선",
    hanja: "貂蟬",
    title: "폐월",
    stars: 4,
    element: "water",
    faction: "군웅",
    weaponName: "월광선(月光扇)",
    hp: 980,
    atk: 64,
    def: 52,
    combo: [0.5, 0.55, 0.9],
    skill: { name: "폐월무", desc: "달빛 아래 춤추며 물방울 꽃을 피워 주위를 치고 아군을 치유한다.", anim: "spin", dur: 0.9, cd: 10, fx: [{ k: "blast", at: 0.45, fwd: 0, radius: 4.5, dmg: 1.3, el: true, fx: "ring" }, { k: "heal", at: 0.5, amount: 0.15 }] },
    burst: { name: "연환계", desc: "달의 결계로 적을 묶어 두고 아군을 계속 치유한다.", anim: "raise", dur: 1.2, cd: 16, energy: 60, fx: [{ k: "field", at: 0.6, fwd: 3, radius: 6, dur: 8, tick: 1, dmg: 0.7, el: true, heal: 0.05, pull: 1.5, fx: "moon" }] },
    quote: "달도 구름 뒤로 숨는다지요.",
    bio: "달이 부끄러워 구름 뒤에 숨었다는 미인. 연환계로 동탁과 여포를 갈라놓았다.",
    look: { skin: 0xfde8dc, hair: 0x1a1220, iris: 0x7a4ab0, female: true, hairStyle: "bun", headgear: "pins", gearColor: 0xe8c860, robe: 0xe8a0c0, robe2: 0xfff4f6, trim: 0xb04a8a, pants: 0xf6d8e6, boots: 0xb04a8a, sash: 0xb04a8a, robeLen: 0.82, scarf: 0xf6e0f0, weapon: { kind: "fan", accent: 0xe8c860, glow: 0x3ab8ff } },
  },
  {
    id: "sunshangxiang",
    name: "손상향",
    hanja: "孫尙香",
    title: "궁요희",
    stars: 4,
    element: "wind",
    faction: "오",
    weaponName: "건곤권(乾坤圈)",
    hp: 1000,
    atk: 70,
    def: 55,
    combo: [0.55, 0.55, 0.7, 1.0],
    skill: { name: "선풍사", desc: "바람을 두른 화살 세 대를 부채꼴로 쏜다.", anim: "aim", dur: 0.6, cd: 7, fx: [{ k: "shot", at: 0.35, speed: 50, dmg: 1.4, el: true, count: 3, spread: 0.25, splash: 2, fx: "arrow" }] },
    burst: { name: "강동의 폭풍", desc: "회오리를 쏘아 보내 적을 모으고 흩뜨린다.", anim: "skyshot", dur: 1.0, cd: 15, energy: 60, fx: [{ k: "field", at: 0.5, fwd: 8, radius: 5, dur: 5, tick: 0.5, dmg: 0.9, el: true, pull: 5, fx: "tornado" }] },
    quote: "오라버니들보다 내가 먼저다!",
    bio: "손견의 딸, 손권의 누이. 시녀들까지 칼을 차게 한 활달한 무희.",
    look: { skin: 0xfbe0d0, hair: 0x5a2a1a, iris: 0x2a8a5a, female: true, hairStyle: "twin", headgear: "none", gearColor: 0xe8b83a, robe: 0xd84a3a, robe2: 0xf6ecd8, trim: 0xe8b83a, pants: 0xf6ecd8, boots: 0x8a2a1a, sash: 0xe8b83a, robeLen: 0.4, sleeves: "fitted", scarf: 0xe8b83a, weapon: { kind: "bow", shaft: 0x8a2a1a, accent: 0xe8b83a, glow: 0x5ae8b8 } },
  },
  {
    id: "machao",
    name: "마초",
    hanja: "馬超",
    title: "서량의 금마",
    stars: 4,
    element: "wind",
    faction: "촉",
    weaponName: "호두창(虎頭槍)",
    hp: 1100,
    atk: 74,
    def: 60,
    combo: [0.6, 0.65, 0.7, 1.2],
    skill: { name: "서량철기", desc: "바람처럼 짧게 두 번 돌진하며 찌른다.", anim: "thrust", dur: 0.8, cd: 8, fx: [{ k: "dash", at: 0.1, dist: 5, dur: 0.15, dmg: 1.4, el: true }, { k: "dash", at: 0.45, dist: 5, dur: 0.15, dmg: 1.6, el: true }] },
    burst: { name: "금마질풍", desc: "창을 회오리처럼 돌려 거대한 바람을 일으킨다.", anim: "spin3", dur: 1.6, cd: 16, energy: 60, fx: [0, 1, 2, 3].map((k) => ({ k: "slash" as const, at: 0.25 + k * 0.3, range: 5, arc: 6.3, dmg: 1.3, el: true, knock: 3 })) },
    quote: "아버지의 원수, 이 창으로 갚으리라.",
    bio: "사자 투구에 흰 전포, 서량의 금마초. 동관에서 조조가 수염을 자르고 도망치게 했다.",
    look: { skin: SKIN2, hair: 0x3a2a20, iris: 0x8a6a2a, hairStyle: "ponytail", headgear: "helm", gearColor: 0xd8c070, robe: 0xf0ece0, robe2: 0x5a8a8a, trim: 0xd8c070, pants: 0xe8e4d8, boots: 0x6a5a3a, sash: 0xd8c070, armor: 0xd8c070, armorTrim: 0x5a8a8a, stern: 0.5, robeLen: 0.55, sleeves: "fitted", cape: 0xf0ece0, weapon: { kind: "spear", metal: 0xe8d8a0, shaft: 0x6a4a2a, accent: 0x2a6a6a, glow: 0x5ae8b8 } },
  },
];

export const HERO = Object.fromEntries(HEROES.map((h) => [h.id, h])) as Record<string, HeroDef>;

/** Enemy looks: the Yellow Turbans. */
export const TURBAN_LOOKS: Record<string, Look> = {
  grunt: { skin: 0xe8c0a0, hair: 0x2a2020, iris: 0x3a2a1a, hairStyle: "short", headgear: "headband", gearColor: 0xe8c43a, robe: 0x8a7a5a, robe2: 0xc8b890, trim: 0xe8c43a, pants: 0x5a4a3a, boots: 0x3a2a1a, sash: 0xe8c43a, stern: 0.8, robeLen: 0.4, sleeves: "fitted", weapon: { kind: "club", shaft: 0x5a3a1a } },
  spear: { skin: 0xe0b898, hair: 0x1a1414, iris: 0x3a2a1a, hairStyle: "short", headgear: "headband", gearColor: 0xe8c43a, robe: 0x6a6a4a, robe2: 0xc8b890, trim: 0xe8c43a, pants: 0x4a4030, boots: 0x3a2a1a, sash: 0xe8c43a, stern: 0.9, robeLen: 0.45, sleeves: "fitted", weapon: { kind: "spear", metal: 0xb8b0a0, shaft: 0x5a3a1a, accent: 0xe8c43a } },
  archer: { skin: 0xe8c8a8, hair: 0x2a2020, iris: 0x3a2a1a, hairStyle: "short", headgear: "headband", gearColor: 0xe8c43a, robe: 0x7a6a4a, robe2: 0xc8b890, trim: 0xe8c43a, pants: 0x4a4030, boots: 0x3a2a1a, sash: 0xe8c43a, stern: 0.6, robeLen: 0.4, sleeves: "fitted", weapon: { kind: "bow", shaft: 0x5a3a1a } },
  sorcerer: { skin: 0xe8d0b0, hair: 0x6a6a6a, iris: 0xc8a020, hairStyle: "long", headgear: "hood", gearColor: 0xd8b030, robe: 0xd8b030, robe2: 0x3a2a1a, trim: 0x3a2a1a, pants: 0x5a4a2a, boots: 0x2a1a14, sash: 0x3a2a1a, beard: "long", stern: 0.9, robeLen: 0.85, weapon: { kind: "staff", shaft: 0x3a2a1a, accent: 0xd8b030, glow: 0xffd040 } },
  captain: { skin: 0xd8a888, hair: 0x1a1010, iris: 0xa02020, hairStyle: "wild", headgear: "headband", gearColor: 0xe8c43a, robe: 0x5a4a2a, robe2: 0x8a2a2a, trim: 0xe8c43a, pants: 0x3a3020, boots: 0x2a1a14, sash: 0xe8c43a, armor: 0x4a3a2a, armorTrim: 0xe8c43a, beard: "bushy", stern: 1, bulk: 1.3, height: 2.05, robeLen: 0.5, sleeves: "fitted", weapon: { kind: "glaive", metal: 0xa8a090, shaft: 0x3a2014, accent: 0xe8c43a } },
};
