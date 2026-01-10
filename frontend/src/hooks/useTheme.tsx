import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getPreferences, updatePreferences } from "../lib/api";

export type ThemePreference = "light" | "dark" | "system";

type ThemeState = {
  theme: ThemePreference;
  resolvedTheme: "light" | "dark";
  setTheme: (next: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeState | null>(null);

function resolveTheme(theme: ThemePreference) {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme;
}

function applyTheme(resolved: "light" | "dark") {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.setAttribute("data-theme", resolved);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(() => {
    if (typeof window === "undefined") return "system";
    const stored = window.localStorage.getItem("notescape.theme");
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
    return "system";
  });
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light";
    return resolveTheme(
      (window.localStorage.getItem("notescape.theme") as ThemePreference) || "system"
    );
  });
  const isMounted = useRef(false);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const resolved = resolveTheme(theme);
    setResolvedTheme(resolved);
    applyTheme(resolved);
  }, [theme]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (theme !== "system") return;
      const resolved = resolveTheme("system");
      setResolvedTheme(resolved);
      applyTheme(resolved);
    };
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, [theme]);

  useEffect(() => {
    if (isMounted.current) return;
    isMounted.current = true;
    (async () => {
      try {
        const pref = await getPreferences();
        if (pref.theme !== theme) {
          window.localStorage.setItem("notescape.theme", pref.theme);
          setThemeState(pref.theme);
        }
      } catch {
        /* ignore preference sync errors */
      }
    })();
  }, [theme]);

  const setTheme = useCallback((next: ThemePreference) => {
    setThemeState(next);
    window.localStorage.setItem("notescape.theme", next);
    updatePreferences({ theme: next }).catch(() => {
      /* ignore preference save errors */
    });
  }, []);

  const value = useMemo(() => ({ theme, resolvedTheme, setTheme }), [theme, resolvedTheme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
