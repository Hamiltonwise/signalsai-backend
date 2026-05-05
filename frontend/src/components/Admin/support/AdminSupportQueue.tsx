import { Building2 } from "lucide-react";
import type { SupportTicket } from "../../../api/support";
import { SupportStatusBadge } from "../../support/SupportStatusBadge";
import { ticketTypeMeta } from "../../support/supportMeta";

export type AdminSupportGroup = {
  organizationName: string;
  tickets: SupportTicket[];
};

export type AdminSupportQueueProps = {
  groups: AdminSupportGroup[];
  selectedTicketId: string | null;
  isLoading: boolean;
  onSelectTicket: (ticketId: string) => void;
};

export function AdminSupportQueue({
  groups,
  selectedTicketId,
  isLoading,
  onSelectTicket,
}: AdminSupportQueueProps) {
  if (isLoading) {
    return (
      <section className="rounded-2xl border border-[#EDE5C0] bg-[#FCFAED] p-4 shadow-premium">
        <div className="h-6 w-40 animate-pulse rounded bg-slate-200" />
        <div className="mt-5 space-y-3">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="h-28 animate-pulse rounded-xl bg-white/70" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-[#EDE5C0] bg-[#FCFAED] p-4 shadow-premium">
      <div className="mb-4">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-alloro-orange">
          Client queue
        </p>
        <h2 className="font-display text-2xl font-medium text-alloro-navy">
          Support tickets
        </h2>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#EDE5C0] bg-white/70 p-8 text-center">
          <Building2 className="mx-auto h-8 w-8 text-alloro-orange" />
          <p className="mt-3 text-sm font-bold text-slate-500">
            No matching tickets.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <div key={group.organizationName}>
              <div className="mb-2 flex items-center justify-between gap-3 px-1">
                <p className="truncate text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                  {group.organizationName}
                </p>
                <span className="text-xs font-bold text-slate-400">
                  {group.tickets.length}
                </span>
              </div>
              <div className="space-y-2">
                {group.tickets.map((ticket) => {
                  const type = ticketTypeMeta[ticket.type];
                  const isSelected = ticket.id === selectedTicketId;
                  return (
                    <button
                      key={ticket.id}
                      type="button"
                      onClick={() => onSelectTicket(ticket.id)}
                      className={`w-full rounded-xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-alloro-orange/20 ${
                        isSelected
                          ? "border-alloro-orange bg-white"
                          : "border-[#EDE5C0] bg-white/70"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                            {ticket.publicId} - {type.label}
                          </p>
                          <h3 className="mt-1 line-clamp-2 font-display text-lg font-medium leading-tight text-alloro-navy">
                            {ticket.title}
                          </h3>
                        </div>
                        <SupportStatusBadge status={ticket.status} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
