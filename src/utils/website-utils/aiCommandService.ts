/**
 * AI Command Service
 * Handles LLM-powered batch analysis and execution for the AI Command feature.
 * Uses Claude Sonnet for both analysis (recommendations) and execution (HTML editing).
 */

import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY environment variable is not set");
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

// ---------------------------------------------------------------------------
// Analysis — produce structured recommendations from content + prompt
// ---------------------------------------------------------------------------

const ANALYSIS_SYSTEM_PROMPT = `You are a website QA analyst for the Alloro website engine. You review HTML content against requirements and recommend changes.

## ALLORO ENGINE ARCHITECTURE — YOU MUST UNDERSTAND THIS

Alloro websites are data-driven. Content that repeats or belongs to a collection should NEVER be hardcoded in HTML. Instead, it should be managed as **posts** (database records) rendered dynamically via **shortcodes**.

**Content types that MUST be posts (not hardcoded HTML):**
- Doctor/team member profiles → post_type "doctors" or "team"
- Services/treatments → post_type "services"
- Testimonials/reviews → post_type "testimonials" or "reviews"
- Blog articles → post_type "blog"
- Locations/offices → post_type "locations"
- FAQs (if managed as individual items) → post_type "faqs"
- Any repeating content cards, grids, or lists

**Navigation menus MUST use the menu shortcode system:**
- Menus are stored in the database and rendered via {{ menu id='slug' }} or {{ menu id='slug' template='template-slug' }}
- Navigation links should NEVER be hardcoded as <a> tags in header/footer HTML
- If you see hardcoded nav links in a header/footer, recommend replacing them with a {{ menu }} shortcode

**Post blocks render posts dynamically via shortcodes:**
- {{ post_block id='block-slug' items='post-type-slug' limit='10' }} renders a grid/list of posts
- Posts have: title, slug, content, custom_fields, featured_image, categories, tags
- Post blocks loop through posts using {{start_post_loop}} / {{end_post_loop}} markers

**What SHOULD be hardcoded HTML (not posts):**
- Hero sections with unique copy
- About/mission text (unless it's a team page)
- Contact forms
- CTA sections
- Page-specific content that doesn't repeat

## HOW TO ANALYZE

1. Read the requirements/checklist carefully
2. Read the HTML content carefully
3. For each requirement, check if the HTML satisfies it
4. Flag hardcoded content that should be data-driven (see architecture rules above)
5. If you see hardcoded nav links, recommend converting to {{ menu }} shortcode
6. If you see a hardcoded grid of services/doctors/reviews, recommend converting to {{ post_block }} shortcode
7. For simple style/design changes (e.g., "change rounded buttons to square") — find every matching element

## RULES

- NEVER return "no change needed" recommendations. If nothing applies, return empty array.
- Do NOT recommend creating new pages, posts, redirects, or menu items. A separate structural analysis handles those.
- DO recommend replacing hardcoded content with shortcodes (this IS an HTML edit)
- DO recommend fixing broken HTML, incorrect content, wrong links, styling issues
- If the HTML contains {{ menu }} or {{ post_block }} shortcodes, do NOT try to edit the content inside them — they are resolved at render time from the database

RESPONSE FORMAT — return ONLY valid JSON, no markdown fences, no commentary:
{
  "recommendations": [
    {
      "recommendation": "Human-readable description of what needs to change",
      "instruction": "Precise instruction for an AI editor: change X to Y, add Z after W, remove Q"
    }
  ]
}`;

export interface AnalysisResult {
  recommendations: Array<{
    recommendation: string;
    instruction: string;
  }>;
  inputTokens: number;
  outputTokens: number;
}

