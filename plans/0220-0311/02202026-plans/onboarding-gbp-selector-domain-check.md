# Onboarding GBP Selector & Domain Validation

## Problem Statement

The onboarding flow currently collects practice info (name, address) and domain separately with no connection between them. Users must manually type their domain, and there's no validation that the domain actually resolves to a working website.

We need to:
1. Add a GBP location selector button inside Step 1 (Practice Info) that opens a modal showing the user's authenticated GBP locations
2. Save selected GBP locations to `google_property_ids.gbp` — same pattern as the settings page
3. Prefill the domain step from the selected GBP location's website URL (clean domain, no https/www)
4. Add a debounced domain validation API that checks if the domain is reachable and flags firewall issues (warning only, does not block)

## Context Summary

### Current Onboarding Flow
- **Step 1** (currentStep=1): User Info — firstName, lastName, businessPhone
- **Step 2** (currentStep=2): Practice Info — practiceName, street, city, state, zip
- **Step 3** (currentStep=3): Domain Info — domainName (final step, triggers `completeOnboarding`)

### Key Files
| Layer | File | Role |
|-------|------|------|
| UI Container | `signalsai/src/components/onboarding/OnboardingContainer.tsx` | Step orchestration, state wiring |
| UI Step 1 | `signalsai/src/components/onboarding/Step1_PracticeInfo.tsx` | Practice name + address form |
| UI Step 2 | `signalsai/src/components/onboarding/Step2_DomainInfo.tsx` | Domain input + sanitization |
| UI Modal | `signalsai/src/components/settings/PropertySelectionModal.tsx` | Reusable multi-select property modal |
| Hook | `signalsai/src/hooks/useOnboarding.ts` | Onboarding state + API calls |
| FE API | `signalsai/src/api/onboarding.ts` | Onboarding HTTP client |
| BE Routes | `signalsai-backend/src/routes/onboarding.ts` | Route definitions (no token middleware) |
| BE Controller | `signalsai-backend/src/controllers/onboarding/OnboardingController.ts` | Request handlers |
| BE Service | `signalsai-backend/src/controllers/onboarding/feature-services/ProfileCompletionService.ts` | Transaction-based profile save |
| BE Validation | `signalsai-backend/src/controllers/onboarding/feature-utils/onboardingValidation.ts` | ProfileData validation |
| Settings Service | `signalsai-backend/src/controllers/settings/feature-services/service.google-properties.ts` | `fetchAvailableGBPProperties()` |
| Settings Service | `signalsai-backend/src/controllers/settings/feature-services/service.properties.ts` | `updateProperty()` — saves to google_property_ids |
| Property Parser | `signalsai-backend/src/controllers/settings/feature-utils/util.property-parser.ts` | Parse/update property_ids JSONB |
| Domain Extractor | `signalsai-backend/src/controllers/places/feature-utils/domainExtractor.ts` | `extractDomainFromUrl()` |
| GBP Location Handler | `signalsai-backend/src/controllers/gbp/gbp-services/location-handler.service.ts` | Fetches location profiles (includes websiteUri) |

### Key Patterns

**GBP Location Storage (settings page pattern):**
```json
// google_accounts.google_property_ids
{
  "ga4": null,
  "gsc": null,
  "gbp": [
    { "accountId": "123", "locationId": "loc-1", "displayName": "Main Office" }
  ]
}
```

**Settings page save flow:**
Frontend calls `POST /api/settings/properties/update` with `{ type: "gbp", data: [...], action: "connect" }` → `updateProperty()` → `GoogleAccountModel.updatePropertyIds()`

**GBP location fetch flow:**
`GET /api/settings/properties/available/gbp` → `fetchAvailableGBPProperties(oauth2Client)` → Google APIs (`mybusinessaccountmanagement` + `mybusinessbusinessinformation`) → returns `[{ id, name, accountId, locationId, address }]`

**Middleware difference:**
- Settings routes use `tokenRefreshMiddleware` (provides `req.oauth2Client`) + `rbacMiddleware`
- Onboarding routes use neither — they read google account ID from header directly via `extractGoogleAccountId()`
- To fetch GBP locations during onboarding, we need the OAuth2 client. The new onboarding endpoint for fetching GBP locations must use `tokenRefreshMiddleware`.

