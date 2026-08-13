import { useEffect, useState } from "react";

/**
 * Measures the display's refresh rate (Hz) using rAF and listens to
 * `prefers-reduced-motion`. Returns tuning knobs so animations can adapt
 * to 60 / 90 / 120 / 144 Hz displays and to users who request less motion.
 *
 * - `hz`: detected refresh rate (rounded to nearest 30), or `null` while measuring.
 * - `reducedMotion`: respects OS-level setting.
 * - `tier`: "low" (≤60), "high" (90/120), "ultra" (≥144).
 * - `durationScale`: multiply ms-based durations to keep perceived speed even.
 *   On 120Hz the same `0.3s` animation looks twice as fast as on 60Hz; this
 *   scale stretches durations slightly on high-refresh screens.
 */
export type RefreshTier = "low" | "high" | "ultra";

export interface DisplayRefresh {
  hz: number | null;
  reducedMotion: boolean;
  tier: RefreshTier;
  durationScale: number;
}

function measureHz(): Promise<number> {
  return new Promise((resolve) => {
    const samples: number[] = [];
    let last = performance.now();
    let frames = 0;
    const max = 30;

    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      if (dt > 0 && dt < 200) samples.push(1000 / dt);
      frames += 1;
      if (frames < max) {
        requestAnimationFrame(tick);
      } else {
        const sorted = samples.sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)] ?? 60;
        // round to nearest 30 Hz bucket (60, 90, 120, 144 → 150 close enough)
        const rounded = Math.round(median / 30) * 30;
        resolve(Math.max(30, Math.min(240, rounded)));
      }
    };

    requestAnimationFrame(tick);
  });
}

export function useDisplayRefreshRate(): DisplayRefresh {
  const [hz, setHz] = useState<number | null>(null);
  const [reducedMotion, setReducedMotion] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  });

  useEffect(() => {
    let cancelled = false;
    measureHz().then((value) => {
      if (!cancelled) setHz(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, []);

  const effectiveHz = hz ?? 60;
  const tier: RefreshTier = effectiveHz >= 144 ? "ultra" : effectiveHz >= 90 ? "high" : "low";
  // Reduced motion → snap. High-refresh → slightly longer durations so motion
  // doesn't feel rushed compared to 60Hz baseline.
  const durationScale = reducedMotion ? 0 : tier === "ultra" ? 1.25 : tier === "high" ? 1.15 : 1;

  return { hz, reducedMotion, tier, durationScale };
}
