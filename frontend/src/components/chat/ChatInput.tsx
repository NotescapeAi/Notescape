import { useRef, useEffect } from "react";
import { Mic, Send, Square } from "lucide-react";

interface ChatInputProps {
  value: string;
  onChange: (val: string) => void;
  onSend: () => void;
  isLoading: boolean;
  isListening: boolean;
  onToggleListening: () => void;
}

export default function ChatInput({
  value,
  onChange,
  onSend,
  isLoading,
  isListening,
  onToggleListening,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const newHeight = Math.min(textareaRef.current.scrollHeight, 200);
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, [value]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  }

  return (
    <div className="relative flex items-end gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-2 py-2 shadow-sm focus-within:border-[var(--primary)] focus-within:ring-1 focus-within:ring-[var(--primary)]/20 transition-all">
      <style>{`
        .no-scrollbar::-webkit-scrollbar {
          width: 0px;
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: var(--border);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background-color: var(--text-secondary);
        }
      `}</style>

      {/* Mic button on the LEFT */}
      <div className="flex items-center pb-1">
        <button
          onClick={onToggleListening}
          className={`flex-shrink-0 h-9 w-9 rounded-xl flex items-center justify-center transition-all duration-200 ${
            isListening
              ? "bg-red-500 text-white animate-pulse shadow-md"
              : "text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-main)]"
          }`}
          title={isListening ? "Stop listening" : "Voice input"}
        >
          {isListening ? <Square size={16} fill="currentColor" /> : <Mic size={20} />}
        </button>
      </div>

      <div className="flex-1 min-w-0 py-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isListening ? "Listening..." : "Ask a question..."}
          rows={1}
          className="w-full resize-none bg-transparent text-sm text-[var(--text-main)] placeholder:text-[var(--text-secondary)] focus:outline-none max-h-[200px] custom-scrollbar"
          style={{ minHeight: "24px" }}
        />
      </div>

      {/* Send button on the RIGHT */}
      <div className="flex items-center pb-1">
        <button
          onClick={onSend}
          disabled={!value.trim() || isLoading}
          className={`flex-shrink-0 h-9 w-9 rounded-xl flex items-center justify-center transition-all duration-200 ${
            value.trim() && !isLoading
              ? "bg-[var(--primary)] text-white shadow-sm hover:brightness-110 active:scale-95"
              : "bg-[var(--surface-2)] text-[var(--text-secondary)] cursor-not-allowed opacity-50"
          }`}
          title="Send message"
        >
          <Send size={18} className={value.trim() && !isLoading ? "ml-0.5" : ""} />
        </button>
      </div>
    </div>
  );
}