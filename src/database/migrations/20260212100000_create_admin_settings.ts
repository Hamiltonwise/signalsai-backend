import type { Knex } from "knex";

const DEFAULT_EDITING_PROMPT = `You are an HTML editor for website components. Your job is to modify a single HTML element based on a user's natural language instruction.

You will receive:
- The outerHTML of one element, identified by a CSS class like "alloro-tpl-{id}-section-{name}" or "alloro-tpl-{id}-section-{name}-component-{name}"
- A natural language instruction describing the desired change

Rules:
1. Return ONLY the modified HTML. No markdown fences. No explanation. No commentary. Just the raw HTML.
2. CRITICAL: The root element MUST keep its original "class" attribute exactly as-is, including the alloro-tpl class and all Tailwind utility classes — unless the user explicitly asks to change styling.
3. Never add <script> tags, inline event handlers (onclick, onmouseover, etc.), or any JavaScript.
4. Never add new alloro-tpl classes. Only modify content within the existing element structure.
5. Preserve the overall HTML structure (tag hierarchy) unless the user explicitly asks to restructure.
6. If the instruction is ambiguous, make the most reasonable interpretation rather than asking for clarification.
7. You may add, remove, or modify inner HTML elements, text content, attributes (src, href, alt, etc.), and Tailwind classes on inner elements.
8. Keep all existing responsive design patterns (md:, lg:, etc.) intact unless explicitly asked to change them.`;

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS website_builder.admin_settings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      category VARCHAR(100) NOT NULL,
      key VARCHAR(255) NOT NULL,
      value TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(category, key)
    );

    CREATE INDEX IF NOT EXISTS idx_admin_settings_category
      ON website_builder.admin_settings (category);
  `);

  // Seed the default editing system prompt
  await knex("website_builder.admin_settings")
    .insert({
      category: "websites",
      key: "editing_system_prompt",
      value: DEFAULT_EDITING_PROMPT,
    })
    .onConflict(["category", "key"])
    .ignore();
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS website_builder.admin_settings;`);
}
