import { useEffect, useState } from "react";

export type DeviceType = "mobile" | "tablet" | "desktop";
// Finer-grained tier used for fitting layouts edge-to-edge.
export type DeviceTier =
  | "xs" //  <360  — small phones (SE / older Android)
  | "sm" //  360–413 — most phones
  | "md" //  414–639 — large phones (Pro Max / Plus)
  | "lg" //  640–767 — phablet / small tablet portrait
  | "xl" //  768–1023 — tablet
  | "2xl"; //  >=1024 — desktop

export interface DeviceInfo {
  type: DeviceType;
  tier: DeviceTier;
  width: number;
  height: number;
  dpr: number;
  isTouch: boolean;
  isStandalone: boolean; // PWA installed
  orientation: "portrait" | "landscape";
  /** Recommended max width for the app shell at this tier (px). */
  shellMaxWidth: number;
  /** Recommended root font-size scalar (1 = base). */
  fontScale: number;
  safeArea: { top: number; bottom: number; left: number; right: number };
}

function tierFromWidth(w: number): DeviceTier {
  if (w < 360) return "xs";
  if (w < 414) return "sm";
  if (w < 640) return "md";
  if (w < 768) return "lg";
  if (w < 1024) return "xl";
  return "2xl";
}

function shellFor(tier: DeviceTier): number {
  switch (tier) {
    case "xs":
      return 340;
    case "sm":
      return 400;
    case "md":
      return 440;
    case "lg":
      return 560;
    case "xl":
      return 680;
    case "2xl":
      return 760;
  }
}

function fontScaleFor(tier: DeviceTier): number {
  switch (tier) {
    case "xs":
      return 0.92;
    case "sm":
      return 0.96;
    case "md":
      return 1;
    case "lg":
      return 1.02;
    case "xl":
      return 1.04;
    case "2xl":
      return 1.06;
  }
}

function read(): DeviceInfo {
  if (typeof window === "undefined") {
    return {
      type: "mobile",
      tier: "md",
      width: 390,
      height: 844,
      dpr: 1,
      isTouch: false,
      isStandalone: false,
      orientation: "portrait",
      shellMaxWidth: 440,
      fontScale: 1,
      safeArea: { top: 0, bottom: 0, left: 0, right: 0 },
    };
  }
  const w = window.innerWidth;
  const h = window.innerHeight;
  const tier = tierFromWidth(w);
  const type: DeviceType = w < 640 ? "mobile" : w < 1024 ? "tablet" : "desktop";
  const isTouch = "ontouchstart" in window || (navigator as Navigator).maxTouchPoints > 0;
  const isStandalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // @ts-expect-error iOS Safari
    window.navigator.standalone === true;
  const style = getComputedStyle(document.documentElement);
  const num = (v: string) => parseFloat(v.replace("px", "")) || 0;
  return {
    type,
    tier,
    width: w,
    height: h,
    dpr: window.devicePixelRatio || 1,
    isTouch,
    isStandalone,
    orientation: w >= h ? "landscape" : "portrait",
    shellMaxWidth: shellFor(tier),
    fontScale: fontScaleFor(tier),
    safeArea: {
      top: num(style.getPropertyValue("--sat") || "0"),
      bottom: num(style.getPropertyValue("--sab") || "0"),
      left: num(style.getPropertyValue("--sal") || "0"),
      right: num(style.getPropertyValue("--sar") || "0"),
    },
  };
}

export function useDevice(): DeviceInfo {
  const [info, setInfo] = useState<DeviceInfo>(read);

  useEffect(() => {
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const next = read();
        setInfo(next);
        // Expose tier as a data-attribute + CSS vars so we can target it in CSS.
        document.documentElement.dataset.tier = next.tier;
        document.documentElement.style.setProperty("--shell-max", `${next.shellMaxWidth}px`);
        document.documentElement.style.setProperty("--font-scale", String(next.fontScale));
      });
    };
    onResize();
    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("orientationchange", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  return info;
}
