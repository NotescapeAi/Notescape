import { ChevronDown, Moon, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import BackLink from "./BackLink";
import { useUser } from "../hooks/useUser";
import { useTheme } from "../hooks/useTheme";

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
  const { resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const crumbs = breadcrumbs ?? [];
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
    <div className="sticky top-4 z-30 flex flex-wrap items-center justify-between gap-4 rounded-[28px] bg-[var(--surface)] px-6 py-5 shadow-[var(--shadow)]">
      <div>
        {backLabel && (
          <div className="mb-2">
            <BackLink label={backLabel} to={backTo} state={backState} />
          </div>
        )}
        {crumbs.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
            {crumbs.map((c, idx) => (
              <span key={`${c}-${idx}`} className="text-[11px] tracking-[0.1em] text-[var(--muted)]">
                {c}
              </span>
            ))}
          </div>
        )}
        {showGreeting && null}
        <div className="mt-2 text-2xl font-semibold text-[var(--text)]">{title}</div>
        {subtitle && <div className="text-sm text-[var(--muted)]">{subtitle}</div>}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[rgba(123,95,239,0.12)]"
          aria-label="Theme"
          title="Theme"
        >
          {resolvedTheme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-1"
            aria-label="Open profile menu"
          >
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt={displayName} className="h-8 w-8 rounded-full object-cover" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--text)] text-xs font-semibold text-[var(--surface)]">
                {initials}
              </div>
            )}
            <ChevronDown className="h-4 w-4 text-[var(--muted)]" />
          </button>
          {open && (
            <div className="absolute right-0 top-12 z-20 w-48 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-[var(--shadow)]">
              <div className="px-3 py-2 text-xs text-[var(--muted)]">{displayName}</div>
              <button
                className="w-full rounded-xl px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[rgba(123,95,239,0.08)]"
                onClick={() => navigate("/profile")}
              >
                Profile
              </button>
              <button
                className="w-full rounded-xl px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[rgba(123,95,239,0.08)]"
                onClick={() => navigate("/settings")}
              >
                Settings
              </button>
              <button
                className="w-full rounded-xl px-3 py-2 text-left text-sm text-[var(--accent-pink)] hover:bg-[rgba(239,95,139,0.12)]"
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
