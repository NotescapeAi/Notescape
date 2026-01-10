// src/pages/Settings.tsx
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
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6">
        <section className="max-w-2xl rounded-[24px] bg-white p-6 shadow-[0_12px_30px_rgba(15,16,32,0.08)]">
          <h2 className="text-base font-semibold">Study controls</h2>
          <p className="mt-1 text-sm text-[#6B5CA5]">Reset progress or clean up workspace data.</p>

          <div className="mt-4 flex flex-wrap gap-3">
            <Button onClick={onResetFlashcards} disabled={!!busy}>
              {busy === "reset" ? "Resetting..." : "Reset flashcard progress"}
            </Button>
            <Button onClick={onClearChat} disabled={!!busy}>
              {busy === "clear-chat" ? "Clearing..." : "Clear chat history"}
            </Button>
            <Button onClick={onClearEmbeddings} disabled={!!busy}>
              {busy === "clear-embed" ? "Clearing..." : "Clear document embeddings"}
            </Button>
          </div>
        </section>

        <section className="max-w-2xl rounded-[24px] bg-white p-6 shadow-[0_12px_30px_rgba(15,16,32,0.08)]">
          <h2 className="text-base font-semibold">Appearance</h2>
          <p className="mt-1 text-sm text-[#6B5CA5]">Adjust how the workspace looks for you.</p>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#EFE7FF] px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-[#0F1020]">Theme</div>
              <div className="text-xs text-[#6B5CA5]">Sync with your preference.</div>
            </div>
            <div className="flex items-center gap-2">
              {(["light", "dark", "system"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setTheme(mode)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                    theme === mode
                      ? "border-[#7B5FEF] bg-[#7B5FEF] text-white"
                      : "border-[#EFE7FF] bg-white text-[#6B5CA5]"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="max-w-2xl rounded-[24px] bg-white p-6 shadow-[0_12px_30px_rgba(15,16,32,0.08)]">
          <h2 className="text-base font-semibold">Account</h2>
          <p className="mt-1 text-sm text-[#6B5CA5]">Manage access to your workspace.</p>

          <div className="mt-4 flex flex-wrap gap-3">
            <Button onClick={onLogout} disabled={!!busy}>
              {busy === "logout" ? "Logging out..." : "Logout"}
            </Button>
            <Button
              variant="primary"
              onClick={onDelete}
              disabled={!!busy}
              className="bg-[#7B5FEF] hover:bg-[#6A4FE0]"
            >
              {busy === "delete" ? "Deleting..." : "Delete account"}
            </Button>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
