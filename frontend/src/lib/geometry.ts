import { useEffect, useRef, useState } from "react";

export const PLAN_W = 1000;

export const planHeight = (aspect?: number | null) => PLAN_W / (aspect || 1.4);

export function conePath(cx: number, cy: number, angle: number, fov: number, r: number) {
  const a1 = ((angle - fov / 2) * Math.PI) / 180;
  const a2 = ((angle + fov / 2) * Math.PI) / 180;
  const p1 = `${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)}`;
  const p2 = `${cx + r * Math.cos(a2)} ${cy + r * Math.sin(a2)}`;
  return `M ${cx} ${cy} L ${p1} A ${r} ${r} 0 0 1 ${p2} Z`;
}

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const ro = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, []);
  return [ref, size] as const;
}
