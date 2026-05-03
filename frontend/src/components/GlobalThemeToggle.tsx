import { Moon, Sun } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useTheme } from "../hooks/useTheme";

/**
 * Floating app-wide light/dark control for **public / marketing / auth** pages only.
 *
 * Authenticated app pages (dashboard, classes, flashcards, quizzes, chatbot, voice revision,
 * profile, settings) render the theme toggle inside the TopBar profile menu — showing the
 * floating button there too would duplicate the control.
 */

const HIDE_ON_PATHS = [
  "/dashboard",
  "/classes",
  "/flashcards",
  "/quizzes",
  "/chatbot",
  "/voice-revision",
  "/profile",
  "/settings",
];

export default function GlobalThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const { pathname } = useLocation();
  const isDark = resolvedTheme === "dark";

  const hidden = HIDE_ON_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (hidden) return null;

  return (
    <button
      type="button"
      className="ns-global-theme-toggle"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Light mode" : "Dark mode"}
    >
      {isDark ? (
        <Sun className="ns-global-theme-toggle__icon" strokeWidth={2} />
      ) : (
        <Moon className="ns-global-theme-toggle__icon" strokeWidth={2} />
      )}
    </button>
  );
}
