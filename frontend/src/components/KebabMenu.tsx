// src/components/KebabMenu.tsx
import React, { useEffect, useRef, useState } from "react";
import { MoreVertical } from "lucide-react";

export type KebabItem = { label: string; onClick: () => void };

export default function KebabMenu({ items }: { items: KebabItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center justify-center h-8 w-8 rounded-full hover:bg-slate-100"
        aria-haspopup="menu"
        aria-expanded={open}
        title="More"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-44 rounded-xl border border-slate-200 bg-white shadow-lg p-1 z-20"
        >
          {items.map((it, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                // IMPORTANT: close, THEN navigate/act on next tick
                setOpen(false);
                // use rAF first (more robust than setTimeout 0 in some browsers)
                requestAnimationFrame(() => it.onClick());
              }}
              className="block w-full text-left px-3 py-2 text-[14px] hover:bg-slate-50 rounded-lg"
              role="menuitem"
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
