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

const ANALYSIS_SYSTEM_PROMPT = `You are a website QA analyst reviewing HTML content against a set of requirements, a QA checklist, or a change instruction.

Your job is to find EVERY applicable change that should be made to the HTML you're given. Be thorough — err on the side of flagging too many issues rather than too few.

HOW TO ANALYZE:
1. Read the requirements/checklist/instruction carefully
2. Read the HTML content carefully
3. For each requirement, check if the HTML satisfies it
4. If the requirement mentions content that should exist (e.g., hours, addresses, names, links) — check if that content is present AND correct in the HTML
5. If the instruction asks for a style/design change (e.g., "change rounded buttons to square") — check every element that matches
6. If a finding/requirement is about content on THIS specific section/page, flag it even if the fix seems minor
7. Requirements about missing pages, missing sections, or site-wide architecture changes that can't be fixed by editing THIS HTML should still be flagged if this HTML could partially address them (e.g., adding a link, updating a menu reference)

IMPORTANT: If the user gives you a simple instruction like "change all buttons to rounded-sm" or "update the phone number to X" — you MUST find matching elements in the HTML and create recommendations for them. Do NOT return empty recommendations when there are clearly applicable changes.

Only return empty recommendations if you have genuinely examined the HTML and confirmed NONE of the requirements apply to it.

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

  const userMessage = `## Requirements / Checklist

${prompt}

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

  const recommendations = Array.isArray(parsed.recommendations)
    ? parsed.recommendations.filter(
        (r: any) => r && typeof r.recommendation === "string" && typeof r.instruction === "string"
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

const STRUCTURAL_SYSTEM_PROMPT = `You analyze a QA checklist or change request and identify structural changes needed: new pages to create, new posts to create, and URL redirects to set up.

You are given:
- The user's requirements/checklist
- A list of existing page paths (so you don't recommend creating pages that already exist)
- A list of existing redirects (so you don't recommend duplicates)
- A list of existing post slugs with their types (so you don't recommend duplicates)
- Available post types (to determine if content should be a post vs a page — e.g., if "doctors" is a post type, a new doctor should be a post, not a page)

RULES:
- Only recommend creating pages/posts/redirects that are explicitly mentioned or strongly implied by the requirements
- Do NOT recommend creating content that already exists (check the existing lists)
- Do NOT recommend redirects that already exist
- For content that maps to an existing post_type (e.g., doctors, services, team members), recommend creating a POST, not a page
- For standalone pages (pricing, privacy policy, referral form), recommend creating a PAGE
- For URL changes mentioned in the requirements, recommend REDIRECTS
- For navigation changes (add/remove/update links in menus), recommend MENU CHANGES — do NOT recommend editing header HTML for nav links
- When a new page or post is created, also recommend adding it to the appropriate menu
- Post slugs should be URL-safe (lowercase, hyphens, no spaces)

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
    { "menu_slug": "main-nav", "action": "add", "label": "Pricing", "url": "/pricing", "target": "_self", "recommendation": "Add pricing link to main navigation" }
  ]
}

If no structural changes are needed, return: { "redirects": [], "pages": [], "posts": [], "menuChanges": [] }`;

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

export interface StructuralAnalysisResult {
  redirects: Array<{ from_path: string; to_path: string; type?: number; recommendation: string }>;
  pages: Array<{ path: string; purpose: string; recommendation: string }>;
  posts: Array<{ post_type_slug: string; title: string; slug: string; purpose: string; recommendation: string }>;
  menuChanges: MenuChangeRecommendation[];
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
    return { redirects: [], pages: [], posts: [], menuChanges: [] };
  }

  const result: StructuralAnalysisResult = {
    redirects: Array.isArray(parsed.redirects) ? parsed.redirects.filter((r: any) => r?.from_path && r?.to_path) : [],
    pages: Array.isArray(parsed.pages) ? parsed.pages.filter((p: any) => p?.path && p?.purpose) : [],
    posts: Array.isArray(parsed.posts) ? parsed.posts.filter((p: any) => p?.post_type_slug && p?.title) : [],
    menuChanges: Array.isArray(parsed.menuChanges) ? parsed.menuChanges.filter((m: any) => m?.menu_slug && m?.action && m?.label) : [],
  };

  console.log(
    `[AiCommand] ✓ Structural: ${result.redirects.length} redirects, ${result.pages.length} pages, ${result.posts.length} posts, ${result.menuChanges.length} menu changes`
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
