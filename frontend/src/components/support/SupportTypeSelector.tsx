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
    <div className="grid gap-2 sm:grid-cols-3">
      {ticketTypes.map((type) => {
        const meta = ticketTypeMeta[type];
        const Icon = meta.icon;
        const isActive = value === type;
        return (
          <button
            key={type}
            type="button"
            onClick={() => onChange(type)}
            className={`rounded-xl border px-3 py-2.5 text-left transition focus:outline-none focus:ring-4 focus:ring-alloro-orange/15 ${
              isActive
                ? "border-alloro-orange bg-alloro-orange/5 shadow-[0_6px_18px_rgba(214,104,83,0.10)]"
                : "border-slate-200 bg-white hover:border-slate-300"
            }`}
          >
            <div className="flex items-center gap-2">
              <Icon className="h-4 w-4 text-alloro-orange" />
              <p className="text-[13px] font-semibold leading-none text-alloro-navy">
                {meta.label}
              </p>
            </div>
            <p className="mt-1.5 text-[11px] font-medium leading-4 text-slate-500">
              {meta.eyebrow}
            </p>
          </button>
        );
      })}
    </div>
  );
}
