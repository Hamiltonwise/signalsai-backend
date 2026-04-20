import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  fetchPageProgressiveState,
  type PageProgressiveState,
} from "../../api/websites";

interface ProgressivePagePreviewProps {
  projectId: string;
  pageId: string;
  /** Poll interval in ms while generation is active. Default 2000. */
  pollMs?: number;
  /** Called once the page flips to `ready`. */
  onReady?: () => void;
  /** Iframe CSS head injection — mirror the site's Tailwind CDN + brand tokens. */
  headInject?: string;
  /** Iframe min height. Default 80vh. */
  minHeight?: string;
}

/**
 * Renders the page as it's being built. Template sections appear dimmed +
 * labelled "Building…" until their generated content lands, then the iframe
 * swaps in the ready HTML in place. Single iframe (mirrors PageEditor
 * preview pattern) — sandbox isolates styles and neutralizes untrusted
 * markup.
 */
export default function ProgressivePagePreview({
  projectId,
  pageId,
  pollMs = 2000,
  onReady,
  headInject,
  minHeight = "80vh",
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

    const sectionHtml = state.template_sections
      .map((section) => {
        const rendered = generatedByName.get(section.name);
        const isReady = typeof rendered === "string" && rendered.length > 0;
        if (isReady) {
          return `<div data-alloro-section="${section.name}" data-alloro-state="ready" class="alloro-section alloro-section--ready">${rendered}</div>`;
        }
        return `<div data-alloro-section="${section.name}" data-alloro-state="pending" class="alloro-section alloro-section--pending"><div class="alloro-pending-shell">${section.content}</div><div class="alloro-pending-label"><span class="alloro-pending-dot"></span>Building ${escapeHtml(section.name)}…</div></div>`;
      })
      .join("\n");

    const head = `
      ${headInject || ""}
      <style>
        html, body { margin: 0; padding: 0; background: white; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; }
        .alloro-section { position: relative; }
        .alloro-section--ready { animation: alloro-fade-in 350ms ease-out both; }
        .alloro-section--pending .alloro-pending-shell { opacity: 0.35; pointer-events: none; filter: saturate(0.6); }
        .alloro-section--pending { position: relative; }
        .alloro-pending-label {
          position: absolute; inset-inline: 0; top: 50%; transform: translateY(-50%);
          display: flex; align-items: center; justify-content: center;
          pointer-events: none;
        }
        .alloro-pending-label > * {
          display: inline-flex; align-items: center; gap: 0.5rem;
          background: rgba(255,255,255,0.92); backdrop-filter: blur(4px);
          padding: 0.4rem 0.75rem; border-radius: 9999px;
          border: 1px solid #fde68a; color: #b45309;
          font-size: 0.75rem; font-weight: 500;
          box-shadow: 0 1px 2px rgba(0,0,0,0.04);
        }
        .alloro-pending-dot {
          width: 0.5rem; height: 0.5rem; border-radius: 9999px;
          background: #f59e0b; animation: alloro-pulse 1.2s ease-in-out infinite;
        }
        @keyframes alloro-fade-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes alloro-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.5; transform: scale(0.8); }
        }
      </style>
    `;

    return `<!doctype html><html><head><meta charset="utf-8">${head}</head><body>${sectionHtml}</body></html>`;
  }, [state, headInject]);

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
    <div className="relative">
      {isGenerating && (
        <div className="sticky top-2 z-10 mx-auto w-full max-w-md rounded-xl border border-amber-200 bg-white/95 backdrop-blur px-4 py-3 shadow-sm mb-3">
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
      )}

      <iframe
        title="Page preview"
        sandbox="allow-same-origin"
        className="w-full rounded-lg border border-gray-200 bg-white"
        style={{ minHeight }}
        srcDoc={srcDoc}
      />
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
