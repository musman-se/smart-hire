import { useEffect, useState } from "react";

/**
 * The current time, re-read every `intervalMs`, for labels that depend on age —
 * "waiting 3d", "stalled for 5 minutes", a running timer — which would otherwise only
 * update when something else re-renders. Null pauses the clock.
 */
export function useNow(intervalMs: number | null = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (intervalMs === null) return;
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}
