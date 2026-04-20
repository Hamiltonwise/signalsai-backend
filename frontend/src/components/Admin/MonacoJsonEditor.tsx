/**
 * MonacoJsonEditor
 *
 * Thin wrapper around `@monaco-editor/react` pre-configured for JSON editing.
 * Lazy-loaded via `React.lazy` + `<Suspense>` so the ~350kb Monaco bundle is
 * not pulled into the main chunk; it only loads when this editor mounts.
 *
 * Used by:
 *   - IdentityModal's JSON tab (full-identity editor).
 *   - IdentitySliceEditor (per-slice slide-up editor for Doctors/Services).
 */
import { Suspense, lazy, useCallback } from "react";
import { Loader2 } from "lucide-react";

// Lazy-load the real editor so its 350kb bundle isn't in the main chunk.
// The default export of `@monaco-editor/react` is the <Editor /> component.
const Editor = lazy(() =>
  import("@monaco-editor/react").then((mod) => ({ default: mod.default })),
);

interface MonacoJsonEditorProps {
  value: string;
  onChange: (value: string) => void;
  height?: string | number;
  readOnly?: boolean;
  /** Fires whenever Monaco reports parse errors. `true` = no errors. */
  onValidationChange?: (isValid: boolean) => void;
}

function Fallback() {
  return (
    <div className="flex items-center justify-center py-10 text-xs text-gray-500 bg-gray-50 rounded-lg border border-gray-200">
      <Loader2 className="h-4 w-4 animate-spin mr-2" />
      Loading editor...
    </div>
  );
}

export default function MonacoJsonEditor({
  value,
  onChange,
  height = "60vh",
  readOnly = false,
  onValidationChange,
}: MonacoJsonEditorProps) {
  const handleChange = useCallback(
    (next: string | undefined) => {
      onChange(next ?? "");
    },
    [onChange],
  );

  // Monaco's onValidate returns the full marker list for the current model.
  // Translate that into a simple boolean for the caller.
  const handleValidate = useCallback(
    (markers: Array<{ severity: number }>) => {
      if (!onValidationChange) return;
      // severity 8 = Error in Monaco's marker enum. Warnings (4) are ignored.
      const hasErrors = markers.some((m) => m.severity >= 8);
      onValidationChange(!hasErrors);
    },
    [onValidationChange],
  );

  return (
    <Suspense fallback={<Fallback />}>
      <div
        className="rounded-lg border border-gray-200 overflow-hidden"
        style={{ height }}
      >
        <Editor
          height="100%"
          language="json"
          theme="vs-light"
          value={value}
          onChange={handleChange}
          onValidate={handleValidate}
          options={{
            readOnly,
            minimap: { enabled: false },
            formatOnPaste: true,
            automaticLayout: true,
            scrollBeyondLastLine: false,
            tabSize: 2,
            wordWrap: "on",
            fontSize: 12,
            lineNumbers: "on",
          }}
        />
      </div>
    </Suspense>
  );
}
