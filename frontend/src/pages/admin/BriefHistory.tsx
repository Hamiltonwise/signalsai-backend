import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Sparkles, ChevronDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import type { PmDailyBrief } from "../../types/pm";
import { fetchBriefHistory } from "../../api/pm";

export default function BriefHistory() {
  const [briefs, setBriefs] = useState<PmDailyBrief[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const navigate = useNavigate();

  const loadMore = async () => {
    setIsLoading(true);
    try {
      const result = await fetchBriefHistory(10, briefs.length);
      setBriefs((prev) => [...prev, ...result.data]);
      setTotal(result.total);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMore();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Header */}
      <div className="mb-6 flex items-center gap-4">
        <button
          onClick={() => navigate("/admin/pm")}
          className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Brief History</h1>
          <p className="text-sm text-gray-500">Past AI-generated daily briefs</p>
        </div>
      </div>

      {/* Briefs list */}
      {briefs.length === 0 && !isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Sparkles className="h-8 w-8 text-gray-300 mb-3" />
          <p className="text-sm text-gray-400">No briefs generated yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {briefs.map((brief, i) => {
            const isExpanded = expandedId === brief.id;

            return (
              <motion.div
                key={brief.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden"
              >
                <button
                  onClick={() =>
                    setExpandedId(isExpanded ? null : brief.id)
                  }
                  className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-alloro-orange/10">
                      <Sparkles className="h-4 w-4 text-alloro-orange" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {format(new Date(brief.brief_date), "EEEE, MMMM d, yyyy")}
                      </p>
                      <div className="flex gap-2 mt-0.5">
                        <span className="text-xs text-gray-500">
                          {brief.tasks_completed_yesterday} completed
                        </span>
                        {brief.tasks_overdue > 0 && (
                          <span className="text-xs text-red-500">
                            {brief.tasks_overdue} overdue
                          </span>
                        )}
                        <span className="text-xs text-gray-500">
                          {brief.tasks_due_today} due
                        </span>
                      </div>
                    </div>
                  </div>
                  <ChevronDown
                    className={`h-5 w-5 text-gray-400 transition-transform ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {isExpanded && brief.summary_html && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t border-gray-100 px-5 py-4"
                  >
                    <div className="text-sm text-gray-600 [&_p]:mb-1.5 [&_strong]:font-semibold [&_strong]:text-gray-900">
                      {/* Render as plain text for safety */}
                      {brief.summary_html
                        .replace(/<[^>]*>/g, "\n")
                        .split("\n")
                        .filter(Boolean)
                        .map((line, j) => (
                          <p key={j}>{line.trim()}</p>
                        ))}
                    </div>

                    {brief.recommended_tasks &&
                      brief.recommended_tasks.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                            Recommended Focus
                          </p>
                          {brief.recommended_tasks.map((rt, k) => (
                            <div key={k} className="text-sm text-gray-700 mb-1">
                              <span className="font-medium">{rt.title}</span>
                              {rt.reason && (
                                <span className="text-gray-500">
                                  {" "}
                                  — {rt.reason}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                  </motion.div>
                )}
              </motion.div>
            );
          })}

          {briefs.length < total && (
            <div className="text-center py-4">
              <button
                onClick={loadMore}
                disabled={isLoading}
                className="text-sm font-medium text-alloro-orange hover:text-alloro-orange/80 transition-colors disabled:opacity-50"
              >
                {isLoading ? "Loading..." : "Load more"}
              </button>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
