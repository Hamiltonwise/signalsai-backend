import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Search, MapPin, Loader2, ArrowRight, UserCheck } from "lucide-react";
import { searchPlaces, getPlaceDetails } from "../../api/places";
import { validateReferralCode } from "../../api/checkup";
import { withTimeout } from "./conferenceFallback";
import type { PlaceSuggestion, PlaceDetails } from "../../api/places";

/**
 * Specialty types Google Places may return in the types[] array.
 * Maps machine keys → human-readable display labels.
 */
const SPECIALTY_TYPE_MAP: Record<string, string> = {
  // Dental
  orthodontist: "orthodontist",
  endodontist: "endodontist",
  periodontist: "periodontist",
  prosthodontist: "prosthodontist",
  oral_surgeon: "oral surgeon",
  pediatric_dentist: "pediatric dentist",
  dentist: "dentist",
  dental_clinic: "dentist",
  // Healthcare
  chiropractor: "chiropractor",
  physiotherapist: "physical therapist",
  physical_therapist: "physical therapist",
  optometrist: "optometrist",
  optician: "optometrist",
  veterinary_care: "veterinarian",
  animal_hospital: "veterinarian",
  dermatologist: "dermatologist",
  plastic_surgeon: "plastic surgeon",
  // Professional services
  lawyer: "attorney",
  law_firm: "attorney",
  accounting: "accountant",
  tax_preparation_service: "accountant",
  financial_planner: "financial advisor",
  real_estate_agency: "real estate agent",
  real_estate_agent: "real estate agent",
  insurance_agency: "insurance agent",
  // Personal services
  barber_shop: "barber",
  beauty_salon: "salon",
  hair_salon: "salon",
  hair_care: "salon",
  spa: "spa",
  // Home services
  plumber: "plumber",
  electrician: "electrician",
  hvac_contractor: "HVAC contractor",
  roofing_contractor: "roofer",
  contractor: "contractor",
  locksmith: "locksmith",
  // Other
  gym: "gym",
  fitness_center: "gym",
  personal_trainer: "trainer",
  auto_repair: "auto shop",
  mechanic: "mechanic",
  restaurant: "restaurant",
  cafe: "cafe",
  bakery: "bakery",
};

/**
 * Keywords to detect specialty from a business name when types[] is too coarse.
 * Checked in order — first match wins.
 */
