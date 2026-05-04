import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  FolderOpen,
  MessageCircle,
  Sparkles,
  ClipboardList,
  Mic,
  ChevronsLeft,
  ChevronsRight,
  X,
  UserRound,
  Settings,
  LogOut,
} from "lucide-react";
import BrandLogo from "./BrandLogo";
import { useUser } from "../hooks/useUser";

type Props = {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen?: boolean;
  onNavigate?: () => void;
};

type NavItem = {
  to: string;
  label: string;
  icon: ReactNode;
  /** Custom active matcher (Flashcards needs this because of nested/class routes). */
  isActive?: (pathname: string, state: unknown) => boolean;
};

export default function AppSidebar({ collapsed, onToggle, mobileOpen = false, onNavigate }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile } = useUser();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const displayName = profile?.display_name || profile?.full_name || profile?.email || "Account";

  useEffect(() => {
    if (!accountMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!accountMenuRef.current?.contains(e.target as Node)) setAccountMenuOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [accountMenuOpen]);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAccountMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [accountMenuOpen]);

  const tabFromState =
    location.state && typeof location.state === "object" && "tab" in location.state
      ? (location.state as { tab?: string }).tab
      : undefined;

  const navItems: NavItem[] = [
    { to: "/dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-[18px] w-[18px]" /> },
    { to: "/classes", label: "Classes", icon: <FolderOpen className="h-[18px] w-[18px]" /> },
    {
      to: "/flashcards",
      label: "Flashcards",
      icon: <Sparkles className="h-[18px] w-[18px]" />,
      isActive: (p) =>
        p.includes("/flashcards") || (p.startsWith("/classes") && tabFromState === "flashcards"),
    },
    { to: "/quizzes", label: "Quizzes", icon: <ClipboardList className="h-[18px] w-[18px]" /> },
    { to: "/chatbot", label: "Ask materials", icon: <MessageCircle className="h-[18px] w-[18px]" /> },
    { to: "/voice-revision", label: "Voice Flashcards", icon: <Mic className="h-[18px] w-[18px]" /> },
  ];

  function navActivate() {
    onNavigate?.();
  }

  return (
    <aside
      className={`fixed left-0 top-0 z-[50] h-screen p-3 transition-transform duration-200 ease-out ${
        mobileOpen ? "translate-x-0" : "max-lg:-translate-x-[calc(100%+16px)] max-lg:pointer-events-none"
      } lg:translate-x-0 lg:pointer-events-auto`}
      style={{ width: collapsed ? "80px" : "244px" }}
      aria-label="Primary navigation"
    >
      <div
        className="flex h-full flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]"
      >
        {/* Header: logo + mobile close */}
        <header
          className={`relative flex h-[60px] shrink-0 items-center gap-2 px-3 ${
            collapsed ? "justify-center" : "justify-between"
          }`}
        >
          {collapsed ? (
            <BrandLogo variant="icon-only" to="" showText={false} />
          ) : (
            <BrandLogo variant="sidebar" to="" className="min-w-0" />
          )}
          {onNavigate ? (
            <button
              type="button"
              onClick={onNavigate}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text-main)] lg:hidden"
              aria-label="Close navigation menu"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </header>

        {/* Section label */}
        {!collapsed && (
          <div className="mt-1 px-4 text-[10.5px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted-soft)]">
            Workspace
          </div>
        )}

        {/* Nav items */}
        <nav
          className="ns-scroll mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3"
          aria-label="Main"
        >
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.to}>
                <SidebarLink
                  to={item.to}
                  label={item.label}
                  icon={item.icon}
                  collapsed={collapsed}
                  onNavigate={navActivate}
                  isActive={item.isActive}
                />
              </li>
            ))}
          </ul>
        </nav>

        {/* Footer: collapse toggle + account */}
        <div className="mt-auto flex shrink-0 flex-col gap-2 border-t border-[var(--border)] px-2 py-2">
          {/* Collapse / expand toggle — clearly visible */}
          <button
            type="button"
            onClick={onToggle}
            className={`hidden lg:flex h-9 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] text-[13px] font-semibold text-[var(--text-muted)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface)] hover:text-[var(--text-main)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${
              collapsed ? "justify-center px-0 w-full" : "justify-start px-3"
            }`}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronsRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronsLeft className="h-4 w-4" />
                <span>Collapse</span>
              </>
            )}
          </button>

          {/* Account entry point (compact icon) */}
          <div className="relative" ref={accountMenuRef}>
            <button
              type="button"
              onClick={() => setAccountMenuOpen((v) => !v)}
              className={`flex h-11 w-full items-center gap-2.5 rounded-[var(--radius-md)] border border-transparent text-left text-[13px] font-medium text-[var(--text-muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text-main)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${
                collapsed ? "justify-center px-0" : "px-2"
              } ${accountMenuOpen ? "bg-[var(--surface-2)] text-[var(--text-main)]" : ""}`}
              aria-label="Account menu"
              aria-expanded={accountMenuOpen}
              aria-haspopup="menu"
              title={collapsed ? displayName : undefined}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--surface-2)] text-[var(--text-muted)]">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <UserRound className="h-4 w-4" strokeWidth={2} />
                )}
              </span>
              {!collapsed && (
                <span className="min-w-0 flex-1 truncate">{displayName}</span>
              )}
            </button>

            {accountMenuOpen ? (
              <div
                className={`absolute z-[60] w-56 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-[var(--shadow-elevated)] ${
                  collapsed ? "bottom-0 left-full ml-2" : "bottom-full left-0 right-0 mb-2"
                }`}
                role="menu"
              >
                <div className="truncate px-2.5 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted-soft)]">
                  {displayName}
                </div>
                <MenuButton
                  icon={<UserRound className="h-4 w-4" />}
                  onClick={() => {
                    setAccountMenuOpen(false);
                    onNavigate?.();
                    navigate("/profile");
                  }}
                >
                  Profile
                </MenuButton>
                <MenuButton
                  icon={<Settings className="h-4 w-4" />}
                  onClick={() => {
                    setAccountMenuOpen(false);
                    onNavigate?.();
                    navigate("/settings");
                  }}
                >
                  Settings
                </MenuButton>
                <div className="my-1 h-px bg-[var(--border)]" />
                <MenuButton
                  icon={<LogOut className="h-4 w-4" />}
                  tone="danger"
                  onClick={() => {
                    setAccountMenuOpen(false);
                    onNavigate?.();
                    navigate("/logout");
                  }}
                >
                  Logout
                </MenuButton>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </aside>
  );
}

