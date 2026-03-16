import { useNavigate } from "react-router-dom";
import { useState } from "react";
import AppShell from "../layouts/AppShell";
import Button from "../components/Button";
import {
  logout as apiLogout,
  deleteAccount as apiDelete,
  resetFlashcardProgress,
  clearChatHistory,
  clearEmbeddings,
} from "../lib/api";
import { useTheme } from "../hooks/useTheme";

export default function Settings() {
  const navigate = useNavigate();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [busy, setBusy] = useState<null | "logout" | "delete" | "reset" | "clear-chat" | "clear-embed">(null);
  const isDark = resolvedTheme === "dark";

  async function onLogout() {
    if (busy) return;
    setBusy("logout");
    try {
      await apiLogout();
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

  async function onResetFlashcards() {
    if (busy) return;
    if (!confirm("Reset flashcard progress for all classes?")) return;
    setBusy("reset");
    try {
      await resetFlashcardProgress();
    } finally {
      setBusy(null);
    }
  }

  async function onClearChat() {
    if (busy) return;
    if (!confirm("Clear all chat history?")) return;
    setBusy("clear-chat");
    try {
      await clearChatHistory();
    } finally {
      setBusy(null);
    }
  }

  async function onClearEmbeddings() {
    if (busy) return;
    if (!confirm("Clear document embeddings for your classes?")) return;
    setBusy("clear-embed");
    try {
      await clearEmbeddings();
    } finally {
      setBusy(null);
    }
  }

  return (
    <AppShell title="Settings" breadcrumbs={["Settings"]} subtitle="Control your workspace preferences.">
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-7 px-1 sm:gap-8">
        <div
          className={`rounded-[34px] p-1 transition-colors duration-300 ${
            isDark
              ? "bg-[linear-gradient(180deg,rgba(14,12,25,0.96),rgba(24,19,42,0.98))] shadow-[0_28px_80px_rgba(0,0,0,0.34)]"
              : "bg-[linear-gradient(180deg,rgba(255,255,255,0.2),rgba(245,240,255,0.58))]"
          }`}
        >
          <div
            className={`relative overflow-hidden rounded-[30px] border p-6 transition-all duration-300 sm:p-8 ${
              isDark
                ? "border-[rgba(139,92,246,0.18)] bg-[linear-gradient(180deg,rgba(10,10,20,0.95),rgba(20,18,35,0.98))] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]"
                : "border-[rgba(168,85,247,0.12)] bg-[linear-gradient(180deg,rgba(255,255,255,0.86),rgba(248,244,255,0.92))] shadow-[0_20px_60px_rgba(124,58,237,0.08)]"
            }`}
          >
            <div
              className={`absolute inset-0 ${
                isDark
                  ? "bg-[radial-gradient(circle_at_top_right,rgba(139,92,246,0.2),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(217,70,239,0.14),transparent_32%)]"
                  : "bg-[radial-gradient(circle_at_top_right,rgba(216,180,254,0.22),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(139,92,246,0.14),transparent_34%)]"
              }`}
            />
            <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(244,114,182,0.18)_0%,rgba(244,114,182,0)_70%)]" />
            <div className="absolute bottom-0 left-0 h-40 w-40 -translate-x-1/3 translate-y-1/3 rounded-full bg-[radial-gradient(circle,rgba(196,181,253,0.2)_0%,rgba(196,181,253,0)_72%)]" />
          <div className="relative z-[1] max-w-2xl">
            <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${isDark ? "text-violet-200/78" : "text-[var(--primary)]/74"}`}>Workspace Controls</p>
            <h1 className={`mt-2 text-3xl font-semibold tracking-tight sm:text-4xl ${isDark ? "text-white" : "text-[var(--text-main)]"}`}>Settings</h1>
            <p className={`mt-3 text-sm sm:text-[15px] ${isDark ? "text-violet-100/72" : "text-[var(--text-muted)]"}`}>
              Manage account actions, study controls, and theme preferences with a cleaner, more polished experience.
            </p>
          </div>
          </div>
        </div>

        <section className={`group rounded-[28px] border p-6 transition-all duration-300 hover:-translate-y-[1px] sm:p-7 ${
          isDark
            ? "border-[rgba(139,92,246,0.18)] bg-[linear-gradient(180deg,rgba(25,23,40,0.96),rgba(18,17,32,0.98))] shadow-[0_24px_60px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.02)] hover:border-[rgba(167,139,250,0.3)] hover:shadow-[0_28px_72px_rgba(0,0,0,0.34)]"
            : "border-[rgba(139,92,246,0.16)] bg-white shadow-[0_18px_48px_rgba(109,40,217,0.08),0_4px_16px_rgba(15,23,42,0.04)] hover:border-[rgba(139,92,246,0.26)] hover:shadow-[0_24px_60px_rgba(109,40,217,0.12),0_8px_20px_rgba(15,23,42,0.05)]"
        }`}>
          <h2 className={`text-lg font-semibold ${isDark ? "text-white" : "text-[var(--text-main)]"}`}>Study controls</h2>
          <p className={`mt-1.5 text-sm ${isDark ? "text-violet-100/66" : "text-[var(--text-muted)]"}`}>Reset progress or clean up workspace data.</p>

          <div className="mt-5 flex flex-wrap gap-3">
            <Button onClick={onResetFlashcards} disabled={!!busy} className={`rounded-2xl border border-transparent bg-[linear-gradient(135deg,#7c3aed,#a855f7)] px-5 text-white transition-all duration-200 hover:-translate-y-[1px] hover:brightness-105 active:translate-y-0 ${isDark ? "shadow-[0_16px_36px_rgba(124,58,237,0.32)] hover:shadow-[0_20px_44px_rgba(124,58,237,0.38)]" : "shadow-[0_14px_34px_rgba(124,58,237,0.24)] hover:shadow-[0_18px_40px_rgba(124,58,237,0.3)]"}`}>
              {busy === "reset" ? "Resetting..." : "Reset flashcard progress"}
            </Button>
            <Button onClick={onClearChat} disabled={!!busy} className={`rounded-2xl border px-5 transition-all duration-200 hover:-translate-y-[1px] active:translate-y-0 ${
              isDark
                ? "border-[rgba(139,92,246,0.18)] bg-[rgba(33,30,52,0.98)] text-white shadow-[0_12px_28px_rgba(0,0,0,0.22)] hover:border-[rgba(167,139,250,0.32)] hover:bg-[rgba(45,39,70,0.98)] hover:shadow-[0_16px_34px_rgba(0,0,0,0.28)]"
                : "border-[rgba(139,92,246,0.18)] bg-white text-[var(--text-main)] shadow-[0_10px_26px_rgba(124,58,237,0.08)] hover:border-[rgba(139,92,246,0.28)] hover:bg-[rgba(245,243,255,0.9)] hover:shadow-[0_14px_32px_rgba(124,58,237,0.12)]"
            }`}>
              {busy === "clear-chat" ? "Clearing..." : "Clear chat history"}
            </Button>
            <Button onClick={onClearEmbeddings} disabled={!!busy} className={`rounded-2xl border px-5 transition-all duration-200 hover:-translate-y-[1px] active:translate-y-0 ${
              isDark
                ? "border-[rgba(139,92,246,0.18)] bg-[rgba(33,30,52,0.98)] text-white shadow-[0_12px_28px_rgba(0,0,0,0.22)] hover:border-[rgba(167,139,250,0.32)] hover:bg-[rgba(45,39,70,0.98)] hover:shadow-[0_16px_34px_rgba(0,0,0,0.28)]"
                : "border-[rgba(139,92,246,0.18)] bg-white text-[var(--text-main)] shadow-[0_10px_26px_rgba(124,58,237,0.08)] hover:border-[rgba(139,92,246,0.28)] hover:bg-[rgba(245,243,255,0.9)] hover:shadow-[0_14px_32px_rgba(124,58,237,0.12)]"
            }`}>
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-6 px-1 sm:gap-7">
        <header className="relative overflow-hidden rounded-[30px] border border-token bg-[linear-gradient(135deg,rgba(13,39,60,0.96),rgba(17,77,96,0.9)_50%,rgba(28,63,95,0.92))] p-6 text-white shadow-[0_22px_58px_rgba(7,18,28,0.24)] transition-all duration-300 sm:p-8">
          <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(165,234,255,0.32)_0%,rgba(165,234,255,0)_70%)]" />
          <div className="absolute bottom-0 left-0 h-36 w-36 -translate-x-1/3 translate-y-1/3 rounded-full bg-[radial-gradient(circle,rgba(142,255,226,0.22)_0%,rgba(142,255,226,0)_72%)]" />
          <div className="relative z-[1] max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/75">Workspace Controls</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Settings</h1>
            <p className="mt-3 text-sm text-white/80 sm:text-[15px]">
              Manage account actions, study controls, and theme preferences with a cleaner, more polished experience.
            </p>
          </div>
        </header>

        <section className="group rounded-[26px] border border-token bg-[var(--surface)]/95 p-6 shadow-[0_14px_38px_rgba(14,20,36,0.09)] backdrop-blur-sm transition-all duration-300 hover:-translate-y-[1px] hover:shadow-[0_20px_48px_rgba(14,20,36,0.12)] sm:p-7">
          <h2 className="text-lg font-semibold text-[var(--text-main)]">Study controls</h2>
          <p className="mt-1.5 text-sm text-[var(--text-muted)]">Reset progress or clean up workspace data.</p>

          <div className="mt-5 flex flex-wrap gap-3">
            <Button onClick={onResetFlashcards} disabled={!!busy} className="transition-all duration-200 hover:-translate-y-[1px] active:translate-y-0">
              {busy === "reset" ? "Resetting..." : "Reset flashcard progress"}
            </Button>
            <Button onClick={onClearChat} disabled={!!busy} className="transition-all duration-200 hover:-translate-y-[1px] active:translate-y-0">
              {busy === "clear-chat" ? "Clearing..." : "Clear chat history"}
            </Button>
            <Button onClick={onClearEmbeddings} disabled={!!busy} className="transition-all duration-200 hover:-translate-y-[1px] active:translate-y-0">
              {busy === "clear-embed" ? "Clearing..." : "Clear document embeddings"}
            </Button>
          </div>
        </section>

        <section className={`group rounded-[28px] border p-6 transition-all duration-300 hover:-translate-y-[1px] sm:p-7 ${
          isDark
            ? "border-[rgba(139,92,246,0.18)] bg-[linear-gradient(180deg,rgba(25,23,40,0.96),rgba(18,17,32,0.98))] shadow-[0_24px_60px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.02)] hover:border-[rgba(167,139,250,0.3)] hover:shadow-[0_28px_72px_rgba(0,0,0,0.34)]"
            : "border-[rgba(139,92,246,0.16)] bg-white shadow-[0_18px_48px_rgba(109,40,217,0.08),0_4px_16px_rgba(15,23,42,0.04)] hover:border-[rgba(139,92,246,0.26)] hover:shadow-[0_24px_60px_rgba(109,40,217,0.12),0_8px_20px_rgba(15,23,42,0.05)]"
        }`}>
          <h2 className={`text-lg font-semibold ${isDark ? "text-white" : "text-[var(--text-main)]"}`}>Appearance</h2>
          <p className={`mt-1.5 text-sm ${isDark ? "text-violet-100/66" : "text-[var(--text-muted)]"}`}>Adjust how the workspace looks for you.</p>

          <div className={`mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[24px] border px-4 py-3.5 transition-colors duration-200 ${
            isDark
              ? "border-[rgba(139,92,246,0.18)] bg-[rgba(28,25,44,0.94)] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] hover:border-[rgba(167,139,250,0.28)]"
              : "border-[rgba(139,92,246,0.14)] bg-[#faf7ff] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] hover:border-[rgba(139,92,246,0.24)]"
          }`}>
            <div>
              <div className={`text-sm font-semibold ${isDark ? "text-white" : "text-[var(--text-main)]"}`}>Theme</div>
              <div className={`text-xs ${isDark ? "text-violet-100/62" : "text-[var(--text-muted)]"}`}>Sync with your preference.</div>
        <section className="group rounded-[26px] border border-token bg-[var(--surface)]/95 p-6 shadow-[0_14px_38px_rgba(14,20,36,0.09)] backdrop-blur-sm transition-all duration-300 hover:-translate-y-[1px] hover:shadow-[0_20px_48px_rgba(14,20,36,0.12)] sm:p-7">
          <h2 className="text-lg font-semibold text-[var(--text-main)]">Appearance</h2>
          <p className="mt-1.5 text-sm text-[var(--text-muted)]">Adjust how the workspace looks for you.</p>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-token bg-[var(--surface-2)]/70 px-4 py-3.5 transition-colors duration-200 hover:border-[var(--border-strong)]">
            <div>
              <div className="text-sm font-semibold text-[var(--text-main)]">Theme</div>
              <div className="text-xs text-[var(--text-muted)]">Sync with your preference.</div>
            </div>
            <div className={`flex items-center gap-2 rounded-2xl p-1.5 ${
              isDark
                ? "bg-[rgba(17,15,29,0.98)] shadow-[inset_0_1px_4px_rgba(0,0,0,0.32)]"
                : "bg-white shadow-[inset_0_1px_4px_rgba(124,58,237,0.06)]"
            }`}>
              {(["light", "dark", "system"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setTheme(mode)}
                  className={`rounded-xl border px-3.5 py-2 text-xs font-semibold capitalize transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${
                    theme === mode
                      ? `border-transparent bg-[linear-gradient(135deg,#7c3aed,#a855f7)] text-white ${isDark ? "shadow-[0_12px_24px_rgba(124,58,237,0.34)]" : "shadow-[0_12px_24px_rgba(124,58,237,0.24)]"}`
                      : isDark
                        ? "border-[rgba(139,92,246,0.12)] bg-[rgba(28,25,44,0.98)] text-violet-100/76 hover:border-[rgba(167,139,250,0.24)] hover:bg-[rgba(46,40,71,0.98)] hover:text-white"
                        : "border-[rgba(139,92,246,0.1)] bg-white text-[var(--text-muted)] hover:border-[rgba(139,92,246,0.18)] hover:bg-[rgba(245,243,255,0.9)] hover:text-[var(--text-main)]"
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold capitalize transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${
                    theme === mode
                      ? "border-[var(--primary)] bg-[var(--primary)] text-inverse shadow-[0_10px_22px_rgba(123,95,239,0.35)]"
                      : "border-token bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-main)]"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className={`group rounded-[28px] border p-6 transition-all duration-300 hover:-translate-y-[1px] sm:p-7 ${
          isDark
            ? "border-[rgba(139,92,246,0.18)] bg-[linear-gradient(180deg,rgba(25,23,40,0.96),rgba(18,17,32,0.98))] shadow-[0_24px_60px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.02)] hover:border-[rgba(167,139,250,0.3)] hover:shadow-[0_28px_72px_rgba(0,0,0,0.34)]"
            : "border-[rgba(139,92,246,0.16)] bg-white shadow-[0_18px_48px_rgba(109,40,217,0.08),0_4px_16px_rgba(15,23,42,0.04)] hover:border-[rgba(139,92,246,0.26)] hover:shadow-[0_24px_60px_rgba(109,40,217,0.12),0_8px_20px_rgba(15,23,42,0.05)]"
        }`}>
          <h2 className={`text-lg font-semibold ${isDark ? "text-white" : "text-[var(--text-main)]"}`}>Account</h2>
          <p className={`mt-1.5 text-sm ${isDark ? "text-violet-100/66" : "text-[var(--text-muted)]"}`}>Manage access to your workspace.</p>

          <div className="mt-5 flex flex-wrap gap-3">
            <Button onClick={onLogout} disabled={!!busy} className={`rounded-2xl border px-5 transition-all duration-200 hover:-translate-y-[1px] active:translate-y-0 ${
              isDark
                ? "border-[rgba(139,92,246,0.18)] bg-[rgba(33,30,52,0.98)] text-white shadow-[0_12px_28px_rgba(0,0,0,0.22)] hover:border-[rgba(167,139,250,0.32)] hover:bg-[rgba(45,39,70,0.98)] hover:shadow-[0_16px_34px_rgba(0,0,0,0.28)]"
                : "border-[rgba(139,92,246,0.18)] bg-white text-[var(--text-main)] shadow-[0_10px_26px_rgba(124,58,237,0.08)] hover:border-[rgba(139,92,246,0.28)] hover:bg-[rgba(245,243,255,0.9)] hover:shadow-[0_14px_32px_rgba(124,58,237,0.12)]"
            }`}>
        <section className="group rounded-[26px] border border-token bg-[var(--surface)]/95 p-6 shadow-[0_14px_38px_rgba(14,20,36,0.09)] backdrop-blur-sm transition-all duration-300 hover:-translate-y-[1px] hover:shadow-[0_20px_48px_rgba(14,20,36,0.12)] sm:p-7">
          <h2 className="text-lg font-semibold text-[var(--text-main)]">Account</h2>
          <p className="mt-1.5 text-sm text-[var(--text-muted)]">Manage access to your workspace.</p>

          <div className="mt-5 flex flex-wrap gap-3">
            <Button onClick={onLogout} disabled={!!busy} className="transition-all duration-200 hover:-translate-y-[1px] active:translate-y-0">
              {busy === "logout" ? "Logging out..." : "Logout"}
            </Button>
            <Button
              variant="primary"
              onClick={onDelete}
              disabled={!!busy}
              className={`rounded-2xl border border-[rgba(244,114,182,0.18)] bg-[linear-gradient(135deg,rgba(168,85,247,0.96),rgba(217,70,239,0.9))] px-5 text-white transition-all duration-200 hover:-translate-y-[1px] hover:brightness-105 active:translate-y-0 ${isDark ? "shadow-[0_16px_36px_rgba(168,85,247,0.28)] hover:shadow-[0_20px_42px_rgba(168,85,247,0.34)]" : "shadow-[0_14px_34px_rgba(168,85,247,0.22)] hover:shadow-[0_18px_38px_rgba(168,85,247,0.28)]"}`}
              className="bg-[var(--primary)] transition-all duration-200 hover:-translate-y-[1px] hover:opacity-90 active:translate-y-0"
            >
              {busy === "delete" ? "Deleting..." : "Delete account"}
            </Button>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
