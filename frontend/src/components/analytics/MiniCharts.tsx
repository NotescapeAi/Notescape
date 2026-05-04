/*
 * Lightweight, premium-feeling SVG analytics primitives.
 *
 * Designed to be visual, low-noise, and theme-aware (use currentColor and
 * CSS variables so they automatically follow the active palette). They're
 * deliberately small: a sparkline renders in a single sub-line of dashboard
 * vertical real-estate; MiniWeekBars in ~24px; RadialProgress in 56-96px.
 */

import type { CSSProperties, ReactNode } from "react";

/* ------------------------------------------------------------------ */
/* Sparkline                                                          */
/* ------------------------------------------------------------------ */

type SparklineProps = {
  values: number[];
  width?: number;
  height?: number;
  strokeWidth?: number;
  /** When true, draws a soft fill under the line. */
  filled?: boolean;
  /** CSS color or var(); defaults to var(--primary). */
  color?: string;
  className?: string;
  ariaLabel?: string;
};

export function Sparkline({
  values,
  width = 120,
  height = 32,
  strokeWidth = 1.6,
  filled = true,
  color = "var(--primary)",
  className,
  ariaLabel,
}: SparklineProps) {
  if (values.length < 2) {
    return (
      <div
        className={className}
        style={{ width, height }}
        aria-label={ariaLabel ?? "No trend data"}
      />
    );
  }
  const w = width;
  const h = height;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const stepX = w / (values.length - 1);

  const points = values.map((v, i) => {
    const x = i * stepX;
    // Reserve 2px top + 2px bottom for stroke to never clip.
    const y = 2 + (1 - (v - min) / span) * (h - 4);
    return [x, y] as const;
  });

  const path = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(" ");

  const fillPath = `${path} L ${w.toFixed(2)} ${h} L 0 ${h} Z`;
  const gradId = `spark-${Math.random().toString(36).slice(2, 9)}`;

  return (
    <svg
      role="img"
      aria-label={ariaLabel ?? "Trend"}
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={className}
      style={{ display: "block", color, overflow: "visible" }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.32" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      {filled ? <path d={fillPath} fill={`url(#${gradId})`} /> : null}
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* MiniWeekBars — last N days as small bars                           */
/* ------------------------------------------------------------------ */

type MiniWeekBarsProps = {
  values: number[];
  /** Total render height. Default 36. */
  height?: number;
  /** Bar width. Default 7. */
  barWidth?: number;
  /** Gap between bars. Default 4. */
  gap?: number;
  /** Bar colour. Default var(--primary). */
  color?: string;
  /** Optional dim colour for zero-value bars. */
  emptyColor?: string;
  className?: string;
  ariaLabel?: string;
};

export function MiniWeekBars({
  values,
  height = 36,
  barWidth = 7,
  gap = 4,
  color = "var(--primary)",
  emptyColor = "color-mix(in srgb, currentColor 18%, transparent)",
  className,
  ariaLabel,
}: MiniWeekBarsProps) {
  const max = Math.max(...values, 1);
  const w = values.length * barWidth + (values.length - 1) * gap;

  return (
    <svg
      role="img"
      aria-label={ariaLabel ?? "Weekly activity"}
      width={w}
      height={height}
      viewBox={`0 0 ${w} ${height}`}
      preserveAspectRatio="none"
      className={className}
      style={{ display: "block", color, overflow: "visible" }}
    >
      {values.map((v, i) => {
        const ratio = Math.max(0, Math.min(1, v / max));
        // Minimum visible height — never zero so empty days still register
        const barH = v <= 0 ? 3 : Math.max(4, ratio * (height - 2));
        const x = i * (barWidth + gap);
        const y = height - barH;
        const isZero = v <= 0;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barWidth}
            height={barH}
            rx={2}
            fill={isZero ? emptyColor : "currentColor"}
          />
        );
      })}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* RadialProgress — circular dial                                     */
/* ------------------------------------------------------------------ */

type RadialProgressProps = {
  /** 0 to 100. */
  value: number;
  size?: number;
  thickness?: number;
  color?: string;
  /** Background ring colour. */
  trackColor?: string;
  className?: string;
  /** Optional inner content (number, icon, etc). */
  children?: ReactNode;
  ariaLabel?: string;
};

export function RadialProgress({
  value,
  size = 72,
  thickness = 6,
  color = "var(--primary)",
  trackColor = "color-mix(in srgb, var(--text-muted) 18%, transparent)",
  className,
  children,
  ariaLabel,
}: RadialProgressProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - clamped / 100);

  return (
    <div
      role="img"
      aria-label={ariaLabel ?? `${Math.round(clamped)}%`}
      className={className}
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "inline-grid",
        placeItems: "center",
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ display: "block", color }}
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={trackColor}
          strokeWidth={thickness}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(0.2, 0.8, 0.2, 1)" }}
        />
      </svg>
      {children ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
          }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* WeekStrip — 7-cell heatmap-style strip                             */
/* ------------------------------------------------------------------ */

type WeekStripCell = {
  /** Day-of-week label, e.g. "M". */
  label: string;
  /** Boolean studied / not studied. */
  active: boolean;
  /** Optional intensity 0-1. */
  intensity?: number;
  /** Optional title (full date) for tooltip. */
  title?: string;
};

type WeekStripProps = {
  cells: WeekStripCell[];
  className?: string;
  /** Active cell colour. Default var(--primary). */
  color?: string;
};

export function WeekStrip({ cells, className, color = "var(--primary)" }: WeekStripProps) {
  return (
    <div
      className={className}
      style={
        {
          display: "grid",
          gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))`,
          gap: 6,
          color,
        } as CSSProperties
      }
    >
      {cells.map((c, i) => {
        const intensity = c.active ? Math.max(0.55, c.intensity ?? 1) : 0;
        const bg = c.active
          ? `color-mix(in srgb, currentColor ${Math.round(intensity * 100)}%, transparent)`
          : "var(--surface-2)";
        const ringColor = c.active
          ? "color-mix(in srgb, currentColor 35%, transparent)"
          : "var(--border)";
        return (
          <div
            key={i}
            title={c.title ?? c.label}
            aria-label={`${c.label}: ${c.active ? "studied" : "no activity"}`}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
            }}
          >
            <div
              style={{
                width: "100%",
                aspectRatio: "1 / 1",
                maxWidth: 32,
                borderRadius: 8,
                background: bg,
                border: `1px solid ${ringColor}`,
              }}
            />
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: 0.5,
                color: "var(--text-muted-soft)",
                textTransform: "uppercase",
              }}
            >
              {c.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bar — single horizontal progress bar (used inside class rows)      */
/* ------------------------------------------------------------------ */

type BarProps = {
  value: number; // 0–100
  color?: string;
  height?: number;
  className?: string;
};

export function ProgressBar({ value, color = "var(--primary)", height = 4, className }: BarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      className={className}
      style={
        {
          height,
          borderRadius: 999,
          background: "color-mix(in srgb, var(--text-muted) 14%, transparent)",
          overflow: "hidden",
        } as CSSProperties
      }
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
    >
      <div
        style={{
          width: `${clamped}%`,
          height: "100%",
          borderRadius: 999,
          background: `linear-gradient(90deg, ${color}, color-mix(in srgb, ${color} 70%, #c084fc))`,
          transition: "width 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)",
        }}
      />
    </div>
  );
}
