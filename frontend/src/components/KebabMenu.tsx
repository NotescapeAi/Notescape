import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreVertical } from "lucide-react";

export type KebabItem = { label: string; onClick: () => void };

type Props = {
  items: KebabItem[];
  /** Renders the menu in a fixed portal so it is not clipped by overflow scroll parents. */
  portal?: boolean;
};

export default function KebabMenu({ items, portal = false }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  useLayoutEffect(() => {
    if (!open || !portal) return;
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const menuW = 176;
    let left = rect.right - menuW;
    if (left < 8) left = 8;
    if (left + menuW > window.innerWidth - 8) left = window.innerWidth - menuW - 8;
    const approxH = items.length * 40 + 12;
    let top = rect.bottom + 6;
    if (top + approxH > window.innerHeight - 8) {
      top = Math.max(8, rect.top - approxH - 6);
    }
    setMenuStyle({
      position: "fixed",
      top,
      left,
      width: menuW,
      zIndex: 200,
    });
  }, [open, portal, items.length]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      if (portal && menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [portal]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open || !portal) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open, portal]);

  const menu = open && (
    <div
      ref={menuRef}
      role="menu"
      style={portal ? menuStyle : undefined}
      className={
        portal
          ? "rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 shadow-[var(--shadow-elevated)]"
          : "absolute right-0 z-[80] mt-2 w-44 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 shadow-lg"
      }
    >
      {items.map((it, idx) => (
        <button
          key={idx}
          type="button"
          onClick={() => {
            setOpen(false);
            requestAnimationFrame(() => it.onClick());
          }}
          className="block w-full rounded-lg px-3 py-2 text-left text-[14px] text-[var(--text-main)] hover:bg-[var(--surface-2)]"
          role="menuitem"
        >
          {it.label}
        </button>
      ))}
    </div>
  );

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text-main)]"
        aria-haspopup="menu"
        aria-expanded={open}
        title="More"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {portal && menu ? createPortal(menu, document.body) : menu}
    </div>
  );
}
