/**
 * Focus Keywords -- customer-managed keyword tracking.
 *
 * Empowers without overwhelming: shows current keywords with position data,
 * offers AI suggestions, lets customers add custom keywords.
 * Max 25 per org. System suggests intelligently.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Target, Plus, X, Sparkles, TrendingUp, TrendingDown, Minus, Loader2 } from "lucide-react";

const API = "/api/focus-keywords";

async function apiFetch(path: string) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error((await res.json()).error || "Request failed");
  return res.json();
}
async function apiPost(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json()).error || "Request failed");
  return res.json();
}
async function apiDelete(path: string) {
  const res = await fetch(`${API}${path}`, { method: "DELETE" });
  if (!res.ok) throw new Error((await res.json()).error || "Request failed");
  return res.json();
}

interface FocusKeyword {
  id: string;
  keyword: string;
  source: "auto" | "custom" | "suggested";
  latestPosition: number | null;
  previousPosition: number | null;
  positionDelta: number | null;
}

function PositionBadge({ position, delta }: { position: number | null; delta: number | null }) {
  if (position === null) {
    return <span className="text-xs text-gray-400">Checking...</span>;
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-sm font-medium text-gray-700">#{position}</span>
      {delta !== null && delta !== 0 && (
        <span className={`flex items-center text-xs font-medium ${delta > 0 ? "text-emerald-600" : "text-red-500"}`}>
          {delta > 0 ? <TrendingUp className="w-3 h-3 mr-0.5" /> : <TrendingDown className="w-3 h-3 mr-0.5" />}
          {Math.abs(delta)}
        </span>
      )}
      {delta === 0 && <Minus className="w-3 h-3 text-gray-400" />}
    </div>
  );
}

function SourceTag({ source }: { source: string }) {
  if (source === "auto") return <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">Auto</span>;
  if (source === "suggested") return <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 font-medium">Suggested</span>;
  return <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-50 text-gray-500 font-medium">Custom</span>;
}

export default function FocusKeywords() {
  const queryClient = useQueryClient();
  const [newKeyword, setNewKeyword] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["focus-keywords"],
    queryFn: () => apiFetch(""),
    staleTime: 60_000,
  });

  const { data: suggestionsData, isLoading: suggestionsLoading, refetch: fetchSuggestions } = useQuery({
    queryKey: ["focus-keywords-suggest"],
    queryFn: () => apiFetch("/suggest"),
    enabled: false,
    staleTime: 300_000,
  });

  const addMutation = useMutation({
    mutationFn: (keyword: string) => apiPost("", { keyword }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["focus-keywords"] });
      setNewKeyword("");
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["focus-keywords"] }),
  });

  const keywords: FocusKeyword[] = data?.keywords || [];
  const suggestions: string[] = suggestionsData?.suggestions || [];

  const handleAdd = (keyword: string) => {
    if (!keyword.trim()) return;
    addMutation.mutate(keyword.trim());
  };

  const handleShowSuggestions = () => {
    setShowSuggestions(true);
    fetchSuggestions();
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-5 bg-gray-100 rounded w-40" />
          <div className="h-8 bg-gray-50 rounded w-full" />
          <div className="h-8 bg-gray-50 rounded w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-[#D56753]" />
          <h3 className="font-semibold text-gray-900">Focus Keywords</h3>
          <span className="text-xs text-gray-400">{keywords.length}/25</span>
        </div>
        {!showSuggestions && (
          <button
            onClick={handleShowSuggestions}
            className="flex items-center gap-1 text-xs text-[#D56753] hover:text-[#c45a48] transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Suggest keywords
          </button>
        )}
      </div>

      {/* Keyword list */}
      {keywords.length > 0 ? (
        <div className="space-y-1.5 mb-4">
          {keywords.map((kw) => (
            <div
              key={kw.id}
              className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 group transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm text-gray-800 truncate">{kw.keyword}</span>
                <SourceTag source={kw.source} />
              </div>
              <div className="flex items-center gap-3">
                <PositionBadge position={kw.latestPosition} delta={kw.positionDelta} />
                {kw.source !== "auto" && (
                  <button
                    onClick={() => removeMutation.mutate(kw.id)}
                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500 mb-4">
          No keywords tracked yet. Add your own or let us suggest some based on your market.
        </p>
      )}

      {/* AI Suggestions */}
      {showSuggestions && (
        <div className="mb-4 p-3 rounded-lg bg-purple-50/50 border border-purple-100">
          <div className="flex items-center gap-1.5 mb-2">
            <Sparkles className="w-3.5 h-3.5 text-purple-500" />
            <span className="text-xs font-medium text-purple-700">Suggested for your market</span>
          </div>
          {suggestionsLoading ? (
            <div className="flex items-center gap-2 py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
              <span className="text-xs text-purple-500">Analyzing your market...</span>
            </div>
          ) : suggestions.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => handleAdd(s)}
                  disabled={addMutation.isPending}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs bg-white border border-purple-200 rounded-full text-purple-700 hover:bg-purple-100 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  {s}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-purple-500">No additional suggestions right now.</p>
          )}
        </div>
      )}

      {/* Add custom keyword */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleAdd(newKeyword);
        }}
        className="flex gap-2"
      >
        <input
          type="text"
          value={newKeyword}
          onChange={(e) => setNewKeyword(e.target.value)}
          placeholder="Add a keyword to track..."
          className="flex-1 text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#D56753]/20 focus:border-[#D56753]"
          maxLength={300}
        />
        <button
          type="submit"
          disabled={!newKeyword.trim() || addMutation.isPending}
          className="px-3 py-2 bg-[#D56753] text-white text-sm rounded-lg hover:bg-[#c45a48] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
      </form>

      {addMutation.isError && (
        <p className="text-xs text-red-500 mt-2">
          {(addMutation.error as any)?.message || "Failed to add keyword"}
        </p>
      )}
    </div>
  );
}
