import { useState, useRef, useCallback, useEffect, type DragEvent, type ChangeEvent } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  fetchPage,
  fetchWebsiteDetail,
  createDraftFromPage,
  updatePageSections,
  publishPage,
  editPageComponent,
  fetchEditorSystemPrompt,
  replaceArtifactBuild,
} from "../../api/websites";
import type { WebsitePage, WebsiteProject, EditChatHistory, EditDebugInfo } from "../../api/websites";
import type { Section } from "../../api/templates";
import { renderPage, normalizeSections } from "../../utils/templateRenderer";
import {
  useIframeSelector,
  prepareHtmlForPreview,
} from "../../hooks/useIframeSelector";
import type { QuickActionPayload, QuickActionType } from "../../hooks/useIframeSelector";
import { replaceComponentInDom, validateHtml, extractSectionsFromDom } from "../../utils/htmlReplacer";
import { AdminTopBar } from "../../components/Admin/AdminTopBar";
import { AdminSidebar } from "../../components/Admin/AdminSidebar";
import { LoadingIndicator } from "../../components/Admin/LoadingIndicator";
import { SidebarProvider, useSidebar } from "../../components/Admin/SidebarContext";
import EditorToolbar from "../../components/PageEditor/EditorToolbar";
import EditorSidebar from "../../components/PageEditor/EditorSidebar";
import SeoPanel from "../../components/PageEditor/SeoPanel";
import type { SeoData } from "../../api/websites";
import type { ChatMessage } from "../../components/PageEditor/ChatPanel";
import { ConfirmModal } from "../../components/settings/ConfirmModal";
import { AlertModal } from "../../components/ui/AlertModal";
import SectionsEditor from "../../components/Admin/SectionsEditor";

const MAX_CHAT_MESSAGES_PER_COMPONENT = 50;

function chatMapToObject(map: Map<string, ChatMessage[]>): EditChatHistory {
  const obj: EditChatHistory = {};
  for (const [key, messages] of map) {
    obj[key] = messages.slice(-MAX_CHAT_MESSAGES_PER_COMPONENT);
  }
  return obj;
}

function objectToChatMap(obj: EditChatHistory | null): Map<string, ChatMessage[]> {
  const map = new Map<string, ChatMessage[]>();
  if (!obj) return map;
  for (const [key, messages] of Object.entries(obj)) {
    if (Array.isArray(messages)) {
      map.set(key, messages);
    }
  }
  return map;
}

