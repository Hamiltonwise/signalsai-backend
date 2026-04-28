/**
 * Location Competitor Onboarding (Practice Ranking v2)
 *
 * Three-stage flow per spec:
 *   1. Discovering — animated mini-map while we run Places discovery server-side
 *   2. Curating    — list with remove/add (autocomplete), capped at 10
 *   3. Finalize    — single click → POST /finalize-and-run, redirect to dashboard
 *
 * Spec: plans/04282026-no-ticket-practice-ranking-v2-user-curated-competitors/spec.md
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2,
  Plus,
  X,
  Search,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Star,
  MapPin,
  Phone,
  Globe,
  Info,
} from "lucide-react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./competitor-map.css";
import {
  getLocationCompetitors,
  runCompetitorDiscovery,
  addLocationCompetitor,
  removeLocationCompetitor,
  finalizeAndRun,
  type CuratedCompetitor,
  type PracticeLocationRef,
  type SelfFilterStatus,
} from "../../api/practiceRanking";
import { searchPlaces, type PlaceSuggestion } from "../../api/places";
import { haversineMiles, formatDistance } from "./util.distance";

const PULSE_DURATION_MS = 2000;

type Stage = "loading" | "discovering" | "curating" | "finalizing";

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message || fallback;
  if (typeof err === "string") return err;
  return fallback;
}

export default function LocationCompetitorOnboarding() {
  const params = useParams<{ locationId: string }>();
  const navigate = useNavigate();
  const locationId = Number(params.locationId);

  const [stage, setStage] = useState<Stage>("loading");
  const [competitors, setCompetitors] = useState<CuratedCompetitor[]>([]);
  const [cap, setCap] = useState(10);
  const [error, setError] = useState<string | null>(null);
  // Single timeout flips Stage 1 → Stage 2 once discovery returns. Per-pin
  // staggered reveal was retired with the Leaflet swap.
  const stageTransitionTimer = useRef<number | null>(null);
  const [practiceLocation, setPracticeLocation] =
    useState<PracticeLocationRef | null>(null);
  const [selfFilterStatus, setSelfFilterStatus] =
    useState<SelfFilterStatus>("resolved");

  // Bidirectional click sync between map pins and list rows.
  // `selectionSource` tracks which side fired so the effect knows which side
  // to scroll into view.
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [selectionSource, setSelectionSource] = useState<"list" | "pin" | null>(
    null
  );
  const rowRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  const mapWrapperRef = useRef<HTMLDivElement | null>(null);
  const pulseTimer = useRef<number | null>(null);

  const selectFromList = useCallback((placeId: string) => {
    setSelectionSource("list");
    setSelectedPlaceId(placeId);
  }, []);
  const selectFromPin = useCallback((placeId: string) => {
    setSelectionSource("pin");
    setSelectedPlaceId(placeId);
  }, []);

  useEffect(() => {
    if (!selectedPlaceId) return;
    if (selectionSource === "list") {
      mapWrapperRef.current?.scrollIntoView({
        block: "start",
        behavior: "smooth",
      });
    } else if (selectionSource === "pin") {
      rowRefs.current
        .get(selectedPlaceId)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    if (pulseTimer.current) window.clearTimeout(pulseTimer.current);
    pulseTimer.current = window.setTimeout(() => {
      setSelectedPlaceId(null);
      setSelectionSource(null);
      pulseTimer.current = null;
    }, PULSE_DURATION_MS);
    return () => {
      if (pulseTimer.current) {
        window.clearTimeout(pulseTimer.current);
        pulseTimer.current = null;
      }
    };
  }, [selectedPlaceId, selectionSource]);

  const registerRowRef = useCallback(
    (placeId: string, el: HTMLLIElement | null) => {
      if (el) rowRefs.current.set(placeId, el);
      else rowRefs.current.delete(placeId);
    },
    []
  );

  // Search dropdown state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchResults, setSearchResults] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const searchDebounce = useRef<NodeJS.Timeout | null>(null);

  // Validate locationId param
  const validLocationId =
    Number.isFinite(locationId) && locationId > 0 && Number.isInteger(locationId);

  // ──────────────────────────────────────────────────────────
  // Initial load: figure out what stage to land in
  // ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!validLocationId) {
      setError("Invalid location.");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await getLocationCompetitors(locationId);
        if (cancelled) return;
        if (!res?.success) {
          setError("Could not load competitor list.");
          return;
        }
        setCap(res.cap);
        setPracticeLocation(res.practiceLocation);
        setSelfFilterStatus(res.selfFilterStatus);

        if (res.onboarding.status === "finalized") {
          // Already done — bounce to dashboard
          navigate("/rankings", { replace: true });
          return;
        }

        if (res.competitors.length === 0) {
          // No discovery yet — kick it off
          setStage("discovering");
          await runDiscovery();
        } else {
          // Existing list — straight to curating
          setCompetitors(res.competitors);
          setStage("curating");
        }
      } catch (err) {
        if (!cancelled) setError(errorMessage(err, "Failed to load"));
      }
    })();
    return () => {
      cancelled = true;
      if (stageTransitionTimer.current) {
        window.clearTimeout(stageTransitionTimer.current);
        stageTransitionTimer.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);

  // ──────────────────────────────────────────────────────────
  // Stage 1 — Discovery
  // ──────────────────────────────────────────────────────────
  async function runDiscovery() {
    try {
      const result = await runCompetitorDiscovery(locationId);
      if (!result?.success) {
        setError("Discovery failed. Please try again.");
        return;
      }
      // Reload the list to render the freshly-scraped competitors. The
      // discovery call resolves the practice's own placeId/lat/lng (writes
      // them to `locations`), so the GET that follows picks them up.
      const list = await getLocationCompetitors(locationId);
      if (!list?.success) return;
      setCompetitors(list.competitors);
      setPracticeLocation(list.practiceLocation);
      setSelfFilterStatus(list.selfFilterStatus);
      // Brief pause so the user registers the discovery view before the curate
      // stage takes over.
      stageTransitionTimer.current = window.setTimeout(
        () => setStage("curating"),
        1200
      );
    } catch (err) {
      setError(errorMessage(err, "Discovery failed."));
    }
  }

  // ──────────────────────────────────────────────────────────
  // Stage 2 — Curating: search + add + remove
  // ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!searchInput || searchInput.trim().length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await searchPlaces(searchInput.trim());
        setSearchResults(res?.suggestions ?? []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      if (searchDebounce.current) clearTimeout(searchDebounce.current);
    };
  }, [searchInput]);

  async function handleAdd(suggestion: PlaceSuggestion) {
    try {
      const res = await addLocationCompetitor(locationId, suggestion.placeId);
      if (!res?.success) {
        const msg =
          (res as { message?: string })?.message ||
          "Could not add this competitor.";
        setError(msg);
        return;
      }
      // Re-fetch so we have the canonical row (handles revival of soft-deleted)
      const list = await getLocationCompetitors(locationId);
      if (list?.success) {
        setCompetitors(list.competitors);
        setPracticeLocation(list.practiceLocation);
        setSelfFilterStatus(list.selfFilterStatus);
      }
      setSearchInput("");
      setSearchResults([]);
      setSearchOpen(false);
      setError(null);
    } catch (err) {
      setError(errorMessage(err, "Could not add competitor."));
    }
  }

  async function handleRemove(placeId: string) {
    // Optimistic
    const prev = competitors;
    setCompetitors((c) => c.filter((x) => x.placeId !== placeId));
    try {
      const res = await removeLocationCompetitor(locationId, placeId);
      if (!res?.success) {
        setCompetitors(prev);
        setError("Could not remove competitor.");
      }
    } catch {
      setCompetitors(prev);
      setError("Could not remove competitor.");
    }
  }

  // ──────────────────────────────────────────────────────────
  // Stage 3 — Finalize and run
  // ──────────────────────────────────────────────────────────
  async function handleFinalizeAndRun() {
    setStage("finalizing");
    try {
      const res = await finalizeAndRun(locationId);
      if (!res?.success) {
        setError("Could not start your first ranking. Please try again.");
        setStage("curating");
        return;
      }
      // Redirect to rankings dashboard with batch context
      navigate(`/rankings?batchId=${encodeURIComponent(res.batchId)}`, {
        replace: true,
      });
    } catch (err) {
      setError(errorMessage(err, "Finalize failed."));
      setStage("curating");
    }
  }

  // ──────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────
  if (!validLocationId) {
    return (
      <div className="min-h-screen bg-alloro-bg flex items-center justify-center px-6">
        <div className="text-center">
          <p className="text-alloro-textDark/60 text-sm">Invalid location.</p>
          <button
            onClick={() => navigate("/dashboard")}
            className="mt-4 text-alloro-orange font-bold text-sm"
          >
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-alloro-bg font-body text-alloro-textDark pb-32 selection:bg-alloro-orange selection:text-white">
      <header className="glass-header border-b border-black/5">
        <div className="max-w-[900px] mx-auto px-6 lg:px-10 py-6 flex items-center gap-5">
          <div className="w-10 h-10 bg-alloro-orange text-white rounded-xl flex items-center justify-center shadow-lg">
            <Sparkles size={20} />
          </div>
          <div className="flex flex-col text-left">
            <h1 className="text-[11px] font-black font-heading uppercase tracking-[0.25em] leading-none">
              Competitor Setup
            </h1>
            <span className="text-[9px] font-bold text-alloro-textDark/40 uppercase tracking-widest mt-1.5">
              Practice Ranking v2
            </span>
          </div>
        </div>
      </header>

      <main className="w-full max-w-[900px] mx-auto px-6 lg:px-10 py-10 lg:py-16 space-y-10">
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-red-700 text-sm font-medium">
            {error}
          </div>
        )}

        {stage === "loading" && <LoadingState />}

        {stage === "discovering" && (
          <DiscoveringStage
            competitors={competitors}
            practiceLocation={practiceLocation}
          />
        )}

        {stage === "curating" && (
          <CuratingStage
            competitors={competitors}
            cap={cap}
            searchOpen={searchOpen}
            setSearchOpen={setSearchOpen}
            searchInput={searchInput}
            setSearchInput={setSearchInput}
            searchResults={searchResults}
            searching={searching}
            onAdd={handleAdd}
            onRemove={handleRemove}
            onFinalize={handleFinalizeAndRun}
            practiceLocation={practiceLocation}
            selfFilterStatus={selfFilterStatus}
            selectedPlaceId={selectedPlaceId}
            onSelectFromList={selectFromList}
            onSelectFromPin={selectFromPin}
            registerRowRef={registerRowRef}
            mapWrapperRef={mapWrapperRef}
          />
        )}

        {stage === "finalizing" && <FinalizingState />}
      </main>
    </div>
  );
}

// =====================================================================
// Stage components
// =====================================================================

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-32">
      <Loader2 className="w-10 h-10 text-alloro-orange animate-spin" />
      <p className="mt-4 text-sm text-alloro-textDark/60 font-medium">
        Loading your competitor list…
      </p>
    </div>
  );
}

function FinalizingState() {
  return (
    <div className="flex flex-col items-center justify-center py-32">
      <Loader2 className="w-10 h-10 text-alloro-orange animate-spin" />
      <h2 className="mt-6 text-2xl font-black font-heading text-alloro-navy">
        Locking your list and starting analysis…
      </h2>
      <p className="mt-2 text-sm text-alloro-textDark/60 font-medium max-w-md text-center">
        Hang tight — this typically takes 60–90 seconds. We'll redirect you to
        the dashboard once it's queued.
      </p>
    </div>
  );
}

function DiscoveringStage({
  competitors,
  practiceLocation,
}: {
  competitors: CuratedCompetitor[];
  practiceLocation: PracticeLocationRef | null;
}) {
  return (
    <section className="bg-white rounded-3xl border border-black/5 shadow-premium overflow-hidden">
      <div className="px-8 py-8 border-b border-black/5 text-left">
        <div className="px-2 py-0.5 inline-flex items-center gap-2 bg-alloro-orange/10 rounded-md text-alloro-orange text-[10px] font-black uppercase tracking-widest mb-3">
          <Loader2 className="w-3 h-3 animate-spin" />
          Step 1 of 3
        </div>
        <h2 className="font-display text-2xl md:text-3xl font-medium text-alloro-navy tracking-tight mb-2">
          Discovering competitors near you
        </h2>
        <p className="text-base text-slate-500 font-medium leading-relaxed">
          We're scanning your area for the practices that show up next to you in
          Google. You'll get to choose which ones count.
        </p>
      </div>

      <CompetitorMap
        competitors={competitors}
        practiceLocation={practiceLocation}
        height={480}
        showLoadingFallback
      />

      <div className="px-8 py-6 bg-white border-t border-black/5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500 font-medium">
            {competitors.length === 0
              ? "Searching Google Places…"
              : `Found ${competitors.length} practices nearby`}
          </span>
          <span className="text-alloro-textDark/40 text-xs font-bold uppercase tracking-widest">
            {competitors.length === 0 ? "" : "Locking in your list"}
          </span>
        </div>
      </div>
    </section>
  );
}

function CuratingStage({
  competitors,
  cap,
  searchOpen,
  setSearchOpen,
  searchInput,
  setSearchInput,
  searchResults,
  searching,
  onAdd,
  onRemove,
  onFinalize,
  practiceLocation,
  selfFilterStatus,
  selectedPlaceId,
  onSelectFromList,
  onSelectFromPin,
  registerRowRef,
  mapWrapperRef,
}: {
  competitors: CuratedCompetitor[];
  cap: number;
  searchOpen: boolean;
  setSearchOpen: (v: boolean) => void;
  searchInput: string;
  setSearchInput: (v: string) => void;
  searchResults: PlaceSuggestion[];
  searching: boolean;
  onAdd: (s: PlaceSuggestion) => void;
  onRemove: (placeId: string) => void;
  onFinalize: () => void;
  practiceLocation: PracticeLocationRef | null;
  selfFilterStatus: SelfFilterStatus;
  selectedPlaceId: string | null;
  onSelectFromList: (placeId: string) => void;
  onSelectFromPin: (placeId: string) => void;
  registerRowRef: (placeId: string, el: HTMLLIElement | null) => void;
  mapWrapperRef: React.RefObject<HTMLDivElement | null>;
}) {
  const atCap = competitors.length >= cap;
  const placeIds = useMemo(
    () => new Set(competitors.map((c) => c.placeId)),
    [competitors]
  );

  return (
    <section className="space-y-6">
      <div className="bg-white rounded-3xl border border-black/5 shadow-premium overflow-hidden">
        <div className="px-8 py-8 border-b border-black/5 text-left">
          <div className="px-2 py-0.5 inline-flex items-center gap-2 bg-alloro-navy/10 rounded-md text-alloro-navy text-[10px] font-black uppercase tracking-widest mb-3">
            Step 2 of 3
          </div>
          <h2 className="font-display text-2xl md:text-3xl font-medium text-alloro-navy tracking-tight mb-2">
            Your competitor list
          </h2>
          <p className="text-base text-slate-500 font-medium leading-relaxed">
            Remove any practices that aren't local competitors. Add any we
            missed. Up to <strong>{cap}</strong> competitors.
          </p>
        </div>

        <div ref={mapWrapperRef}>
          <CompetitorMap
            competitors={competitors}
            practiceLocation={practiceLocation}
            height={300}
            selectedPlaceId={selectedPlaceId}
            onPinClick={onSelectFromPin}
          />
        </div>

        {selfFilterStatus === "unresolved" && (
          <div className="mx-8 mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
            <Info
              size={16}
              className="text-amber-600 flex-shrink-0 mt-0.5"
            />
            <p className="text-xs text-amber-900 font-medium leading-relaxed">
              We couldn't automatically detect your practice in this market. If
              your own listing appears below, remove it manually — it'll skew
              your ranking.
            </p>
          </div>
        )}

        <div className="px-8 py-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-bold text-alloro-textDark">
              {competitors.length} / {cap}
            </span>
            <button
              onClick={() => setSearchOpen(!searchOpen)}
              disabled={atCap}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-alloro-orange text-white text-sm font-bold shadow-md hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus size={16} />
              Add competitor
            </button>
          </div>

          {searchOpen && (
            <div className="mb-4 rounded-2xl border border-black/10 bg-slate-50 p-4">
              <div className="flex items-center gap-3 bg-white rounded-xl border border-black/5 px-3 py-2 shadow-sm">
                <Search size={16} className="text-slate-400" />
                <input
                  autoFocus
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search by business name…"
                  className="flex-1 bg-transparent outline-none text-sm font-medium"
                />
                {searching && (
                  <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
                )}
              </div>
              <div className="mt-3 max-h-72 overflow-y-auto space-y-2">
                {searchResults.map((s) => {
                  const already = placeIds.has(s.placeId);
                  return (
                    <button
                      key={s.placeId}
                      disabled={already || atCap}
                      onClick={() => onAdd(s)}
                      className="w-full text-left px-4 py-3 rounded-xl bg-white border border-black/5 hover:border-alloro-orange/50 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-start justify-between gap-3"
                    >
                      <div>
                        <div className="font-bold text-sm text-alloro-textDark">
                          {s.mainText}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {s.secondaryText}
                        </div>
                      </div>
                      {already ? (
                        <CheckCircle2 size={18} className="text-green-500 flex-shrink-0 mt-0.5" />
                      ) : (
                        <Plus size={18} className="text-alloro-orange flex-shrink-0 mt-0.5" />
                      )}
                    </button>
                  );
                })}
                {!searching &&
                  searchInput.trim().length >= 2 &&
                  searchResults.length === 0 && (
                    <p className="text-xs text-slate-500 text-center py-4">
                      No matches. Try a different search term.
                    </p>
                  )}
              </div>
            </div>
          )}

          <ul className="divide-y divide-black/5">
            <AnimatePresence initial={false}>
              {competitors.map((c) => {
                const distanceMi =
                  practiceLocation &&
                  typeof c.lat === "number" &&
                  typeof c.lng === "number"
                    ? haversineMiles(
                        { lat: practiceLocation.lat, lng: practiceLocation.lng },
                        { lat: c.lat, lng: c.lng }
                      )
                    : null;
                const websiteHost = c.website
                  ? (() => {
                      try {
                        return new URL(c.website).host.replace(/^www\./, "");
                      } catch {
                        return c.website;
                      }
                    })()
                  : null;
                return (
                <motion.li
                  key={c.placeId}
                  ref={(el) => registerRowRef(c.placeId, el)}
                  data-selected={selectedPlaceId === c.placeId}
                  layout
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                  onClick={() => onSelectFromList(c.placeId)}
                  className="competitor-row flex items-center justify-between gap-3 py-4 px-2 -mx-2 cursor-pointer hover:bg-slate-50 transition-colors"
                >
                  {c.photoName && (
                    <img
                      src={`/api/practice-ranking/photo?name=${encodeURIComponent(c.photoName)}`}
                      alt=""
                      loading="lazy"
                      className="w-12 h-12 rounded-lg object-cover flex-shrink-0 bg-slate-100"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display =
                          "none";
                      }}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <a
                        href={`https://www.google.com/maps/place/?q=place_id:${c.placeId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="font-bold text-sm text-alloro-textDark hover:text-alloro-orange truncate"
                        title={`Open ${c.name} on Google Maps`}
                      >
                        {c.name}
                      </a>
                      {c.primaryType && (
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">
                          {c.primaryType.replace(/_/g, " ")}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                      {typeof c.rating === "number" && c.rating > 0 && (
                        <span className="flex items-center gap-1 font-bold text-alloro-textDark">
                          <Star
                            size={12}
                            className="fill-yellow-400 text-yellow-400"
                          />
                          {c.rating.toFixed(1)}
                        </span>
                      )}
                      {typeof c.reviewCount === "number" && c.reviewCount > 0 && (
                        <span className="text-slate-500">
                          {c.reviewCount.toLocaleString()} reviews
                        </span>
                      )}
                      {distanceMi !== null && (
                        <span className="flex items-center gap-1 text-slate-500">
                          <MapPin size={11} className="text-slate-400" />
                          {formatDistance(distanceMi)}
                        </span>
                      )}
                      {c.phone && (
                        <a
                          href={`tel:${c.phone.replace(/\s+/g, "")}`}
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 text-slate-500 hover:text-alloro-orange"
                        >
                          <Phone size={11} className="text-slate-400" />
                          {c.phone}
                        </a>
                      )}
                      {websiteHost && c.website && (
                        <a
                          href={c.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 text-slate-500 hover:text-alloro-orange truncate max-w-[180px]"
                        >
                          <Globe size={11} className="text-slate-400" />
                          {websiteHost}
                        </a>
                      )}
                      {c.address && (
                        <span className="truncate text-slate-500">
                          {c.address}
                        </span>
                      )}
                    </div>
                  </div>
                  <span
                    className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md whitespace-nowrap ${
                      c.source === "user_added"
                        ? "bg-alloro-navy/10 text-alloro-navy"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {c.source === "user_added" ? "You added" : "Auto"}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(c.placeId);
                    }}
                    className="w-8 h-8 rounded-lg bg-slate-50 hover:bg-red-50 hover:text-red-600 text-slate-400 flex items-center justify-center transition flex-shrink-0"
                    aria-label={`Remove ${c.name}`}
                  >
                    <X size={14} />
                  </button>
                </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>

          {competitors.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-8">
              Your list is empty. Add competitors above, or run your first
              ranking with no comparison set (your Practice Health score will
              still be calculated against your own data).
            </p>
          )}
        </div>
      </div>

      <div className="bg-alloro-navy rounded-3xl px-8 py-7 shadow-premium flex items-center justify-between gap-4">
        <div>
          <div className="text-[10px] font-black text-white/50 uppercase tracking-widest mb-1">
            Step 3 of 3
          </div>
          <h3 className="text-xl font-black font-heading text-white">
            Run your first ranking
          </h3>
          <p className="text-sm text-white/70 font-medium mt-1">
            Lock your list and start the analysis. You can re-run on the 1st &
            15th of each month.
          </p>
        </div>
        <button
          onClick={onFinalize}
          className="inline-flex items-center gap-2 bg-alloro-orange text-white px-6 py-3 rounded-2xl font-black text-sm shadow-lg hover:shadow-xl transition flex-shrink-0"
        >
          Run ranking
          <ArrowRight size={16} />
        </button>
      </div>
    </section>
  );
}

// =====================================================================
// Shared map component (used by Stage 1 reveal animation + Stage 2 static)
// =====================================================================

function makeCompetitorIcon(index: number, isSelected: boolean): L.DivIcon {
  return L.divIcon({
    className: "alloro-marker-wrapper",
    html: `<div class="alloro-pin alloro-pin-competitor${isSelected ? " is-selected" : ""}">${index + 1}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

function makePracticeIcon(): L.DivIcon {
  return L.divIcon({
    className: "alloro-marker-wrapper",
    html: `<div class="alloro-pin alloro-pin-practice">YOU</div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

// Imperatively pan/zoom to fit the supplied points whenever they change.
// `react-leaflet` doesn't expose a declarative bounds prop on MapContainer
// after first render, so this helper rides inside the map context.
function FitBoundsOnChange({ points }: { points: [number, number][] }) {
  const map = useMap();
  // Stable serialization keeps useEffect from re-running on object identity churn.
  const key = useMemo(() => points.map((p) => p.join(",")).join("|"), [points]);
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 14);
      return;
    }
    map.fitBounds(points, { padding: [40, 40] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}

function CompetitorMap({
  competitors,
  practiceLocation,
  height,
  showLoadingFallback,
  selectedPlaceId,
  onPinClick,
}: {
  competitors: CuratedCompetitor[];
  practiceLocation: PracticeLocationRef | null;
  height: number;
  showLoadingFallback?: boolean;
  selectedPlaceId?: string | null;
  onPinClick?: (placeId: string) => void;
}) {
  const withCoords = useMemo(
    () =>
      competitors.filter(
        (c): c is CuratedCompetitor & { lat: number; lng: number } =>
          typeof c.lat === "number" && typeof c.lng === "number"
      ),
    [competitors]
  );

  const points = useMemo<[number, number][]>(() => {
    const arr: [number, number][] = withCoords.map((c) => [c.lat, c.lng]);
    if (practiceLocation) arr.push([practiceLocation.lat, practiceLocation.lng]);
    return arr;
  }, [withCoords, practiceLocation]);

  // Pre-Leaflet shimmer fallback for the brief discovery window when no
  // coordinates have arrived yet. Once we have any point, render the real map.
  if (points.length === 0) {
    return (
      <div
        className="relative bg-gradient-to-br from-alloro-bg to-slate-50 overflow-hidden"
        style={{ height: `${height}px` }}
      >
        {showLoadingFallback && (
          <>
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="absolute rounded-full border-2 border-alloro-orange/40"
                style={{ left: "50%", top: "50%" }}
                initial={{ width: 0, height: 0, x: 0, y: 0, opacity: 0.8 }}
                animate={{
                  width: 360,
                  height: 360,
                  x: -180,
                  y: -180,
                  opacity: 0,
                }}
                transition={{
                  duration: 2.4,
                  delay: i * 0.8,
                  repeat: Infinity,
                  ease: "easeOut",
                }}
              />
            ))}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
              <div className="w-12 h-12 rounded-full bg-alloro-orange text-white flex items-center justify-center shadow-xl">
                <Loader2 size={20} className="animate-spin" />
              </div>
            </div>
            <div className="absolute left-1/2 bottom-10 -translate-x-1/2 z-10">
              <span className="text-[10px] font-black text-alloro-textDark/50 uppercase tracking-widest">
                Scanning Google for nearby practices…
              </span>
            </div>
          </>
        )}
      </div>
    );
  }

  const initialCenter: [number, number] = points[0];

  return (
    <div
      className="relative bg-gradient-to-br from-alloro-bg to-slate-50 overflow-hidden"
      style={{ height: `${height}px` }}
    >
      <MapContainer
        center={initialCenter}
        zoom={12}
        scrollWheelZoom={false}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <FitBoundsOnChange points={points} />
        {withCoords.map((c, i) => {
          const isSelected = selectedPlaceId === c.placeId;
          return (
            <Marker
              key={c.placeId}
              position={[c.lat, c.lng]}
              icon={makeCompetitorIcon(i, isSelected)}
              zIndexOffset={isSelected ? 1000 : 0}
              eventHandlers={
                onPinClick ? { click: () => onPinClick(c.placeId) } : undefined
              }
            />
          );
        })}
        {practiceLocation && (
          <Marker
            position={[practiceLocation.lat, practiceLocation.lng]}
            icon={makePracticeIcon()}
            zIndexOffset={500}
            interactive={false}
          />
        )}
      </MapContainer>
    </div>
  );
}
