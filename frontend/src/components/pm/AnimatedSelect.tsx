/**
 * AnimatedSelect — click-to-open dropdown with Framer Motion popover.
 *
 * Used inside the PM TaskDetailPanel in place of a native <select> so we
 * can style the surface consistently with the rest of the PM dark theme
 * and get a real entrance animation on open.
 *
 * Not a combobox — no search input. Suited for short option lists
 * (the super-admin pool is tiny). Keyboard: ArrowUp/ArrowDown to move
 * the highlight, Enter to select, Escape to close.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";

export interface AnimatedSelectOption<T extends string | number | null> {
  value: T;
  label: string;
  hint?: string;
}

interface AnimatedSelectProps<T extends string | number | null> {
  value: T;
  options: AnimatedSelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  className?: string;
}

export function AnimatedSelect<T extends string | number | null>({
  value,
  options,
  onChange,
  placeholder = "Select…",
  className,
}: AnimatedSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const currentIdx = options.findIndex((o) => o.value === value);
  const current = currentIdx >= 0 ? options[currentIdx] : null;

  useEffect(() => {
    if (!open) return;
    setHighlight(currentIdx >= 0 ? currentIdx : 0);
  }, [open, currentIdx]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight((h) => (h + 1) % options.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((h) => (h - 1 + options.length) % options.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const opt = options[highlight];
        if (opt) {
          onChange(opt.value);
          setOpen(false);
        }
      }
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, highlight, options, onChange]);

  const handlePick = useCallback(
    (opt: AnimatedSelectOption<T>) => {
      onChange(opt.value);
      setOpen(false);
    },
    [onChange]
  );

  return (
    <div ref={wrapRef} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-lg border border-pm-border bg-pm-bg-primary py-2 px-3 text-sm text-pm-text-primary transition-colors hover:border-pm-border-hover focus:border-pm-accent focus:outline-none focus:ring-1 focus:ring-pm-accent"
      >
        <span
          className={current ? "text-pm-text-primary" : "text-pm-text-muted"}
        >
          {current ? current.label : placeholder}
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.15 }}
          className="ml-2 shrink-0 text-pm-text-muted"
        >
          <ChevronDown className="h-4 w-4" />
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            className="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-lg border shadow-lg"
            style={{
              borderColor: "var(--color-pm-border)",
              backgroundColor: "var(--color-pm-bg-secondary)",
            }}
          >
            <ul className="max-h-64 overflow-y-auto py-1">
              {options.map((opt, i) => {
                const selected = opt.value === value;
                const highlighted = i === highlight;
                return (
                  <li key={`${String(opt.value)}-${i}`}>
                    <button
                      type="button"
                      onClick={() => handlePick(opt)}
                      onMouseEnter={() => setHighlight(i)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors"
                      style={{
                        backgroundColor: highlighted
                          ? "var(--color-pm-bg-hover)"
                          : "transparent",
                        color: "var(--color-pm-text-primary)",
                      }}
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate">{opt.label}</span>
                        {opt.hint && (
                          <span
                            className="text-[11px]"
                            style={{ color: "var(--color-pm-text-muted)" }}
                          >
                            {opt.hint}
                          </span>
                        )}
                      </span>
                      {selected && (
                        <Check
                          className="h-4 w-4 shrink-0"
                          style={{ color: "#D66853" }}
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
