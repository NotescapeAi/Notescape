import React from "react";
import { ChatSession } from "../../lib/api";
import KebabMenu from "../KebabMenu";
import { Plus, MessageSquare } from "lucide-react";

interface Props {
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onRenameSession: (session: ChatSession) => void;
  onClearMessages: (session: ChatSession) => void;
  onDeleteSession: (session: ChatSession) => void;
  contextTitle?: string;
}

export function ChatSessionList({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onRenameSession,
  onClearMessages,
  onDeleteSession,
  contextTitle,
}: Props) {
  return (
    <aside className="rounded-2xl border border-token surface shadow-sm flex flex-col h-full min-h-0 overflow-hidden">
      {/* Header */}
      <div className="flex flex-col border-b border-token bg-surface-muted/30">
        <div className="flex items-center justify-between p-4">
          <div className="text-sm font-semibold text-main">Sessions</div>
          <button
            onClick={onNewSession}
            className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-hover px-3 py-2 rounded-lg hover:bg-surface-hover transition-colors"
            title="Start a new chat session"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New</span>
          </button>
        </div>
        {contextTitle && (
          <div className="px-4 pb-4">
            <div className="text-xs font-medium text-primary bg-primary/5 px-2 py-1 rounded border border-primary/20 truncate text-center" title={contextTitle}>
              {contextTitle}
            </div>
          </div>
        )}
      </div>
      
      {/* List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center text-muted">
            <MessageSquare className="h-8 w-8 mb-2 opacity-20" />
            <span className="text-xs">No sessions yet.</span>
          </div>
        ) : (
          sessions.map((s) => {
            const isActive = activeSessionId === s.id;
            return (
              <div
                key={s.id}
                className={`group flex items-center justify-between rounded-xl p-3 text-sm transition-all cursor-pointer border ${
                  isActive
                    ? "bg-surface-active border-token font-medium text-main shadow-sm"
                    : "border-transparent text-muted hover:bg-surface-hover hover:text-main"
                }`}
                onClick={() => onSelectSession(s.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        onSelectSession(s.id);
                    }
                }}
              >
                <span className="truncate flex-1 mr-2">{s.title}</span>
                <div className={`opacity-0 group-hover:opacity-100 transition-opacity ${isActive ? 'opacity-100' : ''}`} onClick={(e) => e.stopPropagation()}>
                  <KebabMenu
                    items={[
                      { label: "Rename", onClick: () => onRenameSession(s) },
                      { label: "Clear messages", onClick: () => onClearMessages(s) },
                      { label: "Delete chat", onClick: () => onDeleteSession(s) },
                    ]}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
