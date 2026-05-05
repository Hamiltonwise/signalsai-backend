import type { SupportTicketType } from "../../api/support";
import { ticketTypeMeta } from "./supportMeta";

export type SupportTypeSelectorProps = {
  value: SupportTicketType;
  onChange: (value: SupportTicketType) => void;
};

const ticketTypes: SupportTicketType[] = [
  "bug_report",
  "feature_request",
  "website_edit",
];

export function SupportTypeSelector({
  value,
  onChange,
}: SupportTypeSelectorProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {ticketTypes.map((type) => {
        const meta = ticketTypeMeta[type];
        const Icon = meta.icon;
        const isActive = value === type;
        return (
          <button
            key={type}
            type="button"
            onClick={() => onChange(type)}
            className={`rounded-xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-alloro-orange/20 ${
              isActive
                ? "border-alloro-orange bg-white shadow-lg shadow-alloro-orange/10"
                : "border-[#EDE5C0] bg-white/60 hover:bg-white"
            }`}
          >
            <Icon className="h-5 w-5 text-alloro-orange" />
            <p className="mt-3 font-display text-lg font-medium leading-none text-alloro-navy">
              {meta.label}
            </p>
            <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
              {meta.eyebrow}
            </p>
          </button>
        );
      })}
    </div>
  );
}
