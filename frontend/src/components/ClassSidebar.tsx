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
    "from-[#7B5FEF] to-[#EF5F8B]",
    "from-[#7B5FEF] to-[#5FEFC3]",
    "from-[#EF5F8B] to-[#D3EF5F]",
    "from-[#5FEFC3] to-[#7B5FEF]",
  ];

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return items;
    return items.filter((it) => it.name.toLowerCase().includes(t));
  }, [items, q]);

  return (
    <aside className="h-full w-[320px] shrink-0 rounded-[28px] bg-white shadow-[0_16px_40px_rgba(15,16,32,0.08)]">
      <div className="border-b border-[#F1ECFF] px-5 py-5">
        <div className="text-xs uppercase tracking-[0.3em] text-[#7B5FEF]">My Classes</div>
        <div className="mt-1 text-2xl font-semibold text-[#0F1020]">Your Classes</div>
        <div className="text-xs text-[#6B5CA5]">{items.length} active</div>
        <div className="mt-4 flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search classes"
            className="h-10 w-full rounded-2xl border border-[#EFE7FF] bg-white px-3 text-sm"
          />
        </div>
        <Button variant="primary" className="mt-4 w-full rounded-2xl" onClick={onNew}>
          New class
        </Button>
      </div>

      <div className="p-4">
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#EFE7FF] bg-[#F8F5FF] p-4 text-sm text-[#6B5CA5]">
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
                      ? "border-[#E7DEFF] bg-white shadow-[0_12px_30px_rgba(123,95,239,0.18)]"
                      : "border-[#EFE7FF] bg-white/80 hover:border-[#E0D6FF]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${chip} text-[11px] font-semibold text-white`}
                    >
                      {c.name.slice(0, 2).toUpperCase()}
                    </span>
                    <div>
                      <div className="font-semibold text-[#0F1020] truncate">{c.name}</div>
                      <div className="text-xs text-[#6B5CA5]">{c.subject ?? "General"}</div>
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
