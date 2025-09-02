import { useEffect, useMemo, useState } from "react";
import ClassSidebar from "../components/ClassSidebar";
import {
  listClasses, createClass, updateClass, deleteClass,
  listFiles, uploadFile,
  deleteFile, createChunks, FileRow, ClassRow, ChunkPreview
} from "../lib/api"; // <-- make sure these exist (from earlier message)


export default function Classes() {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [busyUpload, setBusyUpload] = useState(false);
  const [busyChunk, setBusyChunk] = useState(false);

  // selection for chunking
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const selectedIds = useMemo(() => files.filter(f => sel[f.id]).map(f => f.id), [files, sel]);

  // preview drawer
  const [preview, setPreview] = useState<ChunkPreview[] | null>(null);

  useEffect(() => { (async () => setClasses(await listClasses()))(); }, []);
  useEffect(() => {
    if (selectedId == null) { setFiles([]); setSel({}); return; }
    (async () => {
      const fs = await listFiles(selectedId);
      setFiles(fs);
      setSel({});
    })();
  }, [selectedId]);

  const selectedClass = classes.find(c => c.id === selectedId) || null;
  const API = ""; // Vite proxy for /api and /uploads

 async function handleCreate(name: string) {
  const row = await createClass({ name, subject: "General" }); // or a real subject
  setClasses(xs => [...xs, row]);
}

  async function handleRename(id: number, name: string) {
    const row = await updateClass(id, { name });
    setClasses(xs => xs.map(c => (c.id === id ? row : c)));
  }
  async function handleDeleteClass(id: number) {
    await deleteClass(id);
    setClasses(xs => xs.filter(c => c.id !== id));
    if (selectedId === id) { setSelectedId(null); setFiles([]); setSel({}); }
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!selectedId || !e.target.files?.[0]) return;
    setBusyUpload(true);
    try {
      const row = await uploadFile(selectedId, e.target.files[0]);
      setFiles(xs => [row, ...xs]);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusyUpload(false);
      e.target.value = "";
    }
  }

  async function onDeleteFile(fileId: string, filename: string) {
    if (!confirm(`Delete "${filename}"?`)) return;
    try {
      await deleteFile(fileId);
      setFiles(xs => xs.filter(f => f.id !== fileId));
      setSel(({ [fileId]: _, ...rest }) => rest);
    } catch {
      alert("Failed to delete file");
    }
  }

