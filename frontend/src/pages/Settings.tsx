import { useNavigate } from "react-router-dom";
import { useState } from "react";
import AppShell from "../layouts/AppShell";
import { deleteAccount as apiDelete, logout as apiLogout } from "../lib/api";
import { logout as firebaseLogout } from "../firebase/firebaseAuth";
import { useTheme } from "../hooks/useTheme";

export default function Settings() {
  const navigate = useNavigate();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [busy, setBusy] = useState<null | "logout" | "delete">(null);
  const isDark = resolvedTheme === "dark";

  async function onLogout() {
    if (busy) return;
    setBusy("logout");
    try {
      await apiLogout().catch(() => undefined);
      await firebaseLogout().catch(() => undefined);
      navigate("/login", { replace: true });
    } finally {
      setBusy(null);
    }
  }

  async function onDelete() {
    if (busy) return;
    if (!confirm("Delete your account permanently? This cannot be undone.")) return;
    setBusy("delete");
    try {
      await apiDelete();
      navigate("/signup", { replace: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Delete failed";
      alert(msg);
    } finally {
      setBusy(null);
    }
  }

  const sectionClass = isDark
    ? "rounded-[24px] border border-[rgba(139,92,246,0.16)] bg-[linear-gradient(180deg,rgba(22,19,38,0.96),rgba(17,15,30,0.98))] p-5 shadow-[0_18px_48px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.02)] sm:p-6"
    : "rounded-[24px] border border-[rgba(139,92,246,0.14)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(249,246,255,0.98))] p-5 shadow-[0_14px_36px_rgba(109,40,217,0.08),0_4px_16px_rgba(15,23,42,0.04)] sm:p-6";

  const subtleSurfaceClass = isDark
    ? "border-[rgba(139,92,246,0.16)] bg-[rgba(27,24,43,0.92)]"
    : "border-[rgba(139,92,246,0.12)] bg-[rgba(250,247,255,0.96)]";

  const segmentedWrapClass = isDark
    ? "bg-[rgba(14,12,24,0.98)] shadow-[inset_0_1px_4px_rgba(0,0,0,0.32)]"
    : "bg-white shadow-[inset_0_1px_4px_rgba(124,58,237,0.06)]";

  const logoutButtonClass = isDark
    ? "inline-flex items-center rounded-xl border border-[rgba(139,92,246,0.18)] bg-[rgba(33,30,52,0.98)] px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(0,0,0,0.22)] transition-all duration-200 hover:border-[rgba(167,139,250,0.32)] hover:bg-[rgba(45,39,70,0.98)]"
    : "inline-flex items-center rounded-xl border border-[rgba(139,92,246,0.16)] bg-white px-4 py-2 text-sm font-semibold text-[var(--text-main)] shadow-[0_8px_20px_rgba(124,58,237,0.08)] transition-all duration-200 hover:border-[rgba(139,92,246,0.24)] hover:bg-[rgba(245,243,255,0.9)]";

  return (
    <AppShell title="Settings" subtitle="Appearance, session, and account controls.">
      <div className="mx-auto flex w-full max-w-[880px] flex-col gap-5 px-1">
        <section className={sectionClass}>
          <h2 className={`text-base font-semibold ${isDark ? "text-white" : "text-[var(--text-main)]"}`}>
            Appearance
          </h2>

          <div
            className={`mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border px-4 py-3 transition-colors duration-200 ${subtleSurfaceClass}`}
          >
            <div className={`text-sm font-medium ${isDark ? "text-white" : "text-[var(--text-main)]"}`}>
              Theme
            </div>
            <div className={`flex items-center gap-1 rounded-2xl p-1 ${segmentedWrapClass}`}>
              {(["light", "dark", "system"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setTheme(mode)}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-semibold capitalize transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${
                    theme === mode
                      ? `border-transparent bg-[linear-gradient(135deg,#7c3aed,#a855f7)] text-white ${
                          isDark
                            ? "shadow-[0_10px_20px_rgba(124,58,237,0.34)]"
                            : "shadow-[0_10px_20px_rgba(124,58,237,0.22)]"
                        }`
                      : isDark
                        ? "border-[rgba(139,92,246,0.12)] bg-[rgba(27,24,43,0.96)] text-violet-100/76 hover:border-[rgba(167,139,250,0.24)] hover:text-white"
                        : "border-[rgba(139,92,246,0.1)] bg-white text-[var(--text-muted)] hover:border-[rgba(139,92,246,0.18)] hover:text-[var(--text-main)]"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className={sectionClass}>
          <h2 className={`text-base font-semibold ${isDark ? "text-white" : "text-[var(--text-main)]"}`}>
            Account
          </h2>

          <div
            className={`mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border px-4 py-3 ${subtleSurfaceClass}`}
          >
            <div className="min-w-0">
              <div className={`text-sm font-medium ${isDark ? "text-white" : "text-[var(--text-main)]"}`}>
                Sign out
              </div>
            </div>
            <button type="button" onClick={onLogout} disabled={!!busy} className={logoutButtonClass}>
              {busy === "logout" ? "Logging out..." : "Logout"}
            </button>
          </div>

          <div
            className={`mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border px-4 py-3 ${
              isDark
                ? "border-[rgba(239,95,139,0.16)] bg-[rgba(39,22,36,0.34)]"
                : "border-[rgba(239,95,139,0.14)] bg-[rgba(255,244,247,0.88)]"
            }`}
          >
            <div className="min-w-0">
              <div className={`text-sm font-medium ${isDark ? "text-white" : "text-[var(--text-main)]"}`}>
                Permanent removal
              </div>
            </div>
            <button
              type="button"
              onClick={onDelete}
              disabled={!!busy}
              className={`text-sm font-semibold transition-colors ${
                isDark
                  ? "text-[var(--accent-pink)] hover:text-[#ff8faf]"
                  : "text-[var(--accent-pink)] hover:text-[#d94872]"
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {busy === "delete" ? "Deleting..." : "Delete account"}
            </button>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