**Domain extraction exists:**
`extractDomainFromUrl(websiteUri)` in `domainExtractor.ts` already strips `www.` and extracts hostname from URL. Reuse this.

**GBP location profile includes websiteUri:**
The `location-handler.service.ts` fetches profiles with `readMask: "name,title,storeCode,metadata"` for listings. To get `websiteUri`, the readMask must include it. The existing `fetchAvailableGBPProperties()` does NOT fetch websiteUri — it only gets `name,title,storeCode,metadata`. We need to either:
- (a) Fetch websiteUri during location listing (heavier API call, adds latency per location), or
- (b) Fetch websiteUri only for the selected location(s) after selection via a separate call

Option (b) is better — fetch details only for what the user selects.

## Existing Patterns to Follow

1. **Property selection modal** — Reuse `PropertySelectionModal` from settings. It already handles multi-select, search/filter, loading states, and saving states. It accepts `PropertyItem[]` with `id, name, accountId, locationId, address`.

2. **Property save flow** — Reuse `updateProperty()` from settings service. Same JSONB update pattern.

3. **GBP location fetch** — Reuse `fetchAvailableGBPProperties()` from settings service.

4. **Domain sanitization** — Reuse `extractDomainFromUrl()` from Places utils + existing `sanitizeDomain()` in Step2_DomainInfo.

5. **Error handling** — Follow existing `handleError()` pattern in OnboardingController.

## Proposed Approach

### 1. New Onboarding Endpoint: Fetch Available GBP Locations

**Route:** `GET /api/onboarding/available-gbp`
**Middleware:** `tokenRefreshMiddleware` (required for OAuth2 client)
**Handler:** New function in OnboardingController that delegates to existing `fetchAvailableGBPProperties()`

This is a thin wrapper — we already have the service function, we just need a route that applies the token middleware.

### 2. New Onboarding Endpoint: Save GBP Selection

**Route:** `POST /api/onboarding/save-gbp`
**Middleware:** `tokenRefreshMiddleware` (for account ID extraction consistency)
**Handler:** New function in OnboardingController that delegates to existing `updateProperty()` from settings service
**Payload:** `{ data: [{ accountId, locationId, displayName }] }`

Reuses the same service function as settings. Saves to `google_property_ids.gbp`.

### 3. New Onboarding Endpoint: Fetch Website from GBP Location

**Route:** `POST /api/onboarding/gbp-website`
**Middleware:** `tokenRefreshMiddleware`
**Handler:** Given an accountId + locationId, fetch the location profile (with websiteUri in readMask), extract domain, return it.
**Payload:** `{ accountId: string, locationId: string }`
**Response:** `{ success: true, websiteUri: string | null, domain: string }`

This fetches the website only when needed — after the user selects locations and moves to the domain step.

### 4. New Onboarding Endpoint: Domain Validation

**Route:** `POST /api/onboarding/check-domain`
**Middleware:** None needed (no Google API calls)
**Handler:** New service function that:
  1. Validates domain format (same regex as frontend)
  2. Attempts `fetch("https://{domain}")` with 10s timeout and appropriate User-Agent
  3. Returns status: `valid` (200 OK, HTML response), `warning` (response but potential firewall — detected via known challenge page patterns, non-HTML content type, or Cloudflare/Sucuri signatures), or `unreachable` (fetch failed, non-200)
**Payload:** `{ domain: string }`
**Response:** `{ success: true, status: "valid" | "warning" | "unreachable", message: string }`

### 5. Frontend: Step 1 (Practice Info) — Add GBP Selector Button

