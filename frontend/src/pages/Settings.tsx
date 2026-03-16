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
  const { theme, setTheme } = useTheme();
  const [busy, setBusy] = useState<null | "logout" | "delete" | "reset" | "clear-chat" | "clear-embed">(null);

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

        <section className="group rounded-[26px] border border-token bg-[var(--surface)]/95 p-6 shadow-[0_14px_38px_rgba(14,20,36,0.09)] backdrop-blur-sm transition-all duration-300 hover:-translate-y-[1px] hover:shadow-[0_20px_48px_rgba(14,20,36,0.12)] sm:p-7">
          <h2 className="text-lg font-semibold text-[var(--text-main)]">Appearance</h2>
          <p className="mt-1.5 text-sm text-[var(--text-muted)]">Adjust how the workspace looks for you.</p>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-token bg-[var(--surface-2)]/70 px-4 py-3.5 transition-colors duration-200 hover:border-[var(--border-strong)]">
            <div>
              <div className="text-sm font-semibold text-[var(--text-main)]">Theme</div>
              <div className="text-xs text-[var(--text-muted)]">Sync with your preference.</div>
            </div>
            <div className="flex items-center gap-2">
              {(["light", "dark", "system"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setTheme(mode)}
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
