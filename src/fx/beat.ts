// SIMULATED rhythm — there is no audio source here (docs/PLAN.md §9: Spotify's stream isn't
// accessible; system-audio loopback is a separate project). Nothing in this file listens to the
// music. It derives a smooth, per-track "breathing" signal from the track's own title/artist so
// decorative effects (shapes, waveform shimmer) feel alive and stable, and it must never be
// described in UI or docs as reacting to audio.
//
// Kept deliberately subtle (DECISIONS.md, animated-assets plan): a raised-cosine pulse with a
// slowly wandering phase, not a kick-drum transient, so it can't read as visibly off-beat
// against the real song.

export const BPM_MIN = 80;
export const BPM_MAX = 128;

/** FNV-1a, 32-bit. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — tiny seeded PRNG, returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Rhythm {
  bpm: number;
  /** radians */
  phase: number;
  /** radians of slow phase wander (irregularity) */
  wobbleDepth: number;
  wobbleHz: number;
  /** weight of the half-time overtone, 0..1 */
  harmonic: number;
}

export function rhythmFor(title: string, artist: string): Rhythm {
  const rnd = mulberry32(hashString(`${title}\u0000${artist}`));
  return {
    bpm: BPM_MIN + rnd() * (BPM_MAX - BPM_MIN),
    phase: rnd() * Math.PI * 2,
    wobbleDepth: 0.2 + rnd() * 0.4,
    wobbleHz: 0.05 + rnd() * 0.1,
    harmonic: 0.15 + rnd() * 0.2,
  };
}

/** Beat level in [0, 1] at `tSec` seconds. Pure and deterministic; continuous (no jumps). */
export function beatAt(r: Rhythm, tSec: number): number {
  const twoPi = Math.PI * 2;
  const ph = twoPi * (r.bpm / 60) * tSec + r.phase + r.wobbleDepth * Math.sin(twoPi * r.wobbleHz * tSec);
  const pulse = (0.5 + 0.5 * Math.cos(ph)) ** 2;
  const overtone = 0.5 + 0.5 * Math.sin(2 * ph + 1);
  const v = (1 - r.harmonic) * pulse + r.harmonic * overtone;
  return Math.min(1, Math.max(0, v));
}

/**
 * Deterministic, SoundCloud-style bar heights (0..1] for a whole track. Seeded from the track, so
 * it is stable across renders and sessions — and static, which is what keeps it from pretending
 * to be a real analysis of the audio.
 */
export function waveformPeaks(title: string, artist: string, count: number): number[] {
  const rnd = mulberry32(hashString(`wave\u0000${title}\u0000${artist}`));
  const raw = Array.from({ length: count }, () => rnd());
  const smooth = raw.map((v, i) => (v * 2 + (raw[i - 1] ?? v) + (raw[i + 1] ?? v)) / 4);
  const shaped = smooth.map((v, i) => {
    const envelope = 0.55 + 0.45 * Math.sin((Math.PI * (i + 0.5)) / count) ** 0.7;
    return v * envelope;
  });
  const max = Math.max(...shaped, 1e-6);
  return shaped.map((v) => 0.12 + 0.88 * (v / max));
}
