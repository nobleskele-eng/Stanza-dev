// The settings window and the player talk through Tauri events (M3 L4). The player window owns the appearance: it
// alone saves it, sizes its window and loads theme CSS. The settings window only asks (`settings:*`) and shows what the
// player reports back (`appearance:changed`), so the two can never disagree for long or both write at once.
//
// Payloads are untrusted on both ends (another window, or anything that can emit): each side checks what it gets.
import { isTauri } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { parseCompanion, type Appearance, type CompanionSetting } from "../theme/appearance";

/** The settings window's label (`LABEL` in src-tauri/src/settings_window.rs). */
export const SETTINGS_LABEL = "settings";
export const PLAYER_LABEL = "main";

export const EVENTS = {
  /** settings → player: use this companion setting. */
  companion: "settings:companion",
  /** settings → player: Reset appearance (default theme, nothing customised; the companion kept). */
  reset: "settings:reset",
  /** settings → player: just opened; send me the appearance. */
  hello: "settings:hello",
  /** player → settings: the appearance now (sent on every change, and in answer to hello). */
  appearance: "appearance:changed",
} as const;

/** What the settings window shows of the appearance. */
export interface SettingsView {
  theme: string;
  companion: CompanionSetting;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** An `appearance:changed` payload, untrusted: a theme id (checked against the themes where it's used) and a companion. */
export function parseView(raw: unknown): SettingsView {
  const theme = isRecord(raw) && typeof raw.theme === "string" ? raw.theme : "";
  return { theme, companion: parseCompanion(isRecord(raw) ? raw.companion : undefined) };
}

/** This window's label, or null outside Tauri. */
export function currentWindowLabel(): string | null {
  if (!isTauri()) return null;
  try {
    return getCurrentWindow().label;
  } catch {
    return null;
  }
}

/** Listens for `event`; the returned function stops listening, even if called before listening began. */
function on(event: string, handler: (payload: unknown) => void): () => void {
  let off: (() => void) | null = null;
  let stopped = false;
  listen<unknown>(event, (e) => handler(e.payload)).then(
    (unlisten) => (stopped ? unlisten() : (off = unlisten)),
    (err) => console.error("settings bridge: not listening", event, err),
  );
  return () => {
    stopped = true;
    off?.();
  };
}

const send = (target: string, event: string, payload?: unknown) =>
  emitTo(target, event, payload).catch((err) => console.error("settings bridge: not sent", event, err));

// --- The player's side ---

export interface PlayerSide {
  appearance: () => Appearance;
  setCompanion: (next: CompanionSetting) => void;
  reset: () => void;
}

/** Answers the settings window. Outside Tauri, nothing. */
export function installPlayerBridge(player: PlayerSide): () => void {
  if (!isTauri()) return () => {};
  const offs = [
    on(EVENTS.companion, (payload) => player.setCompanion(parseCompanion(payload))),
    on(EVENTS.reset, () => player.reset()),
    on(EVENTS.hello, () => void publishAppearance(player.appearance())),
  ];
  return () => offs.forEach((off) => off());
}

/** Tells the settings window (if it's open) what the appearance is now. */
export function publishAppearance(appearance: Appearance): Promise<void> {
  if (!isTauri()) return Promise.resolve();
  const view: SettingsView = { theme: appearance.theme, companion: appearance.companion };
  return send(SETTINGS_LABEL, EVENTS.appearance, view);
}

// --- The settings window's side ---

export const askCompanion = (next: CompanionSetting) => send(PLAYER_LABEL, EVENTS.companion, next);
export const askReset = () => send(PLAYER_LABEL, EVENTS.reset);

/** Follows the player's appearance: says hello once listening, then calls `onView` with each report. */
export function followPlayer(onView: (view: SettingsView) => void): () => void {
  if (!isTauri()) return () => {};
  let off: (() => void) | null = null;
  let stopped = false;
  listen<unknown>(EVENTS.appearance, (e) => onView(parseView(e.payload))).then(
    (unlisten) => {
      if (stopped) return unlisten();
      off = unlisten;
      void send(PLAYER_LABEL, EVENTS.hello);
    },
    (err) => console.error("settings bridge: not listening", EVENTS.appearance, err),
  );
  return () => {
    stopped = true;
    off?.();
  };
}
