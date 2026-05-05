import { useState } from "react";
import type { FormEvent } from "react";
import { MessageSquare } from "lucide-react";
import type { SupportTicket, SupportTicketMessage } from "../../api/support";
import { SupportStatusBadge } from "./SupportStatusBadge";
import { SupportMessageThread } from "./SupportMessageThread";
import { ticketTypeMeta } from "./supportMeta";

export type SupportTicketDetailProps = {
  ticket?: SupportTicket;
  messages?: SupportTicketMessage[];
  isLoading: boolean;
  isReplying: boolean;
  onReply: (body: string) => void;
};

export function SupportTicketDetail({
  ticket,
  messages = [],
  isLoading,
  isReplying,
  onReply,
}: SupportTicketDetailProps) {
  const [reply, setReply] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reply.trim()) return;
    onReply(reply.trim());
    setReply("");
  };

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-[#EDE5C0] bg-[#FCFAED] p-6 shadow-premium">
        <div className="h-7 w-48 animate-pulse rounded bg-slate-200" />
        <div className="mt-5 space-y-3">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-24 animate-pulse rounded-xl bg-white/70" />
          ))}
        </div>
      </section>
    );
  }

  if (!ticket) {
    return (
      <section className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-[#EDE5C0] bg-[#FCFAED] p-8 text-center shadow-premium">
        <MessageSquare className="h-10 w-10 text-alloro-orange" />
        <h2 className="mt-4 font-display text-2xl font-medium text-alloro-navy">
          Select a ticket
        </h2>
        <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
          Choose a request from the ledger to see status, replies, and next
          steps.
        </p>
      </section>
    );
  }

  const type = ticketTypeMeta[ticket.type];

  return (
    <section className="rounded-2xl border border-[#EDE5C0] bg-[#FCFAED] p-5 shadow-premium sm:p-7">
      <div className="mb-5 flex flex-col gap-4 border-b border-[#EDE5C0] pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
            {ticket.publicId} - {type.label}
          </p>
          <h2 className="mt-1 font-display text-2xl font-medium leading-tight text-alloro-navy">
            {ticket.title}
          </h2>
          {ticket.resolutionNotes && (
            <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold leading-6 text-emerald-800">
              {ticket.resolutionNotes}
            </p>
          )}
        </div>
        <SupportStatusBadge status={ticket.status} />
      </div>

      <SupportMessageThread messages={messages} />

      {ticket.status !== "resolved" && ticket.status !== "wont_fix" && (
        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <label className="sr-only" htmlFor="support-reply">
            Reply to support
          </label>
          <textarea
            id="support-reply"
            value={reply}
            onChange={(event) => setReply(event.target.value)}
            rows={4}
            placeholder="Add a reply or new detail for the support team."
            className="w-full resize-none rounded-xl border border-[#EDE5C0] bg-white px-4 py-3 text-sm font-semibold text-alloro-navy placeholder:text-slate-300 focus:outline-none focus:ring-4 focus:ring-alloro-orange/20"
          />
          <button
            type="submit"
            disabled={isReplying || !reply.trim()}
            className="rounded-xl bg-alloro-navy px-5 py-2.5 text-xs font-black uppercase tracking-[0.18em] text-white transition-all hover:scale-[1.02] hover:brightness-110 focus:outline-none focus:ring-4 focus:ring-alloro-teal/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isReplying ? "Sending" : "Reply"}
          </button>
        </form>
      )}
    </section>
  );
}
