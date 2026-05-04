import type { ReactNode } from "react";

type Tone = "neutral" | "primary" | "success" | "warning" | "danger";

type Props = {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  loading?: boolean;
  tone?: Tone;
  className?: string;
};

const toneStyles: Record<Tone, { bg: string; text: string; ring: string }> = {
  neutral: {
    bg: "bg-[var(--surface-2)]",
    text: "text-[var(--text-muted)]",
    ring: "ring-[color-mix(in_srgb,var(--text-muted)_18%,transparent)]",
  },
  primary: {
    bg: "bg-[var(--primary-soft)]",
    text: "text-[var(--primary)]",
    ring: "ring-[color-mix(in_srgb,var(--primary)_22%,transparent)]",
  },
  success: {
    bg: "bg-[var(--success-soft)]",
    text: "text-[var(--success)]",
    ring: "ring-[color-mix(in_srgb,var(--success)_22%,transparent)]",
  },
  warning: {
    bg: "bg-[var(--warning-soft)]",
    text: "text-[var(--warning)]",
    ring: "ring-[color-mix(in_srgb,var(--warning)_22%,transparent)]",
  },
  danger: {
    bg: "bg-[var(--danger-soft)]",
    text: "text-[var(--danger)]",
    ring: "ring-[color-mix(in_srgb,var(--danger)_22%,transparent)]",
  },
};

export default function StatCard({
  label,
  value,
  hint,
  icon,
  loading,
  tone = "primary",
  className,
}: Props) {
  const t = toneStyles[tone];
  return (
    <div
      className={`ns-card ns-card-hover accent-rail flex flex-col gap-2.5 p-4 sm:p-5 ${className ?? ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.13em] text-[var(--text-muted-soft)]">
          {label}
        </div>
        {icon ? (
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] ring-1 ${t.bg} ${t.text} ${t.ring}`}
          >
            {icon}
          </span>
        ) : null}
      </div>
      <div className="text-[28px] font-semibold leading-none tracking-[-0.025em] tabular-nums text-[var(--text-main)] sm:text-[30px]">
        {loading ? (
          <span className="inline-block h-7 w-16 animate-pulse rounded-md bg-[var(--surface-2)]" />
        ) : (
          value
        )}
      </div>
      {hint ? (
        <div className="whitespace-pre-line text-[12.5px] leading-snug text-[var(--text-muted)]">
          {hint}
        </div>
      ) : null}
    </div>
  );
}
