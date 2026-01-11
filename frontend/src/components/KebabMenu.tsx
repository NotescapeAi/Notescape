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
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-accent-weak"
        aria-haspopup="menu"
        aria-expanded={open}
        title="More"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-44 rounded-xl border border-token surface shadow-lg p-1 z-20"
        >
          {items.map((it, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                // Close first, then act on next tick to avoid focus/overlay glitches
                setOpen(false);
                requestAnimationFrame(() => it.onClick());
              }}
              className="block w-full rounded-lg px-3 py-2 text-left text-[14px] hover:bg-[var(--surface-2)]"
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
