import { useEffect, useState, useRef, useCallback } from "react";
import { useLocation, useNavigate, Navigate } from "react-router-dom";
import { Check, Loader2 } from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { PlaceDetails } from "../../api/places";
import { analyzeCheckup } from "../../api/checkup";
import type { CheckupAnalysis, CheckupCompetitor } from "../../api/checkup";
import type { CheckupResults } from "./ResultsScreen";
import { trackEvent } from "../../api/tracking";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TERRACOTTA = "#D56753";
const NAVY = "#212D40";
const MIN_THEATER_MS = 15000; // minimum 15s theater
const ITEM_INTERVAL_MS = 2200; // ~2.2s per checklist item

const CHECKLIST_ITEMS = [
  "Finding your practice...",
  "Scanning Google Business Profile",
  "Locating nearby competitors",
  "Analyzing review velocity",
  "Checking local search rankings",
  "Measuring online presence",
  "Calculating your score...",
];

// ---------------------------------------------------------------------------
// Custom map markers — SVG-based, no external images
// ---------------------------------------------------------------------------

function createPinIcon(color: string) {
  return L.divIcon({
    className: "",
    iconSize: [28, 36],
    iconAnchor: [14, 36],
    popupAnchor: [0, -36],
    html: `<svg width="28" height="36" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.268 21.732 0 14 0z" fill="${color}"/>
      <circle cx="14" cy="14" r="6" fill="white" opacity="0.9"/>
    </svg>`,
  });
}

const practiceIcon = createPinIcon(TERRACOTTA);
const competitorIcon = createPinIcon(NAVY);

// ---------------------------------------------------------------------------
// Map auto-fit helper
// ---------------------------------------------------------------------------

function FitBounds({
  points,
}: {
  points: { lat: number; lng: number }[];
}) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) return;
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
  }, [points, map]);

  return null;
}

// ---------------------------------------------------------------------------
// Checklist Item
// ---------------------------------------------------------------------------

