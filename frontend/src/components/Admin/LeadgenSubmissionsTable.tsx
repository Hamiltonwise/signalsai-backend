/**
 * LeadgenSubmissionsTable
 *
 * Admin table listing leadgen sessions. Styled to match the repo's other
 * admin tables (BackupsTab reference) — rounded container, muted uppercase
 * headers, hover row state.
 */

import { useState } from "react";
import { Inbox, Trash2 } from "lucide-react";
import type { FinalStage, SubmissionSummary } from "../../types/leadgen";
import { deleteSubmission } from "../../api/leadgenSubmissions";
import { useConfirm } from "../ui/ConfirmModal";

interface Props {
  items: SubmissionSummary[];
  loading: boolean;
  onRowClick: (id: string) => void;
  onDeleted?: (id: string) => void;
}

type StageTone = "green" | "blue" | "red" | "amber" | "gray";

const STAGE_TONE: Record<FinalStage, StageTone> = {
  results_viewed: "green",
  report_engaged_1min: "green",
  account_created: "green",
  email_submitted: "blue",
  abandoned: "red",
  input_submitted: "amber",
  audit_started: "amber",
  stage_viewed_1: "amber",
  stage_viewed_2: "amber",
  stage_viewed_3: "amber",
  stage_viewed_4: "amber",
  stage_viewed_5: "amber",
  email_gate_shown: "amber",
  landed: "gray",
  input_started: "gray",
};

const STAGE_CLASSES: Record<StageTone, string> = {
  green: "bg-green-100 text-green-700",
  blue: "bg-blue-100 text-blue-700",
  red: "bg-red-100 text-red-700",
  amber: "bg-amber-100 text-amber-700",
  gray: "bg-gray-100 text-gray-600",
};

// Maps enum values to the actual user-facing stage names in the leadgen tool.
// stage_viewed_3 (Photos sub-stage) was dropped when the GBP carousel was
// collapsed to a single page. The value is retained in the FinalStage union
// and this label map so legacy sessions still render correctly in the
// submissions table, but it is NO LONGER rendered as a row in the funnel
// chart (see LeadgenFunnelChart's FUNNEL_STAGES allowlist).
export const STAGE_LABEL: Record<FinalStage, string> = {
  landed: "Landed on Page",
  input_started: "Started Typing Search",
  input_submitted: "Submitted Search",
  audit_started: "Audit Started",
  stage_viewed_1: "Website Scan Viewed",
  stage_viewed_2: "GBP Analysis Viewed",
  stage_viewed_3: "Photos Sub-stage (legacy)",
  stage_viewed_4: "Competitor Map Viewed",
  stage_viewed_5: "Report Viewed",
  results_viewed: "More Results Viewed",
  report_engaged_1min: "Spent 1+ Min on Report",
  email_gate_shown: "Email Gate Shown",
  email_submitted: "Email Submitted",
  account_created: "New Account Created",
  abandoned: "Abandoned",
};

function StagePill({ stage }: { stage: FinalStage }) {
  const tone = STAGE_TONE[stage] ?? "gray";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${STAGE_CLASSES[tone]}`}
    >
      {STAGE_LABEL[stage] ?? stage}
    </span>
  );
}

function AuditStatusPill({ status }: { status: string | null }) {
  if (!status) {
    return <span className="text-xs text-gray-400">—</span>;
  }
  const normalized = status.toLowerCase();
  let tone: StageTone = "gray";
  if (normalized === "completed" || normalized === "complete") tone = "green";
  else if (normalized === "failed" || normalized === "error") tone = "red";
  else if (normalized === "processing" || normalized === "pending") tone = "amber";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${STAGE_CLASSES[tone]}`}
    >
      {status}
    </span>
  );
}

/**
 * Condenses a User-Agent string into a readable "Browser · OS" label.
 * Covers the common cases (Chrome, Safari, Firefox, Edge; iOS, Android,
 * macOS, Windows, Linux). Fallback: truncated UA tail.
 */
export function friendlyUserAgent(ua: string | null | undefined): string | null {
  if (!ua) return null;
  const u = ua.toLowerCase();
  let browser = "Browser";
  if (u.includes("edg/") || u.includes("edge/")) browser = "Edge";
  else if (u.includes("chrome/") && !u.includes("chromium/")) browser = "Chrome";
  else if (u.includes("firefox/")) browser = "Firefox";
  else if (u.includes("safari/") && !u.includes("chrome/")) browser = "Safari";
  else if (u.includes("opera/") || u.includes("opr/")) browser = "Opera";

  let os = "Device";
  if (u.includes("iphone") || u.includes("ipad") || u.includes("ios")) os = "iOS";
  else if (u.includes("android")) os = "Android";
  else if (u.includes("mac os") || u.includes("macintosh")) os = "macOS";
  else if (u.includes("windows")) os = "Windows";
  else if (u.includes("linux")) os = "Linux";

  return `${browser} · ${os}`;
}

export function shortSessionId(id: string): string {
  if (!id) return "";
  return id.slice(0, 8);
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function LeadgenSubmissionsTable({
  items,
  loading,
  onRowClick,
  onDeleted,
}: Props) {
  const confirm = useConfirm();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: "Delete session",
      message:
        "Delete this session and all its events? This cannot be undone.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    try {
      setDeletingId(id);
      await deleteSubmission(id);
      onDeleted?.(id);
    } catch (err) {
      console.error("Failed to delete leadgen submission:", err);
    } finally {
      setDeletingId(null);
    }
  };
  if (loading) {
    return (
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="divide-y divide-gray-50">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 animate-pulse bg-gray-50/60" />
          ))}
        </div>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 py-16">
        <Inbox className="h-10 w-10 text-gray-300" />
        <p className="mt-3 text-sm font-medium text-gray-500">
          No submissions yet.
        </p>
        <p className="mt-1 text-xs text-gray-400">
          Leadgen tool sessions will appear here once events start flowing.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50/50">
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Email
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Domain
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Practice
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Final Stage
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Audit
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              First Seen
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Last Seen
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {items.map((s) => (
            <tr
              key={s.id}
              className="cursor-pointer hover:bg-gray-50/80 transition-colors"
              onClick={() => onRowClick(s.id)}
            >
              <td className="px-4 py-3">
                {s.email ? (
                  <span className="text-sm font-medium text-gray-800">
                    {s.email}
                  </span>
                ) : (
                  <div className="flex flex-col">
                    <span className="text-xs font-medium text-gray-500">
                      {friendlyUserAgent(s.user_agent) ?? "Unknown device"}
                    </span>
                    <span className="text-[10px] font-mono text-gray-400">
                      session {shortSessionId(s.id)}
                    </span>
                  </div>
                )}
              </td>
              <td className="px-4 py-3 text-sm text-gray-600">
                {s.domain || "—"}
              </td>
              <td className="px-4 py-3 text-sm text-gray-600 max-w-[220px] truncate">
                {s.practice_search_string || "—"}
              </td>
              <td className="px-4 py-3">
                <StagePill stage={s.final_stage} />
              </td>
              <td className="px-4 py-3">
                <AuditStatusPill status={s.audit_status} />
              </td>
              <td className="px-4 py-3 text-sm text-gray-600">
                {formatDate(s.first_seen_at)}
              </td>
              <td className="px-4 py-3 text-sm text-gray-600">
                {formatDate(s.last_seen_at)}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(s.id);
                    }}
                    disabled={deletingId === s.id}
                    className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
                    title="Delete session"
                    aria-label="Delete session"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export { STAGE_TONE, STAGE_CLASSES };
