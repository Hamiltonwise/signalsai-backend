/**
 * AI Command Service
 * Handles LLM-powered batch analysis and execution for the AI Command feature.
 * Uses Claude Sonnet for both analysis (recommendations) and execution (HTML editing).
 */

import Anthropic from "@anthropic-ai/sdk";
import { loadPrompt } from "../../agents/service.prompt-loader";

const MODEL = "claude-sonnet-4-6";

// Load prompts from .md files (cached after first read)
const getAnalysisPrompt = () => loadPrompt("websiteAgents/aiCommand/Analysis");
const getStructuralPrompt = () => loadPrompt("websiteAgents/aiCommand/Structural");
const getExecutionPrompt = () => loadPrompt("websiteAgents/aiCommand/Execution");
const getSectionPlannerPrompt = () => loadPrompt("websiteAgents/aiCommand/SectionPlanner");
const getSectionGeneratorPrompt = () => loadPrompt("websiteAgents/aiCommand/SectionGenerator");
const getVisualAnalysisPrompt = () => loadPrompt("websiteAgents/aiCommand/VisualAnalysis");

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
    system: getAnalysisPrompt(),
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
      system: getAnalysisPrompt(),
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

// Structural prompt loaded from websiteAgents/aiCommand/Structural.md

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
    system: getStructuralPrompt(),
    messages: [{ role: "user", content: userMessage }],
  });

  let text = extractText(response);
  let parsed = tryParseJson(text);

  if (!parsed) {
    console.warn("[AiCommand] Structural analysis parse failed, retrying...");
    response = await ai.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: getStructuralPrompt(),
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

// Execution prompt loaded from websiteAgents/aiCommand/Execution.md

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
    system: getExecutionPrompt(),
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
      system: getExecutionPrompt(),
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

// Section planner prompt loaded from websiteAgents/aiCommand/SectionPlanner.md

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
    system: getSectionPlannerPrompt(),
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

// Section generator prompt loaded from websiteAgents/aiCommand/SectionGenerator.md
// Visual analysis prompt loaded from websiteAgents/aiCommand/VisualAnalysis.md
const __DEAD_SECTION_GEN = `DEAD
- Root element: class="alloro-tpl-{ID}-{SECTION_NAME} ..." and data-alloro-section="{SECTION_NAME}"
- Inner elements: class="alloro-tpl-{ID}-{SECTION_NAME}-component-{COMPONENT_NAME} ..."
- Component names: title, subtitle, description, cta-button, image, card-1, card-2, list-item-1, etc.
- {ID} is provided — use it exactly
- Every heading, button, image, paragraph, and card must have its own alloro-tpl component class

## LAYOUT STRUCTURE (CRITICAL — DO NOT SKIP)
- Root element MUST be a full-width section: <section class="... py-16 md:py-24">
- Content MUST be wrapped in a container: <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
- For card grids, use: <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
- For two-column layouts, use: <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-12 items-center">
- For text content, use: <div class="max-w-3xl mx-auto"> or <div class="max-w-2xl">
- NEVER let text flow without width constraints — every text block needs max-w-* or grid containment
- NEVER use single-word line breaks — if text wraps word-by-word, the container is too narrow

## TAILWIND REQUIREMENTS
- Use responsive prefixes: base (mobile) → sm → md → lg → xl
- Text sizing: text-base for body, text-lg md:text-xl for lead text, text-3xl md:text-4xl lg:text-5xl for headings
- Spacing: consistent py-16 md:py-24 for sections, gap-6 md:gap-8 for grids
- Buttons: inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors

## COLORS (CRITICAL)
- If brand colors are provided in the Site Style Reference, use them EXACTLY
- Use the primary color for: dark backgrounds, headings, primary buttons, accents
- Use the accent color for: CTAs, highlights, hover states, links
- Match the color scheme of the existing pages — if existing pages use dark navy backgrounds with white text, your sections MUST too
- Use inline Tailwind arbitrary values for custom hex colors: bg-[#11151C], text-[#D66853], etc.
- Do NOT default to generic gray/white when the site uses a distinct color palette

## BANNED — NEVER USE THESE:
- position: absolute or position: fixed — use flexbox or grid instead
- inline styles (style="...") — use Tailwind classes only
- float: left/right — use flex or grid
- !important — never
- <br> tags for spacing — use margin/padding classes
- Fixed pixel widths (width: 300px) — use Tailwind w-* classes

## RULES
- Return ONLY the section HTML — no page wrapper, no code fences, no commentary
- Do NOT add <html>, <head>, <body>, <header>, <footer> tags
- ALL layouts must use flexbox (flex) or CSS grid (grid) — never absolute positioning
- ALL styling must be Tailwind utility classes — zero inline styles
- Content must be relevant to the page purpose provided
- Match the visual style of the existing site context provided
- Every section must look complete and professional on its own`;

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
    system: getSectionGeneratorPrompt(),
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
      system: getSectionGeneratorPrompt(),
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
// Visual analysis via Sonnet vision
// ---------------------------------------------------------------------------

const VISUAL_ANALYSIS_PROMPT = `You are a UI/UX quality analyst reviewing a website screenshot. Identify EVERY visual issue you can see.

You will receive BOTH a screenshot AND the HTML markup for the page sections. Use both to diagnose issues accurately.

LOOK FOR:
- Overlapping elements (text on text, cards colliding, sections bleeding into each other)
- Broken grid layouts (columns not aligned, uneven spacing)
- Text overflow (text spilling outside containers, truncated content)
- Word-by-word wrapping (text breaking on every word — indicates missing container width)
- Misaligned elements (inconsistent spacing, off-center content)
- Broken or missing images (empty boxes, broken icons)
- Unreadable text (too small, low contrast, obscured by other elements)
- Responsive issues (content not adapting to viewport width)
- Huge empty whitespace gaps
- Elements that look out of place or unstyled

ARCHITECTURE RULES (flag violations):
- position: absolute/fixed — DISCOURAGED. Should use flexbox or grid instead. Flag any absolute/fixed positioning.
- Inline styles (style="...") — BANNED. Must use Tailwind CSS classes only. Flag any inline styles.
- Missing container constraints (no max-w-*) — Flag sections without width constraints.
- Float-based layouts — OBSOLETE. Should use flex/grid. Flag any float usage.

COLOR CONSISTENCY:
- If brand colors are provided, check that the page uses them consistently
- Flag sections that use different color schemes from the rest of the site (e.g., generic white/gray when the site uses dark navy)
- Flag buttons, CTAs, or accents that don't match the brand accent color
- If a section looks visually disconnected from the rest of the page (different color palette, different style), flag it as a consistency issue

For each issue:
1. WHERE — which section name and approximate position
2. WHAT — specific visual problem AND the HTML causing it (reference specific classes or elements)
3. HOW — specific Tailwind CSS fix (never suggest inline styles or position absolute)

RESPONSE FORMAT — return ONLY valid JSON:
{
  "issues": [
    {
      "section": "Name or description of the affected section",
      "severity": "critical" | "high" | "medium" | "low",
      "description": "Clear description of the visual problem",
      "suggested_fix": "Specific instruction to fix this in HTML/Tailwind"
    }
  ]
}

If the page looks good with no visual issues, return: { "issues": [] }`;

export interface VisualIssue {
  section: string;
  severity: string;
  description: string;
  suggested_fix: string;
}

export async function analyzeScreenshot(params: {
  screenshot: Buffer;
  viewport: string;
  pagePath: string;
  sectionHtml?: string;
}): Promise<VisualIssue[]> {
  const { screenshot, viewport, pagePath, sectionHtml } = params;
  const ai = getClient();

  console.log(`[AiCommand] Analyzing screenshot: ${pagePath} (${viewport})${sectionHtml ? ` with ${sectionHtml.length} chars HTML` : ""}`);

  const textContent = [
    `Page: ${pagePath}`,
    `Viewport: ${viewport}`,
    "",
    "Analyze this screenshot for visual/layout issues.",
    "Brand colors use CSS classes: bg-primary, text-primary, bg-accent, text-accent. Check that pages use these instead of hardcoded hex values.",
    sectionHtml ? `\n## Page HTML Markup (for reference)\n\n${sectionHtml.substring(0, 15000)}` : "",
  ].join("\n");

  const response = await ai.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: getVisualAnalysisPrompt(),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/jpeg",
              data: screenshot.toString("base64"),
            },
          },
          {
            type: "text",
            text: textContent,
          },
        ],
      },
    ],
  });

  const text = extractText(response);
  const parsed = tryParseJson(text);

  if (!parsed || !Array.isArray(parsed.issues)) {
    console.warn(`[AiCommand] Visual analysis parse failed for ${pagePath} (${viewport})`);
    return [];
  }

  const issues = parsed.issues.filter(
    (i: any) => i?.description && i?.suggested_fix
  ) as VisualIssue[];

  console.log(
    `[AiCommand] ✓ Visual ${pagePath} (${viewport}): ${issues.length} issue(s). Tokens: ${response.usage.input_tokens}/${response.usage.output_tokens}`
  );

  return issues;
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
