// WCAG 2.x contrast helpers (PLAN.md Phase 3 gate: text meets AA 4.5:1; D14: the
// customizer warns when --mp-fg on --mp-bg falls below AA).

export type Rgb = [number, number, number];

/** Parses `#rgb`, `#rrggbb`, or the `rgb(r, g, b)` / `rgba(...)` strings browsers report. */
export function parseColor(input: string): Rgb | null {
  const s = input.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(s);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
  }
  const rgb = /^rgba?\(\s*(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)/.exec(s);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  // Computed style of color-mix()/modern color functions: `color(srgb 0.79 0.4 0.33)`, channels 0–1.
  const srgb = /^color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(s);
  if (srgb) return [Number(srgb[1]), Number(srgb[2]), Number(srgb[3])].map((v) => v * 255) as Rgb;
  return null;
}

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance([r, g, b]: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export const WCAG_AA_NORMAL = 4.5;