Add to `Step1_PracticeInfo`:
- A button below the city/state/zip row: "Select GBP Locations"
- When clicked, opens `PropertySelectionModal` in multi-select mode
- When GBP modal opens, fetches available locations via `GET /api/onboarding/available-gbp`
- On confirm, saves immediately via `POST /api/onboarding/save-gbp`
- Button changes to show selection state: "N locations selected" with a different color (alloro-orange bg, white text)
- GBP selection is **optional** — user can skip and set up later from the settings page
- If skipped, button stays in default state (no selection). User can still proceed to domain step.
- If user has no GBP locations at all, show a "Skip — set up later in Settings" message in the modal instead of blocking
- Validation gate: `isFormValid()` does NOT require GBP selection

New props needed on `Step1PracticeInfo`:
- `selectedGbpLocations: GBPLocation[]` (or similar array)
- `onGbpSelect: (locations: GBPLocation[]) => void`

### 6. Frontend: useOnboarding Hook — New State

Add to `useOnboarding`:
- `selectedGbpLocations` state (array)
- `setSelectedGbpLocations` setter
- New API call functions for fetching and saving GBP selections
- After GBP selection + save succeeds, fetch websiteUri for the first selected location to prefill domain

### 7. Frontend: Step 2 (Domain Info) — Prefill + Debounce Validation

Changes to `Step2_DomainInfo`:
- Accept new prop: `prefillDomain: string` — set as initial value when entering the step (only if `domainName` is empty)
- Add debounced domain check: on every domain change, debounce 800ms, call `POST /api/onboarding/check-domain`
- Show inline status indicator next to the domain field:
  - Loading spinner while checking
  - Green check for valid
  - Yellow warning icon for firewall detected (with message, still allows proceeding)
  - Red X for unreachable (with message, still allows proceeding — warning only)

### 8. Frontend: OnboardingContainer — Wire New Props

- Pass `selectedGbpLocations` and `setSelectedGbpLocations` through to Step 1
- When transitioning from Step 2 to Step 3 (domain step), if GBP locations were selected, fetch websiteUri for the first selected location and prefill domain. If skipped, domain field stays empty.
- Pass `prefillDomain` to Step2_DomainInfo

### 9. Backend: ProfileCompletionService — No Changes Needed

GBP selections are saved immediately via `save-gbp` endpoint (same as settings flow). The `completeOnboarding` flow only saves profile data and marks onboarding complete. `google_property_ids` is already set by the time `completeOnboarding` runs. No conflict — these write to different columns.

### 10. Frontend API Client — New Functions

Add to `signalsai/src/api/onboarding.ts`:
- `getAvailableGBP()` — `GET /onboarding/available-gbp`
- `saveGBP(data)` — `POST /onboarding/save-gbp`
- `getGBPWebsite(accountId, locationId)` — `POST /onboarding/gbp-website`
- `checkDomain(domain)` — `POST /onboarding/check-domain`

## Architectural Decisions

### Why new onboarding endpoints instead of calling settings endpoints directly?

The settings routes require `rbacMiddleware` which checks for an organization. During onboarding, the organization doesn't exist yet (it's created when onboarding completes). The onboarding routes need their own endpoints that skip the RBAC check but still authenticate via token middleware.

### Why save GBP immediately instead of batching with completeOnboarding?

Following the existing settings page pattern. GBP selections write to `google_property_ids`, profile data writes to separate columns. Keeping them decoupled avoids:
- Making the completeOnboarding payload more complex
- Mixing concerns in the ProfileCompletionService
- Needing to update validation for optional GBP data

### Why fetch websiteUri separately instead of during location listing?

The `fetchAvailableGBPProperties()` uses readMask `name,title,storeCode,metadata` — adding `websiteUri` would require changing the readMask, which affects the settings page too. A separate targeted fetch for only the selected location(s) is cheaper and doesn't change existing behavior.

### Why debounce at 800ms for domain check?

Standard UX pattern. 800ms is long enough that we don't fire on every keystroke but short enough that the user sees feedback before hitting "Get Started."

## Risk Analysis

