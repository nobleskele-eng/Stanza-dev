// Builds a review sheet for companion skins (the D1 design round): each skin around the lab's mock card at 2× real
// size, every animation's frames zoomed, and every palette on light and dark. Needs the dev server (`npm run dev`,
// port 1420).
// Run: node scripts/companion-sheet.mjs <out.png> [skin ...]
import { readdirSync, readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const [out, ...only] = process.argv.slice(2);
if (!out) throw new Error("usage: node scripts/companion-sheet.mjs <out.png> [skin ...]");
const dir = new URL("../companions/", import.meta.url);
const skins = readdirSync(dir)
  .filter((id) => id !== "test-dummy" && (only.length === 0 || only.includes(id)))
  .map((id) => JSON.parse(readFileSync(new URL(`${id}/companion.json`, dir), "utf8")));

/** One frame as inline SVG: one rect per pixel is fine at this size. */
function svg(skin, rows, colours, px) {
  const rects = rows.flatMap((r, y) => [...r].map((c, x) => (c === "." ? "" : `<rect x="${x}" y="${y}" width="1" height="1" fill="${colours[c - 1]}"/>`)));
  return `<svg width="${skin.grid * px}" height="${skin.grid * px}" viewBox="0 0 ${skin.grid} ${skin.grid}" shape-rendering="crispEdges">${rects.join("")}</svg>`;
}

const browser = await chromium.launch();
const lab = await browser.newPage({ deviceScaleFactor: 3, viewport: { width: 1400, height: 900 } });
await lab.goto("http://localhost:1420/?lab=companion&pause");
const scenes = {};
for (const skin of skins) {
  const el = lab.locator(`[data-lab-scenes] [data-lab-skin="${skin.id}"] > div`);
  scenes[skin.id] = { png: (await el.screenshot()).toString("base64"), width: (await el.boundingBox()).width };
}

const sections = skins.map((skin) => {
  const def = skin.palettes.default;
  const anims = Object.entries(skin.animations)
    .map(([name, a]) => {
      const timing = a.durations ? a.durations.map((d) => `${d}ms`).join(" / ") : `${a.fps} fps`;
      return `<div class="anim"><div class="name">${name}<small>${a.frames.length}f · ${timing}${a.loop ? "" : " · once"}</small></div>
        <div class="frames">${a.frames.map((f) => svg(skin, f, def, 5)).join("")}</div></div>`;
    })
    .join("");
  const palettes = Object.entries(skin.palettes)
    .map(([name, colours]) => {
      const poses = ["idle", "walk", "sit", "hang", "sleep"].map((n) => svg(skin, skin.animations[n].frames[0], colours, 4)).join("");
      return `<div class="pal"><div class="name">${name}</div><div class="light">${poses}</div><div class="dark">${poses}</div></div>`;
    })
    .join("");
  return `<section><h2>${skin.id}</h2>
    <img class="scene" width="${scenes[skin.id].width * 2}" src="data:image/png;base64,${scenes[skin.id].png}">
    <div class="anims">${anims}</div>
    <div class="pals">${palettes}</div></section>`;
});

const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: 2200, height: 900 } });
await page.setContent(`<style>
  body{margin:0;padding:24px;background:#fff;font:13px/1.3 ui-monospace,monospace;color:#222;width:2150px}
  section{margin-bottom:40px} h2{font-size:18px;margin:0 0 12px}
  .scene{display:block;margin-bottom:16px}
  .anims{display:flex;flex-wrap:wrap;gap:16px 28px;margin-bottom:16px}
  .anim .name{margin-bottom:4px} .anim small{display:block;color:#888}
  .frames{display:flex;gap:6px;background:#f2f0ea;padding:6px}
  .pals{display:flex;flex-wrap:wrap;gap:24px}
  .pal .light,.pal .dark{display:flex;gap:8px;padding:8px} .pal .light{background:#f2f0ea} .pal .dark{background:#16161a}
</style>${sections.join("")}`);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(`wrote ${out}`);
