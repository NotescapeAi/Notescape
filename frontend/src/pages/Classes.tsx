import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
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
import { UploadCloud, Trash2, BookOpen, FileText, CheckCircle } from "lucide-react";

// Reusable StatCard component for displaying class data
const StatCard: React.FC<{ title: string; value: string; sub?: string; icon: React.ReactNode }> = ({ title, value, sub, icon }) => (
  <motion.div whileHover={{ y: -4 }} className="bg-white rounded-2xl p-6 shadow-lg border border-indigo-50">
    <div className="flex items-center gap-3">
      <div className="text-xl text-indigo-600">{icon}</div>
      <div>
        <p className="text-xs text-gray-500">{title}</p>
        <p className="text-xl font-semibold text-gray-800 mt-1">{value}</p>
        {sub && <p className="text-xs text-green-500 mt-1">{sub}</p>}
      </div>
    </div>
  </motion.div>
);

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
  const [busyFlow, setBusyFlow] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [preview, setPreview] = useState<ChunkPreview[] | null>(null);
  const [, setCards] = useState<Flashcard[]>([]);
  const location = useLocation();
  const API_BASE_FOR_DOWNLOADS = "";

  // ---------- Data Loading ----------
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
      return;
    }
    (async () => {
      const fs = await listFiles(selectedId);
      setFiles(fs);
      setSel({});
      try {
        setCards(await listFlashcards(selectedId));
      } catch {}
    })();
  }, [selectedId]);

  // ---------- Class CRUD ----------
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

  // ---------- File Upload ----------
  function acceptFile(f: File) {
    return ["application/pdf", "image/png", "image/jpeg"].includes(f.type);
  }

  async function uploadMany(fileList: FileList | File[]) {
    if (!selectedId) return alert("Select a class first.");
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

  // ---------- File Selection ----------
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

  // ---------- Flashcard Generation ----------
  async function onGenerateFlashcards() {
    if (!selectedId) return alert("Select a class first");
    if (files.length === 0) return alert("Upload at least one file first");

    const ids = selectedIds.length ? selectedIds : files.map((f) => f.id);
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
      const difficulty =
        (localStorage.getItem("fc_pref_difficulty") as
          | "easy"
          | "medium"
          | "hard") || "medium";
      const created = await generateFlashcards({
        class_id: selectedId,
        file_ids: ids,
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
    <div className="grid grid-cols-[260px_1fr] min-h-screen bg-gradient-to-br from-[#DBD1F3] via-[#E8E0FF] to-white">
      {/* Sidebar */}
      <aside className="bg-gradient-to-br from-[#D0C4F2] to-[#E4DAFF] border-r border-white/40 shadow-inner">
        <ClassSidebar
          items={classes}
          selectedId={selectedId}
          onSelect={(id) => setSelectedId(id)}
          onCreate={handleCreate}
          onRename={handleRename}
          onDelete={handleDeleteClass}
        />
      </aside>

      {/* Main Section */}
      <section className="p-8 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-3xl font-extrabold bg-gradient-to-r from-violet-700 to-indigo-600 text-transparent bg-clip-text">
                {selectedId
                  ? classes.find((c) => c.id === selectedId)?.name
                  : "Workspace"}
              </h2>
              {selectedId && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs bg-violet-100 text-violet-700 px-2 py-1 rounded-full font-semibold">
                    {files.length} file{files.length !== 1 ? "s" : ""}
                  </span>
                  <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full font-semibold">
                    {selectedIds.length ? `${selectedIds.length} selected` : "All"}
                  </span>
                </div>
              )}
            </div>

            {selectedId && (
              <div className="flex items-center gap-4 flex-wrap">
                <div
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                  onClick={() =>
                    document.getElementById("file-input-hidden")?.click()
                  }
                  title="Drag PDFs/PNGs here or click to choose"
                  className={`flex items-center gap-2 px-5 py-3 rounded-xl cursor-pointer backdrop-blur-md shadow-md border transition-all duration-200 ${
                    dropping
                      ? "border-violet-500 bg-violet-100/70"
                      : "border-gray-200 bg-white/70 hover:bg-gray-100/80"
                  }`}
                >
                  <input
                    id="file-input-hidden"
                    type="file"
                    accept="application/pdf,image/png,image/jpeg"
                    multiple
                    className="hidden"
                    onChange={onUploadChange}
                  />
                  <UploadCloud size={18} className="text-violet-700" />
                  <span className="text-sm font-medium text-gray-700">
                    {busyUpload ? "Uploading…" : "Drop or Choose File"}
                  </span>
                </div>

                <ClassHeaderButtons
                  classId={String(selectedId)}
                  onGenerate={() => onGenerateFlashcards()}
                />
              </div>
            )}
          </div>
        </motion.div>

        {!selectedId ? (
          <p className="text-gray-500 italic">Select a class from the sidebar.</p>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-lg border border-white/40 p-6"
          >
            <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[720px] rounded-lg shadow-lg">
                <thead className="bg-gradient-to-r from-indigo-600 to-violet-500 text-white">
                  <tr>
                    <th className="py-3 px-4 text-left w-8">
                      <input
                        type="checkbox"
                        checked={
                          files.length > 0 &&
                          selectedIds.length === files.length
                        }
                        onChange={(e) => toggleAll(e.target.checked)}
                      />
                    </th>
                    <th className="py-3 px-4 text-left">File</th>
                    <th className="py-3 px-4 text-left">Size</th>
                    <th className="py-3 px-4 text-left">When</th>
                    <th className="py-3 px-4 text-left">Open</th>
                    <th className="py-3 px-4 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {files.map((f) => (
                    <tr
                      key={f.id}
                      className="border-t hover:bg-[#F4EEFF]/50 transition-all"
                    >
                      <td className="py-3 px-4 align-top">
                        <input
                          type="checkbox"
                          checked={!!sel[f.id]}
                          onChange={(e) => toggleOne(f.id, e.target.checked)}
                        />
                      </td>
                      <td className="py-3 px-4 align-top">
                        <div className="font-medium text-gray-800">{f.filename}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {f.content_type || ""}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-gray-600 align-top">
                        {(f.size_bytes / 1024 / 1024).toFixed(2)} MB
                      </td>
                      <td className="py-3 px-4 text-gray-600 align-top">
                        {f.uploaded_at
                          ? new Date(f.uploaded_at).toLocaleString()
                          : "—"}
                      </td>
                      <td className="py-3 px-4 align-top">
                        <a
                          href={`${API_BASE_FOR_DOWNLOADS}${f.storage_url}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-violet-700 font-semibold hover:underline"
                        >
                          View
                        </a>
                      </td>
                      <td className="py-3 px-4 align-top">
                        <button
                          onClick={() => onDeleteFile(f.id, f.filename)}
                          className="inline-flex items-center gap-2 text-sm text-red-600 hover:text-red-800 font-semibold"
                        >
                          <Trash2 size={14} />
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                  {files.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="text-center py-8 text-gray-500 italic"
                      >
                        No files yet. Upload PDFs or images to generate flashcards.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </section>

      <AnimatePresence>
        {busyFlow && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="fixed right-6 bottom-6 bg-white/90 backdrop-blur-md border border-gray-200 rounded-full px-5 py-3 shadow-xl flex items-center gap-3 z-50"
          >
            <div className="w-3 h-3 rounded-full bg-violet-600 animate-pulse" />
            <div className="text-sm text-gray-700 font-medium">
              Processing files…
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
