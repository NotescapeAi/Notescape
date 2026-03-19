import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  FolderOpen,
  MessageCircle,
  Sparkles,
  ClipboardList, // ✅ ADDED
  Settings,
  User,
  LogOut,
  ChevronLeft,
  BarChart3,
  Calendar,
} from "lucide-react";
import { listClasses } from "../lib/api";

type Props = {
  collapsed: boolean;
  onToggle: () => void;
};

const item =
  "group relative flex items-center gap-3 rounded-[12px] px-3 py-2 text-[14px] font-semibold transition-colors duration-200";
const active =
  "border-l-4 border-[var(--primary)] bg-[var(--surface)] shadow-[var(--shadow-soft)] text-[var(--text)]";

export default function AppSidebar({ collapsed, onToggle }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const isFlashcardsActive =
    location.pathname.includes("/flashcards") ||
    (location.pathname.startsWith("/classes") &&
      ((location.state as any)?.tab === "flashcards" || location.search.includes("tab=flashcards")));
  const [resolvedClassId, setResolvedClassId] = useState<number | null>(null);

  const studyLink = "/classes?tab=chat";
  const isChatActive = location.pathname === "/classes" && location.search.includes("tab=chat");
  const [classCount, setClassCount] = useState(0);

  useEffect(() => {
    let ignore = false;
    const lastClassIdRaw =
      localStorage.getItem("last_class_id") ||
      localStorage.getItem("chat_last_class_id") ||
      "";
    const lastClassId = Number(lastClassIdRaw);
    let hasInitialId = false;

    if (Number.isFinite(lastClassId) && lastClassId > 0) {
      setResolvedClassId(lastClassId);
      hasInitialId = true;
    }

    (async () => {
      try {
        const classes = await listClasses();
        if (ignore) return;

        setClassCount(classes.length);

        if (!hasInitialId) {
          const firstId = classes[0]?.id;
          if (Number.isFinite(firstId)) {
            setResolvedClassId(firstId);
            localStorage.setItem("last_class_id", String(firstId));
          }
        }
      } catch {
        if (!ignore && !hasInitialId) setResolvedClassId(null);
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);
  const shellClass =
    "bg-[var(--bg-surface)] text-[var(--text)] border border-[var(--border-subtle)] shadow-[var(--shadow-soft)] rounded-[32px] overflow-hidden flex flex-col";
  const textNeutral = "text-[var(--text-muted)]";
  const iconNeutral = "text-[var(--text-muted)]";
  const hoverText = "hover:text-[var(--text-main)]";

  return (
    <aside
      className={`fixed left-0 top-0 z-40 h-screen ${collapsed ? "p-2" : "p-3"}`}
      style={{ width: collapsed ? "76px" : "260px" }}
    >
      <style>{`
        .scrollbar-none {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .scrollbar-none::-webkit-scrollbar {
          display: none;
        }
      `}</style>
      <div className={`h-full ${collapsed ? "p-2" : "p-3"} ${shellClass}`}>
        <header
          className={`flex h-[50px] items-center ${collapsed ? "justify-center" : "justify-between"} px-2`}
        >
          {collapsed ? (
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-token surface text-xs font-semibold text-[var(--primary)]">
              N
            </div>
          ) : (
            <div className="px-1">
              <div className="text-[0.95rem] font-semibold tracking-tight text-[var(--text-main)]">
                Notescape
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={onToggle}
            className={`flex h-8 w-8 items-center justify-center rounded-full text-[var(--primary)] hover:bg-[rgba(123,95,239,0.10)] ${
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
        <div className="border-b border-token/80" />
        <div className="flex-1 overflow-y-auto min-h-0 overflow-x-hidden scrollbar-none">
        <nav className="mt-3 space-y-1">
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              `${item} ${isActive ? active : ""} ${collapsed ? "justify-center" : ""} ${
                isActive ? "text-[var(--text-main)]" : `${textNeutral} ${hoverText}`
              }`
            }
            title={collapsed ? "Dashboard" : undefined}
          >
            {({ isActive }) => (
              <>
                <LayoutDashboard
                  className={`h-5 w-5 ${isActive ? "text-[var(--primary)]" : `${iconNeutral}`}`}
                />
                {!collapsed && <span>Dashboard</span>}
              </>
            )}
          </NavLink>

          <NavLink
            to="/classes"
            className={({ isActive }) =>
              `${item} ${isActive && !isChatActive && !isFlashcardsActive ? active : ""} ${collapsed ? "justify-center" : ""} ${
                isActive && !isChatActive && !isFlashcardsActive ? "text-[var(--text-main)]" : `${textNeutral} ${hoverText}`
              }`
            }
            title={collapsed ? "Classes" : undefined}
          >
            {({ isActive }) => (
              <>
                <FolderOpen
                  className={`h-5 w-5 ${isActive && !isChatActive && !isFlashcardsActive ? "text-[var(--primary)]" : `${iconNeutral}`}`}
                />
                {!collapsed && <span>Classes</span>}
                {!collapsed && classCount > 0 && (
                  <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[var(--surface-active)] px-1.5 text-[11px] font-semibold text-[var(--text-main)] shadow-sm">
                    {classCount}
                  </span>
                )}
              </>
            )}
          </NavLink>

          <button
            type="button"
            onClick={() => navigate("/flashcards")}
            className={`${item} ${isFlashcardsActive ? active : ""} ${collapsed ? "justify-center" : ""} ${
              isFlashcardsActive ? "text-[var(--text-main)]" : `${textNeutral} ${hoverText}`
            }`}
            title={collapsed ? "Flashcards" : undefined}
          >
            <Sparkles
              className={`h-5 w-5 ${isFlashcardsActive ? "text-[var(--primary)]" : `${iconNeutral}`}`}
            />
            {!collapsed && <span>Flashcards</span>}
          </button>

          {/* ✅ ADDED: QUIZZES */}
          <NavLink
            to="/quizzes"
            className={({ isActive }) =>
              `${item} ${isActive ? active : ""} ${collapsed ? "justify-center" : ""} ${
                isActive ? "text-[var(--text-main)]" : `${textNeutral} ${hoverText}`
              }`
            }
            title={collapsed ? "Quizzes" : undefined}
          >
            {({ isActive }) => (
              <>
                <ClipboardList
                  className={`h-5 w-5 ${isActive ? "text-[var(--primary)]" : iconNeutral}`}
                />
                {!collapsed && <span>Quizzes</span>}
              </>
            )}
          </NavLink>

          <NavLink
            to="/revision"
            className={({ isActive }) =>
              `${item} ${isActive ? active : ""} ${collapsed ? "justify-center" : ""} ${
                isActive ? "text-[var(--text-main)]" : `${textNeutral} ${hoverText}`
              }`
            }
            title={collapsed ? "Study Planner" : undefined}
          >
            {({ isActive }) => (
              <>
                <Calendar
                  className={`h-5 w-5 ${isActive ? "text-[var(--primary)]" : iconNeutral}`}
                />
                {!collapsed && <span>Study Planner</span>}
              </>
            )}
          </NavLink>

          <NavLink
            to={studyLink}
            className={() =>
              `${item} ${isChatActive ? active : ""} ${collapsed ? "justify-center" : ""} ${
                isChatActive ? "text-[var(--text-main)]" : `${textNeutral} ${hoverText}`
              }`
            }
            title={collapsed ? "Study Assistant" : undefined}
          >
            {() => (
              <>
                <MessageCircle
                  className={`h-5 w-5 ${isChatActive ? "text-[var(--primary)]" : iconNeutral}`}
                />
                {!collapsed && <span>Study Assistant</span>}
              </>
            )}
          </NavLink>
        </nav>
        </div>

        <div className="mt-auto">
        {!collapsed && (
          <div className="mt-4 border-t border-token pt-3 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
            Account
          </div>
        )}

        <div className="mt-2 space-y-1 pb-3">
          <NavLink
            to="/analytics"
            className={({ isActive }) =>
              `${item} ${isActive ? active : `text-[var(--text-muted)] ${hoverText}`}`
            }
          >
            <BarChart3 size={20} className={collapsed ? "mx-auto" : ""} />
            {!collapsed && <span>Analytics</span>}
          </NavLink>

          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `${item} ${isActive ? active : ""} ${collapsed ? "justify-center" : ""} ${
                isActive ? "text-[var(--text-main)]" : `${textNeutral} ${hoverText}`
              }`
            }
            title={collapsed ? "Settings" : undefined}
          >
            {({ isActive }) => (
              <>
                <Settings
                  className={`h-5 w-5 ${isActive ? "text-[var(--primary)]" : iconNeutral}`}
                />
                {!collapsed && <span>Settings</span>}
              </>
            )}
          </NavLink>

          <NavLink
            to="/profile"
            className={({ isActive }) =>
              `${item} ${isActive ? active : ""} ${collapsed ? "justify-center" : ""} ${
                isActive ? "text-[var(--text-main)]" : `${textNeutral} ${hoverText}`
              }`
            }
            title={collapsed ? "Profile" : undefined}
          >
            {({ isActive }) => (
              <>
                <User
                  className={`h-5 w-5 ${isActive ? "text-[var(--primary)]" : iconNeutral}`}
                />
                {!collapsed && <span>Profile</span>}
              </>
            )}
          </NavLink>

          <NavLink
            to="/logout"
            className={({ isActive }) =>
              `${item} ${isActive ? active : ""} ${collapsed ? "justify-center" : ""} ${
                isActive ? "text-[var(--text-main)]" : `${textNeutral} ${hoverText}`
              }`
            }
            title={collapsed ? "Logout" : undefined}
          >
            {({ isActive }) => (
              <>
                <LogOut
                  className={`h-5 w-5 ${isActive ? "text-[var(--primary)]" : iconNeutral}`}
                />
                {!collapsed && <span>Logout</span>}
              </>
            )}
          </NavLink>
        </div>
        </div>
      </div>
    </aside>
  );
}
