import { Menu, Moon, Settings as SettingsIcon, Sun } from "lucide-react";
import { type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import BackLink from "./BackLink";
import { useTheme } from "../hooks/useTheme";

type Props = {
  title: string;
  breadcrumbs?: string[];
  subtitle?: string;
  showGreeting?: boolean;
  backLabel?: string;
  backTo?: string;
  backState?: Record<string, unknown>;
  headerActions?: ReactNode;
  onOpenMobileNav?: () => void;
};

export default function TopBar({
  title,
  breadcrumbs,
  subtitle,
  showGreeting,
  backLabel,
  backTo,
  backState,
  headerActions,
  onOpenMobileNav,
}: Props) {
  const navigate = useNavigate();
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const crumbs = breadcrumbs ?? [];

  return (
    <div className="flex flex-wrap items-start justify-between gap-3 pb-1 sm:items-center sm:gap-4">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {onOpenMobileNav ? (
          <button
            type="button"
            onClick={onOpenMobileNav}
            className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] shadow-[var(--shadow-xs)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] hover:text-[var(--text-main)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] lg:hidden"
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          {backLabel && (
            <div className="mb-2">
              <BackLink label={backLabel} to={backTo} state={backState} />
            </div>
          )}
          {crumbs.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-muted-soft)]">
              {crumbs.map((c, idx) => (
                <span key={`${c}-${idx}`} className="tracking-[0.08em]">
                  {c}
                </span>
              ))}
            </div>
          )}
          {showGreeting && null}
          {title ? (
            <h1 className="mt-0.5 text-[22px] font-semibold leading-tight tracking-tight text-[var(--text-main)] sm:text-[26px]">
              {title}
            </h1>
          ) : null}
          {subtitle ? (
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--text-muted)]">{subtitle}</p>
          ) : null}
        </div>
      </div>

      <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2 sm:w-auto sm:gap-2">
        {headerActions ? (
          <div className="mr-auto flex flex-wrap items-center gap-2 sm:mr-0 lg:order-none">{headerActions}</div>
        ) : null}

        {/* Theme toggle — subtle icon button */}
        <button
          type="button"
          onClick={() => setTheme(isDark ? "light" : "dark")}
          className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] hover:text-[var(--text-main)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
          title={isDark ? "Light mode" : "Dark mode"}
        >
          {isDark ? <Sun className="h-[17px] w-[17px]" /> : <Moon className="h-[17px] w-[17px]" />}
        </button>

        {/* Settings shortcut — single entry, not a profile dropdown duplicate */}
        <button
          type="button"
          onClick={() => navigate("/settings")}
          className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] hover:text-[var(--text-main)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          aria-label="Open settings"
          title="Settings"
        >
          <SettingsIcon className="h-[17px] w-[17px]" />
        </button>
      </div>
    </div>
  );
}
