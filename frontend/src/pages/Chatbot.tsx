// src/pages/Chatbot.tsx
import { useEffect, useMemo, useRef, useState } from "react";

import {
  listClasses,
  createClass,
  listFiles,
  uploadFile,
  createChunks,
  buildEmbeddings,
  chatAsk,
  type ClassRow,
  type FileRow,
  type ChatAskRes,
} from "../lib/api";

/* -------------------- helpers -------------------- */
const STORAGE_KEY = "ns_chatbot_sessions_v1";
const SCRATCH_KEY = "ns_scratch_class_id_v1";

const ALLOWED_MIME = new Set<string>([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
]);

const ALLOWED_EXT = new Set<string>([".pdf", ".pptx", ".docx"]);

function hasAllowedExt(name: string) {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return false;
  return ALLOWED_EXT.has(name.slice(dot).toLowerCase());
}
function isAllowed(file: File) {
  return ALLOWED_MIME.has(file.type) || hasAllowedExt(file.name);
}

function prettyBytes(bytes?: number) {
  if (!Number.isFinite(bytes ?? NaN)) return "—";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let n = bytes as number;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 2 : 0)} ${u[i]}`;
}

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  try {
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/* -------------------- types -------------------- */
type Role = "user" | "assistant";

type ChatMsg = {
  id: string;
  role: Role;
  text: string;
  citations?: ChatAskRes["citations"];
  at: number;
};

type ChatSession = {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;

  // context
  class_id: number | null;
  file_ids: string[]; // optional filter
  show_sources: boolean;

  // messages
  msgs: ChatMsg[];
};

/* -------------------- small UI atoms -------------------- */
function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 8px",
        fontSize: 12,
        borderRadius: 999,
        background: "#F2F4F7",
        color: "#344054",
        border: "1px solid #E4E7EC",
      }}
    >
      {children}
    </span>
  );
}

function Button({
  children,
  onClick,
  kind = "default",
  title,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  kind?: "default" | "primary" | "danger" | "ghost";
  title?: string;
  disabled?: boolean;
}) {
  const styles: Record<string, React.CSSProperties> = {
    base: {
      padding: "8px 12px",
      borderRadius: 10,
      fontSize: 14,
      lineHeight: 1.2,
      cursor: disabled ? "not-allowed" : "pointer",
      userSelect: "none",
      border: "1px solid transparent",
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      background: "#fff",
      whiteSpace: "nowrap",
    },
    default: { borderColor: "#E4E7EC", background: "#fff" },
    ghost: { borderColor: "transparent", background: "transparent" },
    primary: { borderColor: "#7B5FEF", background: "#7B5FEF", color: "#fff" },
    danger: { borderColor: "#FEE4E2", background: "#FEE4E2", color: "#B42318" },
    disabled: { opacity: 0.6 },
  };
  const style = {
    ...styles.base,
    ...(styles[kind] || styles.default),
    ...(disabled ? styles.disabled : {}),
  };
  return (
    <button
      onClick={disabled ? undefined : onClick}
      title={title}
      style={style}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

/* -------------------- page -------------------- */
export default function Chatbot() {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [scratchId, setScratchId] = useState<number | null>(null);

  // sessions
  const [sessions, setSessions] = useState<ChatSession[]>(
    () => safeJsonParse(localStorage.getItem(STORAGE_KEY), [])
  );
  const [activeSessionId, setActiveSessionId] = useState<string | null>(
    () => (safeJsonParse(localStorage.getItem(STORAGE_KEY), []) as ChatSession[])[0]?.id ?? null
  );

  // ✅ rename session
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // context files
  const [files, setFiles] = useState<FileRow[]>([]);
  const [fileSearch, setFileSearch] = useState("");
  const [busyFiles, setBusyFiles] = useState(false);

  // chat input + busy
  const [input, setInput] = useState("");
  const [busyAsk, setBusyAsk] = useState(false);

  // upload busy
  const [busyUpload, setBusyUpload] = useState(false);
  const [busyIndex, setBusyIndex] = useState(false);
  const [invalidDropCount, setInvalidDropCount] = useState(0);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const active = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) ?? null,
    [sessions, activeSessionId]
  );

  /* -------------------- persist sessions -------------------- */
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  }, [sessions]);

  /* -------------------- scroll to bottom -------------------- */
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [active?.msgs?.length, busyAsk]);

  /* -------------------- init: load classes + ensure scratch class -------------------- */
  useEffect(() => {
    (async () => {
      const cs = await listClasses();
      setClasses(cs);

      const cached = Number(localStorage.getItem(SCRATCH_KEY) || "0");
      if (cached > 0) {
        setScratchId(cached);
        return;
      }

      try {
        const row = await createClass({ name: "Scratchpad Chat", subject: "Chat" });
        localStorage.setItem(SCRATCH_KEY, String(row.id));
        setScratchId(row.id);
        setClasses((prev) => [row, ...prev]);
      } catch {
        setScratchId(null);
      }
    })();
  }, []);

  /* -------------------- ensure at least 1 session -------------------- */
  useEffect(() => {
    if (sessions.length > 0) return;

    const first: ChatSession = {
      id: crypto.randomUUID?.() ?? String(Date.now()),
      title: "New chat",
      created_at: Date.now(),
      updated_at: Date.now(),
      class_id: null,
      file_ids: [],
      show_sources: false,
      msgs: [],
    };
    setSessions([first]);
    setActiveSessionId(first.id);
  }, [sessions.length]);

  /* -------------------- load files for active session class -------------------- */
  useEffect(() => {
    const classId = active?.class_id ?? null;
    if (!active) return;

    (async () => {
      setBusyFiles(true);
      try {
        if (!classId) {
          setFiles([]);
          return;
        }
        const fs = await listFiles(classId);
        setFiles(fs ?? []);
      } catch {
        setFiles([]);
      } finally {
        setBusyFiles(false);
      }
    })();
  }, [active?.id, active?.class_id]);

  /* -------------------- session helpers -------------------- */
  function updateActive(patch: Partial<ChatSession>) {
    if (!active) return;
    setSessions((prev) =>
      prev.map((s) =>
        s.id === active.id
          ? {
              ...s,
              ...patch,
              updated_at: Date.now(),
            }
          : s
      )
    );
  }

  function newSession() {
    const s: ChatSession = {
      id: crypto.randomUUID?.() ?? String(Date.now()),
      title: "New chat",
      created_at: Date.now(),
      updated_at: Date.now(),
      class_id: null,
      file_ids: [],
      show_sources: false,
      msgs: [],
    };
    setSessions((prev) => [s, ...prev]);
    setActiveSessionId(s.id);
    setFiles([]);
    setFileSearch("");
    setInput("");
    setInvalidDropCount(0);
    setRenamingId(null);
    setRenameValue("");
  }

  function deleteSession(id: string) {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeSessionId === id) {
      const remaining = sessions.filter((s) => s.id !== id);
      setActiveSessionId(remaining[0]?.id ?? null);
    }
    if (renamingId === id) {
      setRenamingId(null);
      setRenameValue("");
    }
  }

  function startRename(s: ChatSession) {
    setRenamingId(s.id);
    setRenameValue(s.title || "New chat");
  }

  function saveRename() {
    if (!renamingId) return;
    const title = renameValue.trim() || "New chat";
    setSessions((prev) =>
      prev.map((s) => (s.id === renamingId ? { ...s, title, updated_at: Date.now() } : s))
    );
    setRenamingId(null);
    setRenameValue("");
  }

  /* -------------------- uploads + indexing -------------------- */
  async function autoIndexUploadedFiles(classId: number, fileIds: string[]) {
    if (!fileIds.length) return;

    await createChunks({
      file_ids: fileIds,
      by: "auto",
      size: 2000,
      overlap: 200,
      preview_limit_per_file: 0,
    });

    await buildEmbeddings(classId, 2000);
  }

  async function uploadMany(fileList: FileList | File[]) {
    if (!active) return;

    const destClassId = active.class_id ?? scratchId;
    if (!destClassId) {
      alert("Please select a class in the dropdown first (scratchpad not ready).");
      return;
    }

    const arr = Array.from(fileList);
    const accepted = arr.filter(isAllowed);
    const rejected = arr.filter((f) => !isAllowed(f));
    setInvalidDropCount(rejected.length);

    if (accepted.length === 0) return;

    setBusyUpload(true);
    const uploadedIds: string[] = [];

    try {
      for (const f of accepted) {
        const row = await uploadFile(destClassId, f);
        uploadedIds.push(row.id);

        if (active.class_id === destClassId) {
          setFiles((prev) => [row, ...(prev ?? [])]);
        }
      }

      setBusyIndex(true);
      try {
        await autoIndexUploadedFiles(destClassId, uploadedIds);
      } catch (e: any) {
        alert(
          `Uploaded, but indexing failed.\nYou can still ask, but results may be weaker until embeddings exist.\n\n${
            e?.message ?? ""
          }`
        );
      } finally {
        setBusyIndex(false);
      }
    } catch (e: any) {
      alert(e?.message ?? "Upload failed");
    } finally {
      setBusyUpload(false);
    }
  }

  async function onUploadChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length) return;
    await uploadMany(e.target.files);
    e.target.value = "";
  }

  /* -------------------- ask -------------------- */
  async function onAsk() {
    if (!active) return;

    const q = input.trim();
    if (!q) return;

    const useClassId = active.class_id ?? scratchId;
    if (!useClassId) {
      alert("Pick a class first (or wait for scratchpad initialization).");
      return;
    }

    const userMsg: ChatMsg = {
      id: crypto.randomUUID?.() ?? String(Date.now()),
      role: "user",
      text: q,
      at: Date.now(),
    };

    updateActive({
      msgs: [...active.msgs, userMsg],
      title: active.msgs.length === 0 ? q.slice(0, 28) || "New chat" : active.title,
    });

    setInput("");
    setBusyAsk(true);

    try {
      const res = await chatAsk({
        class_id: useClassId,
        question: q,
        top_k: 8,
        file_ids: active.file_ids.length ? active.file_ids : undefined,
      });

      const botMsg: ChatMsg = {
        id: crypto.randomUUID?.() ?? String(Date.now() + 1),
        role: "assistant",
        text: (res?.answer ?? "").trim() || "I couldn’t find that in your selected context.",
        citations: Array.isArray(res?.citations) ? res.citations : [],
        at: Date.now(),
      };

      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== active.id) return s;
          const nextMsgs = [...s.msgs, botMsg];
          return { ...s, msgs: nextMsgs, updated_at: Date.now() };
        })
      );
    } catch (e: any) {
      const botMsg: ChatMsg = {
        id: crypto.randomUUID?.() ?? String(Date.now() + 2),
        role: "assistant",
        text: e?.message ?? "Chat failed",
        at: Date.now(),
      };
      setSessions((prev) =>
        prev.map((s) => (s.id === active.id ? { ...s, msgs: [...s.msgs, botMsg], updated_at: Date.now() } : s))
      );
    } finally {
      setBusyAsk(false);
    }
  }

  /* -------------------- derived UI -------------------- */
  const filteredFiles = useMemo(() => {
    const q = fileSearch.trim().toLowerCase();
    const base = files ?? [];
    if (!q) return base;
    return base.filter((f) => f.filename.toLowerCase().includes(q));
  }, [files, fileSearch]);

  const activeSelectedCount = active?.file_ids?.length ?? 0;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "320px 1fr",
        height: "100vh",
        overflow: "hidden",
        background: "#FAFAFB",
      }}
    >
      {/* -------------------- LEFT: sessions -------------------- */}
      <aside
        style={{
          borderRight: "1px solid #EEF2F6",
          background: "#fff",
          display: "grid",
          gridTemplateRows: "auto 1fr auto",
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: 14,
            borderBottom: "1px solid #EEF2F6",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <div style={{ fontWeight: 900 }}>Chatbot</div>
          <Button kind="primary" onClick={newSession} title="New session">
            ＋ New
          </Button>
        </div>

        <div style={{ padding: 10, overflow: "auto", minHeight: 0 }}>
          {sessions.length === 0 ? (
            <div style={{ color: "#667085", padding: 10 }}>No sessions</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {sessions.map((s) => {
                const isActive = s.id === activeSessionId;
                return (
                  <div
                    key={s.id}
                    onClick={() => setActiveSessionId(s.id)}
                    style={{
                      border: "1px solid #E4E7EC",
                      borderRadius: 12,
                      padding: 10,
                      cursor: "pointer",
                      background: isActive ? "rgba(123,95,239,0.08)" : "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                    title={s.title}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      {renamingId === s.id ? (
                        <input
                          value={renameValue}
                          autoFocus
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={saveRename}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveRename();
                            if (e.key === "Escape") {
                              setRenamingId(null);
                              setRenameValue("");
                            }
                          }}
                          style={{
                            width: "100%",
                            padding: "6px 8px",
                            borderRadius: 10,
                            border: "1px solid #E4E7EC",
                            outline: "none",
                            fontWeight: 800,
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            fontWeight: 800,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title="Double click to rename"
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            startRename(s);
                          }}
                        >
                          {s.title || "New chat"}
                        </div>
                      )}
                      {/* ✅ removed message count text */}
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!confirm("Delete this session?")) return;
                        deleteSession(s.id);
                      }}
                      style={{
                        border: "1px solid #FEE4E2",
                        background: "#FEF3F2",
                        color: "#B42318",
                        borderRadius: 10,
                        padding: "6px 8px",
                        cursor: "pointer",
                      }}
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div
          style={{
            padding: 12,
            borderTop: "1px solid #EEF2F6",
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          {busyUpload && <Badge>Uploading…</Badge>}
          {busyIndex && <Badge>Indexing…</Badge>}
          {busyAsk && <Badge>Thinking…</Badge>}
        </div>
      </aside>

      {/* -------------------- RIGHT: context + chat -------------------- */}
      <main
        style={{
          padding: 16,
          display: "grid",
          gridTemplateRows: "auto 1fr",
          gap: 12,
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        {/* top bar */}
        <div
          style={{
            background: "#fff",
            border: "1px solid #EEF2F6",
            borderRadius: 14,
            padding: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 900 }}>Context</div>

            <select
              value={active?.class_id ?? ""}
              onChange={(e) => {
                const v = e.target.value ? Number(e.target.value) : null;
                updateActive({ class_id: v, file_ids: [] });
                setFileSearch("");
              }}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #E4E7EC",
                background: "#fff",
                minWidth: 240,
                outline: "none",
              }}
              disabled={!active}
              title="Pick class context"
            >
              <option value="">(Select class)</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <Badge>{activeSelectedCount} file filter</Badge>
            {busyFiles && <Badge>Loading files…</Badge>}
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#344054" }}>
              <input
                type="checkbox"
                checked={!!active?.show_sources}
                onChange={(e) => updateActive({ show_sources: e.target.checked })}
                disabled={!active}
              />
              Show sources
            </label>

            <Button
              kind="default"
              onClick={() => fileInputRef.current?.click()}
              disabled={!active}
              title="Upload (PDF/PPTX/DOCX) to selected class (or scratchpad if none)"
            >
              ⬆️ Upload
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept={[
                "application/pdf",
                "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                ".pdf,.pptx,.docx",
              ].join(",")}
              style={{ display: "none" }}
              multiple
              onChange={onUploadChange}
            />

            <Button kind="default" onClick={() => updateActive({ msgs: [], title: "New chat" })} disabled={!active}>
              🧹 Clear chat
            </Button>
          </div>
        </div>

        {/* context files + chat */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "360px 1fr",
            gap: 12,
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          {/* context panel */}
          <div
            style={{
              background: "#fff",
              border: "1px solid #EEF2F6",
              borderRadius: 14,
              padding: 12,
              display: "grid",
              gridTemplateRows: "auto auto 1fr auto",
              gap: 10,
              minHeight: 0,
              overflow: "hidden",
            }}
          >
            <div style={{ fontWeight: 900 }}>Files</div>

            <input
              value={fileSearch}
              onChange={(e) => setFileSearch(e.target.value)}
              placeholder="Search files..."
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #E4E7EC",
                outline: "none",
              }}
            />

            <div style={{ overflow: "auto", display: "grid", gap: 8, minHeight: 0 }}>
              {!active?.class_id ? (
                <div style={{ color: "#667085", fontSize: 13, padding: 8 }}>
                  Select a class to see its files. Upload works too — if no class is selected it uses Scratchpad (if available).
                </div>
              ) : filteredFiles.length === 0 ? (
                <div style={{ color: "#667085", fontSize: 13, padding: 8 }}>No files found.</div>
              ) : (
                filteredFiles.map((f) => {
                  const checked = !!active?.file_ids?.includes(f.id);
                  return (
                    <label
                      key={f.id}
                      style={{
                        border: "1px solid #E4E7EC",
                        borderRadius: 12,
                        padding: 10,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (!active) return;
                            const next = new Set(active.file_ids);
                            if (e.target.checked) next.add(f.id);
                            else next.delete(f.id);
                            updateActive({ file_ids: Array.from(next) });
                          }}
                        />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {f.filename}
                          </div>
                          <div style={{ fontSize: 12, color: "#667085" }}>{prettyBytes(f.size_bytes)}</div>
                        </div>
                      </div>

                      <Badge>{(f.filename.split(".").pop() || "").toUpperCase()}</Badge>
                    </label>
                  );
                })
              )}
            </div>

            {invalidDropCount > 0 && (
              <div
                style={{
                  border: "1px solid #FEE4E2",
                  background: "#FEF3F2",
                  color: "#B42318",
                  borderRadius: 12,
                  padding: 10,
                  fontSize: 13,
                }}
              >
                Ignored {invalidDropCount} unsupported file{invalidDropCount > 1 ? "s" : ""}. Allowed: PDF, PPTX, DOCX.
              </div>
            )}

            <div style={{ fontSize: 12, color: "#667085" }}>
              Tip: select files to restrict the chat context. Leave none selected to use the whole class.
            </div>
          </div>

          {/* chat panel */}
          <div
            style={{
              background: "#fff",
              border: "1px solid #EEF2F6",
              borderRadius: 14,
              display: "grid",
              gridTemplateRows: "1fr auto",
              minHeight: 0,
              overflow: "hidden",
            }}
          >
            {/* messages */}
            <div style={{ padding: 12, overflow: "auto", minHeight: 0 }}>
              {!active || active.msgs.length === 0 ? (
                <div style={{ color: "#667085", padding: 10 }}>
                  Start chatting. Pick a class (optional), select files (optional), then ask.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {active.msgs.map((m) => {
                    const hasCites = (m.citations?.length ?? 0) > 0;
                    const showSources = !!active.show_sources && hasCites;
                    return (
                      <div
                        key={m.id}
                        style={{
                          display: "flex",
                          justifyContent: m.role === "user" ? "flex-end" : "flex-start",
                        }}
                      >
                        <div
                          style={{
                            maxWidth: "78%",
                            borderRadius: 14,
                            padding: "10px 12px",
                            border: "1px solid #E4E7EC",
                            background: m.role === "user" ? "rgba(123,95,239,0.10)" : "#fff",
                            whiteSpace: "pre-wrap",
                            lineHeight: 1.45,
                          }}
                        >
                          <div style={{ fontSize: 13 }}>{m.text}</div>

                          {m.role === "assistant" && showSources && (
                            <div style={{ marginTop: 10, borderTop: "1px dashed #E4E7EC", paddingTop: 8 }}>
                              <div style={{ fontWeight: 900, fontSize: 12, marginBottom: 6 }}>Sources</div>
                              <div style={{ fontSize: 12, color: "#475467", display: "grid", gap: 4 }}>
                                {(m.citations ?? []).slice(0, 8).map((c: any, idx: number) => (
                                  <div key={`${c?.chunk_id ?? idx}`}>
                                    {c?.filename ?? "Source"} {c?.page_start ? `(p${c.page_start}-${c.page_end ?? c.page_start})` : ""}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {busyAsk && <div style={{ color: "#667085", fontSize: 13 }}>Thinking…</div>}
                  <div ref={endRef} />
                </div>
              )}
            </div>

            {/* input */}
            <div
              style={{
                padding: 12,
                borderTop: "1px solid #EEF2F6",
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 10,
              }}
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask anything..."
                style={{
                  width: "100%",
                  minHeight: 54,
                  resize: "vertical",
                  padding: 10,
                  borderRadius: 12,
                  border: "1px solid #E4E7EC",
                  outline: "none",
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    onAsk();
                  }
                }}
                disabled={!active}
              />
              <Button kind="primary" onClick={onAsk} disabled={!active || busyAsk || !input.trim()}>
                Ask
              </Button>
              <div style={{ gridColumn: "1 / -1", fontSize: 12, color: "#667085" }}>
                Enter to send • Shift+Enter for new line • Sources are hidden by default
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
