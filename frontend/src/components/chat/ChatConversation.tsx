import React, { useRef, useEffect } from "react";
import { Msg } from "../../hooks/useChatSession";
import { DateDisplay } from "../DateDisplay";
import { Loader2, Send, X, Image as ImageIcon, Quote, MessageSquare, FileText } from "lucide-react";

interface Props {
  messages: Msg[];
  isLoading: boolean;
  error: string | null;
  input: string;
  setInput: (val: string) => void;
  onSend: () => void;
  showCitations: boolean;
  onToggleCitations: () => void;
  selectedQuote: { text: string } | null;
  onClearQuote: () => void;
  pendingSnip: { data_url: string } | null;
  onSendSnip: () => void;
  onDiscardSnip: () => void;
  scrollRef: React.RefObject<HTMLDivElement>;
  onScroll: () => void;
}

export function ChatConversation({
  messages,
  isLoading,
  error,
  input,
  setInput,
  onSend,
  showCitations,
  onToggleCitations,
  selectedQuote,
  onClearQuote,
  pendingSnip,
  onSendSnip,
  onDiscardSnip,
  scrollRef,
  onScroll,
}: Props) {
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <section className="flex flex-col h-full min-h-0 rounded-2xl border border-token surface shadow-sm overflow-hidden relative">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-token p-4 bg-surface-muted/30">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          <div className="text-sm font-semibold text-main">Conversation</div>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted cursor-pointer hover:text-main transition-colors select-none">
          <input 
            type="checkbox" 
            checked={showCitations} 
            onChange={onToggleCitations}
            className="rounded border-token text-primary focus:ring-primary h-4 w-4"
          />
          Show citations
        </label>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto p-4 space-y-6 custom-scrollbar scroll-smooth"
        onScroll={onScroll}
      >
        {error ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="rounded-full bg-rose-100 p-4 mb-4">
               <X className="h-6 w-6 text-rose-600" />
            </div>
            <div className="text-sm font-medium text-rose-700 mb-2">Error loading chat</div>
            <div className="text-xs text-rose-600/80 max-w-[200px]">{error}</div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center opacity-60">
            <MessageSquare className="h-12 w-12 text-muted mb-4" />
            <p className="text-sm text-main font-medium">No messages yet</p>
            <p className="text-xs text-muted mt-2">Ask a question about your class materials.</p>
          </div>
        ) : (
          messages.map((m) => (
            <MessageBubble key={m.id} message={m} showCitations={showCitations} />
          ))
        )}
        {isLoading && (
          <div className="flex justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="bg-surface-2 border border-token rounded-2xl rounded-tl-none p-4 shadow-sm flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-xs text-muted font-medium">Thinking...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t border-token bg-surface p-4 z-10">
        {/* Attachments */}
        {(selectedQuote || pendingSnip) && (
          <div className="mb-3 space-y-2 animate-in fade-in slide-in-from-bottom-2">
            {selectedQuote && (
              <div className="relative rounded-xl border border-amber-200 bg-amber-50/50 p-3 pr-8">
                <div className="flex items-center gap-2 mb-1">
                  <Quote className="h-3.5 w-3.5 text-amber-600" />
                  <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wide">Quote Attached</span>
                </div>
                <div className="text-xs text-amber-900/90 line-clamp-3 italic font-medium">
                  "{selectedQuote.text}"
                </div>
                <button
                  onClick={onClearQuote}
                  className="absolute right-2 top-2 rounded-full p-1 text-amber-600 hover:bg-amber-100 transition-colors"
                  title="Remove quote"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            
            {pendingSnip && (
              <div className="rounded-xl border border-token surface-2 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="h-3.5 w-3.5 text-primary" />
                    <span className="text-[10px] font-bold text-main uppercase tracking-wide">Snippet Ready</span>
                  </div>
                  <div className="flex gap-2">
                     <button 
                       onClick={onDiscardSnip}
                       className="text-[10px] font-medium text-muted hover:text-rose-500 transition-colors"
                     >
                       Discard
                     </button>
                     <button 
                       onClick={onSendSnip}
                       className="text-[10px] font-medium text-primary hover:text-primary-hover transition-colors"
                     >
                       Send Now
                     </button>
                  </div>
                </div>
                <div className="relative group max-w-xs">
                  <img
                    src={pendingSnip.data_url}
                    alt="Snippet"
                    className="rounded-lg border border-token shadow-sm max-h-32 object-contain bg-white"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 min-h-[52px] max-h-32 resize-none rounded-xl border border-token bg-surface-2 px-4 py-3 text-sm text-main placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-sm transition-shadow"
            placeholder="Ask a question..."
            rows={1}
          />
          <button
            onClick={onSend}
            disabled={isLoading || (!input.trim() && !pendingSnip)}
            className="h-[52px] w-[52px] flex items-center justify-center rounded-xl bg-primary text-inverse shadow-sm hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
            title="Send message"
          >
            {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </button>
        </div>
        <div className="mt-2 text-[10px] text-muted text-center font-medium">
          Enter to send, Shift+Enter for newline
        </div>
      </div>
    </section>
  );
}

function MessageBubble({ message, showCitations }: { message: Msg; showCitations: boolean }) {
  const isUser = message.role === "user";
  
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-2`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm text-sm ${
          isUser
            ? "bg-primary text-inverse rounded-tr-none"
            : "bg-surface-2 border border-token text-main rounded-tl-none"
        }`}
      >
        {/* Quote/Context */}
        {message.selected_text && (
           <div className={`mb-3 rounded-lg border px-3 py-2 text-xs ${
             isUser ? "border-white/20 bg-white/10 text-white/90" : "border-token bg-surface text-muted"
           }`}>
             <div className="flex items-center gap-1.5 mb-1 opacity-70">
               <Quote className="h-3 w-3" />
               <span className="text-[9px] uppercase tracking-wider font-bold">Context</span>
             </div>
             <div className="italic line-clamp-4">"{message.selected_text}"</div>
           </div>
        )}

        {/* Image Attachment */}
        {message.image_attachment?.data_url && (
          <div className="mb-3">
            <img 
              src={message.image_attachment.data_url} 
              alt="Attachment" 
              className="rounded-lg border border-black/10 max-h-48 object-contain bg-white"
            />
          </div>
        )}

        {/* Content */}
        <div className="whitespace-pre-wrap leading-relaxed break-words">
          {message.content}
        </div>

        {/* Timestamp */}
        <div className={`mt-1 flex justify-end`}>
          <DateDisplay 
            date={message.created_at} 
            showTime={true} 
            formatOptions={{ hour: 'numeric', minute: '2-digit' }}
            className={`text-[10px] ${isUser ? "text-white/70" : "text-muted/70"}`}
            placeholder=""
          />
        </div>

        {/* Citations */}
        {showCitations && !isUser && message.citations && message.citations.length > 0 && (
          <div className="mt-3 pt-3 border-t border-token/50 space-y-1.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted mb-1">Sources</div>
            {message.citations.slice(0, 4).map((c: any, idx: number) => (
              <div key={idx} className="flex items-center gap-1.5 text-[11px] text-muted/80 bg-surface/50 rounded px-1.5 py-0.5 w-fit max-w-full">
                <FileText className="h-3 w-3 shrink-0" />
                <span className="truncate">{c.filename || "Unknown Source"}</span>
                {c.page_start && (
                  <span className="shrink-0 opacity-70">
                    (p. {c.page_start}{c.page_end && c.page_end !== c.page_start ? `-${c.page_end}` : ''})
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
