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
  const chips = [
    "from-[var(--primary)] to-[var(--accent-pink)]",
    "from-[var(--primary)] to-[var(--accent-mint)]",
    "from-[var(--accent-pink)] to-[var(--accent-lime)]",
    "from-[var(--accent-mint)] to-[var(--primary)]",
  ];

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return items;
    return items.filter((it) => it.name.toLowerCase().includes(t));
  }, [items, q]);

  return (
    <aside className="h-full w-[320px] shrink-0 rounded-[28px] surface shadow-token">
      <div className="border-b border-token px-5 py-5">
        <div className="text-xs uppercase tracking-[0.3em] text-[var(--primary)]">My Classes</div>
        <div className="mt-1 text-2xl font-semibold text-main">Your Classes</div>
        <div className="text-xs text-muted">{items.length} active</div>
        <div className="mt-4 flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search classes"
            className="h-10 w-full rounded-2xl border border-token surface px-3 text-sm"
          />
        </div>
        <Button variant="primary" className="mt-4 w-full rounded-2xl" onClick={onNew}>
          New class
        </Button>
      </div>

      <div className="p-4">
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-token surface-2 p-4 text-sm text-muted">
            {q ? "No classes match your search." : "No classes yet."}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((c, idx) => {
              const isActive = c.id === selectedId;
              const chip = chips[idx % chips.length];
              return (
                <button
                  key={c.id}
                  onClick={() => onSelect(c.id)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left text-sm transition ${
                    isActive
                      ? "border-strong surface shadow-token"
                      : "border-token surface-80 hover:border-token"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${chip} text-[11px] font-semibold text-inverse`}
                    >
                      {c.name.slice(0, 2).toUpperCase()}
                    </span>
                    <div>
                      <div className="font-semibold text-main truncate">{c.name}</div>
                      <div className="text-xs text-muted">{c.subject ?? "General"}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
