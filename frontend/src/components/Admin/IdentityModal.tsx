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
} from "lucide-react";
import {
  fetchIdentity,
  fetchIdentityStatus,
  startIdentityWarmup,
  updateIdentity,
  chatUpdateIdentity,
  cancelGeneration,
  type ProjectIdentity,
  type WarmupInputs,
  type WarmupStatus,
} from "../../api/websites";
import { searchPlaces, getPlaceDetails } from "../../api/places";
import type { PlaceSuggestion } from "../../api/places";
import ColorPicker from "./ColorPicker";

type IdentityTab = "summary" | "json" | "chat";

interface IdentityModalProps {
  projectId: string;
  onClose: () => void;
  onIdentityChanged?: (identity: ProjectIdentity) => void;
}

interface UrlInput {
  id: string;
  url: string;
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
  const [jsonDraft, setJsonDraft] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [savingJson, setSavingJson] = useState(false);

  // Chat state
  const [chatInstruction, setChatInstruction] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatToast, setChatToast] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

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
        const suggestions = await searchPlaces(gbpQuery);
        if (isMountedRef.current) setGbpSuggestions(suggestions);
      } finally {
        if (isMountedRef.current) setSearchingGbp(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [gbpQuery]);

  const handleSelectPlace = async (suggestion: PlaceSuggestion) => {
    try {
      const details = await getPlaceDetails(suggestion.place_id);
      setSelectedPlace({
        placeId: suggestion.place_id,
        name: String(details.name || suggestion.description),
        address: String(details.formattedAddress || details.address || suggestion.description),
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
    setUrlInputs((prev) => prev.map((u) => (u.id === id ? { ...u, url } : u)));
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
        urls: urlInputs.map((u) => u.url.trim()).filter(Boolean),
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

  const handleChatSubmit = async () => {
    const instruction = chatInstruction.trim();
    if (!instruction || chatLoading) return;
    setChatInstruction("");
    setChatLoading(true);
    try {
      const res = await chatUpdateIdentity(projectId, instruction);
      if (res.data.clarification_needed) {
        setChatToast({ type: "info", text: res.data.clarification_needed });
      } else {
        setChatToast({ type: "success", text: res.data.message });
        setIdentity(res.data.identity);
        onIdentityChanged?.(res.data.identity);
      }
    } catch (err: any) {
      setChatToast({ type: "error", text: err?.message || "Update failed" });
    } finally {
      setChatLoading(false);
    }
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
                    key={s.place_id}
                    onClick={() => props.onSelectPlace(s)}
                    className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0"
                  >
                    <div className="font-medium text-gray-900">{s.description}</div>
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
              <div key={u.id} className="flex items-center gap-2">
                <input
                  type="url"
                  value={u.url}
                  onChange={(e) => props.updateUrlInput(u.id, e.target.value)}
                  placeholder="https://example.com/about"
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-alloro-orange/30"
                />
                <button
                  onClick={() => props.removeUrlInput(u.id)}
                  className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
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
  onRerun: () => void;
}

function ReadyView(props: ReadyViewProps) {
  const { identity } = props;

  return (
    <div className="flex flex-col">
      {/* Tabs */}
      <div className="flex items-center gap-1 px-6 pt-3 border-b border-gray-100">
        <TabButton
          active={props.activeTab === "summary"}
          onClick={() => props.setActiveTab("summary")}
          icon={<Layout className="h-3.5 w-3.5" />}
          label="Summary"
        />
        <TabButton
          active={props.activeTab === "json"}
          onClick={props.onJsonTabOpen}
          icon={<Code className="h-3.5 w-3.5" />}
          label="JSON"
        />
        <TabButton
          active={props.activeTab === "chat"}
          onClick={() => props.setActiveTab("chat")}
          icon={<MessageCircle className="h-3.5 w-3.5" />}
          label="Chat Update"
        />
        <div className="flex-1" />
        <button
          onClick={props.onRerun}
          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Re-run warmup
        </button>
      </div>

      {/* Tab content */}
      <div className="p-6">
        {props.activeTab === "summary" && <IdentitySummary identity={identity} />}
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
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t border-b-2 transition ${
        active
          ? "text-alloro-orange border-alloro-orange"
          : "text-gray-500 border-transparent hover:text-gray-700"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function IdentitySummary({ identity }: { identity: ProjectIdentity }) {
  const b = identity.business;
  const br = identity.brand;
  const v = identity.voice_and_tone;
  const ce = identity.content_essentials;

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
      </SummarySection>

      <SummarySection title="Brand">
        <div className="grid grid-cols-2 gap-3">
          <ColorSwatch label="Primary" color={br?.primary_color} />
          <ColorSwatch label="Accent" color={br?.accent_color} />
        </div>
        {br?.gradient_enabled && (
          <div className="mt-3 text-xs text-gray-500">
            Gradient: {br.gradient_from || "?"} → {br.gradient_to || "?"} ({br.gradient_direction})
          </div>
        )}
        {br?.logo_s3_url && (
          <div className="mt-3 flex items-center gap-2">
            <img src={br.logo_s3_url} alt="Logo" className="h-10 w-10 object-contain rounded bg-gray-50" />
            <span className="text-xs text-gray-500">Logo hosted</span>
          </div>
        )}
      </SummarySection>

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
}: {
  instruction: string;
  setInstruction: (v: string) => void;
  loading: boolean;
  toast: { type: "success" | "error" | "info"; text: string } | null;
  onSubmit: () => void;
}) {
  const handleKey = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onSubmit();
      }
    },
    [onSubmit]
  );

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Type a natural-language instruction ("change accent to navy", "mark us as pediatric",
        "add ADA to certifications"). The LLM picks the right update and applies it.
      </p>
      <div className="flex items-start gap-2">
        <textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={handleKey}
          rows={3}
          placeholder="e.g., Change the accent color to #0D9488"
          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-alloro-orange/30"
          disabled={loading}
        />
        <button
          onClick={onSubmit}
          disabled={loading || !instruction.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-alloro-orange px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update"}
        </button>
      </div>
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
