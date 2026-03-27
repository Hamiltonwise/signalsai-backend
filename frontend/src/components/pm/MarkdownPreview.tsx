import { lazy, Suspense } from "react";

const MDEditor = lazy(() => import("@uiw/react-md-editor"));

interface MarkdownPreviewProps {
  source: string | null;
  className?: string;
}

export function MarkdownPreview({ source, className = "" }: MarkdownPreviewProps) {
  if (!source) return null;

  return (
    <Suspense fallback={<p className="text-[13px]" style={{ color: "var(--color-pm-text-secondary)" }}>{source}</p>}>
      <div data-color-mode="dark" className={`pm-md-preview ${className}`}>
        <MDEditor.Markdown source={source} />
      </div>
      <style>{`
        .pm-md-preview .wmde-markdown {
          background: transparent !important;
          color: var(--color-pm-text-secondary) !important;
          font-size: 13px !important;
          line-height: 1.6;
        }
        .pm-md-preview .wmde-markdown p { margin: 0 0 4px; }
        .pm-md-preview .wmde-markdown strong { color: var(--color-pm-text-primary); }
        .pm-md-preview .wmde-markdown ul,
        .pm-md-preview .wmde-markdown ol { margin: 0 0 4px; padding-left: 16px; }
        .pm-md-preview .wmde-markdown code {
          background: var(--color-pm-bg-hover) !important;
          padding: 1px 3px;
          border-radius: 3px;
          font-size: 12px;
        }
        .pm-md-preview .wmde-markdown a { color: #D66853; }
      `}</style>
    </Suspense>
  );
}
