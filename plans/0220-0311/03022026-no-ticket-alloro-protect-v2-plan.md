# Alloro Protect V2 — Origin Validation, Content Patterns, JS Challenge, AI Analysis, Success Redirect

## Problem Statement

Alloro Protect currently has 6 security layers but lacks origin validation (anyone can POST), content pattern detection (spam text passes), JavaScript proof (bots that don't execute JS pass), and intelligent content analysis. Additionally, form submissions should redirect to `/success` and AI-flagged submissions should be saved but not emailed.

## Context Summary

- `formSubmissionController.ts` — central pipeline, 6 layers, ends with persist + email
- `buildFormScript` — client-side script in both repos (alloro-app + website-builder-rebuild), must stay in sync
- Project model has `hostname` and `custom_domain` for origin validation
- Anthropic SDK already a dependency (`@anthropic-ai/sdk`), client pattern established in `service.minds-chat.ts`
- `form_submissions` table has: id, project_id, form_name, contents, recipients_sent_to, submitted_at, is_read, sender_ip, content_hash
- No success page template exists in website-builder-rebuild
- AlloroProtect.tsx landing page needs updating with new layers
- FormSubmissionsTab.tsx needs flagged tab

## Existing Patterns to Follow

- Anthropic client: lazy singleton via `getClient()`, `client.messages.create()` with system + messages
- Silent rejection pattern: `silentOk(res)` returns 200 to hide detection from bots
- Service files live in `websiteContact-services/` for the form submission pipeline
- Template pages in `website-builder-rebuild/src/templates/` export a function returning HTML string

## Proposed Approach

### 1. JavaScript Challenge (client + server)

**Client (`buildFormScript` — both repos):**
- Compute LCG challenge from `_ts` at page load:
  ```js
  var _jsc=_ts;for(var i=0;i<1000;i++){_jsc=((_jsc*1103515245+12345)&0x7fffffff);}
  ```
- Include `_jsc` in POST body alongside `_hp` and `_ts`

**Server (`formSubmissionController`):**
- New step after timing check: verify `_jsc` matches expected LCG output for given `_ts`
- Mismatch → `silentOk(res)`

### 2. Origin Validation (server)

**In `formSubmissionController`:**
- Move project lookup earlier (currently at step 7, move to after basic validation)
- Build allowed origins from `project.hostname` → `https://{hostname}.sites.getalloro.com` and `project.custom_domain` → `https://{custom_domain}`
- Compare against `req.headers.origin` or `Referer` header
- No match → `silentOk(res)`
- Skip check if no Origin/Referer header (some privacy tools strip them)

### 3. Content Pattern Detection (server)

**New service: `contentPatternService.ts`**
- `getSpamScore(contents: Record<string, string>): number`
- Patterns:
  - URL in value (http/https/www) → +3 per URL
  - 3+ URLs total → +5
  - Known spam keywords (hardcoded list) → +3 each
  - All-caps (>80% uppercase, 10+ chars) → +2
  - Identical values across 2+ fields → +2
  - Gibberish detection (consonant clusters, no vowels in long words) → +2
- Threshold: score >= 5 → `silentOk(res)`

### 4. AI Content Analysis (server)

**New service: `aiContentAnalysisService.ts`**
- Uses Anthropic Haiku (`claude-haiku-4-5-20251001`) — fast, cheap (~$0.0001/call)
- Prompt analyzes `{ formName, contents }` and classifies into:
  - `legitimate` — real inquiry, pass through
  - `spam` — bot/bulk/automated
  - `sales` — vendor pitch, partnership, affiliate, SEO request
  - `low_quality` — test, gibberish, blank, placeholder
  - `malicious` — injection attempts, phishing
  - `irrelevant` — wrong form, wrong company, job application
  - `abusive` — harassment, threats, rants
- Returns: `{ flagged: boolean, category: string, reason: string }`
- Called after all other checks pass, before email send
- If flagged: save with `is_flagged=true` and `flag_reason`, skip email
- If not flagged: save normally, send email
- If AI call fails: default to not flagged (don't block legitimate submissions)

### 5. DB Migration

**New migration: `add_form_submission_flagging_columns.ts`**
- `ALTER TABLE website_builder.form_submissions ADD COLUMN is_flagged BOOLEAN DEFAULT FALSE`
- `ALTER TABLE website_builder.form_submissions ADD COLUMN flag_reason TEXT`
- `CREATE INDEX idx_form_submissions_is_flagged ON website_builder.form_submissions(is_flagged)`

### 6. FormSubmissionsTab — Flagged Support

**Backend changes:**
- `listFormSubmissions` in `UserWebsiteController`: accept `?flagged=true|false` filter
- `FormSubmissionModel.findByProjectId`: accept `is_flagged` filter
- Return `flaggedCount` alongside `unreadCount`

**Frontend changes (`FormSubmissionsTab.tsx`):**
- Add tab row: "All" | "Flagged" (with count badge)
- Flagged tab filters by `?flagged=true`
- Each flagged submission shows `flag_reason` in a subtle banner
- Wire filter in both DFYWebsite (user) and WebsiteDetail (admin)

### 7. Success Redirect

**Client (`buildFormScript` — both repos):**
- Replace the "Sent!" button + 3s timeout with `window.location.href='/success'`
- Error state remains the same (shows error, resets after 3s)

**Renderer (`website-builder-rebuild`):**
- New template: `src/templates/success-page.ts`
- Generic "Thank you" page styled to match the site
- In `siteRoute`: if path is `/success` and no DB page exists, serve the fallback

### 8. AlloroProtect Page Update

**In `alloro-site/src/pages/AlloroProtect.tsx`:**
- Fix subtitle: already correct "Multi-layered form security for every website we power" — user flagged a typo, will verify
- Add 4 new sections after the existing 6:
  - 7. Origin Validation
  - 8. Content Pattern Analysis
  - 9. JavaScript Verification
  - 10. AI-Powered Content Screening

### 9. Updated Pipeline Order

```
1. Honeypot check           (existing)
2. Timing check             (existing)
3. JS challenge verify      (NEW)
4. Basic field validation   (existing)
5. Origin validation        (NEW)
6. Payload caps             (existing)
7. Sanitization             (existing)
8. Content pattern scoring  (NEW)
9. Flood detection          (existing)
10. AI content analysis     (NEW) — only if all above pass
11. Persist submission
12. Email (only if not flagged)
```

### 10. Sync Both buildFormScript Copies

Both files must be identical after changes:
- `alloro-app/signalsai-backend/src/utils/website-utils/formScript.ts`
- `website-builder-rebuild/src/utils/renderer.ts` (inline `buildFormScript`)

Also update the frontend copy in `alloro-app/signalsai/src/utils/templateRenderer.ts` (preview renderer).

## Risk Analysis

Level 3 — Structural feature across 3 repos. AI integration adds external dependency and latency. Mitigated by:
- Haiku is fast (~500ms) and cheap
- AI failure defaults to "not flagged" (fail-open for legitimate submissions)
- All new layers use `silentOk` pattern (no new error surfaces for bots)
- Success redirect is the only user-visible behavior change

## Security Considerations

- Origin validation: skip if no Origin/Referer (don't block privacy-conscious users)
- AI prompt must not be injectable via form contents (contents passed as structured data, not interpolated into prompt)
- JS challenge algorithm is deterministic — sophisticated bots could reverse-engineer it from page source. This is intentional as a low-friction layer, not a silver bullet.

## Performance Considerations

- AI call adds ~500ms-1s per submission (Haiku)
- Content pattern scoring is pure string ops, negligible
- JS challenge verification is 1000 integer ops, negligible
- Origin validation adds one DB query (project lookup) but this is moved earlier from step 7, not added

## Definition of Done

- [x] JS challenge computed client-side, verified server-side
- [x] Origin validation checks request origin against project domains
- [x] Content pattern scoring rejects high-score submissions silently
- [x] AI content analysis flags spam/sales/malicious/etc
- [x] Flagged submissions saved with reason, email skipped
- [x] Migration adds is_flagged + flag_reason columns
- [x] FormSubmissionsTab has All/Flagged tabs with flag reason display
- [x] Success redirect on form submission
- [x] Renderer serves fallback success page
- [x] AlloroProtect page updated with new layers
- [x] All buildFormScript copies in sync
- [x] Both repos compile clean
