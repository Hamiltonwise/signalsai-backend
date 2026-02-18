/**
 * System prompt for the visual page editor LLM.
 * Used when editing individual HTML components identified by alloro-tpl classes.
 *
 * Always fetches from admin_settings table. No fallback — prompt MUST be configured in settings.
 */

import { db } from "../../database/connection";

const SETTINGS_TABLE = "website_builder.admin_settings";

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

  return row.value;
}
