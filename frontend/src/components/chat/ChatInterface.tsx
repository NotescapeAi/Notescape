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

const DRAFT_SCOPE_KEY = "__draft__";
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
  const [busyMessages, setBusyMessages] = useState(false);
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
    let cancelled = false;
    (async () => {
      setBusySessions(true);
      try {
        const sess = await listChatSessions(classId ?? null);
        // Filter out Study Assistant sessions — they have document_id or [Study] prefix
        if (cancelled) return;
        const chatOnly = (sess || []).filter(s => {
          if ((s as any).document_id || s.title.startsWith("[Study]")) return false;
          if (classId == null) return !s.class_id;
          return s.class_id === classId;
        });
        setSessions(chatOnly);
        
        // Only reopen a session when it is explicitly provided in the URL.
        // Default entry and manual class changes stay in a clean, unselected state.
        const fromUrl = searchParams.get("session");
        const next = fromUrl ? chatOnly.find(s => s.id === fromUrl)?.id ?? null : null;
        setActiveSessionId(next);
        if (!next) setMessages([]);
      } catch (err) {
        if (!cancelled) {
          if (import.meta.env.DEV) console.error("[chat] failed to load sessions", err);
          setSessions([]);
          setActiveSessionId(null);
          setMessages([]);
        }
      } finally {
        if (!cancelled) setBusySessions(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [classId, searchParams]);

  useEffect(() => {
    if (!classId) {
      setFiles([]);
      setScopeBySession({});
      return;
    }
    (async () => {
      setBusyFiles(true);
      try { setFiles(await listFiles(classId)); } finally { setBusyFiles(false); }
    })();
  }, [classId]);

  useEffect(() => {
    if (!activeSessionId) {
      setMessages([]);
      setBusyMessages(false);
      return;
    }
    let cancelled = false;
    const sessionId = activeSessionId;
    setBusyMessages(true);
    (async () => {
      try {
        const msgs = await listChatSessionMessages(sessionId, classId ?? undefined);
        if (cancelled) return;
        const normalized = (msgs || []).map(m => ({
          ...m, citations: m.citations ?? undefined,
          selected_text: m.selected_text ?? null,
          file_scope: m.file_scope ?? null,
          image_attachment: m.image_attachment ?? null,
        }));
        setMessages(normalized);
        const currentSession = sessions.find(s => s.id === sessionId);
        const firstUser = normalized.find(m => m.role === "user" && m.content.trim());
        if (currentSession && firstUser && isGenericSessionTitle(currentSession.title)) {
          const title = generateTopicTitle(firstUser.content);
          if (title !== EMPTY_SESSION_TITLE) {
            updateChatSession(sessionId, { title }).catch(console.error);
            setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, title } : s));
          }
        }
      } catch (err) {
        if (!cancelled) {
          if (import.meta.env.DEV) console.error("[chat] failed to load messages", err);
          setErrorBanner("Couldn't load that chat. Try again.");
          setMessages([]);
        }
      } finally {
        if (!cancelled) setBusyMessages(false);
      }
    })();

    // Update URL without full reload
    setSearchParams(prev => { 
      const newParams = new URLSearchParams(prev);
      newParams.set("session", sessionId);
      return newParams;
    }, { replace: true });

    return () => {
      cancelled = true;
    };
  }, [activeSessionId, classId, setSearchParams]);

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
    setInput("");
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
    setActiveSessionId(null);
    setMessages([]);
    setInput("");
    setSelectedText("");
    setErrorBanner(null);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete("session");
      return next;
    }, { replace: true });
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const sessionId = deleteTarget;
    setDeleteTarget(null);
    try {
      await deleteChatSession(sessionId, classId ?? undefined);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (activeSessionId === sessionId) {
        const next = sessions.find(s => s.id !== sessionId)?.id ?? null;
        setActiveSessionId(next);
        if (!next) setMessages([]);
      }
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
      const s = await createChatSession({ class_id: classId ?? null, title: placeholderTitle });
      placeholderTitlesRef.current[s.id] = placeholderTitle;
      setSessions(prev => [s, ...prev]);
      sessionId = s.id;
      if (classId && scopeFileIds.length) {
        setScopeBySession(prev => ({ ...prev, [s.id]: scopeFileIds, [DRAFT_SCOPE_KEY]: [] }));
      }
      setActiveSessionId(s.id);
    }

    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setBusyAsk(true);

    try {
      const question = selectedText
        ? `Selected text:\n"${selectedText}"\n\n${userMsg.content}`
        : userMsg.content;

      const res = await chatAsk({
        class_id: classId ?? null,
        question,
        top_k: 8,
        file_ids: classId && scopeFileIds.length ? scopeFileIds : undefined,
        mode: classId ? chatMode : "general",
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
        class_id: classId ?? undefined,
        user_content: userMsg.content,
        assistant_content: fullAnswer,
        citations: res.citations ?? null,
        selected_text: selectedText || null,
        file_scope: classId && scopeFileIds.length ? scopeFileIds : null,
      });

      if (Array.isArray(saved?.messages)) {
        const normalized = saved.messages.map(m => ({
          ...m, citations: m.citations ?? undefined,
          selected_text: m.selected_text ?? null,
          file_scope: m.file_scope ?? null,
          image_attachment: m.image_attachment ?? null,
        }));
        setMessages(normalized);
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
    } catch (err) {
      try {
        await addChatMessages({
          session_id: sessionId!,
          class_id: classId ?? undefined,
          user_content: userMsg.content,
          assistant_content: null,
          selected_text: selectedText || null,
          file_scope: classId && scopeFileIds.length ? scopeFileIds : null,
        });
      } catch (saveErr) {
        if (import.meta.env.DEV) console.error("[chat] failed to save user message after assistant error", saveErr);
      }
      if (import.meta.env.DEV) console.error("[chat] ask failed", err);
      setErrorBanner("Couldn't finish that response. Your message was saved; please try again.");
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
    if (s === "INDEXED" || s === "READY") return "Ready";
    if (s === "EXTRACTING_TEXT" || s === "RUNNING_OCR") return "Extracting text";
    if (s === "CHUNKING" || s === "GENERATING_EMBEDDINGS") return "Indexing";
    return "Processing";
  };

  const activeSession = sessions.find(s => s.id === activeSessionId);
  const showVoiceBar = playingMessageId !== null;
  const selectedClassName = classId ? classes.find(c => c.id === classId)?.name ?? "Selected class" : "";

  const suggestions = [
    { label: "Summarize this class", desc: "Get a quick overview of key topics" },
    { label: "Explain a concept", desc: "Deep-dive into a specific idea" },
    { label: "Generate a quiz", desc: "Test your knowledge on the material" },
    { label: "List the key points", desc: "Pull the essentials from your files" },
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



      <div className="flex h-full min-h-0 overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">

        {/* ── LEFT SIDEBAR ── */}
        <aside className="hidden w-[260px] flex-shrink-0 flex-col overflow-hidden border-r border-[var(--border)] bg-[var(--surface)] md:flex">
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
        <main className="relative flex min-w-0 min-h-0 flex-1 flex-col bg-[var(--surface)]">

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

          {/* Header: session title + tools on row 1; class context on row 2 (no overlapping helper text) */}
          <header className="z-10 flex shrink-0 flex-col gap-0 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3 sm:px-5">
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--primary-soft)] text-[var(--primary)]">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <h2 className="truncate text-sm font-semibold leading-snug tracking-tight text-[var(--text-main)]">
                    {activeSession?.title || EMPTY_SESSION_TITLE}
                  </h2>
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                {isSpeaking && (
                  <div className="flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--primary)_25%,transparent)] bg-[var(--primary-soft)] px-2.5 py-1">
                    <div className="flex h-3 items-center gap-[3px]">
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className="voice-wave-bar"
                          style={{
                            height: `${8 + i * 2}px`,
                            animation: `voiceBar 0.7s ease-in-out infinite`,
                            animationDelay: `${i * 0.12}s`,
                          }}
                        />
                      ))}
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--primary)]">Speaking</span>
                  </div>
                )}

                <div
                  className="inline-flex items-center gap-0.5 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-2)] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                  role="group"
                  aria-label="Answer mode"
                >
                  {(["auto", "rag", "general"] as ChatMode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setChatMode(m)}
                      title={m === "auto" ? "Uses your documents when helpful" : m === "rag" ? "Answers from your files only" : "General knowledge"}
                      className={`min-w-[3.25rem] rounded-[var(--radius-md)] px-3 py-1.5 text-xs font-semibold transition ${
                        chatMode === m
                          ? "bg-[var(--surface)] text-[var(--text-main)] shadow-[var(--shadow-xs)] ring-1 ring-[var(--border)]"
                          : "text-[var(--text-muted)] hover:bg-[var(--surface)]/80 hover:text-[var(--text-main)]"
                      }`}
                    >
                      {m === "auto" ? "Auto" : m === "rag" ? "PDF" : "AI"}
                    </button>
                  ))}
                </div>

                <label className="inline-flex shrink-0 cursor-pointer select-none items-center gap-2 rounded-[var(--radius-md)] border border-transparent px-2 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition hover:border-[var(--border)] hover:bg-[var(--surface-2)]">
                  <span
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${
                      sourcesEnabled ? "bg-[var(--primary)]" : "bg-[var(--border-strong)]"
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
                        sourcesEnabled ? "translate-x-4" : "translate-x-[3px]"
                      }`}
                    />
                    <input type="checkbox" checked={sourcesEnabled} onChange={toggleSources} className="sr-only" />
                  </span>
                  <span className="whitespace-nowrap">Citations</span>
                </label>

                <button
                  type="button"
                  onClick={() => setShowRightPanel((v) => !v)}
                  title={showRightPanel ? "Hide context files" : "Show context files"}
                  aria-pressed={showRightPanel}
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] border transition ${
                    showRightPanel
                      ? "border-[color-mix(in_srgb,var(--primary)_35%,var(--border))] bg-[var(--primary-soft)] text-[var(--primary)]"
                      : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-main)]"
                  }`}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <rect x="3" y="3" width="18" height="18" rx="2.5" />
                    <path strokeLinecap="round" d="M15 3v18" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="mt-3 border-t border-[var(--border)] pt-3">
              {isClassLocked ? (
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted-soft)]">Class</span>
                  <span className="min-w-0 truncate text-sm font-medium text-[var(--text-main)]" title={selectedClassName}>
                    {selectedClassName || "Class context"}
                  </span>
                </div>
              ) : (
                <div className="flex min-w-0 flex-col gap-2">
                  <label htmlFor="chat-class-select" className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted-soft)]">
                    Class context
                  </label>
                  <div className="relative max-w-xl">
                    <select
                      id="chat-class-select"
                      value={classId ?? ""}
                      onChange={(e) => handleClassChange(e.target.value ? Number(e.target.value) : null)}
                      disabled={classes.length === 0}
                      className="h-10 w-full min-w-0 cursor-pointer appearance-none rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] py-2 pl-3 pr-10 text-sm font-medium text-[var(--text-main)] shadow-sm outline-none transition focus:border-[color-mix(in_srgb,var(--primary)_55%,var(--border))] focus:ring-2 focus:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-[color-mix(in_srgb,var(--surface-2)_92%,#000)]"
                      aria-label="Select a class for document context"
                    >
                      <option value="">General chat (no class)</option>
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </span>
                  </div>
                  {classes.length === 0 ? (
                    <p className="text-xs leading-relaxed text-[var(--text-muted)]">Add a class under Classes to attach notes and PDFs here.</p>
                  ) : !classId ? (
                    <p className="max-w-xl text-xs leading-relaxed text-[var(--text-muted)]">
                      Your materials load when you pick a class. Leave as general for questions without your files.
                    </p>
                  ) : null}
                </div>
              )}
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
            className="min-h-0 flex-1 overflow-y-auto chat-scrollbar px-4 py-5 md:px-8 md:py-6"
            onMouseUp={() => {
              const sel = window.getSelection()?.toString().trim() || "";
              setSelectedText(sel.length > 0 ? sel : "");
            }}
            onScroll={() => {
              const el = convoRef.current;
              if (el) setIsAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
            }}
          >
            {busyMessages ? (
              <div className="flex h-full min-h-[60vh] items-center justify-center text-sm text-[var(--text-secondary)]">
                Loading chat history...
              </div>
            ) : messages.length === 0 ? (
              /* Empty state — shown only when there are no messages yet */
              <div className="msg-appear flex h-full min-h-[56vh] flex-col items-center justify-center px-4 text-center">
                <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)] shadow-[var(--shadow-sm)]">
                  <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                </div>

                <h3 className="mb-2 text-xl font-semibold tracking-tight text-[var(--text-main)] sm:text-2xl">
                  {classId ? "What should we work on?" : "Start a focused study chat"}
                </h3>
                <p className="mb-8 max-w-md text-sm leading-relaxed text-[var(--text-muted)] sm:text-[15px]">
                  {classId
                    ? "Summaries, quiz ideas, and explanations from the materials in this class."
                    : "Select a class or document to ground your answers, or ask a general question."}
                </p>

                {classId && (
                  <div className="grid w-full max-w-lg grid-cols-1 gap-2 sm:grid-cols-2">
                    {suggestions.map((s) => (
                      <button
                        key={s.label}
                        onClick={() => setInput(s.label)}
                        className="suggestion-card group flex items-start gap-2.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3 text-left transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="mb-0.5 text-[13px] font-semibold leading-snug text-[var(--text-main)] transition-colors group-hover:text-[var(--primary)]">
                            {s.label}
                          </div>
                          <div className="text-[11.5px] text-[var(--text-muted)]">{s.desc}</div>
                        </div>
                        <svg className="suggestion-icon mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[var(--primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
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
                      <div className="msg-appear flex flex-col gap-2 pb-2 pl-11">
                        {m.content && m.answer_mode && (
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${
                                m.answer_mode === "rag"
                                  ? "border-[color-mix(in_srgb,var(--primary)_30%,transparent)] bg-[var(--primary-soft)] text-[var(--primary)]"
                                  : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)]"
                              }`}
                            >
                              {m.answer_mode === "rag" ? "From your documents" : "General knowledge"}
                            </span>
                          </div>
                        )}
                        {m.answer_mode === "general" && m.web_sources && m.web_sources.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {m.web_sources.map((src, i) => (
                              <a
                                key={i}
                                href={src.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex max-w-[220px] items-center gap-1 truncate rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-muted)] transition hover:border-[var(--border-strong)] hover:text-[var(--primary)]"
                              >
                                <svg className="h-2.5 w-2.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
          <div className="shrink-0 border-t border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_96%,var(--surface-2))] px-4 pb-3 pt-3 dark:bg-[color-mix(in_srgb,var(--surface)_85%,#0a0a0c)] sm:px-5">
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

            {classes.length > 0 && classId == null && !isClassLocked ? (
              <div className="mx-auto mb-3 max-w-3xl rounded-xl border border-[color-mix(in_srgb,var(--primary)_22%,var(--border))] bg-[var(--primary-soft)] px-3.5 py-2.5 text-[12.5px] leading-snug text-[var(--text-secondary)]">
                <span className="font-semibold text-[var(--text-main)]">Tip: </span>
                Choose a class in the sidebar to ask from your uploaded materials. Without a class, replies use general mode only.
              </div>
            ) : null}

            <div className="max-w-3xl mx-auto">
              <ChatInput
                value={input}
                onChange={setInput}
                onSend={onAsk}
                isLoading={busyAsk}
                isListening={isListening}
                onToggleListening={handleMicClick}
                disabled={false}
              />
            </div>

            <div className="mx-auto mt-2 flex max-w-3xl justify-center">
              <span
                className={`inline-flex max-w-full items-center rounded-full border px-3 py-1 text-[11px] font-medium leading-snug text-[var(--text-secondary)] transition ${
                  chatMode === "auto"
                    ? "border-[color-mix(in_srgb,var(--primary)_28%,var(--border))] bg-[var(--primary-soft)] text-[var(--primary)]"
                    : chatMode === "rag"
                      ? "border-[color-mix(in_srgb,var(--primary)_28%,var(--border))] bg-[var(--primary-soft)] text-[var(--primary)]"
                      : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)]"
                }`}
              >
                {chatMode === "auto"
                  ? "Auto: grounded answers when a class is selected; otherwise general."
                  : chatMode === "rag"
                    ? "Answers use indexed files for the selected class."
                    : "General answers (no class files)."}
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
          <aside className="hidden w-[280px] flex-shrink-0 flex-col overflow-hidden border-l border-[var(--border)] bg-[var(--surface)] xl:flex">
            <div className="border-b border-[var(--border)] p-3">
              <div className="mb-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--primary-soft)] text-[var(--primary)]">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                  </div>
                  <h2 className="text-[12.5px] font-semibold text-[var(--text-main)]">Context files</h2>
                </div>
                {scopeFileIds.length > 0 && (
                  <span className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--primary)]">
                    {scopeFileIds.length} active
                  </span>
                )}
              </div>
              {classId != null && (
              <div className="relative">
                <svg className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted-soft)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  value={fileSearch}
                  onChange={e => setFileSearch(e.target.value)}
                  placeholder="Filter files…"
                  className="h-9 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)] pl-9 pr-3 text-[12.5px] text-[var(--text-main)] placeholder:text-[var(--text-muted-soft)] focus:border-[color-mix(in_srgb,var(--primary)_55%,var(--border))] focus:ring-2 focus:ring-[var(--ring)] focus:outline-none"
                />
              </div>
              )}
            </div>

            <div className="ns-scroll chat-scrollbar flex-1 space-y-1.5 overflow-y-auto p-2.5">
              {classId == null ? (
                <div className="flex h-32 flex-col items-center justify-center gap-2 px-3 text-center text-[var(--text-muted)]">
                  <svg className="h-8 w-8 opacity-25" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                  </svg>
                  <p className="text-[11.5px]">Select a class to view its documents.</p>
                </div>
              ) : busyFiles ? (
                <div className="flex h-20 items-center justify-center">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--primary)]" />
                </div>
              ) : filteredFiles.length === 0 ? (
                <div className="py-10 text-center text-[11.5px] italic text-[var(--text-muted-soft)]">No files found</div>
              ) : (
                filteredFiles.map(f => {
                  const checked = scopeFileIds.includes(f.id);
                  const ext = f.filename.split(".").pop()?.toUpperCase() || "FILE";
                  const isReady = ["INDEXED", "READY"].includes(String(f.status || "").toUpperCase());
                  return (
                    <button
                      key={f.id}
                      onClick={() => toggleFileScope(f.id)}
                      className={`group flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] border p-2.5 text-left transition ${
                        checked
                          ? "border-[color-mix(in_srgb,var(--primary)_35%,transparent)] bg-[var(--primary-soft)]"
                          : "border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]"
                      }`}
                    >
                      <div
                        className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-[4px] border transition ${
                          checked
                            ? "border-[var(--primary)] bg-[var(--primary)]"
                            : "border-[var(--border-strong)] group-hover:border-[var(--primary)]"
                        }`}
                      >
                        {checked && (
                          <svg className="h-2.5 w-2.5 text-[var(--text-inverse)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div
                          className={`mb-1 truncate text-[12px] font-medium ${
                            checked ? "text-[var(--primary)]" : "text-[var(--text-main)]"
                          }`}
                        >
                          {f.filename}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="rounded-[4px] bg-[var(--surface-2)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--text-muted-soft)]">
                            {ext}
                          </span>
                          <span className={`pill ${isReady ? "pill-success" : "pill-warning"} text-[9.5px]`}>
                            {statusLabel(f.status)}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {scopeFileIds.length > 0 && (
              <div className="border-t border-[var(--border)] p-2.5">
                <p className="text-center text-[10.5px] text-[var(--text-muted)]">
                  Scoped to <span className="font-bold text-[var(--primary)]">{scopeFileIds.length}</span> file
                  {scopeFileIds.length !== 1 ? "s" : ""}
                </p>
              </div>
            )}
          </aside>
        )}
      </div>
    </>
  );
}
