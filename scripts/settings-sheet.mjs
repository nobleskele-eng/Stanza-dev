// Builds the review sheet for the M3 L4 design round: three directions for the settings window, drawn as static
// mockups with the real theme captures (e2e/review/chromium, from `npm run review`) and the real companion sprites
// (companions/*/companion.json). Every word the window would show is a dashed slot: those are yours to write
// (docs/COPY.md); the only real copy shown is the theme names, which COPY.md already has.
// Run: node scripts/settings-sheet.mjs docs/design/l4-settings-concepts.png
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const out = process.argv[2];
if (!out) throw new Error("usage: node scripts/settings-sheet.mjs <out.png>");
const root = new URL("../", import.meta.url);
/** A review capture (2×, the card inside the harness's 16 px #f6f6f6 margin) and its size. */
const png = (name) => {
  const buf = readFileSync(new URL(`e2e/review/chromium/${name}.png`, root));
  return { url: `data:image/png;base64,${buf.toString("base64")}`, w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
};
const MARGIN = 32; // the harness margin, in capture pixels
/** The card alone, cropped out of its capture, as big as fits in maxW × maxH. */
function thumb(shot, maxW, maxH) {
  const cw = shot.w - 2 * MARGIN;
  const ch = shot.h - 2 * MARGIN;
  const s = Math.min(maxW / cw, maxH / ch);
  return `<div class="thumb" style="width:${cw * s}px;height:${ch * s}px;background-image:url(${shot.url});background-size:${shot.w * s}px ${shot.h * s}px;background-position:${-MARGIN * s}px ${-MARGIN * s}px"></div>`;
}
const theme = (id) => JSON.parse(readFileSync(new URL(`themes/${id}/theme.json`, root), "utf8"));
const skin = (id) => JSON.parse(readFileSync(new URL(`companions/${id}/companion.json`, root), "utf8"));

const THEMES = [
  { id: "t1-default", shot: png("state--card-t1--typical-all-caps") },
  { id: "t2-artwork", shot: png("state--card--typical-all-caps") },
  { id: "t3-pill", shot: png("state--pill--typical-all-caps") },
  { id: "t4-extreme", shot: png("state--card-extreme--typical-all-caps") },
  { id: "t5-kinetic", shot: png("state--card-kinetic--typical-all-caps") },
].map((t) => ({ ...t, name: theme(t.id).name }));
const SKINS = ["pilcrow", "bookworm", "cassette"].map(skin);

/** One sprite frame as inline SVG. */
function sprite(s, frame, palette = "default", px = 3) {
  const colours = s.palettes[palette];
  const rects = frame.flatMap((row, y) =>
    [...row].map((c, x) => (c === "." ? "" : `<rect x="${x}" y="${y}" width="1" height="1" fill="${colours[Number(c) - 1]}"/>`)),
  );
  return `<svg width="${s.grid * px}" height="${s.grid * px}" viewBox="0 0 ${s.grid} ${s.grid}" shape-rendering="crispEdges">${rects.join("")}</svg>`;
}
/** An accessory's art alone (the window would show it worn; simplified here). */
function accessory(a, px = 3) {
  const w = Math.max(...a.art.map((r) => r.length));
  const rects = a.art.flatMap((row, y) =>
    [...row].map((c, x) => (c === "." ? "" : `<rect x="${x}" y="${y}" width="1" height="1" fill="${a.colours[c.charCodeAt(0) - 97]}"/>`)),
  );
  return `<svg width="${w * px}" height="${a.art.length * px}" viewBox="0 0 ${w} ${a.art.length}" shape-rendering="crispEdges">${rects.join("")}</svg>`;
}
const idle = (s, palette, px) => sprite(s, s.animations.idle.frames[0], palette, px);
const asleep = (s, palette, px) => sprite(s, s.animations.sleep.frames[0], palette, px);

/** A copy slot: what goes there, never the words themselves. */
const slot = (what, cls = "") => `<span class="slot ${cls}">${what}</span>`;

const cassette = SKINS[2];
const card = (t, active, maxW = 150, maxH = 172) => `
  <div class="tcard${active ? " active" : ""}">
    <div class="shot">${thumb(t.shot, maxW, maxH)}</div>
    <div class="tname">${t.name}</div>
  </div>`;
const userCard = `
  <div class="tcard">
    <div class="shot user"><div class="paper"><i></i><b></b><b class="s"></b><b class="s"></b></div></div>
    <div class="tname">my-paper <em>(your theme.json name)</em></div>
  </div>`;
const brokenCard = `
  <div class="tcard broken">
    <div class="shot bad">${slot("theme failed to load")}<code>not-json</code></div>
    <div class="tname">half-done <em>(folder)</em></div>
  </div>`;

const companionPanel = (look) => `
  <div class="comp ${look}">
    <div class="row toggle"><div class="pic on">${idle(cassette, "default", 4)}</div><div class="pic">${asleep(cassette, "default", 4)}</div>
      <span class="note">on / off: the menu's awake and asleep cassette</span></div>
    <div class="row">${SKINS.map((s, i) => `<div class="pic${i === 2 ? " on" : ""}">${idle(s, "default", 3)}</div>`).join("")}</div>
    <div class="row">${Object.keys(cassette.palettes).map((p, i) => `<div class="pic${i === 0 ? " on" : ""}">${idle(cassette, p, 3)}</div>`).join("")}</div>
    <div class="row"><div class="pic on">${idle(cassette, "default", 3)}</div>${Object.values(cassette.accessories)
      .map((a) => `<div class="pic acc">${accessory(a, 3)}</div>`)
      .join("")}</div>
  </div>`;

const titlebar = (dark) => `
  <div class="tb ${dark ? "dark" : "light"}"><span class="ico"></span>${slot("window title", "tb")}
    <span class="caps"><i>&#xE921;</i><i>&#xE922;</i><i>&#xE8BB;</i></span></div>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #e9e6df; font: 15px/1.45 "Segoe UI", Arial, sans-serif; color: #1b1a17; width: 1640px; }
  .sheet { padding: 44px 48px 56px; }
  h1 { font: 700 30px Georgia, serif; margin: 0 0 6px; }
  .lede { margin: 0 0 6px; max-width: 1180px; color: #3d3a33; }
  .legend { display: flex; gap: 22px; align-items: center; margin: 14px 0 34px; color: #3d3a33; font-size: 14px; }
  h2 { font: 700 24px Georgia, serif; margin: 0 0 4px; }
  h2 small { font: 600 13px "Segoe UI", sans-serif; color: #c1432e; letter-spacing: .04em; margin-left: 10px; text-transform: uppercase; }
  .concept { display: grid; grid-template-columns: auto 1fr; gap: 34px; align-items: start; margin-bottom: 46px; }
  .notes { font-size: 14.5px; color: #2b2924; }
  .notes p { margin: 0 0 10px; }
  .notes ul { margin: 0 0 10px; padding-left: 18px; }
  .notes li { margin-bottom: 5px; }
  .notes .pro { color: #285c34; } .notes .con { color: #8a2b1d; }
  .slot { display: inline-block; border: 1.5px dashed currentColor; border-radius: 4px; padding: 0 6px; font: 600 11px/1.6 "Segoe UI", sans-serif;
    letter-spacing: .02em; opacity: .85; white-space: nowrap; }
  .slot::before { content: "\\2039 "; } .slot::after { content: " \\203A"; }
  /* --- window frames --- */
  .win { border-radius: 8px; overflow: hidden; box-shadow: 0 18px 40px rgba(0,0,0,.28), 0 0 0 1px rgba(0,0,0,.35); }
  .tb { height: 32px; display: flex; align-items: center; gap: 10px; padding-left: 12px; font-size: 12px; }
  .tb.dark { background: #1f1f1f; color: #e8e8e8; } .tb.light { background: #f3f3f3; color: #1b1b1b; }
  .tb .ico { width: 16px; height: 16px; border-radius: 3px; background: #c1432e; }
  .tb .caps { margin-left: auto; display: flex; } .tb .caps i { font: 10px "Segoe Fluent Icons", "Segoe MDL2 Assets"; font-style: normal; width: 46px; text-align: center; line-height: 32px; }
  /* --- A: Index --- */
  .A { width: 900px; background: #0b0b0d; color: #f2f0ea; }
  .A .body { display: grid; grid-template-columns: 196px 1fr; height: 640px; }
  .A .rail { border-right: 1px solid #221d1a; padding: 26px 0; display: flex; flex-direction: column; gap: 4px; }
  .A .rail a { display: block; padding: 9px 22px; color: #9a968d; font: 17px Georgia, serif; border-left: 3px solid transparent; }
  .A .rail a.on { color: #f2f0ea; border-left-color: #c1432e; }
  .A .rail a.later { opacity: .35; }
  .A .rail .sp { flex: 1; }
  .A .main { padding: 26px 30px; display: flex; flex-direction: column; min-width: 0; }
  .A h3 { font: 400 30px Georgia, serif; margin: 0 0 18px; color: #f2f0ea; }
  .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
  .tcard .shot { height: 196px; border-radius: 10px; background: #16130f; display: grid; place-items: center; padding: 12px; outline: 1px solid #221d1a; }
  .thumb { background-repeat: no-repeat; }
  .tcard.active .shot { outline: 2px solid #c1432e; }
  .tcard .tname { font: 12px "Courier New", monospace; color: #c9c5bc; margin-top: 7px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tcard.active .tname { color: #f2f0ea; } .tcard .tname em { color: #6c675e; font-style: normal; }
  .shot.user .paper { width: 76px; height: 136px; border-radius: 6px; background: #f3efe6; padding: 10px; display: flex; flex-direction: column; gap: 6px; }
  .paper i { display: block; height: 58px; background: #d9d1c0; border-radius: 3px; } .paper b { display: block; height: 7px; background: #5f5a50; border-radius: 2px; } .paper b.s { width: 70%; background: #b4ac9c; }
  .tcard.broken .shot { background: repeating-linear-gradient(135deg, #16130f 0 8px, #1d1814 8px 16px); color: #c1432e; flex-direction: column; display: flex; justify-content: center; align-items: center; gap: 8px; }
  .tcard.broken code { font: 12px "Courier New", monospace; color: #9a968d; }
  .foot { margin-top: auto; display: flex; gap: 12px; align-items: center; padding-top: 18px; border-top: 1px solid #221d1a; }
  .btn { border: 1px solid #3a322d; border-radius: 6px; padding: 8px 14px; color: #f2f0ea; }
  .btn.danger { margin-left: auto; border-color: transparent; color: #e0806d; }
  .comp { display: flex; flex-direction: column; gap: 14px; }
  .comp .row { display: flex; gap: 10px; align-items: center; }
  .comp .pic { width: 70px; height: 70px; border-radius: 10px; display: grid; place-items: center; background: #16130f; outline: 1px solid #221d1a; }
  .comp .pic.on { outline: 2px solid #c1432e; }
  .comp .note { font-size: 12px; color: #6c675e; margin-left: 8px; }
  .A2 { margin-top: 18px; }
  .A2 .body { display: grid; grid-template-columns: 196px 1fr; height: 470px; }
  /* --- B: Sheet --- */
  .B { width: 520px; background: #0b0b0d; color: #f2f0ea; }
  .B .body { height: 820px; overflow: hidden; padding: 26px 30px; }
  .B h3 { font: 400 26px Georgia, serif; margin: 0 0 14px; }
  .B .strip { display: flex; gap: 12px; margin-bottom: 14px; }
  .B .strip .tcard { width: 132px; flex: none; } .B .strip .tcard .shot { height: 170px; }
  .B .fade { height: 70px; margin: -60px -30px 0; background: linear-gradient(transparent, #0b0b0d); position: relative; }
  .B .comp .pic { width: 58px; height: 58px; }
  .B hr { border: 0; border-top: 1px solid #221d1a; margin: 22px 0; }
  /* --- C: System --- */
  .C { width: 520px; background: #fbfbfb; color: #1b1b1b; font-family: "Segoe UI", sans-serif; }
  .C .body { height: 820px; padding: 22px 26px; }
  .C h3 { font: 600 20px "Segoe UI", sans-serif; margin: 0 0 12px; }
  .C .list { background: #fff; border: 1px solid #e5e5e5; border-radius: 6px; }
  .C .item { display: flex; gap: 12px; align-items: center; padding: 11px 14px; border-bottom: 1px solid #efefef; font-size: 14px; }
  .C .item:last-child { border-bottom: 0; }
  .C .radio { width: 18px; height: 18px; border-radius: 50%; border: 1.5px solid #8a8a8a; }
  .C .radio.on { border: 5px solid #005fb8; }
  .C .item .err { margin-left: auto; color: #c42b1c; font-size: 12px; }
  .C .comp .pic { width: 54px; height: 54px; background: #f3f3f3; outline: 1px solid #e5e5e5; } .C .comp .pic.on { outline: 2px solid #005fb8; }
  .C .btn { border: 1px solid #d1d1d1; color: #1b1b1b; background: #fff; display: inline-block; margin-top: 14px; }
  .C .btn.danger { color: #c42b1c; margin-left: 10px; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 44px; margin-bottom: 40px; }
  .pair .concept { grid-template-columns: auto; gap: 16px; margin: 0; }
  /* --- decisions --- */
  .decide { display: grid; grid-template-columns: 1fr 1fr; gap: 26px 44px; background: #f6f4ef; border-radius: 12px; padding: 30px 34px; }
  .decide h4 { font: 700 17px Georgia, serif; margin: 0 0 6px; }
  .decide p { margin: 0 0 4px; font-size: 14px; color: #2b2924; }
  .decide .rec { color: #c1432e; font-weight: 600; }
  .copy { margin-top: 30px; background: #f6f4ef; border-radius: 12px; padding: 26px 34px; columns: 2; column-gap: 44px; font-size: 14px; }
  .copy h4 { column-span: all; font: 700 17px Georgia, serif; margin: 0 0 10px; }
  .copy div { break-inside: avoid; margin-bottom: 6px; }
  .copy .have { color: #285c34; }
</style></head><body><div class="sheet">
  <h1>Settings window: three directions (M3 L4 design round)</h1>
  <p class="lede">Static mockups, drawn to scale (1 px = 1 logical px). Theme thumbnails are the real review captures (fixture track);
  the creatures are the real sprites. Nothing here is built yet. L4 covers the window, its themes list, the companion options
  and Reset appearance; the customizer (L5) and snippets / theme packages (L6) slot in later as more sections.</p>
  <div class="legend"><span class="slot">dashed</span> = words you write (docs/COPY.md). Nothing in the window is my wording.
    <span>Theme names are COPY.md's current ones.</span></div>

  <div class="concept">
    <div>
      <div class="win A">${titlebar(true)}<div class="body">
        <div class="rail"><a class="on">${slot("themes")}</a><a>${slot("companion")}</a><a class="later">${slot("customize · L5")}</a><a class="later">${slot("snippets · L6")}</a><div class="sp"></div></div>
        <div class="main"><h3>${slot("themes heading", "big")}</h3>
          <div class="grid">${THEMES.map((t, i) => card(t, i === 0)).join("")}${userCard}${brokenCard}</div>
          <div class="foot"><span class="btn">${slot("open themes folder")}</span><span class="btn danger">${slot("reset appearance")}</span></div>
        </div></div></div>
      <div class="win A A2">${titlebar(true)}<div class="body">
        <div class="rail"><a>${slot("themes")}</a><a class="on">${slot("companion")}</a><a class="later">${slot("customize · L5")}</a><a class="later">${slot("snippets · L6")}</a><div class="sp"></div></div>
        <div class="main"><h3>${slot("companion heading", "big")}</h3>${companionPanel("A")}</div></div></div>
    </div>
    <div class="notes">
      <h2>A · Index <small>my pick</small></h2>
      <p>Stanza's own look (T1's ink: near-black, paper white, one ink red; Georgia for headings, Courier New for names), a section
      rail on the left, one section at a time. Windows' own title bar, dark.</p>
      <ul>
        <li><b>Themes:</b> every theme as a live preview: the real player, small, showing what you're playing now. Click one to wear it.
        The one you're wearing is outlined in red. Your themes follow the five; one that fails a check shows its problem
        (${slot("theme failed to load")} plus its code, e.g. <code>not-json</code>) and can't be picked.</li>
        <li><b>Companion:</b> the same pictures as the right-click menu, bigger: on/off (awake/asleep), species, palette, what it wears.</li>
        <li><b>Footer:</b> open the themes folder (where you drop your own); Reset appearance, which asks first.</li>
        <li>Previews of your themes render in their own sandboxed frame, so a theme's CSS can never touch this window (PLAN.md: user CSS is
        for the player only).</li>
      </ul>
      <p class="pro">+ Room for L5 and L6 as more rail entries. The previews sell the themes; picking is one click.</p>
      <p class="con">− The most work: the live previews (one small player per theme) and the rail.</p>
    </div>
  </div>

  <div class="pair">
    <div class="concept">
      <div class="win B">${titlebar(true)}<div class="body">
        <h3>${slot("themes heading", "big")}</h3>
        <div class="strip">${THEMES.slice(0, 3).map((t, i) => card(t, i === 0, 108, 146)).join("")}</div>
        <div class="fade"></div>
        <span class="btn">${slot("open themes folder")}</span>
        <hr><h3>${slot("companion heading", "big")}</h3>${companionPanel("B")}
        <hr><span class="btn danger" style="margin-left:0">${slot("reset appearance")}</span>
      </div></div>
      <div class="notes">
        <h2>B · Sheet</h2>
        <p>Same look as A, one scrolling page, no rail. Themes as a row of previews you scroll sideways; the companion below; Reset at
        the bottom.</p>
        <p class="pro">+ Simplest to use and to build; nothing hidden behind a section.</p>
        <p class="con">− Gets long once the customizer and snippets arrive; the theme row hides most themes.</p>
      </div>
    </div>
    <div class="concept">
      <div class="win C">${titlebar(false)}<div class="body">
        <h3>${slot("themes heading")}</h3>
        <div class="list">${THEMES.map((t, i) => `<div class="item"><span class="radio${i === 0 ? " on" : ""}"></span>${t.name}</div>`).join("")}
          <div class="item"><span class="radio"></span>my-paper</div>
          <div class="item" style="color:#8a8a8a"><span class="radio" style="opacity:.4"></span>half-done<span class="err">${slot("theme failed to load")} not-json</span></div></div>
        <span class="btn">${slot("open themes folder")}</span>
        <h3 style="margin-top:26px">${slot("companion heading")}</h3>${companionPanel("C")}
        <span class="btn danger" style="margin-left:0;margin-top:22px">${slot("reset appearance")}</span>
      </div></div>
      <div class="notes">
        <h2>C · System</h2>
        <p>A plain Windows settings page: follows light/dark, Segoe UI, a list of theme names with radio buttons, no previews.</p>
        <p class="pro">+ Least work; looks at home on Windows.</p>
        <p class="con">− Generic; you pick themes by name without seeing them, the thing Stanza is about.</p>
      </div>
    </div>
  </div>

  <div class="decide">
    <div><h4>1 · Direction</h4><p>A, B or C (or a mix: e.g. A's look with B's single page).</p><p class="rec">My pick: A.</p></div>
    <div><h4>2 · Window frame</h4><p>Windows' own title bar (move, snap, close, Alt+F4 and screen readers all just work), or frameless with
      Stanza's own close button.</p><p class="rec">My pick: Windows' own, dark.</p></div>
    <div><h4>3 · Theme previews</h4><p>Live (the real player per theme, small, with your current track), static pictures, or names only.</p>
      <p class="rec">My pick: live, in L4.</p></div>
    <div><h4>4 · How it opens</h4><p>A gear picture in the right-click menu (no words, like the companion item), or a text item
      (needs a label). The tray (R4) gets one later either way.</p><p class="rec">My pick: the gear picture.</p></div>
    <div><h4>5 · Reset appearance</h4><p>Back to the default theme with nothing customised (and, from L6, snippets off). The companion stays
      as it is. It asks before doing it.</p><p class="rec">Say if the companion should reset too.</p></div>
    <div><h4>6 · Size</h4><p>A: about 900 × 640, resizable, the theme grid reflowing. B and C: about 520 × 820.</p></div>
  </div>

  <div class="copy"><h4>Words the window needs (for A; you write them, COPY.md gets the slots)</h4>
    <div>window title (title bar, taskbar, Alt+Tab)</div>
    <div>rail: themes · companion</div>
    <div>themes heading · companion heading <span class="have">(COPY.md has a companion section-title slot)</span></div>
    <div>open themes folder (button)</div>
    <div>theme failed to load <span class="have">(slot exists, still empty)</span></div>
    <div>reset appearance (button) <span class="have">(a tray slot exists; same words?)</span></div>
    <div>reset: the question it asks, and its two buttons</div>
    <div>settings menu item: none if it's a gear picture; its spoken name for screen readers either way</div>
    <div>spoken names for the pictures: each species <span class="have">(slots exist)</span>, each palette, each accessory, on/off</div>
    <div>a picked theme's spoken state (e.g. that it's the one you're wearing)</div>
  </div>
</div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: 1640, height: 1000 } });
await page.setContent(html, { waitUntil: "load" });
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(`wrote ${out}`);
