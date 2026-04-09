# Submissions Dashboard Visibility

## Why
Form submissions are buried behind Websites tab > Submissions sub-tab. Users don't see new leads unless they actively navigate there. This makes the most actionable data in the product invisible from the main dashboard.

## What
1. Replace the "New Starts" MetricCard with a "Form Submissions" card showing verified count (big number), flagged count (subtext), unread count (subtext). Clicking it navigates to `/dfy/website` with submissions tab active.
2. Add unread indicator (orange ping dot) to the "Websites" sidebar nav item when unread submissions exist.
3. Auto-mark all submissions as read when the user opens the submissions list.
4. Replace the inline expand detail panel with an animated modal/popup overlay when clicking a submission item.

## Context

**Relevant files:**
- `frontend/src/components/dashboard/DashboardOverview.tsx` — MetricCard component and "New Starts" card (lines 77-127, 943-954)
- `frontend/src/components/Sidebar.tsx` — NavItem with existing `hasNotification` pattern (lines 54-127, 502-514)
- `frontend/src/pages/DFYWebsite.tsx` — Websites page, `activeView` state, `FormSubmissionsTab` mount (lines 97, 1156)
- `frontend/src/components/Admin/FormSubmissionsTab.tsx` — Submissions list component, `load()` callback (lines 103-125), current detail panel is inline AnimatePresence expand (lines 527-584)
- `src/routes/user/website.ts` — User website routes (no submissions count endpoint exists)
- `src/controllers/user-website/UserWebsiteController.ts` — `listFormSubmissions` (lines 336-390)
- `src/models/website-builder/FormSubmissionModel.ts` — `countUnreadByProjectId`, `countVerifiedByProjectId`, etc.

**Patterns to follow:**
- Sidebar notification indicator: see `loadNotificationCount` + `hasNotification` prop on Notifications NavItem (Sidebar.tsx lines 194-216, 525-535)
- Dashboard MetricCard: existing component at DashboardOverview.tsx line 77
- User API wrappers in DFYWebsite.tsx (lines 261-290) — `apiGet`/`apiPatch` pattern

**Reference file:** `Sidebar.tsx` notification polling pattern for sidebar indicator. `DashboardOverview.tsx` MetricCard for dashboard card.

## Constraints

**Must:**
- Only show submissions card on dashboard if org has a website (`hasWebsite` equivalent check)
- Sidebar indicator follows same conditional: only when `hasWebsite` is true
- Mark-all-read fires on submissions list mount, not on individual page loads
- Use existing `FormSubmissionModel` count methods on backend
- Dashboard card must show current-month verified count (need backend support for date-filtered count)

**Must not:**
- Remove other MetricCards (Referrals, Production, Market Coverage)
- Modify the admin-side dashboard or admin routes
- Change `FormSubmissionsTab` behavior for admin users
- Add polling for dashboard card data (fetched once on dashboard mount, like PMS data)

**Out of scope:**
- Real-time websocket push for new submissions
- Submission notification system (email/push when new submission arrives)
- Any changes to how submissions are collected

## Risk

**Level:** 1

**Risks identified:**
- "New Starts" card removal could confuse users who track self-referrals on dashboard → **Mitigation:** This is a product decision, already confirmed by Dave. New Starts data still accessible in Referrals Hub.
- Mark-all-read on list open marks submissions user hasn't scrolled to → **Mitigation:** Accepted tradeoff. For dental practices, opening the list = "I'm checking leads." Simpler UX wins.
- Dashboard card needs a new lightweight API endpoint for counts → **Mitigation:** Simple endpoint, reuses existing model methods.

**Blast radius:** DashboardOverview (dashboard page), Sidebar (all pages), DFYWebsite (submissions page), new backend endpoint.

## Tasks

### T1: Backend — Add submission stats endpoint for user portal
**Do:** Add `GET /api/user/website/form-submissions/stats` endpoint returning `{ unreadCount, flaggedCount, verifiedCount }`. Also add `markAllAsReadByProjectId` method to `FormSubmissionModel`.
**Files:** `src/routes/user/website.ts`, `src/controllers/user-website/UserWebsiteController.ts`, `src/models/website-builder/FormSubmissionModel.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit`

