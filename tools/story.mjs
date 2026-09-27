// The oath in the peach garden, then stand in the boss camp and let them come.
import { launch } from "./gpu.mjs";
const pre = process.argv[2] ?? "shots/q";
const { browser, page, errors } = await launch("http://localhost:5461/");
await page.evaluate(() => { try { localStorage.clear(); } catch {} });
await page.reload();
await page.waitForFunction(() => window.__g && window.__g.ready, null, { timeout: 60000 });
await page.evaluate(() => { window.__g.go(); window.__g.game.player.place(-60, 326, 0); });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${pre}-oath.png` });
for (let k = 0; k < 6; k++) { await page.click("#dlg", { timeout: 1000 }).catch(() => {}); await page.waitForTimeout(250); }
await page.waitForTimeout(500);
console.log("quest", await page.evaluate(() => window.__g.game.profile.d.quest));
await page.evaluate(() => window.__g.game.player.place(120, -535, Math.PI));
await page.waitForTimeout(9000);
await page.screenshot({ path: `${pre}-boss.png` });
await page.waitForTimeout(9000);
await page.screenshot({ path: `${pre}-boss2.png` });
console.log(await page.evaluate(() => { const g = window.__g.game; return `hp ${g.party.members.map((m) => Math.round(m.hp)).join("/")} active ${g.party.active} pos ${g.player.pos.x.toFixed(0)},${g.player.pos.z.toFixed(0)} enemies ${g.enemies.list.filter((e) => e.rig && e.alive).length}`; }));
console.log(errors.slice(0, 4));
await browser.close();
