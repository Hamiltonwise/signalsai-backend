/**
 * HQSearch -- Command-palette search for HQ.
 *
 * Triggered by Cmd+K or search icon click.
 * Searches: organizations, dream_team_tasks, behavioral_events, agents.
 * Results grouped by type. Keyboard navigation. Recent searches in localStorage.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X, Building, CheckSquare, Activity, Bot, Clock } from "lucide-react";
import { apiGet } from "@/api/index";

// --- Types -------------------------------------------------------------------

interface SearchResult {
  type: "practice" | "task" | "event" | "agent";
  id: string;
  title: string;
  subtitle: string;
  meta?: string;
  health?: "green" | "amber" | "red";
}

const TYPE_ICON: Record<string, typeof Building> = {
  practice: Building,
  task: CheckSquare,
  event: Activity,
  agent: Bot,
};

const TYPE_LABEL: Record<string, string> = {
  practice: "Practices",
  task: "Tasks",
  event: "Events",
  agent: "Agents",
};

const HEALTH_DOT: Record<string, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-400",
  red: "bg-red-500",
};

function loadRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem("hq_recent_searches") || "[]").slice(0, 5);
  } catch {
    return [];
  }
}

function saveRecent(query: string) {
  const recent = loadRecent().filter((q) => q !== query);
  recent.unshift(query);
  localStorage.setItem("hq_recent_searches", JSON.stringify(recent.slice(0, 5)));
}

// --- Main Component ----------------------------------------------------------

export default function HQSearch({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [recentSearches] = useState(loadRecent);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // ESC to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Debounced search
  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await apiGet({ path: `/admin/search?q=${encodeURIComponent(q)}` });
      if (res?.success && Array.isArray(res.results)) {
        setResults(res.results as SearchResult[]);
      } else {
        // Endpoint may not exist yet -- fallback to empty
        setResults([]);
      }
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, doSearch]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIdx(0);
  }, [results]);

  // Navigate to result
  const handleSelect = (result: SearchResult) => {
    saveRecent(query);
    onClose();
    if (result.type === "practice") {
      navigate(`/admin/organizations/${result.id}`);
    } else if (result.type === "task") {
      navigate(`/admin/minds`); // Tasks live in Dream Team
    } else if (result.type === "event") {
      navigate(`/admin/organizations/${result.id}`);
    } else if (result.type === "agent") {
      navigate(`/admin/minds`);
    }
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && results[selectedIdx]) {
      handleSelect(results[selectedIdx]);
    }
  };

  // Group results by type
  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    if (!acc[r.type]) acc[r.type] = [];
    acc[r.type].push(r);
    return acc;
  }, {});

  let globalIdx = 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <Search className="h-5 w-5 text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search practices, tasks, events, agents..."
            className="flex-1 text-sm text-[#212D40] placeholder:text-gray-400 focus:outline-none"
          />
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[50vh] overflow-y-auto">
          {loading && (
            <div className="px-5 py-6 text-center text-sm text-gray-400">Searching...</div>
          )}

          {!loading && query.length >= 2 && results.length === 0 && (
            <div className="px-5 py-6 text-center text-sm text-gray-400">
              No results for "{query}"
            </div>
          )}

          {!loading && query.length < 2 && recentSearches.length > 0 && (
            <div className="px-5 py-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">
                <Clock className="h-3 w-3 inline mr-1" />
                Recent
              </p>
              {recentSearches.map((s) => (
                <button
                  key={s}
                  onClick={() => setQuery(s)}
                  className="block w-full text-left text-sm text-gray-600 py-1.5 hover:text-[#212D40] transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {!loading && Object.entries(grouped).map(([type, items]) => (
            <div key={type}>
              <p className="px-5 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                {TYPE_LABEL[type] || type}
              </p>
              {items.map((result) => {
                const idx = globalIdx++;
                const Icon = TYPE_ICON[result.type] || Activity;
                const isSelected = idx === selectedIdx;
                return (
                  <button
                    key={`${result.type}-${result.id}-${idx}`}
                    onClick={() => handleSelect(result)}
                    className={`w-full flex items-center gap-3 px-5 py-3 text-left transition-colors ${
                      isSelected ? "bg-[#D56753]/5" : "hover:bg-gray-50"
                    }`}
                  >
                    <Icon className="h-4 w-4 text-gray-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-[#212D40] truncate">{result.title}</p>
                        {result.health && (
                          <span className={`w-2 h-2 rounded-full shrink-0 ${HEALTH_DOT[result.health] || ""}`} />
                        )}
                      </div>
                      <p className="text-xs text-gray-400 truncate">{result.subtitle}</p>
                    </div>
                    {result.meta && (
                      <span className="text-[10px] text-gray-400 shrink-0">{result.meta}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-5 py-2.5 flex items-center justify-between">
          <p className="text-[10px] text-gray-400">
            <kbd className="px-1 py-0.5 rounded bg-gray-100 text-gray-500 font-mono text-[9px]">ESC</kbd> to close
          </p>
          <p className="text-[10px] text-gray-400">
            <kbd className="px-1 py-0.5 rounded bg-gray-100 text-gray-500 font-mono text-[9px]">&uarr;&darr;</kbd> navigate
            <kbd className="px-1 py-0.5 rounded bg-gray-100 text-gray-500 font-mono text-[9px] ml-1">&crarr;</kbd> select
          </p>
        </div>
      </div>
    </div>
  );
}

// T2 registers GET /api/admin/search
