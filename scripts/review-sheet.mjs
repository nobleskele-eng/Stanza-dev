// Builds labelled Chromium-vs-WebKit contact sheets from e2e/review/<browser>/*.png
// (produced by e2e/review.spec.ts). Output: e2e/review/sheet-<group>.png
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const root = "e2e/review";
const groups = [
  ["1-states", "T1 — text & state fixtures", (n) => n.startsWith("state--strip--") && /typical|long-title|cjk|no-artwork|paused|idle|error|link-out/.test(n)],
  ["2-capabilities-artwork", "T1 — capability & artwork fixtures", (n) => n.startsWith("state--strip--") && !/typical|long-title|cjk|no-artwork|paused|idle|error|link-out/.test(n)],
  ["3-t2-card", "T2 — artwork-forward / card, all fixtures", (n) => n.startsWith("state--card--")],
  ["4-t3-pill", "T3 — micro pill, all fixtures (collapsed; see group 6 for hover-expanded)", (n) => n.startsWith("state--pill--")],
  ["5-t4-extreme", "T4 — extreme / card, all fixtures (static frame; motion doesn't show in a still)", (n) => n.startsWith("state--card-extreme--")],
  ["6-layouts-interaction", "Layouts · hover · keyboard focus · T3 collapsed vs expanded", (n) => n.startsWith("layout--") || n.startsWith("interaction--")],
];
const b64 = (f) => (fs.existsSync(f) ? "data:image/png;base64," + fs.readFileSync(f).toString("base64") : "");
const names = fs.readdirSync(path.join(root, "chromium")).filter((f) => f.endsWith(".png")).map((f) => f.slice(0, -4)).sort();

const browser = await chromium.launch();
for (const [id, title, pick] of groups) {
  const rows = names.filter(pick).map((n) => `
    <div class="label">${n.replace(/^state--(strip|card|pill|card-extreme)--/, "").replace(/^[a-z]+--/, "").replace(/-/g, " ")}</div>
    <div class="cell"><img src="${b64(path.join(root, "chromium", n + ".png"))}"></div>
    <div class="cell"><img src="${b64(path.join(root, "webkit", n + ".png"))}"></div>`).join("");
  const html = `<style>
    body{margin:0;padding:24px;background:#e9e7e2;font:14px/1.3 system-ui,sans-serif;color:#222;width:1500px}
    h1{font-size:18px;margin:0 0 16px}
    .grid{display:grid;grid-template-columns:200px 1fr 1fr;gap:12px 20px;align-items:center}
    .head{font-weight:600;color:#555} .label{font-weight:600}
    .cell img{display:block;height:auto;max-width:100%;zoom:.5}
  </style><h1>${title}</h1><div class="grid"><div class="head"></div><div class="head">Chromium (≈ WebView2 / Windows)</div><div class="head">WebKit (≈ WKWebView — approximation)</div>${rows}</div>`;
  const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: 1548, height: 600 } });
  await page.setContent(html);
  await page.waitForLoadState("load");
  await page.screenshot({ path: path.join(root, `sheet-${id}.png`), fullPage: true });
  await page.close();
  console.log("wrote", path.join(root, `sheet-${id}.png`));
}
await browser.close();
