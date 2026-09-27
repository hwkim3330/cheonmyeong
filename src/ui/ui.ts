/**
 * The screens. In play: a round minimap turning with the camera (beacons, camps, the quest
 * marker), 원보 and the menu buttons, the quest line, the party down the right with their
 * portraits and health, the skill (E) and burst (Q) buttons with their cooldown sweep and
 * energy ring, the hero's health and a stamina wheel, health bars and element marks over
 * enemies, floating damage numbers, prompts, toasts, the boss's bar. Menus: dialogue, 천명 소환
 * (with its falling-star animation and reveal cards), the party (swap, level up with books,
 * skills), the map (fast travel), the title.
 */
import * as THREE from "three";
import { ELEMENT_COLOR, ELEMENT_NAME, HERO, HEROES } from "../data/heroes";
import { BEACONS, CAMPS, HALF, WATER, WORLD } from "../world/layout";
import type { Terrain } from "../world/terrain";
import { BANNERS, PULL_COST, Profile, summon, type PullResult } from "../game/profile";
import { STAMINA } from "../game/player";
import type { Enemy } from "../game/enemies";
import type { Member } from "../game/party";
import type { Popup } from "../game/combat";
import { portrait } from "./portrait";

const hex = (c: number) => "#" + c.toString(16).padStart(6, "0");
const $ = (id: string) => document.getElementById(id)!;
const EL_ICON: Record<string, string> = { fire: "火", water: "水", thunder: "雷", wind: "風" };

export interface UIHost {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  t: Terrain;
  profile: Profile;
  playerPos: () => THREE.Vector3;
  camYaw: () => number;
  party: () => Member[];
  active: () => number;
  stamina: () => number;
  staminaShow: () => number;
  enemies: () => Enemy[];
  popups: Popup[];
  questText: () => { title: string; text: string; target: [number, number] | null };
  teleport: (id: string) => void;
  applyParty: () => void;
  setBlocked: (b: boolean) => void;
  energyCost: (m: Member) => number;
  boss: () => Enemy | null;
}

export class UI {
  private readonly root: HTMLElement;
  private readonly mini: HTMLCanvasElement;
  private readonly miniBase: HTMLCanvasElement;
  private readonly bars = new Map<number, HTMLElement>();
  private readonly pops: { el: HTMLElement; pos: THREE.Vector3; t: number }[] = [];
  private modal: string | null = null;
  private dialogueQ: { who: string; text: string; face?: string }[] = [];
  private dialogueDone: (() => void) | null = null;
  private bannerIdx = 0;
  private partyKey = "";

