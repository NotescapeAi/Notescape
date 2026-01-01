// frontend/src/lib/api.ts
import axios from "axios";
import emailjs from "@emailjs/browser";

/** Base URL: prefer Vite env, else relative /api (works in dev proxy & Docker) */
const API_BASE =
  (import.meta as any)?.env?.VITE_API_BASE_URL?.toString() ?? "/api";

const http = axios.create({
  baseURL: API_BASE,
  withCredentials: false,
});

// FIX: legacy alias for places that still use `API`
const API = API_BASE; // <-- added

function userHeader() {
  const u = localStorage.getItem("user_id");
  if (!u || !u.trim()) throw new Error("Please set your user_id first (localStorage).");
  return { "X-User-Id": u.trim() };
}

/* =========================
   Small JSON helper (kept in case you need it)
========================= */
async function j<T = any>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`${r.status} ${r.statusText}${txt ? ` — ${txt}` : ""}`);
  }
  return (await r.json()) as T;
}

/* =========================
   Basic health endpoints (FIXED: use http instead of missing API const)
========================= */
export async function getHealth() {
  const { data } = await http.get("/health");
  return data;
}

export async function getHello() {
  const { data } = await http.get("/hello");
  return data;
}

/* =========================
   EmailJS contact (kept as your primary postContact)
========================= */
// If you prefer envs, use import.meta.env.VITE_EMAILJS_* instead of hardcoding:
const SERVICE_ID = "service_wmj4khq";
const TEMPLATE_ID = "template_i25p8sl";
const PUBLIC_KEY  = "htKmLSqT2hZ5wCAeQ";

export async function postContact({
  name,
  email,
  message,
}: {
  name: string;
  email: string;
  message: string;
}) {
  console.log("📨 Sending with:", {
    service: SERVICE_ID,
    template: TEMPLATE_ID,
    publicKey: PUBLIC_KEY,
    params: { from_name: name, from_email: email, message },
  });

  try {
    const res = await emailjs.send(
      SERVICE_ID,
      TEMPLATE_ID,
      {
        from_name: name,
        from_email: email,
        message,
        to_email: "notescapeai@gmail.com", // optional if template already sets To
      },
      PUBLIC_KEY
    );
    console.log("✅ EmailJS Success:", res);
    return res;
  } catch (err) {
    console.error("❌ EmailJS Error:", err);
    throw err;
  }
}

/* =========================
   Types (unchanged)
========================= */
export type ClassRow = {
  id: number;
  name: string;
  subject?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type FileRow = {
  id: string;
  filename: string;
  size_bytes: number;
  uploaded_at?: string | null;
  storage_url: string;
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
   Classes (unchanged)
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
   Files (unchanged)
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
   Chunks & Embeddings (unchanged)
========================= */
export async function createChunks(payload: {
  file_ids: string[];
  by: "auto" | "page" | "chars";

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
   Flashcards (unchanged)
========================= */
export async function listFlashcards(classId?: number): Promise<Flashcard[]> {
  const url =
    typeof classId === "number" ? `/flashcards/${classId}` : `/flashcards`;
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
  await http.post(`/flashcards/ensure-embeddings/${classId}`, {});
}

export async function deleteFlashcard(id: number): Promise<void> {
  await http.delete(`/flashcards/${id}`);
}


export type ChatCitation = {
  chunk_id: number;
  file_id: string;
  filename: string;
  page_start?: number | null;
  page_end?: number | null;
};

export type ChatAskRes = {
  answer: string;
  citations: ChatCitation[];
};

export async function chatAsk(payload: {
  class_id: number;
  question: string;
  top_k?: number;
  file_ids?: string[];
}): Promise<ChatAskRes> {
  const { data } = await http.post<ChatAskRes>("/chat/ask", payload);
  return data;
}

/* =========================
   Contact / Auth
========================= */

/** Backend contact route (RENAMED to avoid collision with EmailJS version) */
export async function postContactApi(
  payload: ContactPayload
): Promise<{ ok: boolean }> {
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
  if (/^https?:\/\//i.test(row.storage_url)) return row.storage_url;
  const base = API_BASE.replace(/\/+$/, "");
  const path = row.storage_url.startsWith("/") ? row.storage_url : `/${row.storage_url}`;
  return `${base}${path}`;
}
// ... existing imports and constants above ...

// FIX: make an SR base that has /api exactly once
// If API already ends with /api → keep it. Otherwise add it.
// This avoids double /api when building SR URLs.
const SR_BASE = /\/api\/?$/i.test(API) ? API : `${API.replace(/\/+$/, "")}/api`;

// -------------------- Spaced Repetition --------------------

// FIX: use SR_BASE so we never get /api/api/...
export async function listDueCards(classId: number, limit = 9999) {
  const url = `${SR_BASE}/sr/due/${classId}?limit=${limit}`; // ✅ no double /api
  const response = await fetch(url, {
    headers: { "X-User-Id": "dev-user" },
  });
  if (!response.ok) throw new Error(`Failed to load due cards (HTTP ${response.status})`);
  return response.json();
}

// (kept) If you want, you can also use SR_BASE here to follow the same rule.
// This keeps your logic identical, just the URL builder is safe.
export const postReview = async (reviewData: any) => {
  try {
    const response = await fetch(`${SR_BASE}/sr/review`, { // ✅ safe base
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reviewData),
    });
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error submitting review:', error);
    throw error;
  }
};
