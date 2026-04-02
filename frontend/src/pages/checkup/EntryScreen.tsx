import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Search, MapPin, Loader2, ArrowRight, UserCheck } from "lucide-react";
import { searchPlaces, getPlaceDetails } from "../../api/places";
import { validateReferralCode } from "../../api/checkup";
import { withTimeout, isConferenceMode } from "./conferenceFallback";
import type { PlaceSuggestion, PlaceDetails } from "../../api/places";
import { TailorText } from "../../components/TailorText";

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
  // Med spa / aesthetics
  med_spa: "med spa",
  medical_spa: "med spa",
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
  // Surgical sub-specialties (must be before generic matches)
  [/oculofacial|oculoplastic/i, "oculofacial surgeon"],
  [/plastic\s*surg/i, "plastic surgeon"],
  [/dermatolog/i, "dermatologist"],
  [/med\s*spa|medspa|medical\s*spa|aestheti/i, "med spa"],
  // Non-dental
  [/barber/i, "barber"],
  [/salon|beauty|hair/i, "salon"],
  [/chiropractic/i, "chiropractor"],
  [/physical\s*therap/i, "physical therapist"],
  [/veterinar|animal\s*hosp/i, "veterinarian"],
  [/optometr|optic/i, "optometrist"],
  [/law\s*(firm|office)|attorney/i, "attorney"],
  [/\bcpa\b|account/i, "accountant"],
  [/financial\s*(advis|plan)/i, "financial advisor"],
  [/real\s*estate/i, "real estate agent"],
  // Home + outdoor
  [/garden\s*design|landscape\s*design/i, "garden designer"],
  [/landscap/i, "landscaper"],
  [/plumb/i, "plumber"],
  [/electric/i, "electrician"],
  [/\bhvac\b/i, "HVAC contractor"],
  [/auto\s*(repair|body|shop)|mechanic/i, "auto shop"],
  [/fitness|gym|crossfit/i, "gym"],
  [/photograph/i, "photographer"],
  [/dog\s*groom|pet\s*groom/i, "pet groomer"],
];

/**
 * Derive a competitor term from PlaceDetails.
 *
 * Priority:
 * 1. Specialty keyword in business name ("Orthodontics" -> orthodontist)
 * 2. Granular specialty in types[] (orthodontist, endodontist, etc.)
 * 3. primaryTypeDisplayName if non-generic (e.g., "Hair Salon", "Chiropractor")
 * 4. Fallback: "competitor"
 *
 * Name-based detection runs first because Google Places types[] often returns
 * a generic parent type (e.g. "dentist") even for specialists whose name
 * clearly indicates a more specific specialty.
 */
export function competitorTerm(
  category: string,
  types: string[],
  name: string
): string {
  // 1. Parse business name for specialty keywords (most specific signal)
  for (const [pattern, label] of NAME_SPECIALTY_PATTERNS) {
    if (pattern.test(name)) return label;
  }

  // 2. Check types[] for a granular specialty
  for (const t of types) {
    const match = SPECIALTY_TYPE_MAP[t];
    if (match) return match;
  }

  // 3. Use primaryTypeDisplayName if it's not the generic "Dentist"
  if (category && category.toLowerCase() !== "dentist") {
    return category.toLowerCase();
  }

  // 4. Fallback
  return "business in your area";
}