async function onCreateChunks() {
  if (selectedIds.length === 0) return;
  setBusyChunk(true);
  try {
    const res: ChunkPreview[] = await createChunks({
      file_ids: selectedIds,
      by: "page",       // per-page chunking
      size: 1,          // 1 page per chunk
      overlap: 0,       // or 1 for one-page overlap
      preview_limit_per_file: 3,
    });
    setPreview(res);
  } catch {
    alert("Chunking failed");
  } finally {
    setBusyChunk(false);
  }
}

  function toggleAll(checked: boolean) {
    const m: Record<string, boolean> = {};
    if (checked) files.forEach(f => (m[f.id] = true));
    setSel(m);
  }
  function toggleOne(id: string, checked: boolean) {
    setSel(prev => ({ ...prev, [id]: checked }));
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", minHeight: "100vh" }}>
      <ClassSidebar
        items={classes}
        selectedId={selectedId}
        onSelect={(id) => setSelectedId(id)}
        onCreate={handleCreate}
        onRename={handleRename}
        onDelete={handleDeleteClass}
      />

      <section style={{ padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0 }}>{selectedClass ? `${selectedClass.name}` : "Workspace"}</h2>

          {/* toolbar */}
          {selectedClass && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <input type="file" accept="application/pdf,image/png,image/jpeg" onChange={onUpload} />
                {busyUpload && <span>Uploading…</span>}
              </label>

              <button
                onClick={onCreateChunks}
                disabled={selectedIds.length === 0 || busyChunk}
                style={{
                  padding: "6px 12px",
                  borderRadius: 999,
                  border: "1px solid #cfd4dc",
                  background: selectedIds.length === 0 || busyChunk ? "#f3f4f6" : "#7B5FEF",
                  color: selectedIds.length === 0 || busyChunk ? "#9aa0a6" : "#fff",
                  fontWeight: 700,
                  cursor: selectedIds.length === 0 || busyChunk ? "not-allowed" : "pointer"
                }}
                title={selectedIds.length ? `Create chunks for ${selectedIds.length} file(s)` : "Select at least one file"}
              >
                {busyChunk ? "Creating…" : `Create Chunks${selectedIds.length ? ` (${selectedIds.length})` : ""}`}
              </button>
            </div>
          )}
        </div>

        {!selectedId ? (
          <div style={{ opacity: .7 }}>Select a class from the left sidebar.</div>
        ) : (
          <>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #eee", width: 36 }}>
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={files.length > 0 && selectedIds.length === files.length}
                      onChange={e => toggleAll(e.target.checked)}
                    />
                  </th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>File</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>Size</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>When</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>Open</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f) => (
                  <tr key={f.id}>
                    <td style={{ padding: "6px 0" }}>
                      <input
                        type="checkbox"
                        checked={!!sel[f.id]}
                        onChange={e => toggleOne(f.id, e.target.checked)}
                        aria-label={`Select ${f.filename}`}
                      />
                    </td>
                    <td>{f.filename}</td>
                    <td>{(f.size_bytes/1024/1024).toFixed(2)} MB</td>
                    <td>{f.uploaded_at ? new Date(f.uploaded_at).toLocaleString() : "—"}</td>
                    <td><a href={`${API}${f.storage_url}`} target="_blank" rel="noreferrer">view</a></td>
                    <td>
                      <button
                        onClick={() => onDeleteFile(f.id, f.filename)}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 8,
                          border: "1px solid #E4E7EC",
                          background: "#fff",
                          cursor: "pointer"
                        }}
                        title="Delete PDF"
                      >
                        🗑️ Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {files.length === 0 && (
                  <tr><td colSpan={6} style={{ opacity:.7, paddingTop:8 }}>No files yet.</td></tr>
                )}
              </tbody>
            </table>

            {/* Chunk preview drawer */}
            {preview && (
              <div
                role="dialog"
                aria-modal="true"
                style={{
                  position: "fixed", inset: 0, background: "rgba(16,24,40,0.35)",
                  display: "flex", alignItems: "flex-end", zIndex: 50
                }}
                onClick={() => setPreview(null)}
              >
                <div
                  style={{
                    width: "min(920px, 96vw)", maxHeight: "80vh", margin: "0 auto 24px",
                    background: "#fff", borderRadius: 16, boxShadow: "0 20px 50px rgba(16,24,40,.25)", overflow: "hidden",
                  }}
                  onClick={e => e.stopPropagation()}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid #eee" }}>
                    <strong>Chunk Previews</strong>
                    <button onClick={() => setPreview(null)} style={{ border: "1px solid #E4E7EC", background: "#fff", borderRadius: 8, padding: "6px 10px" }}>
                      Close
                    </button>
                  </div>
                  <div style={{ padding: 16, overflow: "auto", maxHeight: "calc(80vh - 56px)" }}>
                    {preview.map(p => (
                      <div key={p.file_id} style={{ marginBottom: 18 }}>
                        <div style={{ fontWeight: 800, marginBottom: 6 }}>
                          File {p.file_id} — {p.total_chunks} chunk(s)
                        </div>
                        {p.total_chunks === 0 ? (
                          <div style={{ border: "1px solid #FDEFC7", background:"#FFF8E6", color:"#8B5E00", borderRadius: 12, padding: 12 }}>
                            No text extracted (maybe a scanned PDF with no selectable text).
                          </div>
                        ) : (
                          <div style={{ display: "grid", gap: 10 }}>
                            {p.previews.map(pr => (
                              <div key={pr.idx} style={{ border: "1px solid #E4E7EC", borderRadius: 12, padding: 12 }}>
                                <div style={{ fontWeight: 700, marginBottom: 6 }}>
                                  Chunk #{pr.idx} {pr.page_start ? `(pages ${pr.page_start}–${pr.page_end})` : ""}
                                  <span style={{ fontWeight: 400, color: "#475467", marginLeft: 6 }}>· {pr.char_len} chars</span>
                                </div>
                                <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13, lineHeight: 1.45 }}>
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
      </section>
    </div>
  );
}
