/**
 * ChangelogCard -- auto-generated changelog from GitHub commits.
 *
 * Shows recent sandbox commits in a clean timeline.
 * Orange badge = pending production deploy (ahead of main).
 * Green badge = deployed to sandbox.
 * Collapsible by date. Jo validates, Dave merges.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GitCommit, ChevronDown, ChevronRight, FileText } from "lucide-react";
import { apiGet } from "@/api/index";

interface ChangelogEntry {
  hash: string;
  message: string;
  author: string;
  date: string;
  filesChanged: number;
  aheadOfMain: boolean;
}

interface ChangelogGroup {
  date: string;
  commits: ChangelogEntry[];
}

interface ChangelogResponse {
  success: boolean;
  groups: ChangelogGroup[];
  aheadCount: number;
  totalCommits: number;
  error?: string;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return "yesterday";
  return `${diffDay}d ago`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function ChangelogCard() {
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);

  const { data, isLoading } = useQuery<ChangelogResponse>({
    queryKey: ["admin-changelog"],
    queryFn: async () => {
      const res = await apiGet({ path: "/admin/changelog" });
      return res as ChangelogResponse;
    },
    staleTime: 120_000,
  });

  const groups = data?.groups ?? [];
  const aheadCount = data?.aheadCount ?? 0;
  const hasError = !!data?.error;

  // Auto-expand the first date group
  const visibleGroups = showAll ? groups : groups.slice(0, 3);

  const toggleDate = (date: string) => {
    setExpandedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) {
        next.delete(date);
      } else {
        next.add(date);
      }
      return next;
    });
  };

  // First group is auto-expanded
  const isExpanded = (date: string, idx: number) =>
    idx === 0 || expandedDates.has(date);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <GitCommit className="h-4 w-4 text-[#D56753]" />
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Changelog
          </p>
        </div>
        {aheadCount > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-semibold">
            {aheadCount} pending production
          </span>
        )}
      </div>

      {isLoading && (
        <p className="text-sm text-gray-400">Loading changelog...</p>
      )}

      {hasError && !isLoading && (
        <p className="text-xs text-gray-400">{data?.error}</p>
      )}

      {!isLoading && groups.length === 0 && !hasError && (
        <p className="text-sm text-gray-400">No commits found.</p>
      )}

      <div className="space-y-1">
        {visibleGroups.map((group, groupIdx) => {
          const open = isExpanded(group.date, groupIdx);
          const pendingInGroup = group.commits.filter((c) => c.aheadOfMain).length;

          return (
            <div key={group.date}>
              <button
                onClick={() => toggleDate(group.date)}
                className="w-full flex items-center gap-2 py-1.5 text-left hover:bg-gray-50 rounded-lg px-1 -mx-1 transition-colors"
              >
                {open ? (
                  <ChevronDown className="h-3 w-3 text-gray-400 shrink-0" />
                ) : (
                  <ChevronRight className="h-3 w-3 text-gray-400 shrink-0" />
                )}
                <span className="text-xs font-semibold text-[#1A1D23]">
                  {formatDate(group.date)}
                </span>
                <span className="text-xs text-gray-400">
                  {group.commits.length} commit{group.commits.length !== 1 ? "s" : ""}
                </span>
                {pendingInGroup > 0 && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-600 font-semibold">
                    {pendingInGroup} pending
                  </span>
                )}
              </button>

              {open && (
                <div className="ml-5 space-y-1.5 pb-2">
                  {group.commits.map((commit) => (
                    <div
                      key={commit.hash}
                      className="flex items-start gap-2 py-1 border-l-2 pl-3"
                      style={{
                        borderColor: commit.aheadOfMain ? "#f97316" : "#10b981",
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[#1A1D23] leading-tight truncate">
                          {commit.message}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs font-mono text-gray-400">
                            {commit.hash}
                          </span>
                          <span className="text-xs text-gray-400">
                            {commit.author}
                          </span>
                          <span className="text-xs text-gray-400">
                            {timeAgo(commit.date)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {commit.filesChanged > 0 && (
                          <span className="flex items-center gap-0.5 text-xs text-gray-400">
                            <FileText className="h-3 w-3" />
                            {commit.filesChanged}
                          </span>
                        )}
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded font-semibold ${
                            commit.aheadOfMain
                              ? "bg-orange-100 text-orange-600"
                              : "bg-emerald-100 text-emerald-600"
                          }`}
                        >
                          {commit.aheadOfMain ? "pending" : "sandbox"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {groups.length > 3 && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-2 text-xs text-[#D56753] hover:underline"
        >
          Show all {groups.length} days
        </button>
      )}
    </div>
  );
}
