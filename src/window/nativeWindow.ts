// The production player's native window: sized from the active theme and draggable from
// anywhere on the player (PLAN.md C8; S1 spike, docs/DECISIONS.md 2026-09-16). Every function is
// a no-op outside Tauri (browser e2e, `vite preview`), so the bundle behaves the same there.
import { invoke, isTauri } from "@tauri-apps/api/core";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";

/** Pressing inside one of these never starts a window drag (C8). */
const NO_DRAG_SELECTOR = "button, input, a, [data-no-drag]";

/**
 * Set the native window to a theme's declared `window` size (logical px, so DPI scaling applies), then move it
 * `moveY` logical px down (negative = up). The companion's top margin grows the window upward by exactly the
 * margin it adds, so the card stays where it was on screen (M2 C2b). Never rejects.
 */
export async function fitWindowToTheme(size: { width: number; height: number }, moveY = 0): Promise<void> {
  if (!isTauri()) return;
  const win = getCurrentWindow();
  try {
    await win.setSize(new LogicalSize(size.width, size.height));
    if (moveY) {
      const [at, scale] = await Promise.all([win.outerPosition(), win.scaleFactor()]);
      await win.setPosition(new LogicalPosition(at.x / scale, at.y / scale + moveY));
    }
  } catch (e) {
    console.error("fitting the window failed", e);
  }
}

/**
 * C8: `data-tauri-drag-region` only fires on the exact element clicked, so a primary-button press
 * anywhere on `.mp-root` starts the drag instead, unless it lands on an interactive control.
 * Needs the `core:window:allow-start-dragging` permission, without which it fails silently (S1).
 * Returns the cleanup.
 */
export function installWindowDrag(doc: Document = document): () => void {
  if (!isTauri()) return () => {};
  const onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target instanceof Element ? e.target : null;
    if (!target?.closest(".mp-root") || target.closest(NO_DRAG_SELECTOR)) return;
    getCurrentWindow()
      .startDragging()
      .catch((err) => console.error("startDragging failed", err));
  };
  doc.addEventListener("mousedown", onMouseDown);
  return () => doc.removeEventListener("mousedown", onMouseDown);
}

/** The player's hit area: `.mp-root` and its `.mp-window` (every control is a grid item of the latter). */
const HIT_PARTS = ".mp-root, .mp-root > .mp-window";

/**
 * Click-through (docs/DECISIONS.md, Slice 3): the window is sized for the theme's largest state,
 * so most of it is often transparent. This reports the player's boxes (CSS px = logical px,
 * window-relative) to Rust, which lets clicks through the window whenever the cursor is outside
 * them. Re-measured on a resize of either box, an attribute change on either (theme, layout,
 * data-hover: catches instant transforms), a finished transition/animation, or a window resize;
 * re-sent only if different. Decorative bleed outside the boxes (T1's Collage, shadows) is not
 * part of the area. Until a report arrives, Rust keeps the whole window clickable. Returns the cleanup.
 */
export function installHitRegion(doc: Document = document): () => void {
  if (!isTauri()) return () => {};
  const view = doc.defaultView!;
  let observed: Element[] = [];
  let sent = "";
  let frame = 0;

  const send = () => {
    frame = 0;
    const rects = observed
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
      .map((r) => ({ x: r.x, y: r.y, width: r.width, height: r.height }));
    const key = JSON.stringify(rects);
    if (!rects.length || key === sent) return;
    sent = key;
    invoke("set_hit_region", { rects }).catch((e) => console.error("set_hit_region failed", e));
  };
  const schedule = () => {
    frame ||= view.requestAnimationFrame(send);
  };

  const resize = new ResizeObserver(schedule);
  // Own attributes only: the subtree includes per-frame effect writes (--mp-beat) that never move the boxes.
  const attrs = new MutationObserver(schedule);
  // The parts are normally mounted once, but re-find them if React ever replaces them.
  const findParts = () => {
    const parts = [...doc.querySelectorAll(HIT_PARTS)];
    if (parts.length === observed.length && parts.every((el, i) => el === observed[i])) return;
    resize.disconnect();
    attrs.disconnect();
    observed = parts;
    for (const el of parts) {
      resize.observe(el);
      attrs.observe(el, { attributes: true });
    }
    schedule();
  };
  const mounts = new MutationObserver(findParts);
  mounts.observe(doc.body, { childList: true, subtree: true });
  findParts();

  const events = ["transitionend", "animationend", "resize"] as const;
  for (const type of events) view.addEventListener(type, schedule, true);
  return () => {
    view.cancelAnimationFrame(frame);
    resize.disconnect();
    attrs.disconnect();
    mounts.disconnect();
    for (const type of events) view.removeEventListener(type, schedule, true);
  };
}
