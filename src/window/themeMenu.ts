// The theme picker, first cut (docs/DECISIONS.md, Slice 4): right-click the player for a native menu
// listing every theme by its theme.json `name`, the active one checked. The names are the menu's only
// text, so it needs no other copy. Previews come with the settings window (PLAN.md Phase 4/5).
// No-op outside Tauri, where the browser's own context menu stays.
import { isTauri } from "@tauri-apps/api/core";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { Menu } from "@tauri-apps/api/menu";
import { NEEDS_COPY } from "../copy";
import type { ThemeManifest } from "../theme/variant";

export interface ThemeMenuEntry {
  id: string;
  text: string;
  checked: boolean;
}

/** Registry order, the active theme checked; a theme without a name shows [NEEDS COPY], never its id. */
export function themeMenuEntries(manifests: Record<string, ThemeManifest>, active: string): ThemeMenuEntry[] {
  return Object.entries(manifests).map(([id, m]) => ({
    id,
    text: m.name?.trim() || NEEDS_COPY,
    checked: id === active,
  }));
}

/**
 * Any context-menu request in the window (right-click, or Shift+F10 / the Menu key) opens the theme menu at
 * that point. The last menu stays alive after its popup returns so its item action can still fire; it is
 * closed at the start of the next request. Returns the cleanup.
 *
 * Strictly one step at a time (docs/DECISIONS.md, Slice 4): Tauri's `popup` holds the webview's resource
 * table until the native menu closes, while `new` and `close` are main-thread commands that need that table.
 * Sending either while a menu is open deadlocks the main thread (found in the real exe: the second right-click
 * after a pick hung the app). So each request awaits the previous menu's close, then creates, then shows, and
 * requests arriving meanwhile are dropped. `popup` resolves only once the menu has closed (Windows; macOS
 * untested).
 */
export function installThemeMenu(
  manifests: Record<string, ThemeManifest>,
  getActive: () => string,
  onPick: (id: string) => void,
  doc: Document = document,
): () => void {
  if (!isTauri()) return () => {};
  let menu: Menu | null = null;
  let busy = false;
  const release = async () => {
    const previous = menu;
    menu = null;
    await previous?.close().catch(() => {});
  };
  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    if (busy) return;
    busy = true;
    const items = themeMenuEntries(manifests, getActive()).map(({ id, text, checked }) => ({
      text,
      checked,
      action: () => onPick(id),
    }));
    release()
      .then(() => Menu.new({ items }))
      .then((m) => {
        menu = m;
        return m.popup(new LogicalPosition(e.clientX, e.clientY));
      })
      .catch((err) => console.error("theme menu failed", err))
      .finally(() => {
        busy = false;
      });
  };
  doc.addEventListener("contextmenu", onContextMenu);
  return () => {
    doc.removeEventListener("contextmenu", onContextMenu);
    if (!busy) void release(); // mid-request the popup is open; closing now is the very deadlock above
  };
}
