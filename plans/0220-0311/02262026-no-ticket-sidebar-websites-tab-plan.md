# Sidebar Websites Tab

**Date:** 02/26/2026
**Ticket:** no-ticket
**Tier:** Minor Change

---

## Problem Statement

The website editor is currently accessible only via the existing DFY routing (`/dfy/website`). There is no dedicated top-level sidebar navigation item for it. We need a visible "Websites" tab in the sidebar that:

- Is visible **only** for DFY organizations
- Is **completely hidden** for DWY organizations
- Routes to the existing website editor
- Respects the lockout state (hidden when locked out, per Ticket D)

---

## Context Summary

### Current Sidebar Structure
**File:** `signalsai/src/components/Sidebar.tsx`

Sidebar sections:
1. **Operations:** Practice Hub, Referrals Hub, Local Rankings
2. **Done For You:** Website (conditionally shown if DFY tier)
3. **Execution:** To-Do List, Notifications
4. **Support:** Help Center

The "Done For You" section already exists and conditionally renders a "Website" item based on subscription tier. The sidebar checks the user's DFY status via an API call to `/api/user/website`.

### Current DFY Sidebar Logic
The sidebar already has conditional logic:
- If org has DFY tier → "Done For You" section shows with "Website" nav item
- If org does not have DFY → section is hidden
- `NavItem` component supports `isLocked` prop for locked states

### Current Route
- `/dfy/website` → protected by `DFYRoute` component → renders website editor
- `DFYRoute.tsx` checks `GET /api/user/website` → 403 redirects to dashboard

### What Needs to Change
Based on the user's request, rename the section/item to just "Websites" as a top-level tab rather than under a "Done For You" group. Ensure it:
- Is hidden for DWY (not locked, not greyed out — fully hidden)
- Works with the existing `/dfy/website` route and `DFYRoute` guard
- Respects lockout state from Ticket D

---

## Existing Patterns to Follow

1. **NavItem component:** Takes `icon`, `label`, `href`, `isActive`, `isLocked`, `onClick` props
2. **Section grouping:** Sidebar groups items under section headers with `text-xs uppercase tracking-wider` styling
3. **Conditional rendering:** Existing pattern uses state variables to show/hide sections
4. **Active state:** Determined by `location.pathname` matching the nav item's `href`

---

## Proposed Approach

### 1. Sidebar Modification

**Modify:** `signalsai/src/components/Sidebar.tsx`

**Current "Done For You" section:**
The section is already conditionally rendered for DFY orgs. The changes are:

- Rename the section header from "Done For You" to remove the section header entirely — "Websites" becomes a standalone top-level nav item, not grouped under a section label
- OR: keep the section header as "Done For You" if that's the existing visual pattern and just ensure the "Website" item label reads "Websites" (plural)

**Decision: Make "Websites" a standalone top-level nav item.** No section header wrapper. Positioned between Operations and Execution sections. This matches the user's request for a clean, first-class tab.

**Visibility rules:**
```
if (subscriptionTier === 'DFY' && !isLockedOut) → show "Websites" nav item
else → hide completely (not rendered in DOM)
```

### 2. Lockout Integration

When Ticket D is implemented, the sidebar receives `isLockedOut` from `billingStatus` in auth context.

If locked out → "Websites" tab is hidden (along with everything else except profile).

If Ticket D is not yet implemented, the existing behavior works — DFY check handles visibility.

### 3. Route — No Change Needed

The existing route `/dfy/website` + `DFYRoute` guard works as-is. The sidebar nav item just points to this route. No new routes needed.

If in the future the route path should change from `/dfy/website` to `/websites`, that's a cosmetic rename — out of scope for this ticket.

---

## Risk Analysis

| Risk | Level | Mitigation |
|------|-------|------------|
| Breaking existing sidebar layout | Level 1 | Minimal change — moving one nav item from section group to standalone. Test on desktop and mobile. |
| DWY users somehow seeing the tab | Level 1 | Conditional rendering based on `subscriptionTier` — same check that already works for the "Done For You" section. |

---

## Definition of Done

- [ ] "Websites" nav item is a top-level sidebar item (not under a section header)
- [ ] Only visible when org has DFY tier
- [ ] Completely hidden (not in DOM) for DWY orgs
- [ ] Points to existing `/dfy/website` route
- [ ] Active state highlights correctly when on website editor page
- [ ] Respects lockout state (hidden when locked out) — if Ticket D is implemented
- [ ] Works on both desktop and mobile sidebar layouts

---

## Dependency Impact

- **No new dependencies**
- **No backend changes**
- **Modifies:** `Sidebar.tsx` only
- **Independent of Tickets A-D** — can be built in parallel. Lockout integration is additive (just checks an additional flag when Ticket D lands).

---

## Revision Log

### R1 — 02/27/2026 — Single Product Pivot (DWY removed)

**Summary:** DWY tier eliminated. All orgs are DFY. The Websites tab is now visible to ALL authenticated users (not just DFY), since everyone gets the full experience.

**Reason:** Single product model — no tier distinction.

**Changes to this plan:**
- `Sidebar.tsx` — remove `subscriptionTier === "DFY"` guard on Websites nav item. Show for all `onboardingCompleted` users.
- The DFY check in the sidebar's subscription tier fetch (`useEffect` that calls `/api/user/website`) can be simplified or removed.
- `DFYRoute.tsx` — may need relaxation since all orgs are effectively DFY. The route guard should check for project existence, not tier.

**Updated Definition of Done:**
- [x] All original items still complete
- [ ] Websites nav item visible for ALL authenticated users (DFY guard removed)
- [ ] Sidebar no longer fetches subscription tier for menu visibility
