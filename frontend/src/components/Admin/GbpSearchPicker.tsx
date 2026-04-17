import { useState, useEffect, useRef } from "react";
import { Search, MapPin, Loader2, X } from "lucide-react";
import { searchPlaces, getPlaceDetails } from "../../api/places";
import type { PlaceSuggestion } from "../../api/places";

export interface SelectedPlace {
  placeId: string;
  name: string;
  address: string;
  rating?: number | null;
  reviewCount?: number | null;
  phone?: string | null;
  category?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  websiteUrl?: string | null;
  raw?: Record<string, unknown>;
}

interface GbpSearchPickerProps {
  value: SelectedPlace | null;
  onChange: (place: SelectedPlace | null) => void;
  label?: string;
  placeholder?: string;
  size?: "sm" | "md";
}

export default function GbpSearchPicker({
  value,
  onChange,
  label,
  placeholder = "Search for a business...",
  size = "md",
}: GbpSearchPickerProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!query.trim() || query.length < 3) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        setSearching(true);
        const s = await searchPlaces(query);
        if (isMountedRef.current) setSuggestions(s);
      } catch {
        if (isMountedRef.current) setSuggestions([]);
      } finally {
        if (isMountedRef.current) setSearching(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = async (s: PlaceSuggestion) => {
    try {
      setLoadingDetails(true);
      const details = await getPlaceDetails(s.place_id);
      const place: SelectedPlace = {
        placeId: s.place_id,
        name: String(details.name || s.description),
        address: String(details.formattedAddress || details.address || s.description),
        rating: (details.rating as number) ?? null,
        reviewCount: (details.reviewCount as number) ?? null,
        phone: (details.phone as string) ?? null,
        category: (details.category as string) ?? null,
        city: (details.city as string) ?? null,
        state: (details.state as string) ?? null,
        zip: (details.zip as string) ?? null,
        websiteUrl: (details.websiteUri as string) ?? (details.website as string) ?? null,
        raw: details as Record<string, unknown>,
      };
      onChange(place);
      setQuery("");
      setSuggestions([]);
    } finally {
      setLoadingDetails(false);
    }
  };

  const inputPadding = size === "sm" ? "py-2" : "py-2.5";

  if (value) {
    return (
      <div>
        {label && <label className="block text-xs font-semibold text-gray-700 mb-1.5">{label}</label>}
        <div className="flex items-start justify-between rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 text-gray-400 shrink-0" />
              <span className="text-sm font-medium text-gray-900 truncate">
                {value.name}
              </span>
            </div>
            <div className="text-xs text-gray-500 ml-5 mt-0.5 truncate">
              {value.address}
            </div>
            {value.rating != null && (
              <div className="text-xs text-gray-400 ml-5 mt-0.5">
                {value.rating}★ ({value.reviewCount || 0} reviews)
              </div>
            )}
          </div>
          <button
            onClick={() => onChange(null)}
            className="text-xs text-gray-400 hover:text-red-600 ml-2 shrink-0 p-1 rounded hover:bg-red-50"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {label && <label className="block text-xs font-semibold text-gray-700 mb-1.5">{label}</label>}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          disabled={loadingDetails}
          className={`w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 ${inputPadding} text-sm focus:outline-none focus:ring-2 focus:ring-alloro-orange/30 focus:border-alloro-orange disabled:opacity-60`}
        />
        {(searching || loadingDetails) && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
        )}
        {suggestions.length > 0 && (
          <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden max-h-64 overflow-y-auto">
            {suggestions.map((s) => (
              <button
                key={s.place_id}
                onClick={() => handleSelect(s)}
                className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0"
              >
                <div className="font-medium text-gray-900">{s.description}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
