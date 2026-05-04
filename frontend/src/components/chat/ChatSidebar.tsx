import { MessageSquare, Plus, Trash2, Edit2, MoreVertical, MessageCircle } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { ChatSession } from "../../lib/api";

interface ChatSidebarProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onDeleteSession: (id: string) => void;
  onRenameSession: (id: string, newTitle: string) => void;
  isLoading: boolean;
}

export default function ChatSidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  onRenameSession,
  isLoading,
}: ChatSidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpenId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function startEditing(session: ChatSession) {
    setEditingId(session.id);
    setEditValue(session.title);
    setMenuOpenId(null);
  }

  function saveEdit() {
    if (editingId && editValue.trim()) {
      onRenameSession(editingId, editValue.trim());
    }
    setEditingId(null);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") saveEdit();
    if (e.key === "Escape") setEditingId(null);
  }

  // Group sessions by date
  const groups = sessions.reduce((acc, session) => {
    const dateStr = session.updated_at || session.created_at || new Date().toISOString();
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    let label = "Older";
    if (diffDays === 0) label = "Today";
    else if (diffDays === 1) label = "Yesterday";
    else if (diffDays < 7) label = "Previous 7 Days";
    else if (diffDays < 30) label = "Previous 30 Days";

    if (!acc[label]) acc[label] = [];
    acc[label].push(session);
    return acc;
  }, {} as Record<string, ChatSession[]>);

  const groupOrder = ["Today", "Yesterday", "Previous 7 Days", "Previous 30 Days", "Older"];

  return (
    <div className="flex h-full flex-col bg-[var(--surface)]">
      <div className="shrink-0 p-3">
        <button
          onClick={onNewChat}
          className="flex h-9 w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--primary)] px-3 text-[13px] font-semibold text-[var(--text-inverse)] shadow-[var(--shadow-xs)] transition hover:bg-[var(--primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <Plus size={16} />
          <span>New chat</span>
        </button>
      </div>

      <div className="ns-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {isLoading && sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-[var(--text-muted)]">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
            <span className="mt-2 text-xs">Loading chats…</span>
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-10 text-center text-[var(--text-muted)]">
            <MessageSquare size={28} className="mb-2 opacity-25" />
            <p className="text-xs font-medium text-[var(--text-secondary)]">No chats yet</p>
            <p className="mt-0.5 text-[11px] text-[var(--text-muted-soft)]">
              Start a new conversation.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {groupOrder.map((label) => {
              const groupSessions = groups[label];
              if (!groupSessions?.length) return null;

              return (
                <div key={label}>
                  <div className="mb-1.5 px-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted-soft)]">
                    {label}
                  </div>
                  <ul className="space-y-0.5">
                    {groupSessions.map((session) => {
                      const isActive = activeSessionId === session.id;
                      return (
                        <li
                          key={session.id}
                          className={`group relative flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-sm transition ${
                            isActive
                              ? "bg-[var(--primary-soft)] text-[var(--primary)]"
                              : "text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text-main)]"
                          }`}
                        >
                          <MessageCircle
                            size={14}
                            className={`shrink-0 ${isActive ? "text-[var(--primary)]" : "opacity-55"}`}
                          />

                          {editingId === session.id ? (
                            <input
                              ref={editInputRef}
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={saveEdit}
                              onKeyDown={handleKeyDown}
                              className="h-6 min-w-0 flex-1 rounded-[var(--radius-xs)] border border-[color-mix(in_srgb,var(--primary)_50%,var(--border))] bg-[var(--surface)] px-1.5 text-[12.5px] outline-none focus:ring-2 focus:ring-[var(--ring)]"
                            />
                          ) : (
                            <button
                              onClick={() => onSelectSession(session.id)}
                              className={`min-w-0 flex-1 truncate text-left text-[13px] ${
                                isActive ? "font-semibold" : "font-medium"
                              }`}
                              title={session.title}
                            >
                              {session.title}
                            </button>
                          )}

                          {/* Kebab menu — visible on hover or active */}
                          {!editingId && (
                            <div className={`relative shrink-0 ${isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"} transition-opacity`}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMenuOpenId(menuOpenId === session.id ? null : session.id);
                                }}
                                className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-xs)] text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text-main)]"
                                aria-label="Chat actions"
                                title="More"
                              >
                                <MoreVertical size={14} />
                              </button>

                              {menuOpenId === session.id && (
                                <div
                                  ref={menuRef}
                                  className="absolute right-0 top-6 z-20 w-36 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-1 shadow-[var(--shadow-elevated)]"
                                >
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      startEditing(session);
                                    }}
                                    className="flex w-full items-center gap-2 rounded-[var(--radius-xs)] px-2 py-1.5 text-left text-xs text-[var(--text-main)] hover:bg-[var(--surface-2)]"
                                  >
                                    <Edit2 size={12} /> Rename
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onDeleteSession(session.id);
                                      setMenuOpenId(null);
                                    }}
                                    className="flex w-full items-center gap-2 rounded-[var(--radius-xs)] px-2 py-1.5 text-left text-xs text-[var(--danger)] hover:bg-[var(--danger-soft)]"
                                  >
                                    <Trash2 size={12} /> Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
