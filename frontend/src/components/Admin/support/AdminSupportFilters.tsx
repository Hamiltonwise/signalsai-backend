import { Search } from "lucide-react";
import type {
  SupportTicketStatus,
  SupportTicketType,
} from "../../../api/support";

export type AdminSupportFiltersValue = {
  q: string;
  status: SupportTicketStatus | "open" | "";
  type: SupportTicketType | "";
};

export type AdminSupportFiltersProps = {
  value: AdminSupportFiltersValue;
  onChange: (value: AdminSupportFiltersValue) => void;
};

export function AdminSupportFilters({
  value,
  onChange,
}: AdminSupportFiltersProps) {
  return (
    <div className="grid gap-3 rounded-2xl border border-[#EDE5C0] bg-[#FCFAED] p-4 shadow-premium lg:grid-cols-[1fr_180px_180px]">
      <label className="relative">
        <span className="sr-only">Search tickets</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={value.q}
          onChange={(event) => onChange({ ...value, q: event.target.value })}
          placeholder="Search client, ticket, title, or email"
          className="w-full rounded-xl border border-[#EDE5C0] bg-white py-3 pl-10 pr-4 text-sm font-semibold text-alloro-navy placeholder:text-slate-300 focus:outline-none focus:ring-4 focus:ring-alloro-orange/20"
        />
      </label>
      <select
        value={value.status}
        onChange={(event) =>
          onChange({
            ...value,
            status: event.target.value as AdminSupportFiltersValue["status"],
          })
        }
        className="rounded-xl border border-[#EDE5C0] bg-white px-4 py-3 text-sm font-bold text-alloro-navy focus:outline-none focus:ring-4 focus:ring-alloro-orange/20"
      >
        <option value="open">Open tickets</option>
        <option value="">All statuses</option>
        <option value="new">New</option>
        <option value="triaged">Triaged</option>
        <option value="in_progress">In progress</option>
        <option value="waiting_on_client">Waiting on client</option>
        <option value="resolved">Resolved</option>
        <option value="wont_fix">Closed</option>
      </select>
      <select
        value={value.type}
        onChange={(event) =>
          onChange({
            ...value,
            type: event.target.value as AdminSupportFiltersValue["type"],
          })
        }
        className="rounded-xl border border-[#EDE5C0] bg-white px-4 py-3 text-sm font-bold text-alloro-navy focus:outline-none focus:ring-4 focus:ring-alloro-orange/20"
      >
        <option value="">All types</option>
        <option value="bug_report">Bug reports</option>
        <option value="feature_request">Feature requests</option>
        <option value="website_edit">Website edits</option>
      </select>
    </div>
  );
}
