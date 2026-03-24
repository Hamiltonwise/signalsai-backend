# AI Command Reliability Overhaul

## Why
AI Command execution is unreliable: retries burn tokens due to prompt/validator contradictions, post creation generates full page layouts instead of rich text, pages don't match existing site design, and broken `<img>` tags pollute generated content. Every execution triggers 2-3 unnecessary LLM calls just to "fix" valid output that the validator incorrectly flags.

## What
Fix all 8 identified bugs across 3 waves. When done: zero contradictions between prompts and validator, post content is clean rich text, page creation matches existing site design, no invented image URLs, and execution completes in 1 pass (not 3).

## Context

**Relevant files:**
- `src/agents/websiteAgents/aiCommand/Execution.md` — HTML editor system prompt (53 lines)
- `src/agents/websiteAgents/aiCommand/SectionGenerator.md` — section generation prompt (104 lines)
- `src/agents/websiteAgents/aiCommand/SectionPlanner.md` — section planning prompt (16 lines)
- `src/agents/websiteAgents/aiCommand/VisualAnalysis.md` — screenshot analysis prompt (48 lines)
- `src/utils/website-utils/htmlValidator.ts` — agentic loop validator (196 lines)
- `src/utils/website-utils/aiCommandService.ts` — all LLM calls (741 lines)
- `src/utils/website-utils/agenticHtmlPipeline.ts` — retry loop (135 lines)
- `src/controllers/admin-websites/feature-services/service.ai-command.ts` — orchestrator (~1800 lines)
- `src/controllers/admin-websites/AdminWebsitesController.ts` — direct post generation endpoint (line 2928-2934)

**Patterns to follow:**
- Existing prompt files in `src/agents/websiteAgents/aiCommand/` — markdown format, loaded via `loadPrompt()`
- Existing `aiCommandService.ts` exports — each LLM capability is a separate exported function

**Key decisions already made:**
- No inline styles — Tailwind classes only. Use `bg-gray-50`/`bg-gray-100` instead of opacity variants.
- No RAG/embeddings — send more raw context instead (20K chars vs current 3K)
- Posts = rich text only. No layout wrappers, no CTAs, no hero sections, no images.
- Brand colors via `bg-primary`/`text-primary`/`bg-accent`/`text-accent` CSS classes (injected at render time by N8N)

## Constraints

**Must:**
- Every prompt change must align with what `htmlValidator.ts` enforces — zero contradictions
- All existing batch types (`ai_editor`, `ui_checker`, `link_checker`) must continue working
- Execution phase order must remain the same
- New `PostContent.md` prompt must produce content compatible with post_block rendering (`{{post.content}}` is inserted raw)

**Must not:**
- No new dependencies
- Don't modify database schema
- Don't modify frontend (AiCommandTab.tsx) — all changes are backend prompts + logic
- Don't modify the Analysis.md or Structural.md prompts (analysis phase works correctly)

