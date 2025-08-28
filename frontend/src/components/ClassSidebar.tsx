import { useEffect, useRef, useState } from "react";
import type { ClassRow } from "../lib/api";
import "./classSidebar.css";
import { Link } from "react-router-dom";

type Props = {
  items: ClassRow[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onCreate: (name: string) => Promise<void> | void;
  onRename: (id: number, name: string) => Promise<void> | void;
  onDelete: (id: number) => Promise<void> | void;
};

export default function ClassSidebar({
  items, selectedId, onSelect, onCreate, onRename, onDelete,
}: Props) {
  const [collapsed, setCollapsed] = useState<boolean>(() => localStorage.getItem("sidebar_collapsed") === "1");
  useEffect(() => localStorage.setItem("sidebar_collapsed", collapsed ? "1" : "0"), [collapsed]);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [menuFor, setMenuFor] = useState<number | null>(null);

  // add-new (appears at end of list)
  const [adding, setAdding] = useState(false);
  const [addingName, setAddingName] = useState("");
  const addInputRef = useRef<HTMLInputElement>(null);

  // close kebab on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest?.(".class-item") && !t.closest?.(".kebab-menu")) setMenuFor(null);
    };
    window.addEventListener("click", h);
    return () => window.removeEventListener("click", h);
  }, []);

  async function saveRename(id: number) {
    const name = editName.trim();
    if (!name) { setEditingId(null); return; }
    await onRename(id, name);
    setEditingId(null);
  }
  async function confirmCreate() {
    const name = addingName.trim();
    if (!name) return;
    await onCreate(name);
    setAdding(false);
    setAddingName("");
  }

  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      {/* floating collapse handle, centered */}
      <button
        className={`collapse-fab ${collapsed ? "is-collapsed" : ""}`}
        onClick={() => setCollapsed(v => !v)}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? "»" : "«"}
      </button>

      <div className="sidebar-header"> 
         {/* ⬇️ Arrow-only back button */}
    <Link
      to="/dashboard"
      className="back-only"
      title="Back to Dashboard"
      aria-label="Back to Dashboard"
    >
      <svg className="backicon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </Link>

        {!collapsed && <h2 className="title">Classes</h2>}
      </div>


      
      <ul className="list">
      



        {items.map((c) => {
          const isActive = c.id === selectedId;
          const isEditing = editingId === c.id;

          return (
            <li key={c.id} className={`class-item ${isActive ? "active" : ""}`}>
              {/* hover-only controls */}
              <button className="item-x" title="Delete" onClick={() => onDelete(c.id)}>×</button>
              <button
                className="item-kebab"
                title="More"
                onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === c.id ? null : c.id); }}
              >⋯</button>

              {isEditing ? (
                <div className="edit-row">
                  <input
                    className="edit-input"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => (e.key === "Enter" ? saveRename(c.id) : e.key === "Escape" ? setEditingId(null) : null)}
                    autoFocus
                  />
                  <button className="btn sm solid" onClick={() => saveRename(c.id)}>Save</button>
                  <button className="btn sm ghost" onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              ) : (
                <button className="item-body" onClick={() => onSelect(c.id)}>
                  <span className="item-name">{c.name}</span>
                </button>
              )}

              {menuFor === c.id && !collapsed && !isEditing && (
                <div className="kebab-menu">
                  <button onClick={() => { setEditingId(c.id); setEditName(c.name); setMenuFor(null); }}>Rename</button>
                  <button className="danger" onClick={() => { onDelete(c.id); setMenuFor(null); }}>Delete</button>
                </div>
              )}
            </li>
          );
        })}

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
                onKeyDown={(e) => (e.key === "Enter" ? confirmCreate() : e.key === "Escape" ? (setAdding(false), setAddingName("")) : null)}
              />
              <button className="btn solid" onClick={confirmCreate}>Add</button>
              <button className="btn ghost" onClick={() => { setAdding(false); setAddingName(""); }}>Cancel</button>
            </div>
          )}
        </li>
      </ul>
    </aside>
  );
}
