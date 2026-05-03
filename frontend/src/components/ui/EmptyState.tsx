import type { ReactNode } from "react";

type Props = {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

export default function EmptyState({ icon, title, description, action, className }: Props) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--surface-2)] px-6 py-10 text-center ${
        className ?? ""
      }`}
    >
      {icon ? (
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--primary-soft)] text-[var(--primary)]">
          {icon}
        </div>
      ) : null}
      <h3 className="text-[15px] font-semibold text-[var(--text-main)]">{title}</h3>
      {description ? (
        <p className="mt-1.5 max-w-md text-[13.5px] leading-relaxed text-[var(--text-muted)]">{description}</p>
      ) : null}
      {action ? <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}