  constructor(readonly h: UIHost) {
    this.root = $("ui");
    this.root.innerHTML = `
      <div id="hud">
        <div id="mini"><canvas id="miniC" width="200" height="200"></canvas><div class="n">北</div></div>
        <div id="topR"><div class="yb"><i>元</i><b id="yb">0</b></div><button id="bWish" title="B">천명 소환 <kbd>B</kbd></button><button id="bParty" title="C">파티 <kbd>C</kbd></button><button id="bMap" title="M">지도 <kbd>M</kbd></button></div>
        <div id="quest"><div class="qt" id="qt"></div><div class="qx" id="qx"></div></div>
        <div id="partyBar"></div>
        <div id="skills"><div class="sk" id="skE"><div class="ic">E</div><div class="cd" id="cdE"></div><div class="nm" id="nmE"></div></div><div class="sk q" id="skQ"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" class="bg"/><circle cx="50" cy="50" r="46" class="fg" id="enQ"/></svg><div class="ic">Q</div><div class="cd" id="cdQ"></div><div class="nm" id="nmQ"></div></div></div>
        <div id="hp"><div class="lv" id="hpLv"></div><div class="bar"><i id="hpBar"></i></div><div class="num" id="hpNum"></div></div>
        <svg id="stam" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" class="bg"/><circle cx="50" cy="50" r="40" class="fg" id="stamC"/></svg>
        <div id="prompt" class="off"></div>
        <div id="bossBar" class="off"><div class="nm" id="bossNm"></div><div class="bar"><i id="bossHp"></i></div></div>
        <div id="toasts"></div>
        <div id="bars"></div>
        <div id="pops"></div>
        <div id="help">WASD 이동 · Shift 대시/질주 · Space 점프/활공 · 클릭 공격 · E 전법 · Q 필살 · 1–4 교체 · F 조사 · F8 그래픽 · 마우스 시점(클릭하면 고정)</div>
      </div>
      <div id="dlg" class="off"><div class="face" id="dlgFace"></div><div class="body"><div class="who" id="dlgWho"></div><div class="txt" id="dlgTxt"></div><div class="next">▼ 클릭 / F</div></div></div>
      <div id="screen" class="off"></div>`;
    this.mini = $("miniC") as HTMLCanvasElement;
    this.miniBase = this.bakeMinimap();
    $("bWish").onclick = () => this.open("wish");
    $("bParty").onclick = () => this.open("party");
    $("bMap").onclick = () => this.open("map");
    $("dlg").onclick = () => this.advanceDialogue();
    window.addEventListener("keydown", (e) => {
      if (e.code === "KeyB" && !this.dialogueQ.length) this.toggle("wish");
      if (e.code === "KeyC" && !this.dialogueQ.length) this.toggle("party");
      if (e.code === "KeyM" && !this.dialogueQ.length) this.toggle("map");
      if (e.code === "Escape" && this.modal) this.close();
      if (e.code === "KeyF" && this.dialogueQ.length) this.advanceDialogue();
    });
  }

  // ------------------------------------------------------------------ minimap

