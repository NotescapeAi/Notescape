import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ChatSidebar from "./ChatSidebar";
import ChatMessage from "./ChatMessage";
import ChatInput from "./ChatInput";
import { useSpeechToText } from "../../hooks/useSpeechToText";
import { useTextToSpeech } from "../../hooks/useTextToSpeech";
import { stripMarkdown } from "../../lib/textUtils";
import {
  listClasses,
  listFiles,
  chatAsk,
  createChatSession,
  listChatSessions,
  listChatSessionMessages,
  addChatMessages,
  deleteChatSession,
  updateChatSession,
  type ClassRow,
  type FileRow,
  type ChatSession,
  type ChatMessage as ChatMessageType,
  type ChatMode,
  type WebSource,
} from "../../lib/api";

type Msg = ChatMessageType & {
  citations?: any;
  answer_mode?: "rag" | "general";
  web_sources?: WebSource[];
};

const MESSAGE_CACHE_PREFIX = "chat_session_messages:";
const DRAFT_SCOPE_KEY = "__draft__";

function buildSessionKey(sessionId: string) {
  return `${MESSAGE_CACHE_PREFIX}${sessionId}`;
}
function loadSessionMessages(sessionId: string | null): Msg[] {
  if (!sessionId || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(buildSessionKey(sessionId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function persistSessionMessages(sessionId: string, messages: Msg[]) {
  if (!sessionId || typeof window === "undefined") return;
  try { window.localStorage.setItem(buildSessionKey(sessionId), JSON.stringify(messages)); } catch {}
}
function clearSessionMessagesCache(sessionId: string | null) {
  if (!sessionId || typeof window === "undefined") return;
  try { window.localStorage.removeItem(buildSessionKey(sessionId)); } catch {}
}
const EMPTY_SESSION_TITLE = "New Chat";

const TITLE_STOP_WORDS = new Set([
  "a",
  "about",
  "an",
  "and",
  "are",
  "as",
  "can",
  "compare",
  "contrast",
  "could",
  "define",
  "describe",
  "difference",
  "do",
  "does",
  "explain",
  "for",
  "from",
  "give",
  "help",
  "how",
  "in",
  "is",
  "me",
  "of",
  "on",
  "please",
  "summarize",
  "summary",
  "teach",
  "tell",
  "the",
  "this",
  "to",
  "between",
  "what",
  "whats",
  "why",
  "with",
]);

function isGenericSessionTitle(title?: string | null) {
  const clean = (title || "").trim();
  return (
    !clean ||
    clean === EMPTY_SESSION_TITLE ||
    clean === "New Conversation" ||
    /^chat\s+\d{1,2}\/\d{1,2}\/\d{2,4}/i.test(clean) ||
    /^chat\s+\d{1,2}:\d{2}/i.test(clean)
  );
}

function toTitleCase(words: string[]) {
  return words
    .map((word) => {
      const lower = word.toLowerCase();
      if (/^[A-Z0-9]{2,}$/.test(word)) return word;
      if (lower === "vs") return "vs";
      if (lower.length <= 3 && /^(ai|os|db|api|pdf|sql|cpu|ram|aws)$/.test(lower)) return lower.toUpperCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function generateTopicTitle(text: string) {
  const cleaned = text
    .replace(/selected text:\s*["“][\s\S]*?["”]/gi, " ")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return EMPTY_SESSION_TITLE;

  const words = cleaned
    .split(/\s+/)
    .map((word) => word.replace(/^-+|-+$/g, ""))
    .filter(Boolean);
  const meaningful = words.filter((word) => {
    const lower = word.toLowerCase();
    return !TITLE_STOP_WORDS.has(lower) && lower.length > 1;
  });
  const chosen = (meaningful.length >= 2 ? meaningful : words).slice(0, 4);
  const title = toTitleCase(chosen).trim();
  return title || EMPTY_SESSION_TITLE;
}

/* ─── Delete Confirm Modal ─────────────────────────────── */
function DeleteConfirmModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div
        className="relative z-10 w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl"
        style={{ animation: "scaleIn 0.18s cubic-bezier(0.16,1,0.3,1)" }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30 flex-shrink-0">
            <svg className="h-5 w-5 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-[var(--text-main)]">Delete this chat?</h3>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">This cannot be undone.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-2)] transition-colors">Cancel</button>
          <button onClick={onConfirm} className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 transition-colors shadow-sm">Delete</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Floating Voice Player Bar ────────────────────────── */
function VoicePlayerBar({
  isSpeaking,
  isPaused,
  onStop,
  onPause,
  onResume,
  onReplay,
  onDismiss,
}: {
  isSpeaking: boolean;
  isPaused: boolean;
  onStop: () => void;
  onPause: () => void;
  onResume: () => void;
  onReplay: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      className="absolute bottom-[5.5rem] left-1/2 z-40"
      style={{ transform: "translateX(-50%)", animation: "slideUpFade 0.28s cubic-bezier(0.16,1,0.3,1)" }}
    >
      <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl backdrop-blur-xl">
        {/* Animated waveform */}
        <div className="flex items-center gap-[3px] h-5 flex-shrink-0">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="w-[3px] rounded-full"
              style={{
                background: isSpeaking && !isPaused ? "var(--primary)" : "var(--border)",
                height: isSpeaking && !isPaused ? `${8 + Math.sin(i * 1.2) * 5}px` : "4px",
                animation: isSpeaking && !isPaused ? `voiceBar 0.8s ease-in-out infinite` : "none",
                animationDelay: `${i * 0.1}s`,
                transition: "height 0.3s ease, background 0.3s ease",
              }}
            />
          ))}
        </div>

        <span className="text-xs font-medium text-[var(--text-secondary)] whitespace-nowrap min-w-[80px]">
          {isPaused ? "Paused" : isSpeaking ? "Speaking..." : "Finished"}
        </span>

        <div className="flex items-center gap-1.5 ml-1">
          {isSpeaking || isPaused ? (
            <>
              <button
                onClick={isPaused ? onResume : onPause}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--surface-2)] text-[var(--text-main)] text-xs font-semibold hover:bg-[var(--surface-3)] transition-all active:scale-95 border border-[var(--border)]"
              >
                {isPaused ? (
                  <>
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    Resume
                  </>
                ) : (
                  <>
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                    Pause
                  </>
                )}
              </button>
              <button
                onClick={onStop}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs font-semibold hover:bg-red-100 dark:hover:bg-red-900/40 transition-all active:scale-95 border border-red-100 dark:border-red-900/30"
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
                Stop
              </button>
            </>
          ) : (
            <button
              onClick={onReplay}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--primary)]/10 text-[var(--primary)] text-xs font-semibold hover:bg-[var(--primary)]/20 transition-all active:scale-95"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
              </svg>
              Replay
            </button>
          )}

          <button
            onClick={onDismiss}
            className="p-1.5 rounded-full text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-main)] transition-colors ml-1"
            title="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

interface ChatInterfaceProps {
  classId?: number | null;
}

export default function ChatInterface({ classId: propClassId }: ChatInterfaceProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [internalClassId, setInternalClassId] = useState<number | null>(null);
  
  // Use propClassId if available, otherwise internal state
  const classId = propClassId !== undefined ? propClassId : internalClassId;
  const isClassLocked = propClassId !== undefined;

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [scopeBySession, setScopeBySession] = useState<Record<string, string[]>>({});
  const [showSources, setShowSources] = useState<Record<string, boolean>>({});
  const [files, setFiles] = useState<FileRow[]>([]);
  const [fileSearch, setFileSearch] = useState("");
  const [input, setInput] = useState("");
  const [selectedText, setSelectedText] = useState("");
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [busyAsk, setBusyAsk] = useState(false);
  const [busySessions, setBusySessions] = useState(false);
  const [busyFiles, setBusyFiles] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [chatMode, setChatMode] = useState<ChatMode>("auto");

  // Voice state
  const { isListening, transcript, startListening, stopListening, error: sttError } = useSpeechToText({ continuous: true });
  const { speak, stop: stopSpeech, pause: pauseSpeech, resume: resumeSpeech, isSpeaking, isPaused } = useTextToSpeech();
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [playingMessageContent, setPlayingMessageContent] = useState<string>("");
  const [baseInput, setBaseInput] = useState("");

  const convoRef = useRef<HTMLDivElement | null>(null);
  const placeholderTitlesRef = useRef<Record<string, string>>({});

  /* ─── Data loading ─── */
  useEffect(() => {
    (async () => {
      const cls = await listClasses();
      setClasses(cls);
    })();
  }, []);

  useEffect(() => {
    if (!classId) { 
      setSessions([]); 
      setActiveSessionId(null); 
      setMessages([]); 
      setFiles([]); 
      setScopeBySession({});
      return; 
    }
    (async () => {
      setBusySessions(true);
      try {
        const sess = await listChatSessions(classId);
        // Filter out Study Assistant sessions — they have document_id or [Study] prefix
        const chatOnly = sess.filter(s =>
          !(s as any).document_id && !s.title.startsWith("[Study]")
        );
        setSessions(chatOnly);
        
        // Only reopen a session when it is explicitly provided in the URL.
        // Default entry and manual class changes stay in a clean, unselected state.
        const fromUrl = searchParams.get("session");
        const next = fromUrl ? chatOnly.find(s => s.id === fromUrl)?.id ?? null : null;
        setActiveSessionId(next);
      } finally { setBusySessions(false); }
    })();
  }, [classId, searchParams]); // searchParams dependency helps sync with URL changes

  useEffect(() => {
    if (!classId) return;
    (async () => {
      setBusyFiles(true);
      try { setFiles(await listFiles(classId)); } finally { setBusyFiles(false); }
    })();
  }, [classId]);

  useEffect(() => {
    if (!activeSessionId) { setMessages([]); return; }
    
    // Load cached messages first for speed
    const cached = loadSessionMessages(activeSessionId);
    if (cached.length) setMessages(cached);
    
    (async () => {
      try {
        const msgs = await listChatSessionMessages(activeSessionId);
        const normalized = (msgs || []).map(m => ({
          ...m, citations: m.citations ?? undefined,
          selected_text: m.selected_text ?? null,
          file_scope: m.file_scope ?? null,
          image_attachment: m.image_attachment ?? null,
        }));
        setMessages(normalized);
        persistSessionMessages(activeSessionId, normalized);
        const currentSession = sessions.find(s => s.id === activeSessionId);
        const firstUser = normalized.find(m => m.role === "user" && m.content.trim());
        if (currentSession && firstUser && isGenericSessionTitle(currentSession.title)) {
          const title = generateTopicTitle(firstUser.content);
          if (title !== EMPTY_SESSION_TITLE) {
            updateChatSession(activeSessionId, { title }).catch(console.error);
            setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, title } : s));
          }
        }
      } catch {
        // If fetch fails, keep showing cached
        if (!cached.length) {
          // Maybe show error?
        }
      }
    })();

    // Update URL without full reload
    setSearchParams(prev => { 
      const newParams = new URLSearchParams(prev);
      newParams.set("session", activeSessionId);
      return newParams;
    }, { replace: true });

  }, [activeSessionId, classId]);

  useEffect(() => {
    if (!isAtBottom) return;
    const el = convoRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, busyAsk, isAtBottom]);

  useEffect(() => { if (sttError) setErrorBanner(sttError); }, [sttError]);

  useEffect(() => {
    if (isListening) setInput((baseInput ? baseInput + " " : "") + transcript);
  }, [transcript, isListening, baseInput]);

  // Clear voice when switching sessions
  useEffect(() => {
    stopSpeech();
    setPlayingMessageId(null);
    setPlayingMessageContent("");
  }, [activeSessionId]);

  /* ─── Voice handlers ─── */
  function handleMicClick() {
    if (isListening) { stopListening(); }
    else { stopSpeech(); setPlayingMessageId(null); setBaseInput(input); startListening(); }
  }

  // Called from ChatMessage — toggle play/stop for a specific message
  function handleSpeak(text: string, msgId: string) {
    if (playingMessageId === msgId && isSpeaking) {
      stopSpeech();
    } else {
      stopSpeech();
      speak(text);
      setPlayingMessageId(msgId);
      setPlayingMessageContent(text);
    }
  }

  function handleStopVoice() {
    stopSpeech();
  }

  function handleReplayVoice() {
    if (!playingMessageContent) return;
    stopSpeech();
    speak(playingMessageContent);
  }

  function handleDismissVoice() {
    stopSpeech();
    setPlayingMessageId(null);
    setPlayingMessageContent("");
  }

  /* ─── Derived state ─── */
  const scopeKey = activeSessionId ?? DRAFT_SCOPE_KEY;
  const scopeFileIds = useMemo(() => {
    return scopeBySession[scopeKey] ?? [];
  }, [scopeBySession, scopeKey]);

  const filteredFiles = useMemo(() => {
    const q = fileSearch.trim().toLowerCase();
    return q ? files.filter(f => f.filename.toLowerCase().includes(q)) : files;
  }, [files, fileSearch]);

  function handleClassChange(nextClassId: number | null) {
    setInternalClassId(nextClassId);
    setActiveSessionId(null);
    setMessages([]);
    setSelectedText("");
    setFileSearch("");
    setScopeBySession({});
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete("session");
      if (!isClassLocked) next.delete("classId");
      return next;
    }, { replace: true });
  }

  /* ─── Session management ─── */
  async function startNewSession() {
    if (!classId) {
      setErrorBanner("Choose a class context before starting a chat.");
      return;
    }
    const draftScope = scopeBySession[DRAFT_SCOPE_KEY] ?? [];
    const s = await createChatSession({ class_id: classId, title: EMPTY_SESSION_TITLE });
    setSessions(prev => [s, ...prev]);
    if (draftScope.length) {
      setScopeBySession(prev => ({ ...prev, [s.id]: draftScope, [DRAFT_SCOPE_KEY]: [] }));
    }
    setActiveSessionId(s.id);
  }

  async function confirmDelete() {
    if (!deleteTarget || !classId) return;
    const sessionId = deleteTarget;
    setDeleteTarget(null);
    try {
      await deleteChatSession(sessionId, classId);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (activeSessionId === sessionId) {
        const next = sessions.find(s => s.id !== sessionId)?.id ?? null;
        setActiveSessionId(next);
        if (!next) setMessages([]);
      }
      clearSessionMessagesCache(sessionId);
      delete placeholderTitlesRef.current[sessionId];
    } catch { setErrorBanner("Couldn't delete chat. Try again."); }
  }

  async function handleRenameSession(sessionId: string, newTitle: string) {
    try {
      const updated = await updateChatSession(sessionId, { title: newTitle });
      setSessions(prev => prev.map(s => s.id === updated.id ? updated : s));
      delete placeholderTitlesRef.current[updated.id];
    } catch { setErrorBanner("Could not rename chat. Try again."); }
  }

  /* ─── Streaming ─── */
  const simulateStreamingResponse = async (fullText: string, messageId: string) => {
    let currentText = "";
    const words = fullText.split(/(\s+)/);
    for (const word of words) {
      currentText += word;
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content: currentText } : m));
      if (isAtBottom && convoRef.current) convoRef.current.scrollTop = convoRef.current.scrollHeight;
      await new Promise(r => setTimeout(r, 14));
    }
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content: fullText } : m));
  };

  /* ─── Send message ─── */
  async function onAsk() {
    if (!classId) {
      setErrorBanner("Choose a class context before asking Study Assistant.");
      return;
    }
    if (!input.trim()) return;
    if (isListening) stopListening();
    stopSpeech();
    setPlayingMessageId(null);
    setPlayingMessageContent("");
    setErrorBanner(null);

    const userMsg: Msg = {
      id: crypto.randomUUID?.() ?? String(Date.now()),
      role: "user",
      content: input.trim(),
    };

    let sessionId = activeSessionId;
    if (!sessionId) {
      const placeholderTitle = EMPTY_SESSION_TITLE;
      const s = await createChatSession({ class_id: classId, title: placeholderTitle });
      placeholderTitlesRef.current[s.id] = placeholderTitle;
      setSessions(prev => [s, ...prev]);
      sessionId = s.id;
      if (scopeFileIds.length) {
        setScopeBySession(prev => ({ ...prev, [s.id]: scopeFileIds, [DRAFT_SCOPE_KEY]: [] }));
      }
      setActiveSessionId(s.id);
    }

    setMessages(prev => { const next = [...prev, userMsg]; persistSessionMessages(sessionId!, next); return next; });
    setInput("");
    setBusyAsk(true);

    try {
      const question = selectedText
        ? `Selected text:\n"${selectedText}"\n\n${userMsg.content}`
        : userMsg.content;

      const res = await chatAsk({
        class_id: classId,
        question,
        top_k: 8,
        file_ids: scopeFileIds.length ? scopeFileIds : undefined,
        mode: chatMode,
      });

      const fullAnswer = (res.answer || "").trim() || "Not found in the uploaded material.";
      const botMsgId = crypto.randomUUID?.() ?? String(Date.now() + 1);

      setMessages(prev => [...prev, { id: botMsgId, role: "assistant", content: "", citations: res.citations ?? [], answer_mode: res.mode, web_sources: res.web_sources }]);
      await simulateStreamingResponse(fullAnswer, botMsgId);

      // Auto-play voice after response streams in
      try {
        const cleanAnswer = stripMarkdown(fullAnswer);
        if (cleanAnswer) {
           speak(cleanAnswer);
           setPlayingMessageId(botMsgId);
           setPlayingMessageContent(cleanAnswer);
        }
      } catch (e) {
        console.error("Auto-play failed", e);
      }

      const saved = await addChatMessages({
        session_id: sessionId!,
        user_content: userMsg.content,
        assistant_content: fullAnswer,
        citations: res.citations ?? null,
        selected_text: selectedText || null,
        file_scope: scopeFileIds.length ? scopeFileIds : null,
      });

      if (Array.isArray(saved?.messages)) {
        const normalized = saved.messages.map(m => ({
          ...m, citations: m.citations ?? undefined,
          selected_text: m.selected_text ?? null,
          file_scope: m.file_scope ?? null,
          image_attachment: m.image_attachment ?? null,
        }));
        setMessages(normalized);
        persistSessionMessages(sessionId!, normalized);
      }

      setSelectedText("");

      // Auto-title from first user message
      setSessions(prev => prev.map(s => {
        if (s.id !== sessionId) return s;
        const placeholder = placeholderTitlesRef.current[sessionId!];
        const isDefault = isGenericSessionTitle(s.title) || (placeholder && s.title === placeholder);
        if (isDefault) {
          const title = generateTopicTitle(userMsg.content);
          if (title && title !== EMPTY_SESSION_TITLE) {
            updateChatSession(sessionId!, { title }).catch(console.error);
            delete placeholderTitlesRef.current[sessionId!];
            return { ...s, title, updated_at: new Date().toISOString() };
          }
        }
        return { ...s, updated_at: new Date().toISOString() };
      }));
    } catch {
      setErrorBanner("Couldn't save that message. Please try again.");
      setMessages(prev => prev.filter(m => m.role !== "assistant" || m.content !== ""));
    } finally {
      setBusyAsk(false);
    }
  }

  function toggleFileScope(fileId: string) {
    setScopeBySession(prev => {
      const next = new Set(prev[scopeKey] ?? []);
      if (next.has(fileId)) next.delete(fileId); else next.add(fileId);
      return { ...prev, [scopeKey]: Array.from(next) };
    });
  }

  function toggleSources() {
    if (!activeSessionId) return;
    setShowSources(prev => ({ ...prev, [activeSessionId]: !(prev[activeSessionId] ?? false) }));
  }

  const sourcesEnabled = activeSessionId ? showSources[activeSessionId] ?? false : false;
  const statusLabel = (status?: string | null) => {
    const s = (status || "UPLOADED").toUpperCase();
    if (s === "FAILED") return "Failed";
    if (s === "INDEXED") return "Ready";
    return "Processing";
  };

  const activeSession = sessions.find(s => s.id === activeSessionId);
  const showVoiceBar = playingMessageId !== null;

  const suggestions = [
    { icon: "🎯", label: "Create a quiz from notes", desc: "Test your knowledge" },
    { icon: "💡", label: "Explain key concepts", desc: "Deep-dive into topics" },
  ];

  return (
    <>
      <style>{`
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.94) translateY(6px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);   }
        }
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
        @keyframes slideUpFade {
          from { opacity: 0; transform: translateX(-50%) translateY(14px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0);    }
        }
        @keyframes typingPulse {
          0%, 100% { opacity: 0.25; transform: scaleY(0.5); }
          50%       { opacity: 1;   transform: scaleY(1.3); }
        }
        @keyframes voiceBar {
          0%, 100% { transform: scaleY(0.3); opacity: 0.4; }
          50%       { transform: scaleY(1.5); opacity: 1; }
        }
        @keyframes avatarPulse {
          0%, 100% { box-shadow: 0 0 0 0   rgba(139,92,246,0.0);  }
          50%       { box-shadow: 0 0 0 8px rgba(139,92,246,0.12); }
        }
        .msg-appear     { animation: fadeSlideUp 0.32s cubic-bezier(0.16,1,0.3,1) forwards; }
        .typing-bar     { width: 3px; border-radius: 99px; background: var(--primary); transform-origin: center; animation: typingPulse 0.85s ease-in-out infinite; }
        .voice-wave-bar { width: 3px; border-radius: 99px; background: var(--primary); transform-origin: bottom; }
        .chat-scrollbar::-webkit-scrollbar       { width: 4px; }
        .chat-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .chat-scrollbar::-webkit-scrollbar-thumb { background: var(--border); border-radius: 99px; }
        .suggestion-card:hover .suggestion-icon  { transform: translateX(3px); opacity: 1; }
        .suggestion-icon { opacity: 0; transition: transform 0.2s ease, opacity 0.2s ease; }
        .ai-pulse { animation: avatarPulse 2.4s ease-in-out infinite; }
      `}</style>

      {/* Modals & Overlays */}
      {deleteTarget && (
        <DeleteConfirmModal onConfirm={confirmDelete} onCancel={() => setDeleteTarget(null)} />
      )}



      <div className="flex h-full min-h-0 overflow-hidden bg-[var(--surface-2,#f4f4f6)] dark:bg-[var(--bg,#0d0d10)]">

        {/* ── LEFT SIDEBAR ── */}
        <aside className="w-[268px] flex-shrink-0 border-r border-[var(--border)] bg-[var(--surface)] hidden md:flex flex-col overflow-hidden">
          <ChatSidebar
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelectSession={setActiveSessionId}
            onNewChat={startNewSession}
            onDeleteSession={(id) => setDeleteTarget(id)}
            onRenameSession={handleRenameSession}
            isLoading={busySessions}
          />
        </aside>

        {/* ── MAIN CHAT ── */}
        <main className="relative flex-1 flex min-h-0 flex-col min-w-0 bg-[var(--bg,#ffffff)] dark:bg-[var(--bg)]">

          {/* Floating Voice Player Bar */}
          {showVoiceBar && (
            <VoicePlayerBar
              isSpeaking={isSpeaking}
              isPaused={isPaused}
              onStop={handleStopVoice}
              onPause={pauseSpeech}
              onResume={resumeSpeech}
              onReplay={handleReplayVoice}
              onDismiss={handleDismissVoice}
            />
          )}

          {/* Header */}
          <header className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur-md z-10">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {/* AI avatar with pulse */}
              <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-[var(--primary)] flex items-center justify-center shadow-sm ai-pulse">
                <svg className="w-4.5 h-4.5 text-white w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
                </svg>
              </div>

              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-[var(--text-main)] truncate leading-tight">
                  {activeSession?.title || EMPTY_SESSION_TITLE}
                </h2>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${classId ? "bg-emerald-500" : "bg-amber-400"}`} />
                  {isClassLocked ? (
                     <span className="text-[11px] text-[var(--text-secondary)]">
                       {classes.find(c => c.id === classId)?.name || "Class Context"}
                     </span>
                  ) : (
                    <select
                      value={classId ?? ""}
                      onChange={e => handleClassChange(e.target.value ? Number(e.target.value) : null)}
                      className="text-[11px] text-[var(--text-secondary)] bg-transparent border-none p-0 focus:ring-0 cursor-pointer appearance-none max-w-[200px] truncate"
                      style={{ backgroundImage: "none" }}
                    >
                      <option value="">Select Class Context…</option>
                      {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
              {/* Voice status indicator when speaking */}
              {isSpeaking && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--primary)]/8 mr-1">
                  <div className="flex gap-[3px] items-center h-3.5">
                    {[0,1,2].map(i => (
                      <div key={i} className="voice-wave-bar" style={{ height: `${8 + i * 2}px`, animation: `voiceBar 0.7s ease-in-out infinite`, animationDelay: `${i * 0.12}s` }} />
                    ))}
                  </div>
                  <span className="text-[10px] font-semibold text-[var(--primary)]">Speaking</span>
                </div>
              )}

              {/* Mode toggle */}
              <div className="flex items-center gap-0.5 p-0.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]">
                {(["auto", "rag", "general"] as ChatMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setChatMode(m)}
                    title={m === "auto" ? "Smart mode — auto-detects PDF vs general" : m === "rag" ? "PDF-only mode" : "General AI mode"}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all duration-150 ${
                      chatMode === m
                        ? "bg-[var(--primary)] text-white shadow-sm"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-main)]"
                    }`}
                  >
                    {m === "auto" ? "✦ Auto" : m === "rag" ? "📄 PDF" : "🌍 AI"}
                  </button>
                ))}
              </div>

              {/* Citations toggle */}
              <label className="flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-xl hover:bg-[var(--surface-2)] transition-colors text-[11px] font-medium text-[var(--text-secondary)] select-none">
                <div className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors duration-200 ${sourcesEnabled ? "bg-[var(--primary)]" : "bg-[var(--border)]"}`}>
                  <span className={`inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform duration-200 ${sourcesEnabled ? "translate-x-3.5" : "translate-x-0.5"}`} />
                  <input type="checkbox" checked={sourcesEnabled} onChange={toggleSources} className="sr-only" />
                </div>
                Citations
              </label>

              {/* Panel toggle */}
              <button
                onClick={() => setShowRightPanel(v => !v)}
                title="Toggle files panel"
                className={`p-2 rounded-xl transition-all ${showRightPanel ? "bg-[var(--primary)]/10 text-[var(--primary)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-2)]"}`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <rect x="3" y="3" width="18" height="18" rx="2.5" />
                  <path strokeLinecap="round" d="M15 3v18" />
                </svg>
              </button>
            </div>
          </header>

          {/* Error banner */}
          {errorBanner && (
            <div className="mx-4 mt-3 flex items-center gap-3 rounded-xl border border-red-200 dark:border-red-800/40 bg-red-50 dark:bg-red-900/10 px-4 py-2.5 msg-appear">
              <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M12 8v4m0 4h.01" />
              </svg>
              <span className="flex-1 text-xs text-red-700 dark:text-red-400">{errorBanner}</span>
              <button onClick={() => setErrorBanner(null)} className="opacity-50 hover:opacity-100 transition-opacity">
                <svg className="w-3.5 h-3.5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* Messages */}
          <div
            ref={convoRef}
            className="min-h-0 flex-1 overflow-y-auto chat-scrollbar px-4 py-4 md:px-8"
            onMouseUp={() => {
              const sel = window.getSelection()?.toString().trim() || "";
              setSelectedText(sel.length > 0 ? sel : "");
            }}
            onScroll={() => {
              const el = convoRef.current;
              if (el) setIsAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
            }}
          >
            {messages.length === 0 ? (
              /* Empty state */
              <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center px-4 msg-appear">
                <div className="relative mb-8">
                  <div className="w-20 h-20 rounded-2xl bg-[var(--primary)] flex items-center justify-center shadow-lg ai-pulse">
                    <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.4}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
                    </svg>
                  </div>
                  <div className="absolute -inset-3  rounded-3xl  border border-[var(--primary)]/15 -z-10" />
                  <div className="absolute -inset-7  rounded-[2.5rem] border border-[var(--primary)]/6  -z-10" />
                </div>

                <h3 className="text-2xl font-bold text-[var(--text-main)] mb-2 tracking-tight">
                  {classId ? "What would you like to explore?" : "Welcome to Notescape AI"}
                </h3>
                <p className="text-sm text-[var(--text-secondary)] max-w-xs leading-relaxed mb-10">
                  {classId
                    ? "Ask about your materials, get summaries, create quizzes, or explore key concepts."
                    : "Select a class context above, then start chatting with your study materials."}
                </p>

                {classId && (
                  <div className="grid grid-cols-2 gap-3 w-full max-w-lg">
                    {suggestions.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => setInput(s.label)}
                        className="suggestion-card group flex items-start gap-3 p-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--primary)]/40 hover:shadow-lg text-left transition-all duration-200"
                      >
                        <span className="text-xl mt-0.5 flex-shrink-0">{s.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-[var(--text-main)] mb-0.5 group-hover:text-[var(--primary)] transition-colors leading-snug">{s.label}</div>
                          <div className="text-[10px] text-[var(--text-secondary)]">{s.desc}</div>
                        </div>
                        <svg className="suggestion-icon w-3.5 h-3.5 text-[var(--primary)] mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                        </svg>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* Message list */
              <div className="max-w-3xl mx-auto w-full space-y-1 pb-2">
                {messages.map((m, idx) => (
                  <div key={m.id} className="msg-appear" style={{ animationDelay: `${Math.min(idx * 0.016, 0.08)}s` }}>
                    <ChatMessage
                      message={m}
                      isSpeaking={playingMessageId === m.id && isSpeaking}
                      onSpeak={() => handleSpeak(m.content, m.id)}
                      onStopSpeak={handleStopVoice}
                    />
                    {/* Answer mode badge + web sources — only on assistant messages */}
                    {m.role === "assistant" && (
                      <div className="flex flex-col gap-2 pl-11 pb-2 msg-appear">
                        {/* Mode badge */}
                        {m.content && m.answer_mode && (
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${
                              m.answer_mode === "rag"
                                ? "bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800/50"
                                : "bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800/50"
                            }`}>
                              {m.answer_mode === "rag" ? "📄 From your PDFs" : "🌍 General knowledge"}
                            </span>
                          </div>
                        )}
                        {/* Web sources */}
                        {m.answer_mode === "general" && m.web_sources && m.web_sources.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {m.web_sources.map((src, i) => (
                              <a
                                key={i}
                                href={src.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[9px] font-medium px-2 py-0.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:text-[var(--primary)] hover:border-[var(--primary)]/40 transition-colors max-w-[200px] truncate"
                              >
                                <svg className="w-2.5 h-2.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                </svg>
                                <span className="truncate">{src.title || src.url}</span>
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {/* Typing indicator (5-bar animated) */}
                {busyAsk && !messages.some(m => m.role === "assistant" && m.content === "") && (
                  <div className="flex items-end gap-3 pt-4 pl-1 msg-appear">
                    <div className="w-8 h-8 rounded-xl bg-[var(--primary)] flex items-center justify-center shadow-sm flex-shrink-0">
                      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                      </svg>
                    </div>
                    <div className="flex items-center gap-1.5 px-4 py-3.5 rounded-2xl rounded-bl-sm bg-[var(--surface)] border border-[var(--border)] shadow-sm">
                      {[0, 1, 2, 3, 4].map(i => (
                        <div
                          key={i}
                          className="typing-bar"
                          style={{ height: `${8 + Math.abs(Math.sin(i * 0.9)) * 8}px`, animationDelay: `${i * 0.1}s` }}
                        />
                      ))}
                      <span className="ml-2 text-[10px] font-medium text-[var(--text-secondary)] whitespace-nowrap">Thinking…</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Input area */}
          <div className="flex-shrink-0 bg-transparent px-4 pt-2 pb-1">
            {/* Selected context */}
            {selectedText && (
              <div className="mb-3 max-w-3xl mx-auto flex items-center gap-3 rounded-xl border border-[var(--primary)]/25 bg-[var(--primary)]/5 px-3.5 py-2.5 msg-appear">
                <div className="w-0.5 h-7 rounded-full bg-[var(--primary)]/60 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-[var(--primary)]/60 mb-0.5">Selected context</div>
                  <div className="text-xs text-[var(--text-secondary)] italic truncate">"{selectedText}"</div>
                </div>
                <button
                  onClick={() => setSelectedText("")}
                  className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-main)] hover:bg-[var(--surface-2)] transition-colors flex-shrink-0"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            <div className="max-w-3xl mx-auto">
              <ChatInput
                value={input}
                onChange={setInput}
                onSend={onAsk}
                isLoading={busyAsk}
                isListening={isListening}
                onToggleListening={handleMicClick}
              />
            </div>

            {/* Mode hint bar */}
            <div className="mt-0.5 max-w-3xl mx-auto flex items-center justify-center gap-2">
              <span className={`inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full border transition-all ${
                chatMode === "auto"
                  ? "bg-[var(--primary)]/8 text-[var(--primary)] border-[var(--primary)]/20"
                  : chatMode === "rag"
                  ? "bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 border-violet-200 dark:border-violet-800/40"
                  : "bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-400 border-sky-200 dark:border-sky-800/40"
              }`}>
                {chatMode === "auto" ? "✦ Smart mode — auto-detects PDF vs general" : chatMode === "rag" ? "📄 PDF-only mode" : "🌍 General AI mode"}
              </span>
            </div>

            {/* Listening indicator */}
            {isListening && (
              <div className="mt-2 max-w-3xl mx-auto flex items-center justify-center gap-2 msg-appear">
                <div className="flex gap-[3px] items-center h-3">
                  {[0,1,2,3,4].map(i => (
                    <div key={i} className="voice-wave-bar" style={{ height: `${5 + i * 2}px`, animation: `voiceBar 0.6s ease-in-out infinite`, animationDelay: `${i * 0.08}s` }} />
                  ))}
                </div>
                <span className="text-[11px] text-[var(--primary)] font-semibold">Listening…</span>
              </div>
            )}
          </div>
        </main>

        {/* ── RIGHT SIDEBAR ── */}
        {showRightPanel && (
          <aside className="w-[272px] flex-shrink-0 border-l border-[var(--border)] bg-[var(--surface)] hidden xl:flex flex-col overflow-hidden">
            <div className="p-4 border-b border-[var(--border)]">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center">
                    <svg className="w-3.5 h-3.5 text-[var(--primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                  </div>
                  <h2 className="text-xs font-semibold text-[var(--text-main)]">Context Files</h2>
                </div>
                {scopeFileIds.length > 0 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--primary)]/10 text-[var(--primary)]">
                    {scopeFileIds.length} active
                  </span>
                )}
              </div>
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  value={fileSearch}
                  onChange={e => setFileSearch(e.target.value)}
                  placeholder="Filter files…"
                  className="w-full h-9 pl-9 pr-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] text-xs text-[var(--text-main)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:border-[var(--primary)]/50 focus:ring-1 focus:ring-[var(--primary)]/20 transition-all"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto chat-scrollbar p-3 space-y-1.5">
              {classId == null ? (
                <div className="flex flex-col items-center justify-center h-32 text-[var(--text-secondary)] text-center gap-2">
                  <svg className="w-8 h-8 opacity-25" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                  </svg>
                  <p className="text-xs">Select a class first</p>
                </div>
              ) : busyFiles ? (
                <div className="flex items-center justify-center h-20">
                  <div className="w-5 h-5 border-2 border-[var(--primary)]/20 border-t-[var(--primary)] rounded-full animate-spin" />
                </div>
              ) : filteredFiles.length === 0 ? (
                <div className="text-xs text-[var(--text-secondary)] text-center py-10 italic">No files found</div>
              ) : (
                filteredFiles.map(f => {
                  const checked = scopeFileIds.includes(f.id);
                  const ext = f.filename.split(".").pop()?.toUpperCase() || "FILE";
                  return (
                    <button
                      key={f.id}
                      onClick={() => toggleFileScope(f.id)}
                      className={`w-full group flex items-center gap-3 rounded-xl border p-3 text-left transition-all duration-200 ${
                        checked
                          ? "border-[var(--primary)]/40 bg-[var(--primary)]/5 shadow-sm"
                          : "border-[var(--border)] hover:bg-[var(--surface-2)] hover:border-[var(--primary)]/20"
                      }`}
                    >
                      <div className={`flex-shrink-0 w-4 h-4 rounded-[5px] border flex items-center justify-center transition-all ${
                        checked ? "border-[var(--primary)] bg-[var(--primary)]" : "border-[var(--border)] group-hover:border-[var(--primary)]/50"
                      }`}>
                        {checked && (
                          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-xs font-medium truncate mb-1 ${checked ? "text-[var(--primary)]" : "text-[var(--text-main)]"}`}>
                          {f.filename}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-[var(--surface-2)] text-[var(--text-secondary)] uppercase tracking-wide">{ext}</span>
                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${
                            f.status === "INDEXED"
                              ? "bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400"
                              : "bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400"
                          }`}>{statusLabel(f.status)}</span>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {scopeFileIds.length > 0 && (
              <div className="p-3 border-t border-[var(--border)]">
                <p className="text-[10px] text-[var(--text-secondary)] text-center">
                  Scoped to <span className="font-bold text-[var(--primary)]">{scopeFileIds.length}</span> file{scopeFileIds.length !== 1 ? "s" : ""}
                </p>
              </div>
            )}
          </aside>
        )}
      </div>
    </>
  );
}
