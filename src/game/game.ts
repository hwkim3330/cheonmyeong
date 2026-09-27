/**
 * The running game: the world, the party, the player, the Yellow Turbans, combat and effects,
 * and everything you can touch — 천명석 floating over the land, chests, beacon towers (light
 * them to travel and to heal), the village elder — plus the story, the rewards, respawning
 * when the whole party falls, saving, and the slow orbit behind the title screen.
 */
import * as THREE from "three";
import { Animator } from "../char/anim";
import type { Rig } from "../char/model";
import { rigFor } from "../char/skinned";
import { QUALITY } from "../engine/stage";
import { TURBAN_LOOKS } from "../data/heroes";
import type { Stage } from "../engine/stage";
import { addOutlines, toon } from "../engine/toon";
import { UI } from "../ui/ui";
import { BEACONS, CAMPS, LAKE, PEACH, VILLAGE, WATER } from "../world/layout";
import { rng } from "../world/noise";
import { World } from "../world/world";
import { Combat } from "./combat";
import { Enemies } from "./enemies";
import { Input } from "./input";
import { Party } from "./party";
import { Player } from "./player";
import { Profile } from "./profile";
import { ELDER_LINES, ELDER_POS, FINALE_LINES, OATH_LINES, STAGES } from "./quests";
import { Vfx } from "./vfx";

interface Orb {
  i: number;
  pos: THREE.Vector3;
  mesh: THREE.Object3D;
  taken: boolean;
}

type Beacon = World["structures"]["beacons"][number];

export class Game {
  readonly world: World;
  readonly input: Input;
  readonly player: Player;
  readonly party = new Party();
  readonly profile = new Profile();
  readonly vfx = new Vfx();
  readonly enemies: Enemies;
  readonly combat: Combat;
  readonly ui: UI;
  readonly orbs: Orb[] = [];
  private elder: { rig: Rig; anim: Animator } | null = null;
  t = 0;
  playing = false;
  private saveT = 0;

  constructor(readonly stage: Stage) {
    this.world = new World(stage);
    this.input = new Input(stage.renderer.domElement);
    const s = this.world.structures;
    this.player = new Player(this.world.t, s.colliders, this.world.forest.trunks);
    stage.scene.add(this.party.root, this.vfx.group);
    this.enemies = new Enemies(this.world.t, this.vfx);
    stage.scene.add(this.enemies.group);
    const P = this.profile.d;
    for (const ci of P.camps) {
      this.enemies.cleared.add(ci);
      for (const e of this.enemies.list)
        if (e.camp === ci) {
          e.alive = false;
          e.deadT = 99;
        }
    }
    this.combat = new Combat(this.party, this.player, this.enemies, this.vfx);
    this.applyParty();
    if (P.pos) this.player.place(P.pos[0], P.pos[1], 0);
    else this.player.place(VILLAGE.x + 14, VILLAGE.z + 10, Math.PI * 0.6);
    this.makeOrbs();
    this.makeElder();
    for (const b of s.beacons) if (P.beacons.includes(b.place.id)) this.light(b, true);
    s.chests.forEach((c, i) => {
      if (P.chests.includes(i)) {
        c.opened = true;
        c.lid.rotation.x = -1.9;
      }
    });
    this.ui = new UI({
      renderer: stage.renderer,
      camera: stage.camera,
      t: this.world.t,
      profile: this.profile,
      playerPos: () => this.player.pos,
      camYaw: () => this.player.cam.yaw,
      party: () => this.party.members,
      active: () => this.party.active,
      stamina: () => this.player.stamina,
      staminaShow: () => this.player.staminaShow,
      enemies: () => this.enemies.list,
      popups: this.combat.popups,
      questText: () => STAGES[Math.min(STAGES.length - 1, P.quest)],
      teleport: (id) => this.teleport(id),
      applyParty: () => this.applyParty(),
      setBlocked: (b) => (this.input.blocked = b),
      energyCost: (m) => this.combat.cost(m),
      boss: () => {
        const b = this.enemies.list.find((e) => e.kind === "boss");
        return b && b.alive && b.rig && b.state !== "idle" && b.pos.distanceTo(this.player.pos) < 60 ? b : null;
      },
    });
    // F8 cycles the render preset (and stops the automatic step-down).
    window.addEventListener("keydown", (e) => {
      if (e.code !== "F8") return;
      const q = (this.stage.quality + 1) % QUALITY.length;
      this.stage.setQuality(q, true);
      this.ui.toast(`그래픽: ${QUALITY[q].name}`);
    });
    this.hooks();
  }