export async function analyzeHtmlContent(params: {
  prompt: string;
  targetLabel: string;
  currentHtml: string;
}): Promise<AnalysisResult> {
  const { prompt, targetLabel, currentHtml } = params;
  const ai = getClient();

  // Condense prompt for small sections to save tokens
  const condensedPrompt = currentHtml.length < 3000 && prompt.length > 4000
    ? prompt.substring(0, 3000) + "\n\n[... checklist truncated for this section — focus on what's relevant to the HTML below ...]"
    : prompt;

  const userMessage = `## Requirements / Checklist

${condensedPrompt}

## Target: ${targetLabel}

## Current HTML

${currentHtml}`;

  const messages: Array<{ role: "user" | "assistant"; content: string }> = [
    { role: "user", content: userMessage },
  ];

  console.log(
    `[AiCommand] Analyzing: ${targetLabel} (${currentHtml.length} chars)`
  );

  let response = await ai.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: ANALYSIS_SYSTEM_PROMPT,
    messages,
  });

  let text = extractText(response);
  let parsed = tryParseJson(text);

  // Retry once on parse failure
  if (!parsed) {
    console.warn(
      `[AiCommand] Parse failed for ${targetLabel}, retrying...`
    );
    messages.push({ role: "assistant", content: text });
    messages.push({
      role: "user",
      content:
        "Your previous response was not valid JSON. Respond ONLY with the JSON object, no markdown fences or extra text.",
    });

    response = await ai.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: ANALYSIS_SYSTEM_PROMPT,
      messages,
    });

    text = extractText(response);
    parsed = tryParseJson(text);
  }

  if (!parsed) {
    console.error(
      `[AiCommand] Failed to parse analysis for ${targetLabel}:`,
      text.substring(0, 200)
    );
    throw new Error(
      `LLM returned invalid JSON for analysis of ${targetLabel}`
    );
  }

  const NO_CHANGE_PATTERNS = /no change|no action|not applicable|no modification|nothing to change|no update|cannot be made|not needed/i;

  const recommendations = Array.isArray(parsed.recommendations)
    ? parsed.recommendations.filter(
        (r: any) =>
          r &&
          typeof r.recommendation === "string" &&
          typeof r.instruction === "string" &&
          !NO_CHANGE_PATTERNS.test(r.instruction) &&
          !NO_CHANGE_PATTERNS.test(r.recommendation)
      )
    : [];

  if (recommendations.length === 0) {
    console.log(
      `[AiCommand] ⚠ ${targetLabel}: 0 recommendations. Raw response: ${text.substring(0, 500)}`
    );
    console.log(
      `[AiCommand] ⚠ Prompt length: ${prompt.length} chars, HTML length: ${currentHtml.length} chars`
    );
  } else {
    console.log(
      `[AiCommand] ✓ ${targetLabel}: ${recommendations.length} recommendation(s). Tokens: ${response.usage.input_tokens}/${response.usage.output_tokens}`
    );
  }

  return {
    recommendations,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

// ---------------------------------------------------------------------------
// Structural analysis — detect needed pages, posts, redirects
// ---------------------------------------------------------------------------

const STRUCTURAL_SYSTEM_PROMPT = `You are a structural analyst for the Alloro website engine. You identify what needs to be CREATED or CHANGED at the data level — new pages, new posts, redirects, and menu updates.

## ALLORO ENGINE ARCHITECTURE — CRITICAL

Alloro is a data-driven website engine. You must recommend the RIGHT data structure for each content type:

**MUST be posts (rendered via {{ post_block }} shortcodes, not hardcoded HTML):**
- Doctor/provider profiles → post_type "doctors" or "team"
- Services/treatments → post_type "services"
- Testimonials/reviews → post_type "testimonials" or "reviews"
- Blog articles → post_type "blog"
- Locations/offices → post_type "locations"
- Team members → post_type "team"
- Any content that belongs to a repeating collection

**MUST be pages (standalone content):**
- Pricing/financial info pages
- Privacy policy, accessibility notices
- Referral forms
- Patient information pages
- About/mission pages
- Any standalone content that doesn't belong to a collection

**MUST be menus (not hardcoded nav links):**
- All navigation links in headers and footers
- If the checklist mentions adding nav items, recommend MENU CHANGES
- When creating new pages/posts, also recommend adding them to the appropriate menu

**MUST be redirects:**
- Old URLs that changed in the migration
- Removed pages that should point somewhere

## GIVEN CONTEXT
- Existing page paths (don't create duplicates)
- Existing redirects (don't create duplicates)
- Existing posts by type (don't create duplicates)
- Available post types (use these — don't invent new ones unless one clearly doesn't exist)
- Existing menu structure (know what's already linked)

## RULES
- ALWAYS prefer posts over hardcoded HTML for repeating/collection content
- If the checklist says "add Dr. Wang's page" and "doctors" is a post_type, recommend creating a POST, not a page
- If the checklist says "add services pages" and "services" is a post_type, recommend creating POSTS for each service
- Do NOT recommend redirects where from_path and to_path are the same (even with trailing slash differences — normalize both before comparing)
- For menu items where you don't know the actual URL (e.g., external payment portals, third-party links), set the url to "NEEDS_INPUT" and note in the recommendation that the user must provide the URL. Example: "Pay Online" links to an external payment gateway — the URL is unknown.
- For pages where the content depends on external data you don't have, still recommend creating the page but note in the recommendation what information the user needs to provide
- When creating posts/pages, also recommend adding them to the correct menu
- Post slugs must be URL-safe (lowercase, hyphens, no spaces)
- Do NOT recommend content that already exists
- Do NOT recommend redirects that already exist or have identical from/to paths

RESPONSE FORMAT — return ONLY valid JSON, no markdown fences:
{
  "redirects": [
    { "from_path": "/old-url", "to_path": "/new-url", "type": 301, "recommendation": "Human-readable reason" }
  ],
  "pages": [
    { "path": "/pricing", "purpose": "What this page should contain", "recommendation": "Human-readable reason" }
  ],
  "posts": [
    { "post_type_slug": "doctors", "title": "Dr. Name", "slug": "dr-name", "purpose": "What this post should contain", "recommendation": "Human-readable reason" }
  ],
  "menuChanges": [
    { "menu_slug": "main-nav", "action": "add", "label": "Pricing", "url": "/pricing", "target": "_self", "recommendation": "Add pricing link to main navigation" },
    { "menu_slug": "main-nav", "action": "remove", "label": "Old Link", "recommendation": "Remove broken link" },
    { "menu_slug": "main-nav", "action": "update", "original_label": "About", "label": "About Us", "url": "/about-us", "recommendation": "Update label and URL" }
  ],
  "newMenus": [
    { "name": "Footer Menu", "slug": "footer-menu", "recommendation": "Create a separate footer navigation menu" }
  ]
}

NOTES:
- Menu items support any URL — internal pages (/about), post URLs (/doctors/dr-name), or external links (https://pay.example.com)
- When recommending new pages or posts, ALSO recommend adding them to the appropriate menu
- If a menu doesn't exist yet (e.g., footer-menu), recommend creating it in "newMenus" first

If no structural changes are needed, return: { "redirects": [], "pages": [], "posts": [], "menuChanges": [], "newMenus": [] }`;

export interface MenuChangeRecommendation {
  menu_slug: string;
  action: "add" | "remove" | "update";
  label: string;
  url?: string;
  target?: string;
  original_label?: string;
  parent_id?: string | null;
  recommendation: string;
}

export interface NewMenuRecommendation {
  name: string;
  slug: string;
  recommendation: string;
}

export interface StructuralAnalysisResult {
  redirects: Array<{ from_path: string; to_path: string; type?: number; recommendation: string }>;
  pages: Array<{ path: string; purpose: string; recommendation: string }>;
  posts: Array<{ post_type_slug: string; title: string; slug: string; purpose: string; recommendation: string }>;
  menuChanges: MenuChangeRecommendation[];
  newMenus: NewMenuRecommendation[];
}

export async function analyzeForStructuralChanges(params: {
  prompt: string;
  existingPaths: string[];
  existingRedirects: string[];
  existingPostSlugs: string[];
  postTypes: string[];
  existingMenus: Array<{ menu_slug: string; items: Array<{ label: string; url: string }> }>;
}): Promise<StructuralAnalysisResult> {
  const { prompt, existingPaths, existingRedirects, existingPostSlugs, postTypes, existingMenus } = params;
  const ai = getClient();

  const userMessage = `## Requirements / Checklist

${prompt}

## Existing Pages
${existingPaths.length > 0 ? existingPaths.join("\n") : "(none)"}

## Existing Redirects
${existingRedirects.length > 0 ? existingRedirects.join("\n") : "(none)"}

## Existing Posts
${existingPostSlugs.length > 0 ? existingPostSlugs.join("\n") : "(none)"}

## Available Post Types
${postTypes.length > 0 ? postTypes.join("\n") : "(none)"}

## Existing Menus & Items
${existingMenus.length > 0 ? existingMenus.map((m) => `Menu "${m.menu_slug}":\n${m.items.map((i) => `  - ${i.label} → ${i.url}`).join("\n") || "  (empty)"}`).join("\n\n") : "(no menus)"}`;

  console.log(`[AiCommand] Analyzing structural changes...`);

  let response = await ai.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: STRUCTURAL_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  let text = extractText(response);
  let parsed = tryParseJson(text);

  if (!parsed) {
    console.warn("[AiCommand] Structural analysis parse failed, retrying...");
    response = await ai.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: STRUCTURAL_SYSTEM_PROMPT,
      messages: [
        { role: "user", content: userMessage },
        { role: "assistant", content: text },
        { role: "user", content: "Your previous response was not valid JSON. Respond ONLY with the JSON object." },
      ],
    });
    text = extractText(response);
    parsed = tryParseJson(text);
  }

  if (!parsed) {
    console.error("[AiCommand] Structural analysis failed to parse:", text.substring(0, 300));
    return { redirects: [], pages: [], posts: [], menuChanges: [], newMenus: [] };
  }

  const result: StructuralAnalysisResult = {
    redirects: Array.isArray(parsed.redirects) ? parsed.redirects.filter((r: any) => r?.from_path && r?.to_path) : [],
    pages: Array.isArray(parsed.pages) ? parsed.pages.filter((p: any) => p?.path && p?.purpose) : [],
    posts: Array.isArray(parsed.posts) ? parsed.posts.filter((p: any) => p?.post_type_slug && p?.title) : [],
    menuChanges: Array.isArray(parsed.menuChanges) ? parsed.menuChanges.filter((m: any) => m?.menu_slug && m?.action && m?.label) : [],
    newMenus: Array.isArray(parsed.newMenus) ? parsed.newMenus.filter((m: any) => m?.name && m?.slug) : [],
  };

  console.log(
    `[AiCommand] ✓ Structural: ${result.redirects.length} redirects, ${result.pages.length} pages, ${result.posts.length} posts, ${result.menuChanges.length} menu changes, ${result.newMenus.length} new menus`
  );

  return result;
}

