import { useEffect, useMemo, useRef, useState } from "react";
import AppSidebar from "../components/AppSidebar";
import {
  listClasses,
  listFiles,
  chatAsk,
  createChatSession,
  listChatSessions,
  getChatSession,
  addChatMessages,
  type ClassRow,
  type FileRow,
  type ChatSession,
  type ChatMessage,
} from "../lib/api";

type Msg = ChatMessage & { citations?: any };

export default function Chatbot() {
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
  const [busyAsk, setBusyAsk] = useState(false);
  const [busySessions, setBusySessions] = useState(false);
  const [busyFiles, setBusyFiles] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    (async () => {
      setClasses(await listClasses());
    })();
  }, []);

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
        setActiveSessionId(sess[0]?.id ?? null);
      } finally {
        setBusySessions(false);
      }
    })();
  }, [classId]);

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
    (async () => {
      const detail = await getChatSession(activeSessionId);
      const msgs = (detail.messages || []).map((m) => ({
        ...m,
        citations: m.citations ?? undefined,
      }));
      setMessages(msgs);
    })();
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

    let sessionId = activeSessionId;
    if (!sessionId) {
      const s = await createChatSession({ class_id: classId, title: "New chat" });
      setSessions((prev) => [s, ...prev]);
      sessionId = s.id;
      setActiveSessionId(s.id);
    }

    const userMsg: Msg = {
      id: crypto.randomUUID?.() ?? String(Date.now()),
      role: "user",
      content: input.trim(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setBusyAsk(true);

    try {
      const res = await chatAsk({
        class_id: classId,
        question: userMsg.content,
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
      await addChatMessages({
        session_id: sessionId!,
        user_content: userMsg.content,
        assistant_content: botMsg.content,
        citations: res.citations ?? null,
      });
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, updated_at: new Date().toISOString() } : s))
      );
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID?.() ?? String(Date.now() + 2),
          role: "assistant",
          content: e?.message ?? "Chat failed",
        },
      ]);
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
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Class Chat</h1>
            <p className="text-sm text-slate-500">Sessions are saved per class and user.</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={classId ?? ""}
              onChange={(e) => setClassId(e.target.value ? Number(e.target.value) : null)}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm"
            >
              <option value="">Select class</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              onClick={startNewSession}
              disabled={!classId}
              className="h-10 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
            >
              New chat
            </button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)_320px] gap-6">
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
                    <div className="truncate">{s.title}</div>
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
            <div className="flex-1 overflow-auto p-4 space-y-4">
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
                        <div className="whitespace-pre-wrap">{m.content}</div>
                        {show && (
                          <div className="mt-3 border-t border-slate-200 pt-2 text-xs text-slate-500">
                            {(m.citations ?? []).slice(0, 6).map((c: any, idx: number) => (
                              <div key={`${c?.chunk_id ?? idx}`}>
                                {c?.filename ?? "Source"}
                                {c?.page_start ? ` (p${c.page_start}-${c.page_end ?? c.page_start})` : ""}
                              </div>
                            ))}
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
                <button
                  onClick={onAsk}
                  disabled={!classId || busyAsk || !input.trim()}
                  className="h-12 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Send
                </button>
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
      </main>
    </div>
  );
}
