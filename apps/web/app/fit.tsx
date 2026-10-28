"use client";

import { type ReactNode, useLayoutEffect, useRef } from "react";

/**
 * Shrinks its content (never enlarges it) until it fits the box. The content
 * is laid out wider as it shrinks, so text re-wraps instead of just getting
 * smaller. The TV uses it wherever long names, a long message or a short
 * window could push text out of a panel (D42).
 */
export function Fit({
  children,
  className,
  innerClassName,
}: {
  children: ReactNode;
  className?: string;
  innerClassName?: string;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const refit = useRef(() => {});

  // Content changes on most renders (clocks, scores), so measure every time.
  useLayoutEffect(() => refit.current());

  useLayoutEffect(() => {
    const box = outer.current;
    const content = inner.current;
    if (!box || !content) return;
    const set = (scale: number) =>
      content.style.setProperty("--fit", scale.toFixed(4));
    const fit = () => {
      const height = box.clientHeight;
      const width = box.clientWidth;
      if (!height || !width) return;
      // How big the content could be at its current layout.
      const room = (scale: number) => {
        set(scale);
        return Math.min(
          1,
          height / Math.max(1, content.offsetHeight),
          width / Math.max(1, content.scrollWidth),
        );
      };
      let scale = 1;
      let fits = room(scale);
      // Shrink until it fits; usually one step, since a wider layout is
      // never taller.
      for (let i = 0; i < 6 && fits < scale - 0.001; i++) {
        scale = Math.min(fits, scale * 0.97);
        fits = room(scale);
      }
      // A bigger scale is a narrower layout, which is never shorter, so
      // `fits` caps it; search between the two for the biggest that fits.
      let best = scale;
      let cap = Math.min(1, fits);
      for (let i = 0; i < 5 && cap - best > 0.01; i++) {
        const mid = (best + cap) / 2;
        const midFits = room(mid);
        if (midFits >= mid - 0.001) {
          best = mid;
          cap = Math.min(cap, midFits);
        } else cap = mid;
      }
      set(best);
    };
    refit.current = fit;
    fit();
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    });
    observer.observe(box);
    observer.observe(content);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      refit.current = () => {};
    };
  }, []);

  return (
    <div ref={outer} className={`fit ${className ?? ""}`}>
      <div ref={inner} className={`fit-inner ${innerClassName ?? ""}`}>
        {children}
      </div>
    </div>
  );
}
