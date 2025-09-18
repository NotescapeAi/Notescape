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
export async function createClass(input: { name: string; subject?: string }) {
  const res = await fetch("/api/classes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: input.name, subject: input.subject ?? "General" }),
  });
  if (!res.ok) throw new Error("Failed to create class");
  return res.json();
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
    try {
  const j: unknown = await r.json();
  if (j && typeof j === "object" && "error" in (j as Record<string, unknown>)) {
    const err = (j as { error?: unknown }).error;
    if (typeof err === "string" && err.trim()) msg = err;
  }
} catch (e) {
  // Not JSON; keep default message but log for debugging
  console.debug("uploadFile(): non-JSON error body", e);
}

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



export async function logout() {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch (err) {
    // non-fatal: log and continue clearing local auth
    console.debug("logout request failed (ignored)", err);
  }
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

export async function deleteFile(fileId: string): Promise<{ok: boolean}> {
  const r = await fetch(`/api/files/${fileId}`, { method: "DELETE" });
  if (!r.ok) throw new Error("Failed to delete file");
  return r.json();
}

export type ChunkPreview = {
  file_id: string;
  total_chunks: number;
  previews: { idx: number; page_start: number | null; page_end: number | null; char_len: number; sample: string }[];
};

export async function createChunks(payload: {
  file_ids: string[];
  size?: number; overlap?: number; by?: "auto" | "page"; preview_limit_per_file?: number;
}): Promise<ChunkPreview[]> {
  const r = await fetch(`/api/chunks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error("Chunking failed");
  return r.json();
}

export async function listChunks(fileId: string, limit = 20, offset = 0) {
  const r = await fetch(`/api/files/${fileId}/chunks?limit=${limit}&offset=${offset}`);
  if (!r.ok) throw new Error("Failed to list chunks");
  return r.json();
}


export type Flashcard = {
  id: string;
  class_id: number;
  source_chunk_id?: number | null;
  question: string;
  answer: string;
  hint?: string | null;
  difficulty: "easy" | "medium" | "hard";
  tags: string[];
};

export async function buildEmbeddings(classId: number, limit = 1000) {
  const r = await fetch(`/api/embeddings/build?class_id=${classId}&limit=${limit}`, {
    method: "POST",            // ← was GET, must be POST
  });
  if (!r.ok) throw new Error("Embedding build failed");
  return r.json();
}

export async function generateFlashcards(payload: {
  class_id: number;
  n_cards?: number;
  top_k?: number;
  ensure_embeddings?: boolean;
  ensure_limit?: number;
}): Promise<Flashcard[]> {
  const r = await fetch(`/api/flashcards/generate/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error("Flashcard generation failed");
  return r.json();
}

// Your backend exposes GET /api/flashcards/{class_id}
export async function listFlashcards(classId: number): Promise<Flashcard[]> {
  const r = await fetch(`/api/flashcards/${classId}`);
  if (!r.ok) throw new Error("Failed to fetch flashcards");
  return r.json();
}
