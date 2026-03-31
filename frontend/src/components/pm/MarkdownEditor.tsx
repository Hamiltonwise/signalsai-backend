import { lazy, Suspense } from "react";

const MDEditor = lazy(() => import("@uiw/react-md-editor"));

interface MarkdownEditorProps {
  value: string;
  onChange: (val: string) => void;
  preview?: "edit" | "live" | "preview";
  minHeight?: number;
  placeholder?: string;
}

export function MarkdownEditor({
  value,
  onChange,
  preview = "edit",
  minHeight = 120,
  placeholder = "Write markdown...",
}: MarkdownEditorProps) {
  return (
    <Suspense
      fallback={
        <div
          className="rounded-lg animate-pulse"
          style={{ height: minHeight, backgroundColor: "var(--color-pm-bg-primary)" }}
        />
      }
    >
      <div data-color-mode="dark" className="pm-md-editor">
        <MDEditor
          value={value}
          onChange={(val) => onChange(val || "")}
          preview={preview}
          height={minHeight}
          textareaProps={{ placeholder }}
          visibleDragbar={false}
          hideToolbar={preview === "preview"}
        />
      </div>
      <style>{`
        .pm-md-editor .w-md-editor {
          background-color: var(--color-pm-bg-primary) !important;
          border: 1px solid var(--color-pm-border) !important;
          border-radius: 8px !important;
          color: var(--color-pm-text-primary) !important;
          box-shadow: none !important;
        }
        .pm-md-editor .w-md-editor-toolbar {
          background-color: var(--color-pm-bg-secondary) !important;
          border-bottom: 1px solid var(--color-pm-border-subtle) !important;
          border-radius: 8px 8px 0 0 !important;
        }
        .pm-md-editor .w-md-editor-toolbar li > button {
          color: var(--color-pm-text-muted) !important;
        }
        .pm-md-editor .w-md-editor-toolbar li > button:hover {
          color: var(--color-pm-text-primary) !important;
        }
        .pm-md-editor .w-md-editor-text-input,
        .pm-md-editor .w-md-editor-text-pre > code,
        .pm-md-editor .w-md-editor-text {
          color: var(--color-pm-text-primary) !important;
          font-size: 13px !important;
        }
        .pm-md-editor .w-md-editor-preview {
          background-color: var(--color-pm-bg-primary) !important;
        }
        .pm-md-editor .wmde-markdown {
          background-color: transparent !important;
          color: var(--color-pm-text-primary) !important;
          font-size: 13px !important;
        }
        .pm-md-editor .wmde-markdown p { margin: 0 0 8px; }
        .pm-md-editor .wmde-markdown ul,
        .pm-md-editor .wmde-markdown ol { margin: 0 0 8px; padding-left: 20px; }
        .pm-md-editor .wmde-markdown code {
          background: var(--color-pm-bg-hover) !important;
          padding: 1px 4px;
          border-radius: 3px;
          font-size: 12px;
        }
        .pm-md-editor .wmde-markdown a { color: #D66853; }
      `}</style>
    </Suspense>
  );
}
