// Start the game and act: node tools/play.mjs outPrefix [x z] [script]
// script: comma list of steps: "w:ms" hold W, "click" attack, "e", "q", "wait:ms", "shot:name", "key:Code"
import { launch } from "./gpu.mjs";
const [pre = "shots/p", x, z, script = "shot:0"] = process.argv.slice(2);
const { browser, page, errors } = await launch("http://localhost:5461/");
page.on("console", (m) => m.type() === "log" && console.log("log:", m.text()));
await page.evaluate(() => { try { localStorage.clear(); } catch {} });
await page.reload();
await page.waitForFunction(() => window.__g && window.__g.ready, null, { timeout: 60000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${pre}-title.png` });
await page.evaluate(() => window.__g.go());
if (x !== undefined && x !== "") await page.evaluate(([x, z]) => { const g = window.__g.game; g.profile.d.quest = 2; g.player.place(+x, +z, 0); }, [x, z]);
await page.waitForTimeout(1200);
for (const step of script.split(",")) {
  const [k, v] = step.split(":");
  if (k === "wait") await page.waitForTimeout(+v);
  else if (k === "shot") await page.screenshot({ path: `${pre}-${v}.png` });
  else if (k === "click") { await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(+(v ?? 300)); }
  else if (k === "key") { await page.keyboard.down(v); await page.waitForTimeout(60); await page.keyboard.up(v); await page.waitForTimeout(200); }
  else if (k === "hold") { const [code, ms] = v.split("/"); await page.keyboard.down(code); await page.waitForTimeout(+ms); await page.keyboard.up(code); }
  else if (k === "face") await page.evaluate((v) => { const g = window.__g.game; const e = g.enemies.list.filter((e) => e.alive).sort((a, b) => a.pos.distanceTo(g.player.pos) - b.pos.distanceTo(g.player.pos))[0]; if (e) { g.player.yaw = Math.atan2(e.pos.x - g.player.pos.x, e.pos.z - g.player.pos.z); g.player.cam.yaw = g.player.yaw + Math.PI; } }, v);
  else if (k === "eval") await page.evaluate(v);
}
console.log(await page.evaluate(() => { const g = window.__g.game; const p = g.player; const near = g.enemies.list.filter((e) => e.rig).map((e) => `${e.kind}:${Math.round(e.hp)}/${Math.round(e.maxHp)}:${e.state}`); return `pos ${p.pos.x.toFixed(1)},${p.pos.y.toFixed(1)},${p.pos.z.toFixed(1)} mode ${p.mode} hp ${g.party.members.map((m) => Math.round(m.hp)).join("/")} yb ${g.profile.d.yuanbao} enemies ${near.join(" ")}`; }));
console.log(errors.slice(0, 6));
await browser.close();
