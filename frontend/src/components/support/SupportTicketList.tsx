import { LifeBuoy, Plus } from "lucide-react";
import type { SupportTicket } from "../../api/support";
import { SupportStatusBadge } from "./SupportStatusBadge";
import { ticketTypeMeta } from "./supportMeta";

export type SupportTicketListProps = {
  tickets: SupportTicket[];
  selectedTicketId: string | null;
  isLoading: boolean;
  onCreateTicket: () => void;
  onSelectTicket: (ticketId: string) => void;
};

export function SupportTicketList({
  tickets,
  selectedTicketId,
  isLoading,
  onCreateTicket,
  onSelectTicket,
}: SupportTicketListProps) {
  if (isLoading) {
    return (
      <section className="h-fit rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_1px_3px_rgba(0,0,0,0.05)]">
        <div className="h-5 w-32 animate-pulse rounded bg-slate-200" />
        <div className="mt-4 space-y-2.5">
          {[1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-20 animate-pulse rounded-xl bg-slate-100"
            />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="h-fit rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_1px_3px_rgba(0,0,0,0.05)] lg:sticky lg:top-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
            Support
          </p>
          <h2 className="font-display text-[21px] font-normal leading-tight text-alloro-navy">
            Tickets
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-500">
            {tickets.length}
          </span>
          <button
            type="button"
            onClick={onCreateTicket}
            aria-label="Create support ticket"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-alloro-orange text-white shadow-[0_8px_18px_rgba(214,104,83,0.22)] transition hover:brightness-105 focus:outline-none focus:ring-4 focus:ring-alloro-orange/20"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {tickets.length === 0 ? (
        <div className="flex min-h-[260px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center">
          <LifeBuoy className="h-8 w-8 text-alloro-orange" />
          <h3 className="mt-3 font-display text-[20px] font-normal text-alloro-navy">
            No tickets yet
          </h3>
          <p className="mt-2 max-w-xs text-[13px] leading-relaxed text-slate-500">
            Start with a bug report, feature request, or website edit. Replies
            will collect here.
          </p>
          <button
            type="button"
            onClick={onCreateTicket}
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-alloro-orange px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white shadow-[0_8px_18px_rgba(214,104,83,0.22)] transition hover:brightness-105 focus:outline-none focus:ring-4 focus:ring-alloro-orange/20"
          >
            <Plus className="h-4 w-4" />
            New ticket
          </button>
        </div>
      ) : (
        <div className="max-h-[calc(100vh-230px)] space-y-2.5 overflow-y-auto pr-1">
          {tickets.map((ticket) => {
            const type = ticketTypeMeta[ticket.type];
            const isSelected = selectedTicketId === ticket.id;
            return (
              <button
                key={ticket.id}
                type="button"
                onClick={() => onSelectTicket(ticket.id)}
                className={`w-full rounded-xl border p-3 text-left transition hover:border-alloro-orange/60 focus:outline-none focus:ring-4 focus:ring-alloro-orange/15 ${
                  isSelected
                    ? "border-alloro-orange bg-alloro-orange/5"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                      {ticket.publicId} - {type.label}
                    </p>
                    <h3 className="mt-1 line-clamp-2 text-[14px] font-semibold leading-snug text-alloro-navy">
                      {ticket.title}
                    </h3>
                  </div>
                  <SupportStatusBadge status={ticket.status} />
                </div>
                <p className="mt-2 text-xs font-medium text-slate-400">
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
