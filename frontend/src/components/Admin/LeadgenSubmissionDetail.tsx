/**
 * LeadgenSubmissionDetail
 *
 * Right-side slide-in drawer for a single leadgen session. Hand-rolled using
 * framer-motion AnimatePresence (no existing drawer component in this repo).
 * Fetches full detail via getSubmission() on open, shows session summary,
 * event timeline, and a compact audit snapshot.
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Mail,
  Globe,
  Building2,
  Clock,
  FileText,
  Activity,
  CheckCircle2,
  AlertOctagon,
  MousePointerClick,
  Eye,
  ShieldQuestion,
  Rocket,
  Trash2,
  UserPlus,
  Calendar,
  AlertCircle,
  MousePointer,
  Link2,
} from "lucide-react";
import { deleteSubmission, getSubmission } from "../../api/leadgenSubmissions";
import { useConfirm } from "../ui/ConfirmModal";
import type {
  FinalStage,
  LeadgenEventName,
  SubmissionDetail,
  LeadgenEvent,
} from "../../types/leadgen";
import { STAGE_LABEL, STAGE_TONE, STAGE_CLASSES } from "./LeadgenSubmissionsTable";

interface Props {
  submissionId: string | null;
  onClose: () => void;
  onDeleted?: () => void;
}

const EVENT_ICONS: Partial<Record<LeadgenEventName, typeof Mail>> = {
  landed: MousePointerClick,
  input_started: MousePointerClick,
  input_submitted: FileText,
  audit_started: Rocket,
  stage_viewed_1: Eye,
  stage_viewed_2: Eye,
  stage_viewed_3: Eye,
  stage_viewed_4: Eye,
  stage_viewed_5: Eye,
  email_gate_shown: ShieldQuestion,
  email_submitted: Mail,
  results_viewed: CheckCircle2,
  account_created: UserPlus,
  abandoned: AlertOctagon,
  // CTA / interaction events — do not advance final_stage, enrich timeline only.
  cta_clicked_strategy_call: Calendar,
  cta_clicked_create_account: UserPlus,
  email_field_focused: MousePointer,
  email_field_blurred_empty: AlertCircle,
};

/**
 * Human label map for events that are NOT in `STAGE_LABEL` (i.e. CTA /
 * interaction events). For real funnel stages we fall back to `STAGE_LABEL`.
 */
const CTA_EVENT_LABEL: Record<string, string> = {
  cta_clicked_strategy_call: "Clicked 'Book Strategy Call'",
  cta_clicked_create_account: "Clicked 'Create Account'",
  email_field_focused: "Focused email field",
  email_field_blurred_empty: "Left email field empty",
};

function eventLabel(name: LeadgenEventName): string {
  return (
    (STAGE_LABEL as Record<string, string>)[name] ??
    CTA_EVENT_LABEL[name] ??
    name
  );
}

