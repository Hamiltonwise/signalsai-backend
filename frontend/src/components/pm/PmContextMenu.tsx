/**
 * PmContextMenu — right-click popover menu for PM surfaces (attachments,
 * comments). Controlled component: parent owns open-state + position and
 * passes an item array. Framer Motion entrance, ESC + outside-click close.
 *
 * Each item is rendered even if `disabled: true` (we grey it out rather
 * than hide it so the user sees *why* an action is unavailable).
 */

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";

export interface PmContextMenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}

interface PmContextMenuProps {
  open: boolean;
  x: number;
  y: number;
  items: PmContextMenuItem[];
  onClose: () => void;
}

export function PmContextMenu({
  open,
  x,
  y,
  items,
  onClose,
}: PmContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Use mousedown (bubbles before click handlers fire) + capture so we
    // catch clicks on any element below.
    document.addEventListener("mousedown", onDocMouseDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  // Nudge the menu back into the viewport if it would spill off the right
  // or bottom edge. Cheap geometry; runs once per render when open.
  const style = (() => {
    if (typeof window === "undefined") return { left: x, top: y };
    const maxX = window.innerWidth - 200;
    const maxY = window.innerHeight - 12 - items.length * 36;
    return {
      left: Math.min(x, Math.max(8, maxX)),
      top: Math.min(y, Math.max(8, maxY)),
    };
  })();

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          role="menu"
          initial={{ opacity: 0, scale: 0.97, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: -4 }}
          transition={{ duration: 0.1, ease: "easeOut" }}
          className="fixed z-[100] min-w-[180px] overflow-hidden rounded-lg border shadow-xl"
          style={{
            ...style,
            borderColor: "var(--color-pm-border)",
            backgroundColor: "var(--color-pm-bg-secondary)",
          }}
        >
          <ul className="py-1">
            {items.map((item) => {
              const isDanger = !!item.danger;
              return (
                <li key={item.id}>
                  <button
                    role="menuitem"
                    disabled={item.disabled}
                    onClick={() => {
                      if (item.disabled) return;
                      item.onClick();
                      onClose();
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] transition-colors"
                    style={{
                      color: item.disabled
                        ? "var(--color-pm-text-muted)"
                        : isDanger
                        ? "var(--color-pm-danger)"
                        : "var(--color-pm-text-primary)",
                      opacity: item.disabled ? 0.55 : 1,
                      cursor: item.disabled ? "not-allowed" : "pointer",
                    }}
                    onMouseEnter={(e) => {
                      if (item.disabled) return;
                      (e.currentTarget as HTMLElement).style.backgroundColor =
                        isDanger
                          ? "rgba(196, 51, 51, 0.12)"
                          : "var(--color-pm-bg-hover)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.backgroundColor =
                        "transparent";
                    }}
                  >
                    {item.icon && (
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                        {item.icon}
                      </span>
                    )}
                    <span>{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
