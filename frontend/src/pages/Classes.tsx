import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import ClassSidebar from "../components/ClassSidebar";
import ClassHeaderButtons from "../components/ClassHeaderButtons";
import FileViewer from "../components/FileViewer";
import "./classes.skin.css";

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

/* -------------------- constants / helpers -------------------- */
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
  if (!Number.isFinite(bytes ?? NaN)) return "—";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let n = bytes as number;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 2 : 0)} ${u[i]}`;
}
function timeLocal(s?: string | null) {
  if (!s) return "—";
  try { return new Date(s).toLocaleString(); } catch { return s; }
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
    <button onClick={disabled ? undefined : onClick} title={title} style={style} disabled={disabled}>
      {children}
    </button>
  );
}
function Divider() {
  return <div style={{ height: 1, background: "#EEF2F6", margin: "12px 0" }} />;
}

/* simple upload icon (no lib import) */
function UploadIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <path d="M7 10l5-5 5 5"/>
      <path d="M12 15V5"/>
    </svg>
  );
}

/* row kebab menu */
function RowMenu({ onView, onDelete }: { onView: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  return (
    <div className="rowmenu" ref={ref}>
      <button className="icon-btn" aria-label="More actions" onClick={() => setOpen(v => !v)}>⋯</button>
      {open && (
        <div className="menu">
          <button className="menu-item" onClick={() => { setOpen(false); onView(); }}>Open</button>
          <button className="menu-item danger" onClick={() => { setOpen(false); onDelete(); }}>Delete</button>
        </div>
      )}
    </div>
  );
}

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

  const [preview, setPreview] = useState<ChunkPreview[] | null>(null);
  const [, setCards] = useState<Flashcard[]>([]);
  const [activeFile, setActiveFile] = useState<FileRow | null>(null);

  // selection mode for Generate
  const [selectingForGen, setSelectingForGen] = useState(false);

  const location = useLocation();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /* -------- class CRUD (missing earlier) -------- */
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

  /* data load */
  useEffect(() => { (async () => setClasses(await listClasses()))(); }, []);
  useEffect(() => {
    const st = (location as any)?.state;
    if (st?.selectId) setSelectedId(Number(st.selectId));
  }, [location]);
  useEffect(() => {
    if (selectedId == null) { setFiles([]); setSel({}); setCards([]); return; }
    (async () => {
      const fs = await listFiles(selectedId);
      setFiles(fs ?? []);
      setSel({});
      try {
        const cards = await listFlashcards(selectedId ?? undefined);
        setCards(Array.isArray(cards) ? cards : []);
      } catch {}
    })();
  }, [selectedId]);

  const API_BASE_FOR_DOWNLOADS = "";

  /* uploads */
  function acceptFile(f: File) { return isAllowed(f); }
  async function uploadMany(fileList: FileList | File[]) {
    if (!selectedId) return alert("Select a class first.");
    const arr = Array.from(fileList);
    const accepted = arr.filter(acceptFile);
    if (accepted.length === 0) return;
    setBusyUpload(true);
    try {
      for (const f of accepted) {
        const row = await uploadFile(selectedId, f);
        setFiles((xs) => [row, ...(xs ?? [])]);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Upload failed");
    } finally { setBusyUpload(false); }
  }
  async function onUploadChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length) return;
    await uploadMany(e.target.files);
    e.target.value = "";
  }

  /* selection helpers */
  function toggleAll(checked: boolean) {
    const m: Record<string, boolean> = {};
    if (checked) (files ?? []).forEach((f) => (m[f.id] = true));
    setSel(m);
  }
  function toggleOne(id: string, checked: boolean) { setSel((prev) => ({ ...prev, [id]: checked })); }

  async function onDeleteFile(fileId: string, filename: string) {
    if (!confirm(`Delete "${filename}"?`)) return;
    try {
      await deleteFile(fileId);
      setFiles((xs) => (xs ?? []).filter((f) => f.id !== fileId));
    } catch { alert("Failed to delete file"); }
  }

  /* pipeline */
  async function onGenerateFlashcards() {
    if (!selectedId) return alert("Select a class first");
    const ids = selectedIds.length ? selectedIds : [];
    if (ids.length === 0) return alert("Select at least one file, then Confirm.");
    setBusyFlow(true);
    try {
      const res: ChunkPreview[] = await createChunks({
        file_ids: ids, by: "page", size: 1, overlap: 0, preview_limit_per_file: 2,
      });
      setPreview(res);
      await buildEmbeddings(selectedId, 1000);
      const difficulty = (localStorage.getItem("fc_pref_difficulty") as "easy" | "medium" | "hard") || "medium";
      const created = await generateFlashcards({ class_id: selectedId, file_ids: ids, top_k: 12, difficulty });
      setCards(created);
      alert(`Created ${created.length} flashcards`);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to generate flashcards");
    } finally {
      setBusyFlow(false);
      setSelectingForGen(false);
      setSel({});
    }
  }

  const currentClass = selectedId ? classes.find((c) => c.id === selectedId)?.name : null;
  const showSelect = selectingForGen;

  return (
    <div className="cls-page">
      <div style={{ display:"grid", gridTemplateColumns:"320px 1fr", minHeight:"100vh", background:"#FAFAFB" }}>
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
  <div className="cls-header">
  <div className="cls-head-left">
    <h2 className="cls-title">{currentClass ?? "Workspace"}</h2>
    {busyUpload && <span className="cls-badge">Uploading…</span>}
    {busyFlow && <span className="cls-badge">Processing…</span>}
  </div>

  {selectedId && (
    showSelect ? (
      <div style={{ display:"flex", gap:8 }}>
        <Button kind="ghost" onClick={() => { setSelectingForGen(false); setSel({}); }}>
          Cancel
        </Button>
        <Button kind="primary" onClick={onGenerateFlashcards}>
          Confirm ({selectedIds.length})
        </Button>
      </div>
    ) : (
      <ClassHeaderButtons
        classId={String(selectedId)}
        onGenerate={() => setSelectingForGen(true)}
      />
    )
  )}
</div>

<Divider />

          {!selectedId ? (
            <div style={{ background:"#fff", border:"1px solid #EEF2F6", borderRadius:14, padding:24, color:"#667085" }}>
              Select a class from the left to start.
            </div>
          ) : (
            <>
  
{/* Hidden chooser stays where it is */}
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

{/* Files card */}<div className="files-card">
  <div className="files-toolbar">
    <div className="files-title">Files {showSelect && <span className="cls-badge">{selectedIds.length} selected</span>}</div>
    {/* You can keep or remove this upload icon — it won’t overlap now */}
    <button className="icon-btn" title="Upload" aria-label="Upload" onClick={() => fileInputRef.current?.click()}>
      {/* simple chevron upload */}
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <path d="M7 10l5-5 5 5"/>
        <path d="M12 15V5"/>
      </svg>
    </button>
  </div>

  <ul className="filelist">
    {(files ?? []).map((f) => (
      <li key={f.id} className={`fileitem ${showSelect ? "with-check" : ""}`}>
        {showSelect && (
          <input
            className="fileitem-check"
            type="checkbox"
            checked={!!sel[f.id]}
            onChange={(e) => toggleOne(f.id, e.target.checked)}
            aria-label={`Select ${f.filename}`}
          />
        )}

        <button className="file-main" title="Open preview" onClick={() => setActiveFile(f)}>
          <span className="filename">{f.filename}</span>
          <span className="badge-ext">{(f.filename.split(".").pop() || "").toUpperCase()}</span>
        </button>

        <div className="fileitem-actions">
          <div className="rowmenu">
            <button className="icon-btn" aria-label="More" onClick={(e) => e.currentTarget.nextElementSibling?.classList.toggle('open')}>⋯</button>
            {/* if you’re using the RowMenu component, keep that instead of this stub */}
          </div>
        </div>
      </li>
    ))}

    {(files?.length ?? 0) === 0 && (
      <li className="fileitem empty">No files yet. Use the upload icon to add PDFs, PPTX, or DOCX.</li>
    )}
  </ul>
</div>



              {/* Chunk preview dialog */}
              {preview && (
                <div role="dialog" aria-modal="true" style={{
                  position:"fixed", inset:0, background:"rgba(16,24,40,0.35)",
                  display:"flex", alignItems:"flex-end", zIndex:50
                }} onClick={() => setPreview(null)}>
                  <div style={{
                    width:"min(920px, 96vw)", maxHeight:"80vh", margin:"0 auto 24px",
                    background:"#fff", borderRadius:16, boxShadow:"0 20px 50px rgba(16,24,40,.25)", overflow:"hidden"
                  }} onClick={(e) => e.stopPropagation()}>
                    <div style={{
                      display:"flex", alignItems:"center", justifyContent:"space-between",
                      padding:"12px 16px", borderBottom:"1px solid #eee"
                    }}>
                      <strong>Chunk Previews</strong>
                      <Button kind="default" onClick={() => setPreview(null)}>Close</Button>
                    </div>
                    <div style={{ padding:16, overflow:"auto", maxHeight:"calc(80vh - 56px)" }}>
                      {preview.map((p) => (
                        <div key={p.file_id} style={{ marginBottom:18 }}>
                          <div style={{ fontWeight:800, marginBottom:6 }}>
                            File {p.file_id} — {p.total_chunks} chunk(s)
                          </div>
                          {p.total_chunks === 0 ? (
                            <div style={{ border:"1px solid #FDEFC7", background:"#FFF8E6", color:"#8B5E00", borderRadius:12, padding:12 }}>
                              No text extracted (could be a scanned or unparseable file).
                            </div>
                          ) : (
                            <div style={{ display:"grid", gap:10 }}>
                              {p.previews.map((pr) => (
                                <div key={pr.idx} style={{ border:"1px solid #E4E7EC", borderRadius:12, padding:12 }}>
                                  <div style={{ fontWeight:700, marginBottom:6 }}>
                                    Chunk #{pr.idx} {pr.page_start ? `(pages ${pr.page_start}–${pr.page_end})` : ""}{" "}
                                    <span style={{ fontWeight:400, color:"#475467", marginLeft:6 }}>· {pr.char_len} chars</span>
                                  </div>
                                  <pre style={{ margin:0, whiteSpace:"pre-wrap", fontFamily:"ui-monospace,SFMono-Regular,Menlo,monospace", fontSize:13, lineHeight:1.45 }}>
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

              {/* In-app file viewer */}
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
    </div>
  );
}
