import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Globe,
  ExternalLink,
  AlertCircle,
  Sparkles,
  Link as LinkIcon,
  Inbox,
  Monitor,
  Smartphone,
  ChevronDown,
  Undo2,
  RotateCcw,
  Check,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { apiGet, apiPost, apiPatch, apiPut, apiDelete } from "../api";
import ConnectDomainModal from "../components/Admin/ConnectDomainModal";
import FormSubmissionsTab from "../components/Admin/FormSubmissionsTab";
import RecipientsConfig from "../components/Admin/RecipientsConfig";
import {
  renderPage as assemblePageHtml,
  normalizeSections,
} from "../utils/templateRenderer";
import {
  useIframeSelector,
  prepareHtmlForPreview,
} from "../hooks/useIframeSelector";
import type {
  QuickActionPayload,
  QuickActionType,
} from "../hooks/useIframeSelector";
import {
  replaceComponentInDom,
  validateHtml,
  extractSectionsFromDom,
} from "../utils/htmlReplacer";
import EditorSidebar from "../components/PageEditor/EditorSidebar";
import type { ChatMessage } from "../components/PageEditor/ChatPanel";
import type { PageVersion } from "../components/PageEditor/VersionHistoryTab";
import type { Section } from "../api/templates";
import { useSidebar } from "../components/Admin/SidebarContext";

interface Page {
  id: string;
  path: string;
  status: string;
  sections: unknown;
  updated_at: string;
}

interface Project {
  id: string;
  hostname: string;
  status: string;
  is_read_only: boolean;
  custom_domain: string | null;
  domain_verified_at: string | null;
  wrapper: string;
  header: string;
  footer: string;
}

interface Usage {
  storage_used: number;
  storage_limit: number;
  storage_percentage: number;
  edits_today: number;
  edits_limit: number;
}

const DESKTOP_SCALE = 0.7;

