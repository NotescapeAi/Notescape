// src/pages/Classes.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
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
import { UploadCloud, Trash2 } from "lucide-react";
import { FaBook, FaTasks, FaLayerGroup, FaCog, FaSignOutAlt, FaPlus, FaRegCalendarAlt, FaCheckCircle } from "react-icons/fa";

/**
 * Advanced Classes page:
 * - Loads existing classes via listClasses()
 * - Optimistically shows newly created class while createClass() runs
 * - Keeps upload / file / flashcard logic intact
 * - Visual polish: frosted glass + gradient + motion
 *
 * This file uses your existing API helpers from ../lib/api
 */

export default function Classes(): JSX.Element {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const selectedIds = useMemo(() => files.filter((f) => sel[f.id]).map((f) => f.id), [files, sel]);

  const [busyUpload, setBusyUpload] = useState(false);
  const [busyFlow, setBusyFlow] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [preview, setPreview] = useState<ChunkPreview[] | null>(null);
  const [, setCards] = useState<Flashcard[]>([]);
  const location = useLocation();
  const API_BASE_FOR_DOWNLOADS = "";

  // UI modal state for creating classes
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newClassName, setNewClassName] = useState("");
  const [newClassInstructor, setNewClassInstructor] = useState("");
  const [creating, setCreating] = useState(false);

  // ---------- Fetch classes on mount ----------
  useEffect(() => {
    (async () => {
      try {
        const cs = await listClasses();
        setClasses(cs || []);
      } catch (err) {
        console.error("Failed to load classes", err);
      }
    })();
  }, []);

  // If route passed selectId
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

  // ---------- Class CRUD (wired + optimistic create) ----------
  async function handleCreate(name: string, instructor?: string) {
    if (!name) return;
    setCreating(true);

    // optimistic id for UI (negative so it won't clash)
    const tempId = Date.now() * -1;
    const tempClass: ClassRow = {
      id: tempId,
      name,
      instructor: instructor || "",
      created_at: new Date().toISOString(),
    } as ClassRow;

    // show instantly
    setClasses((xs) => [tempClass, ...xs]);
    setShowCreateModal(false);
    setNewClassName("");
    setNewClassInstructor("");

    try {
      const row = await createClass({ name, subject: instructor || "General" });
      // replace temp with real
      setClasses((xs) => xs.map((c) => (c.id === tempId ? row : c)));
      // optionally select the new class immediately
      setSelectedId(row.id);
    } catch (err) {
      // remove temp on failure
      setClasses((xs) => xs.filter((c) => c.id !== tempId));
      alert(err instanceof Error ? err.message : "Failed to create class");
    } finally {
      setCreating(false);
    }
  }

  async function handleRename(id: number, name: string) {
    try {
      const row = await updateClass(id, { name });
      setClasses((xs) => xs.map((c) => (c.id === id ? row : c)));
    } catch {
      alert("Rename failed");
    }
  }

  async function handleDeleteClass(id: number) {
    if (!confirm("Delete this class?")) return;
    try {
      await deleteClass(id);
      setClasses((xs) => xs.filter((c) => c.id !== id));
      if (selectedId === id) {
        setSelectedId(null);
        setFiles([]);
        setSel({});
        setCards([]);
      }
    } catch {
      alert("Delete failed");
    }
  }

  // ---------- File upload helpers (kept from your previous code) ----------
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

  // ---------- selection / delete file ----------
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

  // ---------- Flashcard generation (kept) ----------
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
      const difficulty = (localStorage.getItem("fc_pref_difficulty") as "easy" | "medium" | "hard") || "medium";
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

  // ---------- helper UI small components ----------
  const StatCard: React.FC<{ title: string; value: string; sub?: string }> = ({ title, value, sub }) => (
    <motion.div whileHover={{ y: -4 }} className="bg-white/80 backdrop-blur-sm rounded-2xl p-4 shadow-sm border border-white/40">
      <p className="text-xs text-gray-600">{title}</p>
      <p className="text-xl font-semibold text-gray-800 mt-1">{value}</p>
      {sub && <p className="text-xs text-green-600 mt-1">{sub}</p>}
    </motion.div>
  );

  // recent activity for UI (small)
  const recent = [
    { text: "Completed Physics Quiz", when: "2 hrs ago", icon: <FaCheckCircle className="text-green-500" /> },
    { text: "Reviewed 20 Flashcards (Math)", when: "6 hrs ago", icon: <FaLayerGroup className="text-indigo-500" /> },
    { text: "Started Focus Session (45m)", when: "Yesterday", icon: <FaRegCalendarAlt className="text-indigo-400" /> },
  ];

  // Quick stats values computed from current state
  const quickTotalClasses = classes.length.toString();
  const quickFilesUploaded = files.length > 0 ? files.length.toString() : "—";
  const quickFlashcards = "—"; // you can compute or fetch if you have that API

  return (
    <div className="grid grid-cols-[260px_1fr] min-h-screen bg-gradient-to-br from-[#DBD1F3] via-[#E8E0FF] to-white">
      {/* Sidebar */}
      <aside className="bg-gradient-to-br from-[#D0C4F2] to-[#E4DAFF] border-r border-white/40 shadow-inner">
        <ClassSidebar
          items={classes}
          selectedId={selectedId}
          onSelect={(id) => setSelectedId(id)}
          onCreate={(name) => handleCreate(name)}
          onRename={(id, name) => handleRename(id, name)}
          onDelete={(id) => handleDeleteClass(id)}
        />
      </aside>

      {/* Main Section */}
      <section className="p-8 overflow-y-auto">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mb-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-3xl font-extrabold bg-gradient-to-r from-violet-700 to-indigo-600 text-transparent bg-clip-text">
                {selectedId ? classes.find((c) => c.id === selectedId)?.name ?? "Workspace" : "Workspace"}
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

            <div className="flex items-center gap-4">
              {/* Upload area & header buttons (existing components) */}
              {selectedId && (
                <div
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                  onClick={() => document.getElementById("file-input-hidden")?.click()}
                  title="Drag PDFs/PNGs here or click to choose"
                  className={`flex items-center gap-2 px-5 py-3 rounded-xl cursor-pointer backdrop-blur-md shadow-md border transition-all duration-200 ${dropping ? "border-violet-500 bg-violet-100/70" : "border-gray-200 bg-white/70 hover:bg-gray-100/80"
                    }`}
                >
                  <input id="file-input-hidden" type="file" accept="application/pdf,image/png,image/jpeg" multiple className="hidden" onChange={onUploadChange} />
                  <UploadCloud size={18} className="text-violet-700" />
                  <span className="text-sm font-medium text-gray-700">{busyUpload ? "Uploading…" : "Drop or Choose File"}</span>
                </div>
              )}

              <ClassHeaderButtons classId={selectedId ? String(selectedId) : ""} onGenerate={() => onGenerateFlashcards()} />

              {/* Floating UI-only Add button that also calls handleCreate via modal below */}
              <button className="hidden md:inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-full shadow hover:brightness-105 transition" onClick={() => setShowCreateModal(true)}>
                <FaPlus /> New Class
              </button>
            </div>
          </div>
        </motion.div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <StatCard title="Total Classes" value={quickTotalClasses} />
          <StatCard title="Files Uploaded" value={quickFilesUploaded} />
          <StatCard title="Flashcards Generated" value={quickFlashcards} />
        </div>

        {/* Main content (table or empty prompt) */}
        {!selectedId ? (
          <p className="text-gray-500 italic">Select a class from the left sidebar or create a new one.</p>
        ) : (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-lg border border-white/40 p-6">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[720px]">
                <thead className="bg-gradient-to-r from-[#000000] to-[#000000] text-white/90">
                  <tr>
                    <th className="py-3 px-4 text-left w-8">
                      <input type="checkbox" checked={files.length > 0 && selectedIds.length === files.length} onChange={(e) => toggleAll(e.target.checked)} />
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
                    <tr key={f.id} className="border-t hover:bg-[#F4EEFF]/50 transition-all">
                      <td className="py-3 px-4 align-top">
                        <input type="checkbox" checked={!!sel[f.id]} onChange={(e) => toggleOne(f.id, e.target.checked)} />
                      </td>
                      <td className="py-3 px-4 align-top">
                        <div className="font-medium text-gray-800">{f.filename}</div>
                        <div className="text-xs text-gray-500 mt-1">{f.content_type || ""}</div>
                      </td>
                      <td className="py-3 px-4 text-gray-600 align-top">{(f.size_bytes / 1024 / 1024).toFixed(2)} MB</td>
                      <td className="py-3 px-4 text-gray-600 align-top">{f.uploaded_at ? new Date(f.uploaded_at).toLocaleString() : "—"}</td>
                      <td className="py-3 px-4 align-top">
                        <a href={`${API_BASE_FOR_DOWNLOADS}${f.storage_url}`} target="_blank" rel="noreferrer" className="text-violet-700 font-semibold hover:underline">
                          View
                        </a>
                      </td>
                      <td className="py-3 px-4 align-top">
                        <button onClick={() => onDeleteFile(f.id, f.filename)} className="inline-flex items-center gap-2 text-sm text-red-600 hover:text-red-800 font-semibold">
                          <Trash2 size={14} /> Delete
                        </button>
                      </td>
                    </tr>
                  ))}

                  {files.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-gray-500 italic">
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

      {/* Floating Create Button (responsive) */}
      <div className="fixed right-6 bottom-6 z-50">
        <button onClick={() => setShowCreateModal(true)} className="bg-indigo-600 text-white w-14 h-14 rounded-full flex items-center justify-center text-xl shadow-2xl hover:scale-105 transition">
          <FaPlus />
        </button>
      </div>

      {/* Floating toast while busyFlow */}
      <AnimatePresence>
        {busyFlow && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} className="fixed right-6 bottom-6 bg-white/90 backdrop-blur-md border border-gray-200 rounded-full px-5 py-3 shadow-xl flex items-center gap-3 z-50">
            <div className="w-3 h-3 rounded-full bg-violet-600 animate-pulse" />
            <div className="text-sm text-gray-700 font-medium">Processing files…</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== Create Class Modal (UI with wired createClass) ===== */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-60 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowCreateModal(false)} />

            <motion.div initial={{ y: 20, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 20, opacity: 0, scale: 0.98 }} transition={{ type: "spring", stiffness: 300, damping: 28 }} className="relative z-50 w-full max-w-md mx-4 bg-white/80 backdrop-blur-md border border-white/30 rounded-2xl p-6 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-800">Create New Class</h3>
                <button onClick={() => setShowCreateModal(false)} className="text-gray-500 hover:text-gray-700">✕</button>
              </div>

              <form onSubmit={(e) => { e.preventDefault(); handleCreate(newClassName, newClassInstructor); }} className="space-y-3">
                <div>
                  <label className="text-xs text-gray-600">Class Name</label>
                  <input value={newClassName} onChange={(e) => setNewClassName(e.target.value)} required placeholder="e.g. Math 101" className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 bg-white/70" />
                </div>

                <div>
                  <label className="text-xs text-gray-600">Instructor</label>
                  <input value={newClassInstructor} onChange={(e) => setNewClassInstructor(e.target.value)} placeholder="e.g. Dr. Khan" className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 bg-white/70" />
                </div>

                <div className="flex items-center justify-end gap-2 pt-3">
                  <button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2 rounded-lg text-sm border border-gray-200">Cancel</button>
                  <button type="submit" disabled={creating} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm">{creating ? "Creating…" : "Create"}</button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