const NAME_SPECIALTY_PATTERNS: [RegExp, string][] = [
  // Dental
  [/orthodontic/i, "orthodontist"],
  [/endodontic/i, "endodontist"],
  [/periodontic/i, "periodontist"],
  [/prosthodontic/i, "prosthodontist"],
  [/oral\s*surg/i, "oral surgeon"],
  [/pediatric\s*dent/i, "pediatric dentist"],
  // Non-dental
  [/barber/i, "barber"],
  [/salon|beauty|hair/i, "salon"],
  [/chiropractic/i, "chiropractor"],
  [/physical\s*therap/i, "physical therapist"],
  [/veterinar|animal\s*hosp/i, "veterinarian"],
  [/law\s*(firm|office)|attorney/i, "attorney"],
  [/\bcpa\b|account/i, "accountant"],
  [/financial\s*(advis|plan)/i, "financial advisor"],
  [/real\s*estate/i, "real estate agent"],
  [/plumb/i, "plumber"],
  [/electric/i, "electrician"],
  [/\bhvac\b/i, "HVAC contractor"],
  [/auto\s*(repair|body|shop)|mechanic/i, "auto shop"],
  [/fitness|gym|crossfit/i, "gym"],
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
export function competitorTerm(
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
  return "business in your area";
}

export default function EntryScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const refCode = searchParams.get("ref") || undefined;

  const urlPlaceId = searchParams.get("placeId") || undefined;
  const urlName = searchParams.get("name") || searchParams.get("q") || undefined;

  const [query, setQuery] = useState(urlName || "");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSelecting, setIsSelecting] = useState(!!urlPlaceId);
  const [selectedPlace, setSelectedPlace] = useState<PlaceDetails | null>(null);
  const [intent, setIntent] = useState<string | null>(null);
  const [noResults, setNoResults] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [referrerName, setReferrerName] = useState<string | null>(null);

  // Auto-select place from URL params (homepage CTA flow)
  useEffect(() => {
    if (!urlPlaceId) return;
    let cancelled = false;
    setIsSelecting(true);
    withTimeout(getPlaceDetails(urlPlaceId), 8000)
      .then((res) => {
        if (cancelled) return;
        if (res && res.success) {
          setSelectedPlace(res.place);
          setQuery(res.place.name);
        }
      })
      .catch(() => { if (!cancelled) setSearchError(true); })
      .finally(() => { if (!cancelled) setIsSelecting(false); });
    return () => { cancelled = true; };
  }, [urlPlaceId]);

  // Validate referral code on mount
  useEffect(() => {
    if (!refCode || refCode.length !== 8) return;
    withTimeout(validateReferralCode(refCode), 3000).then((res) => {
      if (res && res.valid && res.referrerName) {
        setReferrerName(res.referrerName);
      }
    });
  }, [refCode]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionTokenRef = useRef(crypto.randomUUID());
  const searchInputRef = useRef<HTMLInputElement>(null);

  const handleInputChange = useCallback((value: string) => {
    setQuery(value);
    setSelectedPlace(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length < 3) {
      setSuggestions([]);
      setNoResults(false);
      return;
    }

    setIsSearching(true);
    setSearchError(false);
    setNoResults(false);

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await withTimeout(
          searchPlaces(value, sessionTokenRef.current),
          5000
        );
        if (res && res.success) {
          setSuggestions(res.suggestions);
          setNoResults(res.suggestions.length === 0);
        } else if (!res) {
          setSearchError(true);
        }
      } catch {
        setSearchError(true);
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
        const res = await withTimeout(
          getPlaceDetails(suggestion.placeId, sessionTokenRef.current),
          5000
        );
        if (res && res.success) {
          setSelectedPlace(res.place);
          // Reset session token after a complete session
          sessionTokenRef.current = crypto.randomUUID();
        } else if (!res) {
          setSearchError(true);
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
    <div className="w-full max-w-md mt-2 sm:mt-8">
      {/* Referral banner */}
      {referrerName && (
        <div className="flex items-center justify-center gap-2 mb-6 text-sm text-[#212D40] bg-[#D56753]/5 border border-[#D56753]/15 rounded-xl px-4 py-2.5">
          <UserCheck className="w-4 h-4 text-[#D56753] shrink-0" />
          <span>Referred by <strong>{referrerName}</strong></span>
        </div>
      )}

      {/* Headline — strong hierarchy, updates with specialty */}
      <div className="text-center mb-10">
        <p className="text-xs font-semibold tracking-widest text-[#D56753] uppercase mb-3">
          Free. 60 seconds.
        </p>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-[#212D40] tracking-tight leading-tight">
          See where you rank.
        </h1>
        <p className="mt-4 text-base text-slate-500 leading-relaxed max-w-sm mx-auto">
          {selectedPlace
            ? `We already know who's ahead of you in ${selectedPlace.city || "your market"}. Type your name to find out.`
            : "We already know who's ahead of you. Type your name to find out."}
        </p>
      </div>

      {/* Search input — premium styling */}
      <div className="relative">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder="Search your business name..."
            autoComplete="off"
            className="w-full h-[56px] pl-12 pr-12 rounded-2xl bg-white border border-slate-200 text-base text-[#212D40] placeholder:text-slate-400 shadow-[0_2px_12px_rgba(0,0,0,0.06)] transition-all focus:outline-none focus:border-[#D56753] focus:ring-4 focus:ring-[#D56753]/8 focus:shadow-[0_2px_20px_rgba(213,103,83,0.12)]"
          />
          {isSearching && (
            <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#D56753] animate-spin" />
          )}
        </div>

        {/* Search error */}
        {searchError && !isSearching && (
          <p className="text-xs text-[#D56753] mt-2 ml-1">We couldn't search right now. Check your connection and try again.</p>
        )}

        {/* No results found */}
        {noResults && !isSearching && !searchError && query.trim().length >= 3 && (
          <p className="text-xs text-slate-500 mt-2 ml-1">No businesses found. Try a different name or add your city.</p>
        )}

        {/* Autocomplete dropdown */}
        {suggestions.length > 0 && !selectedPlace && (
          <ul className="absolute z-30 top-full mt-2 w-full bg-white border border-slate-200 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.08)] overflow-hidden max-h-[60vh] overflow-y-auto">
            {suggestions.map((s) => (
              <li key={s.placeId}>
                <button
                  type="button"
                  onClick={() => handleSelect(s)}
                  className="w-full flex items-start gap-3 px-4 py-3.5 text-left hover:bg-[#D56753]/3 transition-colors"
                >
                  <MapPin className="w-4 h-4 text-[#D56753] mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#212D40] truncate">
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

      {/* Intent chips */}
      {!selectedPlace && !isSelecting && (
        <div className="mt-6 flex flex-wrap gap-2 justify-center">
          {[
            "Who's beating me in my market?",
            "What's my online presence score?",
            "How do I get more customers?",
          ].map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                setIntent(label);
                searchInputRef.current?.focus();
              }}
              className={`text-[13px] px-4 py-2 rounded-full border transition-all duration-200 ${
                intent === label
                  ? "border-[#D56753] bg-[#D56753]/5 text-[#D56753] font-semibold shadow-sm"
                  : "border-slate-200 text-[#212D40]/70 hover:border-[#D56753]/40 hover:text-[#D56753]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Selected place card */}
      {isSelecting && (
        <div className="mt-8 flex justify-center">
          <Loader2 className="w-6 h-6 text-[#D56753] animate-spin" />
        </div>
      )}

      {selectedPlace && !isSelecting && (
        <div className="mt-8 bg-white border border-slate-200 rounded-2xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.06)] animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-start gap-4">
            <div className="w-11 h-11 rounded-xl bg-[#D56753]/8 flex items-center justify-center shrink-0">
              <MapPin className="w-5 h-5 text-[#D56753]" />
            </div>
            <div className="min-w-0">
              <p className="text-base font-bold text-[#212D40]">
                {selectedPlace.name}
              </p>
              <p className="text-sm text-slate-500 mt-0.5">
                {selectedPlace.formattedAddress}
              </p>
              {selectedPlace.category && (
                <span className="inline-block mt-2 text-xs font-semibold text-[#D56753] bg-[#D56753]/8 rounded-full px-2.5 py-0.5">
                  {selectedPlace.category}
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handleContinue}
            className="mt-6 w-full h-[3.25rem] flex items-center justify-center gap-2 rounded-xl bg-[#D56753] text-white text-[15px] font-semibold shadow-[0_4px_14px_rgba(213,103,83,0.35)] hover:shadow-[0_6px_20px_rgba(213,103,83,0.45)] hover:brightness-105 active:scale-[0.98] transition-all"
          >
            Run My Checkup
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Trust signals — refined */}
      <div className="mt-12 flex items-center justify-center gap-4">
        {["No login required", "Free", "60 seconds"].map((text, i) => (
          <span key={text} className="flex items-center gap-1.5 text-xs text-slate-400">
            {i > 0 && <span className="w-1 h-1 rounded-full bg-slate-300" />}
            {text}
          </span>
        ))}
      </div>
    </div>
  );
}