function formatAbsolute(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatRelative(iso: string, referenceIso?: string): string {
  try {
    const then = new Date(iso).getTime();
    const now = referenceIso ? new Date(referenceIso).getTime() : Date.now();
    const diffSec = Math.max(0, Math.round((now - then) / 1000));
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.round(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.round(diffMin / 60);
    if (diffHr < 48) return `${diffHr}h ago`;
    const diffDay = Math.round(diffHr / 24);
    return `${diffDay}d ago`;
  } catch {
    return "";
  }
}

function StagePillInline({ stage }: { stage: FinalStage }) {
  const tone = STAGE_TONE[stage] ?? "gray";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${STAGE_CLASSES[tone]}`}
    >
      {STAGE_LABEL[stage] ?? stage}
    </span>
  );
}

export default function LeadgenSubmissionDetail({
  submissionId,
  onClose,
  onDeleted,
}: Props) {
  const [detail, setDetail] = useState<SubmissionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const confirm = useConfirm();

  const handleDelete = async () => {
    if (!submissionId) return;
    const ok = await confirm({
      title: "Delete session",
      message:
        "Delete this session and all its events? This cannot be undone.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    try {
      setDeleting(true);
      await deleteSubmission(submissionId);
      onDeleted?.();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to delete submission";
      setError(msg);
    } finally {
      setDeleting(false);
    }
  };

  // Fetch when opened
  useEffect(() => {
    if (!submissionId) {
      setDetail(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getSubmission(submissionId)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const msg =
            err instanceof Error ? err.message : "Failed to load submission";
          setError(msg);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [submissionId]);

  // ESC to close
  useEffect(() => {
    if (!submissionId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [submissionId, onClose]);

  const isOpen = !!submissionId;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.aside
            key="drawer"
            className="fixed top-0 right-0 z-50 h-full w-full max-w-xl bg-white shadow-2xl overflow-y-auto"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white/95 backdrop-blur px-6 py-4">
              <h2 className="text-base font-bold text-alloro-navy">
                Submission detail
              </h2>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleDelete}
                  disabled={deleting || !detail}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 hover:border-red-200 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
                  title="Delete session"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {deleting ? "Deleting..." : "Delete"}
                </button>
                <button
                  onClick={onClose}
                  className="rounded-lg p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="px-6 py-5 space-y-6">
              {loading && (
                <div className="space-y-3">
                  <div className="h-24 animate-pulse rounded-xl bg-gray-100" />
                  <div className="h-40 animate-pulse rounded-xl bg-gray-100" />
                </div>
              )}

              {!loading && error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  {error}
                </div>
              )}

              {!loading && !error && detail && (
                <>
                  <SummaryCard detail={detail} />
                  <EventTimeline
                    events={detail.events}
                    anchorIso={detail.session.last_seen_at}
                  />
                  {detail.audit && <AuditSnapshot audit={detail.audit} />}
                </>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function SummaryCard({ detail }: { detail: SubmissionDetail }) {
  const s = detail.session;
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-gray-400 shrink-0" />
            <p className="text-sm font-semibold text-gray-900 truncate">
              {s.email || (
                <span className="italic text-gray-400">anonymous</span>
              )}
            </p>
          </div>
          <div className="mt-1 flex items-center gap-2 text-sm text-gray-600">
            <Globe className="h-4 w-4 text-gray-400" />
            <span>{s.domain || "—"}</span>
          </div>
          {s.practice_search_string && (
            <div className="mt-1 flex items-center gap-2 text-sm text-gray-600">
              <Building2 className="h-4 w-4 text-gray-400" />
              <span className="truncate">{s.practice_search_string}</span>
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <StagePillInline stage={s.final_stage} />
          {s.completed && (
            <span className="inline-flex items-center gap-1 rounded-md bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
              <CheckCircle2 className="h-3 w-3" /> completed
            </span>
          )}
          {s.abandoned && (
            <span className="inline-flex items-center gap-1 rounded-md bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
              <AlertOctagon className="h-3 w-3" /> abandoned
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-gray-500">
        <div className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          <span>First: {formatAbsolute(s.first_seen_at)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          <span>Last: {formatAbsolute(s.last_seen_at)}</span>
        </div>
      </div>

      {s.audit_id && (
        <div className="mt-3 text-xs text-gray-500 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-gray-600">Audit:</span>
            <code className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-700 break-all">
              {s.audit_id}
            </code>
            <a
              href={`https://audit.getalloro.com?audit_id=${encodeURIComponent(s.audit_id)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-semibold text-alloro-orange hover:underline"
            >
              Open report ↗
            </a>
          </div>
        </div>
      )}
      {(s.user_agent || s.browser || s.os || s.device_type) && (
        <div className="mt-2 text-xs text-gray-500">
          <span className="font-medium text-gray-600">Device:</span>{" "}
          <span className="break-words">{friendlyDeviceLabel(s)}</span>
        </div>
      )}

      <SourceBlock session={s} />
    </section>
  );
}

/**
 * Prefer the parsed browser/os/device_type triple (populated by the tracking
 * controller from `user-agent` on ingest) over the raw user-agent string.
 * Falls back to the raw UA when parsed fields are missing (legacy rows).
 */
function friendlyDeviceLabel(s: SubmissionDetail["session"]): string {
  const parts: string[] = [];
  if (s.browser) parts.push(s.browser);
  if (s.os) parts.push(s.os);
  if (s.device_type) parts.push(s.device_type);
  if (parts.length > 0) return parts.join(" · ");
  return s.user_agent ?? "—";
}

/**
 * "Source" block — referrer + UTM breakdown. Hidden entirely when every
 * source field is null (most direct-traffic sessions). Referrer is
 * displayed as its hostname to avoid swallowing the panel with long URLs.
 */
