// src/pages/Settings.tsx
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import AppSidebar from "../components/AppSidebar";
import PageHeader from "../components/PageHeader";
import Button from "../components/Button";
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
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Delete failed";
      alert(msg);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <AppSidebar />
      <main className="flex-1 p-6 lg:p-8">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6">
          <PageHeader title="Settings" subtitle="Manage your account and session." />

          <section className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold">Account</h2>
            <p className="text-sm text-slate-500 mt-1">
              Control access and remove your account if needed.
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              <Button onClick={onLogout} disabled={!!busy}>
                {busy === "logout" ? "Logging out..." : "Logout"}
              </Button>
              <Button variant="primary" onClick={onDelete} disabled={!!busy} className="bg-rose-600 hover:bg-rose-500">
                {busy === "delete" ? "Deleting..." : "Delete account"}
              </Button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
