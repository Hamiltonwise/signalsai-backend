/**
 * Monday Email HQ -- Command Center for Monday Brief Emails
 *
 * Lets Corey review every Monday email before it sends.
 * Shows all orgs with their Oz Moment hero, readings, hold status,
 * and links to full HTML preview.
 *
 * Route: /hq/monday-emails
 * API: GET /api/admin/monday-preview
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/api/index";
import {
  Mail,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Shield,
  Pause,
  Search,
} from "lucide-react";

// ---- Types ------------------------------------------------------------------

interface Reading {
  label: string;
  value: string;
  context: string;
  status: "healthy" | "attention" | "critical";
}

interface OzMoment {
  headline: string;
  context: string;
  status: "healthy" | "attention" | "critical";
  verifyUrl: string | null;
  surprise: number;
  actionText: string | null;
  actionUrl: string | null;
  signalType: string;
}

interface EmailPreview {
  orgId: number;
  orgName: string;
  ownerName: string;
  ownerEmail: string;
  ozMoment: OzMoment | null;
  readings: Reading[];
  lastEmailSentAt: string | null;
  subscriptionStatus: string;
  held: boolean;
  holdReason: string | null;
}

interface PreviewResponse {
  previews: EmailPreview[];
  generatedAt: string;
}

// ---- Helpers ----------------------------------------------------------------

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

const statusDot: Record<string, string> = {
  healthy: "bg-emerald-500",
  attention: "bg-amber-400",
  critical: "bg-red-500",
};

const statusRing: Record<string, string> = {
  healthy: "ring-emerald-500/20",
  attention: "ring-amber-400/20",
  critical: "ring-red-500/20",
};

// ---- Components -------------------------------------------------------------

function OzMomentCard({ oz }: { oz: OzMoment }) {
  const borderColor =
    oz.status === "healthy"
      ? "border-emerald-200/60"
      : oz.status === "attention"
        ? "border-amber-200/60"
        : "border-red-200/60";

  return (
    <div className={`rounded-xl border ${borderColor} bg-[#FDF4F2] p-4`}>
      <div className="flex items-center gap-2 mb-2">
        <span
          className={`w-2.5 h-2.5 rounded-full ${statusDot[oz.status]} ring-4 ${statusRing[oz.status]}`}
        />
        <span className="text-xs font-semibold uppercase tracking-wider text-[#1A1D23]/40">
          {oz.signalType.replace(/_/g, " ")}
        </span>
        <span className="text-xs text-[#1A1D23]/30 ml-auto">
          surprise: {oz.surprise}/10
        </span>
      </div>
      <p className="text-sm font-semibold text-[#1A1D23] leading-snug">
        {oz.headline}
      </p>
      <p className="text-xs text-gray-500 mt-1">{oz.context}</p>
    </div>
  );
}

function ReadingsStrip({ readings }: { readings: Reading[] }) {
  if (readings.length === 0) return null;
  return (
    <div className="flex gap-3 mt-3">
      {readings.map((r, i) => (
        <div
          key={i}
          className="flex-1 rounded-lg bg-stone-50/80 border border-stone-200/60 p-3"
        >
          <div className="flex items-center gap-1.5 mb-1">
            <span
              className={`w-2 h-2 rounded-full ${statusDot[r.status]}`}
            />
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              {r.label}
            </span>
          </div>
          <p className="text-sm font-semibold text-[#1A1D23]">{r.value}</p>
          <p className="text-xs text-gray-500 mt-0.5">{r.context}</p>
        </div>
      ))}
    </div>
  );
}

function EmailCard({ preview }: { preview: EmailPreview }) {
  const [expanded, setExpanded] = useState(false);

  const previewUrl = `/api/admin/email-preview/monday-brief/${preview.orgId}`;

  return (
    <div
      className={`rounded-2xl border overflow-hidden transition-colors ${
        preview.held
          ? "border-amber-300/60 bg-amber-50/30"
          : "border-stone-200/60 bg-stone-50/80"
      }`}
    >
      {/* Header row */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-stone-100/50 transition-colors"
      >
        {expanded ? (
          <ChevronDown size={16} className="text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronRight size={16} className="text-gray-400 flex-shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[#1A1D23] truncate">
              {preview.orgName}
            </span>
            {preview.held && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold">
                <Pause size={10} />
                Held
              </span>
            )}
            {preview.subscriptionStatus !== "active" && (
              <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-xs font-semibold">
                {preview.subscriptionStatus}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {preview.ownerName}
            {preview.ownerEmail ? ` (${preview.ownerEmail})` : ""}
          </p>
        </div>

        {/* Right side: Oz signal summary */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {preview.ozMoment ? (
            <span
              className={`w-2.5 h-2.5 rounded-full ${statusDot[preview.ozMoment.status]} ring-4 ${statusRing[preview.ozMoment.status]}`}
            />
          ) : (
            <span className="w-2.5 h-2.5 rounded-full bg-gray-300 ring-4 ring-gray-200/20" />
          )}
          <span className="text-xs text-gray-400">
            {preview.lastEmailSentAt
              ? `Last: ${timeAgo(preview.lastEmailSentAt)}`
              : "Never sent"}
          </span>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-5 pb-5 border-t border-stone-200/40">
          <div className="pt-4">
            {preview.ozMoment ? (
              <OzMomentCard oz={preview.ozMoment} />
            ) : (
              <div className="rounded-xl border border-stone-200/60 bg-[#F0EDE8] p-4">
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1">
                  No Oz Moment
                </p>
                <p className="text-sm text-gray-500">
                  Not enough data for this org yet.
                </p>
              </div>
            )}

            <ReadingsStrip readings={preview.readings} />

            {preview.held && preview.holdReason && (
              <div className="mt-3 flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200/60">
                <AlertTriangle
                  size={14}
                  className="text-amber-500 mt-0.5 flex-shrink-0"
                />
                <p className="text-xs text-amber-700">{preview.holdReason}</p>
              </div>
            )}

            {/* Actions */}
            <div className="mt-4 flex items-center gap-3">
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#D56753] text-white text-xs font-medium hover:brightness-105 transition-all"
              >
                <ExternalLink size={12} />
                Preview Email
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Main Page --------------------------------------------------------------

export default function MondayEmailHQ() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "held" | "active">(
    "all",
  );

  const { data, isLoading, error } = useQuery<PreviewResponse>({
    queryKey: ["monday-email-preview"],
    queryFn: () => apiGet({ path: "/admin/monday-preview" }),
    staleTime: 30_000,
    retry: false,
  });

  const previews = data?.previews ?? [];

  const filtered = previews.filter((p) => {
    if (filterMode === "held" && !p.held) return false;
    if (filterMode === "active" && p.subscriptionStatus !== "active")
      return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return (
        p.orgName.toLowerCase().includes(q) ||
        p.ownerName.toLowerCase().includes(q) ||
        p.ownerEmail.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const heldCount = previews.filter((p) => p.held).length;
  const activeCount = previews.filter(
    (p) => p.subscriptionStatus === "active",
  ).length;
  const withOzCount = previews.filter((p) => p.ozMoment !== null).length;

  return (
    <div className="min-h-screen bg-[#F8F6F2]">
      <div className="max-w-[800px] mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Page header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <Mail size={18} className="text-[#D56753]" />
            <p className="text-xs font-semibold text-[#D56753] uppercase tracking-wider">
              Monday Email HQ
            </p>
          </div>
          <h1 className="text-2xl font-semibold text-[#1A1D23]">
            Monday Brief Preview
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Every Monday email for every org. Review before they send.
          </p>
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-4 mb-6 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Shield size={14} className="text-gray-400" />
            <span className="text-xs text-gray-500">
              {previews.length} orgs
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 size={14} className="text-emerald-500" />
            <span className="text-xs text-gray-500">
              {withOzCount} with Oz
            </span>
          </div>
          {heldCount > 0 && (
            <div className="flex items-center gap-1.5">
              <AlertTriangle size={14} className="text-amber-500" />
              <span className="text-xs text-amber-600 font-semibold">
                {heldCount} held
              </span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <Clock size={14} className="text-gray-400" />
            <span className="text-xs text-gray-400">
              {data?.generatedAt
                ? `Generated ${timeAgo(data.generatedAt)}`
                : "Loading..."}
            </span>
          </div>
        </div>

        {/* Filters + Search */}
        <div className="flex items-center gap-3 mb-6">
          <div className="relative flex-1">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              placeholder="Search org, owner, or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-stone-50/80 border border-stone-200/60 text-sm text-[#1A1D23] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#D56753]/20 focus:border-[#D56753]/40"
            />
          </div>
          <div className="flex rounded-xl border border-stone-200/60 overflow-hidden">
            {(["all", "held", "active"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setFilterMode(mode)}
                className={`px-3 py-2 text-xs font-semibold capitalize transition-colors ${
                  filterMode === mode
                    ? "bg-[#D56753] text-white"
                    : "bg-stone-50/80 text-gray-500 hover:bg-stone-100"
                }`}
              >
                {mode === "all"
                  ? `All (${previews.length})`
                  : mode === "held"
                    ? `Held (${heldCount})`
                    : `Active (${activeCount})`}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="text-center py-16">
            <div className="w-8 h-8 border-2 border-[#D56753]/30 border-t-[#D56753] rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-400">
              Loading email previews...
            </p>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200/60 bg-red-50/30 p-6 text-center">
            <AlertTriangle
              size={24}
              className="text-red-400 mx-auto mb-2"
            />
            <p className="text-sm text-red-600 font-semibold">
              Failed to load previews
            </p>
            <p className="text-xs text-red-400 mt-1">
              {(error as Error).message}
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-stone-200/60 bg-stone-50/80 p-8 text-center">
            <Mail size={24} className="text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">
              {searchTerm
                ? "No orgs match your search."
                : "No emails to preview."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((preview) => (
              <EmailCard key={preview.orgId} preview={preview} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
