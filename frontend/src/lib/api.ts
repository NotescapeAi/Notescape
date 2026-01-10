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
  if (!user) {
    return { "X-User-Id": "dev-user" };
  }
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
  mime_type?: string | null;
  uploaded_at?: string | null;
  storage_url: string;
  class_id?: number;
  status?: string | null;
  ocr_job_id?: string | null;
  indexed_at?: string | null;
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
  id: string;
  question: string;
  answer: string;
  hint?: string | null;
  tags?: string[] | null;
  class_id?: number;
  file_id?: string | null;
  due_at?: string | null;
  repetitions?: number | null;
  ease_factor?: number | null;
  interval_days?: number | null;
  state?: string | null;
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
    console.error(" Failed to create class:", err.response?.data || err.message);
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

export async function updateFile(fileId: string, payload: { filename: string }): Promise<{ ok: boolean; id: string; filename: string }> {
  const headers = await userHeader();
  const { data } = await http.put<{ ok: boolean; id: string; filename: string }>(`/files/${fileId}`, payload, { headers });
  return data;
}

/* =========================
   Chunks & Embeddings 
========================= */



export async function listFlashcards(classId?: number, fileId?: string): Promise<Flashcard[]> {
  const base = typeof classId === "number" ? `/flashcards/${classId}` : `/flashcards`;
  const url = fileId ? `${base}?file_id=${fileId}` : base;
  const headers = await userHeader();
  const { data } = await http.get(url, { headers });
  if (Array.isArray(data)) return data;
  if (Array.isArray((data as any)?.items)) return (data as any).items;
  if (Array.isArray((data as any)?.cards)) return (data as any).cards;
  return [];
}

export async function generateFlashcards(payload: {
  class_id: number;
  file_ids: string[];
  top_k?: number;
  n_cards?: number;
  style?: "mixed" | "definitions" | "conceptual" | "qa";
  page_start?: number;
  page_end?: number;
  difficulty?: "easy" | "medium" | "hard";
}): Promise<Flashcard[]> {
  const headers = await userHeader();
  const { data } = await http.post<Flashcard[]>("/flashcards/generate", payload, { headers });
  return Array.isArray(data) ? data : [];
}

export async function deleteFlashcard(id: string): Promise<void> {
  const headers = await userHeader();
  await http.delete(`/flashcards/${id}`, { headers });
}

export async function createFlashcard(payload: {
  class_id: number;
  question: string;
  answer: string;
  file_id?: string | null;
  hint?: string | null;
  tags?: string[];
  difficulty?: "easy" | "medium" | "hard";
}): Promise<{ id: string }> {
  const headers = await userHeader();
  const { data } = await http.post<{ id: string }>("/flashcards", payload, { headers });
  return data;
}

export async function updateFlashcard(id: string, payload: {
  question?: string;
  answer?: string;
  file_id?: string | null;
  hint?: string | null;
  tags?: string[];
  difficulty?: "easy" | "medium" | "hard";
  reset_progress?: boolean;
}): Promise<{ ok: boolean }> {
  const headers = await userHeader();
  const { data } = await http.put<{ ok: boolean }>(`/flashcards/${id}`, payload, { headers });
  return data;
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
  const headers = await userHeader();
  const { data } = await http.post<ChatAskRes>("/chat/ask", payload, { headers });
  return data;
}

export type ChatSession = {
  id: string;
  class_id: number;
  title: string;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: any;
  selected_text?: string | null;
  file_id?: string | null;
  file_scope?: string[] | null;
  image_attachment?: {
    data_url?: string;
    content_type?: string;
    file_id?: string | null;
    page?: number | null;
    width?: number | null;
    height?: number | null;
  } | null;
  created_at?: string | null;
};

export async function createChatSession(payload: { class_id: number; title?: string }): Promise<ChatSession> {
  const headers = await userHeader();
  const { data } = await http.post<ChatSession>("/chat/sessions", payload, { headers });
  return data;
}

