import type { ReactNode } from "react";

type Props = {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

export default function SectionHeader({ eyebrow, title, description, action, className }: Props) {
  return (
    <div className={`flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between ${className ?? ""}`}>
      <div className="min-w-0">
        {eyebrow ? (
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted-soft)]">
            {eyebrow}
          </div>
        ) : null}
        <h2 className={`text-[16px] font-semibold leading-tight text-[var(--text-main)] sm:text-[17px] ${eyebrow ? "mt-1.5" : ""}`}>
          {title}
        </h2>
        {description ? (
          <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-[var(--text-muted)]">{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  );
}