function ArtifactEditorView({
  projectId,
  page,
  onReplaced,
}: {
  projectId: string;
  page: WebsitePage;
  onReplaced: (page: WebsitePage) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f && (f.name.endsWith(".zip") || f.type === "application/zip")) {
      setFile(f);
      setError(null);
      setSuccess(false);
    } else {
      setError("Please upload a .zip file");
    }
  }, []);

  const handleFileSelect = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setError(null);
      setSuccess(false);
    }
  }, []);

  const handleUpload = async () => {
    if (!file) return;
    try {
      setUploading(true);
      setError(null);
      const result = await replaceArtifactBuild(projectId, page.id, file);
      onReplaced(result.data);
      setSuccess(true);
      setFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-xl mx-auto py-12 px-6 space-y-6">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Artifact Page</h2>
          <p className="text-sm text-gray-500 mt-1">
            This page serves an uploaded React app build. Replace the build by uploading a new zip.
          </p>
        </div>

        {/* Page info */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Path</span>
            <span className="text-sm font-mono text-gray-800">{page.path}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Status</span>
            <span className="text-sm text-green-700 font-medium">{page.status}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Last Updated</span>
            <span className="text-sm text-gray-600">{formatDate(page.updated_at)}</span>
          </div>
          {page.display_name && (
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Display Name</span>
              <span className="text-sm text-gray-800">{page.display_name}</span>
            </div>
          )}
        </div>

        {/* Upload zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 cursor-pointer transition ${
            isDragging
              ? "border-alloro-orange bg-orange-50"
              : file
                ? "border-green-300 bg-green-50"
                : "border-gray-200 bg-white hover:border-gray-300"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            onChange={handleFileSelect}
            className="hidden"
          />
          {file ? (
            <>
              <svg className="w-8 h-8 text-green-500 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
              </svg>
              <p className="text-sm font-medium text-gray-800">{file.name}</p>
              <p className="text-xs text-gray-500 mt-0.5">{formatFileSize(file.size)}</p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setFile(null);
                }}
                className="mt-2 text-xs text-red-500 hover:underline"
              >
                Remove
              </button>
            </>
          ) : (
            <>
              <svg className="w-8 h-8 text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <p className="text-sm font-medium text-gray-600">
                Drop a new build zip here or click to browse
              </p>
              <p className="text-xs text-gray-400 mt-1">.zip files only</p>
            </>
          )}
        </div>

        {/* Build requirement note */}
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
          <p className="text-xs text-amber-800">
            <strong>Reminder:</strong> Build with base path matching this page's slug:{" "}
            <code className="bg-amber-100 px-1 py-0.5 rounded text-[11px]">
              vite build --base={page.path}/
            </code>
          </p>
        </div>

        {/* Upload button */}
        {file && (
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="w-full py-3 rounded-xl font-medium text-sm text-white bg-alloro-orange hover:bg-alloro-orange/90 disabled:bg-alloro-orange/50 transition flex items-center justify-center gap-2"
          >
            {uploading ? (
              <>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Uploading...
              </>
            ) : (
              "Replace Build"
            )}
          </button>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Success */}
        {success && (
          <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3">
            <p className="text-sm text-green-700">Build replaced successfully. The page is now serving the new version.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function PageEditorInner() {
  const { id: projectId, pageId } = useParams<{
    id: string;
    pageId: string;
  }>();
  const navigate = useNavigate();
  const { setCollapsed } = useSidebar();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Force collapse sidebar when editor loads (needs more space)
  useEffect(() => {
    setCollapsed(true);
  }, [setCollapsed]);

  // Page + project state
  const [page, setPage] = useState<WebsitePage | null>(null);
  const [project, setProject] = useState<WebsiteProject | null>(null);
  const [draftPageId, setDraftPageId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sections + assembled HTML state
  const [sections, setSections] = useState<Section[]>([]);
  const [htmlContent, setHtmlContent] = useState("");
  const [editHistory, setEditHistory] = useState<Section[][]>([]);
  const [isDirty, setIsDirty] = useState(false);

  // UI state
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">(
    "desktop"
  );
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showSuccessAlert, setShowSuccessAlert] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  // View state: visual (iframe), code (monaco), or seo (seo panel)
  type EditorView = "visual" | "code" | "seo";
  const [activeView, setActiveView] = useState<EditorView>("visual");

  // Debug info from last LLM edit
  const [lastDebugInfo, setLastDebugInfo] = useState<EditDebugInfo | null>(null);

  // Pre-loaded system prompt (shown in debug tab before first edit)
  const [systemPrompt, setSystemPrompt] = useState<string | null>(null);

  // Per-component chat history: Map<alloroClass, ChatMessage[]>
  const [chatMap, setChatMap] = useState<Map<string, ChatMessage[]>>(new Map());

  // Quick action triggered from iframe label icons
  const [pendingSidebarAction, setPendingSidebarAction] = useState<QuickActionType | null>(null);
  const deferredEditRef = useRef<string | null>(null);
  const handleIframeQuickAction = useCallback((payload: QuickActionPayload) => {
    if ((payload.action === "text" || payload.action === "link") && payload.value) {
      // Text/link submitted from iframe input — queue for deferred handleSendEdit
      deferredEditRef.current = payload.action === "text"
        ? `Change the text content to "${payload.value}"`
        : `Change the link href to "${payload.value}"`;
      // Force a re-render so the effect picks it up
      setPendingSidebarAction("__deferred__" as QuickActionType);
    } else {
      // Media and hide — dispatch to sidebar
      setPendingSidebarAction(payload.action);
    }
  }, []);

  // Selector hook
  const { selectedInfo, setSelectedInfo, clearSelection, setupListeners, toggleHidden } =
    useIframeSelector(iframeRef, handleIframeQuickAction);

  // Debounced auto-save ref
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatMapRef = useRef(chatMap);
  chatMapRef.current = chatMap;

  // --- Load page data ---
  useEffect(() => {
    if (!projectId || !pageId) return;

    // Trigger loading indicator
    window.dispatchEvent(new Event('navigation-start'));

    const loadPage = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch project (for wrapper/header/footer) and page in parallel
        const [projectResponse, pageResponse] = await Promise.all([
          fetchWebsiteDetail(projectId),
          fetchPage(projectId, pageId),
        ]);

        const proj = projectResponse.data;
        setProject(proj);

        // Verify wrapper contains {{slot}} placeholder
        const wrapper = proj.wrapper || "{{slot}}";
        if (!wrapper.includes("{{slot}}")) {
          setError(
            "The project wrapper is missing the {{slot}} placeholder. " +
            "Open the Layout Editor → Wrapper and add {{slot}} where page content should be injected."
          );
          setLoading(false);
          return;
        }

        let pageData = pageResponse.data;

        // If the page is inactive (e.g. superseded by AI analysis auto-publish),
        // find the current published page at the same path and load that instead.
        if (pageData.status === "inactive" && pageData.page_type !== "artifact") {
          const activePage = proj.pages.find(
            (p: WebsitePage) => p.path === pageData.path && (p.status === "published" || p.status === "draft")
          );
          if (activePage) {
            const freshResponse = await fetchPage(projectId, activePage.id);
            pageData = freshResponse.data;
          }
        }

        let workingPage = pageData;
        let workingPageId = pageData.id;

        // If the page is published, create/get a draft for editing
        // Skip draft creation for artifact pages — they're edited by replacing the build
        if (pageData.status === "published" && pageData.page_type !== "artifact") {
          const draftResponse = await createDraftFromPage(projectId, pageId);
          workingPage = draftResponse.data;
          workingPageId = draftResponse.data.id;
        }

        setPage(workingPage);
        setDraftPageId(workingPageId);

        // Update URL to reflect the draft page ID so refresh loads the correct page.
        // Use replaceState to avoid re-triggering the useEffect that depends on pageId.
        if (workingPageId !== pageId) {
          window.history.replaceState(null, "", `/admin/websites/${projectId}/pages/${workingPageId}/edit`);
        }

        // Load sections from the page (handles both [...] and {sections: [...]} formats)
        const pageSections: Section[] = normalizeSections(workingPage.sections);
        setSections(pageSections);

        // Assemble full HTML for preview using project wrapper/header/footer
        const assembled = renderPage(
          proj.wrapper || "{{slot}}",
          proj.header || "",
          proj.footer || "",
          pageSections,
          undefined,
          undefined,
          undefined,
          projectId
        );
        setHtmlContent(assembled);

        // Hydrate chat history from persisted data
        const chatHistory = workingPage.edit_chat_history;
        if (chatHistory && typeof chatHistory === "object") {
          setChatMap(objectToChatMap(chatHistory));
        }
      } catch (err) {
        console.error("Failed to load page:", err);
        setError(
          err instanceof Error ? err.message : "Failed to load page"
        );
      } finally {
        setLoading(false);
        // Manually complete loading indicator
        window.dispatchEvent(new Event('navigation-complete'));
      }
    };

    loadPage();
  }, [projectId, pageId]);

  // --- Fetch system prompt for debug tab preview ---
  useEffect(() => {
    fetchEditorSystemPrompt()
      .then(setSystemPrompt)
      .catch((err) => console.error("Failed to load system prompt:", err));
  }, []);

  // --- Cleanup auto-save timeout ---
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  // --- Handle iframe load: set up selector listeners ---
  const handleIframeLoad = useCallback(() => {
    setupListeners();
  }, [setupListeners]);

  // --- Debounced auto-save ---
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;

  const scheduleSave = useCallback(
    (_html: string) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(async () => {
        if (!projectId || !draftPageId) return;
        try {
          await updatePageSections(
            projectId,
            draftPageId,
            sectionsRef.current,
            chatMapToObject(chatMapRef.current)
          );
          setIsDirty(false);
        } catch (err) {
          console.error("Auto-save failed:", err);
        }
      }, 800);
    },
    [projectId, draftPageId]
  );

  // --- Handle edit send ---
  const handleSendEdit = useCallback(
    async (instruction: string, attachedMedia?: any[]) => {
      // Block editing header/footer elements (they live on the project, not the page).
      // Check structurally: if the element is inside a data-alloro-section marker, it's page content.
      if (selectedInfo) {
        const doc = iframeRef.current?.contentDocument;
        const el = doc?.querySelector(`.${CSS.escape(selectedInfo.alloroClass)}`);
        if (el && !el.closest("[data-alloro-section]")) {
          setEditError("Header/footer components can't be edited here. Use the Layout Editor from the project page.");
          return;
        }
      }

      if (!projectId || !draftPageId || !selectedInfo) return;

      setIsEditing(true);
      setEditError(null);

      const alloroClass = selectedInfo.alloroClass;

      // Build enriched instruction with attached media context
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
        content: instruction, // Show user's original text only
        timestamp: Date.now(),
      };

      setChatMap((prev) => {
        const next = new Map(prev);
        const messages = next.get(alloroClass) || [];
        next.set(alloroClass, [...messages, userMessage]);
        return next;
      });

      try {
        const existingMessages = chatMap.get(alloroClass) || [];
        const chatHistory = existingMessages.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const result = await editPageComponent(projectId, draftPageId, {
          alloroClass,
          currentHtml: selectedInfo.outerHtml,
          instruction: enrichedInstruction, // Send enriched instruction to API
          chatHistory,
        });

        // Capture debug info from LLM response
        setLastDebugInfo(result.debug ?? null);

        // Handle rejection — LLM flagged the instruction as not allowed
        if (result.rejected) {
          const rejectionMessage: ChatMessage = {
            role: "assistant",
            content: result.message || "This edit is not allowed.",
            timestamp: Date.now(),
            isError: true,
          };

          setChatMap((prev) => {
            const next = new Map(prev);
            const messages = next.get(alloroClass) || [];
            next.set(alloroClass, [...messages, rejectionMessage]);
            return next;
          });
          return;
        }

        const validation = validateHtml(result.editedHtml!);
        if (!validation.valid) {
          throw new Error(
            `Invalid HTML from edit: ${validation.error}`
          );
        }

        setEditHistory((prev) => [...prev, structuredClone(sections)]);

        const iframe = iframeRef.current;
        if (iframe?.contentDocument) {
          // Capture scroll position before mutation
          const scrollY = iframe.contentWindow?.scrollY || 0;
          const scrollX = iframe.contentWindow?.scrollX || 0;

          const { html: newHtml } = replaceComponentInDom(
            iframe.contentDocument,
            alloroClass,
            result.editedHtml!
          );
          // Don't setHtmlContent here - it causes iframe srcDoc to reload and flicker
          // The DOM is already mutated in place, which is what the user sees

          // Extract updated sections from the mutated DOM
          // Use sectionsRef.current (not closure `sections`) to avoid stale data
          const updatedSections = extractSectionsFromDom(iframe.contentDocument, sectionsRef.current);
          setSections(updatedSections);

          setIsDirty(true);
          scheduleSave(newHtml);
          setupListeners();

          // Restore scroll position
          iframe.contentWindow?.scrollTo(scrollX, scrollY);

          // Refresh selectedInfo with the fresh outerHTML from the mutated DOM
          const freshEl = iframe.contentDocument.querySelector(`.${CSS.escape(alloroClass)}`);
          if (freshEl && selectedInfo) {
            setSelectedInfo({
              ...selectedInfo,
              outerHtml: freshEl.outerHTML,
              isHidden: freshEl.getAttribute("data-alloro-hidden") === "true",
            });
          }
        }

        const assistantMessage: ChatMessage = {
          role: "assistant",
          content: result.message || "Edit applied.",
          timestamp: Date.now(),
        };

        setChatMap((prev) => {
          const next = new Map(prev);
          const messages = next.get(alloroClass) || [];
          next.set(alloroClass, [...messages, assistantMessage]);
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
          const messages = next.get(alloroClass) || [];
          next.set(alloroClass, [...messages, errorChatMessage]);
          return next;
        });
      } finally {
        setIsEditing(false);
      }
    },
    [
      projectId,
      draftPageId,
      selectedInfo,
      setSelectedInfo,
      chatMap,
      htmlContent,
      scheduleSave,
      setupListeners,
    ]
  );

  // Process deferred quick-action edits from iframe input panel
  useEffect(() => {
    if (deferredEditRef.current && pendingSidebarAction === ("__deferred__" as QuickActionType)) {
      const instruction = deferredEditRef.current;
      deferredEditRef.current = null;
      setPendingSidebarAction(null);
      handleSendEdit(instruction);
    }
  }, [pendingSidebarAction, handleSendEdit]);

  // --- Undo ---
  const handleUndo = useCallback(() => {
    if (editHistory.length === 0) return;

    const previousSections = editHistory[editHistory.length - 1];
    setEditHistory((prev) => prev.slice(0, -1));
    setSections(previousSections);

    // Reassemble HTML from restored sections
    const assembled = renderPage(
      project?.wrapper || "{{slot}}",
      project?.header || "",
      project?.footer || "",
      previousSections,
      undefined,
      undefined,
      undefined,
      projectId
    );
    setHtmlContent(assembled);
    setIsDirty(true);
    scheduleSave(assembled);
    clearSelection();
  }, [editHistory, project, scheduleSave, clearSelection]);

  // --- Toggle hidden ---
  const handleToggleHidden = useCallback(() => {
    toggleHidden();

    const iframe = iframeRef.current;
    if (iframe?.contentDocument) {
      const updatedSections = extractSectionsFromDom(iframe.contentDocument, sectionsRef.current);
      setSections(updatedSections);
      setIsDirty(true);
      scheduleSave("");
    }
  }, [toggleHidden, scheduleSave]);

  // --- Manual save ---
  const handleSave = useCallback(async () => {
    if (!projectId || !draftPageId || isSaving) return;

    try {
      setIsSaving(true);
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      await updatePageSections(
        projectId,
        draftPageId,
        sections,
        chatMapToObject(chatMap)
      );
      setIsDirty(false);
    } catch (err) {
      console.error("Save failed:", err);
      setEditError(
        err instanceof Error ? err.message : "Failed to save"
      );
    } finally {
      setIsSaving(false);
    }
  }, [projectId, draftPageId, sections, chatMap, isSaving]);

  // --- Publish ---
  const handlePublish = useCallback(() => {
    if (!projectId || !draftPageId || isPublishing) return;
    setShowPublishModal(true);
  }, [projectId, draftPageId, isPublishing]);

  const handlePublishConfirmed = useCallback(async () => {
    if (!projectId || !draftPageId) return;

    try {
      setIsPublishing(true);

      if (isDirty) {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        await updatePageSections(
          projectId,
          draftPageId,
          sections,
          chatMapToObject(chatMap)
        );
      }

      await publishPage(projectId, draftPageId);

      // Stay in editor by creating a new draft from the published page
      const publishedPage = await fetchPage(projectId, draftPageId);
      const newDraft = await createDraftFromPage(projectId, publishedPage.data.id);

      // Update state to work with new draft
      setDraftPageId(newDraft.data.id);
      setPage(newDraft.data);
      setIsDirty(false);

      // Update URL to reflect the new draft page ID so refresh loads the correct page
      window.history.replaceState(null, "", `/admin/websites/${projectId}/pages/${newDraft.data.id}/edit`);

      // Reload sections and iframe from the new draft
      const draftSections: Section[] = normalizeSections(newDraft.data.sections);
      setSections(draftSections);
      if (project) {
        const assembled = renderPage(
          project.wrapper || "{{slot}}",
          project.header || "",
          project.footer || "",
          draftSections,
          undefined,
          undefined,
          undefined,
          projectId
        );
        setHtmlContent(assembled);
      }

      // Clear chat history for fresh draft
      setChatMap(new Map());

      // Close modal and show success alert
      setShowPublishModal(false);
      setEditError(null);

      // Show success alert with version info
      setSuccessMessage(`Page published successfully! You are now working on version ${newDraft.data.version}.`);
      setShowSuccessAlert(true);
    } catch (err) {
      console.error("Publish failed:", err);
      setEditError(
        err instanceof Error ? err.message : "Failed to publish"
      );
      setShowPublishModal(false);
    } finally {
      setIsPublishing(false);
    }
  }, [projectId, draftPageId, sections, chatMap, isDirty]);

  // --- View switching ---
  const handleViewChange = useCallback(
    (view: EditorView) => {
      // Clear selection when entering code or seo view
      if (view === "code" || view === "seo") {
        clearSelection();
      }

      setActiveView(view);
    },
    [clearSelection]
  );

  // --- Handle sections change from SectionsEditor (code view) ---
  const handleCodeSectionsChange = useCallback(
    (updated: Section[]) => {
      setSections(updated);
      setIsDirty(true);

      // Rebuild preview
      const assembled = renderPage(
        project?.wrapper || "{{slot}}",
        project?.header || "",
        project?.footer || "",
        updated,
        undefined,
        undefined,
        undefined,
        projectId
      );
      setHtmlContent(assembled);
      scheduleSave(assembled);
    },
    [project, projectId, scheduleSave]
  );

  // --- Current chat messages for selected element ---
  const currentChatMessages = selectedInfo
    ? chatMap.get(selectedInfo.alloroClass) || []
    : [];

  // --- Loading state ---
  if (loading) {
    return (
      <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
        {/* Topbar loading indicator */}
        <LoadingIndicator />
        <AdminTopBar />
        <AdminSidebar />

        {/* Loading skeleton that matches editor layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left sidebar skeleton */}
          <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
            <div className="p-4 border-b border-gray-200">
              <div className="h-8 bg-gray-200 rounded animate-pulse"></div>
            </div>
            <div className="flex-1 p-4 space-y-3">
              <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4"></div>
              <div className="h-4 bg-gray-200 rounded animate-pulse w-1/2"></div>
            </div>
          </div>

          {/* Center preview skeleton */}
          <div className="flex-1 bg-gray-100 p-4 flex items-center justify-center">
            <div className="w-full h-full max-w-6xl bg-white rounded-xl shadow-lg border border-gray-200 animate-pulse"></div>
          </div>

          {/* Right sidebar skeleton */}
          <div className="w-96 bg-white border-l border-gray-200 flex flex-col">
            <div className="p-4 border-b border-gray-200">
              <div className="h-8 bg-gray-200 rounded animate-pulse"></div>
            </div>
            <div className="flex-1 p-4 space-y-3">
              <div className="h-20 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-4 bg-gray-200 rounded animate-pulse w-2/3"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- Error state ---
  if (error || !page) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AdminTopBar />
        <div className="flex items-center justify-center" style={{ height: "calc(100vh - 4rem)" }}>
          <div className="text-center">
            <p className="text-sm text-red-500 mb-4">{error || "Page not found"}</p>
            <button
              onClick={() => navigate(`/admin/websites/${projectId}`)}
              className="text-xs text-alloro-orange hover:text-alloro-orange/80 transition-colors"
            >
              Back to project
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      {/* Topbar loading indicator */}
      <LoadingIndicator />

      {/* Admin header */}
      <AdminTopBar />

      {/* Editor toolbar */}
      <EditorToolbar
        projectId={projectId!}
        pagePath={page.path}
        pageVersion={page.version}
        pageStatus={page.status}
        device={device}
        onDeviceChange={setDevice}
        activeView={activeView}
        onViewChange={handleViewChange}
        onUndo={handleUndo}
        onSave={handleSave}
        onPublish={handlePublish}
        canUndo={editHistory.length > 0}
        isSaving={isSaving}
        isPublishing={isPublishing}
        isDirty={isDirty}
      />

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

      {/* Main content: iframe + editor sidebar */}
      <div className="flex-1 flex overflow-hidden relative ml-[72px]">
        {/* Admin sidebar — fixed position, collapsed by default.
            Offset below both AdminTopBar (4rem) and EditorToolbar (~41px).
            ml-[72px] on parent reserves space for the collapsed sidebar. */}
        <AdminSidebar topOffset="calc(4rem + 41px)" />

        {/* Artifact page: show upload UI instead of editor */}
        {page.page_type === "artifact" ? (
          <ArtifactEditorView
            projectId={projectId!}
            page={page}
            onReplaced={(updated) => setPage(updated)}
          />
        ) : activeView === "seo" ? (
          <div className="flex-1 overflow-hidden">
            <SeoPanel
              projectId={projectId!}
              entityId={draftPageId!}
              entityType="page"
              seoData={page.seo_data}
              pagePath={page.path}
              pageContent={sections.map((s) => s.content || "").join("\n")}
              homepageContent=""
              headerHtml={project?.header || ""}
              footerHtml={project?.footer || ""}
              wrapperHtml={project?.wrapper || ""}
              onSeoDataChange={(data: SeoData) => {
                setPage((prev) => prev ? { ...prev, seo_data: data } : prev);
              }}
              organizationId={project?.organization?.id}
            />
          </div>
        ) : activeView === "code" ? (
          <>
            <div className="flex-1 overflow-hidden">
              <SectionsEditor
                sections={sections}
                onChange={handleCodeSectionsChange}
                onSave={handleSave}
              />
            </div>
            <div className="flex-1 bg-gray-100 p-4 overflow-hidden flex items-start justify-center">
              <div
                className="h-full rounded-xl overflow-hidden shadow-lg border border-gray-200 transition-all duration-300 mx-auto bg-white"
                style={{
                  width:
                    device === "desktop"
                      ? "100%"
                      : device === "tablet"
                        ? "768px"
                        : "375px",
                  maxWidth: "100%",
                }}
              >
                <iframe
                  srcDoc={prepareHtmlForPreview(htmlContent)}
                  sandbox="allow-same-origin allow-scripts"
                  className="w-full h-full border-0 bg-white"
                />
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex-1 bg-gray-100 p-4 overflow-hidden flex items-start justify-center">
              <div
                className="h-full rounded-xl overflow-hidden shadow-lg border border-gray-200 transition-all duration-300 mx-auto bg-white"
                style={{
                  width:
                    device === "desktop"
                      ? "100%"
                      : device === "tablet"
                        ? "768px"
                        : "375px",
                  maxWidth: "100%",
                }}
              >
                <iframe
                  ref={iframeRef}
                  srcDoc={prepareHtmlForPreview(htmlContent)}
                  sandbox="allow-same-origin allow-scripts"
                  onLoad={handleIframeLoad}
                  className="w-full h-full border-0 bg-white"
                />
              </div>
            </div>
          </>
        )}

        {/* Editor sidebar — shown only in visual view */}
        {activeView === "visual" && (
          <EditorSidebar
            selectedInfo={selectedInfo}
            chatMessages={currentChatMessages}
            onSendEdit={handleSendEdit}
            onToggleHidden={handleToggleHidden}
            isEditing={isEditing}
            debugInfo={lastDebugInfo}
            systemPrompt={systemPrompt}
            projectId={projectId}
            externalAction={pendingSidebarAction !== ("__deferred__" as QuickActionType) ? pendingSidebarAction : null}
            onExternalActionHandled={() => setPendingSidebarAction(null)}
          />
        )}
      </div>

      {/* Publish Confirmation Modal */}
      <ConfirmModal
        isOpen={showPublishModal}
        onClose={() => setShowPublishModal(false)}
        onConfirm={handlePublishConfirmed}
        title="Publish Page"
        message="Publish this page? The current published version will be replaced. You'll continue editing in a new draft."
        confirmText="Publish"
        cancelText="Cancel"
        isLoading={isPublishing}
        type="info"
      />

      {/* Success Alert Modal */}
      <AlertModal
        isOpen={showSuccessAlert}
        onClose={() => setShowSuccessAlert(false)}
        title="Published Successfully"
        message={successMessage}
        type="success"
        buttonText="Continue Editing"
        autoDismiss={true}
      />
    </div>
  );
}

export default function PageEditor() {
  return (
    <SidebarProvider defaultCollapsed>
      <PageEditorInner />
    </SidebarProvider>
  );
}
