import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type {
  AdminSupportTicketUpdatePayload,
  SupportMessageVisibility,
  SupportTicket,
  SupportTicketMessage,
} from "../../../api/support";
import { SupportMessageThread } from "../../support/SupportMessageThread";
import { SupportStatusBadge } from "../../support/SupportStatusBadge";
import { ticketTypeMeta } from "../../support/supportMeta";
import {
  AdminInput,
  AdminSelect,
  AdminTextarea,
} from "./AdminSupportFormFields";

export type AdminSupportTicketPanelProps = {
  ticket?: SupportTicket;
  messages?: SupportTicketMessage[];
  isLoading: boolean;
  isUpdating: boolean;
  isMessaging: boolean;
  onUpdate: (payload: AdminSupportTicketUpdatePayload) => void;
  onMessage: (body: string, visibility: SupportMessageVisibility) => void;
};

export function AdminSupportTicketPanel({
  ticket,
  messages = [],
  isLoading,
  isUpdating,
  isMessaging,
  onUpdate,
  onMessage,
}: AdminSupportTicketPanelProps) {
  const [form, setForm] = useState<AdminSupportTicketUpdatePayload>({});
  const [message, setMessage] = useState("");
  const [visibility, setVisibility] =
    useState<SupportMessageVisibility>("client_visible");

  useEffect(() => {
    if (!ticket) return;
    setForm({
      status: ticket.status,
      severity: ticket.severity,
      priority: ticket.priority,
      category: ticket.category || "",
      assignedToUserId: ticket.assignedToUserId || null,
      targetSprint: ticket.targetSprint || "",
      internalNotes: ticket.internalNotes || "",
      resolutionNotes: ticket.resolutionNotes || "",
    });
  }, [ticket]);

  const handleUpdate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onUpdate(form);
  };

  const handleMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!message.trim()) return;
    onMessage(message.trim(), visibility);
    setMessage("");
  };

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-[#EDE5C0] bg-[#FCFAED] p-6 shadow-premium">
        <div className="h-8 w-64 animate-pulse rounded bg-slate-200" />
        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-20 animate-pulse rounded-xl bg-white/70" />
          ))}
        </div>
      </section>
    );
  }

  if (!ticket) {
    return (
      <section className="flex min-h-[620px] items-center justify-center rounded-2xl border border-[#EDE5C0] bg-[#FCFAED] p-8 text-center shadow-premium">
        <p className="max-w-sm text-sm font-semibold leading-6 text-slate-500">
          Select a support ticket to triage status, reply to the client, or add
          internal notes.
        </p>
      </section>
    );
  }

  const type = ticketTypeMeta[ticket.type];

  return (
    <section className="rounded-2xl border border-[#EDE5C0] bg-[#FCFAED] p-5 shadow-premium lg:p-7">
      <div className="mb-6 flex flex-col gap-4 border-b border-[#EDE5C0] pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
            {ticket.publicId} - {type.label}
          </p>
          <h2 className="mt-1 font-display text-3xl font-medium leading-tight text-alloro-navy">
            {ticket.title}
          </h2>
          <p className="mt-2 text-sm font-semibold text-slate-500">
            {ticket.organizationName || "Client"} - {ticket.createdByEmail}
          </p>
        </div>
        <SupportStatusBadge status={ticket.status} />
      </div>

      <form onSubmit={handleUpdate} className="grid gap-4 lg:grid-cols-3">
        <AdminSelect label="Status" value={form.status || "new"} onChange={(status) => setForm({ ...form, status: status as AdminSupportTicketUpdatePayload["status"] })}>
          <option value="new">New</option>
          <option value="triaged">Triaged</option>
          <option value="in_progress">In progress</option>
          <option value="waiting_on_client">Waiting on client</option>
          <option value="resolved">Resolved</option>
          <option value="wont_fix">Closed</option>
        </AdminSelect>
        <AdminSelect label="Severity" value={form.severity || "medium"} onChange={(severity) => setForm({ ...form, severity: severity as AdminSupportTicketUpdatePayload["severity"] })}>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </AdminSelect>
        <AdminSelect label="Priority" value={form.priority || "normal"} onChange={(priority) => setForm({ ...form, priority: priority as AdminSupportTicketUpdatePayload["priority"] })}>
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </AdminSelect>
        <AdminInput label="Category" value={String(form.category || "")} onChange={(category) => setForm({ ...form, category })} />
        <AdminInput label="Target sprint" value={String(form.targetSprint || "")} onChange={(targetSprint) => setForm({ ...form, targetSprint })} />
        <AdminInput label="Assignee user ID" value={form.assignedToUserId ? String(form.assignedToUserId) : ""} onChange={(value) => setForm({ ...form, assignedToUserId: value ? Number(value) : null })} />
        <AdminTextarea label="Internal notes" value={String(form.internalNotes || "")} onChange={(internalNotes) => setForm({ ...form, internalNotes })} />
        <AdminTextarea label="Resolution notes" value={String(form.resolutionNotes || "")} onChange={(resolutionNotes) => setForm({ ...form, resolutionNotes })} />
        <div className="flex items-end">
          <button
            type="submit"
            disabled={isUpdating}
            className="w-full rounded-xl bg-alloro-orange px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-white transition-all hover:scale-[1.02] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isUpdating ? "Saving" : "Save triage"}
          </button>
        </div>
      </form>

      <div className="mt-8 grid gap-5 xl:grid-cols-[1fr_360px]">
        <SupportMessageThread messages={messages} />
        <form onSubmit={handleMessage} className="rounded-xl border border-[#EDE5C0] bg-white p-4">
          <label className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
            Reply
          </label>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={7}
            className="mt-2 w-full resize-none rounded-xl border border-[#EDE5C0] bg-[#FCFAED] px-4 py-3 text-sm font-semibold text-alloro-navy focus:outline-none focus:ring-4 focus:ring-alloro-orange/20"
          />
          <select
            value={visibility}
            onChange={(event) =>
              setVisibility(event.target.value as SupportMessageVisibility)
            }
            className="mt-3 w-full rounded-xl border border-[#EDE5C0] bg-[#FCFAED] px-4 py-3 text-sm font-bold text-alloro-navy"
          >
            <option value="client_visible">Client visible</option>
            <option value="internal">Internal note</option>
          </select>
          <button
            type="submit"
            disabled={isMessaging || !message.trim()}
            className="mt-3 w-full rounded-xl bg-alloro-navy px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-white transition-all hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isMessaging ? "Sending" : "Send message"}
          </button>
        </form>
      </div>
    </section>
  );
}
