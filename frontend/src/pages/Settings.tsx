// src/pages/Settings.tsx
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import AppShell from "../layouts/AppShell";
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
    <AppShell title="Settings" breadcrumbs={["Settings"]} subtitle="Manage your account and session.">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6">
          <section className="max-w-2xl rounded-[24px] bg-white p-6 shadow-[0_12px_30px_rgba(15,16,32,0.08)]">
            <h2 className="text-base font-semibold">Account</h2>
            <p className="text-sm text-[#6B5CA5] mt-1">
              Control access and remove your account if needed.
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              <Button onClick={onLogout} disabled={!!busy}>
                {busy === "logout" ? "Logging out..." : "Logout"}
              </Button>
              <Button
                variant="primary"
                onClick={onDelete}
                disabled={!!busy}
                className="bg-[#EF5F8B] hover:bg-[#E14B78]"
              >
                {busy === "delete" ? "Deleting..." : "Delete account"}
              </Button>
            </div>
          </section>
      </div>
    </AppShell>
  );
}