  private bakeMinimap(): HTMLCanvasElement {
    const S = 512;
    const c = document.createElement("canvas");
    c.width = c.height = S;
    const g = c.getContext("2d")!;
    const img = g.createImageData(S, S);
    const t = this.h.t;
    for (let j = 0; j < S; j++)
      for (let i = 0; i < S; i++) {
        const x = (i / S) * WORLD - HALF;
        const z = (j / S) * WORLD - HALF;
        const y = t.height(x, z);
        const n = t.normal(x, z);
        const k = (j * S + i) * 4;
        let r = 110, gg = 160, b = 90;
        if (y < WATER - 0.3) [r, gg, b] = [90, 170, 200];
        else if (n.y < 0.62) [r, gg, b] = [170, 172, 170];
        else if (t.sample(x, z, 0) > 0.4) [r, gg, b] = [205, 180, 130];
        else if (y > 80) [r, gg, b] = [120, 150, 110];
        const shade = 0.75 + Math.max(0, n.x * 0.5 - n.z * 0.3) * 0.6;
        img.data[k] = Math.min(255, r * shade);
        img.data[k + 1] = Math.min(255, gg * shade);
        img.data[k + 2] = Math.min(255, b * shade);
        img.data[k + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    return c;
  }

  private drawMinimap(): void {
    const g = this.mini.getContext("2d")!;
    const W = 200;
    const p = this.h.playerPos();
    const scale = 1.4; // px per metre
    g.save();
    g.clearRect(0, 0, W, W);
    g.beginPath();
    g.arc(W / 2, W / 2, W / 2 - 2, 0, Math.PI * 2);
    g.clip();
    g.translate(W / 2, W / 2);
    g.rotate(this.h.camYaw() - Math.PI);
    const k = (512 / WORLD) ;
    g.drawImage(this.miniBase, (p.x + HALF) * k - (W / 2 / scale) * k * 1.5, (p.z + HALF) * k - (W / 2 / scale) * k * 1.5, (W / scale) * k * 1.5, (W / scale) * k * 1.5, -W * 0.75, -W * 0.75, W * 1.5, W * 1.5);
    const mark = (x: number, z: number, draw: (x: number, y: number) => void) => {
      const dx = (x - p.x) * scale;
      const dz = (z - p.z) * scale;
      draw(dx, dz);
    };
    const lit = new Set(this.h.profile.d.beacons);
    for (const b of BEACONS)
      mark(b.x, b.z, (x, y) => {
        g.fillStyle = lit.has(b.id) ? "#6ae0ff" : "#8a8a8a";
        g.beginPath();
        g.moveTo(x, y - 7);
        g.lineTo(x + 5, y + 5);
        g.lineTo(x - 5, y + 5);
        g.fill();
      });
    const cleared = new Set(this.h.profile.d.camps);
    CAMPS.forEach((c, i) => {
      if (cleared.has(i)) return;
      mark(c.x, c.z, (x, y) => {
        g.fillStyle = c.boss ? "#ff4a3a" : "#e8c43a";
        g.beginPath();
        g.arc(x, y, c.boss ? 7 : 5, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = "#2a1a10";
        g.lineWidth = 2;
        g.stroke();
      });
    });
    const q = this.h.questText().target;
    if (q)
      mark(q[0], q[1], (x, y) => {
        const d = Math.hypot(x, y);
        const R = W / 2 - 12;
        if (d > R) {
          x *= R / d;
          y *= R / d;
        }
        g.fillStyle = "#ffd84a";
        g.beginPath();
        g.moveTo(x, y - 8);
        g.lineTo(x + 6, y);
        g.lineTo(x, y + 8);
        g.lineTo(x - 6, y);
        g.fill();
      });
    g.restore();
    // Player arrow (always up: the map turns).
    g.fillStyle = "#fff";
    g.beginPath();
    g.moveTo(W / 2, W / 2 - 9);
    g.lineTo(W / 2 + 6, W / 2 + 6);
    g.lineTo(W / 2, W / 2 + 2);
    g.lineTo(W / 2 - 6, W / 2 + 6);
    g.fill();
  }

  // ------------------------------------------------------------------ per frame

  update(dt: number): void {
    const P = this.h.profile.d;
    $("yb").textContent = P.yuanbao.toLocaleString();
    this.drawMinimap();
    const q = this.h.questText();
    $("qt").textContent = q.title;
    $("qx").textContent = q.text;
    // Party bar.
    const party = this.h.party();
    const key = party.map((m) => m.def.id).join(",");
    if (key !== this.partyKey) {
      this.partyKey = key;
      $("partyBar").innerHTML = party
        .map((m, i) => `<div class="pm" data-i="${i}"><img src="${portrait(this.h.renderer, m.def.id)}"/><div class="nm">${m.def.name}</div><div class="k">${i + 1}</div><div class="hb"><i></i></div><div class="el" style="color:${hex(ELEMENT_COLOR[m.def.element])}">${EL_ICON[m.def.element]}</div></div>`)
        .join("");
    }
    const act = this.h.active();
    document.querySelectorAll<HTMLElement>("#partyBar .pm").forEach((el, i) => {
      const m = party[i];
      if (!m) return;
      el.classList.toggle("on", i === act);
      el.classList.toggle("down", m.hp <= 0);
      el.classList.toggle("ready", m.energy >= this.h.energyCost(m));
      (el.querySelector(".hb i") as HTMLElement).style.width = `${(m.hp / m.maxHp) * 100}%`;
    });
    const m = party[act];
    if (m) {
      $("hpLv").textContent = `Lv.${m.level} ${m.def.name}`;
      ($("hpBar") as HTMLElement).style.width = `${(m.hp / m.maxHp) * 100}%`;
      $("hpNum").textContent = `${Math.ceil(m.hp)} / ${m.maxHp}`;
      $("nmE").textContent = m.def.skill.name;
      $("nmQ").textContent = m.def.burst.name;
      $("cdE").textContent = m.cdE > 0 ? m.cdE.toFixed(1) : "";
      $("skE").classList.toggle("cool", m.cdE > 0);
      $("skE").style.setProperty("--el", hex(ELEMENT_COLOR[m.def.element]));
      $("skQ").style.setProperty("--el", hex(ELEMENT_COLOR[m.def.element]));
      const cost = this.h.energyCost(m);
      const k = Math.min(1, m.energy / cost);
      ($("enQ") as unknown as SVGCircleElement).style.strokeDashoffset = String(289 * (1 - k));
      $("skQ").classList.toggle("ready", k >= 1);
    }
    // Stamina wheel, beside the hero.
    const sv = this.h.staminaShow();
    const st = $("stam");
    st.style.opacity = sv > 0 ? "1" : "0";
    const s = this.h.stamina() / STAMINA;
    ($("stamC") as unknown as SVGCircleElement).style.strokeDashoffset = String(251 * (1 - s));
    ($("stamC") as unknown as SVGCircleElement).style.stroke = s < 0.25 ? "#ff7a5a" : "#ffe27a";
    this.enemyBars();
    this.floatPopups(dt);
    const boss = this.h.boss();
    $("bossBar").classList.toggle("off", !boss);
    if (boss) {
      $("bossNm").textContent = `Lv.${boss.level} ${boss.def.name}`;
      ($("bossHp") as HTMLElement).style.width = `${Math.max(0, boss.hp / boss.maxHp) * 100}%`;
    }
  }

  private project(p: THREE.Vector3): [number, number, boolean] {
    const v = p.clone().project(this.h.camera);
    return [((v.x + 1) / 2) * window.innerWidth, ((1 - v.y) / 2) * window.innerHeight, v.z < 1 && v.z > -1];
  }

  private enemyBars(): void {
    const seen = new Set<number>();
    const pp = this.h.playerPos();
    for (const e of this.h.enemies()) {
      if (!e.alive || !e.rig || e.kind === "boss") continue;
      if (e.pos.distanceTo(pp) > 28 || (e.state === "idle" && e.hp >= e.maxHp)) continue;
      const [x, y, ok] = this.project(e.pos.clone().add(new THREE.Vector3(0, 2.3 * e.def.scale, 0)));
      if (!ok) continue;
      seen.add(e.id);
      let el = this.bars.get(e.id);
      if (!el) {
        el = document.createElement("div");
        el.className = "eb";
        el.innerHTML = `<div class="au"></div><div class="lv">Lv.${e.level}</div><div class="bar"><i></i></div>`;
        $("bars").appendChild(el);
        this.bars.set(e.id, el);
      }
      el.style.transform = `translate(${x}px, ${y}px)`;
      (el.querySelector(".bar i") as HTMLElement).style.width = `${Math.max(0, e.hp / e.maxHp) * 100}%`;
      const au = el.querySelector(".au") as HTMLElement;
      au.textContent = e.aura ? EL_ICON[e.aura.el] : "";
      au.style.color = e.aura ? hex(ELEMENT_COLOR[e.aura.el]) : "";
      el.classList.toggle("elite", e.kind === "captain");
    }
    for (const [id, el] of this.bars)
      if (!seen.has(id)) {
        el.remove();
        this.bars.delete(id);
      }
  }

  private floatPopups(dt: number): void {
    for (const p of this.h.popups.splice(0)) {
      const el = document.createElement("div");
      el.className = "pop";
      el.textContent = p.text;
      el.style.color = p.color;
      el.style.fontSize = `${p.size}px`;
      $("pops").appendChild(el);
      this.pops.push({ el, pos: p.pos.clone(), t: 0 });
    }
    for (const p of this.pops) {
      p.t += dt;
      p.pos.y += dt * 1.2;
      const [x, y, ok] = this.project(p.pos);
      p.el.style.transform = `translate(${x}px, ${y}px) scale(${p.t < 0.1 ? 1.4 - p.t * 4 : 1})`;
      p.el.style.opacity = ok ? String(Math.max(0, 1 - Math.max(0, p.t - 0.6) * 2.5)) : "0";
    }
    for (const p of this.pops.filter((q) => q.t > 1.1)) p.el.remove();
    for (let i = this.pops.length - 1; i >= 0; i--) if (this.pops[i].t > 1.1) this.pops.splice(i, 1);
  }

  prompt(text: string | null): void {
    const el = $("prompt");
    el.classList.toggle("off", !text);
    if (text) el.innerHTML = `<kbd>F</kbd> ${text}`;
  }

  toast(text: string, kind = ""): void {
    const d = document.createElement("div");
    d.className = `toast ${kind}`;
    d.innerHTML = text;
    $("toasts").appendChild(d);
    setTimeout(() => d.classList.add("gone"), 2600);
    setTimeout(() => d.remove(), 3400);
  }

  /** A large centred banner (quest start/complete, area names). */
  banner(title: string, sub = ""): void {
    const d = document.createElement("div");
    d.className = "bigBanner";
    d.innerHTML = `<b>${title}</b>${sub ? `<span>${sub}</span>` : ""}`;
    this.root.appendChild(d);
    setTimeout(() => d.classList.add("gone"), 2800);
    setTimeout(() => d.remove(), 3600);
  }

  // ------------------------------------------------------------------ dialogue

  get talking(): boolean {
    return this.dialogueQ.length > 0;
  }

  dialogue(lines: { who: string; text: string; face?: string }[], done?: () => void): void {
    this.dialogueQ = [...lines];
    this.dialogueDone = done ?? null;
    this.h.setBlocked(true);
    document.exitPointerLock?.();
    this.showLine();
  }

  private showLine(): void {
    const l = this.dialogueQ[0];
    $("dlg").classList.toggle("off", !l);
    if (!l) return;
    $("dlgWho").textContent = l.who;
    $("dlgTxt").textContent = l.text;
    $("dlgFace").innerHTML = l.face ? `<img src="${portrait(this.h.renderer, l.face)}"/>` : "";
    $("dlgFace").style.display = l.face ? "" : "none";
  }

  private advanceDialogue(): void {
    this.dialogueQ.shift();
    if (!this.dialogueQ.length) {
      $("dlg").classList.add("off");
      this.h.setBlocked(!!this.modal);
      const d = this.dialogueDone;
      this.dialogueDone = null;
      d?.();
    } else this.showLine();
  }

  // ------------------------------------------------------------------ screens

  get isOpen(): boolean {
    return !!this.modal;
  }

  toggle(name: string): void {
    if (this.modal === name) this.close();
    else this.open(name);
  }

  close(): void {
    this.modal = null;
    $("screen").classList.add("off");
    this.h.setBlocked(false);
  }

  open(name: string): void {
    this.modal = name;
    this.h.setBlocked(true);
    document.exitPointerLock?.();
    const el = $("screen");
    el.classList.remove("off");
    if (name === "wish") this.wishScreen(el);
    if (name === "party") this.partyScreen(el, 0);
    if (name === "map") this.mapScreen(el);
  }

  private wishScreen(el: HTMLElement): void {
    const P = this.h.profile;
    const b = BANNERS[this.bannerIdx];
    const f = HERO[b.featured];
    el.className = "wish";
    el.innerHTML = `
      <div class="wtop"><div class="tabs">${BANNERS.map((bb, i) => `<button data-b="${i}" class="${i === this.bannerIdx ? "on" : ""}">${HERO[bb.featured].name}</button>`).join("")}</div>
        <div class="yb"><i>元</i><b>${P.d.yuanbao.toLocaleString()}</b></div><button class="x" id="wClose">✕</button></div>
      <div class="wbanner" style="--el:${hex(ELEMENT_COLOR[f.element])}">
        <img class="art" src="${portrait(this.h.renderer, f.id, "card")}"/>
        <div class="info"><div class="kind">천명 소환 · 기간 한정</div><h1>${b.name}</h1><div class="hero">${"★".repeat(5)} <b>${f.name}</b> <small>${f.hanja} · ${f.title}</small></div>
          <div class="el">${ELEMENT_NAME[f.element]} · ${f.weaponName}</div><p class="q">「${f.quote}」</p><p>${b.blurb}<br>4★ 확률 상승: ${b.four.map((id) => HERO[id].name).join(" · ")}</p>
          <p class="pity">5★까지 ${90 - P.d.pity5}회 이내 보장 · 4★까지 ${10 - P.d.pity4}회 이내${P.d.guarantee ? " · <b>다음 5★는 픽업 확정</b>" : ""}</p></div>
      </div>
      <div class="wbtns"><button id="w1" ${P.d.yuanbao < PULL_COST ? "disabled" : ""}>1회 소환<small>元 ${PULL_COST}</small></button><button id="w10" class="main" ${P.d.yuanbao < PULL_COST * 10 ? "disabled" : ""}>10회 소환<small>元 ${PULL_COST * 10}</small></button></div>
      <p class="fine">원보는 보물상자 · 천명석 · 봉화대 · 황건적 토벌로 얻습니다. 실제 돈은 쓰지 않습니다.</p>`;
    el.querySelectorAll<HTMLButtonElement>("[data-b]").forEach((bt) => (bt.onclick = () => {
      this.bannerIdx = +bt.dataset.b!;
      this.wishScreen(el);
    }));
    $("wClose").onclick = () => this.close();
    const go = (n: number) => {
      const res = summon(P, b, n);
      if (res) this.pullAnimation(el, res);
    };
    $("w1").onclick = () => go(1);
    $("w10").onclick = () => go(10);
  }

  /** Stars fall from the night sky — blue, purple or gold — then the cards turn over. */
  private pullAnimation(el: HTMLElement, res: PullResult[]): void {
    const top = Math.max(...res.map((r) => r.stars));
    const col = top === 5 ? "#ffd86a" : top === 4 ? "#c48aff" : "#8ac8ff";
    el.className = "pull";
    el.innerHTML = `<canvas id="sky"></canvas><button class="skip" id="skip">건너뛰기 ▶▶</button>`;
    const cv = $("sky") as HTMLCanvasElement;
    cv.width = window.innerWidth;
    cv.height = window.innerHeight;
    const g = cv.getContext("2d")!;
    const stars = Array.from({ length: 220 }, () => [Math.random() * cv.width, Math.random() * cv.height, Math.random()]);
    const t0 = performance.now();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      this.pullResults(el, res);
    };
    $("skip").onclick = finish;
    const loop = () => {
      if (done) return;
      const t = (performance.now() - t0) / 1000;
      g.fillStyle = "#070a1c";
      g.fillRect(0, 0, cv.width, cv.height);
      for (const [x, y, k] of stars) {
        g.fillStyle = `rgba(255,255,255,${0.3 + 0.7 * Math.abs(Math.sin(t * 2 + k * 9))})`;
        g.fillRect(x, y, 2, 2);
      }
      // The meteor(s).
      const n = Math.min(res.length, 5);
      for (let i = 0; i < n; i++) {
        const u = Math.min(1, Math.max(0, (t - i * 0.08) / 1.8));
        const x0 = cv.width * (0.95 - i * 0.04);
        const y0 = cv.height * (0.02 + i * 0.03);
        const x1 = cv.width * (0.45 + i * 0.03);
        const y1 = cv.height * 0.62;
        const x = x0 + (x1 - x0) * u;
        const y = y0 + (y1 - y0) * u;
        const gr = g.createLinearGradient(x, y, x + (x0 - x1) * 0.25, y + (y0 - y1) * 0.25);
        gr.addColorStop(0, i === 0 ? col : "#aac8ff");
        gr.addColorStop(1, "rgba(0,0,0,0)");
        g.strokeStyle = gr;
        g.lineWidth = i === 0 ? 10 : 4;
        g.lineCap = "round";
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (x0 - x1) * 0.25, y + (y0 - y1) * 0.25);
        g.stroke();
        g.fillStyle = "#fff";
        g.beginPath();
        g.arc(x, y, i === 0 ? 7 : 3, 0, Math.PI * 2);
        g.fill();
      }
      if (t > 1.8) {
        const k = Math.min(1, (t - 1.8) / 0.5);
        g.fillStyle = col;
        g.globalAlpha = k * 0.9;
        g.beginPath();
        g.arc(cv.width * 0.45, cv.height * 0.62, k * cv.width, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 1;
      }
      if (t > 2.35) finish();
      else requestAnimationFrame(loop);
    };
    loop();
  }

  private pullResults(el: HTMLElement, res: PullResult[]): void {
    // Singles get a full reveal for 4★+, then the summary.
    const reveal = res.filter((r) => r.stars >= 4).sort((a, b) => b.stars - a.stars);
    let i = 0;
    const show = () => {
      if (i >= reveal.length) return summary();
      const r = reveal[i++];
      const h = HERO[r.id!];
      el.className = `reveal s${r.stars}`;
      el.innerHTML = `<div class="rv" style="--el:${hex(ELEMENT_COLOR[h.element])}"><img src="${portrait(this.h.renderer, h.id, "card")}"/>
        <div class="txt"><div class="el">${EL_ICON[h.element]}</div><h1>${h.name}</h1><div class="st">${"★".repeat(r.stars)}</div><div class="ti">${h.hanja} · ${h.title}</div><p>「${h.quote}」</p>${r.isNew ? `<div class="new">NEW</div>` : `<div class="cons">각성 ${r.cons}단계</div>`}</div></div><p class="tap">클릭하여 계속</p>`;
      el.onclick = () => show();
    };
    const summary = () => {
      el.onclick = null;
      el.className = "results";
      el.innerHTML = `<div class="grid">${res
        .map((r) => (r.id ? `<div class="card s${r.stars}"><img src="${portrait(this.h.renderer, r.id)}"/><div class="nm">${HERO[r.id].name}</div><div class="st">${"★".repeat(r.stars)}</div>${r.isNew ? '<div class="new">NEW</div>' : ""}</div>` : `<div class="card s3"><div class="book">書</div><div class="nm">병법서</div><div class="st">★★★</div></div>`))
        .join("")}</div><div class="wbtns"><button id="again">다시 소환</button><button id="toParty">파티 편성</button><button id="done" class="main">확인</button></div>`;
      $("again").onclick = () => this.wishScreen(el);
      $("toParty").onclick = () => this.open("party");
      $("done").onclick = () => this.close();
      this.h.applyParty();
    };
    show();
  }

  private partyScreen(el: HTMLElement, sel: number): void {
    const P = this.h.profile;
    el.className = "partyS";
    const party = P.d.party;
    const id = party[sel] ?? party[0];
    const h = HERO[id];
    const o = P.d.owned[id];
    const need = Profile.need(o.level);
    const k = 1 + (o.level - 1) * 0.085;
    el.innerHTML = `
      <div class="wtop"><h2>파티 편성</h2><div class="yb"><i>書</i><b>${P.d.books}</b></div><button class="x" id="pClose">✕</button></div>
      <div class="slots">${[0, 1, 2, 3].map((i) => {
        const pid = party[i];
        return pid ? `<div class="slot ${i === sel ? "on" : ""}" data-s="${i}"><img src="${portrait(this.h.renderer, pid)}"/><div class="nm">${HERO[pid].name}</div><div class="lv">Lv.${P.d.owned[pid].level}</div></div>` : `<div class="slot empty" data-s="${i}">+</div>`;
      }).join("")}</div>
      <div class="detail" style="--el:${hex(ELEMENT_COLOR[h.element])}">
        <img class="art" src="${portrait(this.h.renderer, id, "card")}"/>
        <div class="info"><h1>${h.name} <small>${h.hanja}</small></h1><div class="st">${"★".repeat(h.stars)} · ${ELEMENT_NAME[h.element]} · ${h.faction}</div><div class="ti">${h.title} · ${h.weaponName}</div>
          <div class="stats"><span>Lv.<b>${o.level}</b>/40</span><span>체력 <b>${Math.round(h.hp * k)}</b></span><span>공격 <b>${Math.round(h.atk * k * (1 + o.cons * 0.08))}</b></span><span>방어 <b>${Math.round(h.def * k)}</b></span><span>각성 <b>${o.cons}</b></span></div>
          <div class="exp"><i style="width:${(o.exp / need) * 100}%"></i></div>
          <button id="lvUp" ${P.d.books <= 0 || o.level >= 40 ? "disabled" : ""}>병법서로 수련 (書 −1)</button>
          <div class="skill"><b>전법 · ${h.skill.name}</b> <small>E · 재사용 ${h.skill.cd}초</small><p>${h.skill.desc}</p></div>
          <div class="skill"><b>필살 · ${h.burst.name}</b> <small>Q · 기력 ${h.burst.energy}</small><p>${h.burst.desc}</p></div>
          <p class="bio">${h.bio}</p></div>
      </div>
      <div class="roster"><div class="lbl">보유 영웅 — 누르면 선택한 자리에 편성</div>${HEROES.map((hh) => {
        const own = P.d.owned[hh.id];
        return `<div class="rc ${own ? "" : "locked"} ${party.includes(hh.id) ? "in" : ""} s${hh.stars}" data-h="${hh.id}"><img src="${portrait(this.h.renderer, hh.id)}"/><div class="nm">${hh.name}</div>${own ? `<div class="lv">Lv.${own.level}</div>` : `<div class="lv">미보유</div>`}</div>`;
      }).join("")}</div>`;
    $("pClose").onclick = () => this.close();
    el.querySelectorAll<HTMLElement>("[data-s]").forEach((s) => (s.onclick = () => this.partyScreen(el, +s.dataset.s!)));
    el.querySelectorAll<HTMLElement>("[data-h]").forEach((c) => (c.onclick = () => {
      const hid = c.dataset.h!;
      if (!P.d.owned[hid]) return;
      const cur = party.indexOf(hid);
      if (cur >= 0 && party[sel]) [party[cur], party[sel]] = [party[sel], party[cur]];
      else if (cur < 0) {
        if (sel < party.length) party[sel] = hid;
        else party.push(hid);
      }
      P.save();
      this.h.applyParty();
      this.partyScreen(el, Math.min(sel, party.length - 1));
    }));
    $("lvUp").onclick = () => {
      const up = P.useBook(id);
      if (up) this.toast(`${h.name} 레벨 업! Lv.${P.d.owned[id].level}`, "gold");
      this.h.applyParty();
      this.partyScreen(el, sel);
    };
  }

  private mapScreen(el: HTMLElement): void {
    el.className = "mapS";
    const P = this.h.profile.d;
    const lit = new Set(P.beacons);
    const pp = this.h.playerPos();
    const pct = (v: number) => ((v + HALF) / WORLD) * 100;
    el.innerHTML = `<div class="wtop"><h2>유주 탁군</h2><span class="fine">밝힌 봉화대를 누르면 순간이동합니다</span><button class="x" id="mClose">✕</button></div>
      <div class="map"><img src="${this.miniBase.toDataURL()}"/>
      ${BEACONS.map((b) => `<div class="mk beacon ${lit.has(b.id) ? "lit" : ""}" data-b="${b.id}" style="left:${pct(b.x)}%;top:${pct(b.z)}%"><i>▲</i><span>${b.name}</span></div>`).join("")}
      ${CAMPS.map((c, i) => `<div class="mk camp ${P.camps.includes(i) ? "done" : ""} ${c.boss ? "boss" : ""}" style="left:${pct(c.x)}%;top:${pct(c.z)}%"><i>●</i><span>${c.name}${P.camps.includes(i) ? " (소탕)" : ` Lv.${c.level}`}</span></div>`).join("")}
      <div class="mk you" style="left:${pct(pp.x)}%;top:${pct(pp.z)}%"><i>◆</i><span>현재 위치</span></div></div>`;
    $("mClose").onclick = () => this.close();
    el.querySelectorAll<HTMLElement>(".beacon.lit").forEach((b) => (b.onclick = () => {
      this.close();
      this.h.teleport(b.dataset.b!);
    }));
  }
}
