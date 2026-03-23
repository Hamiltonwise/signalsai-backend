# Fix SEO Data Lost When Creating Page Draft

**Date:** 2026-03-10
**Ticket:** no-ticket
**Tier:** Minor Change

---

## Problem Statement

When viewing the website page list (WebsiteDetail), SEO scores display correctly — the list searches all page versions to find one with `seo_data` populated. However, when opening an individual page for editing, the SEO form (SeoPanel) shows empty because the draft creation process does not copy `seo_data` from the published page.

The `seo_data` column was added via migration `20260308000001_add_seo_and_business_data.ts`. The `createDraft` function in `service.page-editor.ts` was never updated to include this new column.

---

## Context Summary

### Data Flow — Why the List Works

`WebsiteDetail.tsx:1838`:
```typescript
const seoPage = group.pages.find((p) => p.seo_data && p.seo_data.meta_title) || displayPage;
const seoScore = computeSeoScore(seoPage.seo_data, ...);
```

The list searches ALL versions (published + drafts) for the best `seo_data`. The published page has it → score displays.

### Data Flow — Why the Editor Breaks

`PageEditor.tsx:174-180`:
```typescript
if (pageData.status === "published") {
  const draftResponse = await createDraftFromPage(projectId, pageId);
  workingPage = draftResponse.data;  // draft has seo_data: null
}
setPage(workingPage);
```

Then `PageEditor.tsx:794`:
```typescript
seoData={page.seo_data}  // null → SeoPanel shows empty form
```

### Bug Location 1 — New Draft Creation

`service.page-editor.ts:436-444`:
```typescript
const [draftPage] = await db(PAGES_TABLE)
  .insert({
    project_id: projectId,
    path: sourcePage.path,
    version: newVersion,
    status: "draft",
    sections: JSON.stringify(normalizeSections(sourcePage.sections)),
    // MISSING: seo_data is not copied from sourcePage
  })
  .returning("*");
```

### Bug Location 2 — Stale Draft Refresh

`service.page-editor.ts:409-416`:
```typescript
const [refreshedDraft] = await db(PAGES_TABLE)
  .where("id", existingDraft.id)
  .update({
    sections: JSON.stringify(normalizeSections(sourcePage.sections)),
    edit_chat_history: JSON.stringify({}),
    updated_at: db.fn.now(),
    // MISSING: seo_data is not synced from published version
  })
  .returning("*");
```

### Posts — Likely Not Affected

Posts do NOT use a draft system. The PostsTab component reads `seo_data` directly from the post object in memory (same object used for list display and editor). If the list shows a score, the editor receives the same data. If posts appear empty in the SEO form, it's because SEO hasn't been generated for them yet — not a data flow bug.

---

## Existing Patterns to Follow

- `sections` is already copied from `sourcePage.sections` during draft creation (line 442)
- `seo_data` is JSONB in the database, same as `sections`
- Other JSONB fields in inserts are stringified: `JSON.stringify(...)`

---

## Proposed Approach

### 1. Fix Draft Creation Insert (`service.page-editor.ts:436-444`)

Add `seo_data` to the insert statement, copying from the source published page:

```typescript
const [draftPage] = await db(PAGES_TABLE)
  .insert({
    project_id: projectId,
    path: sourcePage.path,
    version: newVersion,
    status: "draft",
    sections: JSON.stringify(normalizeSections(sourcePage.sections)),
    seo_data: sourcePage.seo_data ? JSON.stringify(sourcePage.seo_data) : null,
  })
  .returning("*");
```

### 2. Fix Stale Draft Refresh (`service.page-editor.ts:409-416`)

Add `seo_data` to the update statement so stale drafts pick up any SEO changes made to the published version:

```typescript
const [refreshedDraft] = await db(PAGES_TABLE)
  .where("id", existingDraft.id)
  .update({
    sections: JSON.stringify(normalizeSections(sourcePage.sections)),
    seo_data: sourcePage.seo_data ? JSON.stringify(sourcePage.seo_data) : null,
    edit_chat_history: JSON.stringify({}),
    updated_at: db.fn.now(),
  })
  .returning("*");
```

---

## Risk Analysis

| Risk | Level | Mitigation |
|------|-------|------------|
| `seo_data` might already be a string from Knex JSONB read | Level 1 | Check if Knex auto-parses JSONB. If `sourcePage.seo_data` is already an object, `JSON.stringify` is correct. If it's already a string, double-stringify would corrupt it. Need to verify the Knex behavior for this table/column. |
| Existing drafts without `seo_data` remain empty | Level 1 | Only affects drafts created before this fix. Re-opening the page will trigger stale draft refresh (published `updated_at` > draft `created_at`), which now copies `seo_data`. Self-healing. |
| `seo_data` on published page is null | Level 1 | The ternary handles this: `sourcePage.seo_data ? JSON.stringify(...) : null`. |

---

## Blast Radius Analysis

- **Files modified:** 1
  - `signalsai-backend/src/controllers/admin-websites/feature-services/service.page-editor.ts` (2 statements)
- **Frontend:** None — SeoPanel already handles `seoData` prop correctly when non-null
- **Database:** None — column already exists
- **API contract:** No changes — `seo_data` already returned in page responses

---

## Definition of Done

- [x] `createDraft` copies `seo_data` from published source page to new draft
- [x] Stale draft refresh syncs `seo_data` from published version
- [x] Opening a page with SEO data shows populated SeoPanel form fields
- [x] JSONB serialization verified — matches existing `sections` pattern (`JSON.stringify` on write, Knex auto-parses on read)
