// Shoot the showcase: node tools/show.mjs out.png "ids" anim  [camera json]
import { launch } from "./gpu.mjs";
const [out = "shots/show.png", ids = "", anim = "pose", camj = "{}"] = process.argv.slice(2);
const url = `http://localhost:5461/?show&${ids ? `ids=${ids}&` : ""}anim=${anim}`;
const { browser, page, errors } = await launch(url);
await page.waitForTimeout(1500);
await page.evaluate((c) => Object.assign(window.__g.cam, JSON.parse(c)), camj);
await page.waitForTimeout(1200);
await page.screenshot({ path: out });
console.log(errors.slice(0, 5));
await browser.close();
