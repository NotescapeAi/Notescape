// src/pages/Settings.tsx
import DashboardShell from "../layouts/DashboardShell";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { logout as apiLogout, deleteAccount as apiDelete } from "../lib/api";

export default function Settings() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<null | "logout" | "delete">(null);

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
    } catch (e: any) {
      alert(e.message || "Delete failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <DashboardShell>
      <h1 className="text-2xl font-extrabold tracking-tight mb-6">Settings</h1>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm max-w-2xl">
        <h2 className="text-lg font-bold mb-2">Account</h2>
        <p className="text-sm text-slate-600 mb-4">
          Manage your session and account preferences.
        </p>

        <div className="flex flex-wrap gap-3">
                <button
                onClick={onLogout}
                disabled={!!busy}
                className="
                    inline-flex items-center gap-2 rounded-xl px-4 py-2
                    font-semibold text-black
                    bg-gradient-to-r from-violet-600 to-fuchsia-600
                    ring-1 ring-violet-300 shadow-sm shadow-violet-200/60
                    hover:bg-gray-200 hover:text-slate-900 hover:ring-1 hover:ring-gray-300
                    active:scale-[.99]
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2
                    disabled:opacity-60 disabled:cursor-not-allowed
                "
                >
                {/* icon */}
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                    <path d="M10 17l-5-5 5-5" />
                    <path d="M15 12H5" />
                </svg>
                {busy === "logout" ? "Logging out…" : "Logout"}
                </button>

                <button
                onClick={onDelete}
                disabled={!!busy}
                className="
                    inline-flex items-center gap-2 rounded-xl px-4 py-2
                    font-semibold text-white
                    bg-rose-600 ring-1 ring-rose-300 shadow-sm shadow-rose-200/60
                    hover:bg-rose-700 active:scale-[.99]
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2
                    disabled:opacity-60 disabled:cursor-not-allowed
                "
                >
                {busy === "delete" ? "Deleting…" : "Delete Account"}
                </button>

        </div>
      </section>
    </DashboardShell>
  );
}
