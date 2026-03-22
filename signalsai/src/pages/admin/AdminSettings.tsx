import { useState, useEffect } from "react";
import { Settings, Loader2, Check, RotateCcw } from "lucide-react";
import { fetchSetting, updateSetting } from "../../api/settings";
import { AdminPageHeader } from "../../components/ui/DesignSystem";

const DEFAULT_PROMPT = `You are an HTML editor for website components. You receive an HTML element (identified by an alloro-tpl CSS class) and a natural language instruction.

RESPONSE FORMAT:
Always respond with valid JSON — no markdown fences, no extra text.

On success: { "error": false, "message": "<short description of what you changed>", "html": "<the modified HTML>" }
On rejection: { "error": true, "message": "<friendly explanation of why this can't be done>" }

ALLOWED ACTIONS:
- Edit text content (headings, paragraphs, labels, buttons, links, etc.)
- Change background colors or background images (via Tailwind classes on inner elements)
- Change text colors (via Tailwind classes on inner elements)

REJECTED ACTIONS (respond with error: true):
- Changing layout or structure (moving elements, reordering, adding/removing sections)
- Adding, removing, or repositioning HTML elements
- Modifying CSS classes on the root element
- Modifying HTML attributes (id, data-*, aria-*, etc.) unless it's a text-related attribute like alt or title
- Adding <script> tags, inline event handlers (onclick, onmouseover, etc.), or any JavaScript
- Adding new alloro-tpl classes
- Changing responsive breakpoint patterns (md:, lg:, etc.)
- Any instruction that could break the template structure or violate end-user safety

RULES:
1. The root element MUST keep its original "class" attribute exactly as-is, including the alloro-tpl class.
2. Only modify text content, text colors, and backgrounds on inner elements.
3. If the instruction is ambiguous but falls within allowed actions, make the most reasonable interpretation.
4. If the instruction is partially allowed (e.g., "change the text and move it to the right"), reject the entire instruction — don't apply the allowed part.
5. Keep your "message" field concise (1-2 sentences max).`;

export default function AdminSettings() {
  const [prompt, setPrompt] = useState("");
  const [originalPrompt, setOriginalPrompt] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const result = await fetchSetting("websites", "admin_editing_system_prompt");
        setPrompt(result.data.value);
        setOriginalPrompt(result.data.value);
      } catch {
        // Setting might not exist yet — use default
        setPrompt(DEFAULT_PROMPT);
        setOriginalPrompt(DEFAULT_PROMPT);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const isDirty = prompt !== originalPrompt;

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      const result = await updateSetting(
        "websites",
        "admin_editing_system_prompt",
        prompt
      );
      setOriginalPrompt(result.data.value);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setPrompt(DEFAULT_PROMPT);
  };

  return (
    <div>
      <AdminPageHeader
        icon={<Settings className="w-6 h-6" />}
        title="Settings"
        description="Manage admin configuration and system prompts."
      />

      {/* Websites section */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Websites</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Configuration for the website builder and page editor.
          </p>
        </div>

        <div className="px-6 py-5">
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-700">
                Editing System Prompt
              </label>
              <button
                onClick={handleReset}
                disabled={prompt === DEFAULT_PROMPT}
                className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                Reset to default
              </button>
            </div>
            <p className="text-[11px] text-gray-400 mb-3">
              This prompt is sent as the system message when editing page
              components via the visual editor. It controls how the LLM
              interprets and applies edit instructions.
            </p>

            {loading ? (
              <div className="flex items-center gap-2 py-8 justify-center text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-xs">Loading...</span>
              </div>
            ) : (
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={16}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-xs font-mono text-gray-700 leading-relaxed resize-y focus:outline-none focus:border-alloro-orange focus:ring-1 focus:ring-alloro-orange/20"
              />
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-xs text-red-600">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={!isDirty || saving}
              className="flex items-center gap-2 px-4 py-2 bg-alloro-orange text-white text-xs font-semibold rounded-lg hover:bg-alloro-orange/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm shadow-alloro-orange/20"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : saved ? (
                <Check className="w-3.5 h-3.5" />
              ) : null}
              {saving ? "Saving..." : saved ? "Saved" : "Save Changes"}
            </button>

            {isDirty && !saving && (
              <span className="text-[11px] text-gray-400">
                Unsaved changes
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
