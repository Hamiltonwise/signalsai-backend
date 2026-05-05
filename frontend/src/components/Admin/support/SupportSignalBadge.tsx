import type {
  SupportTicketPriority,
  SupportTicketSeverity,
  SupportTicketStatus,
} from "../../../api/support";
import { getSignalMeta } from "./supportTriageMeta";
import type { SupportSignalKind, SupportSignalMeta } from "./supportTriageMeta";

export type SupportSignalBadgeProps = {
  kind: SupportSignalKind;
  value: SupportTicketStatus | SupportTicketSeverity | SupportTicketPriority;
  compact?: boolean;
};

export function SupportSignalBadge({
  kind,
  value,
  compact = false,
}: SupportSignalBadgeProps) {
  const meta = getSignalMeta(kind, value);
  if (!meta) return null;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border font-semibold ${meta.badgeClass} ${
        compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]"
      }`}
    >
      <SupportSignalShape meta={meta} />
      {meta.label}
    </span>
  );
}

export function SupportSignalShape({ meta }: { meta: SupportSignalMeta }) {
  return (
    <span
      className={`h-2 w-2 shrink-0 ${meta.dotClass} ${
        meta.shape === "circle" ? "rounded-full" : ""
      } ${meta.shape === "diamond" ? "rotate-45 rounded-[2px]" : ""} ${
        meta.shape === "square" ? "rounded-[2px]" : ""
      }`}
    />
  );
}
