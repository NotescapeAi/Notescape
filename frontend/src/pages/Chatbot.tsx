import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import AppShell from "../layouts/AppShell";
import Button from "../components/Button";
import KebabMenu from "../components/KebabMenu";
import {
  listClasses,
  listFiles,
  chatAsk,
  createChatSession,
  listChatSessions,
  listChatSessionMessages,
  addChatMessages,
  deleteChatSession,
  clearChatSessionMessages,
  updateChatSession,
  type ClassRow,
  type FileRow,
  type ChatSession,
  type ChatMessage,
} from "../lib/api";

type Msg = ChatMessage & { citations?: any };

const MESSAGE_CACHE_PREFIX = "chat_session_messages:";

function buildSessionKey(sessionId: string) {
  return `${MESSAGE_CACHE_PREFIX}${sessionId}`;
}

function loadSessionMessages(sessionId: string | null): Msg[] {
  if (!sessionId || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(buildSessionKey(sessionId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function persistSessionMessages(sessionId: string, messages: Msg[]) {
  if (!sessionId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(buildSessionKey(sessionId), JSON.stringify(messages));
  } catch {
    // ignore quota errors
  }
}

function clearSessionMessagesCache(sessionId: string | null) {
  if (!sessionId || typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(buildSessionKey(sessionId));
  } catch {
    // ignore
  }
}

function generateSessionTitle() {
  try {
    const formatter = new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    return `Chat ${formatter.format(new Date())}`;
  } catch {
    return `Chat ${new Date().toLocaleString()}`;
  }
}

export default function Chatbot() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [classId, setClassId] = useState<number | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [scopeBySession, setScopeBySession] = useState<Record<string, string[]>>({});
  const [showSources, setShowSources] = useState<Record<string, boolean>>({});
  const [files, setFiles] = useState<FileRow[]>([]);
  const [fileSearch, setFileSearch] = useState("");
  const [input, setInput] = useState("");
  const [selectedText, setSelectedText] = useState("");
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [renamingSession, setRenamingSession] = useState<ChatSession | null>(null);
  const [renameInput, setRenameInput] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameLoading, setRenameLoading] = useState(false);
  const [busyAsk, setBusyAsk] = useState(false);
  const [busySessions, setBusySessions] = useState(false);
  const [busyFiles, setBusyFiles] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [confirmDialog, setConfirmDialog] = useState<{ type: "delete" | "clear"; session: ChatSession } | null>(
    null
  );
  const convoRef = useRef<HTMLDivElement | null>(null);
  const placeholderTitlesRef = useRef<Record<string, string>>({});

  const LS_LAST_CLASS = "chat_last_class_id";
  const LS_LAST_SESSION = "chat_last_session_by_class";

  useEffect(() => {
    (async () => {
      const cls = await listClasses();
      setClasses(cls);
      const saved = Number(localStorage.getItem(LS_LAST_CLASS));
      if (!classId && Number.isFinite(saved) && cls.some((c) => c.id === saved)) {
        setClassId(saved);
      }
    })();
  }, []);

  useEffect(() => {
    if (!classId) return;
    localStorage.setItem(LS_LAST_CLASS, String(classId));
  }, [classId]);

  useEffect(() => {
    if (!classId) {
      setSessions([]);
      setActiveSessionId(null);
      setMessages([]);
      setFiles([]);
      return;
    }
    (async () => {
      setBusySessions(true);
      try {
        const sess = await listChatSessions(classId);
        setSessions(sess);
        const fromUrl = searchParams.get("session");
        const stored = JSON.parse(localStorage.getItem(LS_LAST_SESSION) || "{}");
        const preferred = fromUrl || stored[String(classId)];
        const next = sess.find((s) => s.id === preferred)?.id ?? sess[0]?.id ?? null;
        setActiveSessionId(next);
      } finally {
        setBusySessions(false);
      }
    })();
  }, [classId, searchParams]);

  useEffect(() => {
    if (!classId) return;
    (async () => {
      setBusyFiles(true);
      try {
        setFiles(await listFiles(classId));
      } finally {
        setBusyFiles(false);
      }
    })();
  }, [classId]);

  useEffect(() => {
    if (!activeSessionId) {
      setMessages([]);
      return;
    }
    const cached = loadSessionMessages(activeSessionId);
    setMessages(cached.length ? cached : []);
    (async () => {
      try {
        setHistoryError(null);
        const msgs = await listChatSessionMessages(activeSessionId);
        const normalized = (msgs || []).map((m) => ({
          ...m,
          citations: m.citations ?? undefined,
          selected_text: m.selected_text ?? null,
          file_scope: m.file_scope ?? null,
          image_attachment: m.image_attachment ?? null,
        }));
        setMessages(normalized);
        persistSessionMessages(activeSessionId, normalized);
      } catch (err) {
        if (import.meta.env.DEV) {
          console.warn("[chatbot] failed to load history", err);
        }
        const fallback = loadSessionMessages(activeSessionId);
        if (fallback.length) {
          setMessages(fallback);
        }
        setHistoryError("Couldn't load chat history. Try refreshing.");
      }
    })();
    const stored = JSON.parse(localStorage.getItem(LS_LAST_SESSION) || "{}");
    stored[String(classId ?? "")] = activeSessionId;
    localStorage.setItem(LS_LAST_SESSION, JSON.stringify(stored));
    setSearchParams((prev) => {
      prev.set("session", activeSessionId);
      return prev;
    });
  }, [activeSessionId]);

  useEffect(() => {
    if (!isAtBottom) return;
    const el = convoRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, busyAsk, isAtBottom]);

  const scopeFileIds = useMemo(() => {
    if (!activeSessionId) return [];
    return scopeBySession[activeSessionId] ?? [];
  }, [activeSessionId, scopeBySession]);

  const filteredFiles = useMemo(() => {
    const q = fileSearch.trim().toLowerCase();
    if (!q) return files;
    return files.filter((f) => f.filename.toLowerCase().includes(q));
  }, [files, fileSearch]);

  async function startNewSession() {
    if (!classId) return;
    const s = await createChatSession({ class_id: classId, title: generateSessionTitle() });
    setSessions((prev) => [s, ...prev]);
    setActiveSessionId(s.id);
  }

  async function onAsk() {
    if (!classId) {
      alert("Pick a class first.");
      return;
    }
    if (!input.trim()) return;

    setErrorBanner(null);

    const userMsg: Msg = {
      id: crypto.randomUUID?.() ?? String(Date.now()),
      role: "user",
      content: input.trim(),
    };

    let sessionId = activeSessionId;
    if (!sessionId) {
      const placeholderTitle = generateSessionTitle();
      const s = await createChatSession({ class_id: classId, title: placeholderTitle });
      placeholderTitlesRef.current[s.id] = placeholderTitle;
      setSessions((prev) => [s, ...prev]);
      sessionId = s.id;
      setActiveSessionId(s.id);
    }
    setMessages((prev) => {
      const next = [...prev, userMsg];
      persistSessionMessages(sessionId!, next);
      return next;
    });
    setInput("");
    setBusyAsk(true);

    try {
      const question = selectedText
        ? `Selected text:\n"${selectedText}"\n\n${userMsg.content}`
        : userMsg.content;
      const res = await chatAsk({
        class_id: classId,
        question,
        top_k: 8,
        file_ids: scopeFileIds.length ? scopeFileIds : undefined,
      });
      const botMsg: Msg = {
        id: crypto.randomUUID?.() ?? String(Date.now() + 1),
        role: "assistant",
        content: (res.answer || "").trim() || "Not found in the uploaded material.",
        citations: res.citations ?? [],
      };
      setMessages((prev) => {
        const next = [...prev, botMsg];
        persistSessionMessages(sessionId!, next);
        return next;
      });
      const saved = await addChatMessages({
        session_id: sessionId!,
        user_content: userMsg.content,
        assistant_content: botMsg.content,
        citations: res.citations ?? null,
        selected_text: selectedText || null,
        file_scope: scopeFileIds.length ? scopeFileIds : null,
      });
      if (Array.isArray(saved?.messages)) {
        const normalized = saved.messages.map((m) => ({
          ...m,
          citations: m.citations ?? undefined,
          selected_text: m.selected_text ?? null,
          file_scope: m.file_scope ?? null,
          image_attachment: m.image_attachment ?? null,
        }));
        setMessages(normalized);
        persistSessionMessages(sessionId!, normalized);
      }
      setSelectedText("");
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sessionId) return s;
          const placeholder = placeholderTitlesRef.current[sessionId!];
          const snippet = userMsg.content.trim().slice(0, 48) || placeholder || "Chat session";
          if (placeholder && s.title === placeholder) {
            delete placeholderTitlesRef.current[sessionId!];
            return { ...s, title: snippet, updated_at: new Date().toISOString() };
          }
          return { ...s, updated_at: new Date().toISOString() };
        })
      );
    } catch (e: any) {
      if (import.meta.env.DEV) {
        console.warn("[chatbot] failed to save messages", e);
      }
      setErrorBanner("Couldn't save that message. Please try again.");
    } finally {
      setBusyAsk(false);
    }
  }

  async function handleRenameSession() {
    if (!renamingSession) return;
    const nextTitle = renameInput.trim();
    if (!nextTitle) {
      setRenameError("Please provide a name for the chat.");
      return;
    }
    setRenameLoading(true);
    try {
      const updated = await updateChatSession(renamingSession.id, { title: nextTitle });
      setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      delete placeholderTitlesRef.current[updated.id];
      setRenamingSession(null);
      setRenameError(null);
    } catch (err) {
      console.error("[chatbot] rename failed", err);
      setRenameError("Could not rename chat. Try again.");
    } finally {
      setRenameLoading(false);
    }
  }

  async function onConfirmSessionAction() {
    if (!confirmDialog || !classId) return;
    const { type, session } = confirmDialog;
    try {
      if (type === "delete") {
        await deleteChatSession(session.id, classId);
        setSessions((prev) => prev.filter((s) => s.id !== session.id));
        if (activeSessionId === session.id) {
          const next = sessions.find((s) => s.id !== session.id)?.id ?? null;
          setActiveSessionId(next);
          if (!next) setMessages([]);
        }
        clearSessionMessagesCache(session.id);
        delete placeholderTitlesRef.current[session.id];
      } else {
        await clearChatSessionMessages(session.id);
        if (activeSessionId === session.id) setMessages([]);
        clearSessionMessagesCache(session.id);
        delete placeholderTitlesRef.current[session.id];
      }
    } catch {
      setErrorBanner(type === "delete" ? "Couldn't delete chat. Try again." : "Couldn't clear messages. Try again.");
    } finally {
      setConfirmDialog(null);
    }
  }

  function toggleFileScope(fileId: string) {
    if (!activeSessionId) return;
    setScopeBySession((prev) => {
      const next = new Set(prev[activeSessionId] ?? []);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return { ...prev, [activeSessionId]: Array.from(next) };
    });
  }

  function toggleSources() {
    if (!activeSessionId) return;
    setShowSources((prev) => ({ ...prev, [activeSessionId]: !(prev[activeSessionId] ?? false) }));
  }

  const sourcesEnabled = activeSessionId ? showSources[activeSessionId] ?? false : false;
  const statusLabel = (status?: string | null) => {
    const s = (status || "UPLOADED").toUpperCase();
    if (s === "FAILED") return "Failed";
    if (s === "INDEXED") return "Ready";
    return "Processing";
  };

  return (
    <AppShell title="Chat">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-lg font-semibold text-main">Chat</div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={classId ?? ""}
              onChange={(e) => setClassId(e.target.value ? Number(e.target.value) : null)}
              className="h-10 rounded-2xl border border-token surface px-3 text-sm text-muted"
            >
              <option value="">Select class</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <Button variant="primary" disabled={!classId} onClick={startNewSession}>
              New chat
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)_320px] gap-6">
          <aside className="rounded-[24px] surface p-4 shadow-[0_12px_30px_rgba(15,16,32,0.08)]">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">Sessions</h2>
              {busySessions && <span className="text-xs text-muted">Loading...</span>}
            </div>
            <div className="space-y-2 max-h-[70vh] overflow-auto">
              {sessions.length === 0 ? (
                <div className="text-sm text-muted">No sessions yet.</div>
              ) : (
                sessions.map((s) => (
                  <div
                    key={s.id}
                    className={`flex items-start justify-between gap-2 rounded-xl border px-3 py-2 text-left text-sm ${
                      s.id === activeSessionId
                        ? "border-[var(--primary)] surface-2 font-semibold"
                        : "border-token hover:border-token"
                    }`}
                  >
                    <button onClick={() => setActiveSessionId(s.id)} className="flex-1 text-left">
                      <div className="truncate">{s.title || "Chat session"}</div>
                      <div className="text-xs text-muted truncate">
                        {new Date(s.updated_at || s.created_at || "").toLocaleString()}
                      </div>
                    </button>
                    <KebabMenu
                      items={[
                        {
                          label: "Rename chat",
                          onClick: () => {
                            setRenameInput(s.title ?? "");
                            setRenameError(null);
                            setRenameLoading(false);
                            setRenamingSession(s);
                          },
                        },
                        { label: "Clear messages", onClick: () => setConfirmDialog({ type: "clear", session: s }) },
                        { label: "Delete chat", onClick: () => setConfirmDialog({ type: "delete", session: s }) },
                      ]}
                    />
                  </div>
                ))
              )}
            </div>
          </aside>

          <section className="rounded-[24px] surface shadow-[0_12px_30px_rgba(15,16,32,0.08)] flex flex-col h-[70vh] min-h-0">
            <div className="border-b border-token px-4 py-3 flex items-center justify-between">
              <div className="text-sm font-semibold">Conversation</div>
              <label className="flex items-center gap-2 text-xs text-muted">
                <input type="checkbox" checked={sourcesEnabled} onChange={toggleSources} />
                Show citations
              </label>
            </div>
            <div
              ref={convoRef}
              className="flex-1 min-h-0 overflow-auto p-4 space-y-4"
              onMouseUp={() => {
                const sel = window.getSelection()?.toString().trim() || "";
                setSelectedText(sel.length > 0 ? sel : "");
              }}
              onScroll={() => {
                const el = convoRef.current;
                if (!el) return;
                const threshold = 80;
                const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
                setIsAtBottom(atBottom);
              }}
            >
              {errorBanner && (
                <div className="rounded-xl border border-accent bg-accent-soft px-3 py-2 text-xs text-accent">
                  {errorBanner}
                </div>
              )}
              {historyError && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {historyError}
                </div>
              )}
              {messages.length === 0 ? (
                <div className="text-sm text-muted">Ask anything about your class materials.</div>
              ) : (
                messages.map((m) => {
                  const show = sourcesEnabled && m.role === "assistant" && (m.citations?.length ?? 0) > 0;
                  return (
                    <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[75%] rounded-2xl border px-4 py-3 text-sm leading-6 ${
                          m.role === "user"
                            ? "bg-inverse text-inverse border-strong"
                            : "surface border-token"
                        }`}
                      >
                        {m.selected_text && (
                          <div
                            className={`mb-2 rounded-lg border px-3 py-2 text-xs ${
                              m.role === "user"
                                ? "border-strong surface-tint text-inverse opacity-80"
                                : "border-token surface-2 text-muted"
                            }`}
                          >
                            <div className="text-[10px] uppercase tracking-wide opacity-70">Selected text</div>
                            <div className="mt-1 whitespace-pre-wrap">{m.selected_text}</div>
                          </div>
                        )}
                        {m.image_attachment?.data_url && (
                          <div className="mb-2">
                            <img
                              src={m.image_attachment.data_url}
                              alt="Snippet"
                              className="max-h-40 rounded-lg border border-token object-contain"
                            />
                          </div>
                        )}
                        <div className="whitespace-pre-wrap">{m.content}</div>
                        {show && (
                          <div className="mt-3 border-t border-token pt-2 text-xs text-muted">
                          {(m.citations ?? []).slice(0, 6).map((c: any, idx: number) => (
                            <div key={`${c?.chunk_id ?? idx}`}>
                              {c?.filename ?? "Source"}
                              {c?.page_start ? ` (p${c.page_start}-${c.page_end ?? c.page_start})` : ""}
                            </div>
                          ))}
                          {m.selected_text && (
                            <div className="mt-2 text-[11px] text-muted">
                              Selected: {String(m.selected_text).slice(0, 160)}
                            </div>
                          )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              {busyAsk && <div className="text-xs text-muted">Thinking...</div>}
            </div>
            <div className="border-t border-token p-4">
              {selectedText && (
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-token surface-2 px-3 py-1 text-xs text-muted">
                  Using selected text
                  <button
                    className="text-muted"
                    onClick={() => setSelectedText("")}
                    aria-label="Clear selected text"
                  >
                    Clear
                  </button>
                </div>
              )}
              <div className="flex gap-3">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  className="min-h-[52px] flex-1 resize-none rounded-xl border border-token surface px-3 py-2 text-sm text-main placeholder:text-muted caret-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                  placeholder="Ask about your notes..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      onAsk();
                    }
                  }}
                />
                <Button
                  variant="primary"
                  onClick={onAsk}
                  disabled={!classId || busyAsk || !input.trim()}
                  className="h-12 px-4"
                >
                  Send
                </Button>
              </div>
              <div className="mt-2 text-xs text-muted">Enter to send, Shift+Enter for newline.</div>
            </div>
          </section>

          <aside className="rounded-[24px] surface p-4 shadow-[0_12px_30px_rgba(15,16,32,0.08)]">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">File scope</h2>
              {busyFiles && <span className="text-xs text-muted">Loading...</span>}
            </div>
            <input
              value={fileSearch}
              onChange={(e) => setFileSearch(e.target.value)}
              placeholder="Search files"
              className="mb-3 h-9 w-full rounded-lg border border-token px-3 text-sm"
            />
            <div className="space-y-2 max-h-[60vh] overflow-auto">
              {classId == null ? (
                <div className="text-sm text-muted">Select a class to view files.</div>
              ) : filteredFiles.length === 0 ? (
                <div className="text-sm text-muted">No files found.</div>
              ) : (
                filteredFiles.map((f) => {
                  const checked = scopeFileIds.includes(f.id);
                  return (
                    <button
                      key={f.id}
                      onClick={() => toggleFileScope(f.id)}
                      className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${
                        checked ? "border-[var(--primary)] surface-2" : "border-token hover:border-token"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="truncate font-medium">{f.filename}</span>
                        <span className="text-xs text-muted">
                          {(f.filename.split(".").pop() || "").toUpperCase()}
                        </span>
                      </div>
                      <div className="text-xs text-muted">{statusLabel(f.status)}</div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>
        </div>
        {confirmDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4">
            <div className="w-full max-w-sm rounded-2xl surface p-5 shadow-xl">
              <div className="text-lg font-semibold text-main">
                {confirmDialog.type === "delete" ? "Delete this chat?" : "Clear messages?"}
              </div>
              <div className="mt-2 text-sm text-muted">
                {confirmDialog.type === "delete"
                  ? "This will permanently delete the chat and its messages. This can't be undone."
                  : "This will remove all messages in this chat. You can't undo this."}
              </div>
              <div className="mt-4 flex items-center justify-end gap-2">
                <Button onClick={() => setConfirmDialog(null)}>Cancel</Button>
                <Button variant="primary" onClick={onConfirmSessionAction}>
                  {confirmDialog.type === "delete" ? "Delete" : "Clear"}
                </Button>
              </div>
            </div>
          </div>
        )}
        {renamingSession && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4">
            <div className="w-full max-w-sm rounded-2xl surface p-5 shadow-xl">
              <div className="text-lg font-semibold text-main">Rename chat</div>
              <p className="mt-1 text-xs text-muted">
                Give this conversation a clearer name so you can find it later.
              </p>
              <input
                value={renameInput}
                onChange={(e) => setRenameInput(e.target.value)}
                placeholder="E.g. Biology flashcards Q&A"
                className="mt-4 w-full rounded-xl border border-token surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              />
              {renameError && <div className="mt-2 text-xs text-red-600">{renameError}</div>}
              <div className="mt-4 flex items-center justify-end gap-2">
                <Button
                  onClick={() => {
                    setRenamingSession(null);
                    setRenameError(null);
                  }}
                  disabled={renameLoading}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleRenameSession}
                  disabled={renameLoading || !renameInput.trim()}
                >
                  {renameLoading ? "Saving..." : "Rename"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

