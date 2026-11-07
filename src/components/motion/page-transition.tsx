"use client";

import { motion, useReducedMotion } from "motion/react";
import { SPRING, TIMING } from "./presets";

/** Мягкий вход страницы при каждой навигации (используется в template.tsx). */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  if (reduce) return <>{children}</>;
  return (
    <motion.div initial={{ opacity: 0, y: TIMING.pageY }} animate={{ opacity: 1, y: 0 }} transition={SPRING.smooth}>
      {children}
    </motion.div>
  );
}