export async function listChatSessions(classId: number): Promise<ChatSession[]> {
  const headers = await userHeader();
  const { data } = await http.get<ChatSession[]>(`/chat/sessions?class_id=${classId}`, { headers });
  return Array.isArray(data) ? data : [];
}

export async function getChatSession(sessionId: string): Promise<{ session: ChatSession; messages: ChatMessage[] }> {
  const headers = await userHeader();
  const { data } = await http.get(`/chat/sessions/${sessionId}`, { headers });
  return data;
}

export async function listChatSessionMessages(sessionId: string): Promise<ChatMessage[]> {
  const headers = await userHeader();
  const { data } = await http.get(`/chat/sessions/${sessionId}/messages`, { headers });
  return Array.isArray(data) ? data : [];
}

export async function addChatMessages(payload: {
  session_id: string;
  user_content: string;
  assistant_content: string;
  citations?: any;
  selected_text?: string | null;
  file_id?: string | null;
  file_scope?: string[] | null;
  image_attachment?: {
    data_url: string;
    content_type: string;
    file_id?: string | null;
    page?: number | null;
    width?: number | null;
    height?: number | null;
  } | null;
}): Promise<{ ok: boolean; messages?: ChatMessage[] }> {
  const headers = await userHeader();
  const { data } = await http.post(`/chat/sessions/${payload.session_id}/messages`, {
    user_content: payload.user_content,
    assistant_content: payload.assistant_content,
    citations: payload.citations ?? null,
    selected_text: payload.selected_text ?? null,
    file_id: payload.file_id ?? null,
    file_scope: payload.file_scope ?? null,
    image_attachment: payload.image_attachment ?? null,
  }, { headers });
  return data;
}

export async function deleteChatSession(sessionId: string, classId?: number): Promise<{ ok: boolean; session_id: string }> {
  const headers = await userHeader();
  const params = classId != null ? `?class_id=${classId}` : "";
  const { data } = await http.delete(`/chat/sessions/${sessionId}${params}`, { headers });
  return data;
}

export async function clearChatSessionMessages(sessionId: string): Promise<{ ok: boolean; session_id: string }> {
  const headers = await userHeader();
  const { data } = await http.delete(`/chat/sessions/${sessionId}/messages`, { headers });
  return data;
}

export async function ocrImageSnippet(dataUrl: string): Promise<{ text: string }> {
  const headers = await userHeader();
  const { data } = await http.post<{ text: string }>("/chat/ocr", { data_url: dataUrl }, { headers });
  return data;
}

export type FileChunk = {
  id: string;
  idx: number;
  char_len: number;
  page_start?: number | null;
  page_end?: number | null;
  sample: string;
};

export async function listFileChunks(fileId: string, opts?: { limit?: number; offset?: number; full?: boolean }): Promise<FileChunk[]> {
  const params = new URLSearchParams();
  if (opts?.limit != null) params.set("limit", String(opts.limit));
  if (opts?.offset != null) params.set("offset", String(opts.offset));
  if (opts?.full != null) params.set("full", String(opts.full));
  const { data } = await http.get<FileChunk[]>(`/files/${fileId}/chunks?${params.toString()}`);
  return Array.isArray(data) ? data : [];
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
    console.error(" EmailJS Error:", err);
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
  const headers = await userHeader();
  const { data } = await http.delete<{ ok?: boolean }>("/account", { headers });
  return { ok: data?.ok ?? true };
}

export type ProfileData = {
  id: string;
  email: string;
  full_name?: string | null;
  avatar_url?: string | null;
  provider: string;
  provider_id: string;
  display_name?: string | null;
  dark_mode?: boolean;
  created_at?: string;
  updated_at?: string;
};

export async function getProfile(): Promise<ProfileData> {
  const headers = await userHeader();
  const { data } = await http.get<ProfileData>("/profile", { headers });
  return data;
}

