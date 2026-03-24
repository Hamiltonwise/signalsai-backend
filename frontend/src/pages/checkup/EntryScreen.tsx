import { useState, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Search, MapPin, Loader2, ArrowRight } from "lucide-react";
import { searchPlaces, getPlaceDetails } from "../../api/places";
import type { PlaceSuggestion, PlaceDetails } from "../../api/places";

/**
 * Specialty types Google Places may return in the types[] array.
 * Maps machine keys → human-readable display labels.
 */
const SPECIALTY_TYPE_MAP: Record<string, string> = {
  orthodontist: "orthodontist",
  endodontist: "endodontist",
  periodontist: "periodontist",
  prosthodontist: "prosthodontist",
  oral_surgeon: "oral surgeon",
  pediatric_dentist: "pediatric dentist",
  // Non-dental specialties that Google types resolve cleanly
  chiropractor: "chiropractor",
  physiotherapist: "physiotherapist",
  optometrist: "optometrist",
  veterinarian: "veterinarian",
};

/**
 * Keywords to detect specialty from a business name when types[] is too coarse.
 * Checked in order — first match wins.
 */
const NAME_SPECIALTY_PATTERNS: [RegExp, string][] = [
  [/orthodontic/i, "orthodontist"],
  [/endodontic/i, "endodontist"],
  [/periodontic/i, "periodontist"],
  [/prosthodontic/i, "prosthodontist"],
  [/oral\s*surg/i, "oral surgeon"],
  [/pediatric\s*dent/i, "pediatric dentist"],
];

/**
 * Derive a competitor term from PlaceDetails.
 *
 * Priority:
 * 1. Granular specialty in types[] (orthodontist, endodontist, etc.)
 * 2. Specialty keyword in business name ("Orthodontics" → orthodontist)
 * 3. primaryTypeDisplayName if non-generic (e.g., "Hair Salon", "Chiropractor")
 * 4. Fallback: "competitor"
 */
function competitorTerm(
  category: string,
  types: string[],
  name: string
): string {
  // 1. Check types[] for a granular specialty
  for (const t of types) {
    const match = SPECIALTY_TYPE_MAP[t];
    if (match) return match;
  }

  // 2. Parse business name for specialty keywords
  for (const [pattern, label] of NAME_SPECIALTY_PATTERNS) {
    if (pattern.test(name)) return label;
  }

  // 3. Use primaryTypeDisplayName if it's not the generic "Dentist"
  if (category && category.toLowerCase() !== "dentist") {
    return category.toLowerCase();
  }

  // 4. Fallback
  return "competitor";
}

export default function EntryScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const refCode = searchParams.get("ref") || undefined;

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<PlaceDetails | null>(null);
  const [intent, setIntent] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionTokenRef = useRef(crypto.randomUUID());
  const searchInputRef = useRef<HTMLInputElement>(null);

  const handleInputChange = useCallback((value: string) => {
    setQuery(value);
    setSelectedPlace(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length < 3) {
      setSuggestions([]);
      return;
    }

    setIsSearching(true);

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await searchPlaces(value, sessionTokenRef.current);
        if (res.success) {
          setSuggestions(res.suggestions);
        }
      } catch {
        // Silently fail — user can keep typing
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }, []);

  const handleSelect = useCallback(
    async (suggestion: PlaceSuggestion) => {
      setIsSelecting(true);
      setSuggestions([]);
      setQuery(suggestion.mainText);

      try {
        const res = await getPlaceDetails(
          suggestion.placeId,
          sessionTokenRef.current
        );
        if (res.success) {
          setSelectedPlace(res.place);
          // Reset session token after a complete session
          sessionTokenRef.current = crypto.randomUUID();
        }
      } catch {
        // Let user retry
      } finally {
        setIsSelecting(false);
      }
    },
    []
  );

  const handleContinue = () => {
    if (!selectedPlace) return;
    navigate("/checkup/scanning", { state: { place: selectedPlace, refCode, intent } });
  };

  return (
    <div className="w-full max-w-md mt-4 sm:mt-12">
      {/* Headline — updates with dynamic specialty after place selection */}
      <div className="text-center mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
          Free Referral Base Checkup
        </h1>
        <p className="mt-3 text-base text-slate-500 leading-relaxed">
          {selectedPlace
            ? `See how you rank against every ${competitorTerm(selectedPlace.category, selectedPlace.types, selectedPlace.name)} in ${selectedPlace.city || "your market"}.`
            : "See how your practice stacks up — in 60 seconds."}
        </p>
      </div>

      {/* Search input */}
      <div className="relative">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder="Search your practice name..."
            autoComplete="off"
            className="w-full h-14 pl-12 pr-12 rounded-2xl bg-white border border-slate-200 text-base text-slate-900 placeholder:text-slate-400 shadow-premium transition-all focus:outline-none focus:border-alloro-orange focus:ring-4 focus:ring-alloro-orange/10"
          />
          {isSearching && (
            <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 animate-spin" />
          )}
        </div>

        {/* Autocomplete dropdown */}
        {suggestions.length > 0 && (
          <ul className="absolute z-20 top-full mt-2 w-full bg-white border border-slate-200 rounded-2xl shadow-premium overflow-hidden">
            {suggestions.map((s) => (
              <li key={s.placeId}>
                <button
                  type="button"
                  onClick={() => handleSelect(s)}
                  className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                >
                  <MapPin className="w-4 h-4 text-alloro-orange mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {s.mainText}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {s.secondaryText}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Intent chips — shown before place selection */}
      {!selectedPlace && !isSelecting && (
        <div className="mt-5 flex flex-wrap gap-2 justify-center">
          {[
            "Who's beating me in my market?",
            "What's my online presence score?",
            "How do I get more patients?",
          ].map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                setIntent(label);
                searchInputRef.current?.focus();
              }}
              className={`text-xs px-3.5 py-2 rounded-full border transition-all ${
                intent === label
                  ? "border-[#D56753] bg-[#D56753]/5 text-[#D56753] font-semibold"
                  : "border-[#212D40]/20 text-[#212D40] hover:border-[#D56753] hover:text-[#D56753]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Selected place card */}
      {isSelecting && (
        <div className="mt-6 flex justify-center">
          <Loader2 className="w-6 h-6 text-alloro-orange animate-spin" />
        </div>
      )}

      {selectedPlace && !isSelecting && (
        <div className="mt-6 bg-white border border-slate-200 rounded-2xl p-5 shadow-premium animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-alloro-orange/10 flex items-center justify-center shrink-0">
              <MapPin className="w-5 h-5 text-alloro-orange" />
            </div>
            <div className="min-w-0">
              <p className="text-base font-semibold text-slate-900">
                {selectedPlace.name}
              </p>
              <p className="text-sm text-slate-500 mt-0.5">
                {selectedPlace.formattedAddress}
              </p>
              {selectedPlace.category && (
                <span className="inline-block mt-2 text-xs font-medium text-alloro-orange bg-alloro-orange/10 rounded-full px-2.5 py-0.5">
                  {selectedPlace.category}
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handleContinue}
            className="mt-5 w-full h-12 flex items-center justify-center gap-2 rounded-xl bg-alloro-orange text-white text-sm font-semibold shadow-soft-glow hover:brightness-105 active:scale-[0.98] transition-all"
          >
            Run My Checkup
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Trust signals */}
      <div className="mt-10 text-center space-y-2">
        <p className="text-xs text-slate-400">
          No login required &middot; Free &middot; Takes 60 seconds
        </p>
      </div>
    </div>
  );
}
