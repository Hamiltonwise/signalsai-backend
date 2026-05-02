import { useQuery } from "@tanstack/react-query";
import { fetchWatching, type WatchingItem } from "@/api/answerEngine";

/**
 * Watching list. Surfaces signal_events that have been observed but
 * not yet routed to a card / regeneration. The doctor sees what Alloro
 * is paying attention to right now.
 */

interface Props {
  practiceId: number;
}

const SIGNAL_LABEL: Record<string, string> = {
  gsc_rank_delta: "Ranking shift",
  gsc_impression_spike: "Search-volume spike",
  gsc_new_query: "New patient query",
  gbp_review_new: "New review",
  gbp_rating_shift: "Rating shift",
  competitor_top10: "Competitor rising",
  aeo_citation_lost: "AI citation lost",
  aeo_citation_new: "AI citation gained",
  aeo_citation_competitor: "Competitor cited by AI",
};

export default function WatchingList({ practiceId }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["answer-engine", "watching", practiceId],
    queryFn: () => fetchWatching(practiceId),
    enabled: practiceId > 0,
  });

  if (isLoading) {
    return (
      <div className="text-xs text-gray-400">
        Alloro is checking what is being watched.
      </div>
    );
  }
  if (isError || !data?.success) {
    if (data?.error === "answer_engine_not_enabled") {
      return null;
    }
    return (
      <div className="text-sm text-gray-500">
        Your watching list is loading. Try refreshing in a moment.
      </div>
    );
  }

  if (data.watching.length === 0) {
    return (
      <div className="rounded-2xl bg-stone-50/80 border border-stone-200/60 p-5 text-sm text-gray-500">
        Nothing currently in the watching queue. New signals will appear here.
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {data.watching.map((w) => (
        <WatchingRow key={w.id} item={w} />
      ))}
    </ul>
  );
}

function WatchingRow({ item }: { item: WatchingItem }) {
  const label = SIGNAL_LABEL[item.signal_type] || "Signal";
  const tone = severityTone(item.severity);
  return (
    <li className="rounded-xl bg-stone-50/80 border border-stone-200/60 p-4">
      <div className="flex items-start gap-3">
        <span className={`shrink-0 mt-1 inline-block w-2 h-2 rounded-full ${tone}`} />
        <div className="flex-1 space-y-1">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-[#1A1D23] font-semibold">{label}</span>
            <span className="text-xs text-gray-400">
              {new Date(item.created_at).toLocaleString()}
            </span>
          </div>
          <p className="text-xs text-gray-500">{summarizeSignalData(item.signal_data)}</p>
        </div>
      </div>
    </li>
  );
}

function severityTone(s: WatchingItem["severity"]): string {
  if (s === "action") return "bg-red-500";
  if (s === "watch") return "bg-amber-400";
  return "bg-stone-400";
}

function summarizeSignalData(d: Record<string, unknown> | null): string {
  if (!d) return "Signal recorded.";
  // Common fields: query, delta, platform, competitor, message.
  const parts: string[] = [];
  if (typeof d.query === "string") parts.push(`Query: ${d.query}.`);
  if (typeof d.platform === "string") parts.push(`Platform: ${d.platform}.`);
  if (typeof d.delta === "number") parts.push(`Change: ${d.delta}.`);
  if (typeof d.competitor === "string") parts.push(`Competitor: ${d.competitor}.`);
  if (typeof d.message === "string") parts.push(d.message);
  return parts.join(" ") || "Signal recorded.";
}
