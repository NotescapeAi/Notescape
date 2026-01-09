// src/pages/Classes.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import ClassSidebar from "../components/ClassSidebar";
import ClassHeaderButtons from "../components/ClassHeaderButtons";
import FileViewer from "../components/FileViewer";
import PageHeader from "../components/PageHeader";
import Button from "../components/Button";

import {
  listClasses,
  createClass,
  updateClass,
  deleteClass,
  listFiles,
  uploadFile,
  deleteFile,
  createChunks,
  type FileRow,
  type ClassRow,
  type ChunkPreview,
  buildEmbeddings,
  generateFlashcards,
  listFlashcards,
  type Flashcard,
  chatAsk,
  createChatSession,
  listChatSessions,
  getChatSession,
  addChatMessages,
  type ChatSession,
  type ChatMessage,
} from "../lib/api";

const ALLOWED_MIME = new Set<string>([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
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
  if (!Number.isFinite(bytes ?? NaN)) return "-";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let n = bytes as number;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 2 : 0)} ${u[i]}`;
}

function timeLocal(s?: string | null) {
  if (!s) return "-";
  try {
    return new Date(s).toLocaleString();
  } catch {
    return s;
  }
}

function StatusPill({ status }: { status?: string | null }) {
  const s = (status || "UPLOADED").toUpperCase();
  const base = "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold";
  const map: Record<string, string> = {
    UPLOADED: "border-indigo-200 bg-indigo-50 text-indigo-700",
    OCR_QUEUED: "border-amber-200 bg-amber-50 text-amber-700",
    OCR_DONE: "border-emerald-200 bg-emerald-50 text-emerald-700",
    INDEXED: "border-sky-200 bg-sky-50 text-sky-700",
    FAILED: "border-rose-200 bg-rose-50 text-rose-700",
  };
  return <span className={`${base} ${map[s] || map.UPLOADED}`}>{s.replace("_", " ")}</span>;
}

function Tabs({
  active,
  onChange,
}: {
  active: "documents" | "flashcards" | "chat";
  onChange: (t: "documents" | "flashcards" | "chat") => void;
}) {
  const items: Array<["documents" | "flashcards" | "chat", string]> = [
    ["documents", "Documents"],
    ["flashcards", "Flashcards"],
    ["chat", "Chat"],
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {items.map(([key, label]) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
            active === key
              ? "border-slate-900 bg-slate-900 text-white"
              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

type Msg = ChatMessage & { citations?: any };

export default function Classes() {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"documents" | "flashcards" | "chat">("documents");

  const [files, setFiles] = useState<FileRow[] | undefined>([]);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const selectedIds = useMemo(
    () => (files ?? []).filter((f) => sel[f.id]).map((f) => f.id),
    [files, sel]
  );

  const [busyUpload, setBusyUpload] = useState(false);
  const [busyFlow, setBusyFlow] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [invalidDropCount, setInvalidDropCount] = useState(0);

  const [preview, setPreview] = useState<ChunkPreview[] | null>(null);
  const [, setCards] = useState<Flashcard[]>([]);
  const [activeFile, setActiveFile] = useState<FileRow | null>(null);

  const location = useLocation();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newClassName, setNewClassName] = useState("");

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [showCitations, setShowCitations] = useState(false);
  const [scopeFileIds, setScopeFileIds] = useState<string[]>([]);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    (async () => setClasses(await listClasses()))();
  }, []);

  useEffect(() => {
    const st = (location as any)?.state;
    if (st?.selectId) setSelectedId(Number(st.selectId));
  }, [location]);

  useEffect(() => {
    if (selectedId == null) {
      setFiles([]);
      setSel({});
      setCards([]);
      setActiveTab("documents");
      setSessions([]);
      setActiveSessionId(null);
      setMessages([]);
      setScopeFileIds([]);
      return;
    }
    (async () => {
      const fs = await listFiles(selectedId);
      setFiles(fs ?? []);
      setSel({});
      try {
        setCards(await listFlashcards(selectedId));
      } catch {
        /* ignore */
      }
    })();
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    const needsPoll = (files ?? []).some((f) =>
      ["UPLOADED", "OCR_QUEUED", "OCR_DONE"].includes(String(f.status || ""))
    );
    if (!needsPoll) return;
    const id = setInterval(async () => {
      const fs = await listFiles(selectedId);
      setFiles(fs ?? []);
    }, 5000);
    return () => clearInterval(id);
  }, [selectedId, files]);

  useEffect(() => {
    if (!selectedId) return;
    (async () => {
      const sess = await listChatSessions(selectedId);
      setSessions(sess);
      setActiveSessionId(sess[0]?.id ?? null);
    })();
  }, [selectedId]);

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
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, chatBusy]);

  async function handleCreate(name: string) {
    const row = await createClass({ name, subject: "General" });
    setClasses((xs) => [...xs, row]);
    setShowCreate(false);
    setNewClassName("");
  }
  async function handleRename(id: number, name: string) {
    const row = await updateClass(id, { name });
    setClasses((xs) => xs.map((c) => (c.id === id ? row : c)));
  }
  async function handleDeleteClass(id: number) {
    await deleteClass(id);
    setClasses((xs) => xs.filter((c) => c.id !== id));
    if (selectedId === id) {
      setSelectedId(null);
      setFiles([]);
      setSel({});
      setCards([]);
      setSessions([]);
      setActiveSessionId(null);
      setMessages([]);
    }
  }

  async function onRenameSelected() {
    if (!selectedId) return;
    const current = classes.find((c) => c.id === selectedId)?.name ?? "";
    const next = window.prompt("Rename class", current);
    if (!next || !next.trim()) return;
    await handleRename(selectedId, next.trim());
  }

  async function onDeleteSelected() {
    if (!selectedId) return;
    const current = classes.find((c) => c.id === selectedId)?.name ?? "this class";
    if (!confirm(`Delete \"${current}\"?`)) return;
    await handleDeleteClass(selectedId);
  }

  function acceptFile(f: File) {
    return isAllowed(f);
  }

  async function uploadMany(fileList: FileList | File[]) {
    if (!selectedId) {
      alert("Select a class first.");
      return;
    }
    const arr = Array.from(fileList);
    const accepted = arr.filter(acceptFile);
    const rejected = arr.filter((f) => !acceptFile(f));
    setInvalidDropCount(rejected.length);

    if (accepted.length === 0) return;

    setBusyUpload(true);

    try {
      for (const f of accepted) {
        const row = await uploadFile(selectedId, f);
        setFiles((xs) => [row, ...(xs ?? [])]);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusyUpload(false);
      setDropping(false);
    }
  }

  async function onUploadChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length) return;
    await uploadMany(e.target.files);
    e.target.value = "";
  }
  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDropping(true);
  }
  function onDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDropping(false);
  }
  async function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    await uploadMany(e.dataTransfer.files);
  }

  function toggleAll(checked: boolean) {
    const m: Record<string, boolean> = {};
    if (checked) (files ?? []).forEach((f) => (m[f.id] = true));
    setSel(m);
  }
  function toggleOne(id: string, checked: boolean) {
    setSel((prev) => ({ ...prev, [id]: checked }));
  }

  async function onDeleteFile(fileId: string, filename: string) {
    if (!confirm(`Delete "${filename}"?`)) return;
    try {
      await deleteFile(fileId);
      setFiles((xs) => (xs ?? []).filter((f) => f.id !== fileId));
      setSel((prev) => {
        const next = { ...prev };
        delete next[fileId];
        return next;
      });
    } catch {
      alert("Failed to delete file");
    }
  }

  async function onGenerateFlashcards(opts: {
    difficulty: "easy" | "medium" | "hard";
    n_cards: number;
    style: "mixed" | "definitions" | "conceptual" | "qa";
  }) {
    if (!selectedId) return alert("Select a class first");
    if ((files?.length ?? 0) === 0) return alert("Upload at least one file first");

    const ids = selectedIds.length ? selectedIds : (files ?? []).map((f) => f.id);
    const pending = (files ?? []).filter((f) => ids.includes(f.id) && f.status !== "INDEXED");
    if (pending.length > 0) {
      return alert("Some files are still processing. Wait for INDEXED before generating flashcards.");
    }

    setBusyFlow(true);
    try {
      const res: ChunkPreview[] = await createChunks({
        file_ids: ids,
        by: "page",
        size: 1,
        overlap: 0,
        preview_limit_per_file: 2,
      });
      setPreview(res);

      await buildEmbeddings(selectedId, 1000);

      const created = await generateFlashcards({
        class_id: selectedId,
        file_ids: ids,
        top_k: 12,
        n_cards: opts.n_cards,
        style: opts.style,
        difficulty: opts.difficulty,
      });

      setCards(created);
      alert(`Created ${created.length} flashcards`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to generate flashcards";
      alert(msg);
    } finally {
      setBusyFlow(false);
    }
  }

  async function startNewSession() {
    if (!selectedId) return;
    const s = await createChatSession({ class_id: selectedId, title: "New chat" });
    setSessions((prev) => [s, ...prev]);
    setActiveSessionId(s.id);
  }

  async function onAsk() {
    if (!selectedId) return;
    if (!chatInput.trim()) return;

    let sessionId = activeSessionId;
    if (!sessionId) {
      const s = await createChatSession({ class_id: selectedId, title: "New chat" });
      setSessions((prev) => [s, ...prev]);
      sessionId = s.id;
      setActiveSessionId(s.id);
    }

    const userMsg: Msg = {
      id: crypto.randomUUID?.() ?? String(Date.now()),
      role: "user",
      content: chatInput.trim(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setChatBusy(true);

    try {
      const res = await chatAsk({
        class_id: selectedId,
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
      setChatBusy(false);
    }
  }

  function toggleFileScope(fileId: string) {
    setScopeFileIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return Array.from(next);
    });
  }

  const currentClass = selectedId
    ? classes.find((c) => c.id === selectedId)?.name
    : null;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="grid grid-cols-[300px_minmax(0,1fr)]">
        <ClassSidebar
          items={classes}
          selectedId={selectedId}
          onSelect={(id) => setSelectedId(id)}
          onNew={() => setShowCreate(true)}
        />

        <section className="p-6 lg:p-8">
          <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6">
            <PageHeader title="Classes" backHref="/dashboard" />

            {!selectedId ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
                <div className="text-lg font-semibold text-slate-900">Select a class to get started</div>
                <div className="mt-2 text-sm text-slate-500">
                  Create your first class and start uploading materials.
                </div>
                <Button variant="primary" className="mt-5" onClick={() => setShowCreate(true)}>
                  Create class
                </Button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{currentClass}</div>
                    <div className="text-xs text-slate-500">Manage documents and study tools.</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={onRenameSelected}>
                      Rename
                    </Button>
                    <Button size="sm" onClick={onDeleteSelected}>
                      Delete
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-between flex-wrap gap-4">
                  <Tabs active={activeTab} onChange={setActiveTab} />
                  <div className="flex items-center gap-3">
                    {busyUpload && <span className="text-xs text-slate-500">Uploading...</span>}
                    {busyFlow && <span className="text-xs text-slate-500">Processing...</span>}
                    <ClassHeaderButtons classId={String(selectedId)} onGenerate={onGenerateFlashcards} />
                  </div>
                </div>
              {activeTab === "documents" && (
                <div className="mt-6 space-y-4">
                  <div
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    onClick={() => fileInputRef.current?.click()}
                    role="button"
                    className={`rounded-2xl border-2 border-dashed px-6 py-8 text-center transition ${
                      dropping ? "border-slate-900 bg-slate-50" : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="text-base font-semibold text-slate-800">Upload class materials</div>
                    <div className="mt-1 text-sm text-slate-500">Drag files here or click to select</div>
                    <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-500">
                      PDF, PPTX, DOCX
                    </div>
                    {invalidDropCount > 0 && (
                      <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                        Ignored {invalidDropCount} unsupported file{invalidDropCount > 1 ? "s" : ""}.
                      </div>
                    )}
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={[
                      "application/pdf",
                      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                      ".pdf,.pptx,.docx",
                    ].join(",")}
                    className="hidden"
                    multiple
                    onChange={onUploadChange}
                  />

                  <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                      <div className="text-sm font-semibold">Documents</div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span>{selectedIds.length} selected</span>
                        {selectedIds.length > 0 && (
                          <button
                            className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700"
                            onClick={async () => {
                              const toDelete = (files ?? []).filter((f) => selectedIds.includes(f.id));
                              if (!confirm(`Delete ${toDelete.length} file(s)?`)) return;
                              for (const f of toDelete) await onDeleteFile(f.id, f.filename);
                              setSel({});
                            }}
                          >
                            Delete selected
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="overflow-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-xs text-slate-500">
                          <tr>
                            <th className="px-4 py-2 text-left">
                              <input
                                type="checkbox"
                                aria-label="Select all"
                                checked={(files?.length ?? 0) > 0 && selectedIds.length === (files?.length ?? 0)}
                                onChange={(e) => toggleAll(e.target.checked)}
                              />
                            </th>
                            <th className="px-4 py-2 text-left">File</th>
                            <th className="px-4 py-2 text-left">Size</th>
                            <th className="px-4 py-2 text-left">Uploaded</th>
                            <th className="px-4 py-2 text-left">Status</th>
                            <th className="px-4 py-2 text-left">Open</th>
                            <th className="px-4 py-2 text-left">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(files ?? []).map((f) => (
                            <tr key={f.id} className="border-t border-slate-100">
                              <td className="px-4 py-3">
                                <input
                                  type="checkbox"
                                  checked={!!sel[f.id]}
                                  onChange={(e) => toggleOne(f.id, e.target.checked)}
                                  aria-label={`Select ${f.filename}`}
                                />
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <button
                                    className="font-semibold text-slate-900 hover:underline"
                                    onClick={() => setActiveFile(f)}
                                  >
                                    {f.filename}
                                  </button>
                                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-500">
                                    {(f.filename.split(".").pop() || "").toUpperCase()}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-slate-500">{prettyBytes(f.size_bytes)}</td>
                              <td className="px-4 py-3 text-slate-500">{timeLocal(f.uploaded_at)}</td>
                              <td className="px-4 py-3">
                                <StatusPill status={f.status ?? "UPLOADED"} />
                              </td>
                              <td className="px-4 py-3">
                                <button
                                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600"
                                  onClick={() => setActiveFile(f)}
                                >
                                  View
                                </button>
                              </td>
                              <td className="px-4 py-3">
                                <button
                                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600"
                                  onClick={() => onDeleteFile(f.id, f.filename)}
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                          ))}
                          {(files?.length ?? 0) === 0 && (
                            <tr>
                              <td colSpan={7} className="px-4 py-6 text-sm text-slate-500">
                                No documents yet. Upload a PDF, PPTX, or DOCX to begin.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "flashcards" && (
                <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <div className="text-sm font-semibold">Flashcards</div>
                      <div className="text-xs text-slate-500">
                        Generate cards from your selected documents or open study mode.
                      </div>
                    </div>
                    <Link
                      to={`/classes/${selectedId}/flashcards`}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                    >
                      Open flashcards
                    </Link>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                      {selectedIds.length || (files?.length ?? 0)} file(s) in scope
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                      Use the Generate button above
                    </span>
                  </div>
                </div>
              )}

              {activeTab === "chat" && (
                <div className="mt-6 grid grid-cols-1 xl:grid-cols-[240px_minmax(0,1fr)_280px] gap-4">
                  <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold">Sessions</div>
                      <button
                        onClick={startNewSession}
                        className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                      >
                        New
                      </button>
                    </div>
                    <div className="mt-3 space-y-2 max-h-[65vh] overflow-auto">
                      {sessions.length === 0 ? (
                        <div className="text-xs text-slate-500">No sessions yet.</div>
                      ) : (
                        sessions.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => setActiveSessionId(s.id)}
                            className={`w-full rounded-xl border px-3 py-2 text-left text-xs ${
                              s.id === activeSessionId
                                ? "border-slate-900 bg-slate-50 font-semibold"
                                : "border-slate-200 hover:border-slate-300"
                            }`}
                          >
                            <div className="truncate">{s.title}</div>
                            <div className="text-[10px] text-slate-400 truncate">
                              {new Date(s.updated_at || s.created_at || "").toLocaleString()}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </aside>

                  <section className="rounded-2xl border border-slate-200 bg-white shadow-sm flex flex-col min-h-[60vh]">
                    <div className="border-b border-slate-200 px-4 py-3 flex items-center justify-between">
                      <div className="text-sm font-semibold">Conversation</div>
                      <label className="flex items-center gap-2 text-xs text-slate-500">
                        <input type="checkbox" checked={showCitations} onChange={() => setShowCitations((v) => !v)} />
                        Show citations
                      </label>
                    </div>
                    <div className="flex-1 overflow-auto p-4 space-y-4">
                      {messages.length === 0 ? (
                        <div className="text-sm text-slate-500">Ask about your class materials.</div>
                      ) : (
                        messages.map((m) => {
                          const show = showCitations && m.role === "assistant" && (m.citations?.length ?? 0) > 0;
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
                      {chatBusy && <div className="text-xs text-slate-400">Thinking...</div>}
                      <div ref={chatEndRef} />
                    </div>
                    <div className="border-t border-slate-200 p-4">
                      <div className="flex gap-3">
                        <textarea
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
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
                          disabled={chatBusy || !chatInput.trim()}
                          className="h-12 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          Send
                        </button>
                      </div>
                      <div className="mt-2 text-xs text-slate-400">Enter to send, Shift+Enter for newline.</div>
                    </div>
                  </section>

                  <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="text-sm font-semibold">File scope</div>
                    <div className="mt-2 text-xs text-slate-500">Select files to narrow answers.</div>
                    <div className="mt-3 space-y-2 max-h-[60vh] overflow-auto">
                      {(files ?? []).length === 0 ? (
                        <div className="text-xs text-slate-500">Upload documents to enable scope.</div>
                      ) : (
                        (files ?? []).map((f) => {
                          const checked = scopeFileIds.includes(f.id);
                          return (
                            <button
                              key={f.id}
                              onClick={() => toggleFileScope(f.id)}
                              className={`w-full rounded-xl border px-3 py-2 text-left text-xs ${
                                checked ? "border-slate-900 bg-slate-50" : "border-slate-200 hover:border-slate-300"
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="truncate font-medium text-slate-800">{f.filename}</span>
                                <span className="text-[10px] text-slate-400">
                                  {(f.filename.split(".").pop() || "").toUpperCase()}
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-400">{f.status ?? "UPLOADED"}</div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </aside>
                </div>
              )}

              {preview && (
                <div
                  role="dialog"
                  aria-modal="true"
                  className="fixed inset-0 z-50 flex items-end bg-slate-900/40"
                  onClick={() => setPreview(null)}
                >
                  <div
                    className="mx-auto mb-6 max-h-[80vh] w-[min(920px,96vw)] overflow-hidden rounded-2xl bg-white shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                      <strong>Chunk previews</strong>
                      <button className="rounded-lg border border-slate-200 px-2 py-1 text-xs" onClick={() => setPreview(null)}>
                        Close
                      </button>
                    </div>
                    <div className="max-h-[calc(80vh-56px)] overflow-auto p-4">
                      {preview.map((p) => (
                        <div key={p.file_id} className="mb-6">
                          <div className="mb-2 text-sm font-semibold">
                            File {p.file_id} - {p.total_chunks} chunk(s)
                          </div>
                          {p.total_chunks === 0 ? (
                            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                              No text extracted.
                            </div>
                          ) : (
                            <div className="grid gap-3">
                              {p.previews.map((pr) => (
                                <div key={pr.idx} className="rounded-xl border border-slate-200 p-3">
                                  <div className="mb-1 text-xs font-semibold text-slate-600">
                                    Chunk #{pr.idx} {pr.page_start ? `(pages ${pr.page_start}-${pr.page_end})` : ""}
                                    <span className="ml-2 font-normal text-slate-400">{pr.char_len} chars</span>
                                  </div>
                                  <pre className="m-0 whitespace-pre-wrap text-xs leading-5 text-slate-700">
                                    {pr.sample}
                                  </pre>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeFile && (
                <FileViewer
                  url={activeFile.storage_url}
                  name={activeFile.filename}
                  mime={(activeFile as any).mime || null}
                  onClose={() => setActiveFile(null)}
                />
              )}
            </>
          )}
          </div>
        </section>
      </div>

      {showCreate && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-lg font-semibold text-slate-900">New class</div>
            <input
              value={newClassName}
              onChange={(e) => setNewClassName(e.target.value)}
              placeholder="Class name"
              className="mt-4 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
            />
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button
                variant="primary"
                onClick={() => {
                  if (!newClassName.trim()) return;
                  handleCreate(newClassName.trim());
                }}
              >
                Create
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
