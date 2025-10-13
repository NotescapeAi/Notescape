import { useEffect, useRef, useState } from "react"
import type { ClassRow } from "../lib/api"
import { Link } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { Plus, MoreVertical, ChevronLeft, ChevronRight, Trash2, Edit2 } from "lucide-react"
import "./classSidebar.css"
type Props = {
  items: ClassRow[]
  selectedId: number | null
  onSelect: (id: number) => void
  onCreate: (name: string) => Promise<void> | void
  onRename: (id: number, name: string) => Promise<void> | void
  onDelete: (id: number) => Promise<void> | void
}

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
  )
  useEffect(() => {
    localStorage.setItem("sidebar_collapsed", collapsed ? "1" : "0")
  }, [collapsed])

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState("")
  const [menuFor, setMenuFor] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)
  const [addingName, setAddingName] = useState("")
  const addInputRef = useRef<HTMLInputElement>(null)

  // Close menu when clicking outside
  useEffect(() => {
    const h = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!t.closest?.(".class-item") && !t.closest?.(".menu-box")) setMenuFor(null)
    }
    window.addEventListener("click", h)
    return () => window.removeEventListener("click", h)
  }, [])

  async function saveRename(id: number) {
    const name = editName.trim()
    setMenuFor(null)
    if (!name) return setEditingId(null)
    await onRename(id, name)
    setEditingId(null)
  }

  async function confirmCreate() {
    const name = addingName.trim()
    if (!name) return
    await onCreate(name)
    setAdding(false)
    setAddingName("")
  }

  return (
    <motion.aside
      initial={{ width: collapsed ? 80 : 260 }}
      animate={{ width: collapsed ? 80 : 260 }}
      transition={{ duration: 0.3 }}
      className="relative h-screen bg-gradient-to-b from-violet-700 to-violet-900 text-white shadow-xl flex flex-col"
    >
      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="absolute -right-3 top-6 bg-white text-violet-700 p-1.5 rounded-full shadow hover:bg-violet-50"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
      </button>

      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-6 pb-4 border-b border-white/20">
        <Link to="/dashboard" title="Back to Dashboard">
          <svg
            className="w-5 h-5 text-white/80 hover:text-white"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        {!collapsed && <h2 className="font-semibold text-lg tracking-wide">Classes</h2>}
      </div>

      {/* Class list */}
      <ul className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-violet-500 scrollbar-track-transparent">
        {items.map((c) => {
          const isActive = c.id === selectedId
          const isEditing = editingId === c.id

          return (
            <li
              key={c.id}
              className={`group class-item relative ${
                isActive ? "bg-white/10" : "hover:bg-white/5"
              } transition-colors`}
            >
              {!isEditing && (
                <button
                  className="absolute right-3 top-2 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenuFor(menuFor === c.id ? null : c.id)
                  }}
                  title="Options"
                >
                  <MoreVertical size={18} className="text-white/80" />
                </button>
              )}

              {isEditing ? (
                <div className="px-4 py-2">
                  <input
                    className="w-full rounded-lg px-2 py-1 bg-white/90 text-gray-800 text-sm focus:ring-2 focus:ring-violet-400 outline-none"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveRename(c.id)
                      else if (e.key === "Escape") setEditingId(null)
                    }}
                    onBlur={() => saveRename(c.id)}
                    autoFocus
                  />
                </div>
              ) : (
                <button
                  onClick={() => onSelect(c.id)}
                  className={`w-full text-left px-4 py-3 font-medium text-sm ${
                    isActive ? "text-white" : "text-white/80"
                  }`}
                >
                  {collapsed ? (
                    <div className="truncate text-center">{c.name.charAt(0)}</div>
                  ) : (
                    <span className="truncate">{c.name}</span>
                  )}
                </button>
              )}

              {/* Context Menu */}
              <AnimatePresence>
                {menuFor === c.id && !collapsed && !isEditing && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.15 }}
                    className="menu-box absolute right-2 top-8 bg-white text-gray-800 rounded-lg shadow-lg overflow-hidden z-10"
                  >
                    <button
                      onClick={() => {
                        setEditingId(c.id)
                        setEditName(c.name)
                        setMenuFor(null)
                      }}
                      className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 w-full"
                    >
                      <Edit2 size={14} /> Rename
                    </button>
                    <button
                      onClick={() => {
                        onDelete(c.id)
                        setMenuFor(null)
                      }}
                      className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 w-full"
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          )
        })}
      </ul>

      {/* Add new class */}
      <div className="p-4 border-t border-white/20">
        {!adding ? (
          <button
            onClick={() => {
              if (collapsed) return setCollapsed(false)
              setAdding(true)
              setTimeout(() => addInputRef.current?.focus(), 0)
            }}
            className="flex items-center gap-2 text-sm font-medium text-white/90 hover:text-white transition-colors"
          >
            <Plus size={16} /> {!collapsed && "Add New Class"}
          </button>
        ) : (
          <div className="space-y-2">
            <input
              ref={addInputRef}
              className="w-full rounded-lg px-2 py-1 text-gray-800 text-sm focus:ring-2 focus:ring-violet-400 outline-none"
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
            />
            <div className="flex gap-2">
              <button
                onClick={confirmCreate}
                className="bg-white text-violet-700 font-semibold text-sm px-3 py-1.5 rounded-lg hover:bg-violet-100"
              >
                Add
              </button>
              <button
                onClick={() => {
                  setAdding(false)
                  setAddingName("")
                }}
                className="text-white/80 text-sm hover:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </motion.aside>
  )
}
