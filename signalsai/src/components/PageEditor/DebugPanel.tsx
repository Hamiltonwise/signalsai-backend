import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { EditDebugInfo } from "../../api/websites";
import type { SelectedInfo } from "../../hooks/useIframeSelector";

interface DebugPanelProps {
  debugInfo: EditDebugInfo | null;
  selectedInfo: SelectedInfo | null;
  systemPrompt: string | null;
}

function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        )}
        <span className="text-xs font-medium text-gray-700">{title}</span>
      </button>
      {open && (
        <div className="px-3 py-2 border-t border-gray-200">
          {children}
        </div>
      )}
    </div>
  );
}

export default function DebugPanel({ debugInfo, selectedInfo, systemPrompt }: DebugPanelProps) {
  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
      {/* Selected element info */}
      {selectedInfo && (
        <div className="px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                selectedInfo.type === "section"
                  ? "bg-purple-50 text-purple-600 border border-purple-200"
                  : "bg-blue-50 text-blue-600 border border-blue-200"
              }`}
            >
              {selectedInfo.type}
            </span>
            <span className="text-xs text-gray-700 font-medium">
              {selectedInfo.label}
            </span>
          </div>
          <p className="text-[11px] text-gray-400 font-mono break-all">
            {selectedInfo.alloroClass}
          </p>
        </div>
      )}

      {!debugInfo && (
        <>
          {systemPrompt && (
            <CollapsibleSection title="System Prompt">
              <pre className="text-[11px] text-gray-600 font-mono whitespace-pre-wrap break-words leading-relaxed max-h-60 overflow-y-auto">
                {systemPrompt}
              </pre>
            </CollapsibleSection>
          )}
          <div className="flex-1 flex items-center justify-center px-2 py-8">
            <div className="text-center">
              <p className="text-sm text-gray-400 mb-2">
                No debug data yet.
              </p>
              <p className="text-xs text-gray-300">
                Make an edit to see the LLM request details.
              </p>
            </div>
          </div>
        </>
      )}

      {debugInfo && (
        <>
      {/* Model & Tokens */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
        <span className="text-xs font-mono text-gray-600">
          {debugInfo.model}
        </span>
        <div className="flex items-center gap-3 text-[11px] text-gray-500">
          <span>
            In: <span className="font-medium text-gray-700">{debugInfo.inputTokens.toLocaleString()}</span>
          </span>
          <span>
            Out: <span className="font-medium text-gray-700">{debugInfo.outputTokens.toLocaleString()}</span>
          </span>
        </div>
      </div>

      {/* System Prompt */}
      <CollapsibleSection title="System Prompt">
        <pre className="text-[11px] text-gray-600 font-mono whitespace-pre-wrap break-words leading-relaxed max-h-60 overflow-y-auto">
          {debugInfo.systemPrompt}
        </pre>
      </CollapsibleSection>

      {/* Messages */}
      <CollapsibleSection title={`Messages (${debugInfo.messages.length})`} defaultOpen>
        <div className="space-y-2">
          {debugInfo.messages.map((msg, i) => (
            <div key={i} className="border border-gray-100 rounded-md overflow-hidden">
              <div
                className={`px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${
                  msg.role === "user"
                    ? "bg-orange-50 text-orange-600"
                    : "bg-blue-50 text-blue-600"
                }`}
              >
                {msg.role}
              </div>
              <pre className="px-2 py-1.5 text-[11px] text-gray-600 font-mono whitespace-pre-wrap break-words leading-relaxed max-h-48 overflow-y-auto">
                {msg.content}
              </pre>
            </div>
          ))}
        </div>
      </CollapsibleSection>
        </>
      )}
    </div>
  );
}
