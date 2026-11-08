// The theme picker, first cut (docs/DECISIONS.md, Slice 4): right-click the player for a native menu
// listing every theme by its theme.json `name`, the active one checked. The names are the menu's only
// text, so it needs no other copy; the companion item after them is an icon (companionIcon.ts), and so is its picker
// (C6a): a submenu of pictures, every species, the current one's palettes and what it can wear (D2c), the chosen ones
// awake. Previews come with the settings window (PLAN.md Phase 4/5).
// No-op outside Tauri, where the browser's own context menu stays.
import { isTauri } from "@tauri-apps/api/core";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { Image } from "@tauri-apps/api/image";
import { Menu, Submenu, type MenuOptions } from "@tauri-apps/api/menu";
import { SKINS, SPECIES } from "../companion/registry";
import { copy, NEEDS_COPY } from "../copy";
import type { ThemeManifest } from "../theme/variant";
import { MENU_ICON_SKIN, menuIconScale, skinMenuIcon } from "./companionIcon";

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

/** A species, one of its palettes and what it wears (one of its accessories, or null). */
export interface CompanionChoice {
  skin: string;
  palette: string;
  accessory: string | null;
}

/** One picture in the picker: what picking it chooses, and whether it's drawn awake (it's the current choice). */
export interface PickerPicture extends CompanionChoice {
  awake: boolean;
}

/** The accessory if `skin` has one by that id, else null (what picking that species would wear). */
const wears = (skin: string, accessory: string | null) => (accessory && SKINS[skin]?.accessories?.[accessory] ? accessory : null);

/**
 * The picker's pictures (C6a, D2c), each showing what picking it gives you:
 * - every species, each in its default palette (the current one in its current palette), wearing what it wears now
 *   if that species has it;
 * - the current species in each of its palettes;
 * - the current species bare, then in each accessory it can wear (none for a species without any).
 * The current species, palette and accessory are awake, the rest asleep.
 */
export function companionPickerEntries(current: CompanionChoice): { species: PickerPicture[]; palettes: PickerPicture[]; accessories: PickerPicture[] } {
  const accessory = wears(current.skin, current.accessory);
  const species = SPECIES.map((skin) => {
    const mine = skin === current.skin;
    return { skin, palette: mine ? current.palette : "default", accessory: wears(skin, accessory), awake: mine };
  });
  const palettes = Object.keys(SKINS[current.skin]?.palettes ?? {}).map((palette) => ({
    skin: current.skin,
    palette,
    accessory,
    awake: palette === current.palette,
  }));
  const ids = Object.keys(SKINS[current.skin]?.accessories ?? {});
  const accessories = ids.length
    ? [null, ...ids].map((id) => ({ skin: current.skin, palette: current.palette, accessory: id, awake: id === accessory }))
    : [];
  return { species, palettes, accessories };
}

