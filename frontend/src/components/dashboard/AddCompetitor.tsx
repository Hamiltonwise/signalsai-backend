/**
 * Add/Track Competitor
 *
 * A compact input on the dashboard that lets owners track up to 3 competitors.
 * Uses Google Places autocomplete (same API as checkup entry).
 * Stores the tracked competitor on the org via the competitors API.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { Search, Loader2, Plus, X } from "lucide-react";
import { apiPost } from "@/api/index";

interface Suggestion {
  placeId: string;
  mainText: string;
  secondaryText?: string;
}

interface AddCompetitorProps {
  currentCount: number;
  maxCount: number;
  onAdded: () => void;
}

export default function AddCompetitor({ currentCount, maxCount, onAdded }: AddCompetitorProps) {
  const [showInput, setShowInput] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const atLimit = currentCount >= maxCount;

  useEffect(() => {
    if (showInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showInput]);

  const searchPlaces = useCallback((input: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (input.length < 3) {
      setSuggestions([]);
      return;
    }
    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/places/autocomplete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input }),
        });
        const data = await res.json();
        if (data.success && data.suggestions) {
          setSuggestions(data.suggestions.slice(0, 5));
        }
      } catch {
        setSuggestions([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }, []);

  const selectPlace = async (place: Suggestion) => {
    setSuggestions([]);
    setQuery(place.mainText);
    setIsAdding(true);
    setError(null);

    try {
      const res = await apiPost({
        path: "/user/competitors/track",
        passedData: { placeId: place.placeId },
      });
      if (res?.success) {
        setQuery("");
        setShowInput(false);
        onAdded();
      } else {
        setError(res?.error || "Could not track this competitor.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsAdding(false);
    }
  };

  const cancel = () => {
    setShowInput(false);
    setQuery("");
    setSuggestions([]);
    setError(null);
  };

  if (!showInput) {
    return (
      <button
        onClick={() => {
          if (!atLimit) setShowInput(true);
        }}
        disabled={atLimit}
        className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed transition-all cursor-pointer ${
          atLimit
            ? "border-slate-200 text-slate-300 cursor-not-allowed"
            : "border-[#D56753]/30 text-[#D56753]/60 hover:border-[#D56753] hover:text-[#D56753] hover:bg-[#D56753]/5"
        }`}
      >
        <Plus size={14} />
        <span className="text-xs font-semibold">
          {atLimit
            ? `${maxCount} competitors tracked (max)`
            : "Track a competitor"}
        </span>
      </button>
    );
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2 border border-[#D56753]/30 rounded-xl bg-white px-3 py-2.5 transition-colors focus-within:border-[#D56753]">
        {isAdding ? (
          <Loader2 className="w-4 h-4 text-[#D56753] animate-spin shrink-0" />
        ) : isSearching ? (
          <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin shrink-0" />
        ) : (
          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        )}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            searchPlaces(e.target.value);
            setError(null);
          }}
          placeholder="Search for a business..."
          className="flex-1 text-sm text-[#212D40] outline-none placeholder:text-slate-300 bg-transparent"
          disabled={isAdding}
        />
        <button
          onClick={cancel}
          className="p-1 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
        >
          <X size={14} />
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-500 mt-1.5 px-1">{error}</p>
      )}

      {/* Autocomplete dropdown */}
      {suggestions.length > 0 && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          {suggestions.map((s) => (
            <button
              key={s.placeId}
              onClick={() => selectPlace(s)}
              className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0 cursor-pointer"
            >
              <p className="text-sm font-medium text-[#212D40] truncate">
                {s.mainText}
              </p>
              {s.secondaryText && (
                <p className="text-[11px] text-slate-400 truncate mt-0.5">
                  {s.secondaryText}
                </p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
