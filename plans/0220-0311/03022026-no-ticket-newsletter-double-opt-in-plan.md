# Newsletter Double Opt-In — Branded Confirmation Flow

## Problem Statement

Newsletter signup forms accept any email and immediately trigger submission entries + email notifications. This results in fake/throwaway emails cluttering the system. There is no way to verify intent before saving the signup.

## Context Summary

- `formSubmissionController.ts` — central form pipeline, handles all form types today
- `buildFormScript` — client-side script in 3 locations (alloro-app backend, website-builder-rebuild, frontend preview), uses `data-form-name` attribute on forms
- `websiteContact.ts` — public routes: `POST /form-submission`
- `emailWebhookService.ts` — sends email via n8n webhook (`sendEmailWebhook`)
- `ProjectModel` has `primary_color`, `accent_color`, `hostname`, `custom_domain`
- `siteRoute` in website-builder-rebuild handles page rendering with fallback pages
- No `data-form-type` attribute exists yet in any form

## Existing Patterns to Follow

- Silent rejection pattern: `silentOk(res)` returns 200 to hide detection
- Service files in `websiteContact-services/`
- Template pages in `website-builder-rebuild/src/templates/` export functions returning HTML strings
- Email HTML uses inline styles, sent via `sendEmailWebhook`
- All security layers run before any branching

## Proposed Approach

### 1. Client-Side: Form Type Detection

**In `buildFormScript` (all 3 copies):**
- Read `data-form-type` attribute from the form element
- Include `formType` in the POST body: `formType: form.getAttribute('data-form-type') || 'contact'`
- No other client-side changes needed

### 2. DB Migration: `newsletter_signups` Table

**New migration: `create_newsletter_signups.ts`**
```sql
CREATE TABLE website_builder.newsletter_signups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES website_builder.projects(id) ON DELETE CASCADE,
  email VARCHAR(320) NOT NULL,
  token UUID NOT NULL DEFAULT gen_random_uuid(),
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, email)
);
CREATE INDEX idx_newsletter_signups_token ON website_builder.newsletter_signups(token);
CREATE INDEX idx_newsletter_signups_project_email ON website_builder.newsletter_signups(project_id, email);
```

### 3. Model: `NewsletterSignupModel`

- `create(data)` — insert new signup, return record
- `findByToken(token)` — find unconfirmed signup by token
- `findByProjectAndEmail(projectId, email)` — check for existing signup
- `confirm(id)` — set `confirmed_at = NOW()`

### 4. Controller: Newsletter Branch in `formSubmissionController`

After all security layers pass (honeypot, timing, JS challenge, origin, etc.):

```
if formType === "newsletter":
  → extract email from contents (first email-like field)
  → check if already confirmed for this project → silentOk (don't re-send)
  → check if pending and created < 5min ago → silentOk (debounce)
  → upsert into newsletter_signups (update token + created_at if exists)
  → build branded confirmation email using project.primary_color
  → send confirmation email to the subscriber
  → return success (redirect to /success still happens)
else:
  → existing contact form pipeline (unchanged)
```

### 5. Confirmation Email Template

**New service: `newsletterConfirmationService.ts`**
- `buildConfirmationEmail(email, confirmUrl, primaryColor, businessName?)` → HTML string
- Branded with `primary_color` from project
- Simple layout: logo area with color, "Confirm your subscription" heading, button with confirm URL, "If you didn't sign up, ignore this email" footer
- Confirm URL format: `https://{site-domain}/confirm?token={uuid}`
  - Site domain derived from: `project.custom_domain` ?? `{project.hostname}.sites.getalloro.com`

### 6. Public Confirm Endpoint

**New route in `websiteContact.ts`:**
- `GET /api/websites/confirm-newsletter?token={uuid}`
- Lookup signup by token
- If not found or already confirmed → redirect to site homepage
- If token is older than 24h → redirect to site homepage (expired)
- On valid confirm:
  1. Set `confirmed_at = NOW()`
  2. Save to `form_submissions` table (so it appears in the dashboard)
  3. Email site owner via existing pipeline
  4. Redirect to `https://{site-domain}/confirmed`

### 7. Confirmation Success Page

**In `website-builder-rebuild`:**
- New template: `src/templates/confirmed-page.ts` — "Subscription Confirmed!" page
- In `siteRoute`: if path is `/confirmed` and no DB page exists, serve the fallback
- Same pattern as the `/success` page

### 8. Updated Pipeline Order

```
1-9.  All existing security layers (unchanged)
10.   Branch by formType:
      ├── "newsletter" → double opt-in flow (steps 4-6 above)
      └── anything else → existing contact flow (AI analysis → persist → email)
```

### 9. Sync All `buildFormScript` Copies

All 3 must include `formType` in the POST body:
- `alloro-app/signalsai-backend/src/utils/website-utils/formScript.ts`
- `website-builder-rebuild/src/utils/renderer.ts`
- `alloro-app/signalsai/src/utils/templateRenderer.ts`

## Risk Analysis

Level 2 — Moderate scope. Isolated from existing contact form flow. Newsletter branch only activates when `data-form-type="newsletter"` is present on the form element. Existing forms without this attribute are completely unaffected.

## Security Considerations

- Token is UUID v4 — unguessable
- 24h expiry prevents indefinite token validity
- Debounce (5min) prevents confirmation email spam
- UNIQUE(project_id, email) prevents duplicate signups
- Confirm endpoint is public (no auth) — token-based access only
- Confirmation email sender uses same `CONTACT_FORM_FROM` env var

## Performance Considerations

- One extra DB query per newsletter submission (check existing signup)
- Confirmation email adds one webhook call per signup
- On confirm: one DB update + one form_submissions insert + one email — same as current pipeline
- No AI analysis needed for newsletter signups (single email field, nothing to classify)

## Definition of Done

- [x] `data-form-type` attribute read in buildFormScript (all 3 copies)
- [x] `formType` included in POST body
- [x] `newsletter_signups` table created via migration
- [x] `NewsletterSignupModel` with create/findByToken/confirm methods
- [x] Newsletter branch in formSubmissionController
- [x] Branded confirmation email using project.primary_color
- [x] `GET /api/websites/confirm-newsletter` endpoint with 24h token expiry
- [x] On confirm: save to form_submissions + email site owner
- [x] Redirect to `/confirmed` after successful confirmation
- [x] `/confirmed` fallback page in website-builder-rebuild siteRoute
- [x] All 3 buildFormScript copies in sync
- [x] Both repos compile clean