function ChecklistItem({
  text,
  state,
}: {
  text: string;
  state: "pending" | "active" | "done";
}) {
  return (
    <div
      className={`flex items-center gap-3 transition-all duration-500 ${
        state === "pending" ? "opacity-30" : "opacity-100"
      }`}
    >
      <div
        className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all duration-500 ${
          state === "done"
            ? "bg-[#D56753]"
            : state === "active"
              ? "bg-[#D56753]/20 ring-2 ring-[#D56753]/40"
              : "bg-slate-200"
        }`}
      >
        {state === "done" && <Check className="w-3.5 h-3.5 text-white" />}
        {state === "active" && (
          <Loader2 className="w-3.5 h-3.5 text-[#D56753] animate-spin" />
        )}
      </div>
      <span
        className={`text-sm transition-all duration-500 ${
          state === "done"
            ? "text-slate-900 font-medium"
            : state === "active"
              ? "text-slate-900 font-medium"
              : "text-slate-400"
        }`}
      >
        {text}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ScanningTheater() {
  const location = useLocation();
  const navigate = useNavigate();
  const stateData = location.state as { place?: PlaceDetails; refCode?: string; intent?: string } | undefined;
  const place = stateData?.place;
  const refCode = stateData?.refCode;
  const intent = stateData?.intent;

  // Checklist progress (index of the currently active item, -1 = not started)
  const [activeIndex, setActiveIndex] = useState(-1);

  // Competitors revealed on map so far
  const [visibleCompetitors, setVisibleCompetitors] = useState<
    CheckupCompetitor[]
  >([]);

  // API result (stored until theater finishes)
  const analysisRef = useRef<CheckupAnalysis | null>(null);
  const [apiDone, setApiDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Theater timing
  const theaterStartRef = useRef(Date.now());
  const hasNavigated = useRef(false);

  // Navigate to results when both API and theater are ready
  const goToResults = useCallback(() => {
    if (hasNavigated.current || !place || !analysisRef.current) return;
    hasNavigated.current = true;

    const result = analysisRef.current;
    const resultsState: CheckupResults = {
      place,
      score: {
        composite: result.score.composite,
        localVisibility: result.score.visibility,
        onlinePresence: result.score.reputation,
        reviewHealth: result.score.competitive,
      },
      topCompetitor: result.topCompetitor,
      competitors: result.competitors,
      findings: result.findings,
      totalImpact: result.totalImpact,
      market: result.market,
      refCode,
      intent,
    };
    navigate("/checkup/results", { state: resultsState, replace: true });
  }, [place, navigate, refCode, intent]);

  // --- Fire API call on mount ---
  useEffect(() => {
    if (!place) return;
    let cancelled = false;

    // Track: checkup.started
    trackEvent("checkup.started", {
      practice_name: place.name,
      city: place.city,
      specialty: place.category,
    });

    async function analyze() {
      try {
        const result = await analyzeCheckup({
          name: place.name,
          city: place.city,
          state: place.state,
          category: place.category,
          types: place.types,
          rating: place.rating,
          reviewCount: place.reviewCount,
          placeId: place.placeId,
        });

        if (cancelled) return;

        if (result.success) {
          analysisRef.current = result;
          setApiDone(true);

          // Track: checkup.scan_completed
          trackEvent("checkup.scan_completed", {
            score: result.score.composite,
            competitor_count: result.competitors.length,
            top_competitor_name: result.topCompetitor?.name || null,
          });
        } else {
          setError("Analysis failed. Please try again.");
        }
      } catch {
        if (!cancelled) setError("Something went wrong. Please try again.");
      }
    }

    analyze();
    return () => {
      cancelled = true;
    };
  }, [place]);

  // --- Animate checklist items in sequence ---
  useEffect(() => {
    // Start first item immediately
    setActiveIndex(0);

    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i <= CHECKLIST_ITEMS.length; i++) {
      timers.push(
        setTimeout(() => {
          setActiveIndex(i);
        }, ITEM_INTERVAL_MS * i)
      );
    }

    return () => timers.forEach(clearTimeout);
  }, []);

  // --- Progressively reveal competitor pins once API returns ---
  useEffect(() => {
    if (!apiDone || !analysisRef.current) return;

    const competitors = analysisRef.current.competitors;
    if (competitors.length === 0) return;

    // Reveal one pin every ~800ms for drama
    const timers: ReturnType<typeof setTimeout>[] = [];
    competitors.forEach((comp, i) => {
      timers.push(
        setTimeout(() => {
          setVisibleCompetitors((prev) => [...prev, comp]);
        }, 800 * (i + 1))
      );
    });

    return () => timers.forEach(clearTimeout);
  }, [apiDone]);

  // --- Transition when both checklist done AND API done AND min time elapsed ---
  useEffect(() => {
    if (!apiDone || activeIndex < CHECKLIST_ITEMS.length) return;

    const elapsed = Date.now() - theaterStartRef.current;
    const remaining = Math.max(0, MIN_THEATER_MS - elapsed);

    const timer = setTimeout(goToResults, remaining + 500);
    return () => clearTimeout(timer);
  }, [apiDone, activeIndex, goToResults]);

  // --- Redirect if no place data ---
  if (!place) {
    return <Navigate to="/checkup" replace />;
  }

  // --- Error state ---
  if (error) {
    return (
      <div className="w-full max-w-md mt-4 sm:mt-12 text-center">
        <p className="text-base font-medium text-red-600">{error}</p>
        <button
          onClick={() => navigate("/checkup")}
          className="mt-4 text-sm text-[#D56753] underline"
        >
          Start over
        </button>
      </div>
    );
  }

  // Map center from practice location
  const center: [number, number] = place.location
    ? [place.location.latitude, place.location.longitude]
    : [44.0582, -121.3153]; // Bend, OR fallback

  // All map points for auto-fit
  const allPoints = [
    { lat: center[0], lng: center[1] },
    ...visibleCompetitors
      .filter((c) => c.location)
      .map((c) => ({ lat: c.location!.lat, lng: c.location!.lng })),
  ];

  return (
    <div className="w-full max-w-4xl mt-4 sm:mt-8">
      {/* Header */}
      <div className="text-center mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
          Scanning {place.name}
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Analyzing your market in {place.city || "your area"}...
        </p>
      </div>

      {/* Two-panel layout */}
      <div className="flex flex-col lg:flex-row gap-5">
        {/* Left panel — Animated Checklist */}
        <div className="lg:w-[320px] shrink-0 bg-white border border-slate-200 rounded-2xl p-6 shadow-premium">
          <div className="space-y-4">
            {CHECKLIST_ITEMS.map((text, i) => (
              <ChecklistItem
                key={i}
                text={text}
                state={
                  i < activeIndex
                    ? "done"
                    : i === activeIndex
                      ? "active"
                      : "pending"
                }
              />
            ))}
          </div>

          {/* Progress indicator */}
          <div className="mt-6 pt-4 border-t border-slate-100">
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#D56753] rounded-full transition-all duration-700 ease-out"
                style={{
                  width: `${Math.min(100, (Math.max(0, activeIndex) / CHECKLIST_ITEMS.length) * 100)}%`,
                }}
              />
            </div>
            <p className="text-xs text-slate-400 mt-2 text-center">
              {activeIndex < CHECKLIST_ITEMS.length
                ? `Step ${Math.max(1, activeIndex + 1)} of ${CHECKLIST_ITEMS.length}`
                : "Analysis complete"}
            </p>
          </div>
        </div>

        {/* Right panel — Live Map */}
        <div className="flex-1 min-h-[300px] lg:min-h-0 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-premium">
          <MapContainer
            center={center}
            zoom={12}
            scrollWheelZoom={false}
            className="w-full h-full min-h-[300px] lg:min-h-[420px]"
            zoomControl={false}
            attributionControl={true}
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            />
            <FitBounds points={allPoints} />

            {/* Practice pin — Terracotta */}
            <Marker position={center} icon={practiceIcon}>
              <Popup>
                <div className="text-center">
                  <p className="font-semibold text-sm">{place.name}</p>
                  <p className="text-xs text-slate-500">Your practice</p>
                </div>
              </Popup>
            </Marker>

            {/* Competitor pins — Navy, appear progressively */}
            {visibleCompetitors.map(
              (comp) =>
                comp.location && (
                  <Marker
                    key={comp.placeId}
                    position={[comp.location.lat, comp.location.lng]}
                    icon={competitorIcon}
                  >
                    <Popup>
                      <div className="text-center">
                        <p className="font-semibold text-sm">{comp.name}</p>
                        <p className="text-xs text-slate-500">
                          {comp.rating}★ · {comp.reviewCount} reviews
                        </p>
                      </div>
                    </Popup>
                  </Marker>
                )
            )}
          </MapContainer>
        </div>
      </div>

      {/* Competitor count badge */}
      {visibleCompetitors.length > 0 && (
        <div className="mt-4 text-center">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 bg-slate-100 rounded-full px-3 py-1">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: NAVY }}
            />
            {visibleCompetitors.length} competitor
            {visibleCompetitors.length !== 1 ? "s" : ""} found
          </span>
        </div>
      )}
    </div>
  );
}
