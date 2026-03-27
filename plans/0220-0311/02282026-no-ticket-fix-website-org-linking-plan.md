# Fix Website-Organization Linking & Attach Website from Org Tab

**Date:** 02/28/2026
**Ticket:** no-ticket
**Tier:** Minor Change

---

## Problem Statement

Two issues in the admin dashboard:

1. **Website Detail → Link Organization dropdown shows "No available DFY organizations"** — The frontend filters organizations by `subscription_tier === "DFY"`, but existing orgs defaulted to `DWY` when the subscription tier migration ran. Since all clients are DFY at this point, this filter blocks all linking.

2. **Organization Detail has no way to attach an existing unlinked website** — The page only has a "Create Project" button. There's no UI to select from existing websites that have no organization attached.

---

## Context Summary

- **Frontend filter:** `WebsiteDetail.tsx:238-243` — filters `org.subscription_tier === "DFY"` before showing in dropdown
- **Backend validation:** `service.project-manager.ts:231-240` — rejects linking if org is not DFY tier
- **OrganizationDetail.tsx:505-521** — only has "Create Project" button, no "attach existing" flow
- **Backend already supports** `linkWebsiteToOrganization` via `PATCH /:id/link-organization`
- **1:1 constraint enforced** — each org can only have one website, each website one org (unique index on `organization_id`)

---

## Existing Patterns to Follow

- Organization dropdown in `WebsiteDetail.tsx` uses `loadDFYOrganizations()` callback pattern with state: `dfyOrganizations`, `loadingOrgs`
- Org detail actions sit in the action buttons bar alongside "Create Project" button
- Backend controller delegates to `service.project-manager.ts` for linking logic
- Toast notifications for success/error on admin actions

---

## Proposed Approach

### Change 1: Remove DFY filter from website linking

**Frontend (`WebsiteDetail.tsx`):**
- Remove `org.subscription_tier === "DFY"` from the filter at line 241
- Keep the `!org.website || org.id === website?.organization?.id` check (still need to exclude orgs that already have a website)
- Rename `loadDFYOrganizations` → `loadAvailableOrganizations` and `dfyOrganizations` → `availableOrganizations` for clarity
- Update the empty state message from "No available DFY organizations" to "No available organizations"

**Backend (`service.project-manager.ts`):**
- Remove the DFY tier validation at lines 231-240 that rejects non-DFY orgs
- Keep all other validations (org exists, org not already linked to another website, etc.)

**Frontend API note:** The `listAll` query in `OrganizationModel.ts:69-71` already returns `subscription_tier` in select — no change needed there. The enrichment endpoint already returns the `website` field via enrichment, so the filter `!org.website` will continue working.

### Change 2: Add "Attach Existing Website" to OrganizationDetail

**Frontend (`OrganizationDetail.tsx`):**
- When `!org.website`, add an "Attach Website" button next to "Create Project"
- On click, fetch unlinked websites via the existing `GET /api/admin/websites` endpoint (filter client-side for `organization_id === null`)
- Show a dropdown/modal listing unlinked websites by hostname
- On selection, call `linkWebsiteToOrganization(websiteId, org.id)` (existing API function)
- Reload org data on success

**Backend:** No changes needed — the `PATCH /api/admin/websites/:id/link-organization` endpoint already handles this. We just need the frontend to call it from the org side.

---

## Risk Analysis

**Level 1 — Low Risk**

- Removing the DFY filter is safe because: all clients are DFY, the tier distinction is not used for anything else in the linking flow, and the 1:1 unique constraint still prevents double-linking
- Adding the attach UI reuses existing backend endpoints — no new API surface
- No migration needed
- No breaking changes to existing linked websites

---

## Definition of Done

- [x] Clicking the organization dropdown on a website detail page shows all orgs without websites (not just DFY)
- [x] Backend no longer rejects linking for non-DFY orgs
- [x] Empty state message updated (no "DFY" reference)
- [x] Organization detail page shows "Attach Website" option when org has no website
- [x] Attaching an existing website from org detail works end-to-end
- [x] Existing linked websites are unaffected
- [x] TypeScript compiles clean (frontend + backend)
