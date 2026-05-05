import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Code2,
  Globe2,
  Lightbulb,
  MessageSquare,
  PauseCircle,
  XCircle,
} from "lucide-react";
import type {
  SupportTicketStatus,
  SupportTicketType,
} from "../../api/support";

export const ticketTypeMeta = {
  bug_report: {
    label: "Bug report",
    eyebrow: "Something feels broken",
    icon: Code2,
  },
  feature_request: {
    label: "Feature request",
    eyebrow: "A workflow could be sharper",
    icon: Lightbulb,
  },
  website_edit: {
    label: "Website edit",
    eyebrow: "Change copy, media, or layout",
    icon: Globe2,
  },
} satisfies Record<SupportTicketType, { label: string; eyebrow: string; icon: typeof Code2 }>;

export const statusMeta = {
  new: {
    label: "New",
    icon: MessageSquare,
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
  triaged: {
    label: "Triaged",
    icon: Clock3,
    className: "border-sky-200 bg-sky-50 text-sky-700",
  },
  in_progress: {
    label: "In progress",
    icon: AlertCircle,
    className: "border-alloro-orange/30 bg-alloro-orange/10 text-alloro-orange",
  },
  waiting_on_client: {
    label: "Waiting on you",
    icon: PauseCircle,
    className: "border-violet-200 bg-violet-50 text-violet-700",
  },
  resolved: {
    label: "Resolved",
    icon: CheckCircle2,
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  wont_fix: {
    label: "Closed",
    icon: XCircle,
    className: "border-slate-200 bg-slate-100 text-slate-600",
  },
} satisfies Record<SupportTicketStatus, { label: string; icon: typeof Code2; className: string }>;
