# Admin Stripe Cleanup & Organization Delete Enhancement

**Date:** 02/27/2026
**Ticket:** no-ticket
**Status:** Draft

---

## Problem Statement

The admin OrganizationDetail page is missing a "Remove Payment Method" action to detach Stripe billing from an organization. Additionally, the existing Delete Organization flow does not cancel Stripe subscriptions or clean up Stripe customers before cascade-deleting the DB row, leaving orphaned subscriptions running in Stripe.

---

## Context Summary

- **OrganizationDetail.tsx** already has: delete org button + confirmation modal, lockout/unlock, create project
- **AdminOrganizationsController.ts** has `deleteOrg` handler that delegates to `service.delete-organization.ts`
- **service.delete-organization.ts** handles Google OAuth revocation + cascade delete + orphaned user cleanup — but no Stripe cleanup
- **BillingService.ts** has no cancel/remove subscription function — only checkout creation, portal, status, and webhook handlers
- **Stripe fields on org:** `stripe_customer_id`, `stripe_subscription_id`, `subscription_status`, `subscription_tier`
- All FK relationships use CASCADE on delete — 11 dependent tables handled automatically

---

## Existing Patterns to Follow

- Admin controller handlers: validate org exists → perform action → return JSON response
- Frontend: state for loading + handler function + button in Subscription & Project section
- Danger Zone section for destructive actions with confirmation modals
- Toast notifications for success/error feedback
- API layer functions in `admin-organizations.ts` using `apiPost` / `apiDelete` helpers

---

## Proposed Approach

### 1. Backend: New "Remove Payment Method" Endpoint

**File:** `AdminOrganizationsController.ts`
**Route:** `POST /api/admin/organizations/:id/remove-payment-method`
**Auth:** Super admin only

Logic:
1. Find org by ID, validate it exists
2. Check `stripe_subscription_id` exists — if not, just clear the Stripe fields (idempotent)
3. If subscription exists: call `stripe.subscriptions.cancel(stripe_subscription_id)` — immediate cancellation
4. Clear org fields: `stripe_customer_id = null`, `stripe_subscription_id = null`, `subscription_status = 'active'`, `subscription_updated_at = now()`
5. This puts them back to **admin-granted state** (active, no Stripe, DFY)
6. Return success response

**Note:** We keep the Stripe customer object in Stripe (don't delete it) — it preserves payment history for accounting. We just sever the link from our DB.

### 2. Backend: Enhance Delete Organization with Stripe Cleanup

**File:** `service.delete-organization.ts`

Add Stripe cleanup before the existing cascade delete:
1. If org has `stripe_subscription_id`: cancel the subscription via Stripe API (best-effort, don't block on failure — same pattern as Google OAuth revocation)
2. If org has `stripe_customer_id`: optionally delete the customer in Stripe (or just cancel sub — TBD, leaning toward cancel-only to preserve Stripe-side records)
3. Then proceed with existing cascade delete logic

### 3. Frontend: "Remove Payment Method" Button

**File:** `OrganizationDetail.tsx`

Add in the Subscription & Project section (action buttons area):
- New button: "Remove Payment" — only visible when `org.stripe_customer_id` exists
- Styled as red outline (destructive action, same pattern as Lock Out button)
- Simple confirmation via `window.confirm()` — doesn't need the full modal treatment (not as destructive as full delete)
- Calls new API function
- On success: reload org data, show toast

**File:** `admin-organizations.ts` (API layer)
- New function: `adminRemovePaymentMethod(orgId: number)`
- POST to `/admin/organizations/${orgId}/remove-payment-method`

### 4. Frontend: Route Registration

**File:** `routes/admin/organizations.ts`
- Add `POST /:id/remove-payment-method` with auth + super admin middleware

---

## Risk Analysis

| Risk | Level | Mitigation |
|------|-------|------------|
| Stripe API call fails during remove | Level 1 | Best-effort with error handling — if Stripe fails, still clear DB fields so admin isn't stuck |
| Orphaned Stripe subscription after failed cancel | Level 1 | Log warning, admin can cancel manually via Stripe Dashboard |
| Accidental payment removal | Level 1 | Confirmation dialog prevents mis-clicks |
| Delete org with active Stripe sub | Level 2 | Enhanced delete now cancels sub first (best-effort) |

---

## Definition of Done

- [ ] `POST /api/admin/organizations/:id/remove-payment-method` endpoint works
- [ ] Endpoint cancels Stripe subscription and clears `stripe_customer_id`, `stripe_subscription_id` from org
- [ ] Org reverts to admin-granted state (`subscription_status: 'active'`, no Stripe IDs)
- [ ] "Remove Payment" button visible in OrganizationDetail when org has Stripe billing
- [ ] Button shows confirmation, calls endpoint, refreshes data on success
- [ ] Delete Organization now cancels Stripe subscription before cascade delete
- [ ] Both frontend and backend compile with zero errors

---

## Revision Log

### Rev 1 — 02/27/2026: DFYRoute + DFYWebsite fixes

**Reason:** DFYRoute loading state uses ugly spinner. DFYWebsite uses raw `fetch()` without JWT (auth bug). No empty state when pages array is empty.

**Changes:**
1. **DFYRoute.tsx** — Replace spinner loading state with skeleton card animation (matches app pattern)
2. **DFYWebsite.tsx** — Replace all raw `fetch()` calls with `apiGet`/`apiPost` (fixes 401 auth bug)
3. **DFYWebsite.tsx** — Add empty state when no pages exist (same pattern as RankingsDashboard empty state)
4. **DFYWebsite.tsx** — Replace loading spinner with skeleton cards
5. **DFYWebsite.tsx** — Add page dropdown selector at top of editor

**Updated Definition of Done:**
- [ ] DFYRoute loading uses skeleton cards (not spinner)
- [ ] DFYWebsite all API calls use authenticated axios (no raw fetch)
- [ ] DFYWebsite shows empty state when no pages (rankings-style)
- [ ] DFYWebsite loading uses skeleton cards
- [ ] Compiles clean
