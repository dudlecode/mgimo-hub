"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { TIMING } from "./presets";

/**
 * Число «доезжает» до значения после монтирования (easeOutCubic).
 * Серверный рендер и первый кадр гидрации показывают настоящее значение:
 * без JS, на медленном телефоне и для скринридера цифры верные.
 */
export function CountUp({ value, suffix = "", className }: { value: number; suffix?: string; className?: string }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(value);
  const raf = useRef(0);
  useEffect(() => {
    if (reduce) {
      raf.current = requestAnimationFrame(() => setShown(value));
      return () => cancelAnimationFrame(raf.current);
    }
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / TIMING.countUpMs);
      setShown(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, reduce]);
  return (
    <span className={className}>
      {shown}
      {suffix}
    </span>
  );
}
