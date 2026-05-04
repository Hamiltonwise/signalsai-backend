import { useState } from "react";
import {
  fetchAiVisibility,
  type AiVisibilityCell,
  type AeoPlatform,
} from "@/api/answerEngine";
import { useQuery } from "@tanstack/react-query";

/**
 * AI Visibility module. Renders the 25 queries x 6 platforms grid.
 * Cell colors:
 *   green (cited), amber (competitor), gray (not appearing or not polled).
 * Click any cell to surface the most recent platform response.
 */

interface Props {
  practiceId: number;
}

const PLATFORM_LABELS: Record<AeoPlatform, string> = {
  google_ai_overviews: "Google AI",
  chatgpt: "ChatGPT",
  perplexity: "Perplexity",
  claude: "Claude",
  gemini: "Gemini",
  siri: "Siri",
};

// Card 5 (May 4 2026) — approved gray-cell tooltip per AR-010.
export const GRAY_CELL_TOOLTIP =
  "Alloro is improving your site to compound this signal. When there's something specific worth your attention, you'll see it here.";

export default function AIVisibilityGrid({ practiceId }: Props) {
  const [selected, setSelected] = useState<{
    query: string;
    platform: AeoPlatform;
    cell: AiVisibilityCell;
  } | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["answer-engine", "ai-visibility", practiceId],
    queryFn: () => fetchAiVisibility(practiceId),
    enabled: practiceId > 0,
  });

  if (isLoading) {
    return (
      <div className="text-xs text-gray-400">
        Alloro is loading your AI Visibility grid.
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
        Your AI Visibility data is loading. Try refreshing in a moment.
      </div>
    );
  }

  const { queries, platforms, grid, summary } = data;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">
          Alloro is watching {queries.length} patient questions across 6 AI
          platforms for your practice. Each is a moment a patient could find
          you. Green: AI Overviews cite you. Amber: a competitor is cited.
          Gray: Alloro is on it.
        </p>
      </div>

      <div className="rounded-2xl bg-stone-50/80 border border-stone-200/60 p-4 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left">
              <th className="pb-2 pr-3 font-semibold text-gray-400 uppercase tracking-wider">
                Query
              </th>
              {platforms.map((p) => (
                <th
                  key={p}
                  className="pb-2 px-1 text-center font-semibold text-gray-400 uppercase tracking-wider"
                >
                  {PLATFORM_LABELS[p]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {queries.map((q) => (
              <tr key={q} className="border-t border-stone-200/40">
                <td className="py-2 pr-3 text-[#1A1D23]/80 align-middle">
                  {q}
                </td>
                {platforms.map((p) => {
                  const cell = grid[q]?.[p];
                  if (!cell) {
                    return (
                      <td key={p} className="py-2 px-1 text-center">
                        <span className="inline-block w-3 h-3 rounded-full bg-gray-200" />
                      </td>
                    );
                  }
                  const dotClass = dotForStatus(cell.status);
                  const isGray =
                    cell.status === "not_appearing" ||
                    cell.status === "not_polled";
                  return (
                    <td key={p} className="py-2 px-1 text-center">
                      <button
                        onClick={() => setSelected({ query: q, platform: p, cell })}
                        className="inline-flex items-center justify-center"
                        aria-label={`${PLATFORM_LABELS[p]} for ${q}: ${cell.status}`}
                        title={isGray ? GRAY_CELL_TOOLTIP : undefined}
                      >
                        <span className={`inline-block w-3 h-3 rounded-full ${dotClass}`} />
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <SummaryCell
          label="Cited"
          count={summary.citedCount}
          tone="emerald"
        />
        <SummaryCell
          label="Competitor up"
          count={summary.competitorCount}
          tone="amber"
        />
        <SummaryCell
          label="Alloro on it"
          count={summary.notAppearingCount + summary.notPolledCount}
          tone="gray"
        />
      </div>

      {selected && (
        <CellDetail
          query={selected.query}
          platform={selected.platform}
          cell={selected.cell}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function dotForStatus(status: AiVisibilityCell["status"]): string {
  switch (status) {
    case "cited":
      return "bg-emerald-500 ring-4 ring-emerald-500/20";
    case "competitor":
      return "bg-amber-400 ring-4 ring-amber-400/20";
    case "not_appearing":
      return "bg-gray-300";
    case "not_polled":
    default:
      return "bg-gray-200";
  }
}

function SummaryCell({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "emerald" | "amber" | "gray";
}) {
  const toneClass =
    tone === "emerald"
      ? "text-emerald-500"
      : tone === "amber"
        ? "text-amber-500"
        : "text-gray-400";
  return (
    <div className="rounded-xl bg-stone-50/80 border border-stone-200/60 p-3 text-center">
      <div className={`text-2xl font-semibold ${toneClass}`}>{count}</div>
      <div className="text-xs text-gray-400 font-semibold uppercase tracking-wider mt-1">
        {label}
      </div>
    </div>
  );
}

function CellDetail({
  query,
  platform,
  cell,
  onClose,
}: {
  query: string;
  platform: AeoPlatform;
  cell: AiVisibilityCell;
  onClose: () => void;
}) {
  return (
    <div className="rounded-2xl bg-[#F0EDE8] border border-stone-200/60 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="text-xs text-gray-400 font-semibold uppercase tracking-wider">
            {PLATFORM_LABELS[platform]}
          </div>
          <div className="text-sm text-[#1A1D23] font-semibold">{query}</div>
          <CellDescription cell={cell} />
        </div>
        <button
          onClick={onClose}
          className="text-xs text-[#D56753] font-semibold hover:underline"
          aria-label="Close detail"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function CellDescription({ cell }: { cell: AiVisibilityCell }) {
  if (cell.status === "cited") {
    return (
      <p className="text-sm text-gray-500">
        You are cited on this platform.
        {cell.citation_url ? (
          <>
            {" "}
            <a
              href={cell.citation_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#D56753] font-semibold hover:underline"
            >
              See the source
            </a>
          </>
        ) : null}
      </p>
    );
  }
  if (cell.status === "competitor" && cell.competitor) {
    return (
      <p className="text-sm text-gray-500">
        Currently cited: {cell.competitor}.
      </p>
    );
  }
  if (cell.status === "not_appearing") {
    return (
      <p className="text-sm text-gray-500">
        No practice is being cited on this platform for this query.
      </p>
    );
  }
  return (
    <p className="text-sm text-gray-500">
      This platform has not been polled for this query yet.
    </p>
  );
}
