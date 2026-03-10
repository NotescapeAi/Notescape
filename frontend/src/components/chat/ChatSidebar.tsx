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
      <div className="p-3">
        <button
          onClick={onNewChat}
          className="flex w-full items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2.5 text-sm font-semibold text-[var(--text-main)] transition-all hover:border-[var(--primary)] hover:shadow-sm active:scale-[0.98]"
        >
          <Plus size={18} className="text-[var(--primary)]" />
          <span>New Chat</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {isLoading && sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-[var(--text-secondary)]">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
            <span className="mt-2 text-xs">Loading chats...</span>
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center text-[var(--text-secondary)]">
            <MessageSquare size={32} className="mb-2 opacity-20" />
            <p className="text-xs">No conversations yet.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {groupOrder.map((label) => {
              const groupSessions = groups[label];
              if (!groupSessions?.length) return null;

              return (
                <div key={label}>
                  <div className="mb-2 px-2 text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] opacity-80">
                    {label}
                  </div>
                  <div className="space-y-1">
                    {groupSessions.map((session) => (
                      <div
                        key={session.id}
                        className={`group relative flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                          activeSessionId === session.id
                            ? "bg-[var(--surface-2)] text-[var(--text-main)] font-medium"
                            : "text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-main)]"
                        }`}
                      >
                        <MessageCircle size={14} className={`flex-shrink-0 ${activeSessionId === session.id ? "text-[var(--primary)]" : "opacity-50"}`} />
                        
                        {editingId === session.id ? (
                          <input
                            ref={editInputRef}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={saveEdit}
                            onKeyDown={handleKeyDown}
                            className="h-6 min-w-0 flex-1 rounded-md border border-[var(--primary)] bg-[var(--bg-page)] px-1.5 text-xs outline-none"
                          />
                        ) : (
                          <button
                            onClick={() => onSelectSession(session.id)}
                            className="flex-1 min-w-0 text-left truncate"
                            title={session.title}
                          >
                            {session.title}
                          </button>
                        )}

                        {/* Kebab Menu */}
                        {activeSessionId === session.id && !editingId && (
                          <div className="relative flex-shrink-0">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setMenuOpenId(menuOpenId === session.id ? null : session.id);
                              }}
                              className="rounded-md p-0.5 text-[var(--text-secondary)] hover:bg-[var(--bg-page)] hover:text-[var(--text-main)]"
                            >
                              <MoreVertical size={14} />
                            </button>

                            {menuOpenId === session.id && (
                              <div
                                ref={menuRef}
                                className="absolute right-0 top-6 z-20 w-32 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-lg"
                              >
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    startEditing(session);
                                  }}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[var(--surface-2)]"
                                >
                                  <Edit2 size={12} /> Rename
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDeleteSession(session.id);
                                    setMenuOpenId(null);
                                  }}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-red-500 hover:bg-[var(--surface-2)]"
                                >
                                  <Trash2 size={12} /> Delete
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
