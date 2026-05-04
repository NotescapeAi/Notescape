/*
 * Spotlight — wraps any card and adds a subtle cursor-following glow.
 *
 * The glow appears only on hover, fades smoothly, and respects
 * `prefers-reduced-motion`. Implementation uses CSS variables driven by
 * a `pointermove` handler on the wrapper itself (no global listener),
 * so it's cheap and scales to many cards on the page.
 */

import { useCallback, useRef, type ReactNode } from "react";

type SpotlightProps = {
  children: ReactNode;
  className?: string;
  /** Tone of the cursor-follow glow — balanced accents for landing cards. */
  tone?: "purple" | "pink" | "mixed" | "coral" | "sky" | "lilac";
};

export default function Spotlight({ children, className = "", tone = "mixed" }: SpotlightProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  const handleMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--spot-x", `${e.clientX - rect.left}px`);
    el.style.setProperty("--spot-y", `${e.clientY - rect.top}px`);
  }, []);

  return (
    <div
      ref={ref}
      onPointerMove={handleMove}
      data-spot-tone={tone}
      className={`spotlight ${className}`}
    >
      <div className="spotlight__glow" aria-hidden />
      <div className="spotlight__content">{children}</div>
    </div>
  );
}
