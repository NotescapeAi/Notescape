import { useMemo, useState } from "react";
import { ChevronsLeft, ChevronsRight, Folder, Plus, Search } from "lucide-react";
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

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return items;
    return items.filter((it) => it.name.toLowerCase().includes(t));
  }, [items, q]);

  return (
    <aside
      className={`flex h-full min-h-0 shrink-0 flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)] transition-[width] duration-200 ${
        collapsed ? "w-[72px]" : "w-[280px]"
      }`}
    >
      <div className="flex-shrink-0 border-b border-[var(--border)] px-3 py-3">
        {!collapsed ? (
          <>
            {/* Search + collapse toggle on a single row — no decorative header */}
            <div className="flex items-center gap-2">
              <div className="flex h-9 flex-1 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] px-3 transition focus-within:border-[color-mix(in_srgb,var(--primary)_55%,var(--border))] focus-within:ring-2 focus-within:ring-[var(--ring)]">
                <Search className="h-4 w-4 flex-shrink-0 text-[var(--text-muted-soft)]" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search classes"
                  className="h-full w-full min-w-0 border-0 bg-transparent p-0 text-[13.5px] text-[var(--text-main)] placeholder:text-[var(--text-muted-soft)] focus:outline-none focus:ring-0"
                />
              </div>
              <button
                onClick={onToggleCollapse}
                aria-label="Collapse classes panel"
                title="Collapse panel"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface)] hover:text-[var(--text-main)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                type="button"
              >
                <ChevronsLeft className="h-4 w-4" />
              </button>
            </div>
            <Button
              variant="primary"
              size="sm"
              className="mt-2.5 w-full press-feedback"
              onClick={onNew}
            >
              <Plus className="h-4 w-4" />
              New class
            </Button>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={onToggleCollapse}
              aria-label="Expand classes panel"
              title="Expand panel"
              className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface)] hover:text-[var(--text-main)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              type="button"
            >
              <ChevronsRight className="h-4 w-4" />
            </button>
            <button
              onClick={onNew}
              className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] transition hover:border-[var(--primary)] hover:bg-[var(--primary-soft)] hover:text-[var(--primary)]"
              title="New class"
              aria-label="New class"
              type="button"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <div className="ns-scroll min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {filtered.length === 0 ? (
          <div className="mx-2 rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--surface-2)] px-3 py-4 text-center text-[13px] text-[var(--text-muted)]">
            {q ? "No classes match." : "No classes yet."}
          </div>
        ) : (
          <ul className={`space-y-0.5 ${collapsed ? "flex flex-col items-center" : ""}`}>
            {filtered.map((c) => {
              const isActive = c.id === selectedId;
              return (
                <li key={c.id} className={collapsed ? "w-full" : ""}>
                  <div
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
                    aria-label={c.name}
                    aria-current={isActive ? "true" : undefined}
                    className={`group relative flex w-full cursor-pointer items-center gap-3 rounded-[var(--radius-md)] px-2.5 py-2 text-left transition focus:outline-none ${
                      isActive
                        ? "bg-[var(--primary-soft)] text-[var(--primary)]"
                        : "text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text-main)]"
                    } ${collapsed ? "justify-center" : ""}`}
                  >
                    {isActive && !collapsed ? (
                      <span
                        aria-hidden
                        className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-[var(--primary)]"
                      />
                    ) : null}
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] ${
                        isActive
                          ? "bg-[var(--surface)] text-[var(--primary)]"
                          : "bg-[var(--surface-2)] text-[var(--text-muted)] group-hover:bg-[var(--surface)]"
                      }`}
                    >
                      <Folder className="h-4 w-4" />
                    </span>
                    {!collapsed && (
                      <div className="min-w-0 flex-1">
                        <div className={`truncate text-[14px] font-semibold leading-tight tracking-[-0.005em] ${isActive ? "text-[var(--primary)]" : "text-[var(--text-main)]"}`}>
                          {c.name}
                        </div>
                      </div>
                    )}
                    {!collapsed && (onRename || onDelete) && (
                      <div
                        className="flex-shrink-0"
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
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
