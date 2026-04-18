import { useState, useEffect, useCallback, useRef } from "react";
import {
  X,
  Plus,
  Trash2,
  Loader2,
  Check,
  Search,
  MapPin,
  Star,
  Sparkles,
  RefreshCw,
  Code,
  Layout,
  MessageCircle,
  Globe,
  FileText,
  Image as ImageIcon,
  Stethoscope,
  Briefcase,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import {
  fetchIdentity,
  fetchIdentityStatus,
  startIdentityWarmup,
  updateIdentity,
  proposeIdentityUpdates,
  applyIdentityProposals,
  testUrl,
  type IdentityProposal,
  type BlockCheckResult,
  type ScrapeStrategy,
  type WarmupUrlInput,
  cancelGeneration,
  type ProjectIdentity,
  type ProjectIdentityListEntry,
  type ProjectIdentityLocation,
  type IdentityListName,
  type WarmupInputs,
  type WarmupStatus,
  resyncProjectIdentityList,
  setPrimaryLocation,
  removeProjectLocation,
  resyncProjectLocation,
} from "../../api/websites";
import { searchPlaces, getPlaceDetails } from "../../api/places";
import type { PlaceSuggestion } from "../../api/places";
import ColorPicker from "./ColorPicker";
import GradientPicker from "./GradientPicker";
import type { GradientValue } from "./GradientPicker";
import AddLocationModal from "./AddLocationModal";
import { useConfirm } from "../ui/ConfirmModal";
import { showSuccessToast, showErrorToast } from "../../lib/toast";

type IdentityTab = "summary" | "json" | "chat" | "doctors" | "services" | "locations";

interface IdentityModalProps {
  projectId: string;
  onClose: () => void;
  onIdentityChanged?: (identity: ProjectIdentity) => void;
}

interface UrlInput {
  id: string;
  url: string;
  testing?: boolean;
  testResult?: BlockCheckResult | null;
  strategy?: ScrapeStrategy;
}

interface TextInput {
  id: string;
  label: string;
  text: string;
}

export default function IdentityModal({
  projectId,
  onClose,
  onIdentityChanged,
}: IdentityModalProps) {
  const [loading, setLoading] = useState(true);
  const [identity, setIdentity] = useState<ProjectIdentity | null>(null);
  const [warmupStatus, setWarmupStatus] = useState<WarmupStatus>(null);
  const [error, setError] = useState<string | null>(null);

  // Warmup form state (empty state)
  const [gbpQuery, setGbpQuery] = useState("");
  const [gbpSuggestions, setGbpSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searchingGbp, setSearchingGbp] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<{
    placeId: string;
    name: string;
    address: string;
  } | null>(null);
  const [urlInputs, setUrlInputs] = useState<UrlInput[]>([]);
  const [textInputs, setTextInputs] = useState<TextInput[]>([]);
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#1E40AF");
  const [accentColor, setAccentColor] = useState("#F59E0B");
  const [gradientEnabled, setGradientEnabled] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Ready state
  const [activeTab, setActiveTab] = useState<IdentityTab>("summary");
  const [brandEditing, setBrandEditing] = useState(false);
  const [jsonDraft, setJsonDraft] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [savingJson, setSavingJson] = useState(false);

  // Chat / proposals state
  const [chatInstruction, setChatInstruction] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatToast, setChatToast] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [proposals, setProposals] = useState<IdentityProposal[]>([]);
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());
  const [criticalAcknowledged, setCriticalAcknowledged] = useState(false);
  const [applyingProposals, setApplyingProposals] = useState(false);

  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  // Load identity on mount
  useEffect(() => {
    isMountedRef.current = true;
    const load = async () => {
      try {
        setLoading(true);
        const res = await fetchIdentity(projectId);
        if (!isMountedRef.current) return;
        setIdentity(res.data);
        setWarmupStatus(res.data?.meta?.warmup_status || null);

        if (res.data?.brand?.primary_color) {
          setPrimaryColor(res.data.brand.primary_color);
        }
        if (res.data?.brand?.accent_color) {
          setAccentColor(res.data.brand.accent_color);
        }
        if (res.data?.brand?.gradient_enabled) {
          setGradientEnabled(true);
        }
      } catch (err: any) {
        if (!isMountedRef.current) return;
        setError(err?.message || "Failed to load identity");
      } finally {
        if (isMountedRef.current) setLoading(false);
      }
    };
    load();

    return () => {
      isMountedRef.current = false;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [projectId]);

  // Poll while warmup is running/queued
  useEffect(() => {
    if (warmupStatus !== "running" && warmupStatus !== "queued") return;

    const poll = async () => {
      try {
        const statusRes = await fetchIdentityStatus(projectId);
        if (!isMountedRef.current) return;
        const next = statusRes.data.warmup_status;
        setWarmupStatus(next);
        if (next === "ready" || next === "failed") {
          // Reload full identity
          const res = await fetchIdentity(projectId);
          if (!isMountedRef.current) return;
          setIdentity(res.data);
          if (next === "ready" && res.data) {
            onIdentityChanged?.(res.data);
          }
          return;
        }
        pollRef.current = setTimeout(poll, 2000);
      } catch (err) {
        pollRef.current = setTimeout(poll, 3000);
      }
    };

    pollRef.current = setTimeout(poll, 2000);
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [warmupStatus, projectId, onIdentityChanged]);

  // Debounced GBP search
  useEffect(() => {
    if (!gbpQuery.trim() || gbpQuery.length < 3) {
      setGbpSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        setSearchingGbp(true);
        const response = await searchPlaces(gbpQuery);
        if (isMountedRef.current) setGbpSuggestions(response.suggestions || []);
      } finally {
        if (isMountedRef.current) setSearchingGbp(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [gbpQuery]);

  const handleSelectPlace = async (suggestion: PlaceSuggestion) => {
    try {
      const response = await getPlaceDetails(suggestion.placeId);
      const place = response.place;
      setSelectedPlace({
        placeId: suggestion.placeId,
        name: String(place?.name || suggestion.mainText || suggestion.description),
        address: String(place?.formattedAddress || suggestion.secondaryText || suggestion.description),
      });
      setGbpSuggestions([]);
      setGbpQuery("");
    } catch (err) {
      setError("Failed to load place details");
    }
  };

  const addUrlInput = () => {
    setUrlInputs((prev) => [
      ...prev,
      { id: `url-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, url: "" },
    ]);
  };

  const removeUrlInput = (id: string) => {
    setUrlInputs((prev) => prev.filter((u) => u.id !== id));
  };

  const updateUrlInput = (id: string, url: string) => {
    setUrlInputs((prev) =>
      prev.map((u) =>
        u.id === id ? { ...u, url, testResult: null, strategy: undefined } : u,
      ),
    );
  };

  const setUrlStrategy = (id: string, strategy: ScrapeStrategy) => {
    setUrlInputs((prev) =>
      prev.map((u) => (u.id === id ? { ...u, strategy } : u)),
    );
  };

  const runUrlTest = async (id: string) => {
    const target = urlInputs.find((u) => u.id === id);
    if (!target || !target.url.trim()) return;
    setUrlInputs((prev) =>
      prev.map((u) => (u.id === id ? { ...u, testing: true, testResult: null } : u)),
    );
    try {
      const res = await testUrl(projectId, target.url.trim());
      const result = res.data;
      setUrlInputs((prev) =>
        prev.map((u) =>
          u.id === id
            ? {
                ...u,
                testing: false,
                testResult: result,
                strategy: result.ok
                  ? "fetch"
                  : u.strategy || "browser",
              }
            : u,
        ),
      );
    } catch (err: any) {
      setUrlInputs((prev) =>
        prev.map((u) =>
          u.id === id
            ? {
                ...u,
                testing: false,
                testResult: {
                  ok: false,
                  block_type: "unknown",
                  status: null,
                  detail: err?.message || "Test failed",
                  detected_signals: [],
                },
              }
            : u,
        ),
      );
    }
  };

  const addTextInput = () => {
    setTextInputs((prev) => [
      ...prev,
      {
        id: `text-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        label: "",
        text: "",
      },
    ]);
  };

  const removeTextInput = (id: string) => {
    setTextInputs((prev) => prev.filter((t) => t.id !== id));
  };

  const updateTextInput = (id: string, patch: Partial<Omit<TextInput, "id">>) => {
    setTextInputs((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };

  const handleGenerate = async () => {
    if (submitting) return;

    const hasAnyInput =
      !!selectedPlace ||
      urlInputs.some((u) => u.url.trim()) ||
      textInputs.some((t) => t.text.trim());

    if (!hasAnyInput) {
      setError("Add at least one input: GBP profile, page URL, or text note.");
      return;
    }

    setError(null);
    try {
      setSubmitting(true);
      const inputs: WarmupInputs = {
        placeId: selectedPlace?.placeId,
        urls: urlInputs
          .filter((u) => u.url.trim())
          .map((u): WarmupUrlInput | string => {
            const trimmed = u.url.trim();
            if (u.strategy && u.strategy !== "fetch") {
              return { url: trimmed, strategy: u.strategy };
            }
            return trimmed;
          }),
        texts: textInputs
          .filter((t) => t.text.trim())
          .map((t) => ({ label: t.label.trim() || undefined, text: t.text.trim() })),
        logoUrl: logoUrl.trim() || undefined,
        primaryColor,
        accentColor,
        gradient: gradientEnabled
          ? { enabled: true, from: primaryColor, to: accentColor, direction: "to-br" }
          : { enabled: false },
      };

      await startIdentityWarmup(projectId, inputs);
      setWarmupStatus("queued");
    } catch (err: any) {
      setError(err?.message || "Failed to start warmup");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm("Cancel the running warmup?")) return;
    try {
      await cancelGeneration(projectId);
      setWarmupStatus("failed");
    } catch (err: any) {
      setError(err?.message || "Failed to cancel");
    }
  };

  const handleJsonTabOpen = () => {
    if (identity) setJsonDraft(JSON.stringify(identity, null, 2));
    setJsonError(null);
    setActiveTab("json");
  };

  const handleJsonSave = async () => {
    setJsonError(null);
    let parsed: ProjectIdentity;
    try {
      parsed = JSON.parse(jsonDraft);
    } catch (err) {
      setJsonError("Invalid JSON.");
      return;
    }
    try {
      setSavingJson(true);
      const res = await updateIdentity(projectId, parsed);
      setIdentity(res.data);
      onIdentityChanged?.(res.data);
      setChatToast({ type: "success", text: "Identity saved." });
    } catch (err: any) {
      setJsonError(err?.message || "Save failed");
    } finally {
      setSavingJson(false);
    }
  };

  const handleSaveBrand = async (nextBrand: ProjectIdentity["brand"]) => {
    if (!identity) return;
    const updated: ProjectIdentity = {
      ...identity,
      brand: nextBrand,
      last_updated_at: new Date().toISOString(),
    };
    const res = await updateIdentity(projectId, updated);
    setIdentity(res.data);
    onIdentityChanged?.(res.data);
    setChatToast({ type: "success", text: "Brand updated." });
  };

  const handleChatSubmit = async () => {
    const instruction = chatInstruction.trim();
    if (!instruction || chatLoading) return;
    setChatLoading(true);
    setProposals([]);
    setApprovedIds(new Set());
    setCriticalAcknowledged(false);
    try {
      const res = await proposeIdentityUpdates(projectId, instruction);
      const returned = res.data.proposals || [];
      setProposals(returned);
      // Default: approve all non-critical, leave critical unchecked
      const defaultApproved = new Set<string>(
        returned.filter((p) => !p.critical).map((p) => p.id),
      );
      setApprovedIds(defaultApproved);
      if (returned.length === 0) {
        setChatToast({
          type: "info",
          text: "No changes proposed. Try a more specific instruction.",
        });
      }
    } catch (err: any) {
      setChatToast({ type: "error", text: err?.message || "Failed to propose updates" });
    } finally {
      setChatLoading(false);
    }
  };

  const toggleProposalApproved = (id: string) => {
    setApprovedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleApplyProposals = async () => {
    if (applyingProposals) return;
    const approved = proposals.filter((p) => approvedIds.has(p.id));
    if (approved.length === 0) {
      setChatToast({ type: "info", text: "No proposals approved." });
      return;
    }
    // Critical confirmation gate
    const anyCritical = approved.some((p) => p.critical);
    if (anyCritical && !criticalAcknowledged) {
      setChatToast({
        type: "error",
        text: "Please confirm you understand the critical changes before applying.",
      });
      return;
    }
    try {
      setApplyingProposals(true);
      const res = await applyIdentityProposals(projectId, approved);
      setIdentity(res.data.identity);
      onIdentityChanged?.(res.data.identity);
      const msg = `Applied ${res.data.appliedCount} of ${approved.length} changes${
        res.data.skippedCount > 0 ? `. ${res.data.skippedCount} skipped.` : ""
      }`;
      setChatToast({ type: "success", text: msg });
      setProposals([]);
      setApprovedIds(new Set());
      setCriticalAcknowledged(false);
      setChatInstruction("");
    } catch (err: any) {
      setChatToast({ type: "error", text: err?.message || "Failed to apply proposals" });
    } finally {
      setApplyingProposals(false);
    }
  };

  const handleDiscardProposals = () => {
    setProposals([]);
    setApprovedIds(new Set());
    setCriticalAcknowledged(false);
  };

  // Auto-dismiss toast after 4s
  useEffect(() => {
    if (!chatToast) return;
    const t = setTimeout(() => setChatToast(null), 4000);
    return () => clearTimeout(t);
  }, [chatToast]);

  const isWarming = warmupStatus === "running" || warmupStatus === "queued";
  const isReady = warmupStatus === "ready" && !!identity?.business;
  const isEmpty = !isWarming && !isReady;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={!submitting && !isWarming ? onClose : undefined}
      />
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-3xl rounded-2xl bg-white shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-alloro-orange" />
              <h2 className="text-lg font-bold text-gray-900">Project Identity</h2>
              {isReady && (
                <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                  <Check className="h-3 w-3" /> Ready
                </span>
              )}
              {isWarming && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                  <Loader2 className="h-3 w-3 animate-spin" /> Warming up
                </span>
              )}
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <div className="max-h-[75vh] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : isEmpty ? (
              <EmptyWarmupForm
                gbpQuery={gbpQuery}
                setGbpQuery={setGbpQuery}
                gbpSuggestions={gbpSuggestions}
                searchingGbp={searchingGbp}
                selectedPlace={selectedPlace}
                clearSelectedPlace={() => setSelectedPlace(null)}
                onSelectPlace={handleSelectPlace}
                urlInputs={urlInputs}
                addUrlInput={addUrlInput}
                removeUrlInput={removeUrlInput}
                updateUrlInput={updateUrlInput}
                runUrlTest={runUrlTest}
                setUrlStrategy={setUrlStrategy}
                textInputs={textInputs}
                addTextInput={addTextInput}
                removeTextInput={removeTextInput}
                updateTextInput={updateTextInput}
                logoUrl={logoUrl}
                setLogoUrl={setLogoUrl}
                primaryColor={primaryColor}
                setPrimaryColor={setPrimaryColor}
                accentColor={accentColor}
                setAccentColor={setAccentColor}
                gradientEnabled={gradientEnabled}
                setGradientEnabled={setGradientEnabled}
                error={error}
                submitting={submitting}
                onGenerate={handleGenerate}
                onCancel={onClose}
              />
            ) : isWarming ? (
              <WarmingUpView
                status={warmupStatus}
                onCancel={handleCancel}
              />
            ) : isReady && identity ? (
              <ReadyView
                projectId={projectId}
                identity={identity}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                onJsonTabOpen={handleJsonTabOpen}
                jsonDraft={jsonDraft}
                setJsonDraft={setJsonDraft}
                jsonError={jsonError}
                savingJson={savingJson}
                onJsonSave={handleJsonSave}
                chatInstruction={chatInstruction}
                setChatInstruction={setChatInstruction}
                chatLoading={chatLoading}
                chatToast={chatToast}
                onChatSubmit={handleChatSubmit}
                proposals={proposals}
                approvedIds={approvedIds}
                onToggleProposal={toggleProposalApproved}
                criticalAcknowledged={criticalAcknowledged}
                setCriticalAcknowledged={setCriticalAcknowledged}
                applyingProposals={applyingProposals}
                onApplyProposals={handleApplyProposals}
                onDiscardProposals={handleDiscardProposals}
                brandEditing={brandEditing}
                setBrandEditing={setBrandEditing}
                onSaveBrand={handleSaveBrand}
                onIdentityRefresh={(next) => {
                  setIdentity(next);
                  onIdentityChanged?.(next);
                }}
                onRerun={() => {
                  if (confirm("Re-run warmup? This will replace the current identity.")) {
                    setWarmupStatus(null);
                    setIdentity(null);
                  }
                }}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EmptyWarmupForm — the warmup inputs form
// ---------------------------------------------------------------------------

interface EmptyFormProps {
  gbpQuery: string;
  setGbpQuery: (v: string) => void;
  gbpSuggestions: PlaceSuggestion[];
  searchingGbp: boolean;
  selectedPlace: { placeId: string; name: string; address: string } | null;
  clearSelectedPlace: () => void;
  onSelectPlace: (s: PlaceSuggestion) => void;
  urlInputs: UrlInput[];
  addUrlInput: () => void;
  removeUrlInput: (id: string) => void;
  updateUrlInput: (id: string, url: string) => void;
  runUrlTest: (id: string) => void;
  setUrlStrategy: (id: string, strategy: ScrapeStrategy) => void;
  textInputs: TextInput[];
  addTextInput: () => void;
  removeTextInput: (id: string) => void;
  updateTextInput: (id: string, patch: Partial<Omit<TextInput, "id">>) => void;
  logoUrl: string;
  setLogoUrl: (v: string) => void;
  primaryColor: string;
  setPrimaryColor: (v: string) => void;
  accentColor: string;
  setAccentColor: (v: string) => void;
  gradientEnabled: boolean;
  setGradientEnabled: (v: boolean) => void;
  error: string | null;
  submitting: boolean;
  onGenerate: () => void;
  onCancel: () => void;
}

function EmptyWarmupForm(props: EmptyFormProps) {
  return (
    <div className="px-6 py-5 space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-1">
          Tell us about this practice
        </h3>
        <p className="text-xs text-gray-500">
          Combine any of: a Google Business Profile, page URLs to scrape, and plain-text notes.
          All inputs are optional but at least one is required.
        </p>
      </div>

      {/* GBP */}
      <section>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 mb-2">
          <MapPin className="h-3.5 w-3.5" /> Google Business Profile
        </label>
        {props.selectedPlace ? (
          <div className="flex items-start justify-between rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-900 truncate">{props.selectedPlace.name}</div>
              <div className="text-xs text-gray-500 truncate">{props.selectedPlace.address}</div>
            </div>
            <button
              onClick={props.clearSelectedPlace}
              className="text-xs text-gray-400 hover:text-red-600 ml-2 shrink-0"
            >
              Change
            </button>
          </div>
        ) : (
          <div className="relative">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={props.gbpQuery}
                onChange={(e) => props.setGbpQuery(e.target.value)}
                placeholder="Search for your business..."
                className="w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-alloro-orange/30 focus:border-alloro-orange"
              />
              {props.searchingGbp && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
              )}
            </div>
            {props.gbpSuggestions.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden">
                {props.gbpSuggestions.map((s) => (
                  <button
                    key={s.placeId}
                    onClick={() => props.onSelectPlace(s)}
                    className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0"
                  >
                    <div className="font-medium text-gray-900">{s.mainText || s.description}</div>
                    {s.secondaryText && (
                      <div className="text-xs text-gray-500 truncate">{s.secondaryText}</div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* URLs */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
            <Globe className="h-3.5 w-3.5" /> Page URLs to scrape
          </label>
          <button
            onClick={props.addUrlInput}
            className="inline-flex items-center gap-1 text-xs text-alloro-orange hover:text-orange-600 font-medium"
          >
            <Plus className="h-3.5 w-3.5" /> Add URL
          </button>
        </div>
        {props.urlInputs.length === 0 ? (
          <p className="text-xs text-gray-400 italic">No URLs added.</p>
        ) : (
          <div className="space-y-2">
            {props.urlInputs.map((u) => (
              <UrlInputRow
                key={u.id}
                input={u}
                onChange={(url) => props.updateUrlInput(u.id, url)}
                onRemove={() => props.removeUrlInput(u.id)}
                onTest={() => props.runUrlTest(u.id)}
                onSetStrategy={(strategy) => props.setUrlStrategy(u.id, strategy)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Text */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
            <FileText className="h-3.5 w-3.5" /> Plain-text notes
          </label>
          <button
            onClick={props.addTextInput}
            className="inline-flex items-center gap-1 text-xs text-alloro-orange hover:text-orange-600 font-medium"
          >
            <Plus className="h-3.5 w-3.5" /> Add text
          </button>
        </div>
        {props.textInputs.length === 0 ? (
          <p className="text-xs text-gray-400 italic">No text notes added.</p>
        ) : (
          <div className="space-y-2">
            {props.textInputs.map((t) => (
              <div key={t.id} className="rounded-lg border border-gray-200 p-2 space-y-1">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={t.label}
                    onChange={(e) => props.updateTextInput(t.id, { label: e.target.value })}
                    placeholder="Label (optional, e.g., 'Founder note')"
                    className="flex-1 rounded border-0 px-0 py-1 text-xs text-gray-700 focus:outline-none focus:ring-0 placeholder:text-gray-400"
                  />
                  <button
                    onClick={() => props.removeTextInput(t.id)}
                    className="p-1 text-gray-400 hover:text-red-600 rounded hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <textarea
                  value={t.text}
                  onChange={(e) => props.updateTextInput(t.id, { text: e.target.value })}
                  placeholder="Paste content or write notes about the practice..."
                  rows={3}
                  className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-alloro-orange/30"
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Logo */}
      <section>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 mb-2">
          <ImageIcon className="h-3.5 w-3.5" /> Logo URL (optional)
        </label>
        <input
          type="url"
          value={props.logoUrl}
          onChange={(e) => props.setLogoUrl(e.target.value)}
          placeholder="https://example.com/logo.png"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-alloro-orange/30"
        />
        <p className="text-[11px] text-gray-400 mt-1">
          Downloaded, hosted on S3, and used in generated layouts.
        </p>
      </section>

      {/* Brand colors */}
      <section>
        <label className="text-xs font-semibold text-gray-700 mb-2 block">Brand colors</label>
        <div className="grid grid-cols-2 gap-3">
          <ColorPicker
            value={props.primaryColor}
            onChange={props.setPrimaryColor}
            label="Primary"
          />
          <ColorPicker
            value={props.accentColor}
            onChange={props.setAccentColor}
            label="Accent"
          />
        </div>
        <label className="flex items-center gap-2 mt-3 text-xs text-gray-600">
          <input
            type="checkbox"
            checked={props.gradientEnabled}
            onChange={(e) => props.setGradientEnabled(e.target.checked)}
            className="rounded"
          />
          Use gradient between primary and accent
        </label>
      </section>

      {props.error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {props.error}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-100">
        <button
          onClick={props.onCancel}
          disabled={props.submitting}
          className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800"
        >
          Cancel
        </button>
        <button
          onClick={props.onGenerate}
          disabled={props.submitting}
          className="inline-flex items-center gap-1.5 rounded-lg bg-alloro-orange px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {props.submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Starting...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" /> Generate Identity
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WarmingUpView — shown while warmup is in progress
// ---------------------------------------------------------------------------

function WarmingUpView({
  status,
  onCancel,
}: {
  status: WarmupStatus;
  onCancel: () => void;
}) {
  return (
    <div className="px-6 py-16 flex flex-col items-center justify-center text-center space-y-4">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-amber-200 blur-xl opacity-40 animate-pulse" />
        <div className="relative rounded-full bg-amber-500 p-4">
          <Sparkles className="h-6 w-6 text-white" />
        </div>
      </div>
      <div>
        <div className="text-base font-semibold text-gray-900">
          {status === "queued" ? "Queued..." : "Analyzing sources..."}
        </div>
        <div className="text-sm text-gray-500 mt-1">
          Scraping, analyzing images, classifying the practice, distilling content.
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        This usually takes 1-3 minutes.
      </div>
      <button
        onClick={onCancel}
        className="text-xs font-medium text-red-600 hover:text-red-800 px-3 py-1.5 rounded-lg border border-red-200 hover:bg-red-50"
      >
        Cancel
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ReadyView — tabs: summary, json, chat
// ---------------------------------------------------------------------------

interface ReadyViewProps {
  projectId: string;
  identity: ProjectIdentity;
  activeTab: IdentityTab;
  setActiveTab: (tab: IdentityTab) => void;
  onJsonTabOpen: () => void;
  jsonDraft: string;
  setJsonDraft: (v: string) => void;
  jsonError: string | null;
  savingJson: boolean;
  onJsonSave: () => void;
  chatInstruction: string;
  setChatInstruction: (v: string) => void;
  chatLoading: boolean;
  chatToast: { type: "success" | "error" | "info"; text: string } | null;
  onChatSubmit: () => void;
  proposals: IdentityProposal[];
  approvedIds: Set<string>;
  onToggleProposal: (id: string) => void;
  criticalAcknowledged: boolean;
  setCriticalAcknowledged: (v: boolean) => void;
  applyingProposals: boolean;
  onApplyProposals: () => void;
  onDiscardProposals: () => void;
  onRerun: () => void;
  onSaveBrand: (brand: ProjectIdentity["brand"]) => Promise<void>;
  brandEditing: boolean;
  setBrandEditing: (v: boolean) => void;
  /** Called when a tab mutates identity (e.g. add/remove location, resync list). */
  onIdentityRefresh: (next: ProjectIdentity) => void;
}

function ReadyView(props: ReadyViewProps) {
  const { identity } = props;
  const doctors: ProjectIdentityListEntry[] = Array.isArray(
    identity.content_essentials?.doctors,
  )
    ? (identity.content_essentials!.doctors as ProjectIdentityListEntry[])
    : [];
  const services: ProjectIdentityListEntry[] = Array.isArray(
    identity.content_essentials?.services,
  )
    ? (identity.content_essentials!.services as ProjectIdentityListEntry[])
    : [];
  const locations: ProjectIdentityLocation[] = Array.isArray(
    (identity as any).locations,
  )
    ? ((identity as any).locations as ProjectIdentityLocation[])
    : [];

  return (
    <div className="flex flex-col">
      {/* Tabs */}
      <div className="flex items-center gap-1 px-6 pt-3 border-b border-gray-100 overflow-x-auto">
        <TabButton
          active={props.activeTab === "summary"}
          onClick={() => props.setActiveTab("summary")}
          icon={<Layout className="h-3.5 w-3.5" />}
          label="Summary"
        />
        <TabButton
          active={props.activeTab === "json"}
          onClick={props.brandEditing ? () => {} : props.onJsonTabOpen}
          icon={<Code className="h-3.5 w-3.5" />}
          label="JSON"
          disabled={props.brandEditing}
          title={props.brandEditing ? "Save or cancel brand edits first" : undefined}
        />
        <TabButton
          active={props.activeTab === "chat"}
          onClick={() => props.setActiveTab("chat")}
          icon={<MessageCircle className="h-3.5 w-3.5" />}
          label="Chat Update"
        />
        <TabButton
          active={props.activeTab === "doctors"}
          onClick={() => props.setActiveTab("doctors")}
          icon={<Stethoscope className="h-3.5 w-3.5" />}
          label={`Doctors${doctors.length ? ` (${doctors.length})` : ""}`}
        />
        <TabButton
          active={props.activeTab === "services"}
          onClick={() => props.setActiveTab("services")}
          icon={<Briefcase className="h-3.5 w-3.5" />}
          label={`Services${services.length ? ` (${services.length})` : ""}`}
        />
        <TabButton
          active={props.activeTab === "locations"}
          onClick={() => props.setActiveTab("locations")}
          icon={<MapPin className="h-3.5 w-3.5" />}
          label={`Locations${locations.length ? ` (${locations.length})` : ""}`}
        />
        <div className="flex-1" />
        <button
          onClick={props.onRerun}
          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded shrink-0"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Re-run warmup
        </button>
      </div>

      {/* Tab content */}
      <div className="p-6">
        {props.activeTab === "summary" && (
          <IdentitySummary
            identity={identity}
            brandEditing={props.brandEditing}
            setBrandEditing={props.setBrandEditing}
            onSaveBrand={props.onSaveBrand}
          />
        )}
        {props.activeTab === "json" && (
          <IdentityJsonEditor
            draft={props.jsonDraft}
            setDraft={props.setJsonDraft}
            error={props.jsonError}
            saving={props.savingJson}
            onSave={props.onJsonSave}
          />
        )}
        {props.activeTab === "chat" && (
          <IdentityChat
            instruction={props.chatInstruction}
            setInstruction={props.setChatInstruction}
            loading={props.chatLoading}
            toast={props.chatToast}
            onSubmit={props.onChatSubmit}
            proposals={props.proposals}
            approvedIds={props.approvedIds}
            onToggleProposal={props.onToggleProposal}
            criticalAcknowledged={props.criticalAcknowledged}
            setCriticalAcknowledged={props.setCriticalAcknowledged}
            applyingProposals={props.applyingProposals}
            onApplyProposals={props.onApplyProposals}
            onDiscardProposals={props.onDiscardProposals}
          />
        )}
        {props.activeTab === "doctors" && (
          <IdentityListTab
            projectId={props.projectId}
            list="doctors"
            entries={doctors}
            onIdentityChange={props.onIdentityRefresh}
          />
        )}
        {props.activeTab === "services" && (
          <IdentityListTab
            projectId={props.projectId}
            list="services"
            entries={services}
            onIdentityChange={props.onIdentityRefresh}
          />
        )}
        {props.activeTab === "locations" && (
          <IdentityLocationsTab
            projectId={props.projectId}
            locations={locations}
            onIdentityChange={props.onIdentityRefresh}
          />
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  disabled,
  title,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t border-b-2 transition ${
        active
          ? "text-alloro-orange border-alloro-orange"
          : disabled
            ? "text-gray-300 border-transparent cursor-not-allowed"
            : "text-gray-500 border-transparent hover:text-gray-700"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function IdentitySummary({
  identity,
  brandEditing,
  setBrandEditing,
  onSaveBrand,
}: {
  identity: ProjectIdentity;
  brandEditing: boolean;
  setBrandEditing: (v: boolean) => void;
  onSaveBrand: (brand: ProjectIdentity["brand"]) => Promise<void>;
}) {
  const b = identity.business;
  const br = identity.brand;
  const v = identity.voice_and_tone;
  const ce = identity.content_essentials;
  const hoursRows = normalizeHours((b as any)?.hours);

  return (
    <div className="space-y-4">
      <SummarySection title="Business">
        <SummaryRow label="Name" value={b?.name} />
        <SummaryRow label="Category" value={b?.category} />
        <SummaryRow label="Phone" value={b?.phone} />
        <SummaryRow label="Address" value={b?.address} />
        <SummaryRow
          label="Rating"
          value={b?.rating ? `${b.rating}★ (${b?.review_count || 0} reviews)` : null}
        />
        <HoursRow rows={hoursRows} />
      </SummarySection>

      <BrandEditableSection
        brand={br}
        editing={brandEditing}
        setEditing={setBrandEditing}
        onSave={onSaveBrand}
      />

      <SummarySection title="Voice & Tone">
        <SummaryRow label="Archetype" value={v?.archetype} />
        <SummaryRow label="Tone" value={v?.tone_descriptor} />
      </SummarySection>

      <SummarySection title="Content Essentials">
        <SummaryRow label="UVP" value={ce?.unique_value_proposition} />
        <SummaryRow
          label="Certifications"
          value={ce?.certifications?.length ? ce.certifications.join(", ") : null}
        />
        <SummaryRow
          label="Service areas"
          value={ce?.service_areas?.length ? ce.service_areas.join(", ") : null}
        />
        <SummaryRow
          label="Images analyzed"
          value={identity.extracted_assets?.images?.length || 0}
        />
      </SummarySection>
    </div>
  );
}

function BrandEditableSection({
  brand,
  editing,
  setEditing,
  onSave,
}: {
  brand: ProjectIdentity["brand"];
  editing: boolean;
  setEditing: (v: boolean) => void;
  onSave: (brand: ProjectIdentity["brand"]) => Promise<void>;
}) {
  const [primary, setPrimary] = useState<string>(brand?.primary_color || "#1E40AF");
  const [accent, setAccent] = useState<string>(brand?.accent_color || "#F59E0B");
  const [gradient, setGradient] = useState<GradientValue>({
    enabled: !!brand?.gradient_enabled,
    from: brand?.gradient_from || brand?.primary_color || "#1E40AF",
    to: brand?.gradient_to || brand?.accent_color || "#F59E0B",
    direction:
      (brand?.gradient_direction as GradientValue["direction"]) || "to-br",
    text_color: (brand?.gradient_text_color as "white" | "dark") || "white",
    preset:
      (brand?.gradient_preset as GradientValue["preset"]) || "smooth",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-sync from prop when editing opens
  useEffect(() => {
    if (!editing) return;
    setPrimary(brand?.primary_color || "#1E40AF");
    setAccent(brand?.accent_color || "#F59E0B");
    setGradient({
      enabled: !!brand?.gradient_enabled,
      from: brand?.gradient_from || brand?.primary_color || "#1E40AF",
      to: brand?.gradient_to || brand?.accent_color || "#F59E0B",
      direction:
        (brand?.gradient_direction as GradientValue["direction"]) || "to-br",
      text_color: (brand?.gradient_text_color as "white" | "dark") || "white",
      preset:
        (brand?.gradient_preset as GradientValue["preset"]) || "smooth",
    });
    setError(null);
  }, [editing, brand]);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      await onSave({
        ...(brand || {}),
        primary_color: primary,
        accent_color: accent,
        gradient_enabled: gradient.enabled,
        gradient_from: gradient.enabled ? gradient.from : null,
        gradient_to: gradient.enabled ? gradient.to : null,
        gradient_direction: gradient.direction,
        gradient_text_color: gradient.enabled ? gradient.text_color : null,
        gradient_preset: gradient.enabled ? gradient.preset : null,
      });
      setEditing(false);
    } catch (err: any) {
      setError(err?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
          Brand
        </h4>
        {!editing ? (
          <button
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 text-xs font-medium text-alloro-orange hover:text-orange-600"
          >
            Edit
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditing(false)}
              disabled={saving}
              className="text-xs font-medium text-gray-500 hover:text-gray-800 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-lg bg-alloro-orange px-3 py-1 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" /> Saving
                </>
              ) : (
                "Save"
              )}
            </button>
          </div>
        )}
      </div>

      {!editing ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <ColorSwatch label="Primary" color={brand?.primary_color} />
            <ColorSwatch label="Accent" color={brand?.accent_color} />
          </div>
          {brand?.gradient_enabled && (
            <div className="mt-3 text-xs text-gray-500">
              Gradient: {brand.gradient_from || "?"} → {brand.gradient_to || "?"} ({brand.gradient_direction})
            </div>
          )}
          {brand?.logo_s3_url && (
            <div className="mt-3 flex items-center gap-2">
              <img
                src={brand.logo_s3_url}
                alt="Logo"
                className="h-10 w-10 object-contain rounded bg-gray-50"
              />
              <span className="text-xs text-gray-500">Logo hosted</span>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <ColorPicker value={primary} onChange={setPrimary} label="Primary" />
            <ColorPicker value={accent} onChange={setAccent} label="Accent" />
          </div>
          <GradientPicker
            value={gradient}
            onChange={setGradient}
            defaultFrom={primary}
            defaultTo={accent}
          />
          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SummarySection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3">
        {title}
      </h4>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-gray-500 shrink-0 min-w-[120px]">{label}</span>
      <span className="text-gray-900 text-right">
        {value === null || value === undefined || value === ""
          ? <span className="text-gray-300 italic">—</span>
          : value}
      </span>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Hours normalization + row renderer
// GBP can return hours in a few shapes; normalize to a Mon-Sun ordered list.
// -----------------------------------------------------------------------------

const DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
type DayName = (typeof DAY_ORDER)[number];

// GBP periods[] uses 0=Sunday. Map to our Monday-first labels.
const WEEKDAY_INDEX_TO_NAME: Record<number, DayName> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};

function normalizeHours(raw: unknown): Array<{ day: DayName; text: string }> {
  const empty: Array<{ day: DayName; text: string }> = [];
  if (!raw) return empty;

  // Shape A: array of display strings — e.g. ["Monday: 9:00 AM – 5:00 PM", ...]
  if (Array.isArray(raw) && raw.every((r) => typeof r === "string")) {
    const byDay = new Map<DayName, string>();
    for (const line of raw as string[]) {
      const match = line.match(/^\s*(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\s*[:\-–]\s*(.+?)\s*$/i);
      if (!match) continue;
      const prefix = match[1].toLowerCase().slice(0, 3);
      const day = DAY_ORDER.find((d) => d.toLowerCase().startsWith(prefix));
      if (!day) continue;
      byDay.set(day, match[2].trim());
    }
    if (byDay.size > 0) {
      return DAY_ORDER.map((day) => ({ day, text: byDay.get(day) || "Closed" }));
    }
  }

  // Shape B: openingHours object with weekdayDescriptions: string[]
  if (typeof raw === "object" && raw !== null) {
    const obj = raw as Record<string, unknown>;
    const descriptions = obj.weekdayDescriptions;
    if (Array.isArray(descriptions) && descriptions.every((d) => typeof d === "string")) {
      return normalizeHours(descriptions);
    }

    // Shape C: openingHours.periods[] — [{open:{day,hour,minute}, close:{...}}]
    const periods = obj.periods;
    if (Array.isArray(periods)) {
      const byDay = new Map<DayName, string[]>();
      for (const p of periods as Array<Record<string, any>>) {
        const open = p?.open;
        const close = p?.close;
        if (!open || typeof open !== "object") continue;
        const dayIdx = typeof open.day === "number" ? open.day : -1;
        const day = WEEKDAY_INDEX_TO_NAME[dayIdx];
        if (!day) continue;
        const openStr = formatPeriodTime(open.hour, open.minute);
        const closeStr = close ? formatPeriodTime(close.hour, close.minute) : null;
        const range = closeStr ? `${openStr} – ${closeStr}` : `${openStr} (open 24h)`;
        const existing = byDay.get(day) || [];
        existing.push(range);
        byDay.set(day, existing);
      }
      if (byDay.size > 0) {
        return DAY_ORDER.map((day) => ({
          day,
          text: (byDay.get(day) || []).join(", ") || "Closed",
        }));
      }
    }
  }

  return empty;
}

function formatPeriodTime(hour: unknown, minute: unknown): string {
  const h = typeof hour === "number" ? hour : 0;
  const m = typeof minute === "number" ? minute : 0;
  const suffix = h >= 12 ? "PM" : "AM";
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const mm = m.toString().padStart(2, "0");
  return `${displayH}:${mm} ${suffix}`;
}

function HoursRow({ rows }: { rows: Array<{ day: DayName; text: string }> }) {
  if (rows.length === 0) {
    return (
      <div className="flex items-start justify-between gap-3 text-sm">
        <span className="text-gray-500 shrink-0 min-w-[120px]">Hours</span>
        <span className="text-gray-400 italic text-right">Not provided</span>
      </div>
    );
  }
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-gray-500 shrink-0 min-w-[120px]">Hours</span>
      <div className="text-gray-900 text-right space-y-0.5">
        {rows.map((r) => (
          <div key={r.day} className="flex items-center justify-end gap-3">
            <span className="text-gray-500 text-xs w-20 text-left">{r.day.slice(0, 3)}</span>
            <span className="text-gray-900">{r.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ColorSwatch({
  label,
  color,
}: {
  label: string;
  color: string | null | undefined;
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-8 w-8 rounded border border-gray-200"
        style={{ backgroundColor: color || "transparent" }}
      />
      <div>
        <div className="text-xs text-gray-500">{label}</div>
        <div className="text-sm font-mono text-gray-900">{color || "—"}</div>
      </div>
    </div>
  );
}

function IdentityJsonEditor({
  draft,
  setDraft,
  error,
  saving,
  onSave,
}: {
  draft: string;
  setDraft: (v: string) => void;
  error: string | null;
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Edit the full identity JSON directly. Validated and saved to the database.
      </p>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={24}
        className="w-full font-mono text-xs border border-gray-200 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-alloro-orange/30"
      />
      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </div>
      )}
      <div className="flex items-center justify-end">
        <button
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-alloro-orange px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Saving...
            </>
          ) : (
            "Save JSON"
          )}
        </button>
      </div>
    </div>
  );
}

function IdentityChat({
  instruction,
  setInstruction,
  loading,
  toast,
  onSubmit,
  proposals,
  approvedIds,
  onToggleProposal,
  criticalAcknowledged,
  setCriticalAcknowledged,
  applyingProposals,
  onApplyProposals,
  onDiscardProposals,
}: {
  instruction: string;
  setInstruction: (v: string) => void;
  loading: boolean;
  toast: { type: "success" | "error" | "info"; text: string } | null;
  onSubmit: () => void;
  proposals: IdentityProposal[];
  approvedIds: Set<string>;
  onToggleProposal: (id: string) => void;
  criticalAcknowledged: boolean;
  setCriticalAcknowledged: (v: boolean) => void;
  applyingProposals: boolean;
  onApplyProposals: () => void;
  onDiscardProposals: () => void;
}) {
  const handleKey = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onSubmit();
      }
    },
    [onSubmit],
  );

  const hasProposals = proposals.length > 0;
  const anyApprovedCritical = proposals.some(
    (p) => p.critical && approvedIds.has(p.id),
  );
  const canApply =
    approvedIds.size > 0 && (!anyApprovedCritical || criticalAcknowledged);

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Describe what you want to change ("change accent to navy", "mark us as pediatric",
        "add ADA to certifications"). The LLM returns a list of proposed changes for you to review
        before any update is applied.
      </p>

      <div className="flex items-start gap-2">
        <textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={handleKey}
          rows={3}
          placeholder="e.g., Change the accent color to #0D9488"
          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-alloro-orange/30"
          disabled={loading || applyingProposals}
        />
        <button
          onClick={onSubmit}
          disabled={loading || applyingProposals || !instruction.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-alloro-orange px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Proposing
            </>
          ) : (
            "Propose Changes"
          )}
        </button>
      </div>

      {hasProposals && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-900">
              {proposals.length} proposed change{proposals.length === 1 ? "" : "s"}
            </div>
            <div className="text-xs text-gray-500">
              {approvedIds.size} approved
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 overflow-hidden">
            {proposals.map((p) => (
              <ProposalRow
                key={p.id}
                proposal={p}
                approved={approvedIds.has(p.id)}
                onToggle={() => onToggleProposal(p.id)}
              />
            ))}
          </div>

          {anyApprovedCritical && (
            <label className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 cursor-pointer">
              <input
                type="checkbox"
                checked={criticalAcknowledged}
                onChange={(e) => setCriticalAcknowledged(e.target.checked)}
                className="mt-0.5 rounded"
              />
              <span>
                I understand the critical changes (red badges above) may affect existing generated pages or the GBP link, and want to apply them anyway.
              </span>
            </label>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              onClick={onDiscardProposals}
              disabled={applyingProposals}
              className="text-xs font-medium text-gray-500 hover:text-gray-800 px-3 py-1.5"
            >
              Discard
            </button>
            <button
              onClick={onApplyProposals}
              disabled={!canApply || applyingProposals}
              className="inline-flex items-center gap-1.5 rounded-lg bg-alloro-orange px-4 py-1.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {applyingProposals ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Applying
                </>
              ) : (
                <>Apply Approved ({approvedIds.size})</>
              )}
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div
          className={`rounded-lg border px-3 py-2 text-xs ${
            toast.type === "success"
              ? "bg-green-50 border-green-200 text-green-700"
              : toast.type === "error"
                ? "bg-red-50 border-red-200 text-red-700"
                : "bg-blue-50 border-blue-200 text-blue-700"
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

function ProposalRow({
  proposal,
  approved,
  onToggle,
}: {
  proposal: IdentityProposal;
  approved: boolean;
  onToggle: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const actionColors: Record<string, string> = {
    NEW: "bg-green-50 border-green-200 text-green-700",
    UPDATE: "bg-blue-50 border-blue-200 text-blue-700",
    DELETE: "bg-red-50 border-red-200 text-red-700",
  };

  return (
    <div className={`p-3 ${approved ? "bg-white" : "bg-gray-50/60"}`}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={approved}
          onChange={onToggle}
          className="mt-1 rounded"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-bold ${actionColors[proposal.action] || "bg-gray-50 border-gray-200 text-gray-700"}`}
            >
              {proposal.action}
            </span>
            {proposal.critical && (
              <span
                title={proposal.critical_reason}
                className="inline-flex items-center gap-0.5 rounded border border-red-300 bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-700"
              >
                ⚠ CRITICAL
              </span>
            )}
            <span className="text-xs font-mono text-gray-400 truncate">
              {proposal.path}
            </span>
          </div>
          <div className="text-sm text-gray-900 mt-1">{proposal.summary}</div>
          {proposal.reason && (
            <div className="text-[11px] text-gray-500 mt-0.5 italic">
              Why: {proposal.reason}
            </div>
          )}
          {proposal.critical && proposal.critical_reason && (
            <div className="text-[11px] text-red-700 mt-1">
              {proposal.critical_reason}
            </div>
          )}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-[11px] text-alloro-orange hover:text-orange-600 mt-1"
          >
            {expanded ? "Hide diff" : "Show diff"}
          </button>
          {expanded && (
            <div className="mt-2 rounded border border-gray-200 bg-gray-50 p-2 text-xs space-y-2">
              {proposal.action !== "NEW" && (
                <div>
                  <div className="text-[10px] font-semibold text-red-600 mb-0.5">
                    CURRENT
                  </div>
                  <pre className="text-[11px] text-gray-700 whitespace-pre-wrap break-words bg-red-50 rounded p-1.5 border border-red-100">
                    {formatValue(proposal.current_value)}
                  </pre>
                </div>
              )}
              {proposal.action !== "DELETE" && (
                <div>
                  <div className="text-[10px] font-semibold text-green-600 mb-0.5">
                    PROPOSED
                  </div>
                  <pre className="text-[11px] text-gray-700 whitespace-pre-wrap break-words bg-green-50 rounded p-1.5 border border-green-100">
                    {formatValue(proposal.proposed_value)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "(empty)";
  if (typeof v === "string") return v || "(empty string)";
  return JSON.stringify(v, null, 2);
}

// ---------------------------------------------------------------------------
// URL Input row with test + strategy picker (Plan — Part 3)
// ---------------------------------------------------------------------------

function UrlInputRow({
  input,
  onChange,
  onRemove,
  onTest,
  onSetStrategy,
}: {
  input: UrlInput;
  onChange: (url: string) => void;
  onRemove: () => void;
  onTest: () => void;
  onSetStrategy: (s: ScrapeStrategy) => void;
}) {
  const result = input.testResult;
  const showStrategyPicker = result && !result.ok;

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-2 p-2">
        <input
          type="url"
          value={input.url}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://example.com/about"
          className="flex-1 rounded-lg border-0 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-alloro-orange/30"
        />
        <button
          onClick={onTest}
          disabled={input.testing || !input.url.trim()}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {input.testing ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            "Test"
          )}
        </button>
        {renderStatusIcon(result)}
        <button
          onClick={onRemove}
          className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {result && !result.ok && (
        <div className="border-t border-gray-100 bg-amber-50/50 px-3 py-2 text-xs">
          <div className="flex items-start gap-1.5 text-amber-800">
            <span className="font-semibold">Blocked:</span>
            <span>
              {result.block_type} — {result.detail}
            </span>
          </div>
          {result.detected_signals.length > 0 && (
            <div className="text-[10px] text-amber-700 mt-0.5 font-mono">
              Signals: {result.detected_signals.join(", ")}
            </div>
          )}
        </div>
      )}

      {result && result.ok && (
        <div className="border-t border-gray-100 bg-green-50/50 px-3 py-2 text-xs text-green-800">
          OK — {result.preview_chars.toLocaleString()} chars, status {result.status}
        </div>
      )}

      {showStrategyPicker && (
        <div className="border-t border-gray-100 bg-white px-3 py-2 space-y-2">
          <div className="text-[11px] font-semibold text-gray-700">
            Fallback strategy for this URL:
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <StrategyButton
              label="Browser render (slower)"
              description="Uses Chromium to render JS — bypasses most challenges"
              active={input.strategy === "browser"}
              onClick={() => onSetStrategy("browser")}
            />
            <StrategyButton
              label="Screenshot + AI"
              description="Screenshots the page and extracts text via AI — last resort"
              active={input.strategy === "screenshot"}
              onClick={() => onSetStrategy("screenshot")}
            />
            <StrategyButton
              label="Skip this URL"
              description="Don't include this URL in warmup"
              active={input.strategy === "fetch" && result && !result.ok}
              onClick={() => onSetStrategy("fetch")}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function StrategyButton({
  label,
  description,
  active,
  onClick,
}: {
  label: string;
  description: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={description}
      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 transition ${
        active
          ? "border-alloro-orange bg-alloro-orange/10 text-alloro-orange"
          : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
      }`}
    >
      {label}
    </button>
  );
}

function renderStatusIcon(result: BlockCheckResult | null | undefined) {
  if (!result) return null;
  if (result.ok) {
    return (
      <span
        title={`OK (status ${result.status})`}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-white text-[10px]"
      >
        ✓
      </span>
    );
  }
  return (
    <span
      title={result.detail}
      className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-white text-[10px]"
    >
      !
    </span>
  );
}

// ---------------------------------------------------------------------------
// T7 — Doctors / Services / Locations tabs
// ---------------------------------------------------------------------------

/** Format an ISO timestamp as a compact relative string (e.g. "3h ago"). */
function humanizeTimestamp(iso: string | null | undefined): string {
  if (!iso) return "never";
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return "never";
  const diffMs = Date.now() - ts;
  if (diffMs < 0) return "just now";
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  const yr = Math.round(mo / 12);
  return `${yr}y ago`;
}

/** Find the most-recent `last_synced_at` across a list, or null if empty. */
function mostRecentSync(entries: Array<{ last_synced_at?: string }>): string | null {
  const valid = entries
    .map((e) => (e.last_synced_at ? Date.parse(e.last_synced_at) : NaN))
    .filter((n) => !Number.isNaN(n));
  if (valid.length === 0) return null;
  return new Date(Math.max(...valid)).toISOString();
}

interface IdentityListTabProps {
  projectId: string;
  list: IdentityListName;
  entries: ProjectIdentityListEntry[];
  onIdentityChange: (next: ProjectIdentity) => void;
}

function IdentityListTab({
  projectId,
  list,
  entries,
  onIdentityChange,
}: IdentityListTabProps) {
  const [resyncing, setResyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localEntries, setLocalEntries] = useState<ProjectIdentityListEntry[]>(entries);

  // Keep localEntries in sync when parent identity refreshes.
  useEffect(() => {
    setLocalEntries(entries);
  }, [entries]);

  const handleResync = async () => {
    if (resyncing) return;
    setError(null);
    try {
      setResyncing(true);
      const res = await resyncProjectIdentityList(projectId, list);
      setLocalEntries(res.data.entries);
      // Refresh the identity in the parent so the JSON tab + tab counters update.
      const refreshed = await fetchIdentity(projectId);
      if (refreshed.data) onIdentityChange(refreshed.data);
      showSuccessToast(
        `${list[0].toUpperCase() + list.slice(1)} re-synced`,
        `${res.data.refreshed_count} fresh, ${res.data.stale_count} stale.`,
      );
    } catch (err: any) {
      const msg = err?.message || "Re-sync failed";
      setError(msg);
      showErrorToast("Re-sync failed", msg);
    } finally {
      setResyncing(false);
    }
  };

  const headerSyncStamp = mostRecentSync(localEntries);
  const labelPlural = list === "doctors" ? "Doctors" : "Services";
  const labelSingular = list === "doctors" ? "doctor" : "service";

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-gray-500">
            URLs we're tracking on the practice site. Re-sync re-runs extraction
            against the cached scraped pages.
          </p>
          <p className="text-[11px] text-gray-400 mt-1">
            List last synced{" "}
            <span className="font-medium text-gray-600">
              {humanizeTimestamp(headerSyncStamp)}
            </span>
          </p>
        </div>
        <button
          onClick={handleResync}
          disabled={resyncing}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 shrink-0"
        >
          {resyncing ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Re-syncing...
            </>
          ) : (
            <>
              <RefreshCw className="h-3.5 w-3.5" /> Re-sync
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {localEntries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 p-6 text-center">
          <p className="text-sm text-gray-500">
            Warmup didn't find any {list} on the site — they may live on a page
            that wasn't discovered. You can still add them manually via the Posts
            tab.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 overflow-hidden divide-y divide-gray-100">
          {localEntries.map((entry, idx) => (
            <IdentityListRow
              key={`${entry.source_url || "local"}-${idx}`}
              entry={entry}
              labelSingular={labelSingular}
            />
          ))}
        </div>
      )}

      <p className="text-[11px] text-gray-400 italic">
        {labelPlural} list — light-touch tracking. Full content is scraped at
        import time from the Posts tab.
      </p>
    </div>
  );
}

function IdentityListRow({
  entry,
  labelSingular,
}: {
  entry: ProjectIdentityListEntry;
  labelSingular: string;
}) {
  return (
    <div className="p-3 flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-gray-900 truncate">
            {entry.name}
          </span>
          {entry.stale && (
            <span
              title={`This ${labelSingular} was not found in the most recent re-sync. Verify it still exists on the site.`}
              className="inline-flex items-center gap-0.5 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700"
            >
              <AlertTriangle className="h-3 w-3" /> stale
            </span>
          )}
        </div>
        {entry.short_blurb && (
          <div className="text-xs text-gray-600 mt-1 line-clamp-2">
            {entry.short_blurb}
          </div>
        )}
        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-400">
          {entry.source_url ? (
            <a
              href={entry.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-alloro-orange hover:text-orange-600 truncate max-w-[260px]"
            >
              <ExternalLink className="h-3 w-3 shrink-0" />
              <span className="truncate">{entry.source_url}</span>
            </a>
          ) : (
            <span className="italic">No source URL</span>
          )}
          <span className="shrink-0">
            Last synced {humanizeTimestamp(entry.last_synced_at)}
          </span>
        </div>
      </div>
    </div>
  );
}

interface IdentityLocationsTabProps {
  projectId: string;
  locations: ProjectIdentityLocation[];
  onIdentityChange: (next: ProjectIdentity) => void;
}

function IdentityLocationsTab({
  projectId,
  locations,
  onIdentityChange,
}: IdentityLocationsTabProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [busyPlaceId, setBusyPlaceId] = useState<string | null>(null);
  const [removingPlaceId, setRemovingPlaceId] = useState<string | null>(null);
  const [localLocations, setLocalLocations] = useState<ProjectIdentityLocation[]>(locations);
  const confirm = useConfirm();

  useEffect(() => {
    setLocalLocations(locations);
  }, [locations]);

  const refreshIdentity = async () => {
    try {
      const refreshed = await fetchIdentity(projectId);
      if (refreshed.data) onIdentityChange(refreshed.data);
    } catch {
      // Non-fatal; UI already updated locally from the per-action response.
    }
  };

  const handleSetPrimary = async (placeId: string, name: string) => {
    const ok = await confirm({
      title: "Switch primary location?",
      message: `Setting "${name || placeId}" as primary changes the main business data the AI uses for every page. Regenerate affected pages after switching.`,
      confirmLabel: "Set as primary",
      cancelLabel: "Cancel",
      variant: "default",
    });
    if (!ok) return;
    try {
      setBusyPlaceId(placeId);
      const res = await setPrimaryLocation(projectId, placeId);
      onIdentityChange(res.data.identity);
      const nextLocations: ProjectIdentityLocation[] = Array.isArray(
        (res.data.identity as any).locations,
      )
        ? ((res.data.identity as any).locations as ProjectIdentityLocation[])
        : [];
      setLocalLocations(nextLocations);
      showSuccessToast("Primary location updated", `"${name || placeId}" is now primary.`);
    } catch (err: any) {
      showErrorToast("Set primary failed", err?.message || "Unknown error");
    } finally {
      setBusyPlaceId(null);
    }
  };

  const handleResync = async (placeId: string, name: string) => {
    try {
      setBusyPlaceId(placeId);
      const res = await resyncProjectLocation(projectId, placeId);
      setLocalLocations(res.data.locations);
      await refreshIdentity();
      if (res.data.location.warmup_status === "ready") {
        showSuccessToast("Location re-synced", `"${name || placeId}" updated.`);
      } else {
        showErrorToast(
          "Location scrape failed",
          res.data.location.warmup_error || "Apify returned no data — try again later.",
        );
      }
    } catch (err: any) {
      showErrorToast("Re-sync failed", err?.message || "Unknown error");
    } finally {
      setBusyPlaceId(null);
    }
  };

  const handleRemove = async (placeId: string, name: string) => {
    const ok = await confirm({
      title: "Remove this location?",
      message: `"${name || placeId}" will be removed from this project's locations list. The Google Business Profile itself is not deleted.`,
      confirmLabel: "Remove",
      cancelLabel: "Cancel",
      variant: "danger",
    });
    if (!ok) return;
    try {
      setRemovingPlaceId(placeId);
      const res = await removeProjectLocation(projectId, placeId);
      setLocalLocations(res.data.locations);
      await refreshIdentity();
      showSuccessToast("Location removed", `"${name || placeId}" removed from project.`);
    } catch (err: any) {
      showErrorToast("Remove failed", err?.message || "Unknown error");
    } finally {
      setRemovingPlaceId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-gray-700">
            <span className="font-semibold">{localLocations.length}</span>{" "}
            location{localLocations.length === 1 ? "" : "s"}
          </p>
          <p className="text-[11px] text-gray-400 mt-1">
            Structured GBP data — re-sync per-row to refresh hours/rating/reviews.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-alloro-orange px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 shrink-0"
        >
          <Plus className="h-3.5 w-3.5" /> Add Location
        </button>
      </div>

      {localLocations.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 p-6 text-center">
          <p className="text-sm text-gray-500">
            No locations yet. Click <span className="font-semibold">Add Location</span> to import from Google Business Profile.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 overflow-hidden divide-y divide-gray-100">
          {localLocations.map((loc) => (
            <LocationRow
              key={loc.place_id}
              loc={loc}
              busy={busyPlaceId === loc.place_id}
              removing={removingPlaceId === loc.place_id}
              onSetPrimary={() => handleSetPrimary(loc.place_id, loc.name)}
              onResync={() => handleResync(loc.place_id, loc.name)}
              onRemove={() => handleRemove(loc.place_id, loc.name)}
            />
          ))}
        </div>
      )}

      {showAdd && (
        <AddLocationModal
          projectId={projectId}
          onClose={() => setShowAdd(false)}
          onAdded={(next) => {
            setLocalLocations(next);
            void refreshIdentity();
          }}
        />
      )}
    </div>
  );
}

function LocationRow({
  loc,
  busy,
  removing,
  onSetPrimary,
  onResync,
  onRemove,
}: {
  loc: ProjectIdentityLocation;
  busy: boolean;
  removing: boolean;
  onSetPrimary: () => void;
  onResync: () => void;
  onRemove: () => void;
}) {
  const isFailed = loc.warmup_status === "failed";

  return (
    <div className="p-3 flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-gray-900 truncate">
            {loc.name || <span className="italic text-gray-400">Unnamed location</span>}
          </span>
          {loc.is_primary && (
            <span className="inline-flex items-center gap-0.5 rounded border border-green-200 bg-green-50 px-1.5 py-0.5 text-[10px] font-bold text-green-700">
              <Star className="h-3 w-3" /> Primary
            </span>
          )}
          {isFailed && (
            <span
              title={loc.warmup_error || "Last warmup attempt failed"}
              className="inline-flex items-center gap-0.5 rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700"
            >
              Warmup failed
            </span>
          )}
        </div>
        <div className="text-xs text-gray-600 mt-1 space-y-0.5">
          {loc.address && <div>{loc.address}</div>}
          {loc.phone && <div className="text-gray-500">{loc.phone}</div>}
        </div>
        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-400">
          {loc.rating != null && (
            <span className="shrink-0">
              {loc.rating}★ ({loc.review_count || 0})
            </span>
          )}
          <span className="shrink-0 font-mono truncate">{loc.place_id}</span>
          <span className="shrink-0">
            Last synced {humanizeTimestamp(loc.last_synced_at)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {!loc.is_primary && (
          <button
            onClick={onSetPrimary}
            disabled={busy || removing}
            className="text-[11px] font-medium text-gray-600 hover:text-alloro-orange px-2 py-1 rounded hover:bg-gray-50 disabled:opacity-50"
          >
            Set as primary
          </button>
        )}
        <button
          onClick={onResync}
          disabled={busy || removing}
          title="Re-scrape this location's GBP"
          className="inline-flex items-center text-[11px] font-medium text-gray-600 hover:text-alloro-orange px-2 py-1 rounded hover:bg-gray-50 disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          onClick={onRemove}
          disabled={loc.is_primary || busy || removing}
          title={
            loc.is_primary
              ? "Cannot remove the primary location. Set another location as primary first."
              : "Remove this location"
          }
          className="inline-flex items-center p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:hover:text-gray-400 disabled:hover:bg-transparent"
        >
          {removing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}
