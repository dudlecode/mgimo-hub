"use client";

import { Children, isValidElement } from "react";
import { motion, useReducedMotion } from "motion/react";
import { SPRING, TIMING } from "./presets";

/** Один блок, который поднимается с задержкой по номеру: для сеток из рядов, где у ячеек свои классы раскладки. */
export function Rise({ i = 0, className, children }: { i?: number; className?: string; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} initial={{ opacity: 0, y: TIMING.sectionY }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING.smooth, delay: TIMING.sectionDelay + i * TIMING.sectionStep }}>
      {children}
    </motion.div>
  );
}

/** Каскад секций: каждый прямой потомок поднимается с задержкой i * step. */
export function Stagger({ children, className, step = TIMING.sectionStep }: { children: React.ReactNode; className?: string; step?: number }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  let i = 0;
  return (
    <div className={className}>
      {Children.map(children, (child) => {
        if (!isValidElement(child)) return child;
        const delay = TIMING.sectionDelay + i++ * step;
        return (
          <motion.div initial={{ opacity: 0, y: TIMING.sectionY }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING.smooth, delay }}>
            {child}
          </motion.div>
        );
      })}
    </div>
  );
}
