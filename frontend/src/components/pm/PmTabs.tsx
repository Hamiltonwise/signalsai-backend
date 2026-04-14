/**
 * PmTabs — horizontal tab bar with Framer Motion underline and count badges.
 *
 * Built to host the three sections of the TaskDetailPanel (Details /
 * Attachments / Comments). Stateless — the parent owns the active tab.
 */

import { motion } from "framer-motion";

export interface PmTab {
  id: string;
  label: string;
  count?: number;
}

interface PmTabsProps {
  tabs: PmTab[];
  activeId: string;
  onChange: (id: string) => void;
  /** Stable id used for the shared-layout underline animation */
  layoutId?: string;
}

export function PmTabs({
  tabs,
  activeId,
  onChange,
  layoutId = "pm-tabs-underline",
}: PmTabsProps) {
  return (
    <div
      role="tablist"
      className="flex items-center gap-1 border-b"
      style={{ borderColor: "var(--color-pm-border)" }}
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className="relative flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium transition-colors"
            style={{
              color: active
                ? "var(--color-pm-text-primary)"
                : "var(--color-pm-text-muted)",
            }}
          >
            {tab.label}
            {typeof tab.count === "number" && tab.count > 0 && (
              <span
                className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums"
                style={{
                  backgroundColor: active
                    ? "#D66853"
                    : "var(--color-pm-bg-hover)",
                  color: active
                    ? "#FFFFFF"
                    : "var(--color-pm-text-secondary)",
                }}
              >
                {tab.count}
              </span>
            )}
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute bottom-[-1px] left-0 right-0 h-[2px]"
                style={{ backgroundColor: "#D66853" }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