function SidebarLink({
  to,
  label,
  icon,
  collapsed,
  onNavigate,
  isActive,
}: {
  to: string;
  label: string;
  icon: ReactNode;
  collapsed: boolean;
  onNavigate: () => void;
  isActive?: (pathname: string, state: unknown) => boolean;
}) {
  const location = useLocation();
  const matchActive = isActive ? isActive(location.pathname, location.state) : undefined;

  return (
    <NavLink
      to={to}
      end={to === "/dashboard"}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      aria-label={label}
      className={({ isActive: navActive }) => {
        const active = matchActive ?? navActive;
        return [
          "group relative flex min-h-[42px] items-center gap-3 rounded-[var(--radius-md)] text-[13.5px] font-medium transition-colors duration-150",
          collapsed ? "justify-center px-0" : "px-3",
          active
            ? "bg-[var(--primary-soft)] text-[var(--primary)] font-semibold"
            : "text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text-main)]",
        ].join(" ");
      }}
    >
      {({ isActive: navActive }) => {
        const active = matchActive ?? navActive;
        return (
          <>
            {/* Left accent bar when active (expanded only) */}
            {active && !collapsed ? (
              <span
                aria-hidden
                className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-[var(--primary)]"
              />
            ) : null}
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center transition-transform duration-150 ${
                active ? "text-[var(--primary)]" : "text-[var(--text-muted)] group-hover:text-[var(--text-main)]"
              }`}
            >
              {icon}
            </span>
            {!collapsed && <span className="truncate tracking-[-0.005em]">{label}</span>}
          </>
        );
      }}
    </NavLink>
  );
}

function MenuButton({
  icon,
  children,
  onClick,
  tone = "default",
}: {
  icon: ReactNode;
  children: ReactNode;
  onClick: () => void;
  tone?: "default" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "text-[var(--danger)] hover:bg-[var(--danger-soft)]"
      : "text-[var(--text-main)] hover:bg-[var(--surface-2)]";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-left text-[13px] font-medium transition ${toneClass}`}
      role="menuitem"
    >
      <span className="flex h-5 w-5 items-center justify-center opacity-80">{icon}</span>
      <span>{children}</span>
    </button>
  );
}
