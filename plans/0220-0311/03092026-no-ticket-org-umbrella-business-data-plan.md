# Organization Umbrella Business Data

**Date:** 03/09/2026
**Ticket:** no-ticket
**Status:** Complete

---

## Problem Statement

The org-level `organizations.business_data` field is never populated. It's used as fallback context for SEO generation on generic pages (homepage, etc.) when "Organization-wide" is selected in the SeoPanel location dropdown. Admin needs a way to populate and view this data.

## Context Summary

- `BusinessDataService.updateOrgBusinessData()` exists but has no admin UI trigger
- SEO generation's `fetchBusinessData()` already merges `organization.business_data` with primary location data
- SeoPanel already has "Organization-wide" option in location selector
- Location-level refresh from Google already works

## Existing Patterns to Follow

- Admin org routes use `superAdminMiddleware`
- OrgSettingsSection card pattern for business data display

## Proposed Approach

1. **Backend**: Add `POST /api/admin/organizations/:id/sync-org-business-data` — copies primary location's business data to the org record
2. **Frontend API**: Add `adminSyncOrgBusinessData(orgId)` function
3. **OrgSettingsSection**: Add an "Organization (Umbrella)" card above the location cards showing org-level business data with a "Sync from Primary Location" button and a "See More" button

## Risk Analysis

Level 1 — Additive, no breaking changes.

## Definition of Done

- [x] Org-level business data card shown in OrgSettingsSection
- [x] "Sync from Primary Location" button populates org.business_data from primary location
- [x] "See More" modal shows full org-level data
- [x] TypeScript compiles cleanly

---

## Revision Log

### R1 — 03/09/2026 — SEO Generation Enhancement: Mind Skills, Per-Section Actions, Insights

**Reason:** User wants richer SEO generation with per-section generate/analyze buttons, AI insights, and CroSEO mind skill context.

**Changes:**

#### 1. Backend — Mind Skill Integration in `service.seo-generation.ts`
- Add `fetchMindSkillContext()` — calls `https://app.getalloro.com/api/skills/seo-head-meta-tags-creator/portal` with `x-internal-key` header and fixed query. Cache result in-memory per process lifetime (it's a prompt template, not dynamic).
- Add `fetchMindSkillValidator()` — calls `https://app.getalloro.com/api/skills/seo-head-meta-tags-validator/portal` with same auth. Same caching strategy.
- Inject creator skill output into `buildSystemPrompt()` as additional context for generation.
- Inject validator skill output into a new `analyzeSeoForSection()` function.

#### 2. Backend — New Analyze Endpoint
- Add `analyzeSeoForSection()` in `service.seo-generation.ts` — takes existing SEO data, runs it through Claude with the validator mind skill context, returns `{ insight: string }` per section.
- Add `analyzePageSeo` / `analyzePostSeo` controller handlers.
- Add `POST /:id/pages/:pageId/seo/analyze` and `POST /:id/posts/:postId/seo/analyze` routes.

#### 3. Frontend API — `websites.ts`
- Add `analyzeSeo()` API function matching the new endpoint.

#### 4. Frontend — `SeoPanel.tsx`
- Add per-section "Generate" button in section header (next to section name/score).
- Add per-section "Analyze" button in section header.
- Add "Analyze All" button in header bar next to "Generate All".
- Add `handleGenerateSection(sectionKey)` — generates a single section.
- Add `handleAnalyzeSection(sectionKey)` and `handleAnalyzeAll()`.
- Add `sectionInsights` state: `Record<string, string>` — stores insight text per section key.
- Render insight text at the bottom of each section's content area.

#### 5. SeoData Type — `websites.ts`
- Add `insights?: Record<string, string> | null` to `SeoData` interface.
- Insights are saved alongside other SEO data in the same JSON column.

**Updated Definition of Done:**
- [x] Mind skill creator context injected into SEO generation prompts
- [x] Mind skill validator context used for analysis
- [x] Per-section "Generate" and "Analyze" buttons in SeoPanel
- [x] "Analyze All" button in header bar
- [x] Insights displayed at bottom of each section content
- [x] Insights persisted in `seo_data` JSON column
- [x] TypeScript compiles cleanly
