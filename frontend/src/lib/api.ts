// frontend/src/lib/api.ts
import axios from "axios";

/** Base URL: prefer Vite env, else relative /api (works in dev proxy & Docker) */
const API_BASE =
  (import.meta as any)?.env?.VITE_API_BASE_URL?.toString() ?? "/api";

const http = axios.create({
  baseURL: API_BASE,
  withCredentials: false,
});

/* =========================
   Types
========================= */

export type ClassRow = {
  id: number;
  name: string;
  subject?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type FileRow = {
  id: string;                 // files use string/uuid IDs
  filename: string;
  size_bytes: number;
  uploaded_at?: string | null;
  storage_url: string;        // relative/absolute URL for open/download
  class_id?: number;
};

export type ChunkPreview = {
  file_id: string;
  total_chunks: number;
  previews: Array<{
    idx: number;
    page_start?: number | null;
    page_end?: number | null;
    char_len: number;
    sample: string;
  }>;
};

export type Flashcard = {
  id: number;
  question: string;
  answer: string;
  hint?: string | null;
  tags?: string[] | null;
  class_id?: number;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ContactPayload = {
  name: string;
  email: string;
  message: string;
  subject?: string;
};

/* =========================
   Classes
========================= */

export async function listClasses(): Promise<ClassRow[]> {
  const { data } = await http.get<ClassRow[]>("/classes");
  return Array.isArray(data) ? data : [];
}

export async function createClass(payload: {
  name: string;
  subject?: string;
}): Promise<ClassRow> {
  const { data } = await http.post<ClassRow>("/classes", payload);
  return data;
}

export async function updateClass(
  id: number,
  payload: Partial<Pick<ClassRow, "name" | "subject">>
): Promise<ClassRow> {
  const { data } = await http.put<ClassRow>(`/classes/${id}`, payload);
  return data;
}

export async function deleteClass(id: number): Promise<void> {
  await http.delete(`/classes/${id}`);
}

/* =========================
   Files (matches: GET/POST /api/files/{class_id}, DELETE /api/files/{file_id})
========================= */

export async function listFiles(classId: number): Promise<FileRow[]> {
  const { data } = await http.get<FileRow[]>(`/files/${classId}`);
  return Array.isArray(data) ? data : [];
}

export async function uploadFile(classId: number, file: File): Promise<FileRow> {
  const fd = new FormData();
  fd.append("file", file);
  const { data } = await http.post<FileRow>(`/files/${classId}`, fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function deleteFile(fileId: string): Promise<void> {
  await http.delete(`/files/${fileId}`);
}

/* =========================
   Chunks & Embeddings
========================= */

export async function createChunks(payload: {
  file_ids: string[];
  by: "page" | "tokens";
  size: number;
  overlap: number;
  preview_limit_per_file?: number;
}): Promise<ChunkPreview[]> {
  const { data } = await http.post<ChunkPreview[]>("/chunks", payload);
  return Array.isArray(data) ? data : [];
}

export async function buildEmbeddings(
  classId: number,
  limit?: number
): Promise<{ queued: number }> {
  const { data } = await http.post<{ queued: number }>(
    "/embeddings/build",
    { class_id: classId, limit }
  );
  return data;
}

/* =========================
   Flashcards (matches server: see your route log)
   - GET    /api/flashcards/{class_id}
   - POST   /api/flashcards/generate
   - POST   /api/flashcards/ensure-embeddings/{class_id}
   - DELETE /api/flashcards/{card_id}
========================= */

export async function listFlashcards(classId?: number): Promise<Flashcard[]> {
  const url = typeof classId === "number"
    ? `/flashcards/${classId}`
    : `/flashcards`; // optional, in case a list-all exists
  const { data } = await http.get(url);
  if (Array.isArray(data)) return data;
  if (Array.isArray((data as any)?.items)) return (data as any).items;
  if (Array.isArray((data as any)?.cards)) return (data as any).cards;
  return [];
}

export async function generateFlashcards(payload: {
  class_id: number;
  file_ids: string[];
  top_k?: number;
  difficulty?: "easy" | "medium" | "hard";
}): Promise<Flashcard[]> {
  const { data } = await http.post<Flashcard[]>("/flashcards/generate", payload);
  return Array.isArray(data) ? data : [];
}

export async function ensureClassEmbeddings(classId: number): Promise<void> {
  // optional helper for the ensure-embeddings route your server exposes
  await http.post(`/flashcards/ensure-embeddings/${classId}`, {});
}

export async function deleteFlashcard(id: number): Promise<void> {
  await http.delete(`/flashcards/${id}`);
}

/* =========================
   Contact / Auth
========================= */

export async function postContact(payload: ContactPayload): Promise<{ ok: boolean }> {
  const { data } = await http.post<{ ok?: boolean }>("/contact", payload);
  return { ok: data?.ok ?? true };
}

export async function logout(): Promise<void> {
  await http.post("/auth/logout", {});
}

export async function deleteAccount(): Promise<{ ok: boolean }> {
  const { data } = await http.delete<{ ok?: boolean }>("/account");
  return { ok: data?.ok ?? true };
}

/* =========================
   Utilities
========================= */

export function fileOpenUrl(row: FileRow): string {
  // If API already returns absolute URLs, just pass through.
  if (/^https?:\/\//i.test(row.storage_url)) return row.storage_url;
  const base = API_BASE.replace(/\/+$/, "");
  const path = row.storage_url.startsWith("/") ? row.storage_url : `/${row.storage_url}`;
  return `${base}${path}`;
}
