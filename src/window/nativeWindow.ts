// The production player's native window: sized from the active theme and draggable from
// anywhere on the player (PLAN.md C8; S1 spike, docs/DECISIONS.md 2026-09-16). Every function is
// a no-op outside Tauri (browser e2e, `vite preview`), so the bundle behaves the same there.
import { isTauri } from "@tauri-apps/api/core";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";

/** Pressing inside one of these never starts a window drag (C8). */
const NO_DRAG_SELECTOR = "button, input, a, [data-no-drag]";

/** Set the native window to a theme's declared `window` size (logical px, so DPI scaling applies). */
export function fitWindowToTheme(size: { width: number; height: number }): void {
  if (!isTauri()) return;
  getCurrentWindow()
    .setSize(new LogicalSize(size.width, size.height))
    .catch((e) => console.error("setSize failed", e));
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
