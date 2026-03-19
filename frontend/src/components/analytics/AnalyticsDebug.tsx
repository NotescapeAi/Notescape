import React, { useState } from 'react';
import { useActivity } from '../../contexts/ActivityContext';
import { formatDuration } from '../../lib/utils';
import { RefreshCw, Activity, Terminal, ChevronDown, ChevronRight, Play, Square, Pause } from 'lucide-react';

interface AnalyticsDebugProps {
  lastSSEMessage: any;
  sseConnected: boolean;
}

export const AnalyticsDebug: React.FC<AnalyticsDebugProps> = ({ lastSSEMessage, sseConnected }) => {
  const { 
    activeSecondsToday, 
    currentSessionSeconds, 
    isIdle, 
    formattedTime, 
    switchSession, 
    endSession,
    lastActiveTime
  } = useActivity();
  
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mt-8 border border-[var(--border-subtle)] rounded-xl overflow-hidden bg-[var(--bg-surface)]">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] transition-colors"
      >
        <div className="flex items-center gap-2 font-mono text-sm font-medium text-[var(--text-primary)]">
          <Terminal size={16} className="text-[var(--primary)]" />
          Analytics Debug Console
          {sseConnected ? (
            <span className="ml-2 px-2 py-0.5 text-xs bg-emerald-500/10 text-emerald-500 rounded-full border border-emerald-500/20">SSE Connected</span>
          ) : (
            <span className="ml-2 px-2 py-0.5 text-xs bg-red-500/10 text-red-500 rounded-full border border-red-500/20">SSE Disconnected</span>
          )}
        </div>
        {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>

      {isOpen && (
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
          {/* Local State */}
          <div className="space-y-4">
            <h4 className="font-semibold flex items-center gap-2 text-[var(--text-primary)]">
              <Activity size={16} />
              Local Activity State
            </h4>
            <div className="bg-[var(--bg-subtle)] p-3 rounded-lg font-mono text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Status:</span>
                <span className={isIdle ? "text-amber-500" : "text-emerald-500"}>
                  {isIdle ? "IDLE (Background)" : "ACTIVE"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Active Today:</span>
                <span className="text-[var(--text-primary)]">{activeSecondsToday}s ({formatDuration(activeSecondsToday)})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Current Session:</span>
                <span className="text-[var(--text-primary)]">{currentSessionSeconds}s ({formatDuration(currentSessionSeconds)})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Formatted Time:</span>
                <span className="text-[var(--text-primary)]">{formattedTime}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Last Active:</span>
                <span className="text-[var(--text-primary)]">{new Date(lastActiveTime).toLocaleTimeString()}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <button 
                onClick={() => switchSession("Debug Session")}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-[var(--primary)] text-white rounded-md hover:opacity-90 transition-opacity text-xs"
              >
                <Play size={14} /> Start Debug Session
              </button>
              <button 
                onClick={() => endSession()}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-[var(--bg-hover)] text-[var(--text-primary)] rounded-md hover:bg-[var(--bg-active)] transition-colors text-xs"
              >
                <Square size={14} /> End Session
              </button>
            </div>
          </div>

          {/* Server State */}
          <div className="space-y-4">
            <h4 className="font-semibold flex items-center gap-2 text-[var(--text-primary)]">
              <RefreshCw size={16} />
              Server Stream (SSE)
            </h4>
            <div className="bg-[var(--bg-subtle)] p-3 rounded-lg font-mono text-xs h-[200px] overflow-y-auto">
              {lastSSEMessage ? (
                <pre className="whitespace-pre-wrap break-all text-[var(--text-secondary)]">
                  {JSON.stringify(lastSSEMessage, null, 2)}
                </pre>
              ) : (
                <div className="text-[var(--text-secondary)] italic">Waiting for updates...</div>
              )}
            </div>
            <div className="text-xs text-[var(--text-secondary)]">
              Updates every 5 seconds from backend
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