function SourceBlock({ session: s }: { session: SubmissionDetail["session"] }) {
  const hasAny =
    s.referrer ||
    s.utm_source ||
    s.utm_medium ||
    s.utm_campaign ||
    s.utm_term ||
    s.utm_content;
  if (!hasAny) return null;

  const referrerDomain = (() => {
    if (!s.referrer) return null;
    try {
      return new URL(s.referrer).hostname;
    } catch {
      return s.referrer;
    }
  })();

  const rows: Array<[string, string]> = [];
  if (referrerDomain)
    rows.push(["Referrer", referrerDomain]);
  if (s.utm_source) rows.push(["UTM source", s.utm_source]);
  if (s.utm_medium) rows.push(["UTM medium", s.utm_medium]);
  if (s.utm_campaign) rows.push(["UTM campaign", s.utm_campaign]);
  if (s.utm_term) rows.push(["UTM term", s.utm_term]);
  if (s.utm_content) rows.push(["UTM content", s.utm_content]);

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <div className="flex items-center gap-1.5 mb-1.5 text-xs font-medium text-gray-600">
        <Link2 className="h-3.5 w-3.5" />
        <span>Source</span>
      </div>
      <dl className="text-xs text-gray-500 space-y-1">
        {rows.map(([label, value]) => (
          <div key={label} className="flex gap-2">
            <dt className="font-medium text-gray-600 shrink-0">{label}:</dt>
            <dd
              className="break-all"
              title={label === "Referrer" && s.referrer ? s.referrer : undefined}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function EventTimeline({
  events,
  anchorIso,
}: {
  events: LeadgenEvent[];
  anchorIso: string;
}) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <Activity className="h-4 w-4 text-gray-500" />
        <h3 className="text-sm font-semibold text-gray-900">Event timeline</h3>
        <span className="ml-1 text-xs text-gray-400">
          {events.length} event{events.length === 1 ? "" : "s"}
        </span>
      </div>

      {events.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">
          No events recorded for this session.
        </div>
      ) : (
        <ol className="relative border-l border-gray-200 pl-5 space-y-4">
          {events.map((ev) => {
            const Icon = EVENT_ICONS[ev.event_name] ?? Activity;
            // CTA events have no funnel tone — fall back to gray.
            const tone =
              (STAGE_TONE as Record<string, "green" | "blue" | "red" | "amber" | "gray">)[
                ev.event_name
              ] ?? "gray";
            const toneClass = STAGE_CLASSES[tone];
            return (
              <li key={ev.id} className="relative">
                <span
                  className={`absolute -left-[30px] top-0.5 flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-white ${toneClass}`}
                >
                  <Icon className="h-3 w-3" />
                </span>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-medium text-gray-800">
                    {eventLabel(ev.event_name)}
                  </p>
                  <span
                    className="text-xs text-gray-400 shrink-0"
                    title={formatAbsolute(ev.created_at)}
                  >
                    {formatRelative(ev.created_at, anchorIso)}
                  </span>
                </div>
                {ev.event_data && Object.keys(ev.event_data).length > 0 && (
                  <pre className="mt-1.5 overflow-x-auto rounded-md bg-gray-50 p-2 text-[11px] text-gray-600 border border-gray-100">
                    {JSON.stringify(ev.event_data, null, 2)}
                  </pre>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function AuditSnapshot({
  audit,
}: {
  audit: NonNullable<SubmissionDetail["audit"]>;
}) {
  // Compact snapshot — show status + any scalar scores we can surface from
  // known step objects. Fall back to a read-only JSON viewer for anything
  // else so power users can still inspect.
  const websiteScore = pickScore(audit.step_website_analysis, [
    "overall_score",
    "score",
  ]);
  const gbpScore = pickScore(audit.step_gbp_analysis, [
    "gbp_readiness_score",
    "overall_score",
    "score",
  ]);

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <FileText className="h-4 w-4 text-gray-500" />
        <h3 className="text-sm font-semibold text-gray-900">Audit result</h3>
      </div>
      <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Status</span>
          <span className="font-medium text-gray-800">
            {audit.status || "—"}
          </span>
        </div>
        {audit.error_message && (
          <div className="rounded-md bg-red-50 border border-red-200 p-2 text-xs text-red-700">
            {audit.error_message}
          </div>
        )}
        {websiteScore !== null && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Website score</span>
            <span className="font-semibold text-gray-900">{websiteScore}</span>
          </div>
        )}
        {gbpScore !== null && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">GBP readiness</span>
            <span className="font-semibold text-gray-900">{gbpScore}</span>
          </div>
        )}
        <details className="pt-2">
          <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-700">
            Raw payload
          </summary>
          <pre className="mt-2 max-h-96 overflow-auto rounded-md bg-gray-50 p-2 text-[11px] text-gray-600 border border-gray-100">
            {JSON.stringify(audit, null, 2)}
          </pre>
        </details>
      </div>
    </section>
  );
}

function pickScore(source: unknown, keys: string[]): number | string | null {
  if (!source || typeof source !== "object") return null;
  const obj = source as Record<string, unknown>;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" || typeof v === "string") return v;
  }
  return null;
}
