import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import AppSidebar from "../components/AppSidebar";
import PageHeader from "../components/PageHeader";
import Button from "../components/Button";
import {
  listClasses,
  listFiles,
  chatAsk,
  createChatSession,
  listChatSessions,
  listChatSessionMessages,
  addChatMessages,
  type ClassRow,
  type FileRow,
  type ChatSession,
  type ChatMessage,
} from "../lib/api";

type Msg = ChatMessage & { citations?: any };

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
  const [busyAsk, setBusyAsk] = useState(false);
  const [busySessions, setBusySessions] = useState(false);
  const [busyFiles, setBusyFiles] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const convoRef = useRef<HTMLDivElement | null>(null);

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
    setMessages([]);
    (async () => {
      const msgs = await listChatSessionMessages(activeSessionId);
      const normalized = (msgs || []).map((m) => ({
        ...m,
        citations: m.citations ?? undefined,
        selected_text: m.selected_text ?? null,
        file_scope: m.file_scope ?? null,
        image_attachment: m.image_attachment ?? null,
      }));
      setMessages(normalized);
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
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, busyAsk]);

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
    const s = await createChatSession({ class_id: classId, title: "New chat" });
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
      const title = userMsg.content.slice(0, 48);
      const s = await createChatSession({ class_id: classId, title });
      setSessions((prev) => [s, ...prev]);
      sessionId = s.id;
      setActiveSessionId(s.id);
    }
    setMessages((prev) => [...prev, userMsg]);
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
      setMessages((prev) => [...prev, botMsg]);
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
      }
      setSelectedText("");
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sessionId) return s;
          const nextTitle = s.title === "New chat" ? userMsg.content.slice(0, 48) : s.title;
          return { ...s, title: nextTitle, updated_at: new Date().toISOString() };
        })
      );
    } catch (e: any) {
      setErrorBanner("Couldn't save that message. Please try again.");
    } finally {
      setBusyAsk(false);
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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      <AppSidebar />
      <main className="flex-1 p-6 lg:p-8">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6">
          <PageHeader
            title="Class chat"
            subtitle="Sessions are saved per class and user."
            actions={
              <>
                <select
                  value={classId ?? ""}
                  onChange={(e) => setClassId(e.target.value ? Number(e.target.value) : null)}
                  className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm"
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
              </>
            }
          />

          <div className="grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)_320px] gap-6">
          <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">Sessions</h2>
              {busySessions && <span className="text-xs text-slate-400">Loading...</span>}
            </div>
            <div className="space-y-2 max-h-[70vh] overflow-auto">
              {sessions.length === 0 ? (
                <div className="text-sm text-slate-500">No sessions yet.</div>
              ) : (
                sessions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setActiveSessionId(s.id)}
                    className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${
                      s.id === activeSessionId
                        ? "border-slate-900 bg-slate-50 font-semibold"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="truncate">{s.title || "Chat session"}</div>
                    <div className="text-xs text-slate-400 truncate">
                      {new Date(s.updated_at || s.created_at || "").toLocaleString()}
                    </div>
                  </button>
                ))
              )}
            </div>
          </aside>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm flex flex-col min-h-[70vh]">
            <div className="border-b border-slate-200 px-4 py-3 flex items-center justify-between">
              <div className="text-sm font-semibold">Conversation</div>
              <label className="flex items-center gap-2 text-xs text-slate-500">
                <input type="checkbox" checked={sourcesEnabled} onChange={toggleSources} />
                Show citations
              </label>
            </div>
            <div
              ref={convoRef}
              className="flex-1 overflow-auto p-4 space-y-4"
              onMouseUp={() => {
                const sel = window.getSelection()?.toString().trim() || "";
                setSelectedText(sel.length > 0 ? sel : "");
              }}
            >
              {errorBanner && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {errorBanner}
                </div>
              )}
              {messages.length === 0 ? (
                <div className="text-sm text-slate-500">Ask anything about your class materials.</div>
              ) : (
                messages.map((m) => {
                  const show = sourcesEnabled && m.role === "assistant" && (m.citations?.length ?? 0) > 0;
                  return (
                    <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[75%] rounded-2xl border px-4 py-3 text-sm leading-6 ${
                          m.role === "user"
                            ? "bg-slate-900 text-white border-slate-900"
                            : "bg-white border-slate-200"
                        }`}
                      >
                        {m.selected_text && (
                          <div
                            className={`mb-2 rounded-lg border px-3 py-2 text-xs ${
                              m.role === "user"
                                ? "border-slate-700/60 bg-slate-800/60 text-slate-100"
                                : "border-slate-200 bg-slate-50 text-slate-600"
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
                              className="max-h-40 rounded-lg border border-slate-200 object-contain"
                            />
                          </div>
                        )}
                        <div className="whitespace-pre-wrap">{m.content}</div>
                        {show && (
                          <div className="mt-3 border-t border-slate-200 pt-2 text-xs text-slate-500">
                          {(m.citations ?? []).slice(0, 6).map((c: any, idx: number) => (
                            <div key={`${c?.chunk_id ?? idx}`}>
                              {c?.filename ?? "Source"}
                              {c?.page_start ? ` (p${c.page_start}-${c.page_end ?? c.page_start})` : ""}
                            </div>
                          ))}
                          {m.selected_text && (
                            <div className="mt-2 text-[11px] text-slate-400">
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
              {busyAsk && <div className="text-xs text-slate-400">Thinking...</div>}
              <div ref={endRef} />
            </div>
            <div className="border-t border-slate-200 p-4">
              {selectedText && (
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500">
                  Using selected text
                  <button
                    className="text-slate-600"
                    onClick={() => setSelectedText("")}
                    aria-label="Clear selected text"
                  >
                    ×
                  </button>
                </div>
              )}
              <div className="flex gap-3">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  className="min-h-[52px] flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20"
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
              <div className="mt-2 text-xs text-slate-400">Enter to send, Shift+Enter for newline.</div>
            </div>
          </section>

          <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">File scope</h2>
              {busyFiles && <span className="text-xs text-slate-400">Loading...</span>}
            </div>
            <input
              value={fileSearch}
              onChange={(e) => setFileSearch(e.target.value)}
              placeholder="Search files"
              className="mb-3 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm"
            />
            <div className="space-y-2 max-h-[60vh] overflow-auto">
              {classId == null ? (
                <div className="text-sm text-slate-500">Select a class to view files.</div>
              ) : filteredFiles.length === 0 ? (
                <div className="text-sm text-slate-500">No files found.</div>
              ) : (
                filteredFiles.map((f) => {
                  const checked = scopeFileIds.includes(f.id);
                  return (
                    <button
                      key={f.id}
                      onClick={() => toggleFileScope(f.id)}
                      className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${
                        checked ? "border-slate-900 bg-slate-50" : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="truncate font-medium">{f.filename}</span>
                        <span className="text-xs text-slate-400">
                          {(f.filename.split(".").pop() || "").toUpperCase()}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400">{f.status ?? "UPLOADED"}</div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>
          </div>
        </div>
      </main>
    </div>
  );
}
