import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import {
  listChatSessions,
  createChatSession,
  listChatSessionMessages,
  addChatMessages,
  chatAsk,
  updateChatSession,
  deleteChatSession,
  clearChatSessionMessages,
  type ChatSession,
  type ChatMessage,
} from "../lib/api";

export type Msg = ChatMessage & { citations?: any };

const MESSAGE_CACHE_PREFIX = "chat_session_messages:";

function buildSessionKey(sessionId: string) {
  return `${MESSAGE_CACHE_PREFIX}${sessionId}`;
}

function loadSessionMessages(sessionId: string | null): Msg[] {
  if (!sessionId || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(buildSessionKey(sessionId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function persistSessionMessages(sessionId: string, messages: Msg[]) {
  if (!sessionId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(buildSessionKey(sessionId), JSON.stringify(messages));
  } catch {
    // ignore quota errors
  }
}

function clearSessionMessagesCache(sessionId: string | null) {
  if (!sessionId || typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(buildSessionKey(sessionId));
  } catch {
    // ignore
  }
}

import { formatDate } from "../components/DateDisplay";

function generateSessionTitle() {
  const f = formatDate(new Date(), undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `Chat ${f}`;
}

interface UseChatSessionProps {
  classId: number | null;
  fileId?: string | null; // Optional: if provided, filters sessions by file
  includeAll?: boolean; // Optional: if true, includes all sessions regardless of file scope
}

export function useChatSession({ classId, fileId, includeAll }: UseChatSessionProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [sessions, setSessionList] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [busySessions, setBusySessions] = useState(false);
  const [busyAsk, setBusyAsk] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  
  // Local state for UI
  const [scopeBySession, setScopeBySession] = useState<Record<string, string[]>>({});
  const [showSources, setShowSources] = useState<Record<string, boolean>>({});
  
  const placeholderTitlesRef = useRef<Record<string, string>>({});
  const convoRef = useRef<HTMLDivElement | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const wasBusyRef = useRef(false);

  const LS_LAST_SESSION = "chat_last_session_by_class";

  // Load sessions when classId or fileId changes
  useEffect(() => {
    if (!classId) {
      setSessionList([]);
      setActiveSessionId(null);
      setMessages([]);
      return;
    }
    (async () => {
      setBusySessions(true);
      try {
        // If fileId is present, we might want to filter sessions by file
        // The API supports passing fileId to filter
        const sess = await listChatSessions(classId, fileId || undefined, includeAll);
        setSessionList(sess);
        
        // Determine active session
        const fromUrl = searchParams.get("session");
        const stored = JSON.parse(localStorage.getItem(LS_LAST_SESSION) || "{}");
        // Key for storage: classId, or classId_fileId if fileId is present
        const storageKey = fileId ? `${classId}_${fileId}` : String(classId);
        
        const preferred = fromUrl || stored[storageKey];
        const next = sess.find((s) => s.id === preferred)?.id ?? sess[0]?.id ?? null;
        setActiveSessionId(next);
      } catch (err) {
        console.error("Failed to load sessions", err);
      } finally {
        setBusySessions(false);
      }
    })();
  }, [classId, fileId, searchParams, includeAll]);

  // Load messages when activeSessionId changes
  useEffect(() => {
    if (!activeSessionId) {
      setMessages([]);
      return;
    }
    
    // Optimistic load from cache
    const cached = loadSessionMessages(activeSessionId);
    setMessages(cached.length ? cached : []);
    
    (async () => {
      try {
        setHistoryError(null);
        const msgs = await listChatSessionMessages(activeSessionId);
        const normalized = (msgs || []).map((m) => ({
          ...m,
          citations: m.citations ?? undefined,
          selected_text: m.selected_text ?? null,
          file_scope: m.file_scope ?? null,
          image_attachment: m.image_attachment ?? null,
        }));
        setMessages(normalized);
        persistSessionMessages(activeSessionId, normalized);
      } catch (err) {
        if (import.meta.env.DEV) {
          console.warn("[useChatSession] failed to load history", err);
        }
        const fallback = loadSessionMessages(activeSessionId);
        if (fallback.length) {
          setMessages(fallback);
        } else {
            setHistoryError("Couldn't load chat history. Try refreshing.");
        }
      }
    })();
    
    // Save last session
    if (classId) {
      const stored = JSON.parse(localStorage.getItem(LS_LAST_SESSION) || "{}");
      const storageKey = fileId ? `${classId}_${fileId}` : String(classId);
      stored[storageKey] = activeSessionId;
      localStorage.setItem(LS_LAST_SESSION, JSON.stringify(stored));
      
      // Only update URL if we are not in embedded mode (which usually implies fileId is present)
      // Actually, Classes.tsx doesn't use URL for session, only Chatbot.tsx does.
      // We can check if fileId is null to decide whether to update URL.
      if (!fileId) {
        setSearchParams((prev) => {
          prev.set("session", activeSessionId);
          return prev;
        });
      }
    }
  }, [activeSessionId, classId, fileId]);

  // Auto-scroll
  const prevMsgLen = useRef(0);
  
  useEffect(() => {
    const el = convoRef.current;
    if (!el) return;

    const len = messages.length;
    const prevLen = prevMsgLen.current;
    const isNewMessage = len > prevLen;
    const lastMsg = len > 0 ? messages[len - 1] : null;
    const isUser = lastMsg?.role === "user";
    
    // 1. Initial load: scroll to bottom
    if (prevLen === 0 && len > 0) {
      el.scrollTop = el.scrollHeight;
    }
    // 2. User message added or loading started: scroll to bottom
    else if ((isNewMessage && isUser) || (busyAsk && !wasBusyRef.current)) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
    // 3. Assistant finished answering: scroll to start of answer
    else if (wasBusyRef.current && !busyAsk) {
      const lastEl = el.lastElementChild;
      if (lastEl) {
        lastEl.scrollIntoView({ block: "start", behavior: "smooth" });
      }
    }

    wasBusyRef.current = busyAsk;
    prevMsgLen.current = len;
  }, [messages, busyAsk]);

  const scopeFileIds = useMemo(() => {
    if (!activeSessionId) return [];
    return scopeBySession[activeSessionId] ?? [];
  }, [activeSessionId, scopeBySession]);

  const sourcesEnabled = activeSessionId ? showSources[activeSessionId] ?? false : false;

  function toggleFileScope(targetFileId: string) {
    if (!activeSessionId) return;
    setScopeBySession((prev) => {
      const current = prev[activeSessionId] ?? [];
      const next = new Set(current);
      if (next.has(targetFileId)) next.delete(targetFileId);
      else next.add(targetFileId);
      return { ...prev, [activeSessionId]: Array.from(next) };
    });
  }

  function setFileScope(fileIds: string[]) {
    if (!activeSessionId) return;
    setScopeBySession((prev) => ({
      ...prev,
      [activeSessionId]: fileIds,
    }));
  }

  function toggleSources() {
    if (!activeSessionId) return;
    setShowSources((prev) => ({ ...prev, [activeSessionId]: !(prev[activeSessionId] ?? false) }));
  }

  async function startNewSession() {
    if (!classId) return;
    
    const s = await createChatSession({ 
      class_id: classId, 
      title: generateSessionTitle(),
      document_id: fileId || undefined
    });
    setSessionList((prev) => [s, ...prev]);
    setActiveSessionId(s.id);
  }

  async function onAsk(
    input: string,
    options?: {
      selectedText?: string;
      imageAttachment?: string;
      pageNumber?: number | null;
      boundingBox?: any;
      fileId?: string | null;
    }
  ) {
    if (!classId) {
      alert("Pick a class first.");
      return;
    }
    if (!input.trim()) return;

    const { selectedText, imageAttachment, pageNumber, boundingBox, fileId: msgFileId } = options || {};

    setErrorBanner(null);

    const userMsg: Msg = {
      id: crypto.randomUUID?.() ?? String(Date.now()),
      role: "user",
      content: input.trim(),
      selected_text: selectedText || null,
      image_attachment: imageAttachment ? { data_url: imageAttachment } : null,
      page_number: pageNumber ?? null,
      bounding_box: boundingBox ?? null,
      file_id: msgFileId ?? null,
    };

    let sessionId = activeSessionId;
    if (!sessionId) {
      const placeholderTitle = generateSessionTitle();
      const s = await createChatSession({ 
        class_id: classId, 
        title: placeholderTitle,
        document_id: fileId || undefined 
      });
      placeholderTitlesRef.current[s.id] = placeholderTitle;
      setSessionList((prev) => [s, ...prev]);
      sessionId = s.id;
      setActiveSessionId(s.id);
    }
    
    setMessages((prev) => {
      const next = [...prev, userMsg];
      persistSessionMessages(sessionId!, next);
      return next;
    });
    
    setBusyAsk(true);

    let botMsg: Msg | null = null;
    let res: { answer?: string; citations?: any[] } | null = null;
    const effectiveScope = scopeFileIds;

    try {
      const question = selectedText
        ? `Selected text:\n"${selectedText}"\n\n${userMsg.content}`
        : userMsg.content;
      
      const history = messages.slice(-6).map((m) => ({ role: m.role, content: m.content }));

      // If the message is about a specific file (e.g. from snip/quote), we might want to prioritize that?
      // But usually scopeFileIds (if set) controls the context.
      // If msgFileId is present, maybe we should include it in the request?
      // Classes.tsx logic:
      // const effectiveFileIds = userMsg.file_id ? [userMsg.file_id] : scopeFileIds.length ? scopeFileIds : undefined;
      
      const effectiveIds = msgFileId 
        ? [msgFileId] 
        : (effectiveScope.length ? effectiveScope : (fileId ? [fileId] : undefined));

      res = await chatAsk({
        class_id: classId,
        question,
        top_k: 8,
        file_ids: effectiveIds,
        messages: history,
      });
    } catch (e: any) {
      console.error("[useChatSession] chatAsk failed", e);
      setErrorBanner("Failed to get an answer. Please try again.");
      setBusyAsk(false);
      return;
    }

    try {
      botMsg = {
        id: crypto.randomUUID?.() ?? String(Date.now() + 1),
        role: "assistant",
        content: (res.answer || "").trim() || "Not found in the uploaded material.",
        citations: res.citations ?? [],
      };
      setMessages((prev) => {
        const next = [...prev, botMsg!];
        persistSessionMessages(sessionId!, next);
        return next;
      });

      // Save to backend with retry
      let saved: any = null;
      let lastError: any = null;
      for (let i = 0; i < 3; i++) {
        try {
          saved = await addChatMessages({
            session_id: sessionId!,
            user_content: userMsg.content,
            assistant_content: botMsg.content,
            citations: res.citations ?? null,
            selected_text: selectedText || null,
            file_scope: effectiveScope.length ? effectiveScope : (fileId ? [fileId] : null),
            file_id: msgFileId ?? fileId ?? null,
            image_attachment: imageAttachment ? { 
            data_url: imageAttachment, 
            content_type: "image/png", 
            file_id: msgFileId ?? null 
          } : null,
            page_number: pageNumber ?? null,
            bounding_box: boundingBox ?? null,
          });
          if (saved) break;
        } catch (e) {
          console.warn(`[useChatSession] save attempt ${i + 1} failed`, e);
          lastError = e;
          if (i < 2) await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
        }
      }

      if (!saved) throw lastError;

      if (Array.isArray(saved?.messages)) {
        const normalized = saved.messages.map((m: any) => ({
          ...m,
          citations: m.citations ?? undefined,
          selected_text: m.selected_text ?? null,
          file_scope: m.file_scope ?? null,
          image_attachment: m.image_attachment ?? null,
          page_number: m.page_number ?? null,
          bounding_box: m.bounding_box ?? null,
          file_id: m.file_id ?? null,
        }));
        setMessages(normalized);
        persistSessionMessages(sessionId!, normalized);
      }
      
      // Update session title if it's a placeholder or backend provided a new title
      setSessionList((prev) =>
        prev.map((s) => {
          if (s.id !== sessionId) return s;

          if (saved.session_title) {
            delete placeholderTitlesRef.current[sessionId!];
            return { ...s, title: saved.session_title, updated_at: new Date().toISOString() };
          }

          const placeholder = placeholderTitlesRef.current[sessionId!];
          const snippet = userMsg.content.trim().slice(0, 48) || placeholder || "Chat session";
          if (placeholder && s.title === placeholder) {
            delete placeholderTitlesRef.current[sessionId!];
            return { ...s, title: snippet, updated_at: new Date().toISOString() };
          }
          return { ...s, updated_at: new Date().toISOString() };
        })
      );
    } catch (e: any) {
      const msg = e?.response?.data?.detail || e.message;
      console.error("[useChatSession] failed to save messages:", e);
      if (e?.response) {
         console.error("Status:", e.response.status);
         console.error("Data:", e.response.data);
      }
      toast.error(`Couldn't save that message: ${msg || "Try again."}`);
      // Rollback
      setMessages((prev) => prev.filter((m) => m.id !== userMsg.id && m.id !== botMsg?.id));
    } finally {
      setBusyAsk(false);
    }
  }

  async function handleRenameSession(sessionId: string, newTitle: string) {
    const nextTitle = newTitle.trim();
    if (!nextTitle) return;
    try {
      const updated = await updateChatSession(sessionId, { title: nextTitle });
      setSessionList((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      delete placeholderTitlesRef.current[updated.id];
    } catch (err) {
      console.error("[useChatSession] rename failed", err);
      toast.error("Could not rename chat. Try again.");
    }
  }

  async function handleDeleteSession(sessionId: string) {
    if (!classId) return;
    try {
      await deleteChatSession(sessionId, classId);
      setSessionList((prev) => prev.filter((s) => s.id !== sessionId));
      if (activeSessionId === sessionId) {
        const next = sessions.find((s) => s.id !== sessionId)?.id ?? null;
        setActiveSessionId(next);
        if (!next) setMessages([]);
      }
      clearSessionMessagesCache(sessionId);
      delete placeholderTitlesRef.current[sessionId];
    } catch {
      toast.error("Couldn't delete chat. Try again.");
    }
  }

  async function handleClearMessages(sessionId: string) {
    try {
      await clearChatSessionMessages(sessionId);
      if (activeSessionId === sessionId) setMessages([]);
      clearSessionMessagesCache(sessionId);
      delete placeholderTitlesRef.current[sessionId];
    } catch {
      toast.error("Couldn't clear messages. Try again.");
    }
  }

  return {
    sessions,
    activeSessionId,
    setActiveSessionId,
    messages,
    busySessions,
    busyAsk,
    historyError,
    errorBanner,
    startNewSession,
    onAsk,
    handleRenameSession,
    handleDeleteSession,
    handleClearMessages,
    convoRef,
    isAtBottom,
    setIsAtBottom,
    scopeFileIds,
    toggleFileScope,
    setFileScope,
    sourcesEnabled,
    toggleSources,
    setSessions: setSessionList,
  };
}
