import type { ReactNode } from "react";

type Props = {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  loading?: boolean;
  className?: string;
};

export default function StatCard({ label, value, hint, icon, loading, className }: Props) {
  return (
    <div
      className={`ns-card flex flex-col gap-2 p-4 transition hover:border-[var(--border-strong)] sm:p-5 ${
        className ?? ""
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted-soft)]">
          {label}
        </div>
        {icon ? (
          <span className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--primary-soft)] text-[var(--primary)]">
            {icon}
          </span>
        ) : null}
      </div>
      <div className="text-[26px] font-semibold tabular-nums tracking-tight text-[var(--text-main)] sm:text-[28px]">
        {loading ? (
          <span className="inline-block h-7 w-16 animate-pulse rounded-md bg-[var(--surface-2)]" />
        ) : (
          value
        )}
      </div>
      {hint ? (
        <div className="text-[12.5px] leading-snug text-[var(--text-muted)]">{hint}</div>
      ) : null}
    </div>
  );
}