| Risk | Level | Mitigation |
|------|-------|------------|
| Onboarding GBP save writes to same column as settings page | Level 1 | Same format, same service function. No conflict — onboarding runs before settings page is accessible. |
| Token middleware on onboarding routes | Level 1 | Only applied to specific new endpoints, not globally. Existing onboarding endpoints unchanged. |
| GBP location fetch fails (no locations, API error) | Level 1 | GBP selection is optional. If the user has no GBP locations or the API fails, they skip and set up later from settings. No blocking. |
| Domain check false positives (reports unreachable for valid domain) | Level 1 | Warning only — doesn't block proceeding. User can ignore and continue. |
| Firewall detection is imperfect | Level 1 | Best-effort only. Check for Cloudflare challenge patterns, non-HTML responses, 403/503 status codes. Clearly labeled as "warning" not "error." |

## Failure Mode Analysis

- **GBP API call fails during onboarding:** Show error state in modal ("Failed to load your GBP locations.") with a retry button and a "Skip — set up later in Settings" option. User is never blocked.
- **GBP save fails:** Show error in modal. Don't close modal. User can retry or close and skip.
- **WebsiteUri fetch fails after GBP selection:** Domain field stays empty. User types manually. No blocking impact.
- **Domain check endpoint times out:** Frontend shows domain field without validation feedback. User can still proceed. 10s timeout on backend prevents hanging.
- **User has GBP locations but none have websiteUri:** Domain field stays empty. User types manually. Expected behavior for new listings.

## Security Considerations

- Domain check endpoint must not be an open proxy. It only does a HEAD/GET to the user-provided domain and returns a status string — no response body forwarded.
- Domain check should validate the input is a proper domain format before making any network request (prevent SSRF with internal IPs, localhost, etc.).
- Rate limit the domain check endpoint to prevent abuse (existing rate limiting patterns should cover this).

## Performance Considerations

- GBP location fetch is an external API call (~1-3s). Loading state in modal covers this.
- WebsiteUri fetch for domain prefill is a single API call after selection. Happens during step transition — can show brief loading.
- Domain check has a 10s timeout. Debounced at 800ms to avoid excessive calls.
- No N+1 risk — we fetch all locations in one paginated call, not per-location.

## Observability & Monitoring Impact

- Log GBP location fetch attempts and results (count of locations returned).
- Log GBP save during onboarding (differentiate from settings page saves for metrics).
- Log domain check results (valid/warning/unreachable + domain) for debugging support issues.

## Test Strategy

- Unit tests for domain check service: valid domain, unreachable domain, firewall-detected response, invalid format, SSRF prevention (localhost, internal IPs).
- Unit tests for GBP websiteUri extraction with domain extractor.
- Integration test: onboarding flow with GBP selection + domain prefill → completeOnboarding verifies google_property_ids is set.

## Blast Radius Analysis

| Component | Impact |
|-----------|--------|
| Onboarding UI (Steps 1-2) | Modified — new button on Step 1, new debounce on Step 2 |
| Onboarding routes | Modified — 4 new endpoints added |
| OnboardingController | Modified — 4 new handler functions |
| useOnboarding hook | Modified — new state + API calls |
| Onboarding API client | Modified — 4 new functions |
| Settings service | Reused as-is — no changes |
| PropertySelectionModal | Reused as-is — no changes |
| ProfileCompletionService | No changes |
| GoogleAccountModel | No changes (no new columns) |
| Domain extractor utility | Reused as-is — no changes |

No database migration needed. No schema changes. GBP data goes into the existing JSONB column.

## Definition of Done

- [ ] GBP selector button appears in Step 1 (Practice Info) below the address fields
- [ ] Clicking the button opens PropertySelectionModal with user's GBP locations
- [ ] Multi-select works, confirm saves to google_property_ids.gbp immediately
- [ ] Button shows "N locations selected" state after selection
- [ ] Step 1 can proceed without GBP selection (optional — user can set up later from settings)
- [ ] Domain step is prefilled with clean domain from first selected GBP location's websiteUri
- [ ] Domain is editable and stripped of https:// and www. automatically
- [ ] Domain field has debounced validation (800ms) showing valid/warning/unreachable status
- [ ] Warning status does not block proceeding
- [ ] Onboarding completes successfully with GBP selections persisted in google_property_ids
- [ ] Backend domain check validates format and prevents SSRF
- [ ] All new endpoints follow existing error handling patterns
