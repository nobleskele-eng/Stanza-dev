// Live reload of user themes (PLAN.md §4 "Loading and hot swap", M3 L3). Rust watches the themes folder and sends
// `themes:changed` with the folders that changed (src-tauri/src/theme_watch.rs); the app then lists the themes again
// and works out what that means for the menu and for the theme on screen (`planRescan`). App.tsx does the swap.
//
// The rules:
// - The menu always offers what the folder holds now, by the launch rules (M3 L2): a theme that fails a check isn't
//   offered, one that's added is, one that's removed isn't.
// - The theme on screen is the exception while you edit it. If its folder changed and it still checks out, its new CSS
//   loads hidden and takes over in one frame (no unstyled frame, no mix of old and new). If it now fails a check (a
//   theme.json half-written), it stays as it last loaded, still offered, until a save that checks out. If its folder
//   is gone, the default theme takes over, the companion kept, as at launch.
import { listen } from "@tauri-apps/api/event";
import { isTauri } from "@tauri-apps/api/core";
import type { UserTheme, UserThemeScan } from "./userThemes";

/** The Tauri event (`EVENT` in src-tauri/src/theme_watch.rs). */
export const THEMES_CHANGED = "themes:changed";

/** What changed under the themes folder (`ThemesChanged` in src-tauri/src/theme_watch.rs). */
export interface ThemesChanged {
  /** Theme folders with something changed in them. */
  folders: string[];
  /** The themes folder itself changed, or the watcher lost track: any theme may have. */
  all: boolean;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The event's payload, untrusted: anything unexpected counts as "any theme may have changed". */
export function parseThemesChanged(raw: unknown): ThemesChanged {
  if (!isRecord(raw) || !Array.isArray(raw.folders)) return { folders: [], all: true };
  return { folders: raw.folders.filter((f): f is string => typeof f === "string"), all: raw.all === true };
}

/** Did this change touch the theme with this id (its folder)? */
export const touches = (change: ThemesChanged, id: string) => change.all || change.folders.includes(id);

/** Two changes as one: the folders of both. */
export function mergeChanges(a: ThemesChanged, b: ThemesChanged): ThemesChanged {
  return { folders: [...new Set([...a.folders, ...b.folders])].sort(), all: a.all || b.all };
}

/** The user themes with `id` set to `theme`, in folder order (the order Rust lists them, and the menu shows them). */
export function withTheme(themes: Record<string, UserTheme>, id: string, theme: UserTheme): Record<string, UserTheme> {
  const all = { ...themes, [id]: theme };
  return Object.fromEntries(Object.keys(all).sort().map((k) => [k, all[k]]));
}

/** What a new listing means for the theme on screen. */
export type OnScreen =
  /** Nothing of it changed, or it's a bundled theme. */
  | { kind: "keep" }
  /** Its folder changed and it still checks out: load its new CSS, then show it. */
  | { kind: "reload"; theme: UserTheme }
  /** Its folder changed and it now fails a check: it stays as it last loaded. */
  | { kind: "stale" }
  /** Its folder is gone: the default theme takes over. */
  | { kind: "gone" };

export interface RescanPlan {
  /** The user themes to offer. For a reload, with the new version of the one on screen. */
  offer: Record<string, UserTheme>;
  onScreen: OnScreen;
}

/**
 * The user themes before (`prev`), a new listing, the id of the theme on screen and what changed: what to offer, and
 * what to do with the theme on screen.
 */
export function planRescan(prev: Record<string, UserTheme>, scan: UserThemeScan, shown: string, change: ThemesChanged): RescanPlan {
  const before = prev[shown];
  if (!before) return { offer: scan.themes, onScreen: { kind: "keep" } };
  const now = scan.themes[shown];
  if (now) {
    if (touches(change, shown)) return { offer: scan.themes, onScreen: { kind: "reload", theme: now } };
    return { offer: withTheme(scan.themes, shown, before), onScreen: { kind: "keep" } };
  }
  // Not offered any more: still there but failing a check (Rust's code, or one of the frontend's), or gone.
  if (scan.problems.some((p) => p.folder === shown)) return { offer: withTheme(scan.themes, shown, before), onScreen: { kind: "stale" } };
  return { offer: scan.themes, onScreen: { kind: "gone" } };
}

/**
 * Runs `task` for each change, one at a time. Changes that arrive while one runs are merged and run once after it, so
 * a burst of saves never queues a reload per save, and two reloads never race.
 */
export function oneAtATime(task: (change: ThemesChanged) => Promise<void>): (change: ThemesChanged) => void {
  let running = false;
  let pending: ThemesChanged | null = null;
  const drain = async (change: ThemesChanged) => {
    running = true;
    try {
      await task(change);
    } catch (err) {
      console.error("theme reload failed", err);
    }
    running = false;
    const next = pending;
    pending = null;
    if (next) void drain(next);
  };
  return (change) => {
    if (running) pending = pending ? mergeChanges(pending, change) : change;
    else void drain(change);
  };
}

/**
 * The `themes:changed` feed, listening from the start (before the launch's own listing, so a save made meanwhile isn't
 * missed) and holding what arrives until the app takes it. Outside Tauri it never delivers anything.
 */
export class ThemeChanges {
  private held: ThemesChanged[] = [];
  private sink: ((change: ThemesChanged) => void) | null = null;
  private unlisten: (() => void) | null = null;
  private stopped = false;
  /** Resolves once listening (or failing to: live reload is then off, and the app works as before). */
  readonly ready: Promise<void>;

  constructor() {
    if (!isTauri()) {
      this.ready = Promise.resolve();
      return;
    }
    this.ready = listen<unknown>(THEMES_CHANGED, (e) => this.deliver(parseThemesChanged(e.payload))).then(
      (off) => {
        if (this.stopped) off();
        else this.unlisten = off;
      },
      (err) => console.error("theme changes: not listening", err),
    );
  }

  private deliver(change: ThemesChanged) {
    if (this.sink) this.sink(change);
    else this.held.push(change);
  }

  /** From now on, every change goes to `sink`, starting with any held so far. */
  attach(sink: (change: ThemesChanged) => void) {
    this.sink = sink;
    for (const change of this.held.splice(0)) sink(change);
  }

  /** Changes are held again (the app unmounted). */
  detach() {
    this.sink = null;
  }

  stop() {
    this.stopped = true;
    this.sink = null;
    this.unlisten?.();
  }
}
