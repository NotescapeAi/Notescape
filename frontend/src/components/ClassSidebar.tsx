import { useEffect, useMemo, useRef, useState } from "react";
import type { ClassRow } from "../lib/api";
import { Link } from "react-router-dom";
import "./classSidebar.css";

type Props = {
  items: ClassRow[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onCreate: (name: string) => Promise<void> | void;
  onRename: (id: number, name: string) => Promise<void> | void;
  onDelete: (id: number) => Promise<void> | void;
};

export default function ClassSidebar({
  items,
  selectedId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: Props) {
  const [collapsed, setCollapsed] = useState<boolean>(
    () => localStorage.getItem("sidebar_collapsed") === "1"
  );
  useEffect(() => {
    localStorage.setItem("sidebar_collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [menuFor, setMenuFor] = useState<number | null>(null);

  // add-new
  const [adding, setAdding] = useState(false);
  const [addingName, setAddingName] = useState("");
  const addInputRef = useRef<HTMLInputElement>(null);

  // search/filter
  const [q, setQ] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // close kebab on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest?.(".class-item") && !t.closest?.(".kebab-menu")) {
        setMenuFor(null);
      }
    };
    window.addEventListener("click", h);
    return () => window.removeEventListener("click", h);
  }, []);

  // keyboard nav for list focus (↑/↓ enter)
  const listRef = useRef<HTMLUListElement>(null);
  function focusMove(delta: number) {
    const list = listRef.current;
    if (!list) return;
    const buttons = Array.from(
      list.querySelectorAll<HTMLButtonElement>(".item-body")
    );
    if (!buttons.length) return;
    let idx = buttons.findIndex((b) => b === document.activeElement);
    if (idx === -1) {
      idx = Math.max(0, items.findIndex((c) => c.id === selectedId));
      buttons[idx]?.focus();
      return;
    }
    const next = Math.max(0, Math.min(buttons.length - 1, idx + delta));
    buttons[next]?.focus();
  }

  async function saveRename(id: number) {
    const name = editName.trim();
    setMenuFor(null);
    if (!name) return setEditingId(null);
    if (name.length > 120) return;
    await onRename(id, name);
    setEditingId(null);
  }

  async function confirmCreate() {
    const name = addingName.trim();
    if (!name) return;
    if (name.length > 120) return;
    await onCreate(name);
    setAdding(false);
    setAddingName("");
  }

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return items;
    return items.filter((it) => it.name.toLowerCase().includes(t));
  }, [items, q]);

  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      {/* collapse toggle */}
      <button
        className={`collapse-fab ${collapsed ? "is-collapsed" : ""}`}
        onClick={() => setCollapsed((v) => !v)}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? "»" : "«"}
      </button>

      {/* header */}
      <div className="sidebar-header">
        <Link
          to="/dashboard"
          className="back-only"
          title="Back to Dashboard"
          aria-label="Back to Dashboard"
        >
          <svg className="backicon" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M15 6l-6 6 6 6"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
        {!collapsed && (
          <>
            <h2 className="title">Classes</h2>
            <span className="count-pill" aria-label={`${items.length} classes`}>
              {items.length}
            </span>
          </>
        )}
      </div>

      {/* search (hidden when collapsed) */}
      {!collapsed && (
        <div className="search-row">
          <div className="search-wrap">
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" className="search-ic">
              <path
                d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"
                stroke="currentColor"
                strokeWidth="1.8"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search classes"
              className="search-input"
              aria-label="Search classes"
            />
            {q && (
              <button
                className="search-clear"
                aria-label="Clear search"
                onClick={() => {
                  setQ("");
                  searchRef.current?.focus();
                }}
              >
                ✕
              </button>
            )}
          </div>
        </div>
      )}

      {/* list */}
      <ul
        ref={listRef}
        className={`list ${editingId ? "is-editing" : ""}`}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); focusMove(1); }
          else if (e.key === "ArrowUp") { e.preventDefault(); focusMove(-1); }
          else if (e.key === "Enter") {
            const el = document.activeElement as HTMLElement | null;
            if (el?.classList.contains("item-body")) (el as HTMLButtonElement).click();
          } else if (e.key === "Escape") {
            setMenuFor(null);
          }
        }}
      >
        {filtered.map((c) => {
          const isActive = c.id === selectedId;
          const isEditing = editingId === c.id;
          const initial = (c.name?.trim?.()[0] || "?").toUpperCase();

        return (
          <li
            key={c.id}
            className={`class-item ${isActive ? "active" : ""} ${isEditing ? "editing" : ""}`}
            title={isActive ? "Selected class" : undefined}
          >
            {!isEditing && (
              <button
                className="item-kebab"
                title="More"
                aria-haspopup="menu"
                aria-expanded={menuFor === c.id}
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuFor(menuFor === c.id ? null : c.id);
                }}
              >
                ⋯
              </button>
            )}

            {isEditing ? (
              <div className="rename-inline">
                <input
                  className="rename-input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveRename(c.id);
                    else if (e.key === "Escape") setEditingId(null);
                  }}
                  autoFocus
                  aria-label="Rename class"
                />
                <div className="rename-actions">
                  <button className="icon-btn ok" title="Save" onClick={() => saveRename(c.id)}>✓</button>
                  <button className="icon-btn" title="Cancel" onClick={() => setEditingId(null)}>✕</button>
                </div>
              </div>
            ) : (
              <button
                className="item-body"
                onClick={() => onSelect(c.id)}
                aria-current={isActive ? "true" : undefined}
              >
                {/* avatar tile appears in collapsed mode */}
                <span className="item-avatar" aria-hidden="true">{initial}</span>
                {/* small dot for expanded mode */}
                <span className="item-dot" aria-hidden="true" />
                <span className="item-name" title={c.name}>{c.name}</span>
              </button>
            )}

            {menuFor === c.id && !collapsed && !isEditing && (
              <div className="kebab-menu" role="menu" aria-label="Class actions">
                <button role="menuitem" onClick={() => { setEditingId(c.id); setEditName(c.name); setMenuFor(null); }}>
                  Rename
                </button>
                <button role="menuitem" className="danger" onClick={() => { onDelete(c.id); setMenuFor(null); }}>
                  Delete
                </button>
              </div>
            )}
          </li>
        );})}

        {/* Empty + not adding */}
        {filtered.length === 0 && !adding && (
          <li className="empty-state">
            <div className="empty-card">
              <div className="empty-title">No classes</div>
              <div className="empty-sub">
                {q ? "No results match your search." : "Create your first class to get started."}
              </div>
            </div>
          </li>
        )}

        {/* Add New Class — LAST item */}
        <li className="add-cta-item">
          {!adding ? (
            <button
              className="add-cta"
              onClick={() => {
                if (collapsed) return setCollapsed(false);
                setAdding(true);
                setTimeout(() => addInputRef.current?.focus(), 0);
              }}
              title={collapsed ? "Expand to add" : "Add New Class"}
              aria-label="Add new class"
            >
              <span className="add-circle">+</span>
              {!collapsed && <span className="add-label">Add New Class</span>}
            </button>
          ) : (
            <div className="add-inline">
              <span className="add-circle small">+</span>
              <input
                ref={addInputRef}
                className="add-input"
                placeholder="Class name"
                value={addingName}
                onChange={(e) => setAddingName(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter"
                    ? confirmCreate()
                    : e.key === "Escape"
                    ? (setAdding(false), setAddingName(""))
                    : null
                }
                aria-label="New class name"
              />
              <button className="btn solid" onClick={confirmCreate}>Add</button>
              <button className="btn ghost" onClick={() => { setAdding(false); setAddingName(""); }}>
                Cancel
              </button>
            </div>
          )}
        </li>
      </ul>
    </aside>
  );
}
