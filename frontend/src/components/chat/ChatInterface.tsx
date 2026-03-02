import React from "react";
import { ChatSession, FileRow } from "../../lib/api";
import { Msg } from "../../hooks/useChatSession";
import { ChatSessionList } from "./ChatSessionList";
import { ChatConversation } from "./ChatConversation";
import { FileScopeSelector } from "./FileScopeSelector";

interface Props {
  // Session List
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onRenameSession: (session: ChatSession) => void;
  onClearMessages: (session: ChatSession) => void;
  onDeleteSession: (session: ChatSession) => void;

  // Conversation
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

  // File Scope
  files: FileRow[];
  selectedFileIds: string[];
  onToggleFile: (id: string) => void;
  onSetFileScope: (ids: string[]) => void;
  activeFileId?: string | null;
  onFileClick?: (file: FileRow) => void;
}

export function ChatInterface({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onRenameSession,
  onClearMessages,
  onDeleteSession,
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
  files,
  selectedFileIds,
  onToggleFile,
  onSetFileScope,
  activeFileId,
  onFileClick,
}: Props) {
  const contextTitle = activeFileId 
    ? files.find(f => f.id === activeFileId)?.filename 
    : "Global Chat";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full min-h-0 p-6">
      {/* Left Panel: Sessions */}
      <div className="hidden lg:flex flex-col h-full min-h-0 min-w-0">
        <ChatSessionList
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={onSelectSession}
          onNewSession={onNewSession}
          onRenameSession={onRenameSession}
          onClearMessages={onClearMessages}
          onDeleteSession={onDeleteSession}
          contextTitle={contextTitle}
        />
      </div>

      {/* Center Panel: Conversation */}
      <div className="flex flex-col h-full min-h-0 min-w-0">
        <ChatConversation
          messages={messages}
          isLoading={isLoading}
          error={error}
          input={input}
          setInput={setInput}
          onSend={onSend}
          showCitations={showCitations}
          onToggleCitations={onToggleCitations}
          selectedQuote={selectedQuote}
          onClearQuote={onClearQuote}
          pendingSnip={pendingSnip}
          onSendSnip={onSendSnip}
          onDiscardSnip={onDiscardSnip}
          scrollRef={scrollRef}
          onScroll={onScroll}
        />
      </div>

      {/* Right Panel: File Scope */}
      <div className="hidden lg:flex flex-col h-full min-h-0 min-w-0">
        <FileScopeSelector
          files={files}
          selectedIds={selectedFileIds}
          onToggle={onToggleFile}
          onSelectAll={onSetFileScope}
          onClear={() => onSetFileScope([])}
          activeFileId={activeFileId}
          onFileClick={onFileClick}
        />
      </div>
    </div>
  );
}
