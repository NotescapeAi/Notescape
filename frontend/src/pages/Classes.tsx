import { useEffect, useMemo, useState } from "react";
// Read navigation state so when you come “Back” from Flashcards, the same class re-selects
import { useLocation } from "react-router-dom";

import ClassSidebar from "../components/ClassSidebar";
import ClassHeaderButtons from "../components/ClassHeaderButtons";

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
} from "../lib/api";

export default function Classes() {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [files, setFiles] = useState<FileRow[]>([]);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const selectedIds = useMemo(
    () => files.filter((f) => sel[f.id]).map((f) => f.id),
    [files, sel]
  );

  const [busyUpload, setBusyUpload] = useState(false);
  const [, setBusyFlow] = useState(false); // keep setter only (eslint-safe)
  const [dropping, setDropping] = useState(false);

  const [preview, setPreview] = useState<ChunkPreview[] | null>(null);
  const [, setCards] = useState<Flashcard[]>([]); // keep setter only (eslint-safe)

  const location = useLocation();

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
      return;
    }
    (async () => {
      const fs = await listFiles(selectedId);
      setFiles(fs);
      setSel({});
      try {
        setCards(await listFlashcards(selectedId));
      } catch {
        /* ok if empty */
      }
    })();
  }, [selectedId]);

  // Vite dev proxy handles /api and /uploads
  const API_BASE_FOR_DOWNLOADS = "";

  // -------- class CRUD --------
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
    }
  }

  // -------- uploads (drag/drop + click) --------
  function acceptFile(f: File) {
    return ["application/pdf", "image/png", "image/jpeg"].includes(f.type);
  }

  async function uploadMany(fileList: FileList | File[]) {
    if (!selectedId) {
      alert("Select a class first.");
      return;
    }
    const arr = Array.from(fileList).filter(acceptFile);
    if (arr.length === 0) return;

    setBusyUpload(true);
    try {
      for (const f of arr) {
        const row = await uploadFile(selectedId, f);
        setFiles((xs) => [row, ...xs]);
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

  // -------- selection helpers --------
  function toggleAll(checked: boolean) {
    const m: Record<string, boolean> = {};
    if (checked) files.forEach((f) => (m[f.id] = true));
    setSel(m);
  }
  function toggleOne(id: string, checked: boolean) {
    setSel((prev) => ({ ...prev, [id]: checked }));
  }

  async function onDeleteFile(fileId: string, filename: string) {
    if (!confirm(`Delete "${filename}"?`)) return;
    try {
      await deleteFile(fileId);
      setFiles((xs) => xs.filter((f) => f.id !== fileId));
    } catch {
      alert("Failed to delete file");
    }
  }

  // -------- single-button pipeline: chunks → embeddings → cards --------
  async function onGenerateFlashcards() {
    if (!selectedId) return alert("Select a class first");
    if (files.length === 0) return alert("Upload at least one file first");

    // use selected files if any; else process all
    const ids = selectedIds.length ? selectedIds : files.map((f) => f.id);

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
        (localStorage.getItem("fc_pref_difficulty") as
          | "easy"
          | "medium"
          | "hard") || "medium";

      const created = await generateFlashcards({
        class_id: selectedId,
        file_ids: ids,
        // n_cards omitted so backend uses its default
        top_k: 12,
        difficulty,
      });

      setCards(created);
      alert(`Created ${created.length} flashcards`);
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : "Failed to generate flashcards";
      alert(msg);
    } finally {
      setBusyFlow(false);
    }
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        minHeight: "100vh",
      }}
    >
      <ClassSidebar
        items={classes}
        selectedId={selectedId}
        onSelect={(id) => setSelectedId(id)}
        onCreate={handleCreate}
        onRename={handleRename}
        onDelete={handleDeleteClass}
      />

      <section style={{ padding: 20 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginTop: 8,
            marginBottom: 8,
            flexWrap: "wrap",
          }}
        >
          <h2 style={{ margin: 0 }}>
            {selectedId
              ? classes.find((c) => c.id === selectedId)?.name
              : "Workspace"}
          </h2>

          {selectedId && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              {/* Drag & Drop / Click-to-upload */}
              <div
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                title="Drag PDFs/PNGs here or click to choose"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 12px",
                  borderRadius: 12,
                  border: `2px dashed ${dropping ? "#7B5FEF" : "#cfd4dc"}`,
                  background: dropping ? "rgba(123,95,239,0.10)" : "#fff",
                  cursor: "pointer",
                  userSelect: "none",
                }}
                onClick={() =>
                  document.getElementById("file-input-hidden")?.click()
                }
              >
                <input
                  id="file-input-hidden"
                  type="file"
                  accept="application/pdf,image/png,image/jpeg"
                  style={{ display: "none" }}
                  multiple
                  onChange={onUploadChange}
                />
                <span>{busyUpload ? "Uploading…" : "Drop files or Choose File"}</span>
              </div>

              {/* Header buttons */}
              <ClassHeaderButtons
                classId={String(selectedId)}
                onGenerate={() => onGenerateFlashcards()}
              />
            </div>
          )}
        </div>

        {!selectedId ? (
          <div style={{ opacity: 0.7 }}>Select a class from the left sidebar.</div>
        ) : (
          <>
            {/* Files */}
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th
                    style={{
                      textAlign: "left",
                      borderBottom: "1px solid #eee",
                      width: 36,
                    }}
                  >
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={
                        files.length > 0 && selectedIds.length === files.length
                      }
                      onChange={(e) => toggleAll(e.target.checked)}
                    />
                  </th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
                    File
                  </th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
                    Size
                  </th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
                    When
                  </th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
                    Open
                  </th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {files.map((f) => (
                  <tr key={f.id}>
                    <td style={{ padding: "6px 0" }}>
                      <input
                        type="checkbox"
                        checked={!!sel[f.id]}
                        onChange={(e) => toggleOne(f.id, e.target.checked)}
                        aria-label={`Select ${f.filename}`}
                      />
                    </td>
                    <td>{f.filename}</td>
                    <td>{(f.size_bytes / 1024 / 1024).toFixed(2)} MB</td>
                    <td>
                      {f.uploaded_at
                        ? new Date(f.uploaded_at).toLocaleString()
                        : "—"}
                    </td>
                    <td>
                      <a
                        href={`${API_BASE_FOR_DOWNLOADS}${f.storage_url}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        view
                      </a>
                    </td>
                    <td>
                      <button
                        onClick={() => onDeleteFile(f.id, f.filename)}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 8,
                          border: "1px solid #E4E7EC",
                          background: "#fff",
                          cursor: "pointer",
                        }}
                        title="Delete file"
                      >
                        🗑️ Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {files.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ opacity: 0.7, paddingTop: 8 }}>
                      No files yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Chunk preview drawer */}
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
                    <button
                      onClick={() => setPreview(null)}
                      style={{
                        border: "1px solid #E4E7EC",
                        background: "#fff",
                        borderRadius: 8,
                        padding: "6px 10px",
                      }}
                    >
                      Close
                    </button>
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
                            No text extracted (maybe a scanned PDF with no
                            selectable text).
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
                                <div
                                  style={{
                                    fontWeight: 700,
                                    marginBottom: 6,
                                  }}
                                >
                                  Chunk #{pr.idx}{" "}
                                  {pr.page_start
                                    ? `(pages ${pr.page_start}–${pr.page_end})`
                                    : ""}{" "}
                                  <span
                                    style={{
                                      fontWeight: 400,
                                      color: "#475467",
                                      marginLeft: 6,
                                    }}
                                  >
                                    · {pr.char_len} chars
                                  </span>
                                </div>
                                <pre
                                  style={{
                                    margin: 0,
                                    whiteSpace: "pre-wrap",
                                    fontFamily:
                                      "ui-monospace, SFMono-Regular, Menlo, monospace",
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

            {/* Flashcards are shown on /classes/:classId/flashcards */}
          </>
        )}
      </section>
    </div>
  );
}