**Out of scope:**
- Cross-project template matching / RAG
- Frontend UI changes
- New batch types
- Performance optimization of analysis phase (it's acceptable)

## Risk

**Level:** 2

**Risks identified:**
- Removing inline style guidance could break opacity effects on existing generated content → **Mitigation:** Only affects future generations, not existing content. `bg-gray-50`/`bg-gray-100` are universal replacements.
- Stricter `<img>` validation could flag legitimate images in existing content → **Mitigation:** Only validate images in newly generated content (via agentic pipeline), not during analysis of existing HTML.
- Increased context tokens (3K → 20K) increases per-call cost → **Mitigation:** Net token savings from eliminating retries far exceeds the ~$0.02/call increase. Currently 3 calls × 8K = 24K tokens wasted; new approach: 1 call × 20K = 20K tokens used productively.

## Tasks

### Wave 1 — Stop the Token Bleed

### T1: Fix htmlValidator.ts — eliminate prompt/validator contradictions
**Do:**
1. `checkColors()` (line 63-128): Change the color opacity fix instruction from "use inline style rgba()" to "Replace with bg-gray-50, bg-gray-100, or bg-gray-900. For subtle backgrounds use bg-gray-50. Never use opacity variants of brand colors."
2. `checkColors()` (line 90-95): Change gradient fix instruction from "use inline style background:linear-gradient()" to "Remove gradient classes. Use solid bg-primary or bg-accent. For visual depth, use separate nested divs with different solid backgrounds."
3. `checkStructure()` (line 52-58): Keep the inline style check as-is — inline styles are now truly banned across all prompts.
4. `checkColors()` (line 113-119): Keep rounded-full check as-is — this is correct.
5. No changes to `checkLinks()` or `checkBannedPatterns()` — these are correct.

**Files:** `src/utils/website-utils/htmlValidator.ts`
**Verify:** `npx tsc --noEmit` passes. Read the file and confirm zero references to "rgba", "inline style" in fix instructions (except the display:none exclusion).

### T2: Fix Execution.md — remove inline style guidance, ban image invention
**Do:**
1. Remove the entire "TAILWIND CDN COMPATIBILITY" section (lines 10-30) that teaches rgba/inline style workarounds
2. Replace with a simpler section:
```
## TAILWIND CDN COMPATIBILITY
- bg-primary, text-primary, bg-accent, text-accent — these work (custom CSS classes)
- bg-primary/10, bg-accent/5 — NEVER. Opacity variants of brand colors do not work.
- For light tinted backgrounds: use bg-gray-50 or bg-gray-100
- For dark backgrounds: use bg-primary or bg-gray-900
- For subtle accents: use bg-gray-100 or a border-primary with bg-white
- Gradients with brand colors do NOT work. Use solid colors only.
```
3. Update "INLINE STYLES" section (line 52-53): Change to "Inline styles (style="...") are BANNED. No exceptions. Everything must be Tailwind utility classes."
4. Add new "IMAGES" section:
```
## IMAGES
- NEVER generate <img> tags with invented or placeholder URLs
- NEVER use src="/images/...", src="/assets/...", or any relative image path
- If the current HTML has images, preserve them exactly
- If creating new content, use text, Tailwind bg-gray-200 placeholder divs, or omit images entirely
```

**Files:** `src/agents/websiteAgents/aiCommand/Execution.md`
**Verify:** Read the file and confirm: zero mentions of "rgba", "inline style allowed", zero `style=` examples. Confirm new IMAGES section exists.

### T3: Fix SectionGenerator.md — same alignment as Execution.md
**Do:**
1. Remove the entire "TAILWIND CDN COMPATIBILITY" section (lines 30-59) with all rgba/inline style guidance
2. Replace with the same simplified section from T2
3. Update "COLOR SYSTEM" section (lines 65-69): Remove "NEVER use opacity variants of these (bg-primary/10 etc) — use inline style" → "NEVER use opacity variants. Use bg-gray-50, bg-gray-100 for light backgrounds."
4. Update BANNED list (lines 82-95): Remove "bg-primary/N, bg-accent/N, text-white/N — use inline style" → "bg-primary/N, bg-accent/N — use bg-gray-50 or bg-gray-100 instead"
5. Change "Inline styles allowed ONLY for: rgba colors, gradients" → "Inline styles are BANNED. No exceptions."
6. Add IMAGES section (same as T2)
7. Remove hardcoded hex values for primary (#232323) and accent (#23AFBE) — these are project-specific. Replace with: "The project's actual brand color hex values will be provided in the Site Style Reference section when available."

**Files:** `src/agents/websiteAgents/aiCommand/SectionGenerator.md`
**Verify:** Read the file and confirm: zero mentions of "rgba", "inline style", "#232323", "#23AFBE". Confirm IMAGES section exists.

### T4: Create PostContent.md — dedicated prompt for post rich text
**Do:** Create `src/agents/websiteAgents/aiCommand/PostContent.md`:
```markdown
You generate rich text HTML content for a database post record. Your output will be stored in a `content` field and rendered inside a post block template on the page.

## WHAT YOU ARE
A content writer producing the BODY of a post — not a page layout.

## OUTPUT FORMAT
- Return ONLY the HTML content — no code fences, no markdown, no commentary
- Start with a <div> wrapper — NOT <section>, NOT <article>
- Content goes INSIDE a post block template that already handles layout, cards, grids, and spacing

## CONTENT STRUCTURE
Write well-structured rich text HTML:
- Headings: <h2>, <h3>, <h4> (NEVER <h1> — the post title is rendered by the template)
- Paragraphs: <p> with substantive, informative text
- Lists: <ul>/<ol> for credentials, features, services, steps
- Blockquotes: <blockquote> for testimonials or callouts
- Tables: <table> for hours, pricing, comparisons
- Strong/em: <strong>, <em> for emphasis
- Links: <a href="/path"> for internal links (use real page paths only)

## WHAT TO NEVER GENERATE
- <section> tags or full-width layout wrappers
- Hero banners, CTA blocks, or call-to-action sections
- <img> tags — the post template handles featured images via {{post.featured_image}}
- Grid layouts (grid-cols-*), card layouts, or multi-column structures
- Full-width background colors (bg-primary on outer containers)
- Section padding (py-16, py-24, px-6 md:px-12) — the template handles spacing
- Buttons or button-like elements — the template handles CTAs if needed
- Navigation elements

## STYLING
- Use font-serif on headings (<h2 class="font-serif text-2xl font-bold mb-4">)
- Use font-sans on body text (default — no class needed)
- Use text-primary or text-accent for colored headings or highlights
- Use Tailwind utility classes for spacing: mb-4, mt-6, space-y-4
- Keep it simple — this is article/bio content, not a landing page

## TONE
- Professional, informative, specific to the practice/topic
- Use real data from the reference content — do not invent credentials, phone numbers, or addresses
- If reference content is thin, write general but accurate content for the specialty
- Match the tone and detail level of existing posts when provided as style context

## RULES
- Return ONLY raw HTML. No code fences. No commentary.
- NEVER include placeholder text (Lorem ipsum, TBD, example.com)
- NEVER generate <img> tags — the template handles images
- NEVER generate CTA buttons or "Schedule Now" sections
- Content should be 200-600 words depending on post type
- Every piece of factual information must come from the reference content provided
```

**Files:** `src/agents/websiteAgents/aiCommand/PostContent.md` (new file)
**Verify:** File exists. `loadPrompt("websiteAgents/aiCommand/PostContent")` would resolve to it.

### T5: Create generatePostContent() in aiCommandService.ts
**Do:**
1. Add `getPostContentPrompt` loader at top of file alongside the others:
   ```typescript
   const getPostContentPrompt = () => loadPrompt("websiteAgents/aiCommand/PostContent");
   ```
2. Add new exported function after `editHtmlContent`:
   ```typescript
   export async function generatePostContent(params: {
     title: string;
     postTypeName: string;
     purpose: string;
     referenceContent: string;
     styleContext: string;
     customFieldsHint: string;
   }): Promise<{ html: string; inputTokens: number; outputTokens: number }> {
     const ai = getClient();
     const userMessage = [
       `## Post to Create`,
       `Title: ${params.title}`,
       `Type: ${params.postTypeName}`,
       params.purpose ? `Purpose: ${params.purpose}` : "",
       params.referenceContent ? `\n## Reference Content (primary data source)\n${params.referenceContent}` : "",
       params.styleContext ? `\n## Existing Posts of Same Type (match this style)\n${params.styleContext}` : "",
       params.customFieldsHint || "",
     ].filter(Boolean).join("\n");

     console.log(`[AiCommand] Generating post content: ${params.title} (${params.postTypeName})`);

     const response = await ai.messages.create({
       model: MODEL,
       max_tokens: 4096,
       system: getPostContentPrompt(),
       messages: [{ role: "user", content: userMessage }],
     });

     let html = cleanHtmlOutput(extractText(response));

     if (!html || html.startsWith("{")) {
       throw new Error(`Failed to generate post content for ${params.title}`);
     }

     console.log(
       `[AiCommand] ✓ Post content: ${params.title}. ${html.length} chars. Tokens: ${response.usage.input_tokens}/${response.usage.output_tokens}`
     );

     return {
       html,
       inputTokens: response.usage.input_tokens,
       outputTokens: response.usage.output_tokens,
     };
   }
   ```

**Files:** `src/utils/website-utils/aiCommandService.ts`
**Verify:** `npx tsc --noEmit` passes. The function is exported and callable.

### T6: Update executeCreatePost to use generatePostContent
**Do:**
1. In `service.ai-command.ts`, update the import (line 14-17 area) to include `generatePostContent`:
   ```typescript
   import {
     analyzeHtmlContent,
     editHtmlContent,
     analyzeForStructuralChanges,
     planPageSections,
     generateSectionHtml,
     generatePostContent,
   } from "../../../utils/website-utils/aiCommandService";
   ```
2. In `executeCreatePost` (lines 1447-1469), replace the entire LLM generation block:
   - Remove the dynamic import `const { editHtmlContent: generateContent } = await import(...)`
   - Remove the `instruction` string builder
   - Remove the `generateContent({ instruction, currentHtml: "<div></div>", ... })` call
   - Replace with:
   ```typescript
   const result = await generatePostContent({
     title: meta.title,
     postTypeName: postType.name,
     purpose: meta.purpose || "",
     referenceContent,
     styleContext,
     customFieldsHint: customFieldsInstruction,
   });
   ```
3. Update the agentic pipeline call to use `result.html` instead of `result.editedHtml`

**Files:** `src/controllers/admin-websites/feature-services/service.ai-command.ts`
**Verify:** `npx tsc --noEmit` passes. Trace the flow: `executeCreatePost` → `generatePostContent()` → PostContent.md system prompt → clean rich text output.

### T7: Update direct post generation endpoint in AdminWebsitesController
**Do:** In `AdminWebsitesController.ts` (lines 2928-2934), replace:
```typescript
const { editHtmlContent } = await import("../../utils/website-utils/aiCommandService");
const result = await editHtmlContent({
  instruction: `Create professional HTML content for a ${typeName} titled "${title}". ...`,
  currentHtml: "<div></div>",
  targetLabel: `Post: ${title}`,
});
return res.json({ success: true, data: { content: result.editedHtml } });
```
With:
```typescript
const { generatePostContent } = await import("../../utils/website-utils/aiCommandService");
const result = await generatePostContent({
  title,
  postTypeName: typeName,
  purpose: "",
  referenceContent: refContent,
  styleContext: "",
  customFieldsHint: "",
});
return res.json({ success: true, data: { content: result.html } });
```

**Files:** `src/controllers/admin-websites/AdminWebsitesController.ts`
**Verify:** `npx tsc --noEmit` passes.

### T8: Add image src validation to htmlValidator.ts
**Do:** Add a new check function `checkBrokenImages` and call it from `validateHtml`:
```typescript
function checkBrokenImages(html: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Detect <img> with relative src paths (invented/placeholder images)
  const relativeImages = html.match(/<img[^>]*src=["']\/(?!api\/)[^"']*["'][^>]*>/gi) || [];
  if (relativeImages.length > 0) {
    issues.push({
      type: "ui",
      description: `${relativeImages.length} image(s) with local/relative src paths — these files likely don't exist.`,
      fixInstruction: "Remove <img> tags with relative src paths (src=\"/images/...\", src=\"/assets/...\"). Replace with text content or a placeholder div with class=\"bg-gray-200 rounded-lg w-full h-48 flex items-center justify-center\". Keep images that use https:// URLs.",
    });
  }

  // Detect common placeholder image patterns
  const placeholderImages = html.match(/<img[^>]*src=["'](?:https?:\/\/(?:via\.placeholder|placehold|placekitten|picsum|dummyimage|fakeimg)[^"']*|data:image\/[^"']*)["'][^>]*>/gi) || [];
  if (placeholderImages.length > 0) {
    issues.push({
      type: "ui",
      description: `${placeholderImages.length} placeholder/dummy image(s) detected.`,
      fixInstruction: "Remove placeholder images. Replace with a div with class=\"bg-gray-200 rounded-lg w-full h-48\" or omit entirely.",
    });
  }

  return issues;
}
```
Add `issues.push(...checkBrokenImages(html));` to the `validateHtml` function after the existing checks.

**Files:** `src/utils/website-utils/htmlValidator.ts`
**Verify:** `npx tsc --noEmit` passes. Read the file and confirm the new function exists.

---

### Wave 2 — Improve Quality

### T9: Make SectionPlanner.md context-aware
**Do:** Replace the entire `SectionPlanner.md` with:
```markdown
You plan the section structure for a new web page. Given the page's purpose and examples of existing pages' section structures, output a list of sections.

## RULES
- Study the existing pages' section structures carefully — match their pattern, naming convention, and count
- Section names must be lowercase, hyphenated (e.g., "section-hero", "section-services-list")
- Each section should have a clear, specific purpose

## PAGE TYPE AWARENESS
- **Service/treatment pages:** 3-5 sections. Hero + content + benefits/features + CTA is typical.
- **Doctor/team pages:** 3-4 sections. Hero/intro + bio/credentials + specialties + CTA.
- **Utility pages (privacy, terms, accessibility, sitemap):** 1-2 sections ONLY. Just section-content. No hero. No CTA.
- **About/mission pages:** 3-5 sections. Hero + story/mission + team-overview + values + CTA.
- **Contact pages:** 2-3 sections. Hero/intro + contact-form + map/hours.
- **Landing pages:** 4-7 sections. Follow existing site pattern.

## ADAPTING TO EXISTING SITE
- If existing pages have 3 sections on average, plan 3-4 sections (not 7)
- If existing pages don't have CTAs, don't add one
- If existing pages use specific naming patterns (e.g., "section-main" instead of "section-content"), follow that
- When in doubt, fewer sections is better than more

RESPONSE FORMAT — return ONLY valid JSON:
{
  "sections": [
    { "name": "section-hero", "purpose": "Hero banner with page title, subtitle, and call-to-action" },
    { "name": "section-content", "purpose": "Main content area with detailed information" }
  ]
}
```

**Files:** `src/agents/websiteAgents/aiCommand/SectionPlanner.md`
**Verify:** Read the file. Confirm: no "Always include hero first and CTA last" rule. Confirm page type awareness exists.

### T10: Enrich page creation style context
**Do:** In `executeCreatePage` (service.ai-command.ts, lines 1206-1225):
1. Increase the `siteStyleContext` cap from 3000 to 20000 chars
2. Increase per-section cap from 1000 to 3000 chars
3. Include the project's wrapper/header/footer HTML as style context (first 3000 chars each)
4. Include project color hex values as metadata
5. Increase existing page limit from 3 to 5

Replace lines 1206-1225 with:
```typescript
// Fetch existing pages for style context (up to 5)
const existingPages = await db(PAGES_TABLE)
  .where({ project_id: projectId, status: "published" })
  .limit(5);

const existingSections: Array<{ name: string; summary: string }> = [];
let siteStyleContext = [
  `## Brand Colors`,
  `- bg-primary / text-primary — resolves to ${project.primary_color || "#232323"}`,
  `- bg-accent / text-accent — resolves to ${project.accent_color || "#23AFBE"}`,
  `- NEVER use these hex values directly. Always use the CSS classes.`,
  `- For light backgrounds: bg-gray-50, bg-gray-100. For dark: bg-primary, bg-gray-900.`,
  ``,
  `## Site Layout (wrapper/header/footer — match this style)`,
  project.header ? `### Header\n${String(project.header).substring(0, 3000)}` : "",
  project.footer ? `### Footer\n${String(project.footer).substring(0, 3000)}` : "",
  ``,
  `## Existing Page Sections (match these patterns)`,
].filter(Boolean).join("\n");

for (const page of existingPages) {
  const raw = typeof page.sections === "string" ? JSON.parse(page.sections) : page.sections;
  const sections = normalizeSections(raw);
  for (const s of sections) {
    const name = s.name || s.label || "unnamed";
    const content = typeof s === "string" ? s : s.content || s.html || "";
    existingSections.push({ name, summary: content.substring(0, 200) });
    if (siteStyleContext.length < 20000) {
      siteStyleContext += `\n--- ${page.path} > ${name} ---\n${content.substring(0, 3000)}\n`;
    }
  }
}
```

**Files:** `src/controllers/admin-websites/feature-services/service.ai-command.ts`
**Verify:** `npx tsc --noEmit` passes. Read the function and confirm: context cap is 20000, pages limit is 5, header/footer included, color hex values included.

### T11: Fix VisualAnalysis.md — align with no-inline-styles rule
**Do:** In `VisualAnalysis.md`, update the "ARCHITECTURE RULES" section:
1. Keep "Inline styles (style="...") — BANNED" as-is (it was already correct)
2. Add clarification: "Exception: `style="display:none"` for hidden elements is acceptable."
3. In the COLOR CONSISTENCY section, add: "For light brand-tinted backgrounds, the correct approach is bg-gray-50 or bg-gray-100 — not bg-primary/10 or inline rgba styles."
4. In the fix suggestion line, change "never suggest inline styles" to "never suggest inline styles — use Tailwind utility classes, bg-gray-50/bg-gray-100 for tinted backgrounds"

**Files:** `src/agents/websiteAgents/aiCommand/VisualAnalysis.md`
**Verify:** Read the file. Confirm alignment with Execution.md on inline styles policy.

---

### Wave 3 — Structural Improvements

### T12: Add duplicate redirect detection to structural analysis
**Do:** In `analyzeForStructuralChanges` result processing (service.ai-command.ts, around line 354-367), after inserting redirect recommendations, add deduplication:
1. Before inserting, check if a redirect with the same `from_path` already exists in the current batch recommendations
2. Before inserting, check if a redirect with the same `from_path` already exists in the `website_builder.redirects` table for this project (the existing redirects are already fetched — they're in the `existingRedirects` array)
3. Skip duplicates silently (log a warning)

Also add a `delete_redirect` target type to the structural analysis:
1. In `Structural.md`, add a new category to the JSON response format:
   ```
   "deleteRedirects": [
     { "from_path": "/old-duplicate", "recommendation": "Duplicate redirect — already handled by /other-redirect" }
   ]
   ```
2. In the structural result processing, handle `deleteRedirects` entries as `target_type: "delete_redirect"` recommendations
3. The `executeDeleteRedirect` function already exists (found in earlier audit)

**Files:** `src/controllers/admin-websites/feature-services/service.ai-command.ts`, `src/agents/websiteAgents/aiCommand/Structural.md`
**Verify:** `npx tsc --noEmit` passes. Read Structural.md and confirm `deleteRedirects` is in the response format.

## Done
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] All 6 prompt files are internally consistent — no prompt tells the LLM to do something the validator flags
- [ ] htmlValidator.ts has zero references to "rgba" or "inline style" in fix instructions (except display:none exclusion)
- [ ] PostContent.md exists and is loaded by `generatePostContent()`
- [ ] `executeCreatePost` and the direct post endpoint both use `generatePostContent()`, not `editHtmlContent()`
- [ ] SectionPlanner.md is context-aware with page type guidance
- [ ] Page creation sends 20K chars of style context including header/footer and project colors
- [ ] Image validation catches relative src paths and placeholder images
- [ ] Structural.md supports `deleteRedirects`
- [ ] Manual: Run an AI Command batch on a test project — confirm execution completes without agentic pipeline retries for opacity/inline style issues
- [ ] Manual: Create a post via AI Command — confirm output is clean rich text (no `<section>`, no CTA, no `<img>`)
- [ ] Manual: Create a page via AI Command — confirm sections visually match existing site design
