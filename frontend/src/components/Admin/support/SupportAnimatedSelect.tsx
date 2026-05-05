import { useEffect, useRef, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";
import { SupportSignalShape } from "./SupportSignalBadge";
import type { SupportSignalMeta } from "./supportTriageMeta";

export type SupportSelectOption<T extends string | number | null> = {
  value: T;
  label: string;
  hint?: string;
  meta?: SupportSignalMeta;
};

export type SupportAnimatedSelectProps<T extends string | number | null> = {
  value: T;
  options: SupportSelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  ariaLabel: string;
};

export function SupportAnimatedSelect<T extends string | number | null>({
  value,
  options,
  onChange,
  placeholder = "Select",
  ariaLabel,
}: SupportAnimatedSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  useEffect(() => {
    if (isOpen) {
      setHighlightIndex(selectedIndex >= 0 ? selectedIndex : 0);
    }
  }, [isOpen, selectedIndex]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClick = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlightIndex((current) => (current + 1) % options.length);
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlightIndex(
          (current) => (current - 1 + options.length) % options.length,
        );
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const option = options[highlightIndex];
        if (option) {
          onChange(option.value);
          setIsOpen(false);
        }
      }
    };

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [highlightIndex, isOpen, onChange, options]);

  const handlePick = useCallback(
    (option: SupportSelectOption<T>) => {
      onChange(option.value);
      setIsOpen(false);
    },
    [onChange],
  );

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-left text-[13px] font-semibold text-alloro-navy transition hover:border-slate-300 focus:border-alloro-orange focus:outline-none focus:ring-4 focus:ring-alloro-orange/15"
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected?.meta && <SupportSignalShape meta={selected.meta} />}
          <span
            className={`truncate ${selected ? "text-alloro-navy" : "text-slate-400"}`}
          >
            {selected ? selected.label : placeholder}
          </span>
        </span>
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.16 }}
          className="shrink-0 text-slate-400"
        >
          <ChevronDown className="h-4 w-4" />
        </motion.span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            className="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_16px_40px_rgba(17,21,28,0.12)]"
          >
            <ul className="max-h-72 overflow-y-auto py-1">
              {options.map((option, index) => {
                const isSelected = option.value === value;
                const isHighlighted = index === highlightIndex;
                return (
                  <li key={`${String(option.value)}-${index}`}>
                    <button
                      type="button"
                      onClick={() => handlePick(option)}
                      onMouseEnter={() => setHighlightIndex(index)}
                      className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[13px] transition ${
                        isHighlighted ? "bg-slate-50" : "bg-white"
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        {option.meta && (
                          <SupportSignalShape meta={option.meta} />
                        )}
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-alloro-navy">
                            {option.label}
                          </span>
                          {option.hint && (
                            <span className="block truncate text-[11px] font-medium text-slate-400">
                              {option.hint}
                            </span>
                          )}
                        </span>
                      </span>
                      {isSelected && (
                        <Check className="h-4 w-4 shrink-0 text-alloro-orange" />
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
