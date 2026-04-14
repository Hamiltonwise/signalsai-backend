/**
 * DeadlinePicker — animated popover with priority-mapped quick-pick row
 * and a compact month calendar grid.
 *
 * Value contract matches the existing PM deadline handling: the picker
 * emits a YYYY-MM-DD string (or "" for cleared). TaskDetailPanel still
 * converts that to endOfDayPST() before sending to the API. No change in
 * persistence semantics — this component is pure UI.
 */

import { useEffect, useRef, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  endOfWeek,
  parse,
} from "date-fns";
import {
  quickPickDate,
  QUICK_PICK_LABELS,
  type PmQuickPickKind,
} from "../../utils/pmQuickPickDates";

interface DeadlinePickerProps {
  /** YYYY-MM-DD or "" */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

const QUICK_PICKS: PmQuickPickKind[] = ["P1", "P2", "P3", "P4", "P5"];

function parseYmd(s: string): Date | null {
  if (!s) return null;
  const parsed = parse(s, "yyyy-MM-dd", new Date());
  return isNaN(parsed.getTime()) ? null : parsed;
}

function prettyLabel(ymd: string): string {
  const d = parseYmd(ymd);
  if (!d) return "";
  return format(d, "MMM d, yyyy");
}

export function DeadlinePicker({
  value,
  onChange,
  placeholder = "No deadline",
}: DeadlinePickerProps) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<Date>(() => parseYmd(value) ?? new Date());
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const parsed = parseYmd(value);
    if (parsed) setMonth(parsed);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = parseYmd(value);
  const today = useMemo(() => new Date(), []);

  const days = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
    const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 0 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [month]);

  const pickQuick = (kind: PmQuickPickKind) => {
    const ymd = quickPickDate(kind);
    onChange(ymd);
    setOpen(false);
  };

  const pickDay = (d: Date) => {
    onChange(format(d, "yyyy-MM-dd"));
    setOpen(false);
  };

  const clear = () => {
    onChange("");
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-lg border border-pm-border bg-pm-bg-primary py-2 pl-10 pr-3 text-sm text-pm-text-primary transition-colors hover:border-pm-border-hover focus:border-pm-accent focus:outline-none focus:ring-1 focus:ring-pm-accent"
      >
        <CalendarIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pm-text-muted" />
        <span className={value ? "text-pm-text-primary" : "text-pm-text-muted"}>
          {value ? prettyLabel(value) : placeholder}
        </span>
        {value && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              clear();
            }}
            className="ml-2 rounded p-0.5 text-pm-text-muted hover:bg-pm-bg-hover hover:text-pm-text-primary"
            aria-label="Clear deadline"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            className="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-lg border shadow-lg"
            style={{
              borderColor: "var(--color-pm-border)",
              backgroundColor: "var(--color-pm-bg-secondary)",
            }}
          >
            {/* Quick picks */}
            <div
              className="flex flex-wrap gap-1.5 border-b px-3 py-2"
              style={{ borderColor: "var(--color-pm-border)" }}
            >
              {QUICK_PICKS.map((kind) => {
                const ymd = quickPickDate(kind);
                const isActive = ymd === value;
                return (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => pickQuick(kind)}
                    className="rounded-md px-2 py-1 text-[11px] font-medium transition-colors"
                    style={{
                      backgroundColor: isActive
                        ? "var(--color-pm-bg-hover)"
                        : "transparent",
                      color: isActive
                        ? "#D66853"
                        : "var(--color-pm-text-secondary)",
                      border: `1px solid ${
                        isActive ? "#D66853" : "var(--color-pm-border)"
                      }`,
                    }}
                  >
                    {QUICK_PICK_LABELS[kind]}
                  </button>
                );
              })}
            </div>

            {/* Month header */}
            <div className="flex items-center justify-between px-3 py-2">
              <button
                type="button"
                onClick={() => setMonth((m) => addMonths(m, -1))}
                className="rounded p-1 text-pm-text-muted hover:bg-pm-bg-hover hover:text-pm-text-primary"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs font-semibold text-pm-text-primary">
                {format(month, "MMMM yyyy")}
              </span>
              <button
                type="button"
                onClick={() => setMonth((m) => addMonths(m, 1))}
                className="rounded p-1 text-pm-text-muted hover:bg-pm-bg-hover hover:text-pm-text-primary"
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Weekday header */}
            <div
              className="grid grid-cols-7 px-2 pb-1 text-center text-[10px] uppercase tracking-wide"
              style={{ color: "var(--color-pm-text-muted)" }}
            >
              {["S", "M", "T", "W", "T", "F", "S"].map((w, i) => (
                <span key={i}>{w}</span>
              ))}
            </div>

            {/* Day grid */}
            <div className="grid grid-cols-7 gap-0.5 px-2 pb-3">
              {days.map((d, i) => {
                const inMonth = isSameMonth(d, month);
                const isSelected = selected && isSameDay(d, selected);
                const isToday = isSameDay(d, today);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => pickDay(d)}
                    className="flex h-7 items-center justify-center rounded text-[12px] transition-colors"
                    style={{
                      backgroundColor: isSelected
                        ? "#D66853"
                        : isToday
                        ? "var(--color-pm-bg-hover)"
                        : "transparent",
                      color: isSelected
                        ? "#FFFFFF"
                        : inMonth
                        ? "var(--color-pm-text-primary)"
                        : "var(--color-pm-text-muted)",
                      fontWeight: isSelected || isToday ? 600 : 400,
                      border:
                        isToday && !isSelected
                          ? "1px solid var(--color-pm-border-hover)"
                          : "1px solid transparent",
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected)
                        (e.currentTarget as HTMLElement).style.backgroundColor =
                          "var(--color-pm-bg-hover)";
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected)
                        (e.currentTarget as HTMLElement).style.backgroundColor =
                          isToday
                            ? "var(--color-pm-bg-hover)"
                            : "transparent";
                    }}
                  >
                    {format(d, "d")}
                  </button>
                );
              })}
            </div>

            {/* Footer */}
            {value && (
              <div
                className="flex justify-end border-t px-3 py-2"
                style={{ borderColor: "var(--color-pm-border)" }}
              >
                <button
                  type="button"
                  onClick={clear}
                  className="text-[11px] font-medium text-pm-text-muted hover:text-pm-danger"
                >
                  Clear
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