const USER_QUESTION_PLACEHOLDERS = [
  "Where my clients come from",
  "Why my competitor ranks higher",
  "If my marketing is working",
];

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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [userQuestion, _setUserQuestion] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_placeholderIndex, setPlaceholderIndex] = useState(0);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  // Persist conference mode from URL param to localStorage immediately on mount.
  // This ensures billing suppression works even if the user navigates away and back.
  useEffect(() => { isConferenceMode(); }, []);

  // Grab user's approximate location for autocomplete biasing via backend.
  // No browser geolocation prompt. IP-based only. Silent, private, no permission popup.
  useEffect(() => {
    fetch("/api/checkup/geo", { signal: AbortSignal.timeout(3000) })
      .then(r => r.json())
      .then(data => {
        if (data.lat && data.lng) {
          setUserLocation({ lat: data.lat, lng: data.lng });
        }
      })
      .catch(() => {});
  }, []);

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

  // Rotate placeholder examples for the "one question" input
  useEffect(() => {
    const timer = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % USER_QUESTION_PLACEHOLDERS.length);
    }, 3500);
    return () => clearInterval(timer);
  }, []);

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
          searchPlaces(value, sessionTokenRef.current, userLocation ?? undefined),
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
    navigate("/checkup/scanning", { state: { place: selectedPlace, refCode, intent, userQuestion: userQuestion.trim() || undefined } });
  };

  return (
    <div className="w-full max-w-md mt-2 sm:mt-8">
      {/* Referral banner */}
      {referrerName && (
        <div className="flex items-center justify-center gap-2 mb-6 text-sm text-[#1A1D23] bg-[#D56753]/5 border border-[#D56753]/15 rounded-xl px-4 py-2.5">
          <UserCheck className="w-4 h-4 text-[#D56753] shrink-0" />
          <span>Referred by <strong>{referrerName}</strong></span>
        </div>
      )}

      {/* Headline — warm, continues the homepage identity */}
      <div className="text-center mb-10">
        <TailorText editKey="checkup.entry.badge" defaultText="Free. 60 seconds." as="p" className="text-xs font-semibold tracking-[0.2em] text-[#D56753]/60 uppercase mb-4" />
        <TailorText editKey="checkup.entry.headline" defaultText="Let's see what your business has been saying." as="h1" className="text-2xl sm:text-[34px] font-semibold text-[#1A1D23] tracking-tight leading-tight font-heading" />
        <p className="mt-4 text-base text-[#1A1D23]/50 leading-relaxed max-w-sm mx-auto">
          {selectedPlace
            ? `We'll read your market in ${selectedPlace.city || "your area"} and tell you what we find. Honest.`
            : "Type your name. We'll tell you something specific and true about your business."}
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
            className="w-full h-[56px] pl-12 pr-12 rounded-2xl bg-white border border-[#D56753]/10 text-base text-[#1A1D23] placeholder:text-slate-400 shadow-[0_2px_12px_rgba(214,104,83,0.04)] transition-all duration-200 focus:outline-none focus:border-[#D56753]/40 focus:ring-4 focus:ring-[#D56753]/8 focus:shadow-[0_2px_20px_rgba(214,104,83,0.1)]"
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
          <ul className="absolute z-30 top-full mt-2 w-full bg-white border border-[#D56753]/10 rounded-2xl shadow-warm-lg overflow-hidden max-h-[60vh] overflow-y-auto">
            {suggestions.map((s) => (
              <li key={s.placeId}>
                <button
                  type="button"
                  onClick={() => handleSelect(s)}
                  className="w-full flex items-start gap-3 px-4 py-3.5 text-left hover:bg-[#D56753]/3 transition-colors"
                >
                  <MapPin className="w-4 h-4 text-[#D56753] mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#1A1D23] break-words">
                      {s.mainText}
                    </p>
                    <p className="text-xs text-slate-500 break-words">
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
                  : "border-slate-200 text-[#1A1D23]/70 hover:border-[#D56753]/40 hover:text-[#D56753]"
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
        <div className="mt-8 bg-gradient-to-br from-white to-[#FFF9F7] border border-[#D56753]/12 rounded-2xl p-6 shadow-warm-lg animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-start gap-4">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#D56753]/15 to-[#D56753]/5 flex items-center justify-center shrink-0">
              <MapPin className="w-5 h-5 text-[#D56753]" />
            </div>
            <div className="min-w-0">
              <p className="text-base font-bold text-[#1A1D23]">
                {selectedPlace.name}
              </p>
              <p className="text-sm text-slate-500 mt-0.5">
                {selectedPlace.formattedAddress}
              </p>
              {selectedPlace.category && (
                <span className="inline-block mt-2 text-xs font-semibold text-[#D56753] bg-[#D56753]/8 rounded-full px-2.5 py-0.5">
                  {competitorTerm(selectedPlace.category, selectedPlace.types || [], selectedPlace.name)}
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handleContinue}
            className="btn-primary btn-press mt-5 w-full h-[3.25rem] flex items-center justify-center gap-2 text-[15px]"
          >
            <TailorText editKey="checkup.entry.cta" defaultText="Run My Checkup" as="span" />
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Trust signals — refined */}
      <div className="mt-12 flex items-center justify-center gap-4">
        {["Free", "60 seconds", "See your score instantly"].map((text, i) => (
          <span key={text} className="flex items-center gap-1.5 text-xs text-slate-400">
            {i > 0 && <span className="w-1 h-1 rounded-full bg-slate-300" />}
            {text}
          </span>
        ))}
      </div>
    </div>
  );
}
