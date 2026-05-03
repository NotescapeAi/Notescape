// frontend/src/lib/api.ts
import axios from "axios";
import emailjs from "@emailjs/browser";
import { auth } from "../firebase/firebase";
import { onAuthStateChanged } from "firebase/auth";

/**
 * API base URL.
 * In Vite dev, default to same-origin `/api` so requests use the dev-server proxy (see vite.config.ts).
 * Otherwise default to direct backend URL. Override with VITE_API_BASE_URL when needed.
 */
const API_BASE =
  (import.meta as any)?.env?.VITE_API_BASE_URL?.toString()?.trim() ||
  (import.meta.env.DEV ? "/api" : "http://localhost:8000/api");


const http = axios.create({
  baseURL: API_BASE,
  withCredentials: false,
});

function detailMessageFromApi(detail: unknown): string | null {
  if (typeof detail === "string" && detail.trim()) return detail.trim();
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as Record<string, unknown>;
    const msg = first?.msg;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
  }
  if (detail && typeof detail === "object") {
    const rec = detail as Record<string, unknown>;
    const msg = rec.message;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
    const inner = rec.detail;
    if (typeof inner === "string" && inner.trim()) return inner.trim();
    if (inner && typeof inner === "object") {
      const innerMsg = (inner as Record<string, unknown>).message;
      if (typeof innerMsg === "string" && innerMsg.trim()) return innerMsg.trim();
    }
  }
  return null;
}

export function apiErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const detail = (err.response?.data as any)?.detail;
    const detailMessage = detailMessageFromApi(detail);
    if (detailMessage) return detailMessage;
    if (typeof err.message === "string" && err.message.trim()) return err.message;
  }
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
}

async function getAuthToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("User not authenticated");
  return user.getIdToken();
}

/** Same headers axios uses; needed for fetch() (PDF viewer, images) which cannot attach interceptors. */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  return userHeader();
}

/** Backend origin for paths returned by the API that start with `/api/` (e.g. document download URLs). */
export function apiServerOrigin(): string {
  const raw = (
    (import.meta as any)?.env?.VITE_API_BASE_URL?.toString()?.trim() ||
    (import.meta.env.DEV ? "/api" : "http://localhost:8000/api")
  ).trim();
  const normalized = raw.replace(/\/+$/, "");
  const withoutApi = normalized.replace(/\/api\/?$/, "");
  if (withoutApi.startsWith("http://") || withoutApi.startsWith("https://")) {
    return withoutApi;
  }
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "http://localhost:8000";
}

export type AuthenticatedBlobResult = { url: string; revoke?: () => void };

/**
 * Resolve a document URL for use in <img>, react-pdf, etc.
 * Same-origin `/api/...` paths are fetched with auth and turned into a blob URL.
 * Cross-origin URLs (e.g. S3 presigned) are returned as-is for the viewer to load directly.
 */
