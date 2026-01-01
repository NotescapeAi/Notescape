// src/pages/Classes.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import ClassSidebar from "../components/ClassSidebar";
import ClassHeaderButtons from "../components/ClassHeaderButtons";
import FileViewer from "../components/FileViewer";

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

  // ✅ chat
  chatAsk,
} from "../lib/api";

/* -------------------- constants / helpers -------------------- */
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
  // Some browsers mislabel Office docs; accept by extension as a fallback.
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

function timeLocal(s?: string | null) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString();
  } catch {
    return s;
  }
}

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

function Divider() {
  return <div style={{ height: 1, background: "#EEF2F6", margin: "12px 0" }} />;
}

/* -------------------- ✅ Mini Chat types -------------------- */
type MiniMsg = { id: string; role: "user" | "assistant"; text: string };

/* -------------------- page -------------------- */
export default function Classes() {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

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
  const [showUploadHint, setShowUploadHint] = useState(false);

  // ✅ Coursera-style mini chat (Whole class only, no saved history)
  const [miniChatInput, setMiniChatInput] = useState("");
  const [miniMsgs, setMiniMsgs] = useState<MiniMsg[]>([]);
  const [miniBusy, setMiniBusy] = useState(false);
  const miniEndRef = useRef<HTMLDivElement | null>(null);

  const location = useLocation();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // load classes once
  useEffect(() => {
    (async () => setClasses(await listClasses()))();
  }, []);

  // if we arrived from Flashcards with a class id, auto-select it
  useEffect(() => {
    const st = (location as any)?.state;
    if (st?.selectId) setSelectedId(Number(st.selectId));
  }, [location]);

  // load files + cards on class change
  useEffect(() => {
    if (selectedId == null) {
      setFiles([]);
      setSel({});
      setCards([]);
      setMiniMsgs([]);
      return;
    }
    (async () => {
      const fs = await listFiles(selectedId);
      setFiles(fs ?? []); // null-safe
      setSel({});
      try {
        setCards(await listFlashcards(selectedId));
      } catch {
        /* ok if empty */
      }
    })();
  }, [selectedId]);

  // ✅ mini chat auto-scroll
  useEffect(() => {
    miniEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [miniMsgs, miniBusy]);

  // Vite dev proxy handles /api and /uploads
  const API_BASE_FOR_DOWNLOADS = "";

  /* -------- class CRUD -------- */
  async function handleCreate(name: string) {
    const row = await createClass({ name, subject: "General" });
    setClasses((xs) => [...xs, row]);
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
      setMiniMsgs([]);
    }
  }

  /* -------- uploads (drag/drop + click) -------- */
  function acceptFile(f: File) {
    return isAllowed(f);
  }

  // ✅ OPTIONAL BUT BEST: auto-index uploaded files for chat (chunks+embeddings)
  async function autoIndexUploadedFiles(classId: number, fileIds: string[]) {
    if (!fileIds.length) return;

    // Don’t show the chunk preview popup during auto-indexing
    await createChunks({
    file_ids: fileIds,

    by: "auto",       // ✅ backend supports
    size: 2000,       // chars per chunk (since backend is char-based)
    overlap: 200,
    preview_limit_per_file: 0,
  });




    // Build embeddings for this class (includes those new chunks)
    await buildEmbeddings(classId, 2000);
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

    const uploadedIds: string[] = [];
    try {
      for (const f of accepted) {
        const row = await uploadFile(selectedId, f);
        uploadedIds.push(row.id);
        setFiles((xs) => [row, ...(xs ?? [])]);
      }

      // ✅ Auto-index after upload (best UX)
      setBusyFlow(true);
      try {
        await autoIndexUploadedFiles(selectedId, uploadedIds);
      } catch (e: any) {
        alert(
          `Uploaded, but indexing failed.\nYou can still generate chunks/embeddings later.\n\n${
            e?.message ?? ""
          }`
        );
      } finally {
        setBusyFlow(false);
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

  /* -------- selection helpers -------- */
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

  /* -------- pipeline: chunks → embeddings → cards -------- */
  async function onGenerateFlashcards() {
    if (!selectedId) return alert("Select a class first");
    if ((files?.length ?? 0) === 0) return alert("Upload at least one file first");

    const ids = selectedIds.length ? selectedIds : (files ?? []).map((f) => f.id);

    setBusyFlow(true);
    try {
      // 1) chunk
      const res: ChunkPreview[] = await createChunks({
        file_ids: ids,
        by: "page",
        size: 1,
        overlap: 0,
        preview_limit_per_file: 2,
      });
      setPreview(res);

      // 2) embeddings
      await buildEmbeddings(selectedId, 1000);

      // 3) generate cards
      const difficulty =
        (localStorage.getItem("fc_pref_difficulty") as "easy" | "medium" | "hard") ||
        "medium";

      const created = await generateFlashcards({
        class_id: selectedId,
        file_ids: ids,
        top_k: 12,
        difficulty,
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

  /* -------------------- ✅ Coursera Mini Chat (RAG) -------------------- */
  async function onMiniAsk() {
    if (!selectedId) return alert("Select a class first.");
    const q = miniChatInput.trim();
    if (!q) return;

    const userMsg: MiniMsg = {
      id: crypto.randomUUID?.() ?? String(Date.now()),
      role: "user",
      text: q,
    };

    setMiniMsgs((prev) => [...prev, userMsg]);
    setMiniChatInput("");
    setMiniBusy(true);

    try {
      const res = await chatAsk({
        class_id: selectedId,
        question: q,
        top_k: 8,
      });

      const ans = (res?.answer ?? "").trim();

      const botMsg: MiniMsg = {
        id: crypto.randomUUID?.() ?? String(Date.now() + 1),
        role: "assistant",
        text: ans || "I couldn’t find that in your class material.",
      };

      setMiniMsgs((prev) => [...prev, botMsg]);
    } catch (e: any) {
      setMiniMsgs((prev) => [
        ...prev,
        {
          id: crypto.randomUUID?.() ?? String(Date.now() + 2),
          role: "assistant",
          text: e?.message ?? "Chat failed",
        },
      ]);
    } finally {
      setMiniBusy(false);
    }
  }

  /* -------------------- UI -------------------- */
  const currentClass = selectedId ? classes.find((c) => c.id === selectedId)?.name : null;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "320px 1fr",
        minHeight: "100vh",
        background: "#FAFAFB",
      }}
    >
      {/* Sidebar */}
      <ClassSidebar
        items={classes}
        selectedId={selectedId}
        onSelect={(id) => setSelectedId(id)}
        onCreate={handleCreate}
        onRename={handleRename}
        onDelete={handleDeleteClass}
      />

      {/* Main */}
      <section style={{ padding: 20 }}>
        {/* Header */}
        <div
          style={{
            background: "#fff",
            border: "1px solid #EEF2F6",
            borderRadius: 14,
            padding: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0 }}>{currentClass ?? "Workspace"}</h2>
            {busyUpload && <Badge>Uploading…</Badge>}
            {busyFlow && <Badge>Processing…</Badge>}
            {showUploadHint && <Badge>Allowed: PDF • PPTX • DOCX</Badge>}
          </div>

          {selectedId && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Button
                kind="default"
                onClick={() => {
                  setShowUploadHint(true);
                  setTimeout(() => setShowUploadHint(false), 2200);
                  fileInputRef.current?.click();
                }}
                title="Choose files"
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
              <ClassHeaderButtons classId={String(selectedId)} onGenerate={() => onGenerateFlashcards()} />
            </div>
          )}
        </div>

        <Divider />

        {!selectedId ? (
          <div
            style={{
              background: "#fff",
              border: "1px solid #EEF2F6",
              borderRadius: 14,
              padding: 24,
              color: "#667085",
            }}
          >
            Select a class from the left to start.
          </div>
        ) : (
          <>
            {/* Dropzone */}
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => {
                setShowUploadHint(true);
                setTimeout(() => setShowUploadHint(false), 2200);
                fileInputRef.current?.click();
              }}
              role="button"
              title="Drag & drop files here or click to choose"
              style={{
                border: `2px dashed ${dropping ? "#7B5FEF" : "#cfd4dc"}`,
                background: dropping ? "rgba(123,95,239,0.06)" : "#fff",
                borderRadius: 14,
                padding: 20,
                cursor: "pointer",
                userSelect: "none",
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Drop files here or click to upload</div>
              <div style={{ fontSize: 13, color: "#475467" }}>
                {dropping ? "Allowed: PDF, PPTX, DOCX" : "Multiple files supported"}
              </div>
              {invalidDropCount > 0 && (
                <div
                  style={{
                    marginTop: 10,
                    border: "1px solid #FEE4E2",
                    background: "#FEF3F2",
                    color: "#B42318",
                    borderRadius: 10,
                    padding: 10,
                    fontSize: 13,
                  }}
                >
                  Ignored {invalidDropCount} unsupported file{invalidDropCount > 1 ? "s" : ""}. Allowed types:
                  PDF, PPTX, DOCX.
                </div>
              )}
            </div>

            <Divider />

            {/* ✅ Coursera-style mini chat (whole class only) */}
            <div
              style={{
                background: "#fff",
                border: "1px solid #EEF2F6",
                borderRadius: 14,
                padding: 14,
              }}
            >
              <div style={{ fontWeight: 800, marginBottom: 10 }}>Ask AI (Class)</div>

              {/* scrollable chat area */}
              <div
                style={{
                  height: 260,
                  overflowY: "auto",
                  padding: 12,
                  border: "1px solid #EEF2F6",
                  borderRadius: 12,
                  background: "#FAFAFB",
                }}
              >
                {miniMsgs.length === 0 ? (
                  <div style={{ color: "#667085", fontSize: 13 }}>
                    Ask from this class material. (No chat history is saved.)
                  </div>
                ) : (
                  miniMsgs.map((m) => (
                    <div
                      key={m.id}
                      style={{
                        marginBottom: 10,
                        display: "flex",
                        justifyContent: m.role === "user" ? "flex-end" : "flex-start",
                      }}
                    >
                      <div
                        style={{
                          maxWidth: "80%",
                          padding: "10px 12px",
                          borderRadius: 14,
                          background: m.role === "user" ? "rgba(123,95,239,0.12)" : "#fff",
                          border: "1px solid #E4E7EC",
                          whiteSpace: "pre-wrap",
                          lineHeight: 1.45,
                        }}
                      >
                        {m.text}
                      </div>
                    </div>
                  ))
                )}

                {miniBusy && <div style={{ color: "#667085", fontSize: 13 }}>Thinking…</div>}
                <div ref={miniEndRef} />
              </div>

              {/* input pinned */}
              <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                <textarea
                  value={miniChatInput}
                  onChange={(e) => setMiniChatInput(e.target.value)}
                  rows={2}
                  placeholder="Ask from this class material..."
                  style={{
                    flex: 1,
                    padding: 10,
                    borderRadius: 12,
                    border: "1px solid #E4E7EC",
                    outline: "none",
                    resize: "vertical",
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      onMiniAsk();
                    }
                  }}
                />

                <button
                  onClick={onMiniAsk}
                  disabled={miniBusy || !miniChatInput.trim()}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: "1px solid #7B5FEF",
                    background: "#7B5FEF",
                    color: "#fff",
                    cursor: miniBusy || !miniChatInput.trim() ? "not-allowed" : "pointer",
                    opacity: miniBusy || !miniChatInput.trim() ? 0.7 : 1,
                  }}
                >
                  {miniBusy ? "…" : "Ask"}
                </button>
              </div>

              <div style={{ fontSize: 12, color: "#667085", marginTop: 6 }}>
                Tip: Enter to send • Shift+Enter for new line
              </div>
            </div>

            <Divider />

            {/* Files table */}
            <div
              style={{
                background: "#fff",
                border: "1px solid #EEF2F6",
                borderRadius: 14,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: 12,
                  borderBottom: "1px solid #EEF2F6",
                }}
              >
                <div style={{ fontWeight: 700 }}>Files</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Badge>{selectedIds.length} selected</Badge>
                  {selectedIds.length > 0 && (
                    <Button
                      kind="danger"
                      onClick={async () => {
                        const toDelete = (files ?? []).filter((f) => selectedIds.includes(f.id));
                        if (!confirm(`Delete ${toDelete.length} file(s)?`)) return;
                        for (const f of toDelete) await onDeleteFile(f.id, f.filename);
                        setSel({});
                      }}
                    >
                      🗑️ Delete selected
                    </Button>
                  )}
                </div>
              </div>

              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 14,
                }}
              >
                <thead>
                  <tr style={{ background: "#FAFAFB" }}>
                    <th
                      style={{
                        textAlign: "left",
                        borderBottom: "1px solid #EEF2F6",
                        width: 42,
                        padding: "10px 12px",
                      }}
                    >
                      <input
                        type="checkbox"
                        aria-label="Select all"
                        checked={(files?.length ?? 0) > 0 && selectedIds.length === (files?.length ?? 0)}
                        onChange={(e) => toggleAll(e.target.checked)}
                      />
                    </th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #EEF2F6", padding: "10px 12px" }}>
                      File
                    </th>
                    <th
                      style={{
                        textAlign: "left",
                        borderBottom: "1px solid #EEF2F6",
                        padding: "10px 12px",
                        width: 120,
                      }}
                    >
                      Size
                    </th>
                    <th
                      style={{
                        textAlign: "left",
                        borderBottom: "1px solid #EEF2F6",
                        padding: "10px 12px",
                        width: 220,
                      }}
                    >
                      Uploaded
                    </th>
                    <th
                      style={{
                        textAlign: "left",
                        borderBottom: "1px solid #EEF2F6",
                        padding: "10px 12px",
                        width: 100,
                      }}
                    >
                      Open
                    </th>
                    <th
                      style={{
                        textAlign: "left",
                        borderBottom: "1px solid #EEF2F6",
                        padding: "10px 12px",
                        width: 120,
                      }}
                    >
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(files ?? []).map((f) => (
                    <tr key={f.id} style={{ borderBottom: "1px solid #F2F4F7" }}>
                      <td style={{ padding: "10px 12px" }}>
                        <input
                          type="checkbox"
                          checked={!!sel[f.id]}
                          onChange={(e) => toggleOne(f.id, e.target.checked)}
                          aria-label={`Select ${f.filename}`}
                        />
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span
                            style={{ fontWeight: 600, color: "#101828", cursor: "pointer" }}
                            onClick={() => setActiveFile(f)}
                            title="Open preview"
                          >
                            {f.filename}
                          </span>
                          <Badge>{(f.filename.split(".").pop() || "").toUpperCase()}</Badge>
                        </div>
                      </td>
                      <td style={{ padding: "10px 12px" }}>{prettyBytes(f.size_bytes)}</td>
                      <td style={{ padding: "10px 12px" }}>{timeLocal(f.uploaded_at)}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <Button kind="ghost" onClick={() => setActiveFile(f)} title="Open in viewer">
                          view
                        </Button>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <Button kind="default" onClick={() => onDeleteFile(f.id, f.filename)} title="Delete file">
                          🗑️ Delete
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {(files?.length ?? 0) === 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: 18, color: "#667085" }}>
                        No files yet. Drop a PDF, PPTX, or DOCX to begin.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Chunk preview dialog */}
            {preview && (
              <div
                role="dialog"
                aria-modal="true"
                style={{
                  position: "fixed",
                  inset: 0,
                  background: "rgba(16,24,40,0.35)",
                  display: "flex",
                  alignItems: "flex-end",
                  zIndex: 50,
                }}
                onClick={() => setPreview(null)}
              >
                <div
                  style={{
                    width: "min(920px, 96vw)",
                    maxHeight: "80vh",
                    margin: "0 auto 24px",
                    background: "#fff",
                    borderRadius: 16,
                    boxShadow: "0 20px 50px rgba(16,24,40,.25)",
                    overflow: "hidden",
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "12px 16px",
                      borderBottom: "1px solid #eee",
                    }}
                  >
                    <strong>Chunk Previews</strong>
                    <Button kind="default" onClick={() => setPreview(null)}>
                      Close
                    </Button>
                  </div>
                  <div
                    style={{
                      padding: 16,
                      overflow: "auto",
                      maxHeight: "calc(80vh - 56px)",
                    }}
                  >
                    {preview.map((p) => (
                      <div key={p.file_id} style={{ marginBottom: 18 }}>
                        <div style={{ fontWeight: 800, marginBottom: 6 }}>
                          File {p.file_id} — {p.total_chunks} chunk(s)
                        </div>
                        {p.total_chunks === 0 ? (
                          <div
                            style={{
                              border: "1px solid #FDEFC7",
                              background: "#FFF8E6",
                              color: "#8B5E00",
                              borderRadius: 12,
                              padding: 12,
                            }}
                          >
                            No text extracted (could be a scanned or unparseable file).
                          </div>
                        ) : (
                          <div style={{ display: "grid", gap: 10 }}>
                            {p.previews.map((pr) => (
                              <div
                                key={pr.idx}
                                style={{
                                  border: "1px solid #E4E7EC",
                                  borderRadius: 12,
                                  padding: 12,
                                }}
                              >
                                <div style={{ fontWeight: 700, marginBottom: 6 }}>
                                  Chunk #{pr.idx}{" "}
                                  {pr.page_start ? `(pages ${pr.page_start}–${pr.page_end})` : ""}{" "}
                                  <span style={{ fontWeight: 400, color: "#475467", marginLeft: 6 }}>
                                    · {pr.char_len} chars
                                  </span>
                                </div>
                                <pre
                                  style={{
                                    margin: 0,
                                    whiteSpace: "pre-wrap",
                                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                                    fontSize: 13,
                                    lineHeight: 1.45,
                                  }}
                                >
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

            {/* In-app file viewer (PDF/Office preview in iframe/object) */}
            {activeFile && (
              <FileViewer
                url={`${API_BASE_FOR_DOWNLOADS}${activeFile.storage_url}`}
                name={activeFile.filename}
                mime={(activeFile as any).mime || null}
                onClose={() => setActiveFile(null)}
              />
            )}
          </>
        )}
      </section>
    </div>
  );
}
