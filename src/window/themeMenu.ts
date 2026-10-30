// The theme picker, first cut (docs/DECISIONS.md, Slice 4): right-click the player for a native menu
// listing every theme by its theme.json `name`, the active one checked. The names are the menu's only
// text, so it needs no other copy; the companion item after them is an icon (companionIcon.ts). Previews come with
// the settings window (PLAN.md Phase 4/5).
// No-op outside Tauri, where the browser's own context menu stays.
import { isTauri } from "@tauri-apps/api/core";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { Image } from "@tauri-apps/api/image";
import { Menu, type MenuOptions } from "@tauri-apps/api/menu";
import { copy, NEEDS_COPY } from "../copy";
import type { ThemeManifest } from "../theme/variant";
import { companionMenuIcon, menuIconScale } from "./companionIcon";

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
 * The companion's on/off item: the cassette awake or asleep, with no text, once its icon image exists. Without one
 * (the image failed), the check item with COPY.md's label, so the toggle never disappears.
 */
export function companionMenuItem(on: boolean, icon: Image | null, action: () => void) {
  return icon ? { text: "", icon, action } : { text: copy("companionToggle"), checked: on, action };
}

export interface CompanionMenu {
  isOn: () => boolean;
  toggle: () => void;
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
  companion?: CompanionMenu,
  doc: Document = document,
): () => void {
  if (!isTauri()) return () => {};
  let menu: Menu | null = null;
  let busy = false;
  // Two images (on, off) per scale, made once and kept: `Image.new` is a resource command too, so it only ever
  // runs inside the request chain below, after the previous menu has closed (the deadlock rule).
  const icons = new Map<string, Promise<Image | null>>();
  const iconFor = (on: boolean): Promise<Image | null> => {
    const dpr = doc.defaultView?.devicePixelRatio ?? 1;
    const key = `${on}@${menuIconScale(dpr)}`;
    let icon = icons.get(key);
    if (!icon) {
      const { rgba, width, height } = companionMenuIcon(on, dpr);
      icon = Image.new(rgba, width, height).catch((err) => {
        console.error("companion menu icon failed", err);
        return null;
      });
      icons.set(key, icon);
    }
    return icon;
  };
  const release = async () => {
    const previous = menu;
    menu = null;
    await previous?.close().catch(() => {});
  };
  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    if (busy) return;
    busy = true;
    const items: MenuOptions["items"] = themeMenuEntries(manifests, getActive()).map(({ id, text, checked }) => ({
      text,
      checked,
      action: () => onPick(id),
    }));
    const on = companion?.isOn() ?? false;
    release()
      .then(() => (companion ? iconFor(on) : null))
      .then((icon) => {
        if (companion) items.push({ item: "Separator" }, companionMenuItem(on, icon, () => companion.toggle()));
        return Menu.new({ items });
      })
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
