// frontend/src/lib/api.ts
import axios from "axios";
import emailjs from "@emailjs/browser";
import { auth } from "../firebase/firebase";

/** Base URL: prefer Vite env, else relative /api */
const API_BASE =
  (import.meta as any)?.env?.VITE_API_BASE_URL?.toString() ?? "/api";

const http = axios.create({
  baseURL: API_BASE,
  withCredentials: false,
});



// Get auth headers for Firebase user
async function userHeader(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) throw new Error("User not authenticated");
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

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
   Classes API
========================= */
export async function listClasses(): Promise<ClassRow[]> {
  const headers = await userHeader();
  const { data } = await http.get<ClassRow[]>("/classes", { headers });
  return Array.isArray(data) ? data : [];
}

export async function createClass(payload: {
  name: string;
  subject?: string;
}): Promise<ClassRow> {
  const headers = await userHeader();
  try {
    const { data } = await http.post<ClassRow>("/classes", payload, { headers });
    return data;
  } catch (err: any) {
    console.error("❌ Failed to create class:", err.response?.data || err.message);
    throw err;
  }
}

export async function updateClass(
  id: number,
  payload: Partial<Pick<ClassRow, "name" | "subject">>
): Promise<ClassRow> {
  const headers = await userHeader();
  const { data } = await http.put<ClassRow>(`/classes/${id}`, payload, { headers });
  return data;
}

export async function deleteClass(id: number): Promise<void> {
  const headers = await userHeader();
  await http.delete(`/classes/${id}`, { headers });
}

/* =========================
   Files API
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



export async function listFlashcards(classId?: number): Promise<Flashcard[]> {
  const url = typeof classId === "number" ? `/flashcards/${classId}` : `/flashcards`;
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
   Contact API (EmailJS + Backend)
========================= */
const SERVICE_ID = "service_wmj4khq";
const TEMPLATE_ID = "template_i25p8sl";
const PUBLIC_KEY = "htKmLSqT2hZ5wCAeQ";

export async function postContact({
  name,
  email,
  message,
}: {
  name: string;
  email: string;
  message: string;
}) {
  try {
    const res = await emailjs.send(
      SERVICE_ID,
      TEMPLATE_ID,
      { from_name: name, from_email: email, message },
      PUBLIC_KEY
    );
    return res;
  } catch (err) {
    console.error("❌ EmailJS Error:", err);
    throw err;
  }
}

export async function postContactApi(payload: ContactPayload): Promise<{ ok: boolean }> {
  const { data } = await http.post<{ ok?: boolean }>("/contact", payload);
  return { ok: data?.ok ?? true };
}

/* =========================
   Auth API
========================= */
export async function logout(): Promise<void> {
  await http.post("/auth/logout", {});
}
http.interceptors.request.use((config) => {
  const token = localStorage.getItem("auth_token");
  if (token) {
    config.headers = config.headers ?? {};
    (config.headers as any).Authorization = `Bearer ${token}`;
  }
  return config;
});


export async function deleteAccount(): Promise<{ ok: boolean }> {
  const { data } = await http.delete<{ ok?: boolean }>("/account");
  return { ok: data?.ok ?? true };
}
/* =========================
   Chunks & Embeddings
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
   Spaced Repetition (SR)
========================= */

// Spaced Repetition (SR)
const SR_BASE = /\/api\/?$/i.test(API_BASE)
  ? API_BASE.replace(/\/+$/, "")
  : `${API_BASE.replace(/\/+$/, "")}/api`;


export async function listDueCards(classId: number, limit = 9999) {
  const url = `${SR_BASE}/sr/due/${classId}?limit=${limit}`;
  const response = await fetch(url, {
    headers: { "X-User-Id": "dev-user" }, // replace with real user ID if needed
  });
  if (!response.ok) throw new Error(`Failed to load due cards (HTTP ${response.status})`);
  return response.json();
}

export async function postReview(reviewData: any) {
  const response = await fetch(`${SR_BASE}/sr/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reviewData),
  });
  if (!response.ok) throw new Error(`Failed to post review (HTTP ${response.status})`);
  return response.json();
}