  private hooks(): void {
    const P = this.profile.d;
    this.enemies.onCampCleared = (ci) => {
      if (!P.camps.includes(ci)) P.camps.push(ci);
      const c = CAMPS[ci];
      const reward = [300, 200, 300, 600][ci];
      P.yuanbao += reward;
      this.ui.banner(`${c.name} 소탕`, `원보 +${reward}`);
      if (P.quest === 2 && ci === 0) this.advance();
      if (P.quest === 4 && ci === 1) this.advance();
      if (P.quest === 5 && ci === 2) this.advance();
      if (ci === 3)
        this.ui.dialogue(FINALE_LINES, () => {
          if (P.quest === 6) this.advance();
        });
      this.profile.save();
    };
    const kill = this.enemies.onKill;
    this.enemies.onKill = (e) => {
      kill?.(e);
      P.yuanbao += e.kind === "captain" ? 30 : e.kind === "boss" ? 0 : 3;
      if (Math.random() < (e.kind === "captain" ? 1 : 0.15)) {
        P.books++;
        this.ui.toast("병법서 획득", "gold");
      }
    };
    this.combat.onWipe = () => this.respawn();
    this.combat.onMemberDown = (m) => this.ui.toast(`${m.def.name} 전투 불능`);
    this.combat.onBurst = (m) => this.ui.banner(m.def.burst.name, m.def.name);
    this.player.drowned = () => {
      this.ui.toast("기력이 다해 물에 빠졌다…");
      const m = this.party.cur;
      m.hp = Math.max(1, m.hp - m.maxHp * 0.2);
      this.player.place(this.player.safe.x, this.player.safe.z, this.player.yaw);
      this.player.stamina = 240;
    };
  }

  applyParty(): void {
    const prev = this.party.members.length ? this.party.cur.def.id : null;
    const hp = new Map(this.party.members.map((m) => [m.def.id, m.hp / m.maxHp]));
    this.party.set(this.profile.partyEntries());
    for (const m of this.party.members) if (hp.has(m.def.id)) m.hp = Math.max(0, m.maxHp * hp.get(m.def.id)!);
    const i = this.party.members.findIndex((m) => m.def.id === prev);
    if (i >= 0) {
      this.party.cur.rig.root.visible = false;
      this.party.active = i;
      this.party.cur.rig.root.visible = true;
    }
  }

  private advance(): void {
    const P = this.profile.d;
    P.quest++;
    const s = STAGES[Math.min(STAGES.length - 1, P.quest)];
    this.ui.banner(s.title, "새 임무");
    this.profile.save();
  }

  // ------------------------------------------------------------------ world things

