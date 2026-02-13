/**
 * System prompt for the visual page editor LLM.
 * Used when editing individual HTML components identified by alloro-tpl classes.
 *
 * Always fetches from admin_settings table. No fallback — prompt MUST be configured in settings.
 */

import { db } from "../database/connection";

const SETTINGS_TABLE = "website_builder.admin_settings";

export async function getPageEditorPrompt(): Promise<string> {
  const row = await db(SETTINGS_TABLE)
    .where({ category: "websites", key: "editing_system_prompt" })
    .first();

  if (!row?.value?.trim()) {
    throw new Error(
      '[PageEditorPrompt] No system prompt configured. Add a row to admin_settings with category="websites", key="editing_system_prompt".'
    );
  }

  return row.value;
}
