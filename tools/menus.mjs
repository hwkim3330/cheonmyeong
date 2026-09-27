// Open the summon screen, pull ten, click through the reveals, then the party and the map.
import { launch } from "./gpu.mjs";
const pre = process.argv[2] ?? "shots/m";
const { browser, page, errors } = await launch("http://localhost:5461/");
await page.evaluate(() => { try { localStorage.clear(); } catch {} });
await page.reload();
await page.waitForFunction(() => window.__g && window.__g.ready, null, { timeout: 60000 });
await page.evaluate(() => { window.__g.go(); const g = window.__g.game; g.profile.d.yuanbao = 16000; g.profile.d.pity5 = 80; });
await page.waitForTimeout(1500);
await page.keyboard.press("KeyB");
await page.waitForTimeout(1500);
await page.screenshot({ path: `${pre}-wish.png` });
await page.click("#w10");
await page.waitForTimeout(1500);
await page.screenshot({ path: `${pre}-pull.png` });
await page.waitForTimeout(1500);
for (let k = 0; k < 12; k++) {
  const cls = await page.evaluate(() => document.getElementById("screen").className);
  if (cls.includes("results")) break;
  if (k === 0) await page.screenshot({ path: `${pre}-reveal.png` });
  await page.mouse.click(700, 400);
  await page.waitForTimeout(900);
}
await page.screenshot({ path: `${pre}-results.png` });
await page.click("#toParty");
await page.waitForTimeout(1500);
await page.screenshot({ path: `${pre}-party.png` });
await page.keyboard.press("Escape");
await page.keyboard.press("KeyM");
await page.waitForTimeout(800);
await page.screenshot({ path: `${pre}-map.png` });
console.log(await page.evaluate(() => JSON.stringify(window.__g.game.profile.d.history.slice(0, 10).map((h) => h.id + h.stars))));
console.log(errors.slice(0, 4));
await browser.close();
