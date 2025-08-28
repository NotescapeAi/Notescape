import { useEffect, useState } from "react";
import ClassSidebar from "../components/ClassSidebar";


import {
  listClasses, createClass, updateClass, deleteClass,
  listFiles, uploadFile, FileRow, ClassRow
} from "../lib/api";

export default function Classes() {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { (async () => setClasses(await listClasses()))(); }, []);
  useEffect(() => {
    if (selectedId == null) return setFiles([]);
    (async () => setFiles(await listFiles(selectedId)))();
  }, [selectedId]);


 const selectedClass = classes.find(c => c.id === selectedId) || null;

  async function handleCreate(name: string) {
    const row = await createClass({ name });
    setClasses((xs) => [...xs, row]);
  }
  async function handleRename(id: number, name: string) {
    const row = await updateClass(id, { name });
    setClasses((xs) => xs.map((c) => (c.id === id ? row : c)));
  }
  async function handleDelete(id: number) {
    await deleteClass(id);
    setClasses((xs) => xs.filter((c) => c.id !== id));
    if (selectedId === id) { setSelectedId(null); setFiles([]); }
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!selectedId || !e.target.files?.[0]) return;
    setBusy(true);
    try {
      const row = await uploadFile(selectedId, e.target.files[0]);
      setFiles((xs) => [row, ...xs]);
    } catch (err: any) {
      alert(err.message || "Upload failed");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  const API = ""; // use Vite proxy for /api and /uploads

  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", minHeight: "100vh" }}>
      <ClassSidebar
        items={classes}
        selectedId={selectedId}
        onSelect={(id) => setSelectedId(id)}
        onCreate={handleCreate}
        onRename={handleRename}
        onDelete={handleDelete}
      />

      <section style={{ padding: 20 }}>
       <div style={{
  display: "flex",
  alignItems: "center",
  gap: 12,
  marginTop: 8,
  marginBottom: 8
}}>
  

  <h2 style={{ margin: 0 }}>
    {selectedClass ? ` ${selectedClass.name}` : "Workspace"}
  </h2>
</div>


        {!selectedId ? (
          <div style={{ opacity: .7 }}>Select a class from the left sidebar.</div>
        ) : (
          <>
            <div style={{ marginBottom: 12 }}>
              <input type="file" accept="application/pdf,image/png,image/jpeg" onChange={onUpload} />
              {busy && <span style={{ marginLeft: 8 }}>Uploading…</span>}
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>File</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>Size</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>When</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>Open</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f) => (
                  <tr key={f.id}>
                    <td>{f.filename}</td>
                    <td>{(f.size_bytes/1024/1024).toFixed(2)} MB</td>
                    <td>{new Date(f.uploaded_at).toLocaleString()}</td>
                    <td><a href={`${API}${f.storage_url}`} target="_blank" rel="noreferrer">view</a></td>
                  </tr>
                ))}
                {files.length === 0 && (
                  <tr><td colSpan={4} style={{ opacity:.7, paddingTop:8 }}>No files yet.</td></tr>
                )}
              </tbody>
            </table>
          </>
        )}
      </section>
    </div>
  );
}
