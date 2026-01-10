import { Bell, Plus } from "lucide-react";
import BackLink from "./BackLink";

type Props = {
  title: string;
  breadcrumbs?: string[];
  subtitle?: string;
  showGreeting?: boolean;
  backLabel?: string;
  backTo?: string;
  backState?: Record<string, unknown>;
};

export default function TopBar({ title, breadcrumbs, subtitle, showGreeting, backLabel, backTo, backState }: Props) {
  const crumbs = breadcrumbs ?? [];
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Afternoon focus?" : "Evening study session?";

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-[28px] bg-white px-6 py-5 shadow-[0_16px_40px_rgba(15,16,32,0.08)]">
      <div>
        {backLabel && (
          <div className="mb-2">
            <BackLink label={backLabel} to={backTo} state={backState} />
          </div>
        )}
        {crumbs.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#6B5CA5]">
            {crumbs.map((c, idx) => (
              <span key={`${c}-${idx}`} className="text-[11px] tracking-[0.1em] text-[#6B5CA5]">
                {c}
              </span>
            ))}
          </div>
        )}
        {showGreeting && <div className="mt-3 text-sm text-[#7B5FEF]">{greeting}</div>}
        <div className="mt-2 text-2xl font-semibold text-[#0F1020]">{title}</div>
        {subtitle && <div className="text-sm text-[#6B5CA5]">{subtitle}</div>}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-[#EFE7FF] bg-white text-[#6B5CA5]"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="flex h-10 items-center gap-2 rounded-full bg-[#7B5FEF] px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(123,95,239,0.35)]"
          aria-label="Quick add"
        >
          <Plus className="h-4 w-4" />
          Quick add
        </button>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0F1020] text-sm font-semibold text-white">
          N
        </div>
      </div>
    </div>
  );
}
