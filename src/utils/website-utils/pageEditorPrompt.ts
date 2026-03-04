/**
 * System prompt for the visual page editor LLM.
 * Used when editing individual HTML components identified by alloro-tpl classes.
 *
 * Always fetches from admin_settings table. No fallback — prompt MUST be configured in settings.
 *
 * The DB prompt is wrapped in a code-level FORMAT_ENVELOPE that enforces
 * output format rules. This envelope is not editable via admin_settings —
 * it is the hard boundary that prevents the LLM from returning markdown,
 * explanations, or anything other than valid JSON or raw HTML.
 */

import { db } from "../../database/connection";

const SETTINGS_TABLE = "website_builder.admin_settings";

/**
 * Hard-coded output format contract. Wraps every DB-configured prompt.
 * Not stored in admin_settings — lives in code so it cannot be accidentally
 * removed or diluted by prompt edits.
 */
const FORMAT_ENVELOPE = {
  before: `<output-format-rules>
CRITICAL: You MUST follow these output rules exactly. They override any conflicting instructions.

You MUST respond with ONLY one of the following — nothing else:

1. A valid JSON object: {"error": false, "message": "...", "html": "..."}
   Use this when the edit is applied successfully.

2. A rejection JSON object: {"error": true, "message": "reason"}
   Use this when the instruction is not allowed or cannot be applied.

3. Raw HTML starting with "<" — only the edited HTML element, no wrapper.

NEVER include:
- Markdown formatting (no \`\`\`, no headers, no bold, no lists)
- Explanatory text before or after the output
- Comments about what you changed
- Multiple code blocks

Your entire response must be parseable as JSON or start with "<".
</output-format-rules>

`,
  after: "",
};

export async function getPageEditorPrompt(promptType: "admin" | "user" = "admin"): Promise<string> {
  const key = promptType === "admin"
    ? "admin_editing_system_prompt"
    : "user_editing_system_prompt";

  const row = await db(SETTINGS_TABLE)
    .where({ category: "websites", key })
    .first();

  if (!row?.value?.trim()) {
    throw new Error(
      `[PageEditorPrompt] No ${promptType} system prompt configured. Add a row to admin_settings with category="websites", key="${key}".`
    );
  }

  return FORMAT_ENVELOPE.before + row.value + FORMAT_ENVELOPE.after;
}
