import { Search } from "lucide-react";
import type { AdminOrganization } from "../../../api/admin-organizations";
import type {
  SupportTicketStatus,
  SupportTicketType,
} from "../../../api/support";
import { SupportAnimatedSelect } from "./SupportAnimatedSelect";
import { getSignalMeta, statusOptions } from "./supportTriageMeta";

export type AdminSupportFiltersValue = {
  q: string;
  status: SupportTicketStatus | "open" | "";
  type: SupportTicketType | "";
  organizationId: number | "";
};

export type AdminSupportFiltersProps = {
  value: AdminSupportFiltersValue;
  organizations: AdminOrganization[];
  onChange: (value: AdminSupportFiltersValue) => void;
};

export function AdminSupportFilters({
  value,
  organizations,
  onChange,
}: AdminSupportFiltersProps) {
  const clientOptions = [
    { value: "" as const, label: "All clients" },
    ...organizations.map((organization) => ({
      value: organization.id,
      label: organization.name,
      hint: organization.domain || undefined,
    })),
  ];

  const typedStatusOptions = statusOptions.map((option) => ({
    ...option,
    meta:
      option.value && option.value !== "open"
        ? getSignalMeta("status", option.value)
        : undefined,
  }));

  return (
    <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_1px_3px_rgba(0,0,0,0.05)] lg:grid-cols-[minmax(0,1fr)_220px_180px_170px]">
      <label className="relative">
        <span className="sr-only">Search</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={value.q}
          onChange={(event) => onChange({ ...value, q: event.target.value })}
          placeholder="Client, title, email, or ID"
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3.5 text-[13px] font-medium text-alloro-navy placeholder:text-slate-400 focus:border-alloro-orange focus:outline-none focus:ring-4 focus:ring-alloro-orange/15"
        />
      </label>

      <SupportAnimatedSelect
        value={value.organizationId}
        options={clientOptions}
        onChange={(organizationId) => onChange({ ...value, organizationId })}
        placeholder="All clients"
        ariaLabel="Client filter"
      />

      <SupportAnimatedSelect
        value={value.status}
        options={typedStatusOptions}
        onChange={(status) =>
          onChange({
            ...value,
            status,
          })
        }
        placeholder="Open tickets"
        ariaLabel="Status filter"
      />

      <SupportAnimatedSelect
        value={value.type}
        options={[
          { value: "", label: "All types" },
          { value: "bug_report", label: "Bug reports" },
          { value: "feature_request", label: "Feature requests" },
          { value: "website_edit", label: "Website edits" },
        ]}
        onChange={(type) =>
          onChange({
            ...value,
            type,
          })
        }
        placeholder="All types"
        ariaLabel="Ticket type filter"
      />
    </div>
  );
}
