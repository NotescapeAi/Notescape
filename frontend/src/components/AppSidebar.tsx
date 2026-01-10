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

type Props = {
  collapsed: boolean;
  onToggle: () => void;
};

const item =
  "group relative flex items-center gap-3 rounded-2xl px-3 py-3 text-[15px] font-semibold transition";
const active =
  "before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-8 before:w-1 before:rounded-full before:bg-[#7B5FEF] before:shadow-[0_0_10px_rgba(123,95,239,0.4)]";

export default function AppSidebar({ collapsed, onToggle }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const isFlashcardsActive = location.pathname.startsWith("/classes") && (location.state as any)?.tab === "flashcards";
  const shellClass = "bg-white text-[#1A1630] border border-black/5 shadow-[0_12px_30px_rgba(15,16,32,0.06)]";
  const textMuted = "text-[#6E648D]";
  const textHover = "hover:text-[#7B5FEF]";
  const iconMuted = "text-[#7B5FEF]";
  const iconHover = "group-hover:text-[#7B5FEF]";
  const activeText = "text-[#7B5FEF]";

  return (
    <aside
      className="fixed left-0 top-0 z-40 h-screen"
      style={{ width: collapsed ? "76px" : "260px" }}
    >
      <div className={`h-full p-4 ${shellClass}`}>
        <header
          className={`flex h-[88px] ${
            collapsed ? "flex-col items-center justify-start" : "items-center justify-between"
          }`}
          style={{ padding: "16px 12px" }}
        >
          <div className={`flex ${collapsed ? "w-full flex-col items-center" : "items-center"}`}>
            <div
              className={`flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[#7B5FEF] text-base font-semibold text-white shadow-[0_12px_28px_rgba(123,95,239,0.35)] ${
                collapsed ? "mb-2.5" : ""
              }`}
            >
              N
            </div>
          </div>
          <button
            type="button"
            onClick={onToggle}
            className={`flex h-9 w-9 items-center justify-center rounded-full text-[#7B5FEF] hover:bg-[rgba(123,95,239,0.10)] ${
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
            <div className="text-xs text-[#6E648D]">Learning workspace</div>
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
            onClick={() => navigate("/classes", { state: { tab: "flashcards" } })}
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
          <div className="mt-6 border-t border-[#E7E0FF] pt-4 text-xs uppercase tracking-[0.2em] text-[#6E648D]">
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