export function DFYWebsite() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<
    "PREPARING" | "READY" | "READ_ONLY" | null
  >(null);
  const [project, setProject] = useState<Project | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [selectedPage, setSelectedPage] = useState<Page | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [showDomainModal, setShowDomainModal] = useState(false);
  const [activeView, setActiveView] = useState<"editor" | "submissions">(
    "editor",
  );
  const [viewportMode, setViewportMode] = useState<"desktop" | "mobile">(
    "desktop",
  );
  const [isPageDropdownOpen, setIsPageDropdownOpen] = useState(false);

  // Version preview state
  const [previewVersion, setPreviewVersion] = useState<PageVersion | null>(null);
  const [previewHtmlContent, setPreviewHtmlContent] = useState("");

  // Editor state (ported from admin PageEditor)
  const [sections, setSections] = useState<Section[]>([]);
  const [htmlContent, setHtmlContent] = useState("");
  const [chatMap, setChatMap] = useState<Map<string, ChatMessage[]>>(new Map());
  const [isEditing, setIsEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editHistory, setEditHistory] = useState<Section[][]>([]);
  const [pendingSidebarAction, setPendingSidebarAction] =
    useState<QuickActionType | null>(null);

  const { setCollapsed } = useSidebar();

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;
  const deferredEditRef = useRef<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Auto-collapse sidebar when entering website editor (like admin PageEditor)
  useEffect(() => {
    setCollapsed(true);
  }, [setCollapsed]);

  // Quick action handler from iframe label icons
  const handleIframeQuickAction = useCallback(
    (payload: QuickActionPayload) => {
      if (
        (payload.action === "text" || payload.action === "link") &&
        payload.value
      ) {
        deferredEditRef.current =
          payload.action === "text"
            ? `Change the text content to "${payload.value}"`
            : `Change the link href to "${payload.value}"`;
        setPendingSidebarAction("__deferred__" as QuickActionType);
      } else {
        setPendingSidebarAction(payload.action);
      }
    },
    [],
  );

  // Selector hook (hover, click, selection in iframe)
  const {
    selectedInfo,
    setSelectedInfo,
    clearSelection,
    setupListeners,
    toggleHidden,
  } = useIframeSelector(iframeRef, handleIframeQuickAction);

  // User-facing API wrappers (routes don't need projectId — inferred from auth)
  const userFetchRecipients = async (_projectId: string) =>
    apiGet({ path: "/user/website/recipients" });

  const userUpdateRecipients = async (
    _projectId: string,
    recipients: string[],
  ) =>
    apiPut({
      path: "/user/website/recipients",
      passedData: { recipients },
    });

  const userFetchSubmissions = async (
    _projectId: string,
    page: number,
    limit: number,
    filter?: string,
  ) => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (filter) params.set("filter", filter);
    return apiGet({
      path: `/user/website/form-submissions?${params}`,
    });
  };

  const userToggleRead = async (
    _projectId: string,
    submissionId: string,
    is_read: boolean,
  ) =>
    apiPatch({
      path: `/user/website/form-submissions/${submissionId}/read`,
      passedData: { is_read },
    });

  const userDeleteSubmission = async (
    _projectId: string,
    submissionId: string,
  ) =>
    apiDelete({
      path: `/user/website/form-submissions/${submissionId}`,
    });

  const handleExportSubmissions = async () => {
    try {
      const token =
        window.sessionStorage.getItem("token") ||
        localStorage.getItem("auth_token") ||
        localStorage.getItem("token");
      const apiBase = (import.meta as any)?.env?.VITE_API_URL ?? "/api";
      const response = await fetch(`${apiBase}/user/website/form-submissions/export`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        toast.error("Failed to export submissions");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "form-submissions.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to export submissions");
    }
  };

  // Close dropdown on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsPageDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // --- Load website data ---
  useEffect(() => {
    fetchWebsite();
  }, []);

  // --- Assemble preview when page or project changes ---
  useEffect(() => {
    if (!selectedPage || !project) return;

    const pageSections = normalizeSections(selectedPage.sections);
    setSections(pageSections);

    const html = assemblePageHtml(
      project.wrapper || "{{slot}}",
      project.header || "",
      project.footer || "",
      pageSections,
      undefined,
      undefined,
      undefined,
      project.id,
    );
    setHtmlContent(html);

    // Reset editor state for new page
    setChatMap(new Map());
    setEditHistory([]);
    setEditError(null);
  }, [selectedPage, project]);

  const fetchWebsite = async () => {
    try {
      const data = await apiGet({ path: "/user/website" });

      if (data.status === "PREPARING") {
        setStatus("PREPARING");
      } else if (data.project) {
        setProject(data.project);
        setPages(data.pages || []);
        setUsage(data.usage);

        if (data.project.is_read_only) {
          setStatus("READ_ONLY");
        } else {
          setStatus("READY");
        }

        if (data.pages?.length > 0) {
          setSelectedPage(data.pages[0]);
        }
      }
    } catch (error) {
      toast.error("Failed to load website");
    } finally {
      setLoading(false);
    }
  };

  // --- Handle iframe load: set up selector listeners ---
  const handleIframeLoad = useCallback(() => {
    setupListeners();
  }, [setupListeners]);

  // --- Handle edit send (ported from admin PageEditor) ---
  const handleSendEdit = useCallback(
    async (instruction: string, attachedMedia?: any[]) => {
      if (!selectedPage || !selectedInfo) return;

      setIsEditing(true);
      setEditError(null);

      const alloroClass = selectedInfo.alloroClass;

      // Enrich instruction with attached media context
      let enrichedInstruction = instruction;
      if (attachedMedia && attachedMedia.length > 0) {
        enrichedInstruction += "\n\n## Use the images below:\n";
        attachedMedia.forEach((media, index) => {
          const altText = media.alt_text ? ` (${media.alt_text})` : "";
          enrichedInstruction += `Image ${index + 1}${altText}: ${media.s3_url}\n`;
        });
      }

      const userMessage: ChatMessage = {
        role: "user",
        content: instruction,
        timestamp: Date.now(),
      };

      setChatMap((prev) => {
        const next = new Map(prev);
        next.set(alloroClass, [
          ...(next.get(alloroClass) || []),
          userMessage,
        ]);
        return next;
      });

      try {
        const existingMessages = chatMap.get(alloroClass) || [];
        const chatHistory = existingMessages.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const result = await apiPost({
          path: `/user/website/pages/${selectedPage.id}/edit`,
          passedData: {
            alloroClass,
            currentHtml: selectedInfo.outerHtml,
            instruction: enrichedInstruction,
            chatHistory,
          },
        });

        // Handle rejection
        if (result.rejected) {
          const rejectionMessage: ChatMessage = {
            role: "assistant",
            content: result.message || "This edit is not allowed.",
            timestamp: Date.now(),
            isError: true,
          };

          setChatMap((prev) => {
            const next = new Map(prev);
            next.set(alloroClass, [
              ...(next.get(alloroClass) || []),
              rejectionMessage,
            ]);
            return next;
          });
          return;
        }

        // DOM mutation path — if API returns edited HTML
        if (result.editedHtml) {
          const validation = validateHtml(result.editedHtml);
          if (!validation.valid) {
            throw new Error(`Invalid HTML: ${validation.error}`);
          }

          setEditHistory((prev) => [...prev, structuredClone(sections)]);

          const iframe = iframeRef.current;
          if (iframe?.contentDocument) {
            const scrollY = iframe.contentWindow?.scrollY || 0;
            const scrollX = iframe.contentWindow?.scrollX || 0;

            replaceComponentInDom(
              iframe.contentDocument,
              alloroClass,
              result.editedHtml,
            );

            const updatedSections = extractSectionsFromDom(
              iframe.contentDocument,
              sectionsRef.current,
            );
            setSections(updatedSections);

            setupListeners();
            iframe.contentWindow?.scrollTo(scrollX, scrollY);

            const freshEl = iframe.contentDocument.querySelector(
              `.${CSS.escape(alloroClass)}`,
            );
            if (freshEl && selectedInfo) {
              setSelectedInfo({
                ...selectedInfo,
                outerHtml: freshEl.outerHTML,
                isHidden:
                  freshEl.getAttribute("data-alloro-hidden") === "true",
              });
            }
          }
        } else {
          // Fallback: refresh entire page data
          await fetchWebsite();
        }

        const assistantMessage: ChatMessage = {
          role: "assistant",
          content: result.message || "Edit applied.",
          timestamp: Date.now(),
        };

        setChatMap((prev) => {
          const next = new Map(prev);
          next.set(alloroClass, [
            ...(next.get(alloroClass) || []),
            assistantMessage,
          ]);
          return next;
        });
      } catch (err) {
        console.error("Edit failed:", err);
        const errorMessage =
          err instanceof Error ? err.message : "Edit failed";
        setEditError(errorMessage);

        const errorChatMessage: ChatMessage = {
          role: "assistant",
          content: `Error: ${errorMessage}`,
          timestamp: Date.now(),
          isError: true,
        };

        setChatMap((prev) => {
          const next = new Map(prev);
          next.set(alloroClass, [
            ...(next.get(alloroClass) || []),
            errorChatMessage,
          ]);
          return next;
        });
      } finally {
        setIsEditing(false);
      }
    },
    [selectedPage, selectedInfo, chatMap, setupListeners, setSelectedInfo],
  );

  // Process deferred quick-action edits from iframe input panel
  useEffect(() => {
    if (
      deferredEditRef.current &&
      pendingSidebarAction === ("__deferred__" as QuickActionType)
    ) {
      const instruction = deferredEditRef.current;
      deferredEditRef.current = null;
      setPendingSidebarAction(null);
      handleSendEdit(instruction);
    }
  }, [pendingSidebarAction, handleSendEdit]);

  // --- Toggle hidden ---
  const handleToggleHidden = useCallback(() => {
    toggleHidden();

    const iframe = iframeRef.current;
    if (iframe?.contentDocument) {
      const updatedSections = extractSectionsFromDom(
        iframe.contentDocument,
        sectionsRef.current,
      );
      setSections(updatedSections);
    }
  }, [toggleHidden]);

  // --- Undo ---
  const handleUndo = useCallback(() => {
    if (editHistory.length === 0 || !project) return;

    const previousSections = editHistory[editHistory.length - 1];
    setEditHistory((prev) => prev.slice(0, -1));
    setSections(previousSections);

    const html = assemblePageHtml(
      project.wrapper || "{{slot}}",
      project.header || "",
      project.footer || "",
      previousSections,
      undefined,
      undefined,
      undefined,
      project.id,
    );
    setHtmlContent(html);
    clearSelection();
  }, [editHistory, project, clearSelection]);

  // --- Version preview ---
  const handlePreviewVersion = useCallback(
    async (version: PageVersion) => {
      if (!project || !selectedPage) return;
      try {
        const res = await apiGet({
          path: `/user/website/pages/${selectedPage.id}/versions/${version.id}`,
        });
        const versionData = res.data;
        const versionSections = normalizeSections(versionData.sections);
        const html = assemblePageHtml(
          project.wrapper || "{{slot}}",
          project.header || "",
          project.footer || "",
          versionSections,
          undefined,
          undefined,
          undefined,
          project.id,
        );
        setPreviewHtmlContent(html);
        setPreviewVersion(version);
        clearSelection();
      } catch {
        toast.error("Failed to load version preview");
      }
    },
    [project, selectedPage, clearSelection],
  );

  const handleExitPreview = useCallback(() => {
    setPreviewVersion(null);
    setPreviewHtmlContent("");
  }, []);

  const handleRestoreVersion = useCallback(
    async (versionId: string) => {
      if (!selectedPage) return;
      await apiPost({
        path: `/user/website/pages/${selectedPage.id}/versions/${versionId}/restore`,
      });
      setPreviewVersion(null);
      setPreviewHtmlContent("");
      toast.success("Version restored");
      await fetchWebsite();
    },
    [selectedPage],
  );

  // Current chat messages for selected element
  const currentChatMessages = selectedInfo
    ? chatMap.get(selectedInfo.alloroClass) || []
    : [];

  // --- Loading skeleton ---
  if (loading) {
    return (
      <div className="flex flex-col h-screen bg-alloro-bg animate-pulse">
        <div className="bg-white border-b border-black/5 px-4 py-3 flex items-center gap-4">
          <div className="h-6 w-32 bg-slate-200 rounded" />
          <div className="flex gap-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-8 w-20 bg-slate-100 rounded-lg" />
            ))}
          </div>
        </div>
        <div className="flex flex-1 min-h-0">
          <div className="flex-1 p-6">
            <div className="h-full bg-slate-100 rounded-2xl" />
          </div>
          <div className="w-96 bg-white border-l border-black/5 p-4 space-y-4">
            <div className="h-6 w-24 bg-slate-200 rounded" />
            <div className="h-4 w-48 bg-slate-100 rounded" />
            <div className="mt-8 space-y-3">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="h-4 bg-slate-100 rounded"
                  style={{ width: `${80 - i * 15}%` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (status === "PREPARING") {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center max-w-md">
          <div className="animate-spin w-12 h-12 border-4 border-alloro-orange border-t-transparent rounded-full mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">
            Your Website is Being Prepared
          </h2>
          <p className="text-gray-600">
            We're setting up your website. You'll receive an email when it's
            ready!
          </p>
        </div>
      </div>
    );
  }

  if (status === "READ_ONLY") {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center max-w-md">
          <AlertCircle className="w-16 h-16 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">
            Website in Read-Only Mode
          </h2>
          <p className="text-gray-600 mb-4">
            Your subscription has been downgraded. Your website is still live
            but you cannot make edits.
          </p>
          <p className="text-sm text-gray-500">
            Contact your administrator to upgrade your plan and regain editing
            access.
          </p>
        </div>
      </div>
    );
  }

  // Empty state — project exists but no pages yet
  if (status === "READY" && pages.length === 0) {
    return (
      <div className="min-h-screen bg-alloro-bg font-body flex items-center justify-center py-16 px-6">
        <div className="max-w-xl w-full text-center">
          {/* Animated building blocks */}
          <div className="flex items-end justify-center gap-2 mb-8 h-20">
            <div className="w-5 rounded-t-md bg-alloro-orange/60 animate-[grow1_1.5s_ease-in-out_infinite]" />
            <div className="w-5 rounded-t-md bg-alloro-orange/80 animate-[grow2_1.5s_ease-in-out_infinite_0.2s]" />
            <div className="w-5 rounded-t-md bg-alloro-orange animate-[grow3_1.5s_ease-in-out_infinite_0.4s]" />
            <div className="w-5 rounded-t-md bg-alloro-orange/80 animate-[grow2_1.5s_ease-in-out_infinite_0.6s]" />
            <div className="w-5 rounded-t-md bg-alloro-orange/60 animate-[grow1_1.5s_ease-in-out_infinite_0.8s]" />
          </div>

          <div className="inline-flex items-center gap-2 px-4 py-2 bg-alloro-orange/10 rounded-full mb-4">
            <Sparkles className="w-4 h-4 text-alloro-orange" />
            <span className="text-xs font-bold text-alloro-orange uppercase tracking-wider">
              Almost There
            </span>
          </div>
          <h1 className="text-3xl font-black text-alloro-navy font-heading tracking-tight mb-3">
            Your Website is Being Built
          </h1>
          <p className="text-base text-slate-500 font-medium max-w-md mx-auto">
            Your project has been created and Alloro is setting up your pages.
            You'll be able to edit them here once they're ready.
          </p>
        </div>

        <style>{`
          @keyframes grow1 {
            0%, 100% { height: 24px; }
            50% { height: 56px; }
          }
          @keyframes grow2 {
            0%, 100% { height: 32px; }
            50% { height: 72px; }
          }
          @keyframes grow3 {
            0%, 100% { height: 40px; }
            50% { height: 80px; }
          }
        `}</style>
      </div>
    );
  }

  const liveUrl =
    project?.custom_domain && project?.domain_verified_at
      ? `https://${project.custom_domain}`
      : project
        ? `https://${project.hostname}.sites.getalloro.com`
        : null;

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Top Bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-3">
        <div className="flex items-center gap-2 shrink-0 text-sm font-semibold text-gray-800">
          <Globe className="h-4 w-4 text-alloro-orange" />
          <span className="truncate max-w-[200px]">
            {project?.custom_domain || (project ? `${project.hostname}.sites.getalloro.com` : "Your Website")}
          </span>
        </div>

        {/* Page Selector Dropdown */}
        <div className="relative shrink-0" ref={dropdownRef}>
          <button
            onClick={() => setIsPageDropdownOpen((prev) => !prev)}
            className="flex items-center gap-2 pl-3 pr-2.5 py-1.5 rounded-lg text-sm font-medium border border-gray-200 bg-gray-50 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-alloro-orange/20 focus:border-alloro-orange cursor-pointer transition-colors"
          >
            <span className="truncate max-w-[140px]">
              {selectedPage
                ? selectedPage.path === "/"
                  ? "Home"
                  : selectedPage.path
                : "Select page"}
            </span>
            <motion.span
              animate={{ rotate: isPageDropdownOpen ? 180 : 0 }}
              transition={{ duration: 0.2 }}
              className="shrink-0"
            >
              <ChevronDown size={14} className="text-gray-400" />
            </motion.span>
          </button>

          <AnimatePresence>
            {isPageDropdownOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.97 }}
                transition={{ duration: 0.15 }}
                className="absolute top-full left-0 mt-1 min-w-[180px] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden z-50"
              >
                {pages.map((page) => {
                  const isActive = selectedPage?.id === page.id;
                  return (
                    <button
                      key={page.id}
                      onClick={() => {
                        setSelectedPage(page);
                        setActiveView("editor");
                        setIsPageDropdownOpen(false);
                        setPreviewVersion(null);
                        setPreviewHtmlContent("");
                      }}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between ${
                        isActive
                          ? "bg-alloro-orange/5 text-alloro-orange font-medium"
                          : "text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      <span>{page.path === "/" ? "Home" : page.path}</span>
                      {isActive && <Check size={14} className="text-alloro-orange shrink-0" />}
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Viewport Toggle */}
        {activeView === "editor" && (
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5 shrink-0">
            <button
              onClick={() => setViewportMode("desktop")}
              className={`p-1.5 rounded-md transition-colors ${
                viewportMode === "desktop"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-400 hover:text-gray-600"
              }`}
              title="Desktop view"
            >
              <Monitor size={14} />
            </button>
            <button
              onClick={() => setViewportMode("mobile")}
              className={`p-1.5 rounded-md transition-colors ${
                viewportMode === "mobile"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-400 hover:text-gray-600"
              }`}
              title="Mobile view"
            >
              <Smartphone size={14} />
            </button>
          </div>
        )}

        {/* Undo */}
        {activeView === "editor" && editHistory.length > 0 && (
          <button
            onClick={handleUndo}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0"
            title="Undo last edit"
          >
            <Undo2 size={14} />
          </button>
        )}

        <div className="w-px h-5 bg-gray-200" />

        <button
          onClick={() => setActiveView("submissions")}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 shrink-0 ${
            activeView === "submissions"
              ? "bg-orange-100 text-orange-700"
              : "text-gray-600 hover:bg-gray-100"
          }`}
        >
          <Inbox size={14} />
          Submissions
        </button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right section: usage, domain, view live */}
        <div className="flex items-center gap-3 shrink-0">
          {usage && (
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span>
                {usage.edits_today}/{usage.edits_limit} edits
              </span>
              <span>{Math.round(usage.storage_percentage)}% storage</span>
            </div>
          )}

          <button
            onClick={() => setShowDomainModal(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              project?.custom_domain && project?.domain_verified_at
                ? "bg-green-50 text-green-700 hover:bg-green-100"
                : project?.custom_domain
                  ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
                  : "bg-alloro-orange/10 text-alloro-orange hover:bg-alloro-orange/20"
            }`}
          >
            <LinkIcon className="w-3.5 h-3.5" />
            {project?.custom_domain || "Connect Domain"}
          </button>

          {liveUrl && (
            <a
              href={`${liveUrl}${selectedPage?.path || ""}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-alloro-orange transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              View Live
            </a>
          )}
        </div>
      </div>

      {/* Error banner */}
      {editError && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 flex items-center justify-between">
          <span className="text-xs text-red-600">{editError}</span>
          <button
            onClick={() => setEditError(null)}
            className="text-xs text-red-400 hover:text-red-600"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Content */}
      {activeView === "submissions" ? (
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {project && (
            <>
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">
                  Email Recipients
                </h3>
                <RecipientsConfig
                  projectId={project.id}
                  fetchRecipientsFn={userFetchRecipients}
                  updateRecipientsFn={userUpdateRecipients}
                />
              </div>
              <FormSubmissionsTab
                projectId={project.id}
                fetchSubmissionsFn={userFetchSubmissions}
                toggleReadFn={userToggleRead}
                deleteSubmissionFn={userDeleteSubmission}
                onExport={handleExportSubmissions}
              />
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Preview */}
          <div className="flex-1 flex flex-col relative">
            <div className="flex-1 overflow-hidden bg-gray-100">
              {viewportMode === "desktop" ? (
                <iframe
                  ref={iframeRef}
                  srcDoc={prepareHtmlForPreview(
                    previewVersion ? previewHtmlContent : htmlContent,
                  )}
                  style={{
                    width: `${Math.round(100 / DESKTOP_SCALE)}%`,
                    height: `${Math.round(100 / DESKTOP_SCALE)}%`,
                    transform: `scale(${DESKTOP_SCALE})`,
                    transformOrigin: "top left",
                  }}
                  className="border-0"
                  title="Page Preview"
                  sandbox="allow-same-origin allow-scripts"
                  onLoad={handleIframeLoad}
                />
              ) : (
                <div className="flex justify-center h-full py-4">
                  <div className="w-[375px] h-full bg-white rounded-2xl shadow-xl border border-gray-300 overflow-hidden">
                    <iframe
                      ref={iframeRef}
                      srcDoc={prepareHtmlForPreview(
                        previewVersion ? previewHtmlContent : htmlContent,
                      )}
                      className="w-full h-full border-0"
                      title="Page Preview"
                      sandbox="allow-same-origin allow-scripts"
                      onLoad={handleIframeLoad}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Version preview overlay */}
            <AnimatePresence>
              {previewVersion && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  transition={{ duration: 0.2 }}
                  className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white border border-gray-200 rounded-xl shadow-xl px-5 py-3 flex items-center gap-4 z-10"
                >
                  <div className="text-sm">
                    <p className="text-gray-700 font-medium">
                      Previewing v{previewVersion.version}
                    </p>
                    <p className="text-xs text-gray-400">
                      Editing is disabled in preview mode
                    </p>
                  </div>
                  <button
                    onClick={() => handleRestoreVersion(previewVersion.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-alloro-orange text-white text-xs font-medium hover:bg-alloro-orange/90 transition-colors"
                  >
                    <RotateCcw size={12} />
                    Restore this version
                  </button>
                  <button
                    onClick={handleExitPreview}
                    className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    Exit
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {viewportMode === "desktop" && !previewVersion && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/50 text-white text-[10px] px-3 py-1 rounded-full backdrop-blur-sm">
                Preview scaled to fit — use View Live for full size
              </div>
            )}
          </div>

          {/* Editor Sidebar (no debug tab, with history tab) */}
          <EditorSidebar
            selectedInfo={previewVersion ? null : selectedInfo}
            chatMessages={currentChatMessages}
            onSendEdit={handleSendEdit}
            onToggleHidden={handleToggleHidden}
            isEditing={isEditing}
            debugInfo={null}
            systemPrompt={null}
            showDebug={false}
            showHistory={true}
            historyPageId={selectedPage?.id || null}
            onPreviewVersion={handlePreviewVersion}
            onRestoreVersion={handleRestoreVersion}
            isPreviewingVersion={!!previewVersion}
            previewVersionId={previewVersion?.id || null}
            onExitPreview={handleExitPreview}
            externalAction={
              pendingSidebarAction !==
              ("__deferred__" as QuickActionType)
                ? pendingSidebarAction
                : null
            }
            onExternalActionHandled={() => setPendingSidebarAction(null)}
          />
        </div>
      )}

      {/* Custom Domain Modal */}
      {project && (
        <ConnectDomainModal
          isOpen={showDomainModal}
          onClose={() => setShowDomainModal(false)}
          projectId={project.id}
          currentDomain={project.custom_domain}
          domainVerifiedAt={project.domain_verified_at}
          onDomainChange={fetchWebsite}
          onConnect={async (domain) => {
            const res = await apiPost({
              path: "/user/website/domain/connect",
              passedData: { domain },
            });
            return { server_ip: res.data.server_ip };
          }}
          onVerify={async () => {
            const res = await apiPost({
              path: "/user/website/domain/verify",
            });
            return res.data;
          }}
          onDisconnect={async () => {
            await apiDelete({ path: "/user/website/domain/disconnect" });
          }}
        />
      )}
    </div>
  );
}
