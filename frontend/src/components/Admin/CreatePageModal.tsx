import { useState, useEffect } from "react";
import {
  X,
  Loader2,
  FileText,
  Globe,
  ChevronDown,
  ChevronUp,
  Search,
  MapPin,
} from "lucide-react";
import { fetchTemplatePages } from "../../api/templates";
import { startPipeline } from "../../api/websites";
import type { TemplatePage } from "../../api/templates";
import { searchPlaces, getPlaceDetails } from "../../api/places";
import type { PlaceSuggestion } from "../../api/places";
import ColorPicker from "./ColorPicker";

export interface CreatePageModalProps {
  projectId: string;
  templateId: string;
  gbpData: Record<string, string | number | null> | null;
  defaultPlaceId: string;
  defaultWebsiteUrl: string;
  defaultPrimaryColor?: string;
  defaultAccentColor?: string;
  onSuccess: () => void;
  onBlankPageCreated?: (pageId: string) => void;
  onClose: () => void;
}

export default function CreatePageModal({
  projectId,
  templateId,
  gbpData,
  defaultPlaceId,
  defaultWebsiteUrl,
  defaultPrimaryColor = "#1E40AF",
  defaultAccentColor = "#F59E0B",
  onSuccess,
  onClose,
}: CreatePageModalProps) {
  const [templatePages, setTemplatePages] = useState<TemplatePage[]>([]);
  const [loadingPages, setLoadingPages] = useState(true);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [slug, setSlug] = useState("/");
  const [slugError, setSlugError] = useState<string | null>(null);
  const [pageContext, setPageContext] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Color picker state (pre-loaded from project defaults, customizable per page)
  const [pagePrimaryColor, setPagePrimaryColor] = useState(defaultPrimaryColor);
  const [pageAccentColor, setPageAccentColor] = useState(defaultAccentColor);

  // Override state
  const [showOverrides, setShowOverrides] = useState(false);
  const [overridePlaceId, setOverridePlaceId] = useState(defaultPlaceId);
  const [overrideWebsiteUrl, setOverrideWebsiteUrl] =
    useState(defaultWebsiteUrl);

  // Data source toggle
  const [dataSource, setDataSource] = useState<"website" | "pasted">("website");
  const [scrapedData, setScrapedData] = useState("");

  // GBP search for override
  const [gbpSearchQuery, setGbpSearchQuery] = useState("");
  const [gbpSuggestions, setGbpSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searchingGbp, setSearchingGbp] = useState(false);
  const [overrideGbpData, setOverrideGbpData] = useState<Record<
    string,
    string | number | null
  > | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoadingPages(true);
        const response = await fetchTemplatePages(templateId);
        setTemplatePages(response.data);
        if (response.data.length > 0) {
          setSelectedPageId(response.data[0].id);
        }
      } catch (err) {
        setError("Failed to load template pages");
      } finally {
        setLoadingPages(false);
      }
    };
    load();
  }, [templateId]);

  const validateSlug = (value: string): boolean => {
    if (!value.startsWith("/")) {
      setSlugError("Slug must start with /");
      return false;
    }
    // Allow bare "/" for homepage
    if (value === "/") {
      setSlugError(null);
      return true;
    }
    if (value.length < 2) {
      setSlugError("Slug is too short");
      return false;
    }
    if (/\s/.test(value)) {
      setSlugError("Slug cannot contain spaces");
      return false;
    }
    if (!/^\/[a-zA-Z0-9\-/]+$/.test(value)) {
      setSlugError("Slug can only contain letters, numbers, hyphens, and /");
      return false;
    }
    setSlugError(null);
    return true;
  };

  const handleSlugChange = (value: string) => {
    setSlug(value);
    if (value.length > 1) validateSlug(value);
    else setSlugError(null);
  };

  const handleGbpSearch = async (query: string) => {
    setGbpSearchQuery(query);
    if (query.trim().length < 2) {
      setGbpSuggestions([]);
      return;
    }
    try {
      setSearchingGbp(true);
      const response = await searchPlaces(query);
      setGbpSuggestions(response.suggestions || []);
    } catch {
      setGbpSuggestions([]);
    } finally {
      setSearchingGbp(false);
    }
  };

  const handleSelectGbpOverride = async (suggestion: PlaceSuggestion) => {
    try {
      const detailsResponse = await getPlaceDetails(suggestion.placeId);
      const place = detailsResponse.place;
      setOverridePlaceId(place.placeId);
      setOverrideWebsiteUrl(place.websiteUri || "");
      setOverrideGbpData({
        name: place.name,
        formattedAddress: place.formattedAddress,
        phone: place.phone || null,
        rating: place.rating || null,
        reviewCount: place.reviewCount || null,
        category: place.category || null,
      });
      setGbpSearchQuery(place.name);
      setGbpSuggestions([]);
    } catch {
      setError("Failed to load business details");
    }
  };

  const handleSubmit = async () => {
    if (!selectedPageId || submitting) return;
    if (!validateSlug(slug)) return;

    const effectiveGbpData = overrideGbpData || gbpData;

    try {
      setSubmitting(true);
      setError(null);
      await startPipeline({
        projectId,
        templateId,
        templatePageId: selectedPageId,
        path: slug,
        placeId: overridePlaceId,
        websiteUrl: dataSource === "website" ? (overrideWebsiteUrl || null) : null,
        pageContext: pageContext.trim() || undefined,
        businessName: effectiveGbpData?.name
          ? String(effectiveGbpData.name)
          : undefined,
        formattedAddress: effectiveGbpData?.formattedAddress
          ? String(effectiveGbpData.formattedAddress)
          : undefined,
        city: effectiveGbpData?.city
          ? String(effectiveGbpData.city)
          : undefined,
        state: effectiveGbpData?.state
          ? String(effectiveGbpData.state)
          : undefined,
        phone: effectiveGbpData?.phone
          ? String(effectiveGbpData.phone)
          : undefined,
        category: effectiveGbpData?.category
          ? String(effectiveGbpData.category)
          : undefined,
        rating: effectiveGbpData?.rating
          ? Number(effectiveGbpData.rating)
          : undefined,
        reviewCount: effectiveGbpData?.reviewCount
          ? Number(effectiveGbpData.reviewCount)
          : undefined,
        primaryColor: pagePrimaryColor,
        accentColor: pageAccentColor,
        scrapedData: dataSource === "pasted" ? (scrapedData.trim() || null) : null,
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create page");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div
        className="fixed inset-0 bg-black/40 transition-opacity"
        onClick={() => {
          if (!submitting) onClose();
        }}
      />
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Create New Page</h2>
            <button
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition disabled:opacity-50"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-5">
            {/* Template page selector */}
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-700">
                Template Page
              </label>
              {loadingPages ? (
                <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading pages...
                </div>
              ) : templatePages.length === 0 ? (
                <p className="text-sm text-red-500">No template pages found.</p>
              ) : (
                <div className="space-y-1.5">
                  {templatePages.map((page) => (
                    <button
                      key={page.id}
                      onClick={() => setSelectedPageId(page.id)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg border transition flex items-center gap-2.5 ${
                        selectedPageId === page.id
                          ? "border-alloro-orange bg-orange-50 text-gray-900"
                          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                      }`}
                    >
                      <FileText
                        className={`w-4 h-4 flex-shrink-0 ${selectedPageId === page.id ? "text-alloro-orange" : "text-gray-400"}`}
                      />
                      <span className="text-sm font-medium truncate">
                        {page.name}
                      </span>
                      {page.sections && page.sections.length > 0 && (
                        <span className="text-xs text-gray-400 ml-auto flex-shrink-0">
                          {page.sections.length} section
                          {page.sections.length !== 1 ? "s" : ""}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Slug input */}
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-700">
                Page Slug
              </label>
              <input
                type="text"
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder="/services"
                className={`w-full text-sm px-3 py-2 rounded-lg border focus:ring-2 outline-none transition ${
                  slugError
                    ? "border-red-300 focus:border-red-400 focus:ring-red-200"
                    : "border-gray-200 focus:border-alloro-orange focus:ring-alloro-orange/20"
                }`}
              />
              {slugError && <p className="text-xs text-red-500">{slugError}</p>}
              <p className="text-xs text-gray-400">
                The URL path for this page (e.g., / for homepage, /services, /about-us)
              </p>
            </div>

            {/* Page context */}
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-700">
                Page Context
              </label>
              <textarea
                value={pageContext}
                onChange={(e) => setPageContext(e.target.value)}
                placeholder="Describe what this page should be about, e.g. 'Orthodontic services including braces, Invisalign, and retainers for children and adults'"
                rows={3}
                className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:border-alloro-orange focus:ring-2 focus:ring-alloro-orange/20 outline-none resize-none transition"
              />
              <p className="text-xs text-gray-400">
                Add details about this page so the AI generates relevant,
                specific content instead of generic filler.
              </p>
            </div>

            {/* Brand colors (per-page override) */}
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-700">
                Brand Colors
              </label>
              <div className="flex items-start gap-4">
                <ColorPicker
                  label="Primary"
                  value={pagePrimaryColor}
                  onChange={setPagePrimaryColor}
                />
                <ColorPicker
                  label="Accent"
                  value={pageAccentColor}
                  onChange={setPageAccentColor}
                />
              </div>
              <p className="text-xs text-gray-400">
                Pre-loaded from the project. Adjust per-page if needed.
              </p>
            </div>

            {/* Overrides section */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setShowOverrides(!showOverrides)}
                className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
              >
                <span>Advanced: Override Business Data</span>
                {showOverrides ? (
                  <ChevronUp className="w-4 h-4 text-gray-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                )}
              </button>
              {showOverrides && (
                <div className="border-t border-gray-200 px-3 py-3 space-y-3 bg-gray-50/50">
                  <p className="text-xs text-gray-500">
                    Override the business profile and website URL for this page
                    only. These changes are not saved to the project.
                  </p>

                  {/* GBP search */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-gray-500">
                      Business Profile (PlaceId:{" "}
                      {overridePlaceId
                        ? overridePlaceId.slice(0, 12) + "..."
                        : "none"}
                      )
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                        {searchingGbp ? (
                          <Loader2 className="h-3.5 w-3.5 text-gray-400 animate-spin" />
                        ) : (
                          <Search className="h-3.5 w-3.5 text-gray-400" />
                        )}
                      </div>
                      <input
                        type="text"
                        value={gbpSearchQuery}
                        onChange={(e) => handleGbpSearch(e.target.value)}
                        placeholder="Search for a different business..."
                        className="w-full text-sm pl-9 pr-3 py-2 rounded-lg border border-gray-200 focus:border-alloro-orange focus:ring-2 focus:ring-alloro-orange/20 outline-none"
                      />
                    </div>
                    {gbpSuggestions.length > 0 && (
                      <div className="bg-white border border-gray-200 rounded-lg shadow-sm max-h-40 overflow-y-auto">
                        {gbpSuggestions.map((s) => (
                          <button
                            key={s.placeId}
                            onClick={() => handleSelectGbpOverride(s)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 border-b border-gray-100 last:border-0"
                          >
                            <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="font-medium text-gray-800 truncate">
                                {s.mainText}
                              </p>
                              <p className="text-xs text-gray-500 truncate">
                                {s.secondaryText}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Content source toggle */}
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-gray-500">
                      Content Source
                    </label>
                    <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setDataSource("website")}
                        className={`flex-1 px-3 py-2 text-xs font-medium transition ${
                          dataSource === "website"
                            ? "bg-alloro-orange text-white"
                            : "bg-white text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        Scrape Website
                      </button>
                      <button
                        type="button"
                        onClick={() => setDataSource("pasted")}
                        className={`flex-1 px-3 py-2 text-xs font-medium transition ${
                          dataSource === "pasted"
                            ? "bg-alloro-orange text-white"
                            : "bg-white text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        Paste Data
                      </button>
                    </div>
                    {dataSource === "website" ? (
                      <div className="flex items-center gap-2">
                        <Globe className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        <input
                          type="url"
                          value={overrideWebsiteUrl}
                          onChange={(e) => setOverrideWebsiteUrl(e.target.value)}
                          placeholder="https://example.com"
                          className="flex-1 text-sm px-3 py-2 rounded-lg border border-gray-200 focus:border-alloro-orange focus:ring-2 focus:ring-alloro-orange/20 outline-none"
                        />
                      </div>
                    ) : (
                      <textarea
                        value={scrapedData}
                        onChange={(e) => setScrapedData(e.target.value)}
                        placeholder="Paste scraped content, service lists, bios, or any extra info you want the AI to use..."
                        rows={4}
                        className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:border-alloro-orange focus:ring-2 focus:ring-alloro-orange/20 outline-none resize-none"
                      />
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-gray-100 px-6 py-4 flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={
                submitting || !selectedPageId || !slug || !!slugError
              }
              className="inline-flex items-center gap-2 bg-alloro-orange hover:bg-alloro-orange/90 disabled:bg-alloro-orange/50 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                "Generate Page"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
