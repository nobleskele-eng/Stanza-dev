// UI copy comes from docs/COPY.md and nowhere else (CLAUDE.md: "Never generate displayed
// text. UI strings come from docs/COPY.md; missing strings render as [NEEDS COPY]").
// This module only reads that file; it never supplies wording of its own.
import copyMarkdown from "../docs/COPY.md?raw";

export const NEEDS_COPY = "[NEEDS COPY]";

/**
 * Parses `- **Label:** value` lines. A value that is empty or still starts with
 * `[NEEDS COPY]` counts as missing, even when a draft follows it: drafts are not
 * approved copy. Only the first line of an entry is read.
 */
export function parseCopy(markdown: string): Map<string, string> {
  const entries = new Map<string, string>();
  for (const line of markdown.split(/\r?\n/)) {
    const m = /^- \*\*(.+?):\*\*\s*(.*)$/.exec(line);
    if (!m) continue;
    const value = m[2].trim();
    if (value !== "" && !value.startsWith(NEEDS_COPY)) entries.set(m[1], value);
  }
  return entries;
}

/** Code-side names for the COPY.md labels the UI uses. Add a key here when the UI needs a new string. */
export const COPY_LABELS = {
  idle: "Idle / nothing playing",
  notRunning: "Spotify not running",
  errorFallback: "Generic error (no detail available)",
  sourceBadge: "Source badge wording",
  previous: "Previous button label",
  play: "Play button label",
  pause: "Pause button label",
  next: "Next button label",
  volume: "Volume slider label",
  lyrics: "Lyrics button label",
  linkOut: "Link-out label",
} as const;

export type CopyKey = keyof typeof COPY_LABELS;

/** Looks a label up in the given parsed copy; missing → `[NEEDS COPY]`. */
export function lookupCopy(entries: Map<string, string>, key: CopyKey): string {
  return entries.get(COPY_LABELS[key]) ?? NEEDS_COPY;
}

const entries = parseCopy(copyMarkdown);

export const copy = (key: CopyKey): string => lookupCopy(entries, key);