### T2: Backend — Add mark-all-as-read endpoint for user portal
**Do:** Add `PATCH /api/user/website/form-submissions/mark-all-read` endpoint that calls `FormSubmissionModel.markAllAsReadByProjectId(projectId)`. 
**Files:** `src/routes/user/website.ts`, `src/controllers/user-website/UserWebsiteController.ts`
**Depends on:** T1 (model method)
**Verify:** `npx tsc --noEmit`

### T3: Frontend — Replace "New Starts" card with submissions card
**Do:** In `DashboardOverview.tsx`, add a new API call to fetch submission stats (only if org has website). Replace the "New Starts" MetricCard with a clickable submissions card showing: verified count (big number), flagged + unread as subtext. Click navigates to `/dfy/website?view=submissions`.
**Files:** `frontend/src/components/dashboard/DashboardOverview.tsx`
**Depends on:** T1
**Verify:** Manual: dashboard shows submissions card with correct counts, click navigates to submissions

### T4: Frontend — Sidebar unread indicator on Websites nav
**Do:** In `Sidebar.tsx`, fetch unread submission count via the new stats endpoint (same pattern as `loadNotificationCount`). Pass `hasNotification={unreadSubmissionCount > 0}` to the Websites NavItem. Poll on reasonable interval (30s — submissions are less urgent than notifications).
**Files:** `frontend/src/components/Sidebar.tsx`
**Depends on:** T1
**Verify:** Manual: orange ping dot appears on Websites nav when unread submissions exist, disappears when all read

### T5: Frontend — Auto-mark-all-read on submissions list open
**Do:** In `DFYWebsite.tsx`, when `activeView` switches to `"submissions"`, fire `PATCH /api/user/website/form-submissions/mark-all-read`. Dispatch `submissions:updated` custom event so sidebar indicator refreshes. In `FormSubmissionsTab`, after mark-all fires, reload the list to reflect updated read states.
**Files:** `frontend/src/pages/DFYWebsite.tsx`, `frontend/src/components/Sidebar.tsx` (listen for event)
**Depends on:** T2, T4
**Verify:** Manual: open submissions tab → all marked read → sidebar dot disappears

### T6: Frontend — Submission detail as animated modal instead of inline expand
**Do:** In `FormSubmissionsTab.tsx`, replace the current `AnimatePresence` inline expand (lines 527-584) with a modal overlay. The modal should:
- Use framer-motion for entrance/exit (fade backdrop + scale/slide-up content)
- Show the same detail content (form name, timestamp, recipients, flag reason, sections/flat view, file previews)
- Include close button (X) and click-outside-to-close
- Keep the same action buttons (send to recipients for flagged, close)
- Be a contained overlay within the submissions panel, not a full-page modal — keeps context of the list visible behind a semi-transparent backdrop
- Existing `handleSelect` logic stays the same (marks as read, fetches file URLs if needed)
**Files:** `frontend/src/components/Admin/FormSubmissionsTab.tsx`
**Depends on:** none
**Verify:** Manual: click submission → modal appears with smooth animation → close via X or backdrop click

## Done
- [ ] `npx tsc --noEmit` — zero errors
- [ ] `GET /api/user/website/form-submissions/stats` returns correct counts
- [ ] `PATCH /api/user/website/form-submissions/mark-all-read` marks all project submissions read
- [ ] Dashboard: submissions card visible (only when org has website), shows correct counts
- [ ] Dashboard: clicking submissions card navigates to website tab with submissions view active
- [ ] Sidebar: orange dot on Websites nav when unread submissions > 0
- [ ] Sidebar: dot disappears after submissions list is opened
- [ ] Submission detail opens as animated modal overlay, not inline expand
- [ ] Modal closes on X click and backdrop click
- [ ] No regressions in existing submission list behavior (admin or user)
