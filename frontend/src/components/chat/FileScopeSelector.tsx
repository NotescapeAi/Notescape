import React, { useMemo, useState } from "react";
import { FileRow } from "../../lib/api";
import { 
  Info, 
  Search, 
  FileText, 
  CheckSquare, 
  Square
} from "lucide-react";

interface Props {
  files: FileRow[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onSelectAll?: (ids: string[]) => void;
  onClear?: () => void;
  activeFileId?: string | null;
  onFileClick?: (file: FileRow) => void;
}

export function FileScopeSelector({ 
  files, 
  selectedIds, 
  onToggle, 
  onSelectAll, 
  onClear,
  activeFileId,
  onFileClick
}: Props) {
  const [search, setSearch] = useState("");
  
  const filteredFiles = useMemo(() => {
    if (!search.trim()) return files;
    const q = search.toLowerCase();
    return files.filter(f => f.filename.toLowerCase().includes(q));
  }, [files, search]);

  const handleSelectAll = () => {
    if (onSelectAll) {
      onSelectAll(filteredFiles.map(f => f.id));
    } else {
      // Fallback: Toggle unselected ones (inefficient but works without new API)
      filteredFiles.forEach(f => {
        if (!selectedIds.includes(f.id)) onToggle(f.id);
      });
    }
  };

  const handleClear = () => {
     if (onClear) {
       onClear();
     } else {
       // Fallback
       selectedIds.forEach(id => onToggle(id));
     }
  };

  return (
    <aside className="flex flex-col h-full min-h-0 rounded-2xl border border-token surface shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex flex-col border-b border-token bg-surface-muted/30">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-main">Context Sources</h3>
            <div className="group relative">
              <Info className="h-4 w-4 text-muted cursor-help" />
              <div className="absolute right-0 top-full mt-2 w-48 rounded-lg bg-inverse p-2 text-[11px] text-inverse shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                Select documents to limit the AI's search context.
              </div>
            </div>
          </div>
          <div className="text-[10px] text-muted font-medium">
            {selectedIds.length} selected
          </div>
        </div>
        
        {/* Search */}
        <div className="px-4 pb-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Filter files..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-full rounded-lg border border-token bg-surface pl-8 pr-3 text-xs text-main placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
        {files.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center p-4">
             <FileText className="h-8 w-8 text-muted/30 mb-2" />
             <p className="text-xs text-muted">No documents available.</p>
             <p className="text-[10px] text-muted/70 mt-2">Upload files to start.</p>
          </div>
        ) : filteredFiles.length === 0 ? (
           <div className="text-center p-4 text-xs text-muted">
             No files match "{search}"
           </div>
        ) : (
          filteredFiles.map(f => {
            const isSelected = selectedIds.includes(f.id);
            const isActive = activeFileId === f.id;
            
            return (
              <div
                key={f.id}
                onClick={() => onFileClick && onFileClick(f)}
                className={`group w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all ${onFileClick ? "cursor-pointer" : ""} ${
                  isActive 
                    ? "border-primary bg-primary/10 shadow-md ring-1 ring-primary"
                    : isSelected
                       ? "border-primary/30 bg-primary/5 shadow-sm"
                       : "border-transparent hover:bg-surface-hover"
                }`}
                aria-pressed={isSelected}
              >
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggle(f.id);
                  }}
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors hover:bg-black/5 ${
                    isSelected ? "text-primary" : "text-muted group-hover:text-main"
                  }`}
                  title="Toggle context"
                >
                   {isSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                </button>
                
                <div className="flex-1 min-w-0">
                  <div className={`truncate text-xs font-medium ${isActive || isSelected ? "text-primary-dark" : "text-main"}`} title={f.filename}>
                    {f.filename}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[9px] font-bold text-muted/80 uppercase tracking-wider">
                      {f.filename.split('.').pop()}
                    </span>
                    <StatusDot status={f.status} />
                    {isActive && <span className="text-[9px] font-bold text-primary px-1.5 py-0.5 rounded-full bg-primary/10">ACTIVE</span>}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-token bg-surface p-4 z-10">
        <div className="flex items-center justify-between gap-3">
           <button 
             onClick={handleSelectAll}
             className="flex-1 h-[52px] rounded-xl border border-token px-3 text-xs font-semibold text-primary hover:bg-primary-50 hover:border-primary-200 disabled:opacity-50 transition-all shadow-sm active:scale-95"
             disabled={filteredFiles.length === 0}
             title="Select all visible files"
           >
             Select All
           </button>
           <button 
             onClick={handleClear}
             className="flex-1 h-[52px] rounded-xl border border-token px-3 text-xs font-semibold text-muted hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 disabled:opacity-50 transition-all shadow-sm active:scale-95"
             disabled={selectedIds.length === 0}
             title="Clear selection"
           >
             Clear
           </button>
        </div>
        <div className="mt-2 text-[10px] text-muted text-center font-medium">
          Select files for context
        </div>
      </div>
    </aside>
  );
}

function StatusDot({ status }: { status?: string | null }) {
  const s = (status || "").toUpperCase();
  let color = "bg-emerald-500";
  let label = "Ready";
  
  if (s === "FAILED") {
    color = "bg-rose-500";
    label = "Error";
  } else if (s === "PROCESSING" || s === "OCR_QUEUED" || s === "UPLOADED") {
    color = "bg-amber-500";
    label = "Processing";
  }
  
  return (
    <div className="flex items-center gap-1" title={label}>
      <div className={`h-1.5 w-1.5 rounded-full ${color}`} />
    </div>
  );
}