export interface CompanionMenu {
  isOn: () => boolean;
  toggle: () => void;
  /** The species, palette and accessory chosen now (shown even while the companion is off). */
  current: () => CompanionChoice;
  /** Picked from the picker. */
  pick: (choice: CompanionChoice) => void;
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
 *
 * The themes are read at each request (`getManifests`), so themes added or edited while the app runs (M3 L3) show
 * without installing the menu again. Removed while its menu is open, it closes that menu and its pictures once the
 * popup has returned (sooner is the deadlock above).
 */
export function installThemeMenu(
  getManifests: () => Record<string, ThemeManifest>,
  getActive: () => string,
  onPick: (id: string) => void,
  companion?: CompanionMenu,
  doc: Document = document,
): () => void {
  if (!isTauri()) return () => {};
  let menu: Menu | null = null;
  let submenu: Submenu | null = null;
  let busy = false;
  let removed = false;
  // Each picture (a skin, a palette, an accessory, awake or asleep) per scale, made once and kept: `Image.new` is a
  // resource command too, so it only ever runs inside the request chain below, after the previous menu has closed (the
  // deadlock rule).
  const icons = new Map<string, Promise<Image | null>>();
  const iconFor = ({ skin, palette, accessory, awake }: PickerPicture): Promise<Image | null> => {
    const dpr = doc.defaultView?.devicePixelRatio ?? 1;
    const key = `${skin}/${palette}/${accessory ?? ""}/${awake}@${menuIconScale(dpr)}`;
    let icon = icons.get(key);
    if (!icon) {
      const { rgba, width, height } = skinMenuIcon(SKINS[skin], palette, awake, dpr, accessory);
      icon = Image.new(rgba, width, height).catch((err) => {
        console.error("companion menu icon failed", err);
        return null;
      });
      icons.set(key, icon);
    }
    return icon;
  };
  /**
   * The picker submenu (C6a), or null if any of its pictures failed: it has no text to fall back on. Made as its own
   * resource and given its picture with `setIcon`: Tauri reads an inline item with text and an icon as a plain icon
   * item before it tries a submenu, which drops the nested items (tauri 2.11, `MenuItemPayloadKind`; DECISIONS.md
   * C6a). It's kept in `submenu` and closed with the menu.
   */
  const picker = async (c: CompanionMenu): Promise<Submenu | null> => {
    const current = c.current();
    const { species, palettes, accessories } = companionPickerEntries(current);
    const entries = [...species, ...palettes, ...accessories];
    // The label is the creature as it is now: the same picture as its awake palette.
    const [label, ...pictures] = await Promise.all([palettes.find((e) => e.awake) ?? { ...current, awake: true }, ...entries].map(iconFor));
    if (!label || pictures.some((p) => !p)) return null;
    const item = (entry: PickerPicture) => ({ text: "", icon: pictures[entries.indexOf(entry)]!, action: () => c.pick(entry) });
    const rows = [species, palettes, accessories].filter((row) => row.length);
    const sub = await Submenu.new({
      text: "",
      items: rows.flatMap((row, i) => [...(i ? [{ item: "Separator" as const }] : []), ...row.map(item)]),
    });
    submenu = sub;
    await sub.setIcon(label);
    return sub;
  };
  const release = async () => {
    const previous = [menu, submenu];
    menu = null;
    submenu = null;
    for (const r of previous) await r?.close().catch(() => {});
  };
  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    if (busy) return;
    busy = true;
    const items: MenuOptions["items"] = themeMenuEntries(getManifests(), getActive()).map(({ id, text, checked }) => ({
      text,
      checked,
      action: () => onPick(id),
    }));
    const on = companion?.isOn() ?? false;
    release()
      .then(async () => {
        if (companion) {
          // The on/off cassette first (its picture is the first one made), then the picker.
          const icon = await iconFor({ skin: MENU_ICON_SKIN, palette: "default", accessory: null, awake: on });
          items.push({ item: "Separator" }, companionMenuItem(on, icon, () => companion.toggle()));
          const sub = await picker(companion).catch((err) => {
            console.error("companion picker failed", err);
            return null;
          });
          if (sub) items.push(sub);
        }
        return Menu.new({ items });
      })
      .then((m) => {
        menu = m;
        return m.popup(new LogicalPosition(e.clientX, e.clientY));
      })
      .catch((err) => console.error("theme menu failed", err))
      .finally(() => {
        busy = false;
        if (removed) void dispose();
      });
  };
  /** The menu, then every picture made: all of them resources, closed one at a time. */
  const dispose = async () => {
    await release();
    const made = [...icons.values()];
    icons.clear();
    for (const icon of made) await (await icon)?.close().catch(() => {});
  };
  doc.addEventListener("contextmenu", onContextMenu);
  return () => {
    removed = true;
    doc.removeEventListener("contextmenu", onContextMenu);
    if (!busy) void dispose(); // mid-request the popup is open: closing now is the very deadlock above, so after it
  };
}
