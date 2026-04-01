/**
 * Competitor Comparison Card
 *
 * Side-by-side comparison showing the business owner vs. a competitor.
 * Color-coded: green where you lead, red where you trail, amber where close.
 */

import { Star, MessageSquare, Camera, Clock, Trash2 } from "lucide-react";

interface CompetitorData {
  placeId: string;
  name: string;
  rating: number;
  reviewCount: number;
  photoCount: number;
  lastReviewRelative: string | null;
  address: string | null;
}

interface CompetitorComparisonProps {
  competitor: CompetitorData;
  clientRating: number;
  clientReviews: number;
  clientPhotos: number;
  clientLastReviewDays: number | null;
  onRemove?: (placeId: string) => void;
}

type Status = "lead" | "trail" | "close" | "neutral";

function getStatus(yours: number, theirs: number, tolerance: number = 0): Status {
  if (yours === 0 && theirs === 0) return "neutral";
  const diff = yours - theirs;
  if (Math.abs(diff) <= tolerance) return "close";
  return diff > 0 ? "lead" : "trail";
}

const statusColors: Record<Status, string> = {
  lead: "text-green-600",
  trail: "text-red-600",
  close: "text-amber-600",
  neutral: "text-slate-400",
};

const statusBg: Record<Status, string> = {
  lead: "bg-green-50",
  trail: "bg-red-50",
  close: "bg-amber-50",
  neutral: "bg-slate-50",
};

function StatusBadge({ status }: { status: Status }) {
  if (status === "neutral") return null;
  const labels: Record<Status, string> = {
    lead: "you lead",
    trail: "gap",
    close: "close",
    neutral: "",
  };
  return (
    <span className={`text-[9px] font-bold uppercase tracking-wider ${statusColors[status]} ${statusBg[status]} px-1.5 py-0.5 rounded`}>
      {labels[status]}
    </span>
  );
}

function parseRelativeToApproxDays(relative: string | null): number | null {
  if (!relative) return null;
  const lower = relative.toLowerCase();
  if (lower.includes("hour") || lower.includes("minute") || lower === "just now") return 0;
  if (lower.includes("yesterday")) return 1;
  const dayMatch = lower.match(/(\d+)\s*day/);
  if (dayMatch) return parseInt(dayMatch[1], 10);
  if (lower.includes("a week")) return 7;
  const weekMatch = lower.match(/(\d+)\s*week/);
  if (weekMatch) return parseInt(weekMatch[1], 10) * 7;
  if (lower.includes("a month")) return 30;
  const monthMatch = lower.match(/(\d+)\s*month/);
  if (monthMatch) return parseInt(monthMatch[1], 10) * 30;
  if (lower.includes("a year")) return 365;
  const yearMatch = lower.match(/(\d+)\s*year/);
  if (yearMatch) return parseInt(yearMatch[1], 10) * 365;
  return null;
}

export default function CompetitorComparison({
  competitor,
  clientRating,
  clientReviews,
  clientPhotos,
  clientLastReviewDays,
  onRemove,
}: CompetitorComparisonProps) {
  const compDaysAgo = parseRelativeToApproxDays(competitor.lastReviewRelative);

  const rows: Array<{
    icon: React.ReactNode;
    label: string;
    yours: string;
    theirs: string;
    status: Status;
    detail?: string;
  }> = [
    {
      icon: <Star size={14} />,
      label: "Rating",
      yours: clientRating > 0 ? `${clientRating.toFixed(1)}` : "N/A",
      theirs: competitor.rating > 0 ? `${competitor.rating.toFixed(1)}` : "N/A",
      status: clientRating > 0 && competitor.rating > 0
        ? getStatus(clientRating, competitor.rating, 0.1)
        : "neutral",
    },
    {
      icon: <MessageSquare size={14} />,
      label: "Reviews",
      yours: clientReviews.toLocaleString(),
      theirs: competitor.reviewCount.toLocaleString(),
      status: getStatus(clientReviews, competitor.reviewCount, 5),
      detail: clientReviews < competitor.reviewCount
        ? `gap: ${(competitor.reviewCount - clientReviews).toLocaleString()}`
        : clientReviews > competitor.reviewCount
          ? `+${(clientReviews - competitor.reviewCount).toLocaleString()}`
          : undefined,
    },
    {
      icon: <Camera size={14} />,
      label: "Photos",
      yours: clientPhotos > 0 ? `${clientPhotos}` : "?",
      theirs: competitor.photoCount > 0 ? `${competitor.photoCount}` : "?",
      status: clientPhotos > 0 && competitor.photoCount > 0
        ? getStatus(clientPhotos, competitor.photoCount, 1)
        : "neutral",
    },
    {
      icon: <Clock size={14} />,
      label: "Last review",
      yours: clientLastReviewDays != null
        ? clientLastReviewDays === 0
          ? "today"
          : `${clientLastReviewDays}d ago`
        : "?",
      theirs: competitor.lastReviewRelative || "?",
      status: clientLastReviewDays != null && compDaysAgo != null
        ? getStatus(compDaysAgo, clientLastReviewDays, 3) // Lower days = better, so reverse
        : "neutral",
    },
  ];

  return (
    <div className="bg-white border border-black/5 rounded-2xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#212D40]/40">
            vs. Competitor
          </p>
          <p className="text-sm font-bold text-[#212D40] truncate mt-0.5">
            {competitor.name}
          </p>
          {competitor.address && (
            <p className="text-[10px] text-[#212D40]/40 truncate">
              {competitor.address}
            </p>
          )}
        </div>
        {onRemove && (
          <button
            onClick={() => onRemove(competitor.placeId)}
            className="p-1.5 text-slate-300 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50 cursor-pointer"
            aria-label="Remove competitor"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {/* Comparison Table */}
      <div className="px-5 pb-4">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-[9px] font-bold uppercase tracking-wider text-[#212D40]/30 pb-2 pr-2">Metric</th>
              <th className="text-[9px] font-bold uppercase tracking-wider text-[#212D40]/30 pb-2 text-center">You</th>
              <th className="text-[9px] font-bold uppercase tracking-wider text-[#212D40]/30 pb-2 text-center">Them</th>
              <th className="pb-2 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-slate-50 last:border-0">
                <td className="py-2.5 pr-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">{row.icon}</span>
                    <span className="text-xs text-[#212D40]/70 font-medium">
                      {row.label}
                    </span>
                  </div>
                </td>
                <td className="py-2.5 text-center">
                  <span className="text-xs font-bold text-[#212D40]">
                    {row.yours}
                  </span>
                </td>
                <td className="py-2.5 text-center">
                  <span className="text-xs font-bold text-[#212D40]/60">
                    {row.theirs}
                  </span>
                </td>
                <td className="py-2.5 text-right">
                  <div className="flex flex-col items-end gap-0.5">
                    <StatusBadge status={row.status} />
                    {row.detail && (
                      <span className={`text-[9px] font-medium ${statusColors[row.status]}`}>
                        {row.detail}
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
