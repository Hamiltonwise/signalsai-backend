# Plan 07 — Pilot Button Fix

## Problem Statement

Existing clients see the onboarding screen instead of their data when admin opens a pilot session. Root cause: `AuthContext.tsx` seeds `onboardingCompleted` from `localStorage` — in a fresh pilot popup window, localStorage has no entry (or wrong value from admin's own session), so state initializes to `null`/`false`.

## Context Summary

- `PilotHandler.tsx` stores `pilot_token` in `sessionStorage` as `token`, sets `pilot_mode = "true"`, then navigates to `/dashboard` and reloads.
- `AuthContext.tsx` initializes `onboardingCompleted` from `localStorage.getItem("onboardingCompleted")` — not pilot-aware.
- `getPriorityItem(key)` checks `sessionStorage` first (pilot mode), then `localStorage` — the correct pattern.
- `PageWrapper.tsx` reads `localStorage` directly, bypassing `getPriorityItem`.
- Backend `AdminAuthController` returns `googleAccountId` but frontend reads `data.organizationId`.

## 5 Bugs Identified

1. **`AuthContext.tsx:22-25`** — Seeds from `localStorage.getItem("onboardingCompleted")`, not pilot-aware
2. **`AuthContext.tsx:97-98`** — API failure writes `"false"` to localStorage, corrupting admin's session
3. **`AuthContext.tsx:44`** — Success path writes to localStorage during pilot, corrupting admin's session
4. **`PageWrapper.tsx:21-22`** — Reads `localStorage` directly, ignores `getPriorityItem`
5. **`OrganizationManagement.tsx:308`** — Reads `data.organizationId` but backend returns `data.googleAccountId`

## Proposed Approach

### Fix 1-3 — `signalsai/src/contexts/AuthContext.tsx`

Add module-level helper:
```typescript
function isPilotSession(): boolean {
  return sessionStorage.getItem("pilot_mode") === "true" || !!sessionStorage.getItem("token");
}
```

**Initial state (line 23):** In pilot mode, don't seed from localStorage:
```typescript
const isPilot = isPilotSession();
const cached = isPilot ? null : localStorage.getItem("onboardingCompleted");
```

**Success path (line 44):** Guard localStorage write:
```typescript
if (isCompleted && !isPilotSession()) {
  localStorage.setItem("onboardingCompleted", "true");
}
```

**Catch block (line 98):** Guard localStorage write:
```typescript
setOnboardingCompleted(false);
if (!isPilotSession()) {
  localStorage.setItem("onboardingCompleted", "false");
}
```

### Fix 4 — `signalsai/src/components/PageWrapper.tsx:21-22`

```typescript
import { getPriorityItem } from "../hooks/useLocalStorage";
const onboardingCompleted = getPriorityItem("onboardingCompleted") === "true";
```

### Fix 5 — Pilot URL field name mismatch

In the pilot launch function (currently `OrganizationManagement.tsx`, moving to `OrganizationDetail.tsx` after Plan 03):
```typescript
if (data.googleAccountId) {
  pilotUrl += `&organization_id=${data.googleAccountId}`;
}
```

## Risk Analysis

- **Level 2:** `isPilotSession()` heuristic — `sessionStorage.getItem("token")` could match non-pilot auth in theory. Mitigated by OR'ing with `pilot_mode` flag (`PilotHandler.tsx:16` always sets it).
- **Level 1:** Bug 5 field name fix — trivially correct.

## Security Considerations

- `isPilotSession()` is purely a client-side UX guard, not a security boundary. Auth still via JWT.
- No new storage keys introduced.

## Definition of Done

- Admin pilot session for an existing client shows client dashboard, not onboarding
- Admin's `localStorage.onboardingCompleted` not mutated during pilot sessions
- `organization_id` correctly appended to pilot URL
- `PageWrapper` reads from sessionStorage first in pilot mode
