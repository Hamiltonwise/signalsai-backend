import { useState, useRef, useCallback, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  fetchPage,
  fetchWebsiteDetail,
  createDraftFromPage,
  updatePageSections,
  publishPage,
  editPageComponent,
  fetchEditorSystemPrompt,
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

        const pageData = pageResponse.data;

        let workingPage = pageData;
        let workingPageId = pageData.id;

        // If the page is published, create/get a draft for editing
        if (pageData.status === "published") {
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

        {/* Preview area: iframe, code editor, or SEO panel */}
        {activeView === "seo" ? (
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
