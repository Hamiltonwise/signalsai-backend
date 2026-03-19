import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Globe,
  ExternalLink,
  Clock,
  CheckCircle,
  Check,
  Building2,
  FileText,
  Loader2,
  AlertCircle,
  MapPin,
  Phone,
  Star,
  Search,
  X,
  Code,
  Trash2,
  Pencil,
  ChevronDown,
  Hash,
  Sparkles,
  RefreshCw,
  RotateCcw,
  Layout,
  Image,
  Inbox,
  Newspaper,
  Menu,
  ArrowRightLeft,
  Archive,
  Wrench,
} from "lucide-react";
import {
  fetchWebsiteDetail,
  updateWebsite,
  deleteWebsite,
  deletePageByPath,
  linkWebsiteToOrganization,
  connectDomain,
  verifyDomainAdmin,
  disconnectDomain,
  createAllFromTemplate,
  fetchPagesGenerationStatus,
  startBulkSeoGenerate,
  getBulkSeoStatus,
  getActiveBulkSeoJob,
  updatePageDisplayName,
} from "../../api/websites";
import type { WebsiteProjectWithPages, WebsitePage, PageGenerationStatusItem, BulkSeoStatus } from "../../api/websites";
import { toast } from "react-hot-toast";
import {
  useAdminWebsiteDetail,
  useInvalidateAdminWebsiteDetail,
} from "../../hooks/queries/useAdminQueries";
import { searchPlaces, getPlaceDetails } from "../../api/places";
import type { PlaceSuggestion, PlaceDetails } from "../../api/places";
import { fetchTemplates, fetchTemplatePages } from "../../api/templates";
import type { Template, TemplatePage } from "../../api/templates";
import {
  AdminPageHeader,
  ActionButton,
  BulkActionBar,
} from "../../components/ui/DesignSystem";
import CreatePageModal from "../../components/Admin/CreatePageModal";
import MediaTab from "../../components/Admin/MediaTab";
import CodeManagerTab from "../../components/Admin/CodeManagerTab";
import ColorPicker from "../../components/Admin/ColorPicker";
import ConnectDomainModal from "../../components/Admin/ConnectDomainModal";
import RecipientsConfig from "../../components/Admin/RecipientsConfig";
import FormSubmissionsTab from "../../components/Admin/FormSubmissionsTab";
import PostsTab from "../../components/Admin/PostsTab";
import MenusTab from "../../components/Admin/MenusTab";
import BackupsTab from "../../components/Admin/BackupsTab";
import AiCommandTab from "../../components/Admin/AiCommandTab";
import RedirectsTab from "../../components/Admin/RedirectsTab";
import { fetchProjectCodeSnippets } from "../../api/codeSnippets";
import type { CodeSnippet } from "../../api/codeSnippets";
import { useConfirm } from "../../components/ui/ConfirmModal";


/**
 * SEO score matching SeoPanel's calculateScores exactly.
 * Uses sibling titles/descriptions for uniqueness checks.
 * Uses wrapper HTML for page-speed and housekeeping checks.
 */
function computeSeoScore(
  seoData: WebsitePage["seo_data"],
  siblingTitles: string[],
  siblingDescriptions: string[],
  wrapperHtml: string
): {
  score: number;
  max: number;
  pct: number;
  colorClass: string;
  barClass: string;
} {
  if (!seoData) return { score: 0, max: 100, pct: 0, colorClass: "text-gray-400", barClass: "bg-gray-300" };

  const title = seoData.meta_title || "";
  const desc = seoData.meta_description || "";
  const canonical = seoData.canonical_url || "";
  const robots = seoData.robots || "";
  const ogTitle = seoData.og_title || "";
  const ogDesc = seoData.og_description || "";
  const ogImage = seoData.og_image || "";
  const ogType = seoData.og_type || "";
  const schema = seoData.schema_json || [];
  const maxPreview = seoData.max_image_preview || "";

  const titleIsUnique = title ? !siblingTitles.includes(title) : false;
  const descIsUnique = desc ? !siblingDescriptions.includes(desc) : false;

  const hasViewport = /meta.*viewport/i.test(wrapperHtml);
  const hasCharset = /charset.*utf-8/i.test(wrapperHtml);
  const hasLang = /lang\s*=\s*["']en/i.test(wrapperHtml);
  const hasDeferScripts = /defer|async/i.test(wrapperHtml);
  const hasPreload = /rel\s*=\s*["']preload/i.test(wrapperHtml);

  let score = 0;

  // Critical (30) — exact match with SeoPanel
  if (canonical.length > 0) score += 8;
  if (title.length >= 20) score += 7;
  if (titleIsUnique) score += 6;
  if (title.length >= 50 && title.length <= 60) score += 5;
  if (robots.includes("index") || robots === "") score += 4;

  // High Impact (25)
  if (desc.length > 0) score += 6;
  if (desc.length > 40) score += 5;
  if (desc.length >= 140 && desc.length <= 160) score += 5;
  if (descIsUnique) score += 5;
  if (maxPreview === "large") score += 4;

  // Significant (22)
  if (schema.some((s: any) => s["@type"] === "LocalBusiness")) score += 6;
  if (schema.some((s: any) => s["@type"] === "FAQPage")) score += 5;
  if (schema.some((s: any) => s["@type"] === "Organization")) score += 4;
  if (schema.some((s: any) => s["@type"] === "Service")) score += 4;
  if (schema.some((s: any) => s["@type"] === "BreadcrumbList")) score += 3;

  // Moderate (13)
  if (ogImage.length > 0) score += 4;
  if (ogImage.length > 0) score += 4; // "Real photo, not logo" — same check as SeoPanel
  if (ogTitle.length > 0) score += 3;
  score += 2; // "OG URL matches canonical" — always true in SeoPanel

  // Page Speed Tags (7)
  if (hasViewport) score += 3;
  if (hasDeferScripts) score += 3;
  if (hasPreload) score += 1;

  // Housekeeping (3)
  if (hasCharset) score += 1;
  if (hasLang) score += 1;
  if (ogType.length > 0) score += 0.5;
  if (ogDesc.length > 0) score += 0.5;

  const max = 100;
  const pct = Math.round((score / max) * 100);

  let colorClass: string;
  let barClass: string;
  if (pct >= 90) { colorClass = "text-green-600"; barClass = "bg-green-500"; }
  else if (pct >= 75) { colorClass = "text-lime-600"; barClass = "bg-lime-500"; }
  else if (pct >= 55) { colorClass = "text-orange-500"; barClass = "bg-orange-500"; }
  else if (pct >= 35) { colorClass = "text-red-500"; barClass = "bg-red-500"; }
  else { colorClass = "text-gray-400"; barClass = "bg-gray-300"; }

  return { score, max, pct, colorClass, barClass };
}

/**
 * Group pages by path for the expandable list.
 * Returns { path: string, pages: WebsitePage[] }[] sorted by path,
 * with each group's pages sorted by version desc.
 */
function groupPagesByPath(pages: WebsitePage[]) {
  const map = new Map<string, WebsitePage[]>();
  for (const page of pages) {
    const group = map.get(page.path) || [];
    group.push(page);
    map.set(page.path, group);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, pages]) => ({
      path,
      pages: pages.sort((a, b) => b.version - a.version),
    }));
}

