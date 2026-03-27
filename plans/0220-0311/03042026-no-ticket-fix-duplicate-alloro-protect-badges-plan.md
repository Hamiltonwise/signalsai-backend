# Fix Duplicate "Powered by Alloro Protect" Badges

**Date:** 2026-03-04
**Ticket:** --no-ticket
**Status:** Executed

## Problem Statement

The "Powered by Alloro Protect" badge and honeypot inputs accumulate on every form each time a page is re-generated through the N8N pipeline. The deployment pipeline bakes `buildFormScript()` into the wrapper sent to N8N. N8N renders in a headless browser, the script executes, and the dynamically-added DOM elements (honeypot inputs + badges) get captured and persisted into section content in the DB. Each re-generation cycle stacks another layer. The renderer then adds one more at serve time.

## Context Summary

- **Two injection points**: `alloro-app` deployment pipeline (`service.deployment-pipeline.ts:175-182`) and `website-builder-rebuild` renderer (`renderer.ts:247-251`)
- **Identical `buildFormScript()`** exists in both codebases
- **N8N captures rendered DOM** including dynamically-added elements, persisting them to section content
- **Accumulation**: Each re-generation adds another honeypot + badge. Observed up to 7 duplicates on a single form.
- **Renderer has dedup check** (`finalHtml.includes('data-alloro-form-handler')`) — works correctly, only adds one script tag
- The renderer in `website-builder-rebuild` is the correct single authority for runtime form script injection

## Existing Patterns to Follow

- DB migrations in alloro-app use Knex: `src/database/migrations/`
- Migration naming: `YYYYMMDD######_description.ts`

## Proposed Approach

### Step 1: Remove `buildFormScript` from deployment pipeline (alloro-app)

**File:** `signalsai-backend/src/controllers/admin-websites/feature-services/service.deployment-pipeline.ts`

- Remove import of `buildFormScript` (line 11)
- Remove lines 175-182 (form script injection into wrapper)
- Pass `template.wrapper` directly as `templateData.wrapper` instead of `wrapperWithForms`

### Step 2: Delete unused `formScript.ts` from alloro-app

**File:** `signalsai-backend/src/utils/website-utils/formScript.ts`

- Only imported by `service.deployment-pipeline.ts` — safe to delete after Step 1

### Step 3: DB migration to clean existing data (alloro-app)

Create migration to:
1. Strip baked-in honeypot inputs (`<input type="text" name="website_url" tabindex="-1" ...>`) from all section content in `website_builder.pages`
2. Strip baked-in badge elements (`<a href="https://getalloro.com/alloro-protect" ...>...</a>`) from all section content
3. Strip baked-in `<script data-alloro-form-handler>...</script>` blocks from all `website_builder.projects.wrapper` fields

### Step 4: Simplify renderer dedup comment (website-builder-rebuild)

**File:** `src/utils/renderer.ts`

- Update comment on line 246 to reflect that the pipeline no longer bakes the script in
- Keep the dedup check as a safety net

## Risk Analysis

- **Level 1 — Low risk**
- Removing pipeline injection has zero downside — N8N doesn't need functional forms during generation
- Renderer already handles injection correctly at serve time
- DB migration is data cleanup only — strips junk HTML, doesn't alter structure
- Existing sites continue working: renderer injects the form script at serve time regardless

## Definition of Done

- [x] `buildFormScript` removed from deployment pipeline
- [x] `formScript.ts` deleted from alloro-app
- [x] DB migration created to clean accumulated honeypots, badges, and baked-in scripts
- [x] Renderer updated with `stripFormArtifacts()` — strips honeypots and badges from section/header/footer content at render time
- [x] Renderer strips baked-in `<script data-alloro-form-handler>` from wrapper before assembly
- [x] Renderer is now sole authority for form script injection (dedup check removed, always injects fresh)
- [ ] New page generations produce clean section HTML (no baked-in honeypots/badges) — verify after deploy
- [ ] Existing pages serve with exactly one badge per form — verify after restarting website-builder-rebuild

## Revision Log

**2026-03-04** — DB migration `20260304000001` ran but didn't clean data (regex/JSONB format mismatch). Added render-time stripping in `website-builder-rebuild/src/utils/renderer.ts` as defense-in-depth. This is more robust: works immediately for all data without needing a successful migration, and protects against future N8N leaks.
