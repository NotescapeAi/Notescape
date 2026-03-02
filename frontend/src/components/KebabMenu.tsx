import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreVertical } from "lucide-react";

export type KebabItem = { label: string; onClick: () => void };

export default function KebabMenu({ items }: { items: KebabItem[] }) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close on click outside or scroll/resize
  useEffect(() => {
    if (!open) return;

    function onMouseDown(e: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }

    function onScroll() {
      setOpen(false);
    }

    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("scroll", onScroll, { capture: true });
    window.addEventListener("resize", onScroll);

    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const menuHeightApprox = items.length * 40 + 20;
      
      const newStyle: React.CSSProperties = {
        position: "fixed",
        zIndex: 9999,
        width: "11rem", // w-44
      };

      // Align right edge of menu with right edge of button
      // rect.right is the x-coordinate of the right edge of the button
      // menu width is 176px
      let left = rect.right - 176;
      if (left < 10) left = 10; // keep on screen
      newStyle.left = left;

      // Decide whether to open up or down
      if (spaceBelow < menuHeightApprox && rect.top > menuHeightApprox) {
        // Open upwards
        newStyle.bottom = window.innerHeight - rect.top + 8;
      } else {
        // Open downwards
        newStyle.top = rect.bottom + 8;
      }

      setStyle(newStyle);
      setOpen(true);
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-accent-weak"
        aria-haspopup="menu"
        aria-expanded={open}
        title="More"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={style}
            className="rounded-xl border border-token surface shadow-lg p-1"
          >
            {items.map((it, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setOpen(false);
                  // Use a small timeout to allow the menu to close before action triggers (e.g. dialogs)
                  setTimeout(() => it.onClick(), 0);
                }}
                className="block w-full rounded-lg px-3 py-2 text-left text-[14px] hover:bg-[var(--surface-2)]"
                role="menuitem"
              >
                {it.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