export default function WebsiteDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  // TanStack Query — cached initial load
  const {
    data: website,
    isLoading: loading,
    error: queryError,
  } = useAdminWebsiteDetail(id);
  const { invalidate: invalidateWebsite, setData: setWebsiteCache } =
    useInvalidateAdminWebsiteDetail();
  const error = queryError?.message ?? null;

  // Helper to update cache directly (used by polling + mutation callbacks)
  const setWebsite = (data: WebsiteProjectWithPages) => {
    if (id) setWebsiteCache(id, data);
  };
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDomainModal, setShowDomainModal] = useState(false);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [deletingPageId, setDeletingPageId] = useState<string | null>(null);
  const [deletingPagePath, setDeletingPagePath] = useState<string | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [editingName, setEditingName] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [savingName, setSavingName] = useState<string | null>(null);

  // GBP Selector state
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<PlaceDetails | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [, setIsPolling] = useState(false);

  // Template selector state
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null,
  );
  const [selectedTemplatePages, setSelectedTemplatePages] = useState<
    TemplatePage[]
  >([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // Create page modal state
  const [showCreatePageModal, setShowCreatePageModal] = useState(false);
  const [isGeneratingPage, setIsGeneratingPage] = useState(false);

  // Bulk SEO generation state
  const [, setBulkSeoJobId] = useState<string | null>(null);
  const [bulkSeoStatus, setBulkSeoStatus] = useState<BulkSeoStatus | null>(null);
  const bulkSeoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopBulkSeoPoll = useCallback(() => {
    if (bulkSeoIntervalRef.current) {
      clearInterval(bulkSeoIntervalRef.current);
      bulkSeoIntervalRef.current = null;
    }
  }, []);

  const pollBulkSeo = useCallback(async (jobId: string) => {
    if (!id) return;
    try {
      const res = await getBulkSeoStatus(id, jobId);
      setBulkSeoStatus(res.data);
      if (res.data.status === "completed" || res.data.status === "failed") {
        stopBulkSeoPoll();
        if (res.data.status === "completed") {
          invalidateWebsite(id!);
          setTimeout(() => {
            setBulkSeoStatus(null);
            setBulkSeoJobId(null);
          }, 2000);
        }
      }
    } catch {
      stopBulkSeoPoll();
    }
  }, [id, stopBulkSeoPoll, invalidateWebsite]);

  const startBulkPageSeo = useCallback(async (paths?: string[]) => {
    if (!id) return;
    try {
      const res = await startBulkSeoGenerate(id, "page", undefined, paths);
      setBulkSeoJobId(res.job_id);
      setBulkSeoStatus({ id: res.job_id, status: "queued", total_count: 0, completed_count: 0, failed_count: 0, failed_items: null });
      stopBulkSeoPoll();
      await pollBulkSeo(res.job_id);
      bulkSeoIntervalRef.current = setInterval(() => pollBulkSeo(res.job_id), 2000);
    } catch (err: any) {
      toast.error(err.message || "Failed to start SEO generation");
    }
  }, [id, pollBulkSeo, stopBulkSeoPoll]);

  useEffect(() => {
    return () => stopBulkSeoPoll();
  }, [stopBulkSeoPoll]);

  // On mount: check for active page SEO job and resume polling
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await getActiveBulkSeoJob(id, "page");
        if (cancelled) return;
        if (res.data && (res.data.status === "queued" || res.data.status === "processing")) {
          setBulkSeoJobId(res.data.id);
          setBulkSeoStatus(res.data);
          bulkSeoIntervalRef.current = setInterval(() => pollBulkSeo(res.data!.id), 2000);
        }
      } catch {
        // Silently ignore
      }
    })();
    return () => { cancelled = true; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const isBulkSeoActive = bulkSeoStatus !== null && (bulkSeoStatus.status === "queued" || bulkSeoStatus.status === "processing");

  // Color picker state
  const [primaryColor, setPrimaryColor] = useState("#1E40AF");
  const [accentColor, setAccentColor] = useState("#F59E0B");

  // Data source toggle: scrape a website or paste data manually
  const [dataSource, setDataSource] = useState<"website" | "pasted">("website");
  const [scrapedData, setScrapedData] = useState("");

  // Detail tab: persisted in URL search params so refresh preserves tab
  const VALID_TABS = ["pages", "layouts", "code-manager", "media", "form-submissions", "posts", "menus", "redirects", "backups", "advanced-tools"] as const;
  type DetailTab = typeof VALID_TABS[number];
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get("tab");
  const detailTab: DetailTab = VALID_TABS.includes(rawTab as DetailTab) ? (rawTab as DetailTab) : "pages";
  const setDetailTab = (tab: DetailTab) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (tab === "pages") {
        next.delete("tab");
      } else {
        next.set("tab", tab);
      }
      return next;
    }, { replace: true });
  };

  // Code snippets state
  const [codeSnippets, setCodeSnippets] = useState<CodeSnippet[]>([]);
  const [loadingSnippets, setLoadingSnippets] = useState(false);

  // Organization linking state
  const [availableOrganizations, setAvailableOrganizations] = useState<
    Array<{ id: number; name: string }>
  >([]);
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null);
  const [isLinking, setIsLinking] = useState(false);
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [showOrgDropdown, setShowOrgDropdown] = useState(false);
  const orgDropdownRef = useRef<HTMLDivElement>(null);

  // Per-page generation status polling
  const [pageGenStatuses, setPageGenStatuses] = useState<PageGenerationStatusItem[]>([]);
  const [isCreatingAll, setIsCreatingAll] = useState(false);
  // Per-page websiteUrl overrides: { [templatePageId]: url }
  const [pageWebsiteUrls, setPageWebsiteUrls] = useState<Record<string, string>>({});
  // Per-page path inputs: { [templatePageId]: path }
  const [pagePathInputs, setPagePathInputs] = useState<Record<string, string>>({});

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageGenPollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expectedPageCountRef = useRef<number>(0);
  const isMountedRef = useRef(true);

  const NON_POLLING_STATUSES = ["CREATED", "LIVE"];
  const POLL_INTERVAL = 3000;

  const loadCodeSnippets = useCallback(async () => {
    if (!id) return;

    try {
      setLoadingSnippets(true);
      const response = await fetchProjectCodeSnippets(id);
      setCodeSnippets(response.data);
    } catch (err) {
      console.error("Failed to fetch code snippets:", err);
    } finally {
      setLoadingSnippets(false);
    }
  }, [id]);

  const loadAvailableOrganizations = useCallback(async () => {
    try {
      setLoadingOrgs(true);
      const token = localStorage.getItem("auth_token");
      const response = await fetch("/api/admin/organizations", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();

      // Filter to orgs without websites (or currently linked org)
      const availableOrgs = data.organizations
        .filter(
          (org: any) =>
            !org.website || org.id === website?.organization?.id,
        )
        .map((org: any) => ({ id: org.id, name: org.name }));

      setAvailableOrganizations(availableOrgs);
    } catch (err) {
      console.error("Failed to load organizations:", err);
      toast.error("Failed to load organizations");
    } finally {
      setLoadingOrgs(false);
    }
  }, [website?.organization?.id]);

  const handleLinkOrganization = async () => {
    if (!id || isLinking) return;

    try {
      setIsLinking(true);
      await linkWebsiteToOrganization(id, selectedOrgId);
      toast.success(
        selectedOrgId ? "Organization linked" : "Organization unlinked",
      );
      await loadWebsite();
      await loadAvailableOrganizations();
      setSelectedOrgId(null);
    } catch (err) {
      console.error("Failed to link organization:", err);
      toast.error(
        err instanceof Error ? err.message : "Failed to link organization",
      );
    } finally {
      setIsLinking(false);
    }
  };

  const handleUnlink = async () => {
    const ok = await confirm({ title: "Unlink this website from the organization?", confirmLabel: "Unlink", variant: "danger" });
    if (!ok) return;
    setSelectedOrgId(null);
    await handleLinkOrganization();
  };

  // Side-effects on mount (code snippets, cleanup refs)
  // Website data is loaded automatically by TanStack Query
  useEffect(() => {
    isMountedRef.current = true;
    if (id) {
      loadCodeSnippets();
    }
    return () => {
      isMountedRef.current = false;
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
      if (pageGenPollRef.current) clearTimeout(pageGenPollRef.current);
    };
  }, [id, loadCodeSnippets]);

  // Load available organizations when website data changes
  useEffect(() => {
    if (website) {
      loadAvailableOrganizations();
    }
  }, [website?.organization?.id, loadAvailableOrganizations]);

  // Load templates for selector (only when CREATED status or no template set yet)
  useEffect(() => {
    if (!website || (website.status !== "CREATED" && website.template_id)) return;
    const loadTemplates = async () => {
      try {
        setLoadingTemplates(true);
        const response = await fetchTemplates();
        const published = response.data.filter((t) => t.status === "published");
        setTemplates(published);
        // Pre-select the active template
        const active = published.find((t) => t.is_active);
        if (active) {
          setSelectedTemplateId(active.id);
          // Load its pages
          const pagesResponse = await fetchTemplatePages(active.id);
          setSelectedTemplatePages(pagesResponse.data);
        } else if (published.length > 0) {
          setSelectedTemplateId(published[0].id);
          const pagesResponse = await fetchTemplatePages(published[0].id);
          setSelectedTemplatePages(pagesResponse.data);
        }
      } catch (err) {
        console.error("Failed to load templates:", err);
      } finally {
        setLoadingTemplates(false);
      }
    };
    loadTemplates();
  }, [website?.status]);

  // Load template pages when template selection changes
  const handleTemplateChange = async (templateId: string) => {
    setSelectedTemplateId(templateId);
    try {
      const response = await fetchTemplatePages(templateId);
      setSelectedTemplatePages(response.data);
    } catch (err) {
      console.error("Failed to load template pages:", err);
      setSelectedTemplatePages([]);
    }
  };

  // Project status polling (stops when CREATED or LIVE)
  useEffect(() => {
    if (!website) return;
    if (NON_POLLING_STATUSES.includes(website.status)) {
      setIsPolling(false);
      return;
    }
    setIsPolling(true);

    const pollStatus = async () => {
      if (!id || !isMountedRef.current) return;
      try {
        const response = await fetchWebsiteDetail(id);
        if (!isMountedRef.current) return;
        setWebsite(response.data);
        if (NON_POLLING_STATUSES.includes(response.data.status)) {
          setIsPolling(false);
          return;
        }
        pollTimeoutRef.current = setTimeout(pollStatus, POLL_INTERVAL);
      } catch (err) {
        if (!isMountedRef.current) return;
        console.error("Polling error:", err);
        pollTimeoutRef.current = setTimeout(pollStatus, POLL_INTERVAL);
      }
    };

    pollTimeoutRef.current = setTimeout(pollStatus, POLL_INTERVAL);
    return () => {
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    };
  }, [website?.status, id]);

  // Per-page generation status polling — active while any page is queued or generating
  useEffect(() => {
    if (!website || !id) return;
    if (website.status !== "IN_PROGRESS") return;

    const hasActivePages = pageGenStatuses.some(
      (p) => p.generation_status === "queued" || p.generation_status === "generating",
    );
    if (!hasActivePages && pageGenStatuses.length > 0) return;

    const pollPages = async () => {
      if (!isMountedRef.current) return;
      try {
        const response = await fetchPagesGenerationStatus(id);
        if (!isMountedRef.current) return;
        setPageGenStatuses(response.data);
        const stillActive = response.data.some(
          (p) => p.generation_status === "queued" || p.generation_status === "generating",
        );
        if (stillActive) {
          pageGenPollRef.current = setTimeout(pollPages, POLL_INTERVAL);
        } else {
          setIsCreatingAll(false);
          // Reload website to get updated project status
          loadWebsite();
        }
      } catch (err) {
        if (!isMountedRef.current) return;
        console.error("Page gen polling error:", err);
        pageGenPollRef.current = setTimeout(pollPages, POLL_INTERVAL);
      }
    };

    pageGenPollRef.current = setTimeout(pollPages, POLL_INTERVAL);
    return () => {
      if (pageGenPollRef.current) clearTimeout(pageGenPollRef.current);
    };
  }, [website?.status, id, pageGenStatuses.length]);

  // Click outside dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
      // Also handle org dropdown
      if (
        orgDropdownRef.current &&
        !orgDropdownRef.current.contains(event.target as Node)
      ) {
        setShowOrgDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounced search
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    setSearchError(null);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (value.trim().length < 2) {
      setSuggestions([]);
      setIsDropdownOpen(false);
      return;
    }
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        setSearching(true);
        const response = await searchPlaces(value);
        setSuggestions(response.suggestions || []);
        setIsDropdownOpen(response.suggestions?.length > 0);
      } catch (err) {
        console.error("Search failed:", err);
        setSearchError("Network error. Please try again.");
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isDropdownOpen || suggestions.length === 0) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : 0,
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : suggestions.length - 1,
        );
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < suggestions.length)
          handleSelectPlace(suggestions[highlightedIndex]);
        break;
      case "Escape":
        setIsDropdownOpen(false);
        setHighlightedIndex(-1);
        break;
    }
  };

  const handleSelectPlace = async (suggestion: PlaceSuggestion) => {
    if (!id || isLoadingDetails) return;
    try {
      setIsLoadingDetails(true);
      setSearchError(null);
      setSuggestions([]);
      setIsDropdownOpen(false);
      setSearchQuery(suggestion.mainText);
      const detailsResponse = await getPlaceDetails(suggestion.placeId);
      const place = detailsResponse.place;
      setSelectedPlace(place);
      setWebsiteUrl(place.websiteUri || "");
    } catch (err) {
      console.error("Failed to load place details:", err);
      setSearchError("Failed to load business details. Please try again.");
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const handleConfirmSelection = async () => {
    if (!id || !selectedPlace || isConfirming) return;
    if (!selectedTemplateId) {
      setSearchError("Please select a template.");
      return;
    }
    if (selectedTemplatePages.length === 0) {
      setSearchError(
        "Selected template has no pages. Please add pages to the template first.",
      );
      return;
    }

    try {
      setIsConfirming(true);
      setIsCreatingAll(true);
      setSearchError(null);

      // Save project metadata (place, template, colors) — server sets status to IN_PROGRESS
      await updateWebsite(id, {
        selected_place_id: selectedPlace.placeId,
        selected_website_url: dataSource === "website" ? (websiteUrl || null) : null,
        template_id: selectedTemplateId,
        primary_color: primaryColor,
        accent_color: accentColor,
        step_gbp_scrape: {
          name: selectedPlace.name,
          formattedAddress: selectedPlace.formattedAddress,
          phone: selectedPlace.phone,
          rating: selectedPlace.rating,
          reviewCount: selectedPlace.reviewCount,
          websiteUri: dataSource === "website" ? (websiteUrl || null) : null,
          category: selectedPlace.category,
        },
      } as any);

      // Build per-page config using explicit path inputs and websiteUrl overrides
      const globalWebsiteUrl = dataSource === "website" ? (websiteUrl || null) : null;
      const pageConfigs = selectedTemplatePages.map((tp) => ({
        templatePageId: tp.id,
        path: pagePathInputs[tp.id] ?? "",
        websiteUrl: pageWebsiteUrls[tp.id] !== undefined ? (pageWebsiteUrls[tp.id] || null) : globalWebsiteUrl,
      }));

      try {
        const result = await createAllFromTemplate(id, {
          templateId: selectedTemplateId,
          placeId: selectedPlace.placeId,
          pages: pageConfigs,
          businessName: selectedPlace.name,
          formattedAddress: selectedPlace.formattedAddress,
          city: selectedPlace.city,
          state: selectedPlace.state,
          phone: selectedPlace.phone ?? undefined,
          category: selectedPlace.category,
          primaryColor,
          accentColor,
          practiceSearchString: selectedPlace.practiceSearchString,
          rating: selectedPlace.rating ?? undefined,
          reviewCount: selectedPlace.reviewCount,
        });

        // Seed the polling state with queued items immediately
        setPageGenStatuses(result.data.map((p) => ({
          id: p.id,
          path: p.path,
          status: "draft",
          generation_status: "queued" as const,
          template_page_name: selectedTemplatePages.find((tp) => tp.id === p.templatePageId)?.name ?? null,
          updated_at: new Date().toISOString(),
        })));
      } catch (webhookErr) {
        console.error("Create all pipeline error:", webhookErr);
        toast.error("Failed to start page generation. Please try again.");
      }

      await loadWebsite();
      setSelectedPlace(null);
      setSearchQuery("");
      setWebsiteUrl("");
    } catch (err) {
      console.error("Failed to confirm selection:", err);
      setSearchError("Failed to save selection. Please try again.");
    } finally {
      setIsConfirming(false);
    }
  };

  const handleClearSelection = () => {
    setSelectedPlace(null);
    setSearchQuery("");
    setWebsiteUrl("");
  };

  const handleDelete = async () => {
    if (!id || isDeleting) return;
    const ok = await confirm({ title: "Delete this website project?", message: "This will also delete all its pages. This action cannot be undone.", confirmLabel: "Delete", variant: "danger" });
    if (!ok) return;
    try {
      setIsDeleting(true);
      await deleteWebsite(id);
      navigate("/admin/websites");
    } catch (err) {
      console.error("Failed to delete website:", err);
      alert(err instanceof Error ? err.message : "Failed to delete website");
      setIsDeleting(false);
    }
  };

  const handleDeletePageVersion = async (
    pageId: string,
    pageGroup: { path: string; pages: WebsitePage[] },
  ) => {
    const page = pageGroup.pages.find((p) => p.id === pageId);
    if (!page || !id) return;

    if (page.status === "published") {
      alert("Cannot delete a published page version.");
      return;
    }
    if (pageGroup.pages.length <= 1) {
      alert("Cannot delete the only version of a page.");
      return;
    }
    const okVersion = await confirm({ title: `Delete version ${page.version} of "${page.path}"?`, confirmLabel: "Delete", variant: "danger" });
    if (!okVersion) return;

    try {
      setDeletingPageId(pageId);
      const response = await fetch(
        `/api/admin/websites/${id}/pages/${pageId}`,
        {
          method: "DELETE",
        },
      );
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to delete page version");
      }
      invalidateWebsite(id!);
      await loadWebsite();
    } catch (err) {
      console.error("Failed to delete page version:", err);
      alert(
        err instanceof Error ? err.message : "Failed to delete page version",
      );
    } finally {
      setDeletingPageId(null);
    }
  };

  const handleDeletePage = async (path: string, versionCount: number) => {
    if (!id) return;
    const okPage = await confirm({ title: `Delete page "${path}"?`, message: `This will delete all ${versionCount} version${versionCount !== 1 ? "s" : ""}. This cannot be undone.`, confirmLabel: "Delete", variant: "danger" });
    if (!okPage) return;

    try {
      setDeletingPagePath(path);
      await deletePageByPath(id, path);
      invalidateWebsite(id);
      await loadWebsite();
    } catch (err) {
      console.error("Failed to delete page:", err);
      alert(err instanceof Error ? err.message : "Failed to delete page");
    } finally {
      setDeletingPagePath(null);
    }
  };

  const loadWebsite = async () => {
    if (!id) return;
    await invalidateWebsite(id);
  };

  const startPageGenerationPoll = useCallback(() => {
    if (pageGenPollRef.current) clearTimeout(pageGenPollRef.current);
    let attempts = 0;
    const maxAttempts = 20; // 20 × 3s = 60s

    const poll = async () => {
      if (!id || !isMountedRef.current) return;
      attempts++;
      try {
        const response = await fetchWebsiteDetail(id);
        if (!isMountedRef.current) return;
        setWebsite(response.data);

        if (response.data.pages.length > expectedPageCountRef.current) {
          setIsGeneratingPage(false);
          return;
        }
        if (attempts < maxAttempts) {
          pageGenPollRef.current = setTimeout(poll, POLL_INTERVAL);
        } else {
          setIsGeneratingPage(false);
        }
      } catch (err) {
        if (!isMountedRef.current) return;
        console.error("Page generation poll error:", err);
        if (attempts < maxAttempts) {
          pageGenPollRef.current = setTimeout(poll, POLL_INTERVAL);
        } else {
          setIsGeneratingPage(false);
        }
      }
    };

    pageGenPollRef.current = setTimeout(poll, POLL_INTERVAL);
  }, [id]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusStyles = (status: string): string => {
    switch (status) {
      case "LIVE":
        return "border-green-200 bg-green-100 text-green-700";
      case "IN_PROGRESS":
        return "border-purple-200 bg-purple-100 text-purple-700";
      case "CREATED":
        return "border-gray-200 bg-gray-100 text-gray-700";
      default:
        return "border-gray-200 bg-gray-100 text-gray-700";
    }
  };

  const getGenStatusStyles = (genStatus: string): string => {
    switch (genStatus) {
      case "ready":
        return "border-green-200 bg-green-100 text-green-700";
      case "generating":
        return "border-amber-200 bg-amber-100 text-amber-700";
      case "queued":
        return "border-gray-200 bg-gray-100 text-gray-500";
      case "failed":
        return "border-red-200 bg-red-100 text-red-700";
      default:
        return "border-gray-200 bg-gray-100 text-gray-500";
    }
  };

  const formatStatus = (status: string): string =>
    status
      .split("_")
      .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
      .join(" ");

  const getPageStatusStyles = (status: string): string => {
    switch (status) {
      case "published":
        return "border-green-200 bg-green-100 text-green-700";
      case "draft":
        return "border-yellow-200 bg-yellow-100 text-yellow-700";
      case "inactive":
        return "border-gray-200 bg-gray-100 text-gray-500";
      default:
        return "border-gray-200 bg-gray-100 text-gray-700";
    }
  };

  const isProcessingStatus = (status: string): boolean =>
    status === "IN_PROGRESS";

  const getGbpData = () => {
    if (website?.step_gbp_scrape && typeof website.step_gbp_scrape === "object")
      return website.step_gbp_scrape as Record<string, string | number | null>;
    return null;
  };

  const togglePath = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  if (loading) {
    // Show skeleton loading state with grey cards
    return (
      <div className="space-y-6">
        {/* Back button skeleton */}
        <div className="h-6 w-32 bg-gray-200 rounded animate-pulse"></div>

        {/* Header skeleton */}
        <div className="flex items-start justify-between">
          <div className="space-y-2 flex-1">
            <div className="h-8 w-64 bg-gray-200 rounded animate-pulse"></div>
            <div className="h-4 w-48 bg-gray-200 rounded animate-pulse"></div>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-10 w-32 bg-gray-200 rounded-lg animate-pulse"></div>
            <div className="h-10 w-24 bg-gray-200 rounded-lg animate-pulse"></div>
          </div>
        </div>

        {/* Tab bar skeleton */}
        <div className="flex gap-2 border-b border-gray-200 pb-2">
          <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-8 w-24 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
        </div>

        {/* Main content card skeleton */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
          <div className="h-6 w-40 bg-gray-200 rounded animate-pulse"></div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
            <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded animate-pulse w-1/2"></div>
          </div>
        </div>

        {/* Additional card skeleton */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
          <div className="h-6 w-32 bg-gray-200 rounded animate-pulse"></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="h-32 bg-gray-200 rounded-lg animate-pulse"></div>
            <div className="h-32 bg-gray-200 rounded-lg animate-pulse"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Link
          to="/admin/websites"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Websites
        </Link>
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-900">
              Error loading website
            </p>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
          <ActionButton
            label="Retry"
            onClick={loadWebsite}
            variant="danger"
            size="sm"
          />
        </div>
      </div>
    );
  }

  if (!website) {
    return (
      <div className="space-y-6">
        <Link
          to="/admin/websites"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Websites
        </Link>
        <div className="text-center py-16 text-gray-500">Website not found</div>
      </div>
    );
  }

  const gbpData = getGbpData();
  const isCreatedStatus = website.status === "CREATED";
  const isLive = website.status === "LIVE";
  const isInProgress = website.status === "IN_PROGRESS";
  const pageGroups = groupPagesByPath(website.pages);

  // Pre-compute all SEO titles/descriptions for uniqueness checks in the page list
  // Use displayPage (published or latest) per group — matches list score display
  const allPageSeoMeta = (() => {
    const titles: string[] = [];
    const descriptions: string[] = [];
    for (const group of pageGroups) {
      const publishedPage = group.pages.find((p) => p.status === "published");
      const seoPage = publishedPage || group.pages[0];
      if (seoPage?.seo_data?.meta_title) titles.push(seoPage.seo_data.meta_title);
      if (seoPage?.seo_data?.meta_description) descriptions.push(seoPage.seo_data.meta_description);
    }
    return { titles, descriptions };
  })();

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        to="/admin/websites"
        className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Websites
      </Link>

      {/* Header with compact meta pills */}
      <AdminPageHeader
        icon={<Globe className="w-6 h-6" />}
        title={
          website.display_name || (gbpData?.name ? String(gbpData.name) : website.generated_hostname)
        }
        description={
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 bg-gray-100 rounded-full px-2.5 py-1">
              <Globe className="h-3 w-3" />
              {website.generated_hostname}
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 bg-gray-100 rounded-full px-2.5 py-1">
              <Clock className="h-3 w-3" />
              Created {formatDate(website.created_at)}
            </span>
            {website.updated_at !== website.created_at && (
              <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 bg-gray-100 rounded-full px-2.5 py-1">
                <Clock className="h-3 w-3" />
                Updated {formatDate(website.updated_at)}
              </span>
            )}
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusStyles(website.status)}`}
            >
              {website.status === "LIVE" && (
                <CheckCircle className="h-3 w-3" />
              )}
              {isProcessingStatus(website.status) && (
                <Loader2 className="h-3 w-3 animate-spin" />
              )}
              {formatStatus(website.status)}
            </span>
          </div>
        }
        actionButtons={
          <div className="flex items-center gap-2">
            {/* Organization Dropdown */}
            <div className="relative" ref={orgDropdownRef}>
              <button
                onClick={() => setShowOrgDropdown(!showOrgDropdown)}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
              >
                <Building2 className="h-4 w-4" />
                {website?.organization
                  ? website.organization.name
                  : "No Organization"}
                <ChevronDown
                  className={`h-3 w-3 transition-transform ${showOrgDropdown ? "rotate-180" : ""}`}
                />
              </button>

              <AnimatePresence>
                {showOrgDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-50"
                  >
                    {website?.organization ? (
                      <>
                        <Link
                          to="/admin/organization-management"
                          className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                          onClick={() => setShowOrgDropdown(false)}
                        >
                          <ExternalLink className="h-4 w-4" />
                          Open Organization
                        </Link>
                        <button
                          onClick={() => {
                            setShowOrgDropdown(false);
                            handleUnlink();
                          }}
                          disabled={isLinking}
                          className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 w-full text-left disabled:opacity-50"
                        >
                          <X className="h-4 w-4" />
                          {isLinking ? "Unlinking..." : "Unlink Organization"}
                        </button>
                      </>
                    ) : (
                      <>
                        {loadingOrgs ? (
                          <div className="flex items-center gap-2 px-4 py-2 text-sm text-gray-500">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading...
                          </div>
                        ) : availableOrganizations.length === 0 ? (
                          <div className="px-4 py-2 text-sm text-gray-500">
                            No available organizations
                          </div>
                        ) : (
                          <>
                            <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase">
                              Link to Organization
                            </div>
                            {availableOrganizations.map((org) => (
                              <button
                                key={org.id}
                                onClick={async () => {
                                  setSelectedOrgId(org.id);
                                  setShowOrgDropdown(false);
                                  setIsLinking(true);
                                  try {
                                    await linkWebsiteToOrganization(
                                      id!,
                                      org.id,
                                    );
                                    toast.success("Organization linked");
                                    await loadWebsite();
                                    await loadAvailableOrganizations();
                                  } catch (err) {
                                    toast.error(
                                      err instanceof Error
                                        ? err.message
                                        : "Failed to link",
                                    );
                                  } finally {
                                    setIsLinking(false);
                                    setSelectedOrgId(null);
                                  }
                                }}
                                disabled={isLinking}
                                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-purple-50 w-full text-left disabled:opacity-50"
                              >
                                <Building2 className="h-4 w-4" />
                                {org.name}
                              </button>
                            ))}
                          </>
                        )}
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button
              onClick={() => setShowDomainModal(true)}
              className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition ${
                (website as any).custom_domain && (website as any).domain_verified_at
                  ? "border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
                  : (website as any).custom_domain
                    ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                    : "border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100"
              }`}
            >
              <Globe className="h-4 w-4" />
              {(website as any).custom_domain
                ? (website as any).custom_domain
                : "Custom Domain"}
            </button>
            <button
              onClick={loadWebsite}
              title="Refresh"
              className="inline-flex items-center justify-center rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            {isLive && (
              <a
                href={`https://${(website as any).custom_domain && (website as any).domain_verified_at ? (website as any).custom_domain : `${website.generated_hostname}.sites.getalloro.com`}`}
                target="_blank"
                rel="noopener noreferrer"
                title="View Live Site"
                className="inline-flex items-center justify-center rounded-lg p-2 text-green-600 transition hover:bg-green-50 hover:text-green-700"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              title={isDeleting ? "Deleting..." : "Delete"}
              className="inline-flex items-center justify-center rounded-lg p-2 text-red-500 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </button>
          </div>
        }
      />

      {/* Status Card — hidden when LIVE */}
      {!isLive && (
        <motion.div
          className="rounded-xl border border-gray-200 bg-white shadow-sm"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="p-5">
            {isCreatedStatus ? (
              // GBP Selector for CREATED status
              <div className="space-y-4">
                <AnimatePresence mode="wait">
                  {isLoadingDetails && (
                    <motion.div
                      key="loading"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex flex-col items-center justify-center py-8"
                    >
                      <Loader2 className="w-8 h-8 text-alloro-orange animate-spin mb-4" />
                      <p className="text-gray-600">
                        Loading business details...
                      </p>
                    </motion.div>
                  )}

                  {selectedPlace && !isLoadingDetails && (
                    <motion.div
                      key="confirmation"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="rounded-2xl border-2 border-alloro-orange/30 overflow-visible"
                    >
                      <div className="bg-gradient-to-br from-alloro-orange to-orange-500 p-4 text-white">
                        <h3 className="text-lg font-bold">
                          {selectedPlace.name}
                        </h3>
                        {selectedPlace.category && (
                          <p className="text-orange-100 text-sm">
                            {selectedPlace.category}
                          </p>
                        )}
                      </div>
                      <div className="p-4 space-y-3">
                        <div className="flex items-start gap-3">
                          <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                          <p className="text-sm text-gray-700">
                            {selectedPlace.formattedAddress}
                          </p>
                        </div>
                        {selectedPlace.rating && (
                          <div className="flex items-center gap-3">
                            <Star className="w-4 h-4 text-yellow-500" />
                            <p className="text-sm text-gray-700">
                              <span className="font-semibold">
                                {selectedPlace.rating}
                              </span>
                              <span className="text-gray-500">
                                {" "}
                                ({selectedPlace.reviewCount} reviews)
                              </span>
                            </p>
                          </div>
                        )}
                        {selectedPlace.phone && (
                          <div className="flex items-center gap-3">
                            <Phone className="w-4 h-4 text-gray-400" />
                            <p className="text-sm text-gray-700">
                              {selectedPlace.phone}
                            </p>
                          </div>
                        )}
                        {/* Data source toggle */}
                        <div className="pt-2 border-t border-gray-100">
                          <label className="block text-xs font-medium text-gray-500 mb-2">
                            Content Source
                          </label>
                          <div className="flex rounded-lg border border-gray-200 overflow-hidden mb-3">
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
                            <>
                              <div className="flex items-center gap-2">
                                <Globe className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                <input
                                  type="url"
                                  value={websiteUrl}
                                  onChange={(e) => setWebsiteUrl(e.target.value)}
                                  placeholder="https://example.com"
                                  className="flex-1 text-sm px-3 py-2 rounded-lg border border-gray-200 focus:border-alloro-orange focus:ring-2 focus:ring-alloro-orange/20 outline-none"
                                />
                              </div>
                              {!websiteUrl && (
                                <p className="text-xs text-gray-400 mt-1">
                                  Leave empty if there's no existing website
                                </p>
                              )}
                            </>
                          ) : (
                            <textarea
                              value={scrapedData}
                              onChange={(e) => setScrapedData(e.target.value)}
                              placeholder="Paste scraped content, service lists, bios, or any extra info you want the AI to use..."
                              rows={5}
                              className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:border-alloro-orange focus:ring-2 focus:ring-alloro-orange/20 outline-none resize-none"
                            />
                          )}
                        </div>
                        {/* Template selector */}
                        <div className="pt-2 border-t border-gray-100">
                          <label className="block text-xs font-medium text-gray-500 mb-1.5">
                            Template
                          </label>
                          {loadingTemplates ? (
                            <div className="flex items-center gap-2 text-sm text-gray-400">
                              <Loader2 className="w-4 h-4 animate-spin" />
                            </div>
                          ) : templates.length === 0 ? (
                            <p className="text-sm text-red-500">
                              No published templates available. Please create
                              and publish a template first.
                            </p>
                          ) : (
                            <select
                              value={selectedTemplateId || ""}
                              onChange={(e) =>
                                handleTemplateChange(e.target.value)
                              }
                              className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:border-alloro-orange focus:ring-2 focus:ring-alloro-orange/20 outline-none"
                            >
                              {templates.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name}
                                  {t.is_active ? " (Active)" : ""}
                                </option>
                              ))}
                            </select>
                          )}
                          {selectedTemplatePages.length === 0 &&
                            selectedTemplateId &&
                            !loadingTemplates && (
                              <p className="text-xs text-amber-500 mt-1">
                                This template has no pages. Add pages to the
                                template first.
                              </p>
                            )}
                          {selectedTemplatePages.length > 0 && (
                            <p className="text-xs text-gray-400 mt-1">
                              {selectedTemplatePages.length} page
                              {selectedTemplatePages.length !== 1 ? "s" : ""} in
                              this template
                            </p>
                          )}
                        </div>
                        {/* Brand colors */}
                        <div className="pt-2 border-t border-gray-100">
                          <label className="block text-xs font-medium text-gray-500 mb-2">
                            Brand Colors
                          </label>
                          <div className="flex items-start gap-4">
                            <ColorPicker
                              label="Primary"
                              value={primaryColor}
                              onChange={setPrimaryColor}
                            />
                            <ColorPicker
                              label="Accent"
                              value={accentColor}
                              onChange={setAccentColor}
                            />
                          </div>
                        </div>
                      </div>
                      {/* Per-page path + URL inputs (merged, side by side) */}
                      {selectedTemplatePages.length > 0 && (
                        <div className="px-4 pt-3 pb-2 border-t border-gray-100">
                          <div className={`grid gap-x-2 mb-1.5 ${dataSource === "website" ? "grid-cols-[5rem_1fr_1fr]" : "grid-cols-[5rem_1fr]"}`}>
                            <span className="text-xs font-medium text-gray-400">Page</span>
                            <span className="text-xs font-medium text-gray-400">Path <span className="text-red-400">*</span></span>
                            {dataSource === "website" && (
                              <span className="text-xs font-medium text-gray-400">Scrape URL (optional)</span>
                            )}
                          </div>
                          <div className="space-y-1.5">
                            {selectedTemplatePages.map((tp) => (
                              <div key={tp.id} className={`grid gap-x-2 items-center ${dataSource === "website" ? "grid-cols-[5rem_1fr_1fr]" : "grid-cols-[5rem_1fr]"}`}>
                                <span className="text-xs text-gray-500 truncate">{tp.name}</span>
                                <input
                                  type="text"
                                  value={pagePathInputs[tp.id] ?? ""}
                                  onChange={(e) =>
                                    setPagePathInputs((prev) => ({ ...prev, [tp.id]: e.target.value }))
                                  }
                                  placeholder="/your-path"
                                  className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 focus:border-alloro-orange focus:ring-1 focus:ring-alloro-orange/20 outline-none font-mono w-full"
                                />
                                {dataSource === "website" && (
                                  <input
                                    type="url"
                                    value={pageWebsiteUrls[tp.id] ?? ""}
                                    onChange={(e) =>
                                      setPageWebsiteUrls((prev) => ({ ...prev, [tp.id]: e.target.value }))
                                    }
                                    placeholder={websiteUrl || "Same as global"}
                                    className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 focus:border-alloro-orange focus:ring-1 focus:ring-alloro-orange/20 outline-none w-full"
                                  />
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-3">
                        <button
                          onClick={handleClearSelection}
                          disabled={isConfirming}
                          className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors disabled:opacity-50"
                        >
                          Search Again
                        </button>
                        <button
                          onClick={handleConfirmSelection}
                          disabled={
                            isConfirming ||
                            !selectedTemplateId ||
                            selectedTemplatePages.length === 0 ||
                            selectedTemplatePages.some((tp) => !pagePathInputs[tp.id]?.trim())
                          }
                          className="inline-flex items-center gap-2 bg-alloro-orange hover:bg-alloro-orange/90 disabled:bg-alloro-orange/50 text-white rounded-xl px-4 py-2 text-sm font-semibold transition-all disabled:cursor-not-allowed"
                        >
                          {isConfirming ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Creating {selectedTemplatePages.length} pages...
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4" />
                              Create All {selectedTemplatePages.length} Pages
                            </>
                          )}
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {!selectedPlace && !isLoadingDetails && (
                    <motion.div
                      key="search"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="relative"
                    >
                      <div className="flex items-start gap-2 mb-4">
                        <AlertCircle className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-gray-600">
                          Search for a Google Business Profile to generate the
                          website.
                        </p>
                      </div>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none z-10">
                          {searching ? (
                            <Loader2 className="h-5 w-5 text-alloro-orange animate-spin" />
                          ) : (
                            <Search className="h-5 w-5 text-gray-400" />
                          )}
                        </div>
                        <input
                          ref={inputRef}
                          type="text"
                          value={searchQuery}
                          onChange={(e) => {
                            handleSearchChange(e.target.value);
                            if (e.target.value.length >= 2)
                              setIsDropdownOpen(true);
                          }}
                          onFocus={() => {
                            if (suggestions.length > 0) setIsDropdownOpen(true);
                          }}
                          onKeyDown={handleKeyDown}
                          placeholder="Search for your business..."
                          autoComplete="off"
                          className="block w-full pl-12 pr-10 py-4 text-base rounded-2xl border-2 border-gray-200 bg-white focus:border-alloro-orange focus:ring-4 focus:ring-alloro-orange/20 transition-all outline-none font-medium placeholder:text-gray-400"
                        />
                        {searchQuery && (
                          <button
                            onClick={() => {
                              setSearchQuery("");
                              setSuggestions([]);
                              setIsDropdownOpen(false);
                              inputRef.current?.focus();
                            }}
                            className="absolute inset-y-0 right-4 flex items-center"
                          >
                            <X className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                          </button>
                        )}
                      </div>
                      <AnimatePresence>
                        {isDropdownOpen && suggestions.length > 0 && (
                          <motion.div
                            ref={dropdownRef}
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.15 }}
                            className="absolute z-50 w-full mt-2 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden"
                          >
                            <ul className="max-h-64 overflow-y-auto py-2">
                              {suggestions.map((suggestion, index) => (
                                <li key={suggestion.placeId}>
                                  <button
                                    onClick={() =>
                                      handleSelectPlace(suggestion)
                                    }
                                    onMouseEnter={() =>
                                      setHighlightedIndex(index)
                                    }
                                    className={`w-full px-4 py-3 flex items-start gap-3 text-left transition-colors ${highlightedIndex === index ? "bg-orange-50" : "hover:bg-gray-50"}`}
                                    disabled={isLoadingDetails}
                                  >
                                    <div
                                      className={`p-2 rounded-lg flex-shrink-0 ${highlightedIndex === index ? "bg-orange-100" : "bg-gray-100"}`}
                                    >
                                      <MapPin
                                        className={`w-4 h-4 ${highlightedIndex === index ? "text-alloro-orange" : "text-gray-500"}`}
                                      />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p
                                        className={`font-semibold truncate ${highlightedIndex === index ? "text-alloro-orange" : "text-gray-900"}`}
                                      >
                                        {suggestion.mainText}
                                      </p>
                                      <p className="text-sm text-gray-500 truncate">
                                        {suggestion.secondaryText}
                                      </p>
                                    </div>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      {searchError && (
                        <motion.p
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="mt-3 text-sm text-red-500 flex items-center gap-1.5"
                        >
                          <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
                          {searchError}
                        </motion.p>
                      )}
                      {!isDropdownOpen &&
                        searchQuery.length > 0 &&
                        searchQuery.length < 2 && (
                          <p className="mt-3 text-sm text-gray-400">
                            Type at least 2 characters to search...
                          </p>
                        )}
                      {searchQuery.length >= 2 &&
                        !searching &&
                        !isDropdownOpen &&
                        suggestions.length === 0 &&
                        !searchError && (
                          <p className="mt-3 text-sm text-gray-500">
                            No businesses found. Try a different search.
                          </p>
                        )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              // IN_PROGRESS — per-page generation status list
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 text-alloro-orange animate-spin" />
                    <span className="text-sm font-medium text-gray-900">
                      {isCreatingAll ? "Creating pages…" : "Pages in progress"}
                    </span>
                  </div>
                  {gbpData?.name && (
                    <span className="text-xs text-gray-500 truncate max-w-[200px]">
                      {String(gbpData.name)}
                    </span>
                  )}
                </div>

                {pageGenStatuses.length > 0 ? (
                  <div className="divide-y divide-gray-100 rounded-lg border border-gray-100 overflow-hidden">
                    {pageGenStatuses.map((p) => (
                      <div key={p.id} className="flex items-center justify-between px-4 py-2.5 bg-white">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="h-4 w-4 text-gray-400 shrink-0" />
                          <span className="text-sm text-gray-700 truncate">
                            {p.template_page_name || p.path}
                          </span>
                          <span className="text-xs text-gray-400">{p.path}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {(p.generation_status === "generating" || p.generation_status === "queued") && (
                            <Loader2 className="h-3.5 w-3.5 text-amber-500 animate-spin" />
                          )}
                          {p.generation_status === "ready" && (
                            <Check className="h-3.5 w-3.5 text-green-500 stroke-[3]" />
                          )}
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getGenStatusStyles(p.generation_status)}`}>
                            {p.generation_status}
                          </span>
                          {p.generation_status === "ready" && (
                            <Link
                              to={`/admin/websites/${id}/pages/${p.id}/edit`}
                              className="text-xs text-alloro-orange hover:underline font-medium"
                            >
                              View
                            </Link>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">Waiting for page generation status…</p>
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Tab bar: Pages | Layouts | Code Manager | Media | Form Submissions */}
      <div className="flex items-stretch gap-1 p-1.5 bg-gray-100 rounded-xl mb-4">
        {(["pages", "layouts", "code-manager", "media", "form-submissions", "posts", "menus", "redirects", "backups", "advanced-tools"] as const).map((tab) => {
          const isActive = detailTab === tab;
          const tabConfig: Record<string, { label: string; icon: React.ReactNode }> = {
            "pages": { label: "Pages", icon: <FileText className="w-3.5 h-3.5" /> },
            "layouts": { label: "Layouts", icon: <Layout className="w-3.5 h-3.5" /> },
            "code-manager": { label: "Code Manager", icon: <Code className="w-3.5 h-3.5" /> },
            "media": { label: "Media", icon: <Image className="w-3.5 h-3.5" /> },
            "form-submissions": { label: "Forms", icon: <Inbox className="w-3.5 h-3.5" /> },
            "posts": { label: "Posts", icon: <Newspaper className="w-3.5 h-3.5" /> },
            "menus": { label: "Menus", icon: <Menu className="w-3.5 h-3.5" /> },
            "redirects": { label: "Redirects", icon: <ArrowRightLeft className="w-3.5 h-3.5" /> },
            "backups": { label: "Backups", icon: <Archive className="w-3.5 h-3.5" /> },
            "advanced-tools": { label: "Advanced Tools", icon: <Wrench className="w-3.5 h-3.5" /> },
          };
          const config = tabConfig[tab] || { label: tab, icon: null };
          return (
            <motion.button
              key={tab}
              onClick={() => setDetailTab(tab)}
              className={`group relative flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive ? "text-gray-900" : "text-gray-500 hover:text-gray-700"
              }`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {isActive && (
                <motion.div
                  className="absolute inset-0 bg-white rounded-lg shadow-sm"
                  layoutId="websiteDetailTab"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                {config.icon}
                {config.label}
              </span>
            </motion.button>
          );
        })}
      </div>

      {/* Pages Section — grouped by path, expandable versions */}
      {detailTab === "pages" && (
        <motion.div
          className="rounded-xl border border-gray-200 bg-white shadow-sm"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="border-b border-gray-100 px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold text-gray-900">Pages</h3>
              <span className="text-xs text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full font-medium">
                {pageGroups.length} {pageGroups.length === 1 ? "page" : "pages"}
              </span>
              {isGeneratingPage && (
                <span className="flex items-center gap-1.5 text-xs text-alloro-orange">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Generating...
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* Bulk SEO generation progress */}
              {isBulkSeoActive && bulkSeoStatus ? (
                <span className="flex items-center gap-1.5 text-xs text-alloro-orange font-medium">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  SEO {bulkSeoStatus.completed_count}/{bulkSeoStatus.total_count}
                </span>
              ) : (
                pageGroups.length > 0 && (
                  <button
                    onClick={() => startBulkPageSeo()}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-orange-50 hover:text-alloro-orange rounded-lg transition-colors"
                    title="Generate SEO for all pages"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Generate SEO
                  </button>
                )
              )}
              {(isLive || isInProgress) && website.template_id && (
                <ActionButton
                  label={isGeneratingPage ? "Generating..." : "Create Page"}
                  icon={
                    isGeneratingPage ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <FileText className="w-4 h-4" />
                    )
                  }
                  onClick={() => setShowCreatePageModal(true)}
                  variant="primary"
                  size="sm"
                  disabled={isGeneratingPage}
                />
              )}
            </div>
          </div>
          <div className="divide-y divide-gray-100">
            {pageGroups.length > 0 ? (
              pageGroups.map((group) => {
                const isExpanded = expandedPaths.has(group.path);
                const latestPage = group.pages[0]; // Already sorted desc
                const publishedPage = group.pages.find(
                  (p) => p.status === "published",
                );
                const displayPage = publishedPage || latestPage;

                return (
                  <div key={group.path}>
                    {/* Page row (click to expand) */}
                    <div
                      className={`w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-all text-left ${
                        selectedPaths.has(group.path) ? "bg-alloro-orange/5 border-l-2 border-l-alloro-orange" : ""
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {/* Selection checkbox */}
                        <motion.button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedPaths((prev) => {
                              const next = new Set(prev);
                              if (next.has(group.path)) next.delete(group.path);
                              else next.add(group.path);
                              return next;
                            });
                          }}
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          className="shrink-0"
                        >
                          {selectedPaths.has(group.path) ? (
                            <CheckCircle className="h-5 w-5 text-alloro-orange" />
                          ) : (
                            <div className="h-5 w-5 rounded-full border-2 border-gray-300 hover:border-gray-400 transition-colors" />
                          )}
                        </motion.button>
                        <button onClick={() => togglePath(group.path)} className="flex items-center gap-3 text-left flex-1 min-w-0">
                          <FileText className="h-5 w-5 text-gray-400 shrink-0" />
                          <div className="min-w-0">
                            {editingName === group.path ? (
                              <form
                                onSubmit={async (e) => {
                                  e.preventDefault();
                                  const newName = nameInput.trim() || null;
                                  setSavingName(group.path);
                                  // Optimistic update — set name in cache immediately
                                  setWebsiteCache(id!, {
                                    ...website,
                                    pages: website.pages.map((p) =>
                                      p.path === group.path ? { ...p, display_name: newName } : p
                                    ),
                                  });
                                  try {
                                    await updatePageDisplayName(id!, group.path, newName);
                                  } finally {
                                    setSavingName(null);
                                    setEditingName(null);
                                  }
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className="flex items-center gap-1.5"
                              >
                                <input
                                  type="text"
                                  value={nameInput}
                                  onChange={(e) => setNameInput(e.target.value)}
                                  autoFocus
                                  placeholder={group.path}
                                  onKeyDown={(e) => { if (e.key === "Escape") setEditingName(null); }}
                                  className="text-sm font-medium px-2 py-0.5 border border-alloro-orange/30 rounded focus:outline-none focus:ring-1 focus:ring-alloro-orange/30 w-48"
                                  disabled={savingName === group.path}
                                />
                                {savingName === group.path ? (
                                  <Loader2 className="w-4 h-4 animate-spin text-gray-400 shrink-0" />
                                ) : (
                                  <>
                                    <button type="submit" className="p-0.5 text-green-500 hover:text-green-600 transition-colors" title="Save">
                                      <Check className="w-4 h-4" />
                                    </button>
                                    <button type="button" onClick={() => setEditingName(null)} className="p-0.5 text-gray-400 hover:text-gray-600 transition-colors" title="Cancel">
                                      <X className="w-4 h-4" />
                                    </button>
                                  </>
                                )}
                              </form>
                            ) : (
                              <div
                                className="flex items-baseline gap-1.5 cursor-text truncate"
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  setEditingName(group.path);
                                  setNameInput(displayPage.display_name || "");
                                }}
                                title="Double-click to rename"
                              >
                                <span className="font-medium text-gray-900">
                                  {displayPage.display_name || group.path}
                                </span>
                                {displayPage.display_name && (
                                  <span className="text-xs text-gray-400 font-normal">{group.path}</span>
                                )}
                              </div>
                            )}
                            <p className="text-xs text-gray-500">
                              {group.pages.length}{" "}
                              {group.pages.length === 1 ? "version" : "versions"}
                            </p>
                          </div>
                        </button>
                      </div>
                      <div className="flex items-center gap-3">
                        {/* SEO Score — use displayPage (published or latest) */}
                        {(() => {
                          const seoPage = displayPage;
                          const sibTitles = allPageSeoMeta.titles.filter((t) => t !== (seoPage.seo_data?.meta_title || ""));
                          const sibDescs = allPageSeoMeta.descriptions.filter((d) => d !== (seoPage.seo_data?.meta_description || ""));
                          const seoScore = computeSeoScore(seoPage.seo_data, sibTitles, sibDescs, website.wrapper || "");
                          return (
                            <div className="flex items-center gap-1.5" title={`SEO: ${seoScore.score}/${seoScore.max}`}>
                              <div className="w-8 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${seoScore.barClass}`}
                                  style={{ width: `${seoScore.pct}%` }}
                                />
                              </div>
                              <span className={`text-[10px] font-bold tabular-nums ${seoScore.colorClass}`}>
                                {seoScore.pct > 0 ? seoScore.pct : "—"}
                              </span>
                            </div>
                          );
                        })()}
                        {displayPage.generation_status && displayPage.generation_status !== "ready" ? (
                          <>
                            {(displayPage.generation_status === "generating" || displayPage.generation_status === "queued") && (
                              <Loader2 className="h-3.5 w-3.5 text-amber-500 animate-spin" />
                            )}
                            <span
                              className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${getGenStatusStyles(displayPage.generation_status)}`}
                            >
                              {displayPage.generation_status}
                            </span>
                          </>
                        ) : (
                          <>
                            <span
                              className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${getPageStatusStyles(displayPage.status)}`}
                            >
                              {displayPage.status}
                            </span>
                            {(displayPage.status === "published" ||
                              displayPage.status === "draft") && (
                              <Link
                                to={`/admin/websites/${id}/pages/${displayPage.id}/edit`}
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-100 hover:border-gray-300"
                              >
                                <Pencil className="h-3 w-3" />
                                Edit
                              </Link>
                            )}
                          </>
                        )}
                        <button onClick={() => togglePath(group.path)}>
                          <ChevronDown
                            className={`h-4 w-4 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                          />
                        </button>
                      </div>
                    </div>

                    {/* Expanded version list */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="bg-gray-50 border-t border-gray-100">
                            {group.pages.map((page) => {
                              const canDelete =
                                page.status !== "published" &&
                                group.pages.length > 1;
                              return (
                                <div
                                  key={page.id}
                                  className="flex items-center justify-between px-5 py-3 pl-14 border-b border-gray-100 last:border-b-0"
                                >
                                  <div className="flex items-center gap-3">
                                    <Hash className="h-3.5 w-3.5 text-gray-400" />
                                    <span className="text-sm font-medium text-gray-700">
                                      v{page.version}
                                    </span>
                                    {page.generation_status && page.generation_status !== "ready" ? (
                                      <>
                                        {(page.generation_status === "generating" || page.generation_status === "queued") && (
                                          <Loader2 className="h-3 w-3 text-amber-500 animate-spin" />
                                        )}
                                        <span
                                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getGenStatusStyles(page.generation_status)}`}
                                        >
                                          {page.generation_status}
                                        </span>
                                      </>
                                    ) : (
                                      <span
                                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getPageStatusStyles(page.status)}`}
                                      >
                                        {page.status}
                                      </span>
                                    )}
                                    <span className="text-xs text-gray-400">
                                      {formatDateTime(page.updated_at)}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {(!page.generation_status || page.generation_status === "ready") &&
                                      (page.status === "published" ||
                                      page.status === "draft") && (
                                      <Link
                                        to={`/admin/websites/${id}/pages/${page.id}/edit`}
                                        className="text-xs text-gray-500 hover:text-alloro-orange transition-colors"
                                      >
                                        <Pencil className="h-3 w-3" />
                                      </Link>
                                    )}
                                    {page.status === "inactive" && (
                                      <button
                                        onClick={async (e) => {
                                          e.stopPropagation();
                                          const ok = await confirm({
                                            title: `Revert to v${page.version}?`,
                                            message: "This will create a new draft from this version's content. The current published version will remain live until you publish the draft.",
                                            confirmLabel: "Revert",
                                          });
                                          if (!ok) return;
                                          try {
                                            // Create a new page version with this version's sections
                                            await fetch(`/api/admin/websites/${id}/pages`, {
                                              method: "POST",
                                              headers: { "Content-Type": "application/json" },
                                              body: JSON.stringify({
                                                path: page.path,
                                                sections: page.sections,
                                              }),
                                            });
                                            invalidateWebsite(id!);
                                            toast.success(`Created draft from v${page.version}`);
                                          } catch {
                                            toast.error("Failed to revert");
                                          }
                                        }}
                                        className="text-xs text-gray-400 hover:text-alloro-orange transition-colors"
                                        title="Revert to this version"
                                      >
                                        <RotateCcw className="h-3 w-3" />
                                      </button>
                                    )}
                                    {canDelete && (
                                      <button
                                        onClick={() =>
                                          handleDeletePageVersion(
                                            page.id,
                                            group,
                                          )
                                        }
                                        disabled={deletingPageId === page.id}
                                        className="text-xs text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                                        title="Delete this version"
                                      >
                                        {deletingPageId === page.id ? (
                                          <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : (
                                          <Trash2 className="h-3 w-3" />
                                        )}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                            {/* Delete entire page */}
                            <div className="px-5 py-2.5 pl-14 border-t border-gray-200 bg-gray-50/80">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeletePage(
                                    group.path,
                                    group.pages.length,
                                  );
                                }}
                                disabled={deletingPagePath === group.path}
                                className="inline-flex items-center gap-1.5 text-xs text-red-400 hover:text-red-600 transition-colors disabled:opacity-50"
                              >
                                {deletingPagePath === group.path ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3 w-3" />
                                )}
                                Delete page and all versions
                              </button>
                              {group.pages.filter((p) => p.status === "inactive").length > 5 && (
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    const inactiveVersions = group.pages.filter((p) => p.status === "inactive");
                                    const toDelete = inactiveVersions.slice(5); // Keep latest 5 inactive
                                    const ok = await confirm({
                                      title: `Clean up ${toDelete.length} old version(s)?`,
                                      message: `Keep the 5 most recent inactive versions and delete ${toDelete.length} older ones. Published and draft versions are not affected.`,
                                      confirmLabel: "Clean Up",
                                    });
                                    if (!ok) return;
                                    for (const v of toDelete) {
                                      await fetch(`/api/admin/websites/${id}/pages/${v.id}`, { method: "DELETE" }).catch(() => {});
                                    }
                                    invalidateWebsite(id!);
                                    toast.success(`Cleaned up ${toDelete.length} old version(s)`);
                                  }}
                                  className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-alloro-orange transition-colors ml-4"
                                >
                                  <RefreshCw className="h-3 w-3" />
                                  Clean up old versions ({group.pages.filter((p) => p.status === "inactive").length - 5} removable)
                                </button>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-8 text-gray-500">
                <FileText className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                <p>No pages created yet</p>
              </div>
            )}
          </div>

          {/* Bulk action bar — uses shared BulkActionBar component */}
          <BulkActionBar
            selectedCount={selectedPaths.size}
            totalCount={pageGroups.length}
            onSelectAll={() => setSelectedPaths(new Set(pageGroups.map((g) => g.path)))}
            onDeselectAll={() => setSelectedPaths(new Set())}
            isAllSelected={selectedPaths.size === pageGroups.length && pageGroups.length > 0}
            actions={[
              {
                label: "Generate SEO",
                icon: <Sparkles className="w-4 h-4" />,
                onClick: () => {
                  startBulkPageSeo(Array.from(selectedPaths));
                  setSelectedPaths(new Set());
                },
                variant: "primary" as const,
                disabled: isBulkSeoActive,
              },
              {
                label: "Publish",
                icon: <Check className="w-4 h-4" />,
                onClick: async () => {
                  let published = 0;
                  let failed = 0;
                  for (const path of selectedPaths) {
                    const group = pageGroups.find((g) => g.path === path);
                    // Find draft, or if only version exists use latest regardless of status
                    const target = group?.pages.find((p) => p.status === "draft") || group?.pages[0];
                    if (target && target.status !== "published") {
                      try {
                        const res = await fetch(`/api/admin/websites/${id}/pages/${target.id}/publish`, { method: "POST" });
                        if (res.ok) {
                          published++;
                        } else {
                          const err = await res.json().catch(() => ({}));
                          console.error(`Failed to publish ${path}:`, err);
                          failed++;
                        }
                      } catch {
                        failed++;
                      }
                    }
                  }
                  invalidateWebsite(id!);
                  setSelectedPaths(new Set());
                  if (published > 0) toast.success(`Published ${published} page(s)`);
                  if (failed > 0) toast.error(`Failed to publish ${failed} page(s)`);
                },
                variant: "secondary" as const,
              },
              {
                label: "Delete",
                icon: <Trash2 className="w-4 h-4" />,
                onClick: async () => {
                  const ok = await confirm({
                    title: `Delete ${selectedPaths.size} page(s)?`,
                    message: "This will delete all versions of the selected pages. This action cannot be undone.",
                    confirmLabel: "Delete",
                    variant: "danger",
                  });
                  if (!ok) return;
                  for (const path of selectedPaths) {
                    await deletePageByPath(id!, path);
                  }
                  invalidateWebsite(id!);
                  setSelectedPaths(new Set());
                  toast.success(`Deleted ${selectedPaths.size} page(s)`);
                },
                variant: "danger" as const,
              },
            ]}
          />
        </motion.div>
      )}

      {/* Layouts Section */}
      {detailTab === "layouts" && (
        <motion.div
          className="rounded-xl border border-gray-200 bg-white shadow-sm"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="border-b border-gray-100 px-5 py-4">
            <h3 className="text-lg font-semibold text-gray-900">Layouts</h3>
            <p className="text-xs text-gray-500 mt-1">
              Global wrapper, header, and footer for all pages
            </p>
          </div>
          <div className="divide-y divide-gray-100">
            {(["wrapper", "header", "footer"] as const).map((field) => (
              <Link
                key={field}
                to={`/admin/websites/${id}/layout/${field}`}
                className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Code className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="font-medium text-gray-900 capitalize">
                      {field}
                    </p>
                    <p className="text-xs text-gray-500">
                      {field === "wrapper"
                        ? "HTML shell with {{slot}} placeholder"
                        : field === "header"
                          ? "Site header rendered on all pages"
                          : "Site footer rendered on all pages"}
                    </p>
                  </div>
                </div>
                <Pencil className="h-4 w-4 text-gray-400" />
              </Link>
            ))}
          </div>
        </motion.div>
      )}

      {/* Code Manager Section */}
      {detailTab === "code-manager" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          {loadingSnippets ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
            </div>
          ) : (
            <CodeManagerTab
              projectId={id!}
              codeSnippets={codeSnippets}
              onSnippetsChange={loadCodeSnippets}
              isProject={true}
              pages={website.pages}
            />
          )}
        </motion.div>
      )}

      {/* Media Section */}
      {detailTab === "media" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <MediaTab projectId={id!} />
        </motion.div>
      )}

      {/* Form Submissions Section */}
      {detailTab === "form-submissions" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-6"
        >
          {/* Recipients config */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Email Recipients</h3>
            <RecipientsConfig projectId={id!} />
          </div>

          {/* Submissions table */}
          <FormSubmissionsTab projectId={id!} isAdmin />
        </motion.div>
      )}

      {/* Posts Section */}
      {detailTab === "posts" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <PostsTab projectId={id!} templateId={website.template_id} organizationId={website.organization?.id} />
        </motion.div>
      )}

      {/* Menus Section */}
      {detailTab === "menus" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <MenusTab projectId={id!} templateId={website.template_id} />
        </motion.div>
      )}

      {/* Redirects Section */}
      {detailTab === "redirects" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <RedirectsTab projectId={id!} />
        </motion.div>
      )}

      {/* Advanced Tools Section */}
      {detailTab === "advanced-tools" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <AiCommandTab projectId={id!} pages={website.pages} />
        </motion.div>
      )}

      {/* Backups Section */}
      {detailTab === "backups" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <BackupsTab projectId={id!} projectName={website.display_name || ""} />
        </motion.div>
      )}

      {/* Create Page Modal */}
      {showCreatePageModal && website.template_id && (
        <CreatePageModal
          projectId={website.id}
          templateId={website.template_id}
          gbpData={gbpData}
          defaultPlaceId={website.selected_place_id || ""}
          defaultWebsiteUrl={website.selected_website_url || ""}
          defaultPrimaryColor={website.primary_color || "#1E40AF"}
          defaultAccentColor={website.accent_color || "#F59E0B"}
          onSuccess={() => {
            setShowCreatePageModal(false);
            setIsGeneratingPage(true);
            expectedPageCountRef.current = website.pages.length;
            startPageGenerationPoll();
          }}
          onClose={() => setShowCreatePageModal(false)}
        />
      )}

      {/* Custom Domain Modal */}
      {website && (
        <ConnectDomainModal
          isOpen={showDomainModal}
          onClose={() => setShowDomainModal(false)}
          projectId={website.id}
          currentDomain={(website as any).custom_domain || null}
          domainVerifiedAt={(website as any).domain_verified_at || null}
          onDomainChange={async () => {
            const res = await fetchWebsiteDetail(website.id);
            if (res.success) setWebsite(res.data);
          }}
          onConnect={async (domain) => {
            const res = await connectDomain(website.id, domain);
            return res.data;
          }}
          onVerify={async () => {
            const res = await verifyDomainAdmin(website.id);
            return res.data;
          }}
          onDisconnect={async () => {
            await disconnectDomain(website.id);
          }}
        />
      )}
    </div>
  );
}