export async function updateProfile(payload: {
  display_name?: string;
  avatar_url?: string | null;
}): Promise<ProfileData> {
  const headers = await userHeader();
  const { data } = await http.patch<ProfileData>("/profile", payload, { headers });
  return data;
}

export async function getSettings(): Promise<{ dark_mode: boolean }> {
  const headers = await userHeader();
  const { data } = await http.get<{ dark_mode: boolean }>("/settings", { headers });
  return data;
}

export async function updateSettings(payload: { dark_mode: boolean }): Promise<{ dark_mode: boolean }> {
  const headers = await userHeader();
  const { data } = await http.patch<{ dark_mode: boolean }>("/settings", payload, { headers });
  return data;
}

export async function getPreferences(): Promise<{ theme: "light" | "dark" | "system" }> {
  const headers = await userHeader();
  const { data } = await http.get<{ theme: "light" | "dark" | "system" }>("/preferences", { headers });
  return data;
}

export async function updatePreferences(payload: {
  theme: "light" | "dark" | "system";
}): Promise<{ theme: "light" | "dark" | "system" }> {
  const headers = await userHeader();
  const { data } = await http.patch<{ theme: "light" | "dark" | "system" }>("/preferences", payload, { headers });
  return data;
}

export async function resetFlashcardProgress(): Promise<{ ok: boolean }> {
  const headers = await userHeader();
  const { data } = await http.post<{ ok?: boolean }>("/settings/reset-flashcards", {}, { headers });
  return { ok: data?.ok ?? true };
}

export async function clearChatHistory(): Promise<{ ok: boolean }> {
  const headers = await userHeader();
  const { data } = await http.post<{ ok?: boolean }>("/settings/clear-chat", {}, { headers });
  return { ok: data?.ok ?? true };
}

export async function clearEmbeddings(): Promise<{ ok: boolean }> {
  const headers = await userHeader();
  const { data } = await http.post<{ ok?: boolean }>("/settings/clear-embeddings", {}, { headers });
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
  const headers = await userHeader();
  const { data } = await http.post<ChunkPreview[]>("/chunks", payload, { headers });
  return Array.isArray(data) ? data : [];
}

export async function buildEmbeddings(
  classId: number,
  limit?: number
): Promise<{ inserted: number }> {
  const params = new URLSearchParams({ class_id: String(classId) });
  if (typeof limit === "number") params.set("limit", String(limit));
  const headers = await userHeader();
  const { data } = await http.post<{ inserted: number }>(
    `/embeddings/build?${params.toString()}`,
    {},
    { headers }
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


export async function listDueCards(classId: number, fileId?: string, limit = 9999) {
  const params = new URLSearchParams({ class_id: String(classId), limit: String(limit) });
  if (fileId) params.set("file_id", fileId);
  const headers = await userHeader();
  const response = await fetch(`${API_BASE}/flashcards/due?${params.toString()}`, {
    headers,
  });
  if (!response.ok) throw new Error(`Failed to load due cards (HTTP ${response.status})`);
  return response.json();
}

export async function postReview(cardId: string, confidence: 1 | 2 | 3 | 4 | 5) {
  const headers = await userHeader();
  const response = await fetch(`${API_BASE}/flashcards/${cardId}/review`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ confidence }),
  });
  if (!response.ok) throw new Error(`Failed to post review (HTTP ${response.status})`);
  return response.json();
}

export async function getFlashcardProgress(classId: number, fileId?: string) {
  const params = new URLSearchParams({ class_id: String(classId) });
  if (fileId) params.set("file_id", fileId);
  const headers = await userHeader();
  const response = await fetch(`${API_BASE}/flashcards/progress?${params.toString()}`, {
    headers,
  });
  if (!response.ok) throw new Error(`Failed to load progress (HTTP ${response.status})`);
  return response.json();
}


