# SEO Data Version Propagation & Backfill

**Date:** 2026-03-10
**Ticket:** no-ticket
**Tier:** Structural Feature

---

## Problem Statement

SEO data is siloed on individual page versions. Bulk SEO generation targets the highest version number (often an inactive version), and single-page SEO updates only write to one row. The result: the page list shows score 77 (from an old inactive version with seo_data) while the editor shows 15 (the current draft has null seo_data). The public renderer queries `status='published'` — if that row has no seo_data, zero SEO tags are served.

---

## Context Summary

### Prior Fix (Already Executed)
Plan `03102026-no-ticket-fix-seo-data-lost-on-draft-creation-plan.md` fixed `createDraft` to copy `seo_data` from published → new draft. This works going forward but does NOT fix:
- Bulk SEO targeting the wrong version
- SEO updates not propagating to sibling versions
- Existing data inconsistency across 17+ versions per page
- Misleading list view scores

### SEO Write Paths (3 total)
1. **`updatePageSeo`** (`service.page-editor.ts:600-634`) — single page, writes to one row
2. **Bulk SEO processor** (`seoBulkGenerate.processor.ts:108`) — writes to one row per entity
3. **`createDraft`** (`service.page-editor.ts:437-444`) — copies from published → new draft (already fixed)

### Bulk SEO Entity Selection Bug
`seoBulkGenerate.processor.ts:147-178` — `getPageEntities()`:
```sql
SELECT * FROM pages WHERE project_id = ? ORDER BY path ASC, version DESC
```
Takes first per path = highest version number. With 17 versions, this could be an inactive version. SEO data lands on a version the renderer never serves.

### List View Score Bug
`WebsiteDetail.tsx:1838`:
```typescript
const seoPage = group.pages.find((p) => p.seo_data && p.seo_data.meta_title) || displayPage;
```
Finds ANY version with seo_data. Misleading — shows score from a version you'll never edit or serve.

### Renderer Behavior (Correct — No Changes Needed)
`website-builder-rebuild` queries `status='published'` and injects `seo_data` from that row. If null, no SEO tags are injected. The renderer is correct — the data just needs to be there.

---

## Existing Patterns to Follow

- `seo_data` is JSONB, serialized with `JSON.stringify()` on write, auto-parsed by pg driver on read
- Sibling version queries use `{ project_id, path }` as the grouping key
- `createDraft` already copies seo_data (prior fix)

---

## Proposed Approach

### 1. Add `propagateSeoToSiblings` helper (`service.page-editor.ts`)

New function that, given a page's `project_id`, `path`, and `seo_data`, updates ALL other versions of the same path that have null or empty seo_data.

```typescript
async function propagateSeoToSiblings(
  projectId: string,
  path: string,
  seoData: Record<string, unknown>,
  excludePageId?: string
): Promise<void>
```

- Writes to all versions of the same `(project_id, path)` where `seo_data IS NULL`
- Excludes the source page ID (already has the data)
- Does NOT overwrite existing seo_data (additive only)
- Logs how many rows were updated

### 2. Call propagation from `updatePageSeo` (`service.page-editor.ts:600-634`)

After the existing single-row update succeeds, call `propagateSeoToSiblings` with the updated seo_data. This ensures manual SEO edits in the editor propagate to published + inactive versions.

### 3. Call propagation from bulk SEO save (`seoBulkGenerate.processor.ts:108-111`)

After saving seo_data to the selected entity, call `propagateSeoToSiblings`. This ensures bulk generation populates all versions.

### 4. Fix `getPageEntities` to target published version (`seoBulkGenerate.processor.ts:147-178`)

Change entity selection logic:
- For each path, prefer `status='published'`
- Fallback to `status='draft'`
- Fallback to highest version
- This ensures bulk SEO generates content from the version that's actually served

### 5. Fix list view score to use `displayPage` (`WebsiteDetail.tsx:1838`)

Change from scanning all versions to using `displayPage` (which is `publishedPage || latestPage`). After the backfill, displayPage will always have seo_data if any version does. This makes the list score match what you'd see in the editor.

### 6. One-time backfill migration

New migration: for each `(project_id, path)` group, find the version with the best seo_data (prefer published, then highest version with data), and copy it to all other versions of the same path where seo_data is null.

- Additive only — never overwrites existing seo_data
- No schema changes — just data updates
- No row deletions

---

## Risk Analysis

| Risk | Level | Mitigation |
|------|-------|------------|
| Backfill writes to many rows | Level 1 | Additive only (WHERE seo_data IS NULL). No overwrites. Reversible by setting back to null if needed. |
| Propagation on every SEO save adds latency | Level 1 | Single UPDATE query with WHERE clause. Negligible for typical page count per path (~5-20 versions). |
| Bulk SEO targeting published changes generation content | Level 1 | Published version has the content that's actually served. More correct than generating from an inactive version. Draft fallback preserves behavior when no published exists. |
| Double-stringify risk on propagation | Level 1 | Same pattern as existing `updatePageSeo` — `JSON.stringify(seoData)`. Pg driver auto-parses JSONB on read. |

---

## Blast Radius Analysis

- **Backend files modified:** 2
  - `signalsai-backend/src/controllers/admin-websites/feature-services/service.page-editor.ts` (add helper + call from updatePageSeo)
  - `signalsai-backend/src/workers/processors/seoBulkGenerate.processor.ts` (fix getPageEntities + add propagation)
- **Frontend files modified:** 1
  - `signalsai/src/pages/admin/WebsiteDetail.tsx` (list view score display)
- **Migration files added:** 1
  - `signalsai-backend/src/database/migrations/YYYYMMDD_backfill_seo_data_across_versions.ts`
- **Renderer:** No changes needed
- **API contract:** No changes

---

## Definition of Done

- [x] `propagateSeoToSiblings` helper exists and is called from `updatePageSeo` and bulk SEO processor
- [x] `getPageEntities` prefers published version per path (fallback draft → highest)
- [x] List view SEO score uses `displayPage` instead of scanning all versions
- [x] Backfill migration copies best seo_data to all null-seo_data versions per path
- [x] Existing seo_data is never overwritten (additive only)
- [x] Published page row has seo_data after bulk generation (verified by renderer query)
- [x] `getAllSeoMeta` endpoint deduplicates pages by path (one entry per path, published preferred)
- [x] SeoPanel uniqueness filter excludes by path (not id) to prevent same-page version collisions
