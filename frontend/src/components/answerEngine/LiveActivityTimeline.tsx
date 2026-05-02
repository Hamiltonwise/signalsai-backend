import { useQuery } from "@tanstack/react-query";
import {
  fetchLiveActivity,
  type LiveActivityEntry,
} from "@/api/answerEngine";

/**
 * Live Activity timeline. Renders the last 50 doctor-facing entries
 * grouped by Today / Yesterday / This Week / Earlier.
 */

interface Props {
  practiceId: number;
}

export default function LiveActivityTimeline({ practiceId }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["answer-engine", "live-activity", practiceId],
    queryFn: () => fetchLiveActivity(practiceId),
    enabled: practiceId > 0,
  });

  if (isLoading) {
    return (
      <div className="text-xs text-gray-400">
        Alloro is loading your activity feed.
      </div>
    );
  }
  if (isError || !data?.success) {
    if (data?.error === "answer_engine_not_enabled") {
      return (
        <div className="text-sm text-gray-500">
          The Answer Engine module is not yet active for this practice.
        </div>
      );
    }
    return (
      <div className="text-sm text-gray-500">
        Your activity feed is loading. Try refreshing in a moment.
      </div>
    );
  }

  if (data.entries.length === 0) {
    return (
      <div className="rounded-2xl bg-stone-50/80 border border-stone-200/60 p-5 text-sm text-gray-500">
        Alloro is watching. Your first entry lands when a signal fires or a
        regeneration ships.
      </div>
    );
  }

  const buckets: Array<[string, number[]]> = [
    ["Today", data.grouped.today],
    ["Yesterday", data.grouped.yesterday],
    ["This week", data.grouped.thisWeek],
    ["Earlier", data.grouped.earlier],
  ];

  return (
    <div className="space-y-6">
      {buckets.map(([label, idxs]) =>
        idxs.length === 0 ? null : (
          <div key={label}>
            <div className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">
              {label}
            </div>
            <ul className="space-y-2">
              {idxs.map((i) => {
                const entry = data.entries[i];
                if (!entry) return null;
                return <EntryRow key={entry.id} entry={entry} />;
              })}
            </ul>
          </div>
        ),
      )}
    </div>
  );
}

function EntryRow({ entry }: { entry: LiveActivityEntry }) {
  const tone = toneForEntry(entry.entry_type);
  return (
    <li className="rounded-xl bg-stone-50/80 border border-stone-200/60 p-4">
      <div className="flex items-start gap-3">
        <span
          className={`shrink-0 mt-1 inline-block w-2 h-2 rounded-full ${tone.dot}`}
          aria-hidden="true"
        />
        <div className="space-y-1 flex-1">
          <p className="text-sm text-[#1A1D23]">{entry.doctor_facing_text}</p>
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span className="font-semibold uppercase tracking-wider">
              {tone.label}
            </span>
            <span>{relativeTime(entry.created_at)}</span>
            {entry.entry_data && hasPreviewLink(entry) ? (
              <a
                href={previewUrl(entry)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#D56753] font-semibold hover:underline"
              >
                See the change
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}

function toneForEntry(t: LiveActivityEntry["entry_type"]): {
  dot: string;
  label: string;
} {
  switch (t) {
    case "regeneration_published":
      return { dot: "bg-emerald-500", label: "Update shipped" };
    case "regeneration_held":
      return { dot: "bg-amber-400", label: "Held for review" };
    case "regeneration_attempted":
      return { dot: "bg-stone-400", label: "Updating" };
    case "citation_recovered":
      return { dot: "bg-emerald-500", label: "Citation recovered" };
    case "citation_lost":
      return { dot: "bg-amber-400", label: "Citation lost" };
    case "signal_received":
      return { dot: "bg-stone-400", label: "Signal" };
    case "watching_started":
    default:
      return { dot: "bg-stone-300", label: "Watching" };
  }
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const seconds = Math.max(1, Math.floor((now - then) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function hasPreviewLink(entry: LiveActivityEntry): boolean {
  const d = entry.entry_data;
  if (!d) return false;
  return typeof (d as { preview_url?: unknown }).preview_url === "string";
}

function previewUrl(entry: LiveActivityEntry): string {
  return String((entry.entry_data as { preview_url: string }).preview_url);
}