export async function fetchAuthenticatedBlobUrl(href: string): Promise<AuthenticatedBlobResult> {
  const trimmed = href.trim();
  if (!trimmed) {
    throw new Error("Missing document URL");
  }

  const isAbsolute = /^https?:\/\//i.test(trimmed);
  if (isAbsolute) {
    let sameApiHost = false;
    try {
      const doc = new URL(trimmed);
      const api = new URL(apiServerOrigin());
      sameApiHost = doc.origin === api.origin;
    } catch {
      // fall through to anonymous fetch
    }
    if (!sameApiHost) {
      return { url: trimmed };
    }
  }

  const fetchUrl = trimmed.startsWith("/api/") || trimmed.startsWith("/uploads/")
    ? `${apiServerOrigin()}${trimmed}`
    : `${API_BASE.replace(/\/$/, "")}${trimmed.startsWith("/") ? trimmed : `/${trimmed}`}`;

  const headers = await getAuthHeaders();
  const res = await fetch(fetchUrl, { headers: { ...headers }, redirect: "follow" });
  if (!res.ok) {
    let detail: string | null = null;
    try {
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        const body = (await res.json()) as { detail?: unknown };
        detail = detailMessageFromApi(body?.detail);
      } else {
        const text = (await res.text()).trim();
        if (text) detail = text.slice(0, 200);
      }
    } catch {
      detail = null;
    }
    throw new Error(detail?.trim() || `Request failed (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  return { url, revoke: () => URL.revokeObjectURL(url) };
}

// Get auth headers for Firebase user
async function userHeader(): Promise<Record<string, string>> {
  if (import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH_BYPASS === "true") {
    return { "X-User-Id": "dev-user" };
  }
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
  last_error?: string | null;
  chunk_count?: number | null;
  processing_progress?: number | null;
  source_type?: string | null;
  ocr_provider?: string | null;
  ocr_confidence?: number | null;
  ocr_reviewed_at?: string | null;
  document_type?: string | null;
  preview_type?: string | null;
  preview_error?: string | null;
  viewer_file_url?: string | null;
  viewer_file_path?: string | null;
  viewer_file_type?: string | null;
  viewer_status?: string | null;
  conversion_error?: string | null;
  original_file_url?: string | null;
  original_file_path?: string | null;
};

export type OCRPageReview = {
  page_number: number;
  raw_text: string;
  cleaned_text: string;
  confidence: number;
  lines: Array<{ text: string; confidence?: number; bbox?: number[] | null; needs_review?: boolean }>;
  warnings: string[];
  provider: string;
  image_url?: string | null;
  reviewed: boolean;
};

export type OCRReviewResult = {
  document_id: string;
  class_id: number;
  filename: string;
  source_type?: string | null;
  provider: string;
  status: "needs_review" | "ready" | "not_handwritten";
  pages: OCRPageReview[];
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

export type DocumentPreview = {
  type?: "pdf" | "text";
  kind: "docx" | "pptx" | "text";
  document_id?: string;
  file_type?: string;
  status?: string;
  filename: string;
  content_type?: string | null;
  pages: string[];
  text_preview?: string | null;
  conversion_error?: string | null;
  pdf_url?: string | null;
  viewer_file_url?: string | null;
  viewer_file_type?: string | null;
  viewer_status?: "ready" | "processing" | "failed" | "missing" | string | null;
  preview?: {
    type: "pdf" | "text";
    status: "ready" | "failed" | "generating";
    url?: string | null;
    error?: string | null;
  } | null;
  fallback_text_available?: boolean;
};

export type Flashcard = {
  id: string;
  question: string;
  answer: string;
  hint?: string | null;
  topic?: string | null;
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
  generatedCount?: number | null;
  requestedCount?: number | null;
  cardCountMode?: "auto" | "fixed" | "custom" | null;
  warning?: string | null;
  sourceDocumentIds?: string[];
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

export type TopicMastery = {
  class_id: number;
  topic: string;
  mastery_score: number;
  status: "Weak" | "Improving" | "Strong" | "Exam-ready";
  total_attempts: number;
  correct_attempts: number;
  weak_count: number;
  quiz_attempts: number;
  quiz_correct: number;
  quiz_accuracy_pct: number;
  flashcard_attempts: number;
  flashcard_struggles: number;
  last_practiced_at?: string | null;
};

export type RevisionRecommendation = {
  class_id: number;
  topic: string;
  status: "Weak" | "Improving" | "Strong" | "Exam-ready";
  mastery_score: number;
  reason: string;
  actions: Array<{ type: "flashcards" | "quiz" | "assistant" | "voice_revision"; label: string }>;
};

export type ExamReadiness = {
  score: number;
  components: {
    mastery: number;
    quiz_accuracy: number;
    flash_confidence: number;
    voice_strength: number;
    coverage: number;
    recent_practice: number;
  };
  practiced_topics: number;
  total_topics: number;
};

export type StudyPlanItem = {
  id: string;
  date: string;
  topic: string;
  task_type: "flashcards" | "quiz" | "voice_revision" | "chatbot_review" | "reading" | "mock_test";
  title: string;
  description?: string | null;
  estimated_minutes?: number | null;
  status: "pending" | "completed" | "skipped" | "overdue";
  priority: "low" | "medium" | "high";
  reason?: string | null;
};

export type StudyPlan = {
  id: string;
  class_id: number;
  title: string;
  goal: string;
  exam_date?: string | null;
  daily_time_minutes?: number | null;
  preferred_mode?: string | null;
  status: string;
  items?: StudyPlanItem[];
};

export type ClassAnalytics = {
  class_id: number;
  exam_readiness: ExamReadiness;
  weak_topics: Array<{
    topic: string;
    mastery_score: number;
    status: string;
    quiz_accuracy_pct: number;
    flash_confidence_pct: number;
    voice_score_pct: number;
    last_practiced_at?: string | null;
  }>;
  strong_topics: Array<{
    topic: string;
    mastery_score: number;
    status: string;
  }>;
  revision_due: number;
};

export type VoiceRevisionSession = {
  id: string;
  class_id: number;
  topic?: string | null;
  mode: string;
  duration_minutes?: number | null;
  status: string;
  started_at?: string | null;
  ended_at?: string | null;
  overall_score?: number | null;
  turns?: VoiceRevisionTurn[];
};

export type VoiceRevisionTurn = {
  id: string;
  topic?: string | null;
  question: string;
  student_transcript: string;
  expected_answer: string;
  evaluation: any;
  score: number;
  feedback?: string | null;
  created_at?: string | null;
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

export type VoiceTranscriptionResult = {
  transcript: string;
  audio_url?: string | null;
};

export type VoiceAttemptResult = {
  ok: boolean;
  attempt_id: string;
  mode: "voice";
  state?: {
    next_review_at?: string | null;
    [key: string]: unknown;
  };
};

export type VoiceEvaluationResult = {
  score: number;
  feedback: string;
  missingPoints: string[];
  isCorrectEnough: boolean;
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

export async function getDocumentPreview(classId: number, documentId: string): Promise<DocumentPreview> {
  const headers = await userHeader();
  const { data } = await http.get<DocumentPreview>(
    `/classes/${classId}/documents/${documentId}/preview`,
    { headers }
  );
  return data;
}

export async function processDocumentPreview(
  classId: number,
  documentId: string
): Promise<{
  document_id: string;
  preview_ready: boolean;
  preview_error?: string | null;
  conversion_error?: string | null;
  viewer_status?: string | null;
  viewer_file_url?: string | null;
  pdf_url?: string | null;
}> {
  const headers = await userHeader();
  const { data } = await http.post<{
    document_id: string;
    preview_ready: boolean;
    preview_error?: string | null;
    conversion_error?: string | null;
    viewer_status?: string | null;
    viewer_file_url?: string | null;
    pdf_url?: string | null;
  }>(`/classes/${classId}/documents/${documentId}/retry-preview`, {}, { headers });
  return data;
}

export async function uploadFile(classId: number, file: File): Promise<FileRow> {
  const fd = new FormData();
  fd.append("file", file);
  const headers = await userHeader();
  const { data } = await http.post<FileRow>(`/files/${classId}`, fd, {
    headers: { ...headers, "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function uploadHandwrittenFile(classId: number, file: File): Promise<FileRow> {
  const fd = new FormData();
  fd.append("file", file);
  const headers = await userHeader();
  const { data } = await http.post<FileRow>(`/files/${classId}/handwritten`, fd, {
    headers: { ...headers, "Content-Type": "multipart/form-data" },
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

export async function retryFileProcessing(fileId: string): Promise<{ job_id: string; file_id: string; status: string }> {
  const headers = await userHeader();
  const { data } = await http.post<{ job_id: string; file_id: string; status: string }>(
    `/files/${fileId}/ocr`,
    {},
    { headers }
  );
  return data;
}

export async function getOCRReview(fileId: string): Promise<OCRReviewResult> {
  const headers = await userHeader();
  const { data } = await http.get<OCRReviewResult>(`/files/${fileId}/ocr`, { headers });
  return data;
}

export async function saveOCRCleanedText(fileId: string, pages: Array<{ page_number: number; cleaned_text: string }>): Promise<{ ok: boolean; status: string; chunks: number }> {
  const headers = await userHeader();
  const { data } = await http.patch<{ ok: boolean; status: string; chunks: number }>(
    `/files/${fileId}/ocr/cleaned-text`,
    { pages },
    { headers }
  );
  return data;
}

export async function retryHandwrittenOCR(fileId: string): Promise<{ job_id: string; file_id: string; status: string }> {
  const headers = await userHeader();
  const { data } = await http.post<{ job_id: string; file_id: string; status: string }>(
    `/files/${fileId}/ocr/retry`,
    {},
    { headers }
  );
  return data;
}

export async function generateFlashcardsFromOCR(fileId: string, payload: { n_cards?: number; style?: string; difficulty?: string } = {}): Promise<FlashcardJob> {
  const headers = await userHeader();
  const { data } = await http.post<FlashcardJob>(`/files/${fileId}/generate-flashcards-from-ocr`, payload, { headers });
  return data;
}

export async function generateQuizFromOCR(fileId: string, payload: { n_questions?: number; mcq_count?: number; types?: string[]; difficulty?: string } = {}): Promise<QuizJobResponse> {
  const headers = await userHeader();
  const { data } = await http.post<QuizJobResponse>(`/files/${fileId}/generate-quiz-from-ocr`, payload, { headers });
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
  cardCountMode?: "auto" | "fixed" | "custom";
  requestedCount?: number;
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
  cardCountMode?: "auto" | "fixed" | "custom";
  requestedCount?: number;
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



export type ChatSession = {
  id: string;
  class_id?: number | null;
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
  class_id?: number | null;
  document_id?: string | null;
  title?: string;
}): Promise<ChatSession> {
  const headers = await userHeader();
  const { data } = await http.post<ChatSession>("/chat/sessions", payload, { headers });
  return data;
}

export async function listChatSessions(classId?: number | null, documentId?: string | null): Promise<ChatSession[]> {
  const headers = await userHeader();
  const params = new URLSearchParams();
  if (classId != null) params.set("class_id", String(classId));
  if (documentId) params.set("document_id", documentId);
  const qs = params.toString();
  const { data } = await http.get<ChatSession[]>(`/chat/sessions${qs ? `?${qs}` : ""}`, { headers });
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

export async function listChatSessionMessages(sessionId: string, classId?: number): Promise<ChatMessage[]> {
  const headers = await userHeader();
  const params = classId != null ? `?classId=${classId}` : "";
  const { data } = await http.get(`/chat/sessions/${sessionId}/messages${params}`, { headers });
  return Array.isArray(data) ? data : [];
}

export async function addChatMessages(payload: {
  session_id: string;
  class_id?: number;
  document_id?: string | null;
  user_content: string;
  assistant_content?: string | null;
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
    class_id: payload.class_id ?? null,
    document_id: payload.document_id ?? null,
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
  secondary_email?: string | null;
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
  secondary_email?: string | null;
}): Promise<ProfileData> {
  const headers = await userHeader();
  const { data } = await http.patch<ProfileData>("/profile", payload, { headers });
  return data;
}

export async function uploadAvatar(file: File): Promise<ProfileData> {
  const headers = await userHeader();
  const fd = new FormData();
  fd.append("file", file);
  const { data } = await http.post<ProfileData>("/profile/avatar", fd, {
    headers: { ...headers, "Content-Type": "multipart/form-data" },
  });
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
  topic?: string;
}): Promise<MasterySession> {
  const headers = await userHeader();
  const { data } = await http.post<MasterySession>("/flashcards/mastery/session/start", payload, { headers });
  return data;
}

export async function startStudySession(payload: {
  class_id?: number;
  mode?: "study" | "view" | "voice";
}): Promise<StudySession> {
  const headers = await userHeader();
  const { data } = await http.post<StudySession>("/study-sessions/start", payload, { headers });
  return data;
}

export async function transcribeVoiceFlashcardAnswer(audio: Blob): Promise<VoiceTranscriptionResult> {
  try {
    const headers = await userHeader();
    const form = new FormData();
    const ext = (audio.type || "").includes("mp4")
      ? "m4a"
      : (audio.type || "").includes("mpeg")
      ? "mp3"
      : (audio.type || "").includes("ogg")
      ? "ogg"
      : (audio.type || "").includes("wav")
      ? "wav"
      : "webm";
    form.append("audio", audio, `voice-answer.${ext}`);
    const { data } = await http.post<VoiceTranscriptionResult>(
      "/flashcards/voice/transcribe",
      form,
      {
        headers,
      }
    );
    return data;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const detail = (err.response?.data as any)?.detail;
      const code = detail && typeof detail === "object" && !Array.isArray(detail)
        ? (detail as Record<string, unknown>).code
        : null;
      const detailMessage = detailMessageFromApi(detail) || "";
      if (code === "transcription_unavailable") {
        throw new Error(
          "Voice transcription is unavailable. Set TRANSCRIPTION_PROVIDER=openai and configure OPENAI_API_KEY."
        );
      }
      if (/unsupported audio type/i.test(detailMessage)) {
        throw new Error("Unsupported recording format. Please retry with a supported browser (webm, wav, mp3, m4a, or ogg).");
      }
      if (/audio file is empty/i.test(detailMessage)) {
        throw new Error("No audio was captured. Please record your answer again.");
      }
      if (/too large/i.test(detailMessage)) {
        throw new Error(detailMessage);
      }
    }
    const raw = apiErrorMessage(
      err,
      "We couldn't transcribe your answer right now. Please retry in a few seconds."
    );
    if (/error parsing the body|field required|missing boundary/i.test(raw)) {
      throw new Error("Audio upload failed because the recording request was malformed. Please retry recording.");
    }
    throw new Error(
      raw
    );
  }
}

export async function saveVoiceFlashcardAttempt(payload: {
  card_id: string;
  transcript: string;
  user_rating: 1 | 2 | 3 | 4 | 5;
  response_time_seconds?: number;
  audio_url?: string | null;
  score?: number;
  feedback?: string;
  missing_points?: string[];
  session_id?: string | null;
  attempt_number?: number;
}): Promise<VoiceAttemptResult> {
  try {
    const headers = await userHeader();
    const { data } = await http.post<VoiceAttemptResult>("/flashcards/voice/attempts", payload, { headers });
    return data;
  } catch (err) {
    throw new Error(apiErrorMessage(err, "Failed to save voice attempt."));
  }
}

export async function evaluateVoiceFlashcardAnswer(payload: {
  flashcard_id: string;
  question: string;
  expected_answer: string;
  user_answer_transcript: string;
}): Promise<VoiceEvaluationResult> {
  const headers = await userHeader();
  const { data } = await http.post<VoiceEvaluationResult>("/flashcards/voice/evaluate", payload, { headers });
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

/* =========================
   Voice Revision Sessions
========================= */

export async function startVoiceRevisionSession(payload: {
  class_id: number;
  topic?: string;
  mode?: string;
  duration_minutes?: number;
  plan_item_id?: string;
}): Promise<{ id: string; started_at?: string | null; status: string }> {
  const headers = await userHeader();
  const { data } = await http.post(`/voice-revision/sessions`, payload, { headers });
  return data;
}

export async function nextVoiceRevisionQuestion(sessionId: string): Promise<{
  flashcard_id?: string;
  question: string;
  expected_answer: string;
  topic: string;
}> {
  const headers = await userHeader();
  const { data } = await http.post(`/voice-revision/sessions/${sessionId}/next-question`, {}, { headers });
  return data;
}

export async function evaluateVoiceRevisionAnswer(payload: {
  session_id: string;
  question: string;
  expected_answer: string;
  transcript: string;
  topic?: string;
}): Promise<{ turn_id: string; created_at?: string; evaluation: any }> {
  const headers = await userHeader();
  const { data } = await http.post(
    `/voice-revision/sessions/${payload.session_id}/evaluate`,
    {
      question: payload.question,
      expected_answer: payload.expected_answer,
      transcript: payload.transcript,
      topic: payload.topic,
    },
    { headers }
  );
  return data;
}

export async function endVoiceRevisionSession(sessionId: string): Promise<{ ok: boolean; session_id: string }> {
  const headers = await userHeader();
  const { data } = await http.patch(`/voice-revision/sessions/${sessionId}/end`, {}, { headers });
  return data;
}

export async function getVoiceRevisionSession(sessionId: string): Promise<VoiceRevisionSession> {
  const headers = await userHeader();
  const { data } = await http.get<VoiceRevisionSession>(`/voice-revision/sessions/${sessionId}`, { headers });
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

export async function getClassMastery(classId: number): Promise<TopicMastery[]> {
  const headers = await userHeader();
  const { data } = await http.get<{ class_id: number; topics: TopicMastery[] }>(
    `/analytics/classes/${classId}/mastery`,
    { headers }
  );
  return Array.isArray(data?.topics) ? data.topics : [];
}

export async function getClassRecommendations(classId: number): Promise<RevisionRecommendation[]> {
  const headers = await userHeader();
  const { data } = await http.get<{ class_id: number; recommendations: RevisionRecommendation[] }>(
    `/analytics/classes/${classId}/recommendations`,
    { headers }
  );
  return Array.isArray(data?.recommendations) ? data.recommendations : [];
}

export async function getAnalyticsDashboard(): Promise<{
  overall_exam_readiness: number;
  classes: Array<{
    class_id: number;
    class_name: string;
    exam_readiness: ExamReadiness;
    weak_topics: Array<{ topic: string; mastery_score: number }>;
    recommended_next_action: string;
  }>;
}> {
  const headers = await userHeader();
  const { data } = await http.get("/analytics/dashboard", { headers });
  return data;
}

export async function getClassAnalytics(classId: number): Promise<ClassAnalytics> {
  const headers = await userHeader();
  const { data } = await http.get<ClassAnalytics>(`/analytics/classes/${classId}/analytics`, { headers });
  return data;
}

export async function getClassTopicsMasteryDetailed(classId: number): Promise<ClassAnalytics["weak_topics"]> {
  const headers = await userHeader();
  const { data } = await http.get<{ topics: ClassAnalytics["weak_topics"] }>(
    `/analytics/classes/${classId}/topics/mastery`,
    { headers }
  );
  return Array.isArray((data as any)?.topics) ? (data as any).topics : [];
}

export async function getClassExamReadiness(classId: number): Promise<ExamReadiness> {
  const headers = await userHeader();
  const { data } = await http.get<ExamReadiness>(`/analytics/classes/${classId}/exam-readiness`, { headers });
  return data;
}

/* =========================
   Study Plans
========================= */

export async function createStudyPlan(payload: {
  class_id: number;
  exam_date?: string;
  daily_time_minutes?: number;
  goal?: string;
  preferred_mode?: string;
  documents?: string[];
  title?: string;
  study_days?: number;
}): Promise<{ id: string; title: string; items: number; exam_date?: string | null }> {
  const headers = await userHeader();
  const { data } = await http.post(`/study-plans`, payload, { headers });
  return data;
}

export async function listStudyPlans(): Promise<StudyPlan[]> {
  const headers = await userHeader();
  const { data } = await http.get<StudyPlan[]>(`/study-plans`, { headers });
  return Array.isArray(data) ? data : [];
}

export async function getStudyPlan(planId: string): Promise<StudyPlan> {
  const headers = await userHeader();
  const { data } = await http.get<StudyPlan>(`/study-plans/${planId}`, { headers });
  return data;
}

export async function updateStudyPlanItem(
  planId: string,
  itemId: string,
  payload: { status?: "pending" | "completed" | "skipped" | "overdue"; date?: string }
): Promise<{ ok: boolean; item_id: string }> {
  const headers = await userHeader();
  const { data } = await http.patch<{ ok: boolean; item_id: string }>(
    `/study-plans/${planId}/items/${itemId}`,
    payload,
    { headers }
  );
  return data;
}

export async function rebalanceStudyPlan(planId: string): Promise<{ ok: boolean; items: number }> {
  const headers = await userHeader();
  const { data } = await http.post<{ ok: boolean; items: number }>(`/study-plans/${planId}/rebalance`, {}, { headers });
  return data;
}

export async function getStudyPlanSuggestions(classId: number): Promise<{
  default_goal: string;
  recommended_daily_minutes: number;
  weak_topics: Array<{ topic: string; mastery_score: number }>;
  exam_readiness: ExamReadiness;
}> {
  const headers = await userHeader();
  const { data } = await http.get(`/classes/${classId}/study-plan-suggestions`, { headers });
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
  topic?: string | null;
  page_start?: number;
  page_end?: number;
};

export type QuizListItem = {
  id: string;
  class_id: number;
  file_id: string;
  title: string;
  created_at?: string;
  requested_mcq_count?: number | null;
  requested_theory_count?: number | null;
  actual_mcq_count?: number | null;
  actual_theory_count?: number | null;
  count_mismatch?: boolean;
};

export type QuizDetail = {
  quiz: QuizListItem;
  items: QuizQuestion[];
};

export type QuizJobResponse = {
  job_id: string;
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  status_message?: string | null;
  error_message?: string;
  failure_reason?: string | null;
  requested_mcq_count?: number | null;
  requested_theory_count?: number | null;
  actual_mcq_count?: number | null;
  actual_theory_count?: number | null;
  timing_ms?: Record<string, number> | null;
};

export type StartAttemptResponse = {
  attempt_id: string;
  quiz_id: string;
  total: number;
  mcq_completed: boolean;
  theory_completed: boolean;
  current_section: string;
  score?: number;
  mcq_attempt_time?: number;
  theory_attempt_time?: number;
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
    topic?: string;
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
  topic?: string;
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
  revealAnswers: boolean = true,
  section: "mcq" | "theory" | "all" = "all",
  timeTaken: number = 0
): Promise<SubmitAttemptResponse> {
  const headers = await userHeader();
  const { data } = await http.post<SubmitAttemptResponse>(
    `/quizzes/attempts/${attemptId}/submit`,
    { answers, reveal_answers: revealAnswers, section, time_taken: timeTaken },
    { headers }
  );
  return data;
}

export type QuizHistoryItem = {
  attempt_id: string;
  quiz_id: string;
  quiz_title: string;
  file_name: string;
  attempted_at: string;
  score: number;
  total_possible: number;
  mcq_score: number;
  theory_score: number;
  passed: boolean;
  mcq_count: number;
  theory_count: number;
  requested_mcq_count?: number | null;
  requested_theory_count?: number | null;
  count_mismatch?: boolean;
  mcq_attempt_time: number;
  theory_attempt_time: number;
  total_attempt_time: number;
};

export type QuizDailyStreakItem = {
  local_date: string;
  status: "passed" | "failed";
  updated_at?: string | null;
};

export type QuizAnalyticsSummary = {
  total_attempts: number;
  passed_attempts: number;
  failed_attempts: number;
};

export type QuizAttemptDetail = {
  attempt: QuizHistoryItem;
  questions: Array<{
    id: number;
    qtype: string;
    question: string;
    options?: string[];
    correct_index?: number;
    answer_key?: string;
    selected_index?: number;
    written_answer?: string;
    is_correct?: boolean | null;
    marks_awarded: number;
    max_marks: number;
  }>;
};

// ... existing code ...

// Get quiz history
export async function getQuizHistory(): Promise<QuizHistoryItem[]> {
  const headers = await userHeader();
  const { data } = await http.get<QuizHistoryItem[]>("/quizzes/history", { headers });
  return Array.isArray(data) ? data : [];
}

export async function getQuizDailyStreak(): Promise<QuizDailyStreakItem[]> {
  const headers = await userHeader();
  const { data } = await http.get<QuizDailyStreakItem[]>("/quizzes/streak/daily", { headers });
  return Array.isArray(data) ? data : [];
}

export async function getQuizAnalyticsSummary(): Promise<QuizAnalyticsSummary> {
  const headers = await userHeader();
  const { data } = await http.get<QuizAnalyticsSummary>("/quizzes/analytics/summary", { headers });
  return {
    total_attempts: Number(data?.total_attempts ?? 0),
    passed_attempts: Number(data?.passed_attempts ?? 0),
    failed_attempts: Number(data?.failed_attempts ?? 0),
  };
}

// Get attempt detail
export async function getAttemptDetail(attemptId: string): Promise<QuizAttemptDetail> {
  const headers = await userHeader();
  const { data } = await http.get<QuizAttemptDetail>(`/quizzes/history/${attemptId}`, { headers });
  return data;
}

// Delete attempt
export async function deleteAttempt(attemptId: string): Promise<void> {
  const headers = await userHeader();
  await http.delete(`/quizzes/history/${attemptId}`, { headers });
}

// Delete quiz
export async function deleteQuiz(quizId: string): Promise<void> {
  const headers = await userHeader();
  await http.delete(`/quizzes/${quizId}`, { headers });
}


// src/lib/api.ts  ── PATCH: add chatAsk with mode support
// Add/replace the chatAsk function in your existing api.ts with this version.
// Everything else in your api.ts stays the same.

// ── Types ──────────────────────────────────────────────────────────────────

export type ChatMode = "auto" | "rag" | "general";


export interface WebSource {
  title: string;
  url:   string;
}

export interface ChatAskRequest {
  class_id?:  number | null;
  question:  string;
  top_k?:    number;
  file_ids?: string[];
  mode?:     ChatMode;   // ← NEW
}

export interface ChatAskResponse {
  answer:         string;
  mode:           "rag" | "general";   // ← NEW: what was actually used
  citations:      ChatCitation[];
  web_sources:    WebSource[];          // ← NEW: web links when mode=general
  top_similarity: number;               // ← NEW: cosine similarity of best chunk
}

// ── Updated chatAsk ────────────────────────────────────────────────────────

export async function chatAsk(req: ChatAskRequest): Promise<ChatAskResponse> {
  const headers = await userHeader();
  const { data } = await http.post<ChatAskResponse>("/chat/ask", {
      class_id: req.class_id,
      question: req.question,
      top_k:    req.top_k    ?? 6,
      file_ids: req.file_ids ?? undefined,
      mode:     req.mode     ?? "aut