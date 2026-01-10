// src/pages/Classes.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import ClassSidebar from "../components/ClassSidebar";
import ClassHeaderButtons from "../components/ClassHeaderButtons";
import AppShell from "../layouts/AppShell";
import Button from "../components/Button";
import KebabMenu from "../components/KebabMenu";
import PdfStudyViewer, { type PdfSelection, type PdfSnip } from "../components/PdfStudyViewer";

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
  listChatSessionMessages,
  addChatMessages,
  deleteChatSession,
  clearChatSessionMessages,
  type ChatSession,
  type ChatMessage,
  ocrImageSnippet,
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

function isPdfFile(file?: FileRow | null) {
  if (!file) return false;
  if ((file as any).mime_type && String((file as any).mime_type).includes("pdf")) return true;
  return file.filename.toLowerCase().endsWith(".pdf");
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
  const [chatPanelOpen, setChatPanelOpen] = useState(true);
  const [chatDrawerOpen, setChatDrawerOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ type: "delete" | "clear"; session: ChatSession } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [selectedQuote, setSelectedQuote] = useState<{ text: string; fileId?: string | null } | null>(null);
  const [pendingSnip, setPendingSnip] = useState<PdfSnip | null>(null);
  const [selectionMenu, setSelectionMenu] = useState<{
    text: string;
    x: number;
    y: number;
    fileId?: string | null;
    page?: number | null;
  } | null>(null);

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
      setActiveFile(null);
      setSelectedQuote(null);
      setSelectionMenu(null);
      setChatDrawerOpen(false);
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
    setMessages([]);
    setPendingSnip(null);
    (async () => {
      const msgs = await listChatSessionMessages(activeSessionId);
      const normalized = (msgs || []).map((m) => ({
        ...m,
        citations: m.citations ?? undefined,
        selected_text: m.selected_text ?? null,
        file_id: m.file_id ?? null,
        file_scope: m.file_scope ?? null,
        image_attachment: m.image_attachment ?? null,
      }));
      setMessages(normalized);
    })();
  }, [activeSessionId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, chatBusy]);

  useEffect(() => {
    if (!selectionMenu) return;
    const clear = () => setSelectionMenu(null);
    window.addEventListener("scroll", clear, true);
    window.addEventListener("mousedown", clear);
    return () => {
      window.removeEventListener("scroll", clear, true);
      window.removeEventListener("mousedown", clear);
    };
  }, [selectionMenu]);

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

  async function onAsk(opts?: { content?: string; attachment?: PdfSnip | null }) {
    if (!selectedId) return;
    const content = (opts?.content ?? chatInput).trim();
    if (!content) return;

    let sessionId = activeSessionId;
    if (!sessionId) {
      const s = await createChatSession({ class_id: selectedId, title: "New chat" });
      setSessions((prev) => [s, ...prev]);
      sessionId = s.id;
      setActiveSessionId(s.id);
    }

    const pendingAttachment = opts?.attachment ?? null;
    const userMsg: Msg = {
      id: crypto.randomUUID?.() ?? String(Date.now()),
      role: "user",
      content,
      selected_text: selectedQuote?.text ?? null,
      file_id: selectedQuote?.fileId ?? null,
      image_attachment: pendingAttachment ?? null,
    };
    setMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setChatBusy(true);
    setSelectedQuote(null);
    setPendingSnip(null);

    let selectedText = selectedQuote?.text ?? null;
    let assistantText = "Sorry, I couldn't finish that response. Please try again.";
    let citations: any = null;
    try {
      let question = selectedText ? `Selected text:\n"${selectedText}"\n\n${userMsg.content}` : userMsg.content;
      if (pendingAttachment?.data_url && !selectedText) {
        try {
          const ocr = await ocrImageSnippet(pendingAttachment.data_url);
          if (ocr?.text) {
            selectedText = ocr.text;
            question = `Snippet text:\n"${ocr.text}"\n\n${userMsg.content}`;
          }
        } catch {
          /* ignore OCR failures */
        }
      }
      const effectiveFileIds = selectedQuote?.fileId
        ? [selectedQuote.fileId]
        : pendingAttachment?.file_id
          ? [pendingAttachment.file_id]
          : scopeFileIds.length
            ? scopeFileIds
            : undefined;
      const res = await chatAsk({
        class_id: selectedId,
        question,
        top_k: 8,
        file_ids: effectiveFileIds,
      });
      assistantText = (res.answer || "").trim() || "Not found in the uploaded material.";
      citations = res.citations ?? null;
    } catch {
      showToastMessage("Couldn't save that message. Try again.");
    }

    const botMsg: Msg = {
      id: crypto.randomUUID?.() ?? String(Date.now() + 1),
      role: "assistant",
      content: assistantText,
      citations: citations ?? undefined,
    };
    setMessages((prev) => [...prev, botMsg]);
    try {
      const saved = await addChatMessages({
        session_id: sessionId!,
        user_content: userMsg.content,
        assistant_content: botMsg.content,
        citations,
        selected_text: selectedText ?? null,
        file_id: userMsg.file_id ?? pendingAttachment?.file_id ?? null,
        file_scope: scopeFileIds.length ? scopeFileIds : null,
        image_attachment: pendingAttachment ?? null,
      });
      if (Array.isArray(saved?.messages)) {
        const normalized = saved.messages.map((m) => ({
          ...m,
          citations: m.citations ?? undefined,
          selected_text: m.selected_text ?? null,
          file_id: m.file_id ?? null,
          file_scope: m.file_scope ?? null,
          image_attachment: m.image_attachment ?? null,
        }));
        setMessages(normalized);
      }
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, updated_at: new Date().toISOString() } : s))
      );
    } catch {
      showToastMessage("Couldn't save that message. Try again.");
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

  function handlePdfSelection(sel: PdfSelection) {
    if (!activeFile) return;
    if (!sel.text) {
      setSelectionMenu(null);
      return;
    }
    setSelectionMenu({
      text: sel.text,
      x: sel.rect.left + sel.rect.width / 2,
      y: Math.max(sel.rect.top - 8, 8),
      fileId: activeFile.id,
      page: sel.page,
    });
  }

  function handlePdfSnip(snip: PdfSnip) {
    const withFile = { ...snip, file_id: activeFile?.id ?? null };
    setPendingSnip(withFile);
    setChatPanelOpen(true);
    setChatDrawerOpen(true);
    setSelectionMenu(null);
  }

  function startQuote(prompt: string, text: string, fileId?: string | null) {
    setSelectedQuote({ text, fileId: fileId ?? null });
    setPendingSnip(null);
    setChatInput(prompt);
    setChatPanelOpen(true);
    setChatDrawerOpen(true);
    setSelectionMenu(null);
  }

  function showToastMessage(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2500);
  }

  function handleSendSnip() {
    if (!pendingSnip) return;
    const prompt = chatInput.trim() ? chatInput.trim() : "Explain this snippet.";
    onAsk({ content: prompt, attachment: pendingSnip });
  }

  async function handleConfirmAction() {
    if (!confirmDialog) return;
    const { session, type } = confirmDialog;
    try {
      if (type === "delete") {
        await deleteChatSession(session.id, selectedId ?? undefined);
        setSessions((prev) => {
          const next = prev.filter((s) => s.id !== session.id);
          if (activeSessionId === session.id) {
            setActiveSessionId(next[0]?.id ?? null);
            setMessages([]);
            setChatInput("");
            setSelectedQuote(null);
          }
          return next;
        });
      } else {
        await clearChatSessionMessages(session.id);
        if (activeSessionId === session.id) {
          setMessages([]);
        }
      }
    } catch {
      showToastMessage(
        type === "delete" ? "Couldn't delete chat. Try again." : "Couldn't clear messages. Try again."
      );
    } finally {
      setConfirmDialog(null);
    }
  }

  const currentClass = selectedId
    ? classes.find((c) => c.id === selectedId)?.name
    : null;

  return (
    <AppShell title="Classes" breadcrumbs={["Classes"]}>
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

                <div className="mt-6">
                  {!activeFile ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
                      Select a document to open the study workspace.
                    </div>
                  ) : (
                    <div className="relative">
                      <div
                        className={`grid gap-4 ${
                          chatPanelOpen ? "xl:grid-cols-[minmax(0,1fr)_360px]" : "grid-cols-1"
                        }`}
                      >
                        <div className="space-y-4">
                          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                              <div>
                                <div className="text-sm font-semibold text-slate-900">{activeFile.filename}</div>
                                <div className="text-xs text-slate-500">Document workspace</div>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 xl:hidden"
                                  onClick={() => setChatDrawerOpen(true)}
                                >
                                  Open assistant
                                </button>
                                <a
                                  href={activeFile.storage_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600"
                                >
                                  Open
                                </a>
                                <a
                                  href={activeFile.storage_url}
                                  download
                                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600"
                                >
                                  Download
                                </a>
                                <button
                                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600"
                                  onClick={() => setActiveFile(null)}
                                >
                                  Close
                                </button>
                              </div>
                            </div>
                            <div className="h-[75vh] bg-slate-50">
                              {isPdfFile(activeFile) ? (
                                <PdfStudyViewer
                                  fileUrl={activeFile.storage_url}
                                  fileName={activeFile.filename}
                                  onTextSelect={handlePdfSelection}
                                  onSnip={handlePdfSnip}
                                  onSnipError={showToastMessage}
                                />
                              ) : (
                                <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-500">
                                  Preview is available for PDF files. You can open or download this file instead.
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {chatPanelOpen && (
                          <aside className="hidden h-[75vh] flex-col rounded-2xl border border-slate-200 bg-white shadow-sm xl:flex">
                            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                              <div className="text-sm font-semibold">Study Assistant</div>
                              <div className="flex items-center gap-2">
                                <label className="flex items-center gap-2 text-xs text-slate-500">
                                  <input
                                    type="checkbox"
                                    checked={showCitations}
                                    onChange={() => setShowCitations((v) => !v)}
                                  />
                                  Citations
                                </label>
                                <button
                                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600"
                                  onClick={() => setChatPanelOpen(false)}
                                >
                                  Collapse
                                </button>
                              </div>
                            </div>
                            <div className="border-b border-slate-200 px-4 py-3">
                              <div className="flex items-center gap-2">
                                <select
                                  className="h-9 flex-1 rounded-lg border border-slate-200 px-2 text-xs"
                                  value={activeSessionId ?? ""}
                                  onChange={(e) => setActiveSessionId(e.target.value)}
                                >
                                  <option value="" disabled>
                                    Select a session
                                  </option>
                                  {sessions.map((s) => (
                                    <option key={s.id} value={s.id}>
                                      {s.title}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  onClick={startNewSession}
                                  className="h-9 rounded-lg border border-slate-200 px-2 text-xs"
                                >
                                  New
                                </button>
                              </div>
                              <div className="mt-2 text-[11px] text-slate-400">
                                {sessions.length === 0 ? "No sessions yet." : "Pick a session to keep history."}
                              </div>
                            </div>
                            <div className="border-b border-slate-200 px-4 py-3">
                              <div className="text-xs font-semibold text-slate-600">Scope</div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {(files ?? []).length === 0 ? (
                                  <span className="text-[11px] text-slate-400">Upload files to enable scope.</span>
                                ) : (
                                  (files ?? []).map((f) => {
                                    const checked = scopeFileIds.includes(f.id);
                                    return (
                                      <button
                                        key={f.id}
                                        onClick={() => toggleFileScope(f.id)}
                                        className={`rounded-full border px-3 py-1 text-[11px] ${
                                          checked
                                            ? "border-slate-900 bg-slate-900 text-white"
                                            : "border-slate-200 text-slate-600"
                                        }`}
                                      >
                                        {f.filename}
                                      </button>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                            <div className="flex-1 overflow-auto p-4 space-y-4">
                              {messages.length === 0 ? (
                                <div className="text-sm text-slate-500">
                                  No messages yet. Ask about the document on the left.
                                </div>
                              ) : (
                                messages.map((m) => {
                                  const show =
                                    showCitations && m.role === "assistant" && (m.citations?.length ?? 0) > 0;
                                  return (
                                    <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                                      <div
                                        className={`max-w-[85%] rounded-2xl border px-4 py-3 text-sm leading-6 ${
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
                                            <div className="text-[10px] uppercase tracking-wide opacity-70">
                                              Selected text
                                            </div>
                                            <div className="mt-1 whitespace-pre-wrap">{m.selected_text}</div>
                                          </div>
                                        )}
                                        {m.image_attachment?.data_url && (
                                          <div className="mb-2">
                                            <img
                                              src={m.image_attachment.data_url}
                                              alt="Snippet"
                                              className="max-h-32 rounded-lg border border-slate-200 object-contain"
                                            />
                                          </div>
                                        )}
                                        <div className="whitespace-pre-wrap">{m.content}</div>
                                        {show && (
                                          <div className="mt-3 border-t border-slate-200 pt-2 text-xs text-slate-500">
                                            {(m.citations ?? []).slice(0, 4).map((c: any, idx: number) => (
                                              <div key={`${c?.chunk_id ?? idx}`}>
                                                {c?.filename ?? "Source"}
                                                {c?.page_start
                                                  ? ` (p${c.page_start}-${c.page_end ?? c.page_start})`
                                                  : ""}
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
                              {selectedQuote && (
                                <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-semibold">Quote attached</span>
                                    <button
                                      className="rounded-lg border border-amber-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-amber-700"
                                      onClick={() => setSelectedQuote(null)}
                                    >
                                      Clear quote
                                    </button>
                                  </div>
                                  <div className="mt-2 whitespace-pre-wrap text-[11px] text-amber-900">
                                    {selectedQuote.text}
                                  </div>
                                </div>
                              )}
                              {pendingSnip && (
                                <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-semibold">Snippet ready</span>
                                    <div className="flex items-center gap-2">
                                      <button
                                        className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600"
                                        onClick={handleSendSnip}
                                      >
                                        Send to chat
                                      </button>
                                      <button
                                        className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600"
                                        onClick={() => setPendingSnip(null)}
                                      >
                                        Discard
                                      </button>
                                    </div>
                                  </div>
                                  <img
                                    src={pendingSnip.data_url}
                                    alt="Snippet preview"
                                    className="mt-2 max-h-28 rounded-lg border border-slate-200 object-contain"
                                  />
                                </div>
                              )}
                              <div className="flex gap-3">
                                <textarea
                                  value={chatInput}
                                  onChange={(e) => setChatInput(e.target.value)}
                                  className="min-h-[52px] flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20"
                                  placeholder="Ask about this document..."
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
                          </aside>
                        )}
                      </div>

                      {!chatPanelOpen && (
                        <button
                          onClick={() => setChatPanelOpen(true)}
                          className="absolute right-0 top-2 hidden -translate-y-1/2 rounded-l-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm xl:flex"
                        >
                          Study Assistant
                        </button>
                      )}

                      {selectionMenu && (
                        <div
                          className="fixed z-50"
                          style={{ left: selectionMenu.x, top: selectionMenu.y }}
                          onMouseDown={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 text-xs shadow-lg">
                            <button
                              className="rounded-full px-2 py-1 hover:bg-slate-100"
                              onClick={() => startQuote("Ask about this part.", selectionMenu.text, selectionMenu.fileId)}
                            >
                              Ask
                            </button>
                            <button
                              className="rounded-full px-2 py-1 hover:bg-slate-100"
                              onClick={() =>
                                startQuote("Explain this part clearly.", selectionMenu.text, selectionMenu.fileId)
                              }
                            >
                              Explain
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

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
                          <div
                            key={s.id}
                            className={`flex items-start justify-between gap-2 rounded-xl border px-3 py-2 text-left text-xs ${
                              s.id === activeSessionId
                                ? "border-slate-900 bg-slate-50"
                                : "border-slate-200 hover:border-slate-300"
                            }`}
                          >
                            <button
                              onClick={() => setActiveSessionId(s.id)}
                              className="flex-1 text-left"
                            >
                              <div className={`truncate ${s.id === activeSessionId ? "font-semibold" : ""}`}>{s.title}</div>
                              <div className="text-[10px] text-slate-400 truncate">
                                {new Date(s.updated_at || s.created_at || "").toLocaleString()}
                              </div>
                            </button>
                            <KebabMenu
                              items={[
                                { label: "Clear messages", onClick: () => setConfirmDialog({ type: "clear", session: s }) },
                                { label: "Delete chat", onClick: () => setConfirmDialog({ type: "delete", session: s }) },
                              ]}
                            />
                          </div>
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
                        <div className="text-sm text-slate-500">No messages yet. Ask about your class materials.</div>
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
                      {selectedQuote && (
                        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold">Quote attached</span>
                            <button
                              className="rounded-lg border border-amber-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-amber-700"
                              onClick={() => setSelectedQuote(null)}
                            >
                              Clear quote
                            </button>
                          </div>
                          <div className="mt-2 whitespace-pre-wrap text-[11px] text-amber-900">{selectedQuote.text}</div>
                        </div>
                      )}
                      {pendingSnip && (
                        <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold">Snippet ready</span>
                            <div className="flex items-center gap-2">
                              <button
                                className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600"
                                onClick={handleSendSnip}
                              >
                                Send to chat
                              </button>
                              <button
                                className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600"
                                onClick={() => setPendingSnip(null)}
                              >
                                Discard
                              </button>
                            </div>
                          </div>
                          <img
                            src={pendingSnip.data_url}
                            alt="Snippet preview"
                            className="mt-2 max-h-32 rounded-lg border border-slate-200 object-contain"
                          />
                        </div>
                      )}
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

            </>
          )}
          </div>
        </section>
      </div>

      {chatDrawerOpen && (
        <div className="fixed inset-0 z-50 flex xl:hidden">
          <div className="flex-1 bg-slate-900/40" onClick={() => setChatDrawerOpen(false)} />
          <aside className="flex w-[min(92vw,360px)] flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div className="text-sm font-semibold">Study Assistant</div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-xs text-slate-500">
                  <input
                    type="checkbox"
                    checked={showCitations}
                    onChange={() => setShowCitations((v) => !v)}
                  />
                  Citations
                </label>
                <button
                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600"
                  onClick={() => setChatDrawerOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>
            <div className="border-b border-slate-200 px-4 py-3">
              <div className="flex items-center gap-2">
                <select
                  className="h-9 flex-1 rounded-lg border border-slate-200 px-2 text-xs"
                  value={activeSessionId ?? ""}
                  onChange={(e) => setActiveSessionId(e.target.value)}
                >
                  <option value="" disabled>
                    Select a session
                  </option>
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
                <button
                  onClick={startNewSession}
                  className="h-9 rounded-lg border border-slate-200 px-2 text-xs"
                >
                  New
                </button>
              </div>
              <div className="mt-2 text-[11px] text-slate-400">
                {sessions.length === 0 ? "No sessions yet." : "Pick a session to keep history."}
              </div>
            </div>
            <div className="border-b border-slate-200 px-4 py-3">
              <div className="text-xs font-semibold text-slate-600">Scope</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(files ?? []).length === 0 ? (
                  <span className="text-[11px] text-slate-400">Upload files to enable scope.</span>
                ) : (
                  (files ?? []).map((f) => {
                    const checked = scopeFileIds.includes(f.id);
                    return (
                      <button
                        key={f.id}
                        onClick={() => toggleFileScope(f.id)}
                        className={`rounded-full border px-3 py-1 text-[11px] ${
                          checked ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600"
                        }`}
                      >
                        {f.filename}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-4">
              {messages.length === 0 ? (
                <div className="text-sm text-slate-500">No messages yet. Ask about the document on the left.</div>
              ) : (
                messages.map((m) => {
                  const show = showCitations && m.role === "assistant" && (m.citations?.length ?? 0) > 0;
                  return (
                    <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[85%] rounded-2xl border px-4 py-3 text-sm leading-6 ${
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
                              className="max-h-32 rounded-lg border border-slate-200 object-contain"
                            />
                          </div>
                        )}
                        <div className="whitespace-pre-wrap">{m.content}</div>
                        {show && (
                          <div className="mt-3 border-t border-slate-200 pt-2 text-xs text-slate-500">
                            {(m.citations ?? []).slice(0, 4).map((c: any, idx: number) => (
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
              {selectedQuote && (
                <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">Quote attached</span>
                    <button
                      className="rounded-lg border border-amber-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-amber-700"
                      onClick={() => setSelectedQuote(null)}
                    >
                      Clear quote
                    </button>
                  </div>
                  <div className="mt-2 whitespace-pre-wrap text-[11px] text-amber-900">{selectedQuote.text}</div>
                </div>
              )}
              {pendingSnip && (
                <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">Snippet ready</span>
                    <div className="flex items-center gap-2">
                      <button
                        className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600"
                        onClick={handleSendSnip}
                      >
                        Send to chat
                      </button>
                      <button
                        className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600"
                        onClick={() => setPendingSnip(null)}
                      >
                        Discard
                      </button>
                    </div>
                  </div>
                  <img
                    src={pendingSnip.data_url}
                    alt="Snippet preview"
                    className="mt-2 max-h-28 rounded-lg border border-slate-200 object-contain"
                  />
                </div>
              )}
              <div className="flex gap-3">
                <textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  className="min-h-[52px] flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20"
                  placeholder="Ask about this document..."
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
          </aside>
        </div>
      )}

      {confirmDialog && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => setConfirmDialog(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-lg font-semibold text-slate-900">
              {confirmDialog.type === "delete" ? "Delete this chat?" : "Clear messages?"}
            </div>
            <div className="mt-2 text-sm text-slate-600">
              {confirmDialog.type === "delete"
                ? "This will permanently delete the chat and its messages. This can't be undone."
                : "This will remove all messages in this chat. You can't undo this."}
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button onClick={() => setConfirmDialog(null)}>Cancel</Button>
              <Button
                className="border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300"
                onClick={handleConfirmAction}
              >
                {confirmDialog.type === "delete" ? "Delete" : "Clear"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

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
    </AppShell>
  );
}
