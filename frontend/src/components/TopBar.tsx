import { Bell, ChevronDown, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import BackLink from "./BackLink";
import { useUser } from "../hooks/useUser";

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
  const navigate = useNavigate();
  const { profile } = useUser();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const crumbs = breadcrumbs ?? [];
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Afternoon focus?" : "Evening study session?";
  const displayName = profile?.display_name || profile?.full_name || profile?.email || "User";
  const initials = displayName.trim().slice(0, 1).toUpperCase();

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!menuRef.current) return;
      if (menuRef.current.contains(e.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

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
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 rounded-full border border-[#EFE7FF] bg-white px-2 py-1"
            aria-label="Open profile menu"
          >
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt={displayName} className="h-8 w-8 rounded-full object-cover" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0F1020] text-xs font-semibold text-white">
                {initials}
              </div>
            )}
            <ChevronDown className="h-4 w-4 text-[#6B5CA5]" />
          </button>
          {open && (
            <div className="absolute right-0 top-12 z-20 w-48 rounded-2xl border border-[#EFE7FF] bg-white p-2 shadow-[0_12px_30px_rgba(15,16,32,0.12)]">
              <div className="px-3 py-2 text-xs text-[#6B5CA5]">{displayName}</div>
              <button
                className="w-full rounded-xl px-3 py-2 text-left text-sm text-[#0F1020] hover:bg-[#F7F4FF]"
                onClick={() => navigate("/profile")}
              >
                Profile
              </button>
              <button
                className="w-full rounded-xl px-3 py-2 text-left text-sm text-[#0F1020] hover:bg-[#F7F4FF]"
                onClick={() => navigate("/settings")}
              >
                Settings
              </button>
              <button
                className="w-full rounded-xl px-3 py-2 text-left text-sm text-[#EF5F8B] hover:bg-[#FFF3F7]"
                onClick={() => navigate("/logout")}
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
