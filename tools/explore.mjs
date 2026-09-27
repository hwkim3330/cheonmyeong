// Stand the player somewhere and shoot: node tools/explore.mjs out.png x z camYaw pitch dist
import { launch } from "./gpu.mjs";
const [out = "shots/w.png", x, z, yaw, pitch, dist, hold] = process.argv.slice(2);
const { browser, page, errors } = await launch("http://localhost:5461/");
page.on("console", (m) => m.type() === "log" && console.log("log:", m.text()));
await page.waitForTimeout(1500);
await page.evaluate(([x, z, yaw, pitch, dist]) => {
  const g = window.__g.game;
  if (x !== undefined && x !== "") g.player.place(+x, +z, 0);
  if (yaw !== undefined && yaw !== "") g.player.cam.yaw = +yaw;
  if (pitch !== undefined && pitch !== "") g.player.cam.pitch = +pitch;
  if (dist !== undefined && dist !== "") g.player.cam.dist = +dist;
}, [x, z, yaw, pitch, dist]);
if (hold) {
  await page.keyboard.down(hold);
  await page.waitForTimeout(2500);
  await page.keyboard.up(hold);
}
await page.waitForTimeout(2000);
await page.screenshot({ path: out });
console.log(await page.evaluate(() => { const p = window.__g.game.player; return `pos ${p.pos.x.toFixed(1)},${p.pos.y.toFixed(1)},${p.pos.z.toFixed(1)} mode ${p.mode}`; }));
console.log(errors.slice(0, 5));
await browser.close();
