import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "../layouts/AppShell";
import Button from "../components/Button";
import { listClasses, type ClassRow } from "../lib/api";

const LS_LAST_CLASS = "last_class_id";

export default function FlashcardsHub() {
  const navigate = useNavigate();
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let ignore = false;
    (async () => {
      setLoading(true);
      try {
        const rows = await listClasses();
        if (ignore) return;
        setClasses(rows);
        const stored = Number(localStorage.getItem(LS_LAST_CLASS));
        if (Number.isFinite(stored) && rows.some((c) => c.id === stored)) {
          setSelectedId(stored);
        } else if (rows[0]) {
          setSelectedId(rows[0].id);
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  function openFlashcards() {
    if (!selectedId) return;
    localStorage.setItem(LS_LAST_CLASS, String(selectedId));
    navigate(`/classes/${selectedId}/flashcards`);
  }

  return (
    <AppShell title="Flashcards">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6">
        <div className="rounded-[28px] surface p-6 shadow-[0_16px_40px_rgba(15,16,32,0.08)]">
          <div className="text-sm font-semibold text-main">Choose a class</div>
          <div className="mt-1 text-xs text-muted">
            Pick a class to view its flashcards.
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <select
              value={selectedId ?? ""}
              onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : null)}
              className="h-10 min-w-[240px] rounded-2xl border border-token surface px-3 text-sm text-muted"
            >
              <option value="">Select class</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <Button
              variant="primary"
              className="rounded-full"
              onClick={openFlashcards}
              disabled={!selectedId}
            >
              Open flashcards
            </Button>
          </div>
          {loading && <div className="mt-3 text-xs text-muted">Loading classes...</div>}
          {!loading && classes.length === 0 && (
            <div className="mt-3 text-xs text-muted">No classes yet. Create one to begin.</div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
