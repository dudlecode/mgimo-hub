import { Children, isValidElement, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { TIMING } from "./presets";

// Каскад на CSS (класс section-rise в globals.css): HTML с сервера виден сразу, без ожидания JS,
// а системную настройку «меньше движения» учитывает общий блок там же.
const delay = (seconds: number) => ({ "--rise-delay": `${seconds.toFixed(2)}s` }) as CSSProperties;

/** Один блок, который поднимается с задержкой по номеру: для сеток из рядов, где у ячеек свои классы раскладки. */
export function Rise({ i = 0, className, children }: { i?: number; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("section-rise", className)} style={delay(TIMING.sectionDelay + i * TIMING.sectionStep)}>
      {children}
    </div>
  );
}

/** Каскад секций: каждый прямой потомок поднимается с задержкой i * step. */
export function Stagger({ children, className, step = TIMING.sectionStep }: { children: React.ReactNode; className?: string; step?: number }) {
  let i = 0;
  return (
    <div className={className}>
      {Children.map(children, (child) => {
        if (!isValidElement(child)) return child;
        return (
          <div className="section-rise" style={delay(TIMING.sectionDelay + i++ * step)}>
            {child}
          </div>
        );
      })}
    </div>
  );
}
