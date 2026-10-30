import { useEffect, useState } from "react";

/** The device pixel ratio, kept current when the window moves to a screen with another scaling. */
export function useDevicePixelRatio(): number {
  const [dpr, setDpr] = useState(() => window.devicePixelRatio || 1);
  useEffect(() => {
    const q = window.matchMedia(`(resolution: ${dpr}dppx)`);
    const update = () => setDpr(window.devicePixelRatio || 1);
    q.addEventListener("change", update);
    return () => q.removeEventListener("change", update);
  }, [dpr]);
  return dpr;
}
