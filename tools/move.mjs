// Climb a peak, then glide off its top.
import { launch } from "./gpu.mjs";
const pre = process.argv[2] ?? "shots/mv";
const { browser, page, errors } = await launch("http://localhost:5461/");
await page.evaluate(() => { try { localStorage.clear(); } catch {} });
await page.reload();
await page.waitForFunction(() => window.__g && window.__g.ready, null, { timeout: 60000 });
await page.evaluate(() => { window.__g.go(); const g = window.__g.game; g.player.place(-280 + 30, 60, -Math.PI / 2); g.player.cam.yaw = -Math.PI / 2 + Math.PI; g.player.cam.pitch = 0.1; });
await page.waitForTimeout(1500);
const st = () => page.evaluate(() => { const p = window.__g.game.player; return `${p.mode} y=${p.pos.y.toFixed(1)} x=${p.pos.x.toFixed(1)} st=${Math.round(p.stamina)}`; });
await page.keyboard.down("KeyW");
for (let k = 0; k < 6; k++) {
  await page.waitForTimeout(1500);
  console.log(await st());
  if (k === 2) await page.screenshot({ path: `${pre}-climb.png` });
}
await page.keyboard.up("KeyW");
// Top of the peak: jump off and glide.
await page.evaluate(() => { const g = window.__g.game; const t = g.world.t; g.player.place(-280, 60, Math.PI / 2); g.player.pos.y = t.height(-280, 60); g.player.stamina = 240; g.player.cam.yaw = Math.PI / 2 + Math.PI; g.player.cam.pitch = 0.3; });
await page.waitForTimeout(800);
console.log("top", await st());
await page.keyboard.down("KeyW");
await page.waitForTimeout(1200);
await page.keyboard.press("Space");
await page.waitForTimeout(500);
await page.keyboard.press("Space");
await page.waitForTimeout(1500);
console.log(await st());
await page.screenshot({ path: `${pre}-glide.png` });
await page.waitForTimeout(1500);
console.log(await st());
await page.keyboard.up("KeyW");
console.log(errors.slice(0, 4));
await browser.close();
