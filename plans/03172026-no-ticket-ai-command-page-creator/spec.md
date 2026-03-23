# AI Command — Page & Post Creator

## Why
AI Command can analyze and edit existing content, but can't create new pages or posts. QA checklists often recommend building missing pages (pricing, referral forms, individual services) or adding missing posts (new doctor profiles, blog entries). Without creation capability, these recommendations are dead ends that require manual work.

## What
Extend AI Command's execution pipeline to handle `create_page` and `create_post` recommendation types. Pages are generated section-by-section with alloro-tpl-* classes baked in. Posts are created when the content type maps to an existing post_type. Existence checks prevent duplicates.

## Context

**Relevant files:**
- `signalsai-backend/src/controllers/admin-websites/feature-services/service.ai-command.ts` — batch analysis + execution
- `signalsai-backend/src/utils/website-utils/aiCommandService.ts` — LLM caller (Sonnet)
- `signalsai-backend/src/controllers/admin-websites/feature-services/service.page-editor.ts` — `createPage()` takes `{ path, sections }`
- `signalsai-backend/src/controllers/admin-websites/feature-services/service.post-manager.ts` — post CRUD
- `signalsai/src/hooks/useIframeSelector.ts` — `ALLORO_PREFIX = "alloro-tpl-"`, walks classList
- `signalsai/src/utils/htmlReplacer.ts` — `extractSectionsFromDom()` uses `data-alloro-section` markers

**alloro-tpl-* class convention:**
- Format: `alloro-tpl-{id}-{section-name}` on section root, `alloro-tpl-{id}-{section-name}-component-{name}` on inner editable elements
- Classes are baked into HTML at creation time, not generated at render
- The page editor validates: if alloro-tpl class is missing from LLM response, edit is rejected
- `data-alloro-section="{sectionName}"` is injected by the frontend renderer on section roots for extraction

**Page creation (direct API):**
- `createPage(projectId, { path, sections })` — inserts page row with sections JSONB, no template needed
- Sections: `[{ name: "section-hero", content: "<div class=\"alloro-tpl-xyz-hero ...\">...</div>" }]`

**Post creation:**
- `createPost(projectId, postTypeId, { title, slug, content, custom_fields, status })` via post-manager service

**Post-type awareness:**
- `post_types` table: `{ id, template_id, name, slug, schema }` — defines content types per template
- Posts reference `post_type_id` — e.g., "doctors" post type contains individual doctor profiles
- Post blocks render posts dynamically via `{{ post_block }}` shortcodes

## Constraints

**Must:**
- Generate alloro-tpl-* classes on every section root and key inner elements (headings, CTAs, images, text blocks)
- Use unique IDs per class (use `crypto.randomUUID().slice(0, 12)` or similar short hash)
- Generate sections one at a time via separate LLM calls (plan first, then generate each)
- Check page path existence before creating — skip if page at that path already exists
- Check post slug existence before creating — skip if post with that slug already exists
- Check post_types to determine if content should be a post vs a page (e.g., doctors → post, pricing → page)
- Use 2-3 existing pages as HTML context so generated content matches the site's style
- Include `data-alloro-section="{sectionName}"` on each section root div

**Must not:**
- Send entire page HTML in one LLM call — section by section only
- Create pages without alloro-tpl classes (breaks editor)
- Create duplicate pages/posts
- Modify existing page creation pipeline or post manager
- Create post_types that don't exist — only create posts for existing types

**Out of scope:**
- SEO generation for created pages (can be triggered separately after)
- Media/image upload during creation
- Custom field population for posts beyond title/slug/content

## Risk

**Level:** 3

**Risks identified:**
- LLM may generate inconsistent alloro-tpl class patterns → **Mitigation:** system prompt with explicit examples, validate output has at least one alloro-tpl class per section
- Section-by-section generation may produce disconnected design → **Mitigation:** pass section plan + prior generated sections as context to each subsequent call
- Post-type detection may misfire (e.g., "services" could be pages or posts) → **Mitigation:** hybrid approach — AI recommends, user approves. Never auto-create without approval.

**Pushback:**
- This is a significant scope addition to AI Command. The section plan → generate → validate → assemble pipeline is 4-5 LLM calls per page. For a recommendation to "create 6 service pages," that's 24-30 LLM calls in execution. Cost and latency are real concerns. Consider rate-limiting to max 3 page creations per batch execution.

## Tasks

### T1: New recommendation types + analysis prompt update
**Do:** Extend the analysis LLM prompt and recommendation schema to support:
- `target_type: "create_page"` — with `target_meta: { path, page_purpose, section_plan? }`
- `target_type: "create_post"` — with `target_meta: { post_type_slug, title, slug, purpose }`

Update `analyzeHtmlContent` system prompt to:
- Recognize when a checklist item requires creating a new page/post
- Check against existing pages/posts (pass list of existing paths and post slugs as context)
- Detect post_type alignment: query post_types for the project's template, pass as context
- Output `create_page` or `create_post` recommendations with structured metadata

**Files:** `signalsai-backend/src/utils/website-utils/aiCommandService.ts`, `signalsai-backend/src/controllers/admin-websites/feature-services/service.ai-command.ts`
**Verify:** Analysis produces `create_page`/`create_post` recommendations when checklist mentions missing pages

### T2: Page section planner
**Do:** New function in `aiCommandService.ts`:

