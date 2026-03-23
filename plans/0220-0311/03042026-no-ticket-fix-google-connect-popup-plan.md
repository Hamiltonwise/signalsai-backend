# Fix Google Connect Popup — Connection Links to Wrong Org

## Problem Statement
When a user who signed up with email/password connects Google from Settings, the OAuth callback identifies users by Google email only. If the Google email differs from the signup email, a new user + org is created, and the `google_connections` row links to the wrong org. `hasGoogleConnection` stays `false` and the banner never disappears.

## Context Summary
- `GET /api/auth/google` — no auth middleware, returns OAuth URL with random state
- `GET /api/auth/callback` — Google redirect, no JWT, uses `completeOAuthFlow` which finds user by Google email
- `OAuthFlowService.completeOAuthFlow` — `UserModel.findOrCreate(googleEmail)` + org lookup by found user
- `security-utils.ts` — has `generateSecureState()` (random string)
- JWT: `{ userId, email }`, secret via `process.env.JWT_SECRET`, 7-day expiry
- Auth middleware: `authenticateToken` → `rbacMiddleware` chain

## Existing Patterns to Follow
- Lazy `getJwtSecret()` pattern for accessing JWT secret
- HMAC/JWT signing for state integrity
- Optional auth extraction without failing on missing token

## Proposed Approach

### 1. `security-utils.ts` — Add signed state encoding/decoding
- `encodeAuthState(userId, orgId)` — creates a signed state string: `base64({ userId, orgId, nonce, exp }) + "." + hmac`
- `decodeAuthState(state)` — verifies HMAC, checks expiry, returns `{ userId, orgId } | null`
- 10-minute TTL (OAuth flow should complete within that window)

### 2. `AuthController.getGoogleAuthUrl` — Encode user context in state
- Try to extract JWT from Authorization header (manual extraction, no middleware — route stays public)
- If valid JWT found: decode it, look up org via `organization_users`, encode userId/orgId in signed state
- If no JWT or invalid: fall back to random state (unauthenticated sign-up flow still works)

### 3. `AuthController.handleOAuthCallback` — Decode state for auth context
- Try `decodeAuthState(state)` — returns `{ userId, orgId }` or `null`
- Pass the result to `completeOAuthFlow` as optional `authenticatedContext`

### 4. `OAuthFlowService.completeOAuthFlow` — Use auth context when available
- Accept optional `authenticatedContext?: { userId: number; orgId: number }`
- When provided:
  - Find user by `authenticatedContext.userId` (not by Google email)
  - Check for existing Google connection by `google_user_id`
  - If exists: update tokens
  - If new: create with `organization_id = authenticatedContext.orgId`
  - Skip `findOrCreate` by email (no new user creation needed)
- When absent: current behavior unchanged (email-based matching)

### 5. `OAuthFlowService.handleFallbackAuth` — Same auth context support

## Risk Analysis
- Level 2 — Concern. Touches OAuth flow which is security-sensitive.
- Mitigated: HMAC-signed state prevents tampering, 10-min TTL prevents replay, fallback to existing behavior if state is absent/invalid.
- Unauthenticated Google sign-up flow is unaffected (no JWT = random state = current behavior).

## Security Considerations
- State is HMAC-signed with JWT secret — cannot be forged
- 10-minute TTL prevents stale state reuse
- Fallback to existing behavior if state decoding fails

## Definition of Done
- [x] User connects Google from Settings → connection links to their org regardless of Google email
- [x] `hasGoogleConnection` returns `true` after connect
- [x] Banner disappears after successful connect + refresh
- [x] Unauthenticated Google sign-up flow still works (no auth context = existing behavior)
- [x] TypeScript compiles clean (both frontend and backend)

## Revision Log

### 2026-03-04 — Fix org_id not updating on reconnect
**Reason:** Initial implementation only handled the "new connection" path. When a user had previously connected Google (creating a `google_connections` row linked to the wrong org), the `existingAccount` branch in `completeOAuthFlow` only updated tokens via `buildAccountData()` — which does NOT include `organization_id`. The connection stayed on the wrong org, so `hasGoogleConnection` kept returning `false` for the user's actual org.

**Fix:** In both `completeOAuthFlow` and `handleFallbackAuth`, when `existingAccount` is found AND `authenticatedContext` provides a different `orgId`, include `organization_id` in the update payload to reassign the connection to the correct org.

### 2026-03-04 — Fix "Add Location" button hidden after Google connect
**Reason:** `PropertiesTab` gates the "Add Location" button behind `canManageConnections = userRole === "admin"`, where `userRole` is read from localStorage. For users who signed up via email/password, the login response stores `orgUser?.role || "viewer"`. If the org_user didn't exist at login time (pre-Google-connect), localStorage has `"viewer"` and never gets refreshed.

**Fix:** Gate the "Add Location" button on `hasGoogleConnection` instead of `canManageConnections`. Also added an inline "Add Location" button in the empty-state card. Backend enforces permissions — frontend shouldn't hide the primary action based on stale cache.
