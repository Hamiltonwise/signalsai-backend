import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  fetchPageProgressiveState,
  type PageProgressiveState,
} from "../../api/websites";
import { renderPage } from "../../utils/templateRenderer";
import { prepareHtmlForPreview } from "../../hooks/useIframeSelector";

interface ProgressivePagePreviewProps {
  projectId: string;
  pageId: string;
  /** Poll interval in ms while generation is active. Default 2000. */
  pollMs?: number;
  /** Called once the page flips to `ready`. */
  onReady?: () => void;
}

/**
 * Renders the page as it's being built. Template sections appear as-is
 * (dimmed) until their generated content lands, then swap in place. Uses
 * the project's real wrapper/header/footer so Tailwind + brand CSS +
 * fonts are all loaded — same assembly path as the regular PageEditor
 * preview. Sandbox isolates the iframe.
 */
export default function ProgressivePagePreview({
  projectId,
  pageId,
  pollMs = 2000,
  onReady,
}: ProgressivePagePreviewProps) {
  const [state, setState] = useState<PageProgressiveState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const readyNotifiedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const res = await fetchPageProgressiveState(projectId, pageId);
        if (cancelled) return;
        const next = res.data;
        setState(next);

        if (next.generation_status === "ready" && !readyNotifiedRef.current) {
          readyNotifiedRef.current = true;
          onReady?.();
        }

        if (
          next.generation_status !== "ready" &&
          next.generation_status !== "failed"
        ) {
          timer = setTimeout(tick, pollMs);
        }
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.message || "Failed to load page state");
        timer = setTimeout(tick, pollMs * 2);
      }
    };

    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [projectId, pageId, pollMs, onReady]);

  const srcDoc = useMemo(() => {
    if (!state) return null;

    const generatedByName = new Map(
      state.generated_sections.map((s) => [s.name, s.content] as const),
    );

    // Build a merged section list: generated HTML where available, template
    // default otherwise. Wrap each section in a marker div so the dim/pill
    // overlay can target it.
    const merged = state.template_sections.map((section) => {
      const rendered = generatedByName.get(section.name);
      const isReady = typeof rendered === "string" && rendered.length > 0;
      const inner = isReady ? (rendered as string) : section.content;
      const stateAttr = isReady ? "ready" : "pending";
      return {
        name: section.name,
        content: `<div data-alloro-preview-section="${escapeAttr(section.name)}" data-alloro-preview-state="${stateAttr}">${inner}</div>`,
      };
    });

    const wrapper = state.wrapper || "{{slot}}";
    const header = state.header || "";
    const footer = state.footer || "";

    let assembled = renderPage(
      wrapper,
      header,
      footer,
      merged,
      undefined,
      undefined,
      undefined,
      projectId,
    );

    // Inject the overlay CSS + per-section "Building…" label immediately
    // before </body> so it wins over template styles.
    const overlayCss = `
      <style>
        [data-alloro-preview-section] { position: relative; }
        [data-alloro-preview-state="pending"] > * { opacity: 0.35 !important; filter: saturate(0.5) !important; pointer-events: none !important; }
        [data-alloro-preview-state="pending"]::before {
          content: attr(data-alloro-preview-label);
          position: absolute; inset-inline: 0; top: 50%; transform: translateY(-50%);
          display: inline-block; pointer-events: none;
          margin: 0 auto; width: fit-content; padding: 0.5rem 1rem;
          background: rgba(255,255,255,0.96); backdrop-filter: blur(4px);
          border: 1px solid #fde68a; border-radius: 9999px;
          color: #b45309; font-weight: 500; font-size: 0.8125rem;
          font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
          box-shadow: 0 1px 3px rgba(0,0,0,0.06);
          z-index: 10;
        }
        [data-alloro-preview-state="ready"] { animation: alloro-section-in 350ms ease-out both; }
        @keyframes alloro-section-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        html { scroll-behavior: auto; }
        body { overflow-x: hidden; }
      </style>
      <script>
        (function(){
          function sync(){
            document.querySelectorAll('[data-alloro-preview-state="pending"]').forEach(function(el){
              if (!el.dataset.alloroPreviewLabel) {
                el.dataset.alloroPreviewLabel = 'Building ' + (el.dataset.alloroPreviewSection || 'section') + '…';
              }
            });
          }
          sync();
          new MutationObserver(sync).observe(document.body, { childList: true, subtree: true });
        })();
      </script>
    `;
    assembled = assembled.replace(/<\/body>/i, `${overlayCss}\n</body>`);

    return prepareHtmlForPreview(assembled);
  }, [state, projectId]);

  if (error && !state) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (!state || !srcDoc) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading preview...
      </div>
    );
  }

  const total = state.template_sections.length;
  const completed = state.generated_sections.length;
  const current = state.generation_progress?.current_component || null;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const isGenerating =
    state.generation_status === "generating" ||
    state.generation_status === "queued";

  return (
    <div className="relative w-full h-full">
      {isGenerating && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 w-full max-w-md px-4 pointer-events-none">
          <div className="rounded-xl border border-amber-200 bg-white/95 backdrop-blur px-4 py-3 shadow-sm pointer-events-auto">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <Loader2 className="h-4 w-4 animate-spin text-amber-600 shrink-0" />
                <span className="text-sm font-medium text-gray-900 truncate">
                  Building page…
                </span>
              </div>
              <span className="text-[11px] font-semibold text-gray-500 shrink-0">
                {current || "—"} ({completed}/{total})
              </span>
            </div>
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-500 rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </div>
      )}

      <iframe
        title="Page preview"
        sandbox="allow-same-origin allow-scripts"
        className="w-full h-full border-0 bg-white"
        srcDoc={srcDoc}
      />
    </div>
  );
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
