import * as THREE from "three";
import { Stage } from "./engine/stage";
import { Game } from "./game/game";
import { showcase } from "./showcase";
import "./style.css";

const canvas = document.getElementById("c") as HTMLCanvasElement;
const stage = new Stage(canvas);
const q = new URLSearchParams(location.search);

declare global {
  interface Window {
    __g: Record<string, unknown>;
  }
}

if (q.has("show")) {
  const sc = showcase(stage, q.get("ids")?.split(","), q.get("anim") ?? "pose");
  const cam = { x: 0, y: 1.2, z: 0, dist: 9, yaw: 0, pitch: 0.12 };
  let last = performance.now();
  const frame = (now: number) => {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    sc.update(dt);
    const c = Math.cos(cam.pitch);
    stage.camera.position.set(cam.x + Math.sin(cam.yaw) * c * cam.dist, cam.y + Math.sin(cam.pitch) * cam.dist, cam.z + Math.cos(cam.yaw) * c * cam.dist);
    stage.camera.lookAt(cam.x, cam.y, cam.z);
    stage.follow(new THREE.Vector3(cam.x, 0, cam.z));
    stage.render(dt);
  };
  requestAnimationFrame(frame);
  window.__g = { cam, stage, sc, ready: true };
} else {
  const ui = document.getElementById("ui")!;
  ui.innerHTML = `<div id="loading"><b>天命</b><span>천하를 그리는 중…</span></div>`;
  // Let the loading screen paint before building the world.
  setTimeout(() => {
    const t0 = performance.now();
    const game = new Game(stage);
    console.log("world built in", Math.round(performance.now() - t0), "ms");
    document.getElementById("hud")!.classList.add("off");
    const title = document.createElement("div");
    title.id = "title";
    const cont = !!game.profile.d.pos;
    title.innerHTML = `<div class="logo">天命</div><div class="ko">천명</div><div class="sub">삼국 오픈월드 · 황건의 난</div>
      <button id="tStart">${cont ? "이어하기" : "모험을 시작한다"}</button>${cont ? `<button id="tNew" class="ghost">처음부터</button>` : ""}
      <div class="keys">WASD 이동 · 마우스 시점 · Shift 대시/질주 · Space 점프 · 공중에서 Space 활공 · 벽을 향해 이동하면 등반<br>클릭 공격 · E 전법 · Q 필살 · 1–4 영웅 교체 · F 조사 · B 천명 소환 · C 파티 · M 지도</div>`;
    ui.appendChild(title);
    const go = () => {
      title.remove();
      game.start();
      canvas.requestPointerLock?.();
    };
    document.getElementById("tStart")!.onclick = go;
    const n = document.getElementById("tNew");
    if (n)
      n.onclick = () => {
        game.profile.reset();
        location.reload();
      };
    let last = performance.now();
    const frame = (now: number) => {
      requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      game.frame(dt);
      stage.render(dt);
    };
    requestAnimationFrame(frame);
    document.getElementById("loading")?.remove();
    window.__g = { game, stage, ready: true, go };
  }, 30);
}
