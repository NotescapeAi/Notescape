import { useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import type { ClassRow } from "../lib/api";
import Button from "./Button";
import KebabMenu from "./KebabMenu";


type Props = {
  items: ClassRow[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
  onRename?: (id: number) => void;
  onDelete?: (id: number) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
};

export default function ClassSidebar({
  items,
  selectedId,
  onSelect,
  onNew,
  onRename,
  onDelete,
  collapsed = false,
  onToggleCollapse,
}: Props) {
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
    <aside
      className={`h-full shrink-0 rounded-[28px] surface shadow-token transition-[width] duration-200 ${
        collapsed ? "w-[84px]" : "w-[300px]"
      }`}
    >
      <div className="border-b border-token px-4 py-5">
        <div className="flex items-center justify-between gap-2">
          <div className={`${collapsed ? "text-center w-full" : ""}`}>
            {!collapsed && (
              <div className="text-xs text-muted">{items.length} active</div>
            )}
          </div>
          <button
            onClick={onToggleCollapse}
            aria-label="Collapse My Classes panel"
            className="h-8 w-8 rounded-full text-[var(--primary)] hover:bg-[rgba(123,95,239,0.12)]"
            type="button"
          >
            <ChevronLeft
              className="mx-auto h-4 w-4"
              style={{
                transition: "transform 0.25s ease",
                transform: collapsed ? "rotate(180deg)" : "rotate(0deg)",
              }}
            />
          </button>
        </div>
        {!collapsed && (
          <>
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
          </>
        )}
        {collapsed && (
          <button
            onClick={onNew}
            className="mt-4 flex h-10 w-full items-center justify-center rounded-2xl border border-token text-base text-[var(--primary)]"
            title="New class"
            type="button"
          >
            +
          </button>
        )}
      </div>

      <div className="p-4">
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-token surface-2 p-4 text-sm text-muted">
            {q ? "No classes match your search." : "No classes yet."}
          </div>
        ) : (
          <div className={`space-y-3 ${collapsed ? "flex flex-col items-center" : ""}`}>
            {filtered.map((c, idx) => {
              const isActive = c.id === selectedId;
              const chip = chips[idx % chips.length];
              return (
                <div
                  key={c.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelect(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(c.id);
                    }
                  }}
                  title={collapsed ? c.name : undefined}
                  className={`w-full rounded-2xl border px-4 py-3 text-left text-sm transition ${
                    isActive
                      ? "border-strong surface shadow-token"
                      : "border-token surface-80 hover:border-token"
                  } ${collapsed ? "flex w-12 flex-col items-center px-2 py-2 text-center" : ""}`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${chip} text-[11px] font-semibold text-inverse`}
                    >
                    {c.name.slice(0, 2).toUpperCase()}
                  </span>
                  {!collapsed && (
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-main truncate">{c.name}</div>
                      </div>
                  )}
                  {!collapsed && (onRename || onDelete) && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <KebabMenu
                        items={[
                          ...(onRename ? [{ label: "Rename class", onClick: () => onRename(c.id) }] : []),
                          ...(onDelete ? [{ label: "Delete class", onClick: () => onDelete(c.id) }] : []),
                        ]}
                      />
                    </div>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