  private makeOrbs(): void {
    const t = this.world.t;
    const R = rng(2025);
    const spots: [number, number][] = [];
    for (const p of t.peaks) if (Math.abs(p.x) < 900 && Math.abs(p.z) < 900 && spots.length < 22) spots.push([p.x + (R() - 0.5) * p.r * 0.4, p.z + (R() - 0.5) * p.r * 0.4]);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      spots.push([LAKE.x + Math.cos(a) * LAKE.r * 1.25, LAKE.z + Math.sin(a) * LAKE.r * 1.25]);
    }
    spots.push([PEACH.x + 25, PEACH.z + 20], [VILLAGE.x - 60, VILLAGE.z - 70], [-700, -500], [700, 500], [-300, 700], [300, -800], [-800, 100], [800, -100]);
    const mat = toon(0x5ae8b8, { emissive: 0x1a9a70, rim: 0.9 });
    const halo = new THREE.MeshBasicMaterial({ color: 0x7affd8, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false });
    spots.forEach(([x, z], i) => {
      const y = t.height(x, z);
      if (y < WATER + 0.5) return;
      const g = new THREE.Group();
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), mat);
      core.scale.y = 1.5;
      g.add(core);
      addOutlines(core, 0x0a3a2a, 0.003);
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.75, 12, 10), halo);
      g.add(h);
      g.position.set(x, y + 1.3, z);
      this.stage.scene.add(g);
      const taken = this.profile.d.orbs.includes(i);
      g.visible = !taken;
      this.orbs.push({ i, pos: g.position.clone(), mesh: g, taken });
    });
  }

  private makeElder(): void {
    const look = { ...TURBAN_LOOKS.grunt, hair: 0xd8d4cc, hairStyle: "topknot" as const, headgear: "guan" as const, gearColor: 0x3a2a1a, robe: 0x8a6a4a, robe2: 0xe8dcc0, trim: 0x5a3a2a, sash: 0x5a3a2a, beard: "long" as const, stern: 0.2, robeLen: 0.85, sleeves: "wide" as const, weapon: { kind: "staff" as const, shaft: 0x5a3a1a, accent: 0x8a6a2a } };
    const rig = rigFor("elder", look);
    rig.root.position.set(ELDER_POS[0], this.world.t.height(ELDER_POS[0], ELDER_POS[1]), ELDER_POS[1]);
    rig.root.rotation.y = 0.3;
    this.stage.scene.add(rig.root);
    this.elder = { rig, anim: new Animator(rig) };
    this.elder.anim.alwaysArmed = true;
  }

  private light(b: Beacon, silent = false): void {
    b.lit = true;
    b.fire.visible = true;
    if (silent) return;
    const P = this.profile.d;
    if (!P.beacons.includes(b.place.id)) P.beacons.push(b.place.id);
    P.yuanbao += 30;
    this.ui.banner(`${b.place.name} 점화`, "순간이동 개방 · 원보 +30");
    this.vfx.pillar(b.top, 1.5, 0x6ae0ff, 30);
    if (P.quest === 3 && b.place.id === "b-village") this.advance();
    this.profile.save();
  }

  teleport(id: string): void {
    const b = BEACONS.find((x) => x.id === id);
    if (!b) return;
    this.player.place(b.x + 5, b.z + 5, 0);
    this.vfx.petals(this.player.pos, 0x6ae0ff);
  }

  private respawn(): void {
    const P = this.profile.d;
    const lit = BEACONS.filter((b) => P.beacons.includes(b.id));
    const at = lit.sort((a, b) => Math.hypot(a.x - this.player.pos.x, a.z - this.player.pos.z) - Math.hypot(b.x - this.player.pos.x, b.z - this.player.pos.z))[0];
    this.ui.banner("전원 전투 불능", "봉화대에서 다시 일어선다");
    setTimeout(() => {
      if (at) this.player.place(at.x + 5, at.z + 5, 0);
      else this.player.place(VILLAGE.x + 14, VILLAGE.z + 10, 0);
      for (const m of this.party.members) {
        m.hp = m.maxHp * 0.6;
        m.anim.stop();
      }
      this.party.swapT = 0;
    }, 1200);
  }

  /** Things within reach: the prompt, and F to use them. */
  private interact(): void {
    const p = this.player.pos;
    const P = this.profile.d;
    let prompt: string | null = null;
    let act: (() => void) | null = null;
    const S = this.world.structures;
    for (const b of S.beacons) {
      const d = Math.hypot(b.place.x - p.x, b.place.z - p.z);
      if (d >= 5.5) continue;
      if (!b.lit) {
        prompt = "봉화대를 밝힌다";
        act = () => this.light(b);
      } else if (this.party.members.some((m) => m.hp < m.maxHp)) {
        prompt = "봉화의 온기로 쉰다 (회복)";
        act = () => {
          for (const m of this.party.members) m.hp = m.maxHp;
          this.ui.toast("파티 전원이 회복했다", "gold");
          this.vfx.ring(p, 4, 0x9affc0, 0.8);
        };
      }
    }
    S.chests.forEach((c, i) => {
      if (c.opened || Math.hypot(c.x - p.x, c.z - p.z) > 2.4) return;
      const campI = CAMPS.findIndex((cc) => Math.hypot(cc.x - c.x, cc.z - c.z) < cc.r);
      if (campI >= 0 && !P.camps.includes(campI)) {
        prompt = "봉인된 상자 (진영을 소탕하라)";
        act = null;
        return;
      }
      prompt = "보물상자를 연다";
      act = () => {
        c.opened = true;
        P.chests.push(i);
        const yb = c.kind === "rich" ? 80 : c.kind === "fine" ? 40 : 20;
        const bk = c.kind === "rich" ? 3 : c.kind === "fine" ? 1 : 0;
        P.yuanbao += yb;
        P.books += bk;
        this.ui.toast(`보물상자: 원보 +${yb}${bk ? ` · 병법서 +${bk}` : ""}`, "gold");
        this.vfx.sparks(new THREE.Vector3(c.x, c.y + 1, c.z), 0xffd86a, 30, 6);
        this.profile.save();
      };
    });
    if (this.elder) {
      const e = this.elder.rig.root.position;
      if (Math.hypot(e.x - p.x, e.z - p.z) < 3.5) {
        prompt = "촌장과 이야기한다";
        act = () => {
          if (P.quest <= 1)
            this.ui.dialogue(ELDER_LINES, () => {
              if (P.quest === 1) {
                P.yuanbao += 800;
                this.ui.toast("촌장의 선물: 원보 +800", "gold");
                this.advance();
              }
            });
          else this.ui.dialogue([{ who: "탁현 촌장", text: P.quest >= 7 ? "영웅들 덕분에 마을이 평화를 되찾았습니다. 은혜는 잊지 않겠습니다." : `부디 조심하십시오. 「${STAGES[P.quest].title}」 — ${STAGES[P.quest].text}` }]);
        };
      }
    }
    this.ui.prompt(this.ui.talking || this.ui.isOpen ? null : prompt);
    if (act && this.input.hit("KeyF")) act();
  }

  private story(): void {
    const P = this.profile.d;
    const p = this.player.pos;
    if (P.quest === 0 && Math.hypot(p.x - PEACH.x, p.z - PEACH.z) < 8 && !this.ui.talking)
      this.ui.dialogue(OATH_LINES, () => {
        this.ui.banner("도원결의", "桃園結義");
        this.advance();
      });
    for (const o of this.orbs) {
      if (o.taken) continue;
      o.mesh.position.y = o.pos.y + Math.sin(this.t * 2 + o.i) * 0.25;
      o.mesh.rotation.y += 0.02;
      if (p.distanceTo(o.pos) < 1.9) {
        o.taken = true;
        o.mesh.visible = false;
        P.orbs.push(o.i);
        P.yuanbao += 15;
        this.ui.toast(`천명석 ${P.orbs.length}/${this.orbs.length} · 원보 +15`, "gold");
        this.vfx.sparks(o.pos, 0x5ae8b8, 24, 5);
        this.profile.save();
      }
    }
  }

  frame(rawDt: number): void {
    this.t += rawDt;
    const inp = this.input;
    let dt = rawDt;
    if (this.playing) {
      dt = this.combat.update(rawDt, inp);
      this.player.update(dt, inp);
      this.interact();
      this.story();
    }
    const p = this.player;
    const m = this.party.cur;
    m.rig.root.position.copy(p.pos);
    m.rig.root.rotation.y = p.yaw;
    this.party.swapT = Math.max(0, this.party.swapT - dt);
    m.anim.update(dt, {
      speed: Math.hypot(p.vel.x, p.vel.z) * (p.mode === "climb" ? 0 : 1),
      grounded: p.mode === "ground" || p.mode === "climb" || p.mode === "swim",
      vy: p.vel.y,
      gliding: p.mode === "glide",
      turn: p.turn,
      vel: p.vel,
      sprint: p.sprinting,
      climbing: p.mode === "climb",
      swimming: p.mode === "swim",
      climbPhase: p.climbPhase,
    });
    m.glider.visible = p.gliderOpen;
    if (this.elder) {
      const e = this.elder;
      const d = e.rig.root.position.distanceTo(p.pos);
      if (d < 12) {
        let dy = Math.atan2(p.pos.x - e.rig.root.position.x, p.pos.z - e.rig.root.position.z) - e.rig.root.rotation.y;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        e.rig.root.rotation.y += dy * Math.min(1, dt * 2);
      }
      if (d < 120) e.anim.update(dt, { speed: 0, grounded: true, vy: 0, gliding: false, turn: 0, vel: new THREE.Vector3(), sprint: false });
    }
    this.enemies.update(dt, p.pos, m.hp > 0);
    this.vfx.update(dt);
    if (this.playing) p.updateCamera(this.stage.camera, rawDt);
    else {
      // Title: a slow drift over the peach garden.
      const a = this.t * 0.05;
      const gy = this.world.t.height(PEACH.x, PEACH.z);
      this.stage.camera.position.set(PEACH.x + Math.cos(a) * 42, gy + 13, PEACH.z + Math.sin(a) * 42);
      this.stage.camera.lookAt(PEACH.x, gy + 4, PEACH.z);
    }
    this.world.update(this.t, p.pos, this.stage.camera.position);
    this.stage.follow(this.playing ? p.pos : new THREE.Vector3(PEACH.x, 10, PEACH.z));
    if (this.playing) this.ui.update(rawDt);
    this.saveT += rawDt;
    if (this.saveT > 10 && this.playing) {
      this.saveT = 0;
      this.profile.d.pos = [p.pos.x, p.pos.z];
      this.profile.save();
    }
    inp.flush();
  }

  start(): void {
    this.playing = true;
    document.getElementById("hud")!.classList.remove("off");
    const P = this.profile.d;
    if (P.quest === 0) this.ui.banner("탁현, 유주", "中平 원년 · 184년");
    else this.ui.banner(STAGES[P.quest].title, "이어서");
  }
}
