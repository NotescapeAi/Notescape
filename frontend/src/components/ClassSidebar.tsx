import { useMemo, useState } from "react";
import type { ClassRow } from "../lib/api";
import Button from "./Button";


type Props = {
  items: ClassRow[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
};

export default function ClassSidebar({ items, selectedId, onSelect, onNew }: Props) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return items;
    return items.filter((it) => it.name.toLowerCase().includes(t));
  }, [items, q]);

  return (
    <aside className="h-screen w-[300px] shrink-0 border-r border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-4">
        <div className="text-sm font-semibold text-slate-900">Classes</div>
        <div className="text-xs text-slate-500">{items.length} total</div>
        <div className="mt-3 flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search classes"
            className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm"
          />
        </div>
        <Button variant="primary" className="mt-3 w-full" onClick={onNew}>
          New class
        </Button>
      </div>

      <div className="p-3">
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            {q ? "No classes match your search." : "No classes yet."}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((c) => {
              const isActive = c.id === selectedId;
              return (
                <button
                  key={c.id}
                  onClick={() => onSelect(c.id)}
                  className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                    isActive
                      ? "border-slate-900 bg-slate-50"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="font-semibold text-slate-900 truncate">{c.name}</div>
                  <div className="text-xs text-slate-500">{c.subject ?? "General"}</div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