// ---------------------------------------------------------------------------
// Execution — edit HTML based on an approved instruction
// ---------------------------------------------------------------------------

const EXECUTION_SYSTEM_PROMPT = `You are a precise HTML editor. You receive an HTML snippet and an edit instruction.

RULES:
- Return ONLY the complete modified HTML
- Do NOT wrap in code fences or markdown
- Do NOT add commentary before or after the HTML
- Preserve all existing CSS classes, IDs, data attributes, and structure unless the instruction specifically requires changing them
- Preserve Tailwind CSS classes
- If the instruction asks to add content, integrate it naturally with the existing structure and styling
- If the instruction is unclear or impossible, return the original HTML unchanged`;

export interface ExecutionResult {
  editedHtml: string;
  inputTokens: number;
  outputTokens: number;
}

export async function editHtmlContent(params: {
  instruction: string;
  currentHtml: string;
  targetLabel: string;
}): Promise<ExecutionResult> {
  const { instruction, currentHtml, targetLabel } = params;
  const ai = getClient();

  const userMessage = `## Target: ${targetLabel}

## Instruction
${instruction}

## Current HTML

${currentHtml}`;

  const messages: Array<{ role: "user" | "assistant"; content: string }> = [
    { role: "user", content: userMessage },
  ];

  console.log(
    `[AiCommand] Executing edit: ${targetLabel} (${currentHtml.length} chars)`
  );

  let response = await ai.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: EXECUTION_SYSTEM_PROMPT,
    messages,
  });

  let text = extractText(response);
  let html = cleanHtmlOutput(text);

  // Retry if output looks like JSON or is empty
  if (!html || html.startsWith("{")) {
    console.warn(
      `[AiCommand] Invalid edit output for ${targetLabel}, retrying...`
    );
    messages.push({ role: "assistant", content: text });
    messages.push({
      role: "user",
      content: "Return ONLY raw HTML, no JSON wrapper, no code fences.",
    });

    response = await ai.messages.create({
      model: MODEL,
      max_tokens: 8192,
      system: EXECUTION_SYSTEM_PROMPT,
      messages,
    });

    text = extractText(response);
    html = cleanHtmlOutput(text);
  }

  if (!html) {
    throw new Error(`LLM returned empty HTML for ${targetLabel}`);
  }

  console.log(
    `[AiCommand] ✓ Edit complete: ${targetLabel}. Tokens: ${response.usage.input_tokens}/${response.usage.output_tokens}`
  );

  return {
    editedHtml: html,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

// ---------------------------------------------------------------------------
// Page creation — section planner + HTML generator
// ---------------------------------------------------------------------------

const SECTION_PLANNER_PROMPT = `You plan the section structure for a new web page. Given the page's purpose and examples of existing pages' section structures, output a list of sections that should be created.

RULES:
- Plan 4-7 sections per page (typical for a dental/medical practice website)
- Section names must be lowercase, hyphenated (e.g., "section-hero", "section-services-list", "section-cta")
- Each section should have a clear purpose
- Match the style and structure of existing pages on the site
- Always include a hero section first and a CTA/contact section last

RESPONSE FORMAT — return ONLY valid JSON:
{
  "sections": [
    { "name": "section-hero", "purpose": "Hero banner with page title, subtitle, and call-to-action" },
    { "name": "section-content", "purpose": "Main content area with detailed information" }
  ]
}`;

export interface SectionPlan {
  sections: Array<{ name: string; purpose: string }>;
}

export async function planPageSections(params: {
  purpose: string;
  existingSections: Array<{ name: string; summary: string }>;
}): Promise<SectionPlan> {
  const { purpose, existingSections } = params;
  const ai = getClient();

  const userMessage = `## Page Purpose
${purpose}

## Existing Pages' Section Structures (for style reference)
${existingSections.map((s) => `- ${s.name}: ${s.summary}`).join("\n")}`;

  console.log(`[AiCommand] Planning sections for: ${purpose.slice(0, 80)}`);

  const response = await ai.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: SECTION_PLANNER_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const text = extractText(response);
  const parsed = tryParseJson(text);

  if (!parsed || !Array.isArray(parsed.sections)) {
    console.error("[AiCommand] Section plan parse failed:", text.substring(0, 300));
    return {
      sections: [
        { name: "section-hero", purpose: "Hero banner with page title" },
        { name: "section-content", purpose: "Main page content" },
        { name: "section-cta", purpose: "Call to action / contact" },
      ],
    };
  }

  console.log(`[AiCommand] ✓ Planned ${parsed.sections.length} sections`);
  return { sections: parsed.sections };
}

const SECTION_GENERATOR_PROMPT = `You generate HTML for a single section of a web page. The HTML must include alloro-tpl-* CSS classes for editor integration.

CRITICAL CLASS REQUIREMENTS:
- The root element MUST have: class="alloro-tpl-{ID}-{SECTION_NAME} ..." and data-alloro-section="{SECTION_NAME}"
- Key inner elements MUST have: class="alloro-tpl-{ID}-{SECTION_NAME}-component-{COMPONENT_NAME} ..."
- Component names to use: title, subtitle, description, cta-button, image, card-1, card-2, card-3, list-item-1, list-item-2, etc.
- The {ID} value will be provided — use it exactly as given
- Every heading, button, image, and text block should have its own alloro-tpl component class

STYLE REQUIREMENTS:
- Use Tailwind CSS classes for all styling
- Match the visual style of the existing site content provided as context
- Use responsive classes (mobile-first)
- Use professional, clean layouts suitable for a dental/medical practice

RULES:
- Return ONLY the HTML for this single section — no full page, no wrapper
- Do NOT wrap in code fences or markdown
- Do NOT add <html>, <head>, <body> tags
- Ensure all text content is relevant to the page purpose`;

export interface GeneratedSection {
  html: string;
  inputTokens: number;
  outputTokens: number;
}

export async function generateSectionHtml(params: {
  sectionName: string;
  sectionPurpose: string;
  tplId: string;
  pageContext: string;
  priorSections: string[];
  siteStyleContext: string;
}): Promise<GeneratedSection> {
  const { sectionName, sectionPurpose, tplId, pageContext, priorSections, siteStyleContext } = params;
  const ai = getClient();

  const userMessage = `## Section to Generate
Name: ${sectionName}
Purpose: ${sectionPurpose}
alloro-tpl ID to use: ${tplId}

## Page Context
${pageContext}

${priorSections.length > 0 ? `## Previously Generated Sections (maintain visual consistency)
${priorSections.map((s, i) => `--- Section ${i + 1} ---\n${s.substring(0, 800)}`).join("\n\n")}` : ""}

## Site Style Reference (existing page HTML for style matching)
${siteStyleContext.substring(0, 3000)}`;

  console.log(`[AiCommand] Generating section: ${sectionName} (tplId: ${tplId})`);

  let response = await ai.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: SECTION_GENERATOR_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  let text = extractText(response);
  let html = cleanHtmlOutput(text);

  // Validate alloro-tpl class is present
  if (!html.includes(`alloro-tpl-${tplId}`)) {
    console.warn(`[AiCommand] Missing alloro-tpl class in generated section, retrying...`);
    response = await ai.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: SECTION_GENERATOR_PROMPT,
      messages: [
        { role: "user", content: userMessage },
        { role: "assistant", content: html },
        { role: "user", content: `The root element MUST have class="alloro-tpl-${tplId}-${sectionName}" and data-alloro-section="${sectionName}". Inner elements must have alloro-tpl-${tplId}-${sectionName}-component-* classes. Regenerate with these classes.` },
      ],
    });
    text = extractText(response);
    html = cleanHtmlOutput(text);
  }

  if (!html || html.startsWith("{")) {
    throw new Error(`Failed to generate valid HTML for section ${sectionName}`);
  }

  console.log(
    `[AiCommand] ✓ Generated ${sectionName}: ${html.length} chars. Tokens: ${response.usage.input_tokens}/${response.usage.output_tokens}`
  );

  return {
    html,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractText(response: Anthropic.Message): string {
  const block = response.content[0];
  if (!block || block.type !== "text") {
    throw new Error("No text response from Claude");
  }
  return block.text;
}

function tryParseJson(text: string): any | null {
  try {
    let cleaned = text.trim();

    // Strip markdown fences
    const fenceMatch = cleaned.match(/```\w*\n([\s\S]*?)```/);
    if (fenceMatch) {
      cleaned = fenceMatch[1].trim();
    }

    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function cleanHtmlOutput(text: string): string {
  let cleaned = text.trim();

  // Strip markdown fences
  const fenceMatch = cleaned.match(/```\w*\n([\s\S]*?)```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  return cleaned;
}
