/**
 * What people built. 탁현: timber-and-plaster houses on stone plinths under grey tiled roofs
 * whose eaves curl up at the corners, red pillars, paper lanterns, a memorial gate (패루)
 * at the road, a well; in the peach garden a six-sided pavilion and the stone table where
 * three men swore brotherhood. The Yellow Turbans' camps: a ring of sharpened stakes, yellow
 * tents, tall banners reading 黃天, cook fires, a watchtower. Beacon towers (봉화대) that
 * light when you reach them, and lacquered chests. Everything solid registers a collider.
 */
import * as THREE from "three";
import { addOutlines, toon } from "../engine/toon";
import { BEACONS, CAMPS, CHESTS, PEACH, VILLAGE, type Place } from "./layout";
import { rng } from "./noise";
import type { Terrain } from "./terrain";

export interface Collider {
  x: number;
  z: number;
  /** Circle radius, or box half-extents with rotation. */
  r?: number;
  hx?: number;
  hz?: number;
  rot?: number;
  top: number;
}

const tex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
};

/** A hip roof whose eaves sweep up at the corners: w × d footprint, ridge along x. */
function roofGeo(w: number, d: number, h: number, over = 0.9, curl = 0.7): THREE.BufferGeometry {
  const nx = 16;
  const nz = 10;
  const W = w / 2 + over;
  const D = d / 2 + over;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  // Two long slopes (front/back) as grids; the ends are closed by the hip triangles below.
  for (const side of [-1, 1]) {
    const base = pos.length / 3;
    for (let j = 0; j <= nz; j++)
      for (let i = 0; i <= nx; i++) {
        const u = i / nx;
        const v = j / nz; // 0 at the ridge, 1 at the eave
        const x = (u - 0.5) * 2 * (W - (1 - v) * D * 0.55);
        const z = side * v * D;
        // Concave slope (steeper at the top), eave lifted, corners curled up.
        const y = h * (1 - v) ** 1.6 - v * 0.1 + Math.pow(Math.abs(u - 0.5) * 2, 4) * curl * v * v;
        pos.push(x, y, z);
        uv.push(u * w * 0.8, v * D);
      }
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const a = base + j * (nx + 1) + i;
        const b = a + nx + 1;
        if (side > 0) idx.push(a, b, a + 1, a + 1, b, b + 1);
        else idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
  }
  // Hip ends: fans from the ridge end down to the eave edge.
  for (const end of [-1, 1]) {
    const base = pos.length / 3;
    const rx = end * (W - D * 0.55);
    pos.push(rx, h, 0);
    uv.push(0, 0);
    for (let k = 0; k <= nz; k++) {
      const v = k / nz;
      const z = (v * 2 - 1) * D;
      const y = Math.pow(Math.abs(v * 2 - 1), 4) * curl - 0.1;
      pos.push(end * W, y, z);
      uv.push(v * D, D);
    }
    for (let k = 0; k < nz; k++) {
      if (end > 0) idx.push(base, base + 1 + k, base + 2 + k);
      else idx.push(base, base + 2 + k, base + 1 + k);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export class Structures {
  readonly group = new THREE.Group();
  readonly colliders: Collider[] = [];
  readonly beacons: { place: Place; fire: THREE.Object3D; lit: boolean; top: THREE.Vector3 }[] = [];
  readonly chests: { x: number; y: number; z: number; kind: string; mesh: THREE.Group; opened: boolean; lid: THREE.Object3D }[] = [];
  readonly fires: THREE.Object3D[] = [];
  readonly lanterns: THREE.Mesh[] = [];
  readonly flags: THREE.Mesh[] = [];
  private readonly mats = {
    tile: toon(0xffffff, { map: tex(128, 128, (g) => {
      g.fillStyle = "#4a5260";
      g.fillRect(0, 0, 128, 128);
      for (let x = 0; x < 128; x += 16) {
        const gr = g.createLinearGradient(x, 0, x + 16, 0);
        gr.addColorStop(0, "#3a404c");
        gr.addColorStop(0.5, "#6a7484");
        gr.addColorStop(1, "#3a404c");
        g.fillStyle = gr;
        g.fillRect(x + 1, 0, 14, 128);
      }
      g.fillStyle = "rgba(0,0,0,0.25)";
      for (let y = 0; y < 128; y += 32) g.fillRect(0, y, 128, 3);
    }), side: THREE.DoubleSide }),
    plaster: toon(0xf2e8d4),
    timber: toon(0x5a3424),
    red: toon(0xb8302a),
    stone: toon(0xa8a49a),
    darkStone: toon(0x7a7870),
    wood: toon(0x8a6040),
    stake: toon(0x7a5a3a),
    yellow: toon(0xe8c43a, { side: THREE.DoubleSide }),
    lantern: toon(0xff5a3a, { emissive: 0xd03010, rim: 0.4 }),
    gold: toon(0xe8b83a, { rim: 0.7 }),
    lacquer: toon(0xa81e1e, { rim: 0.4 }),
  };

  constructor(readonly t: Terrain) {
    this.village();
    this.peachGarden();
    for (const c of CAMPS) this.camp(c);
    for (const b of BEACONS) this.beacon(b);
    for (const c of CHESTS) this.chest(c.x, c.z, c.kind);
    addOutlines(this.group, 0x2a1a1a, 0.0028);
  }

  private add(o: THREE.Object3D): THREE.Object3D {
    o.traverse((m) => {
      if ((m as THREE.Mesh).isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    this.group.add(o);
    return o;
  }

  house(x: number, z: number, rot: number, w = 8, d = 6, h = 3.4, grand = false): void {
    const g = new THREE.Group();
    const y = this.t.height(x, z);
    g.position.set(x, y, z);
    g.rotation.y = rot;
    const M = this.mats;
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(w + 1.2, 0.8, d + 1.2), M.stone);
    plinth.position.y = 0.2;
    g.add(plinth);
    const walls = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M.plaster);
    walls.position.y = 0.6 + h / 2;
    g.add(walls);
    // Timber frame: posts, lintel, a door and lattice windows on the front.
    for (const sx of [-1, -0.33, 0.33, 1])
      for (const sz of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.26, h, 0.26), sz > 0 ? M.red : M.timber);
        post.position.set((sx * w) / 2, 0.6 + h / 2, (sz * d) / 2 + sz * 0.05);
        g.add(post);
      }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.3, d + 0.2), M.timber);
    beam.position.y = 0.6 + h - 0.1;
    g.add(beam);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.3, 0.12), M.timber);
    door.position.set(0, 0.6 + 1.15, d / 2 + 0.05);
    g.add(door);
    for (const sx of [-1, 1]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 0.1), M.wood);
      win.position.set(sx * w * 0.3, 0.6 + h * 0.6, d / 2 + 0.06);
      g.add(win);
    }
    const roof = new THREE.Mesh(roofGeo(w, d, grand ? 2.8 : 2.1, 1.1, grand ? 1.0 : 0.6), M.tile);
    roof.position.y = 0.6 + h;
    g.add(roof);
    // Ridge with curled ends.
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(w - d * 0.5 + 1.2, 0.35, 0.4), M.darkStone);
    ridge.position.y = 0.6 + h + (grand ? 2.8 : 2.1) + 0.1;
    g.add(ridge);
    for (const sx of [-1, 1]) {
      const curl = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.12, 8, 12, Math.PI * 1.2), M.darkStone);
      curl.position.set(sx * ((w - d * 0.5) / 2 + 0.6), ridge.position.y + 0.3, 0);
      curl.rotation.set(0, Math.PI / 2, sx > 0 ? 0.3 : Math.PI - 0.3);
      g.add(curl);
    }
    // Lanterns under the eaves.
    for (const sx of [-1, 1]) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10).scale(1, 1.25, 1), M.lantern);
      l.position.set(sx * (w / 2 - 0.3), 0.6 + h - 0.6, d / 2 + 0.7);
      l.userData.noOutline = false;
      g.add(l);
      this.lanterns.push(l);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.12, 10), M.timber);
      cap.position.copy(l.position).add(new THREE.Vector3(0, 0.42, 0));
      g.add(cap);
    }
    this.add(g);
    this.colliders.push({ x, z, hx: w / 2 + 0.6, hz: d / 2 + 0.6, rot, top: y + 0.6 + h + 1.5 });
  }

  private village(): void {
    const R = rng(12);
    const V = VILLAGE;
    // Houses round a square, facing in.
    const ring = 11;
    for (let k = 0; k < ring; k++) {
      const a = (k / ring) * Math.PI * 2 + 0.2;
      if (Math.abs(Math.sin(a - Math.atan2(PEACH.z - V.z, PEACH.x - V.x) + Math.PI / 2)) > 0.97) continue;
      const r = 32 + R() * 18;
      const x = V.x + Math.cos(a) * r;
      const z = V.z + Math.sin(a) * r;
      this.house(x, z, -a - Math.PI / 2, 7 + R() * 3, 5 + R() * 2, 3.2 + R() * 0.6, k === 0);
    }
    // The magistrate's hall to the north.
    this.house(V.x, V.z - 58, 0, 14, 8, 4.4, true);
    // Gate on the road east.
    const gx = V.x + 70;
    const gz = V.z - 20;
    const g = new THREE.Group();
    g.position.set(gx, this.t.height(gx, gz), gz);
    g.rotation.y = Math.PI / 2 - 0.35;
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 6, 12), this.mats.red);
      p.position.set(sx * 3.2, 3, 0);
      g.add(p);
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1, 1.2), this.mats.stone);
      base.position.set(sx * 3.2, 0.5, 0);
      g.add(base);
      this.colliders.push({ x: gx + Math.cos(g.rotation.y) * sx * 3.2, z: gz - Math.sin(g.rotation.y) * sx * 3.2, r: 0.8, top: g.position.y + 7 });
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.6, 0.7), this.mats.red);
    lintel.position.y = 5.4;
    g.add(lintel);
    const plaque = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 0.9),
      new THREE.MeshBasicMaterial({ map: tex(256, 96, (c) => {
        c.fillStyle = "#1a2a4a";
        c.fillRect(0, 0, 256, 96);
        c.strokeStyle = "#e8b83a";
        c.lineWidth = 6;
        c.strokeRect(4, 4, 248, 88);
        c.fillStyle = "#f0d890";
        c.font = "900 64px 'Noto Serif KR', serif";
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillText("涿縣", 128, 52);
      }) }),
    );
    plaque.position.set(0, 4.6, 0.4);
    plaque.userData.noOutline = true;
    g.add(plaque);
    const groof = new THREE.Mesh(roofGeo(8, 1.4, 1.2, 0.6, 0.6), this.mats.tile);
    groof.position.y = 5.7;
    g.add(groof);
    this.add(g);
    // A well in the square.
    const well = new THREE.Group();
    well.position.set(V.x + 6, this.t.height(V.x + 6, V.z + 4), V.z + 4);
    const ring2 = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.3, 1, 16, 1, true), this.mats.stone);
    (ring2.material as THREE.Material).side = THREE.DoubleSide;
    ring2.position.y = 0.5;
    well.add(ring2);
    const wroof = new THREE.Mesh(roofGeo(2.4, 1.6, 0.8, 0.4, 0.3), this.mats.tile);
    wroof.position.y = 2.6;
    well.add(wroof);
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.6, 0.15), this.mats.timber);
      p.position.set(sx * 1.1, 1.3, 0);
      well.add(p);
    }
    this.add(well);
    this.colliders.push({ x: well.position.x, z: well.position.z, r: 1.5, top: well.position.y + 1 });
    // Fences round the fields.
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * Math.PI * 1.3 + 0.8;
      const x = V.x - 40 + Math.cos(a) * 128;
      const z = V.z + 90 + Math.sin(a) * 128;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.1, 0.16), this.mats.wood);
      post.position.set(x, this.t.height(x, z) + 0.5, z);
      this.add(post);
    }
  }

  private peachGarden(): void {
    const P = PEACH;
    const y = this.t.height(P.x, P.z);
    // The oath table and three stools.
    const table = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.9, 0.9, 20), this.mats.stone);
    table.position.set(P.x, y + 0.45, P.z);
    this.add(table);
    this.colliders.push({ x: P.x, z: P.z, r: 1.2, top: y + 0.9 });
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.3;
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.5, 12), this.mats.stone);
      s.position.set(P.x + Math.cos(a) * 1.9, y + 0.25, P.z + Math.sin(a) * 1.9);
      this.add(s);
    }
    // Three cups and a jar of wine.
    const jar = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10).scale(1, 1.2, 1), toon(0x6a4a2a));
    jar.position.set(P.x, y + 1.2, P.z);
    this.add(jar);
    // A hexagonal pavilion (정자) at the garden's edge.
    const px = P.x + 22;
    const pz = P.z - 14;
    const py = this.t.height(px, pz);
    const pav = new THREE.Group();
    pav.position.set(px, py, pz);
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.4, 0.8, 6), this.mats.stone);
    floor.position.y = 0.4;
    pav.add(floor);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 3.4, 10), this.mats.red);
      col.position.set(Math.cos(a) * 3.6, 0.8 + 1.7, Math.sin(a) * 3.6);
      pav.add(col);
    }
    const proof = new THREE.Mesh(
      (() => {
        const g = new THREE.ConeGeometry(5.6, 2.8, 6, 6, true);
        const p = g.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < p.count; i++) {
          const y2 = p.getY(i);
          const t = (1.4 - y2) / 2.8;
          // Concave, and the six corners curl up.
          const x = p.getX(i);
          const z = p.getZ(i);
          const a = Math.atan2(z, x);
          const corner = Math.pow(Math.abs(Math.cos(a * 3)), 8);
          p.setY(i, y2 - Math.sin(t * Math.PI) * 0.6 + corner * t * t * 0.9);
        }
        g.computeVertexNormals();
        return g;
      })(),
      this.mats.tile,
    );
    proof.position.y = 0.8 + 3.4 + 1.2;
    pav.add(proof);
    const fin = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 10), this.mats.gold);
    fin.position.y = proof.position.y + 1.6;
    pav.add(fin);
    this.add(pav);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      this.colliders.push({ x: px + Math.cos(a) * 3.6, z: pz + Math.sin(a) * 3.6, r: 0.3, top: py + 4.2 });
    }
  }

  private camp(c: (typeof CAMPS)[number]): void {
    const R = rng(Math.round(c.x * 7 + c.z));
    const y0 = this.t.height(c.x, c.z);
    const M = this.mats;
    // Palisade with two gaps.
    const n = Math.round((c.r * 2 * Math.PI) / 1.1);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      if (Math.abs(Math.sin(a)) < 0.08) continue; // gates east and west
      const r = c.r * (0.96 + R() * 0.06);
      const x = c.x + Math.cos(a) * r;
      const z = c.z + Math.sin(a) * r;
      const h = 3 + R() * 0.8;
      const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, h, 7), M.stake);
      stake.position.set(x, this.t.height(x, z) + h / 2 - 0.3, z);
      stake.rotation.set((R() - 0.5) * 0.1, 0, (R() - 0.5) * 0.1);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 7), M.stake);
      tip.position.y = h / 2 + 0.3;
      stake.add(tip);
      this.add(stake);
      this.colliders.push({ x, z, r: 0.5, top: stake.position.y + h / 2 });
    }
    // Tents.
    const tents = Math.round(c.r / 9) + 2;
    for (let k = 0; k < tents; k++) {
      const a = (k / tents) * Math.PI * 2 + 0.4;
      const r = c.r * 0.6;
      const x = c.x + Math.cos(a) * r;
      const z = c.z + Math.sin(a) * r;
      const s = 1 + R() * 0.5;
      const tent = new THREE.Mesh(new THREE.ConeGeometry(3 * s, 3.4 * s, 8, 1, true), M.yellow);
      tent.position.set(x, this.t.height(x, z) + 1.7 * s, z);
      this.add(tent);
      this.colliders.push({ x, z, r: 2.6 * s, top: tent.position.y + 1.7 * s });
    }
    // Banners of the Yellow Heaven.
    const flagTex = tex(128, 256, (g) => {
      g.fillStyle = "#e8c43a";
      g.fillRect(0, 0, 128, 256);
      g.fillStyle = "#8a2a1a";
      g.fillRect(0, 0, 128, 16);
      g.fillRect(0, 240, 128, 16);
      g.fillStyle = "#3a1a0a";
      g.font = "900 90px 'Noto Serif KR', serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("黃", 64, 80);
      g.fillText("天", 64, 176);
    });
    const flagMat = toon(0xffffff, { map: flagTex, side: THREE.DoubleSide });
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.8;
      const x = c.x + Math.cos(a) * c.r * 0.85;
      const z = c.z + Math.sin(a) * c.r * 0.85;
      const yb = this.t.height(x, z);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 9, 6), M.timber);
      pole.position.set(x, yb + 4.5, z);
      this.add(pole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.8, 6, 8).translate(0.7, 0, 0), flagMat);
      flag.position.set(x + 0.1, yb + 7.2, z);
      flag.userData.noOutline = true;
      this.add(flag);
      this.flags.push(flag);
    }
    // Cook fire.
    const fire = this.fire();
    fire.position.set(c.x, y0, c.z);
    this.add(fire);
    // Watchtower.
    const tx = c.x + c.r * 0.5;
    const tz = c.z - c.r * 0.4;
    const ty = this.t.height(tx, tz);
    const tower = new THREE.Group();
    tower.position.set(tx, ty, tz);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 7, 6), M.stake);
      leg.position.set(sx * 1.4, 3.5, sz * 1.4);
      tower.add(leg);
    }
    const deck = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.3, 3.6), M.wood);
    deck.position.y = 7;
    tower.add(deck);
    const troof = new THREE.Mesh(new THREE.ConeGeometry(2.8, 1.6, 4), M.yellow);
    troof.position.y = 9.4;
    troof.rotation.y = Math.PI / 4;
    tower.add(troof);
    this.add(tower);
    this.colliders.push({ x: tx, z: tz, hx: 1.6, hz: 1.6, rot: 0, top: ty + 7.2 });
    if (c.boss) {
      // An altar of the 태평도 at the heart of the great camp.
      const alt = new THREE.Mesh(new THREE.CylinderGeometry(6, 7, 1.4, 8), M.darkStone);
      alt.position.set(c.x, y0 + 0.7, c.z - 20);
      this.add(alt);
      const burner = new THREE.Mesh(new THREE.CylinderGeometry(1, 0.7, 1.6, 8), M.gold);
      burner.position.set(c.x, y0 + 2.2, c.z - 20);
      this.add(burner);
      const f2 = this.fire(1.6);
      f2.position.set(c.x, y0 + 3, c.z - 20);
      this.add(f2);
      this.colliders.push({ x: c.x, z: c.z - 20, r: 6.5, top: y0 + 1.4 });
    }
  }

  private fire(scale = 1): THREE.Group {
    const g = new THREE.Group();
    for (let k = 0; k < 5; k++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.4, 6), this.mats.timber);
      log.rotation.set(Math.PI / 2 - 0.4, (k / 5) * Math.PI * 2, 0);
      log.position.y = 0.3;
      g.add(log);
    }
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.6, 1.8, 10, 4, true),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: { uTime: { value: 0 } },
        vertexShader: `uniform float uTime; varying vec2 vUv; void main() { vUv = uv; vec3 p = position; p.x += sin(uTime * 9.0 + p.y * 4.0) * 0.08 * (p.y + 0.9); p.z += cos(uTime * 7.0 + p.y * 3.0) * 0.08 * (p.y + 0.9); gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
        fragmentShader: `varying vec2 vUv; void main() { float t = vUv.y; vec3 c = mix(vec3(1.0, 0.95, 0.5), vec3(1.0, 0.35, 0.05), t); float a = (1.0 - t) * 0.95; gl_FragColor = vec4(c * 2.2, a); }`,
      }),
    );
    flame.position.y = 1.1;
    flame.userData.noOutline = true;
    flame.userData.flame = true;
    g.add(flame);
    g.scale.setScalar(scale);
    this.fires.push(flame);
    return g;
  }

  private beacon(b: Place): void {
    const y = this.t.height(b.x, b.z);
    const g = new THREE.Group();
    g.position.set(b.x, y, b.z);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3, 6, 12), this.mats.stone);
    body.position.y = 3;
    g.add(body);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.3, 8, 16).rotateX(Math.PI / 2), this.mats.darkStone);
    rim.position.y = 6;
    g.add(rim);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 0.8, 1, 12), this.mats.gold);
    bowl.position.y = 6.6;
    g.add(bowl);
    const fire = this.fire(1.5);
    fire.position.y = 7;
    fire.visible = false;
    g.add(fire);
    this.add(g);
    this.colliders.push({ x: b.x, z: b.z, r: 3, top: y + 6.2 });
    this.beacons.push({ place: b, fire, lit: false, top: new THREE.Vector3(b.x, y + 7, b.z) });
  }

  private chest(x: number, z: number, kind: string): void {
    const y = this.t.height(x, z);
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = (x * 0.7) % 6.28;
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.6, 0.7), kind === "rich" ? this.mats.gold : this.mats.lacquer);
    body.position.y = 0.3;
    g.add(body);
    const lid = new THREE.Object3D();
    lid.position.set(0, 0.6, -0.35);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.1, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), kind === "rich" ? this.mats.gold : this.mats.lacquer);
    top.position.z = 0.35;
    top.scale.set(1, 0.6, 1);
    lid.add(top);
    g.add(lid);
    for (const sx of [-0.45, 0.45]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.62, 0.72), kind === "rich" ? this.mats.lacquer : this.mats.gold);
      band.position.set(sx, 0.3, 0);
      g.add(band);
    }
    this.add(g);
    this.chests.push({ x, y, z, kind, mesh: g, opened: false, lid });
  }

  update(t: number): void {
    for (const f of this.fires) {
      const m = (f as THREE.Mesh).material as THREE.ShaderMaterial;
      m.uniforms.uTime.value = t;
      f.scale.y = 1 + Math.sin(t * 11 + f.id) * 0.1;
    }
    for (const fl of this.flags) {
      fl.rotation.y = Math.sin(t * 1.3 + fl.id) * 0.4;
    }
  }
}
