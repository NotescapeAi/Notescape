const API = import.meta.env.VITE_API_BASE_URL || ""; // use proxy in dev

export type ClassRow = { id: number; name: string; subject: string; created_at: string };
export type FileRow = {
  id: string; class_id: number; filename: string; mime_type: string;
  storage_url: string; size_bytes: number; uploaded_at: string;
};

export async function listClasses(): Promise<ClassRow[]> {
  const r = await fetch(`${API}/api/classes`);
  if (!r.ok) throw new Error("Failed to fetch classes");
  return r.json();
}
export async function createClass(payload: { name: string; subject?: string }): Promise<ClassRow> {
  const r = await fetch(`${API}/api/classes`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: payload.name.trim(), subject: (payload.subject ?? "").trim() }),
  });
  if (!r.ok) throw new Error("Failed to create class");
  return r.json();
}
export async function updateClass(id: number, payload: { name: string; subject?: string }): Promise<ClassRow> {
  const r = await fetch(`${API}/api/classes/${id}`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: payload.name.trim(), subject: (payload.subject ?? "").trim() }),
  });
  if (!r.ok) throw new Error("Failed to update class");
  return r.json();
}
export async function deleteClass(id: number) {
  const r = await fetch(`${API}/api/classes/${id}`, { method: "DELETE" });
  if (!r.ok) throw new Error("Failed to delete class");
}

export async function listFiles(classId: number): Promise<FileRow[]> {
  const r = await fetch(`${API}/api/files/${classId}`);
  if (!r.ok) throw new Error("Failed to fetch files");
  return r.json();
}
export async function uploadFile(classId: number, file: File): Promise<FileRow> {
  const fd = new FormData();
  fd.append("file", file); // key must be "file"
  const r = await fetch(`${API}/api/files/${classId}`, { method: "POST", body: fd });
  if (!r.ok) {
    let msg = "Upload failed";
    try { const j = await r.json(); if (j?.error) msg = j.error; } catch {}
    throw new Error(msg);
  }
  return r.json();
}

// src/lib/api.ts  (add near your other exports)

export type ContactForm = { name: string; email: string; message: string };

export async function postContact(form: ContactForm) {
  const r = await fetch(`/api/contact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(form),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.error || "Failed to send message");
  }
  return r.json().catch(() => ({}));
}


// --- auth helpers ---
export function isLoggedIn() {
  return !!localStorage.getItem("auth_token"); // swap for real auth later
}

export async function logout() {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  localStorage.removeItem("auth_token");
}

export async function deleteAccount() {
  const r = await fetch("/api/account", { method: "DELETE" });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.error || "Delete failed");
  }
  localStorage.removeItem("auth_token");
}
