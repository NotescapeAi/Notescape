// src/lib/api.ts
const API = (import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "") || ""); // "" => use Vite proxy in dev

// ---------- Types ----------
export type ClassRow = {
  id: number;
  name: string;
  description?: string | null;
  created_at?: string;
};

export type FileRow = {
  id: string;
  class_id: number;
  filename: string;
  mime_type?: string | null;
  storage_url: string;     // backend returns a path; see filePublicUrl() below
  size_bytes: number;
  uploaded_at?: string | null;
};

export type ChunkPreview = {
  file_id: string;
  total_chunks: number;
  previews: {
    idx: number;
    page_start: number | null;
    page_end: number | null;
    char_len: number;
    sample: string;
  }[];
};

export type Flashcard = {
  id: string;
  class_id: number;
  source_chunk_id: number | null;
  question: string;
  answer: string;
  hint?: string | null;
  difficulty?: "easy" | "medium" | "hard";
  tags: string[];
};

// ---------- Helpers ----------
async function fetchJSON<T = any>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(txt || `Request failed: ${r.status}`);
  }
  return r.json() as Promise<T>;
}

// Some servers store absolute FS path in storage_url (e.g. /Users/.../uploads/uuid_name.pdf).
// Prefer public /uploads/... if present; otherwise just return storage_url.
export function filePublicUrl(row: FileRow): string {
  if (row.storage_url.includes("/uploads/")) {
    return `${API}${row.storage_url}`;
  }
  // fallback (if you stored a full FS path) – you can also change backend to return /uploads/uuid_filename.pdf
  return row.storage_url;
}

// ---------- Classes ----------
export async function listClasses(): Promise<ClassRow[]> {
  return fetchJSON<ClassRow[]>(`${API}/api/classes`);
}

export async function createClass(input: { name: string; description?: string }) {
  return fetchJSON<ClassRow>(`${API}/api/classes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: input.name, description: input.description ?? "Demo" }),
  });
}

export async function updateClass(id: number, payload: { name: string; description?: string }) {
  return fetchJSON<ClassRow>(`${API}/api/classes/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: payload.name.trim(), description: (payload.description ?? "").trim() }),
  });
}

export async function deleteClass(id: number) {
  await fetchJSON(`${API}/api/classes/${id}`, { method: "DELETE" });
}

// ---------- Files ----------
export async function listFiles(classId: number): Promise<FileRow[]> {
  return fetchJSON<FileRow[]>(`${API}/api/files/${classId}`);
}

export async function uploadFile(classId: number, file: File): Promise<FileRow> {
  const fd = new FormData();
  fd.append("file", file); // must be "file"
  return fetchJSON<FileRow>(`${API}/api/files/${classId}`, { method: "POST", body: fd });
}

export async function deleteFile(fileId: string): Promise<{ ok: boolean }> {
  return fetchJSON<{ ok: boolean }>(`${API}/api/files/${fileId}`, { method: "DELETE" });
}

// ---------- Chunking ----------
export async function createChunks(opts: {
  file_ids: string[];
  size?: number;                // characters per chunk if your backend uses char-based
  overlap?: number;             // overlap in characters
  preview_limit_per_file?: number; // ignored by backend, but kept for UI
}): Promise<ChunkPreview[]> {
  // Backend expects { chunk_size, chunk_overlap }
  const body = {
    file_ids: opts.file_ids,
    chunk_size: opts.size ?? 1200,
    chunk_overlap: opts.overlap ?? 150,
  };
  return fetchJSON<ChunkPreview[]>(`${API}/api/chunks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function listChunks(fileId: string, limit = 20, offset = 0) {
  return fetchJSON(`${API}/api/files/${fileId}/chunks?limit=${limit}&offset=${offset}`);
}

// ---------- Flashcards ----------
export async function ensureEmbeddings(limit = 500): Promise<{ inserted: number; message?: string }> {
  return fetchJSON(`${API}/flashcards/ensure-embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ limit }),
  });
}

export async function generateFlashcards(payload: {
  class_id: number;
  topic?: string;
  top_k?: number;    // default 12
  n_cards?: number;  // default 10
}): Promise<Flashcard[]> {
  return fetchJSON<Flashcard[]>(`${API}/flashcards/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      class_id: payload.class_id,
      topic: payload.topic ?? null,
      top_k: payload.top_k ?? 12,
      n_cards: payload.n_cards ?? 10,
    }),
  });
}

export async function listFlashcards(classId: number, limit = 200): Promise<Flashcard[]> {
  // backend route: GET /flashcards/list?class_id=...&limit=...
  return fetchJSON<Flashcard[]>(`${API}/flashcards/list?class_id=${classId}&limit=${limit}`);
}

export async function deleteFlashcard(cardId: string) {
  await fetchJSON(`${API}/flashcards/${cardId}`, { method: "DELETE" });
}

// ---------- Optional: contact / auth helpers (keep if you use them) ----------
export type ContactForm = { name: string; email: string; message: string };
export async function postContact(form: ContactForm) {
  return fetchJSON(`${API}/api/contact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(form),
  });
}

export async function logout() {
  try { await fetchJSON(`${API}/api/auth/logout`, { method: "POST" }); } catch {}
  localStorage.removeItem("auth_token");
}

export async function deleteAccount() {
  await fetchJSON(`${API}/api/account`, { method: "DELETE" });
  localStorage.removeItem("auth_token");
}
