# Artifact Page Update — Replace Build + Editor UI

## Why
Artifact pages can be created but not updated. Admins have to delete and re-create. The page editor also shows the sections editor for artifact pages, which doesn't apply.

## What
1. Backend endpoint to replace an artifact page's zip build
2. Page editor shows an upload zone for artifact pages instead of the sections editor

## Constraints
**Must:** Reuse existing upload/validation logic from service.artifact-upload.ts
**Must not:** Allow LLM editing, sections editor, or code view for artifact pages

## Risk
**Level:** 1 — Small, additive changes.

## Tasks

### T1: Backend — PUT endpoint to replace artifact build
**Do:** Add `PUT /:id/pages/:pageId/artifact` that accepts a new zip, validates base path, re-uploads to S3 (same prefix), returns updated page
**Files:** routes/admin/websites.ts, AdminWebsitesController.ts, service.artifact-upload.ts
**Verify:** curl upload replaces files

### T2: Frontend — update types + API call
**Do:** Add `page_type` and `artifact_s3_prefix` to WebsitePage interface. Add `replaceArtifactBuild()` API function.
**Files:** frontend/src/api/websites.ts
**Verify:** tsc passes

### T3: Frontend — artifact page editor view
**Do:** When PageEditor loads an artifact page, show a dedicated artifact view instead of sections editor. Upload zone, page info, SEO tab still works.
**Files:** frontend/src/pages/admin/PageEditor.tsx
**Verify:** Manual: open artifact page in editor, see upload UI

## Done
- [ ] tsc --noEmit passes
- [ ] Manual: upload replacement zip via editor, page serves new build
