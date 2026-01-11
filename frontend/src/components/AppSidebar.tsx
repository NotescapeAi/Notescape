import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  FolderOpen,
  MessageCircle,
  Sparkles,
  Settings,
  User,
  LogOut,
  ChevronLeft,
} from "lucide-react";
import { listClasses } from "../lib/api";

type Props = {
  collapsed: boolean;
  onToggle: () => void;
};

const item =
  "group relative flex items-center gap-3 rounded-2xl px-3 py-3 text-[15px] font-semibold transition";
const active =
  "before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-8 before:w-1 before:rounded-full before:bg-[var(--primary)] before:shadow-[0_0_10px_rgba(123,95,239,0.4)]";

export default function AppSidebar({ collapsed, onToggle }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const isFlashcardsActive =
    location.pathname.includes("/flashcards") ||
    (location.pathname.startsWith("/classes") && (location.state as any)?.tab === "flashcards");
  const [resolvedClassId, setResolvedClassId] = useState<number | null>(null);

  useEffect(() => {
    const lastClassIdRaw =
      localStorage.getItem("last_class_id") ||
      localStorage.getItem("chat_last_class_id") ||
      "";
    const lastClassId = Number(lastClassIdRaw);
    if (Number.isFinite(lastClassId) && lastClassId > 0) {
      setResolvedClassId(lastClassId);
      return;
    }
    let ignore = false;
    (async () => {
      try {
        const classes = await listClasses();
        const firstId = classes[0]?.id;
        if (!ignore && Number.isFinite(firstId)) {
          setResolvedClassId(firstId);
          localStorage.setItem("last_class_id", String(firstId));
        }
      } catch {
        if (!ignore) setResolvedClassId(null);
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);
  const shellClass = "bg-[var(--surface)] text-[var(--text)] border border-[var(--border)] shadow-[var(--shadow)] rounded-[28px] overflow-hidden";
  const textMuted = "text-[var(--muted)]";
  const textHover = "hover:text-[var(--primary)]";
  const iconMuted = "text-[var(--primary)]";
  const iconHover = "group-hover:text-[var(--primary)]";
  const activeText = "text-[var(--primary)]";

  return (
    <aside
      className={`fixed left-0 top-0 z-40 h-screen ${collapsed ? "p-2" : "p-4"}`}
      style={{ width: collapsed ? "92px" : "276px" }}
    >
      <div className={`h-full ${collapsed ? "p-3" : "p-4"} ${shellClass}`}>
        <header
          className={`flex h-[88px] ${
            collapsed ? "flex-col items-center justify-start" : "items-center justify-between"
          }`}
          style={{ padding: "16px 12px" }}
        >
          <div className={`flex ${collapsed ? "w-full flex-col items-center" : "items-center"}`}>
            <div
              className={`flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[var(--primary)] text-base font-semibold text-inverse shadow-[0_12px_28px_rgba(123,95,239,0.35)] ${
                collapsed ? "mb-2.5" : ""
              }`}
            >
              N
            </div>
          </div>
          <button
            type="button"
            onClick={onToggle}
            className={`flex h-9 w-9 items-center justify-center rounded-full text-[var(--primary)] hover:bg-[rgba(123,95,239,0.10)] ${
              collapsed ? "mt-1" : ""
            }`}
            aria-label="Toggle sidebar"
            style={{ border: "none" }}
          >
            <ChevronLeft
              className="h-4 w-4"
              style={{
                transition: "transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
                transform: collapsed ? "rotate(180deg)" : "rotate(0deg)",
              }}
            />
          </button>
        </header>

        {!collapsed && (
          <div className="px-1">
            <div className="text-lg font-semibold tracking-tight">Notescape</div>
            <div className="text-xs text-[var(--muted)]">Learning workspace</div>
          </div>
        )}

        <nav className="mt-8 space-y-2">
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              `${item} ${isActive ? active : ""} ${collapsed ? "justify-center" : ""} ${
                isActive ? activeText : `${textMuted} ${textHover}`
              }`
            }
            title={collapsed ? "Dashboard" : undefined}
          >
            {({ isActive }) => (
              <>
                <LayoutDashboard
                  className={`h-5 w-5 ${isActive ? activeText : `${iconMuted} ${iconHover}`}`}
                />
                {!collapsed && <span>Dashboard</span>}
              </>
            )}
          </NavLink>
          <NavLink
            to="/classes"
            className={({ isActive }) =>
              `${item} ${isActive ? active : ""} ${collapsed ? "justify-center" : ""} ${
                isActive ? activeText : `${textMuted} ${textHover}`
              }`
            }
            title={collapsed ? "Classes" : undefined}
          >
            {({ isActive }) => (
              <>
                <FolderOpen
                  className={`h-5 w-5 ${isActive ? activeText : `${iconMuted} ${iconHover}`}`}
                />
                {!collapsed && <span>Classes</span>}
              </>
            )}
          </NavLink>
          <button
            type="button"
            onClick={() => navigate("/flashcards")}
            className={`${item} ${isFlashcardsActive ? active : ""} ${collapsed ? "justify-center" : ""} ${
              isFlashcardsActive ? activeText : `${textMuted} ${textHover}`
            }`}
            title={collapsed ? "Flashcards" : undefined}
          >
            <Sparkles
              className={`h-5 w-5 ${isFlashcardsActive ? activeText : `${iconMuted} ${iconHover}`}`}
            />
            {!collapsed && <span>Flashcards</span>}
          </button>
          <NavLink
            to="/chatbot"
            className={({ isActive }) =>
              `${item} ${isActive ? active : ""} ${collapsed ? "justify-center" : ""} ${
                isActive ? activeText : `${textMuted} ${textHover}`
              }`
            }
            title={collapsed ? "Study Assistant" : undefined}
          >
            {({ isActive }) => (
              <>
                <MessageCircle
                  className={`h-5 w-5 ${isActive ? activeText : `${iconMuted} ${iconHover}`}`}
                />
                {!collapsed && <span className={isActive ? activeText : ""}>Study Assistant</span>}
              </>
            )}
          </NavLink>
        </nav>

        {!collapsed && (
        <div className="mt-6 border-t border-token pt-4 text-xs uppercase tracking-[0.2em] text-muted">
            Account
          </div>
        )}
        <div className="mt-4 space-y-2">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `${item} ${isActive ? active : ""} ${collapsed ? "justify-center" : ""} ${
                isActive ? activeText : `${textMuted} ${textHover}`
              }`
            }
            title={collapsed ? "Settings" : undefined}
          >
            {({ isActive }) => (
              <>
                <Settings
                  className={`h-5 w-5 ${isActive ? activeText : `${iconMuted} ${iconHover}`}`}
                />
                {!collapsed && <span>Settings</span>}
              </>
            )}
          </NavLink>
          <NavLink
            to="/profile"
            className={({ isActive }) =>
              `${item} ${isActive ? active : ""} ${collapsed ? "justify-center" : ""} ${
                isActive ? activeText : `${textMuted} ${textHover}`
              }`
            }
            title={collapsed ? "Profile" : undefined}
          >
            {({ isActive }) => (
              <>
                <User
                  className={`h-5 w-5 ${isActive ? activeText : `${iconMuted} ${iconHover}`}`}
                />
                {!collapsed && <span>Profile</span>}
              </>
            )}
          </NavLink>
          <NavLink
            to="/logout"
            className={({ isActive }) =>
              `${item} ${isActive ? active : ""} ${collapsed ? "justify-center" : ""} ${
                isActive ? activeText : `${textMuted} ${textHover}`
              }`
            }
            title={collapsed ? "Logout" : undefined}
          >
            {({ isActive }) => (
              <>
                <LogOut
                  className={`h-5 w-5 ${isActive ? activeText : `${iconMuted} ${iconHover}`}`}
                />
                {!collapsed && <span>Logout</span>}
              </>
            )}
          </NavLink>
        </div>
      </div>
    </aside>
  );
}
