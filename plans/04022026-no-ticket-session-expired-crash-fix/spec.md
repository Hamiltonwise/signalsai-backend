# Session Expired Crash Fix

## Why
When a user's JWT expires, the billing page (and potentially others) crashes with a white screen — "Something went wrong." via the Sentry ErrorBoundary. Confirmed via Sentry issue ALLORO-FRONTEND-Q: `TypeError: Cannot read properties of undefined (reading 'length')`. The app has no mechanism to detect expired tokens and redirect users to sign in. Instead, API calls silently return 403 and components crash trying to render error response objects as data.

## What
1. A global 403 expired-token interceptor that shows a "Session Expired" modal and redirects to sign-in.
2. A defensive guard in BillingTab so it never crashes even if the interceptor misses.

Done when: expired tokens trigger a non-dismissible modal → user clicks "Sign In" → localStorage cleared → redirected to `/signin`. BillingTab no longer crashes on malformed API responses.

## Context

**Relevant files:**
- `frontend/src/api/index.ts` — axios interceptors, apiGet/apiPost helpers. Already has a 402 interceptor pattern at line 236.
- `frontend/src/components/settings/BillingTab.tsx` — crash site. Lines 107-113 have the guard that passes bad data through.
- `frontend/src/contexts/SessionProvider.tsx` — has `disconnect()` which clears localStorage, sessionStorage, query cache, cookies, broadcasts logout, and redirects to `/signin`.
- `frontend/src/components/ui/ConfirmModal.tsx` — existing modal pattern (dark glassmorphic style, framer-motion). But this is promise-based and context-dependent — the interceptor fires outside React tree, so we can't use it directly.
- `src/middleware/auth.ts:33` — backend returns `res.status(403).json({ error: "Invalid or expired token" })`.

**Patterns to follow:**
- The 402 billing interceptor pattern (custom event dispatch from axios → React component listens)
- The `disconnect()` function in SessionProvider for the actual cleanup logic

**Key decisions:**
- The modal must render **outside** the normal React tree since the interceptor fires from axios (outside React). Use a standalone React root or DOM-level approach — OR dispatch a custom event like the 402 pattern and have a component listen.
- Use the custom event pattern (matches existing 402 approach) — `session:expired` event → a listener component renders the modal.
- Modal is non-dismissible (no cancel button, no backdrop click, no Escape key).
- Deduplicate: only fire once even if 10 API calls all return 403 simultaneously.

## Constraints

**Must:**
- Follow the existing 402 interceptor pattern (custom event dispatch)
- Reuse `disconnect()` logic from SessionProvider for cleanup
- Match the existing dark glassmorphic modal style from ConfirmModal.tsx
- Deduplicate — one modal even if multiple 403s arrive simultaneously

**Must not:**
- Fire on non-expired-token 403s (e.g., RBAC `requireRole` returns 403 too — only match `"Invalid or expired token"`)
- Break the existing 402 billing lockout interceptor
- Send any OTP or trigger email flows

**Out of scope:**
- Token refresh / silent re-auth
- Proactive token expiry detection (checking JWT exp claim before it expires)
- Fixing the backend 403 response format

## Risk

**Level:** 1

**Risks identified:**
- False positives on 403 detection → **Mitigation:** match the exact error string `"Invalid or expired token"` from `auth.ts:33`
- Race condition with multiple simultaneous 403s → **Mitigation:** boolean flag to ensure event dispatches once per "session"

## Tasks

### T1: Add 403 interceptor in API layer
**Do:** Add a second interceptor case in `frontend/src/api/index.ts` alongside the existing 402 handler. On `status === 403` + `data?.error === "Invalid or expired token"`, dispatch `window.dispatchEvent(new CustomEvent("session:expired"))`. Add a module-level `let sessionExpiredFired = false` flag so it only fires once.
**Files:** `frontend/src/api/index.ts`
**Verify:** Manual: intercept a billing call with 403 in Playwright, confirm event fires once.

### T2: Create SessionExpiredModal component
**Do:** Create a new component that listens for the `session:expired` custom event. On trigger, shows a non-dismissible modal (no cancel, no backdrop dismiss, no Escape). Single "Sign In" button. On click: run the same cleanup as `disconnect()` (clear localStorage, sessionStorage, query cache, cookie, broadcast logout) then `window.location.href = "/signin"`. Style: match ConfirmModal.tsx dark glassmorphic aesthetic.
**Files:** `frontend/src/components/SessionExpiredModal.tsx`
**Verify:** Manual: trigger `session:expired` event in console, confirm modal appears and is non-dismissible.

### T3: Mount SessionExpiredModal in App.tsx
**Do:** Add `<SessionExpiredModal />` in `App.tsx` at the top level, outside routes but inside BrowserRouter (so it's always present). Place it near the existing `<Toaster />`.
**Files:** `frontend/src/App.tsx`
**Verify:** Manual: confirm component renders in the DOM on any page.

### T4: Fix BillingTab guard (defensive)
**Do:** Change the response guards in `fetchData()` from `success !== false` to `success === true`. Lines 108 and 112 — change to `statusResult.value?.success === true` and `detailsResult.value?.success === true`.
**Files:** `frontend/src/components/settings/BillingTab.tsx`
**Verify:** Manual: with mocked 403 response, billing page shows loading skeleton or empty state instead of crashing.

## Done
- [ ] `npx tsc --noEmit` passes
- [ ] Playwright: mocked 403 on billing endpoints → modal appears, no crash
- [ ] Playwright: click "Sign In" on modal → redirected to `/signin`, localStorage cleared
- [ ] Playwright: valid token → billing page loads normally (no regression)
- [ ] Multiple simultaneous 403s → only one modal shown
