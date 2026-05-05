import { LifeBuoy } from "lucide-react";
import type { SupportTicket } from "../../api/support";
import { SupportStatusBadge } from "./SupportStatusBadge";
import { ticketTypeMeta } from "./supportMeta";

export type SupportTicketListProps = {
  tickets: SupportTicket[];
  selectedTicketId: string | null;
  isLoading: boolean;
  onSelectTicket: (ticketId: string) => void;
};

export function SupportTicketList({
  tickets,
  selectedTicketId,
  isLoading,
  onSelectTicket,
}: SupportTicketListProps) {
  if (isLoading) {
    return (
      <section className="rounded-2xl border border-[#EDE5C0] bg-[#FCFAED] p-5 shadow-premium">
        <div className="h-5 w-32 animate-pulse rounded bg-slate-200" />
        <div className="mt-5 space-y-3">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-24 animate-pulse rounded-xl bg-white/70" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-[#EDE5C0] bg-[#FCFAED] p-5 shadow-premium">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-alloro-orange">
            Ticket ledger
          </p>
          <h2 className="font-display text-2xl font-medium text-alloro-navy">
            Your requests
          </h2>
        </div>
        <span className="rounded-lg border border-[#EDE5C0] bg-white px-2.5 py-1 text-xs font-bold text-slate-500">
          {tickets.length}
        </span>
      </div>

      {tickets.length === 0 ? (
        <div className="flex min-h-[260px] flex-col items-center justify-center rounded-xl border border-dashed border-[#EDE5C0] bg-white/60 p-8 text-center">
          <LifeBuoy className="h-8 w-8 text-alloro-orange" />
          <h3 className="mt-3 font-display text-xl font-medium text-alloro-navy">
            No tickets yet
          </h3>
          <p className="mt-2 max-w-xs text-sm leading-6 text-slate-500">
            Start with a bug report, feature request, or website edit. New
            replies will collect here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket) => {
            const type = ticketTypeMeta[ticket.type];
            const isSelected = selectedTicketId === ticket.id;
            return (
              <button
                key={ticket.id}
                type="button"
                onClick={() => onSelectTicket(ticket.id)}
                className={`w-full rounded-xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-alloro-orange/20 ${
                  isSelected
                    ? "border-alloro-orange bg-white"
                    : "border-[#EDE5C0] bg-white/70"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                      {ticket.publicId} - {type.label}
                    </p>
                    <h3 className="mt-1 line-clamp-2 font-display text-lg font-medium leading-tight text-alloro-navy">
                      {ticket.title}
                    </h3>
                  </div>
                  <SupportStatusBadge status={ticket.status} />
                </div>
                <p className="mt-3 text-xs font-semibold text-slate-400">
                  Updated {formatDate(ticket.updatedAt)}
                </p>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
