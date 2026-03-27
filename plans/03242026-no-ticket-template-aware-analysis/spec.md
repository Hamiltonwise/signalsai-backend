# Template-Aware Analysis for AI Command

## Why
When analysis recommends replacing hardcoded HTML with shortcodes (post_block, menu, review_block), it guesses template slugs because it doesn't know which templates actually exist. This causes execution failures or wrong shortcode references. The LLM should know exactly which templates are available so it can reference real slugs, or flag that a template needs to be created manually.

## What
Pass existing post_block templates, menu templates, and review_block templates into the Analysis prompt context. When the LLM recommends a shortcode replacement, it references a real template slug. When no suitable template exists, it flags the recommendation as `manual_action: true` in target_meta.

## Context

**Relevant files:**
- `src/agents/websiteAgents/aiCommand/Analysis.md` — analysis system prompt (references shortcodes but doesn't know which templates exist)
- `src/controllers/admin-websites/feature-services/service.ai-command.ts` — orchestrator (fetches project data for analysis but not templates)
- `src/models/website-builder/PostBlockModel.ts` — `findByTemplateId()` returns post_block templates
- `src/models/website-builder/ReviewBlockModel.ts` — `findByTemplateId()` returns review_block templates
- `src/controllers/admin-websites/feature-services/service.menu-template-manager.ts` — queries menu_templates table

**DB tables (all scoped to template_id):**
- `website_builder.post_blocks` — slug, name, description, sections (JSONB), post_type_id
- `website_builder.menu_templates` — slug, name, sections (JSONB)
- `website_builder.review_blocks` — slug, name, description, sections (JSONB)

**Patterns to follow:**
- Structural analysis already fetches `postTypes` and `existingMenus` — follow that same pattern for templates
- Templates are scoped to `template_id` (from project), not `project_id`

**Key decisions already made:**
- No "confirm" status — use `manual_action: true` in target_meta instead
- No frontend changes — the visual distinction (if desired later) can read from target_meta
- Templates are fetched once per batch, not per-section

## Constraints

**Must:**
- Only fetch templates when the project has a `template_id`
- Pass template data into both the per-section Analysis calls AND the Structural analysis call
- Include template slug, name, description, and which post_type it serves (for post_blocks)
- Analysis.md must instruct the LLM to use exact slugs from the provided list

**Must not:**
- Don't modify frontend
- Don't modify DB schema
- Don't fetch template HTML sections content (too verbose) — just metadata (slug, name, description, post_type)
- Don't change the shortcode resolver or rendering logic

**Out of scope:**
- Menu template rendering ({{ menu template='...' }} is parsed but not yet applied in shortcode resolver)
- Creating templates automatically
- Frontend UI for manual_action items

## Risk

**Level:** 1

**Risks identified:**
- Slightly increased context size per analysis call → **Mitigation:** Template metadata is small (~50-200 chars per template). Typical project has 3-8 templates. Negligible token impact.

## Tasks

### T1: Add helper to fetch template metadata for a project
**Do:** In `service.ai-command.ts`, add a function `getProjectTemplates(templateId: string)` that returns:
```typescript
interface ProjectTemplates {
  postBlocks: Array<{ slug: string; name: string; description: string | null; postTypeSlug: string }>;
  menuTemplates: Array<{ slug: string; name: string }>;
  reviewBlocks: Array<{ slug: string; name: string; description: string | null }>;
}
```

Query:
1. `post_blocks` joined with `post_types` to get `postTypeSlug` — `WHERE template_id = ?`
2. `menu_templates` — `WHERE template_id = ?`
3. `review_blocks` — `WHERE template_id = ?`

Return empty arrays if `templateId` is falsy.

**Files:** `src/controllers/admin-websites/feature-services/service.ai-command.ts`
**Verify:** `npx tsc --noEmit` passes.

### T2: Pass templates into per-section analysis calls
**Do:** In `analyzeBatch()`, after fetching the project (line ~90-93):
1. Call `const templates = await getProjectTemplates(project.template_id)`
2. Build a template context string:
```
## Available Shortcode Templates

### Post Block Templates (use with {{ post_block id='SLUG' items='POST_TYPE' }})
- benefits-grid (Benefits Grid) — renders 'benefits' posts — "Grid of benefit cards with icons"
- services-list (Services List) — renders 'services' posts — "Detailed service cards"

### Menu Templates (use with {{ menu id='MENU_SLUG' template='TEMPLATE_SLUG' }})
- main-nav (Main Navigation)
- footer-nav (Footer Navigation)

### Review Block Templates (use with {{ review_block id='SLUG' }})
- review-grid (Review Grid) — "3-column grid of Google reviews"
- review-carousel (Review Carousel) — "Sliding carousel of reviews"
```
3. Append this context string to the `prompt` (user's checklist) when calling `analyzeHtmlContent()` for layouts, pages, and posts

**Files:** `src/controllers/admin-websites/feature-services/service.ai-command.ts`
**Verify:** `npx tsc --noEmit` passes. Console log shows template context being built.

### T3: Pass templates into structural analysis
**Do:** In `analyzeBatch()`, pass the template context into `analyzeForStructuralChanges()`:
1. Add `templateContext: string` to the params of `analyzeForStructuralChanges`
2. Append the template context to the prompt in each of the 3 parallel focused calls
3. Update the types in `aiCommandService.ts` accordingly

**Files:** `src/utils/website-utils/aiCommandService.ts`, `src/controllers/admin-websites/feature-services/service.ai-command.ts`
**Verify:** `npx tsc --noEmit` passes.

### T4: Update Analysis.md — instruct LLM to use real template slugs
**Do:** Update the shortcode reference section in Analysis.md:
1. Replace the generic shortcode examples with:
```markdown
**Post blocks render posts dynamically via shortcodes:**
- {{ post_block id='SLUG' items='POST_TYPE_SLUG' limit='10' }} — SLUG must be from the Available Post Block Templates list
- If no suitable post_block template exists for the content type, set manual_action: true in your recommendation and say "No post_block template exists for [type] — create one before executing"

**Menus are rendered via shortcodes:**
- {{ menu id='MENU_SLUG' }} or {{ menu id='MENU_SLUG' template='TEMPLATE_SLUG' }}
- MENU_SLUG is the menu's slug (from Existing Menus list). TEMPLATE_SLUG must be from Available Menu Templates list.
- If recommending a menu shortcode with a specific visual template, reference an existing template slug

**Review blocks render Google reviews dynamically:**
- {{ review_block id='SLUG' }} — SLUG must be from the Available Review Block Templates list
- If you see hardcoded testimonials/reviews in HTML, recommend replacing with a review_block shortcode

**When no template exists:**
- If the content needs a shortcode but no suitable template exists in the provided lists, still recommend the shortcode replacement
- Add this note in the recommendation: "MANUAL: Create a [type] template for [purpose] before executing this change"
- The instruction should still describe the desired shortcode, e.g., "Replace hardcoded grid with {{ post_block id='TBD' items='services' }}"
```

**Files:** `src/agents/websiteAgents/aiCommand/Analysis.md`
**Verify:** Read the file. Confirm it references "Available Post Block Templates", "Available Menu Templates", "Available Review Block Templates" — matching the context injected in T2.

### T5: Update Structural.md — reference templates for new content
**Do:** Add to Structural.md, in the architecture section:
```markdown
**Shortcode templates available for this project are provided in context.**
When recommending new pages that should display posts/reviews, note which post_block or review_block template to use in the page's sections.
When recommending new menus, note which menu template to use if a styled menu is needed.
If no suitable template exists, note it in the recommendation so the user knows to create one first.
```

**Files:** `src/agents/websiteAgents/aiCommand/Structural.md`
**Verify:** Read the file.

## Done
- [ ] `npx tsc --noEmit` passes
- [ ] `getProjectTemplates()` function exists and returns post_blocks, menu_templates, review_blocks metadata
- [ ] Template context is appended to every `analyzeHtmlContent()` call during batch analysis
- [ ] Template context is passed to `analyzeForStructuralChanges()`
- [ ] Analysis.md references "Available Post Block/Menu/Review Block Templates" with usage instructions
- [ ] Structural.md mentions template awareness
- [ ] Manual: Run AI Command on a project with post_blocks — confirm recommendations reference real template slugs in shortcode instructions
- [ ] Manual: On a project missing a template type — confirm recommendation says "MANUAL: Create a template"
