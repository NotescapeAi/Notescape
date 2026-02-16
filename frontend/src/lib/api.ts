// frontend/src/lib/api.ts
import axios from "axios";
import emailjs from "@emailjs/browser";
import { auth } from "../firebase/firebase";
import { onAuthStateChanged } from "firebase/auth";

/** Base URL: prefer Vite env, else relative /api */
const API_BASE =
  (import.meta as any)?.env?.VITE_API_BASE_URL?.toString() ?? "http://localhost:8000/api";


const http = axios.create({
  baseURL: API_BASE,
  withCredentials: false,
});



// Get auth headers for Firebase user
async function userHeader(): Promise<Record<string, string>> {
  let user = auth.currentUser;
  if (!user) {
    user = await new Promise((resolve) => {
      const unsub = onAuthStateChanged(auth, (next) => {
        unsub();
        resolve(next);
      });
    });
  }
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

export type FlashcardJob = {
  job_id: string;
  deck_id: number;
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  error_message?: string | null;
  created_at?: string | null;
};

export type AnalyticsOverview = {
  reviews_today: number;
  reviews_last_7_days: number;
  avg_response_time: number;
  upcoming_reviews_count: number;
};

export type WeakTopic = {
  deck_id: number;
  topic_id?: string | null;
  total_reviews: number;
  struggle_reviews: number;
  struggle_rate: number;
  avg_response_time: number;
  avg_lapses: number;
  avg_interval: number;
  weakness_score: number;
};

export type WeakCard = {
  card_id: string;
  question: string;
  deck_id: number;
  topic_id?: string | null;
  total_reviews: number;
  struggle_reviews: number;
  struggle_rate: number;
  avg_response_time: number;
  lapse_count: number;
  interval: number;
  weakness_score: number;
};

export type StudyTrendPoint = {
  day: string;
  total_reviews: number;
  avg_response_time: number;
};

export type WeakTag = {
  tag_id: number;
  tag: string;
  quiz_accuracy: number;
  quiz_accuracy_pct: number;
  flashcard_difficulty: number;
  flashcard_difficulty_pct: number;
  weakness_score: number;
  class_id?: number | null;
  last_seen?: string | null;
};

export type QuizTagBreakdown = {
  tag_id: number;
  tag: string;
  accuracy: number;
  accuracy_pct: number;
  total_questions: number;
  struggled_questions: number;
  missing_points: string[];
};

export type QuizBreakdown = {
  attempt_id: string;
  struggled_tags: string[];
  by_tag: QuizTagBreakdown[];
};

export type MasteryCard = {
  id: string;
  question: string;
  answer: string;
  hint?: string | null;
  difficulty?: string | null;
  tags?: string[] | null;
};

export type MasterySession = {
  session_id: string;
  current_index?: number;
  total_cards?: number;
  total_unique?: number;
  mastered_count?: number;
  mastery_percent?: number;
  total_reviews?: number;
  average_rating?: number;
  session_seconds?: number;
  done?: boolean;
  ended?: boolean;
  current_card?: MasteryCard | null;
};

export type StudySession = {
  id: string;
  user_id: string;
  class_id?: number | null;
  class_name?: string | null;
  mode: string;
  started_at?: string | null;
  ended_at?: string | null;
  duration_seconds?: number | null;
  active_seconds?: number | null;
  last_active_at?: string | null;
};

export type StudySessionOverview = {
  total_seconds_7d: number;
  total_seconds_30d: number;
  total_seconds_all: number;
  sessions_7d: number;
  sessions_30d: number;
  sessions_all: number;
  avg_seconds_7d: number;
  avg_seconds_30d: number;
  avg_seconds_all: number;
};

export type StudySessionTrend = {
  day: string;
  total_seconds: number;
  sessions: number;
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

export async function getDocumentViewUrl(classId: number, documentId: string): Promise<{ url: string; content_type?: string | null }> {
  const headers = await userHeader();
  const { data } = await http.get<{ url: string; content_type?: string | null }>(
    `/classes/${classId}/documents/${documentId}/view-url`,
    { headers }
  );
  return data;
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
}): Promise<FlashcardJob> {
  const headers = await userHeader();
  const { data } = await http.post<FlashcardJob>("/flashcards/generate", payload, { headers });
  return data;
}

export async function generateFlashcardsAsync(payload: {
  class_id: number;
  file_ids: string[];
  top_k?: number;
  n_cards?: number;
  style?: "mixed" | "definitions" | "conceptual" | "qa";
  page_start?: number;
  page_end?: number;
  difficulty?: "easy" | "medium" | "hard";
}): Promise<FlashcardJob> {
  const headers = await userHeader();
  const { data } = await http.post<FlashcardJob>("/flashcards/generate_async", payload, { headers });
  return data;
}

export async function getFlashcardJobStatus(jobId: string): Promise<FlashcardJob> {
  const headers = await userHeader();
  const { data } = await http.get<FlashcardJob>(`/flashcards/job_status/${jobId}`, { headers });
  return data;
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
  document_id?: string | null;
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
  page_number?: number | null;
  bounding_box?: { x: number; y: number; width: number; height: number } | null;
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

export async function createChatSession(payload: {
  class_id: number;
  document_id?: string | null;
  title?: string;
}): Promise<ChatSession> {
  const headers = await userHeader();
  const { data } = await http.post<ChatSession>("/chat/sessions", payload, { headers });
  return data;
}

export async function listChatSessions(classId: number, documentId?: string | null): Promise<ChatSession[]> {
  const headers = await userHeader();
  const doc = documentId ? `&document_id=${documentId}` : "";
  const { data } = await http.get<ChatSession[]>(`/chat/sessions?class_id=${classId}${doc}`, { headers });
  return Array.isArray(data) ? data : [];
}

export async function updateChatSession(sessionId: string, payload: { title: string }): Promise<ChatSession> {
  const headers = await userHeader();
  const { data } = await http.patch<ChatSession>(`/chat/sessions/${sessionId}`, payload, { headers });
  return data;
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
  page_number?: number | null;
  bounding_box?: { x: number; y: number; width: number; height: number } | null;
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
    page_number: payload.page_number ?? null,
    bounding_box: payload.bounding_box ?? null,
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

export async function startMasterySession(payload: {
  class_id: number;
  file_ids?: string[];
}): Promise<MasterySession> {
  const headers = await userHeader();
  const { data } = await http.post<MasterySession>("/flashcards/mastery/session/start", payload, { headers });
  return data;
}

export async function startStudySession(payload: {
  class_id?: number;
  mode?: "study" | "view";
}): Promise<StudySession> {
  const headers = await userHeader();
  const { data } = await http.post<StudySession>("/study-sessions/start", payload, { headers });
  return data;
}

export async function heartbeatStudySession(payload: {
  session_id: string;
  accumulated_seconds: number;
  cards_seen?: number;
  cards_completed?: number;
  correct_count?: number;
  incorrect_count?: number;
}): Promise<StudySession> {
  const headers = await userHeader();
  const { data } = await http.patch<StudySession>(`/study-sessions/${payload.session_id}/heartbeat`, payload, { headers });
  return data;
}

export async function endStudySession(payload: {
  session_id: string;
  accumulated_seconds?: number;
}): Promise<StudySession> {
  const headers = await userHeader();
  const { data } = await http.post<StudySession>(`/study-sessions/${payload.session_id}/end`, payload, { headers });
  return data;
}

export async function getStudySessionOverview(): Promise<StudySessionOverview> {
  const headers = await userHeader();
  const { data } = await http.get<StudySessionOverview>("/study-sessions/overview", { headers });
  return data;
}

export async function listRecentStudySessions(limit = 10): Promise<StudySession[]> {
  const headers = await userHeader();
  const { data } = await http.get<StudySession[]>(`/study-sessions/recent?limit=${limit}`, { headers });
  return Array.isArray(data) ? data : [];
}

export async function getStudySessionTrends(days = 14): Promise<StudySessionTrend[]> {
  const headers = await userHeader();
  const { data } = await http.get<StudySessionTrend[]>(`/study-sessions/trends?days=${days}`, { headers });
  return Array.isArray(data) ? data : [];
}

export async function getMasterySession(sessionId: string): Promise<MasterySession> {
  const headers = await userHeader();
  const { data } = await http.get<MasterySession>(`/flashcards/mastery/session/${sessionId}`, { headers });
  return data;
}

export async function reviewMasteryCard(payload: {
  session_id: string;
  card_id: string;
  rating: 1 | 2 | 3 | 4 | 5;
  response_time_ms?: number;
}): Promise<MasterySession> {
  const headers = await userHeader();
  const { data } = await http.post<MasterySession>(
    `/flashcards/mastery/session/${payload.session_id}/review`,
    {
      card_id: payload.card_id,
      rating: payload.rating,
      response_time_ms: payload.response_time_ms ?? null,
    },
    { headers }
  );
  return data;
}

export async function endMasterySession(sessionId: string): Promise<{ ok: boolean; session_id: string }> {
  const headers = await userHeader();
  const { data } = await http.post<{ ok: boolean; session_id: string }>(
    `/flashcards/mastery/session/${sessionId}/end`,
    {},
    { headers }
  );
  return data;
}

export async function resetMasteryProgress(classId: number): Promise<{ ok: boolean }> {
  const headers = await userHeader();
  const { data } = await http.post<{ ok: boolean }>(
    `/flashcards/mastery/reset?class_id=${classId}`,
    {},
    { headers }
  );
  return data;
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

export async function postReview(
  cardId: string,
  confidence: 1 | 2 | 3 | 4 | 5,
  responseTimeMs?: number
) {
  const headers = await userHeader();
  const response = await fetch(`${API_BASE}/flashcards/${cardId}/review`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ confidence, response_time_ms: responseTimeMs ?? null }),
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

export async function getMasteryStats(classId: number, fileId?: string) {
  const params = new URLSearchParams({ class_id: String(classId) });
  if (fileId) params.set("file_id", fileId);
  const headers = await userHeader();
  const { data } = await http.get(`/flashcards/mastery/stats?${params.toString()}`, { headers });
  return data as {
    total_unique: number;
    mastered_count: number;
    mastery_percent: number;
    total_reviews: number;
    average_rating: number;
  };
}

/* =========================
   Analytics
========================= */

export async function getAnalyticsOverview(): Promise<AnalyticsOverview> {
  const headers = await userHeader();
  const { data } = await http.get<AnalyticsOverview>("/analytics/overview", { headers });
  return data;
}

export async function getWeakTopics(params?: { days?: number; limit?: number }): Promise<WeakTopic[]> {
  const headers = await userHeader();
  const search = new URLSearchParams();
  if (params?.days != null) search.set("days", String(params.days));
  if (params?.limit != null) search.set("limit", String(params.limit));
  const q = search.toString();
  const { data } = await http.get<WeakTopic[]>(`/analytics/weak-topics${q ? `?${q}` : ""}`, { headers });
  return Array.isArray(data) ? data : [];
}

export async function getWeakCards(params?: { days?: number; limit?: number; deck_id?: number }): Promise<WeakCard[]> {
  const headers = await userHeader();
  const search = new URLSearchParams();
  if (params?.days != null) search.set("days", String(params.days));
  if (params?.limit != null) search.set("limit", String(params.limit));
  if (params?.deck_id != null) search.set("deck_id", String(params.deck_id));
  const q = search.toString();
  const { data } = await http.get<WeakCard[]>(`/analytics/weak-cards${q ? `?${q}` : ""}`, { headers });
  return Array.isArray(data) ? data : [];
}

export async function getStudyTrends(params?: { days?: number }): Promise<StudyTrendPoint[]> {
  const headers = await userHeader();
  const search = new URLSearchParams();
  if (params?.days != null) search.set("days", String(params.days));
  const q = search.toString();
  const { data } = await http.get<StudyTrendPoint[]>(`/analytics/study-trends${q ? `?${q}` : ""}`, { headers });
  return Array.isArray(data) ? data : [];
}

export async function getWeakTags(params?: {
  limit?: number;
  recent_quiz_attempts?: number;
  recent_flashcard_reviews?: number;
}): Promise<WeakTag[]> {
  const headers = await userHeader();
  const search = new URLSearchParams();
  if (params?.limit != null) search.set("limit", String(params.limit));
  if (params?.recent_quiz_attempts != null) search.set("recent_quiz_attempts", String(params.recent_quiz_attempts));
  if (params?.recent_flashcard_reviews != null) search.set("recent_flashcard_reviews", String(params.recent_flashcard_reviews));
  const q = search.toString();
  const { data } = await http.get<WeakTag[]>(`/analytics/weak-tags${q ? `?${q}` : ""}`, { headers });
  return Array.isArray(data) ? data : [];
}

export async function getTagAnalytics(tagId: number): Promise<{
  tag_id: number;
  tag: string;
  quiz_accuracy: number;
  quiz_accuracy_pct: number;
  flashcard_difficulty: number;
  flashcard_difficulty_pct: number;
  weakness_score: number;
  quiz_question_count: number;
  flashcard_count: number;
}> {
  const headers = await userHeader();
  const { data } = await http.get(`/analytics/tag/${tagId}`, { headers });
  return data;
}

export async function getQuizBreakdown(attemptId: string): Promise<QuizBreakdown> {
  const headers = await userHeader();
  const { data } = await http.get<QuizBreakdown>(`/analytics/quiz-breakdown/${attemptId}`, { headers });
  return data;
}




// -----------------------
// Quizzes API - ENHANCED VERSION
// -----------------------

// -----------------------
// Quizzes API - WITH MCQ_COUNT SUPPORT
// -----------------------

export type QuizQuestion = {
  id: number;
  position: number;
  qtype: string;
  question: string;
  options?: string[];
  explanation?: string;
  difficulty?: string;
  page_start?: number;
  page_end?: number;
};

export type QuizListItem = {
  id: string;
  class_id: number;
  file_id: string;
  title: string;
  created_at?: string;
};

export type QuizDetail = {
  quiz: QuizListItem;
  items: QuizQuestion[];
};

export type QuizJobResponse = {
  job_id: string;
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  error_message?: string;
};

export type StartAttemptResponse = {
  attempt_id: string;
  quiz_id: string;
  total: number;
};

export type SubmitAttemptResponse = {
  attempt_id: string;
  quiz_id: string;
  score: number;
  total: number;
  results: Array<{
    question_id: number;
    qtype: string;
    is_correct: boolean | null;
    score: number;
    feedback?: string;
    missing_points?: string[];
    correct_index?: number;
    answer_key?: string;
  }>;
};

// Create quiz generation job - NOW WITH mcq_count SUPPORT
export async function createQuizJob(payload: {
  class_id: number;
  file_id: string;
  n_questions: number;
  mcq_count?: number;  // NEW: Optional specific MCQ count
  types: Array<"mcq" | "conceptual" | "definition" | "scenario" | "short_qa">;
  difficulty: "easy" | "medium" | "hard";
}): Promise<QuizJobResponse> {
  const headers = await userHeader();
  const { data } = await http.post<QuizJobResponse>("/quizzes/jobs", payload, { headers });
  return data;
}

// Get quiz job status
export async function getQuizJobStatus(jobId: string): Promise<QuizJobResponse> {
  const headers = await userHeader();
  const { data } = await http.get<QuizJobResponse>(`/quizzes/jobs/${jobId}`, { headers });
  return data;
}

// List quizzes for a class
export async function listQuizzes(classId: number): Promise<QuizListItem[]> {
  const headers = await userHeader();
  const { data } = await http.get<QuizListItem[]>(`/quizzes`, { 
    params: { class_id: classId },
    headers 
  });
  return Array.isArray(data) ? data : [];
}

// Get quiz details without answers
export async function getQuiz(quizId: string): Promise<QuizDetail> {
  const headers = await userHeader();
  const { data } = await http.get<QuizDetail>(`/quizzes/${quizId}`, { headers });
  return data;
}

// Get quiz answer key (optional endpoint)
export async function getQuizAnswers(quizId: string): Promise<Array<{
  question_id: number;
  correct_index?: number;
  answer_key?: string;
}>> {
  const headers = await userHeader();
  try {
    const { data } = await http.get(`/quizzes/${quizId}/answers`, { headers });
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.warn("Answer key endpoint not available:", error);
    return [];
  }
}

// Start a quiz attempt
export async function startQuizAttempt(quizId: string): Promise<StartAttemptResponse> {
  const headers = await userHeader();
  const { data } = await http.post<StartAttemptResponse>(
    `/quizzes/${quizId}/attempts`,
    {},
    { headers }
  );
  return data;
}

// Submit quiz attempt with answers
export async function submitQuizAttempt(
  attemptId: string,
  answers: Array<{
    question_id: number;
    selected_index?: number;
    written_answer?: string;
  }>,
  revealAnswers: boolean = true
): Promise<SubmitAttemptResponse> {
  const headers = await userHeader();
  const { data } = await http.post<SubmitAttemptResponse>(
    `/quizzes/attempts/${attemptId}/submit`,
    { answers, reveal_answers: revealAnswers },
    { headers }
  );
  return data;
}

// Delete quiz
export async function deleteQuiz(quizId: string): Promise<void> {
  const headers = await userHeader();
  await http.delete(`/quizzes/${quizId}`, { headers });
}
