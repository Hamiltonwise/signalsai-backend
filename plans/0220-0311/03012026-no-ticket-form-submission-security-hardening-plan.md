# Form Submission Security Hardening

## Problem Statement

The `/api/websites/form-submission` endpoint is public, unauthenticated, and has almost no protection against abuse. It accepts unlimited submissions, has no bot detection, no rate limiting, naive sanitization (regex HTML strip), no payload caps, and no flood detection. Every submission triggers a DB write and an email send. This is a spam and abuse vector.

## Context Summary

- **Client script:** `buildFormScript()` in both `website-builder-rebuild/src/utils/renderer.ts` and `alloro-app/signalsai-backend/src/utils/website-utils/formScript.ts` — injected inline before `</body>` on every rendered page
- **Backend handler:** `handleFormSubmission()` in `formSubmissionController.ts` — validates presence of fields, sanitizes with regex, resolves recipients, saves to DB, sends email
- **Current sanitization:** `sanitize()` strips `<tags>` via regex — does not handle entities, attributes, or non-HTML injection
- **DB table:** `website_builder.form_submissions` — no IP tracking, no fingerprinting
- **Existing packages:** `sanitize-html` already installed but unused in form path; `express-rate-limit` not installed
- **Form types in use:** Demo request, appointment, newsletter — all small forms (3-8 fields)

## Existing Patterns to Follow

- Service files in `websiteContact-services/`, util files in `websiteContact-utils/`
- FormSubmissionModel extends BaseModel with static methods
- Migrations use raw SQL for `website_builder` schema tables
- Client script is vanilla JS, no dependencies, injected as template literal string

## Proposed Approach

### 1. Honeypot Field (Client + Server)

**Client (`buildFormScript`):**
- Inject a hidden input field into each form: `<input type="text" name="website_url" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px;opacity:0;height:0;width:0;">`
- Field name `website_url` looks legitimate to bots
- Hidden via CSS (not `type="hidden"` — bots know to skip those)
- The existing script already skips `tabIndex === -1` for data collection, so this field won't appear in `contents`

**Server (`formSubmissionController`):**
- Check `req.body._hp` (honeypot value sent alongside payload)
- If non-empty, return 200 with `{ success: true }` (silent rejection — don't tip off bots)

### 2. Timestamp / Timing Check (Client + Server)

**Client (`buildFormScript`):**
- Record `Date.now()` on script execution as `_ts`
- Send `_ts` in the JSON payload alongside `projectId`, `formName`, `contents`

**Server (`formSubmissionController`):**
- Calculate `Date.now() - _ts`
- If less than 2000ms (2 seconds), reject silently (200 + success)
- If `_ts` is missing or not a number, reject with 400
- If `_ts` is older than 1 hour (3600000ms), reject silently (stale/replayed)

### 3. Server-Side Rate Limiting (Middleware)

**Install:** `express-rate-limit`

**Apply to `/form-submission` route only (not global):**
- Window: 15 minutes
- Max: 10 submissions per IP per window
- Standard headers enabled
- Response: 429 with `{ error: "Too many submissions. Please try again later." }`

### 4. Payload Caps

**Server (`formSubmissionController`):**
- Max 20 fields in `contents` object
- Max 500 characters per field value
- Max 100 characters per field key
- Max 200 characters for `formName`
- If exceeded, return 400 with descriptive error

### 5. Improved Sanitization

**Replace current `sanitize()` in `sanitization.ts`:**
- Use `sanitize-html` (already installed) with zero allowed tags/attributes
- Handles: entities, nested tags, attribute injection, unclosed tags, script injection patterns

### 6. Flood Detection (Same IP / Same Content)

**New service:** `floodDetectionService.ts`

**Logic:**
- Query `form_submissions` for recent submissions (last 15 minutes) from the same `sender_ip`
- If 5+ submissions from same IP in window → reject with 429
- Hash the `contents` values (SHA-256) and check for duplicate content submissions per project in last 15 minutes
- If exact duplicate content exists within window → reject silently (200 + success)

**New DB columns:** `sender_ip VARCHAR(45)`, `content_hash VARCHAR(64)` on `form_submissions`
**New indexes:** `(sender_ip, submitted_at DESC)`, `(content_hash, submitted_at DESC)`

### 7. DB Migration

**Migration file:** `20260301000001_add_form_submission_security_columns.ts`

Adds `sender_ip` and `content_hash` columns with composite indexes.

## Execution Order

1. DB migration (unblocks flood detection)
2. Install `express-rate-limit`
3. `sanitization.ts` upgrade
4. `floodDetectionService.ts` (new file, depends on migration)
5. `FormSubmissionModel` — add flood detection queries
6. `formSubmissionController.ts` — integrate all checks (honeypot, timing, caps, flood, sanitization)
7. `websiteContact.ts` route — add rate limiter middleware
8. `buildFormScript()` in BOTH repos — honeypot, timestamp
9. Verify both scripts are identical after changes

## Risk Analysis

| Risk | Level | Mitigation |
|------|-------|------------|
| Flood detection DB queries on every submission | Level 2 | Indexed on `(sender_ip, submitted_at)`. Query scoped to 15-min window. Rate limiter fires first, reducing DB hits. |
| Silent 200 responses for rejected submissions | Level 1 | Intentional — don't reveal detection to bots. Legitimate users won't trigger these. |
| `express-rate-limit` uses in-memory store | Level 1 | Fine for single-instance. If multi-instance deployed later, swap to Redis store. |
| Duplicate `buildFormScript` in two repos | Level 2 | Both must be updated identically. Noted in execution order. |

## Security Considerations

- Honeypot + timing = layered bot defense (no single point of failure)
- Rate limiting by IP prevents brute-force spam
- Flood detection catches distributed attacks using same content
- Payload caps prevent oversized payloads from consuming resources
- `sanitize-html` is battle-tested vs the current naive regex
- Silent 200 on bot detection prevents attackers from iterating around checks

## Performance Considerations

- Rate limiter is in-memory — zero latency
- Honeypot + timing checks are simple comparisons — zero cost
- Flood detection is one indexed DB query (~5ms)
- Sanitization switch is negligible — `sanitize-html` is fast for short strings
- Net impact per request: ~5ms additional latency (flood check only)

## Definition of Done

- [x] Honeypot field injected in client, rejected silently on server
- [x] Timestamp recorded on page load, validated on server (2s min, 1hr max)
- [x] `express-rate-limit` applied to `/form-submission` route (10 req / 15 min / IP)
- [x] Payload capped: 20 fields, 500 char values, 100 char keys, 200 char form name
- [x] `sanitize-html` replaces regex sanitizer
- [x] Flood detection: 5 submissions/IP/15min + duplicate content rejection
- [x] `sender_ip` + `content_hash` columns + indexes added via migration
- [x] Both `buildFormScript` copies updated identically

## Revision Log

### 2026-03-01 — Removed Turnstile (Cloudflare)

**Reason:** Cloudflare Turnstile requires explicit per-hostname registration with no wildcard support. Free tier caps at 10 hostnames per widget. This is impractical for a multi-tenant renderer serving unlimited subdomains + custom domains.

**Changes:**
- Removed `turnstileService.ts`
- Removed Turnstile SDK injection from `buildFormScript` (both repos)
- Removed `_turnstile` payload field and server-side verification from controller
- Removed `turnstileSiteKey` parameter from `renderPage()` and callers
- Remaining 6 security layers provide strong protection without external CAPTCHA dependency
