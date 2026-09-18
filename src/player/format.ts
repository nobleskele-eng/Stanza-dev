/** mm:ss (or h:mm:ss past an hour), per the .mp-time-current/.mp-time-total contract parts. */
export function formatMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const paddedSeconds = String(seconds).padStart(2, "0");

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${paddedSeconds}`;
  }
  return `${minutes}:${paddedSeconds}`;
}

/** 0–1 fraction for --mp-progress. Returns 0 when duration is unknown (never NaN/Infinity). */
export function progressFraction(positionMs: number, durationMs: number | undefined): number {
  if (!durationMs || durationMs <= 0) return 0;
  return Math.min(1, Math.max(0, positionMs / durationMs));
}