`planPageSections(params: { purpose: string, existingSections: Array<{ name: string, summary: string }>, siteContext: string })` → `{ sections: Array<{ name: string, purpose: string }> }`

- Takes a page purpose ("pricing page for orthodontic services")
- Takes 2-3 existing pages' section names + brief summaries as style reference
- Returns planned section structure: `[{ name: "section-hero", purpose: "Hero banner with page title and subtitle" }, ...]`
- Typical page: 4-7 sections

**Files:** `signalsai-backend/src/utils/website-utils/aiCommandService.ts`
**Verify:** Returns structured section plans

### T3: Section HTML generator with alloro-tpl classes
**Do:** New function in `aiCommandService.ts`:

`generateSectionHtml(params: { sectionName: string, sectionPurpose: string, pageContext: string, existingPageHtml: string, priorSections: string[], siteStyleContext: string })` → `{ html: string }`

System prompt must enforce:
- Root element gets `alloro-tpl-{shortId}-{sectionName}` class
- Key inner elements get `alloro-tpl-{shortId}-{sectionName}-component-{componentName}` classes
- Component names: `title`, `subtitle`, `description`, `cta-button`, `image`, `card-{n}`, `list-item-{n}`
- Root element gets `data-alloro-section="{sectionName}"` attribute
- Use Tailwind CSS classes matching existing site style
- Generate a short unique ID prefix per section (passed in, generated by caller)

Validation:
- Output must contain at least one `alloro-tpl-` class
- Output must contain `data-alloro-section` attribute
- Output must be valid HTML (starts with `<`)

**Files:** `signalsai-backend/src/utils/website-utils/aiCommandService.ts`
**Verify:** Generated HTML contains alloro-tpl classes and data-alloro-section

### T4: Existence checks
**Do:** Add helper functions in `service.ai-command.ts`:

- `pageExistsAtPath(projectId: string, path: string): Promise<boolean>` — checks pages table
- `postExistsWithSlug(projectId: string, postTypeId: string, slug: string): Promise<boolean>` — checks posts table
- `getPostTypeBySlug(templateId: string, slug: string): Promise<PostType | null>` — resolves post type
- `getExistingPaths(projectId: string): Promise<string[]>` — all page paths for context
- `getExistingPostSlugs(projectId: string): Promise<Array<{ slug: string, post_type_slug: string }>>` — all post slugs for context

Call these during analysis (pass existing paths/slugs to LLM) and during execution (skip if exists).

**Files:** `signalsai-backend/src/controllers/admin-websites/feature-services/service.ai-command.ts`
**Verify:** Functions return correct results

### T5: Execution pipeline — create_page handler
**Do:** In `executeRecommendation()`, add handler for `target_type === "create_page"`:

1. Check `pageExistsAtPath()` — if exists, mark as failed with "Page already exists at {path}"
2. Fetch 2-3 existing published pages for style context (extract section names + first 500 chars of each)
3. Call `planPageSections()` with the page purpose from `target_meta`
4. For each planned section:
   - Generate short ID: `crypto.randomUUID().slice(0, 12)`
   - Call `generateSectionHtml()` with context, prior sections, style reference
   - Validate output
   - Accumulate into sections array
5. Call `createPage(projectId, { path: target_meta.path, sections })` — creates as draft
6. Store created page ID in `execution_result`

**Files:** `signalsai-backend/src/controllers/admin-websites/feature-services/service.ai-command.ts`
**Verify:** Executing a `create_page` recommendation creates a draft page with alloro-tpl sections

### T6: Execution pipeline — create_post handler
**Do:** In `executeRecommendation()`, add handler for `target_type === "create_post"`:

1. Resolve post_type from `target_meta.post_type_slug` via template
2. Check `postExistsWithSlug()` — if exists, mark as failed
3. Fetch 1-2 existing posts of same type for style context
4. Generate post content via LLM (single call — posts are typically one content block, not sections)
5. Call post manager's create function with `{ title, slug, content, status: "draft" }`
6. Store created post ID in `execution_result`

**Files:** `signalsai-backend/src/controllers/admin-websites/feature-services/service.ai-command.ts`
**Verify:** Executing a `create_post` recommendation creates a draft post

### T7: Frontend — display create_page/create_post recommendations
**Do:** Update `AiCommandTab.tsx` to handle new recommendation types:

- `create_page` recommendations show with a page icon + "Create page: {path}"
- `create_post` recommendations show with a post icon + "Create post: {title}"
- Group under new top-level groups: "New Pages" and "New Posts" (in addition to existing Layouts/Pages/Posts)
- After execution, show link to created page/post if successful

**Files:** `signalsai/src/components/Admin/AiCommandTab.tsx`
**Verify:** New recommendation types render correctly with appropriate icons and labels

## Done
- [ ] Analysis detects missing pages/posts from checklist and produces create recommendations
- [ ] Existence checks prevent duplicate creation
- [ ] Post_type awareness: doctors → post, pricing → page
- [ ] Section plan generated before page creation
- [ ] Each section generated individually with alloro-tpl-* classes
- [ ] Generated sections contain `data-alloro-section` attribute
- [ ] Created pages are editable in the visual page editor
- [ ] Created posts have correct post_type association
- [ ] `npx tsc --noEmit` passes (both frontend and backend)
- [ ] Manual: create a page via AI Command, open in page editor, verify element selection works
