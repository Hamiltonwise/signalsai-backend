# Eliminate HamiltonWise References

## Problem Statement

The codebase has lingering `hamiltonwise.com` references from the pre-Alloro era. The most impactful: the legacy Mailgun email system (`mail.ts`) actively sends OTP and invitation emails from `noreply@email.hamiltonwise.com` branded as "SignalsAI." This confuses recipients and undermines the Alloro brand. Additional stale references exist in environment variables, OAuth config, and domain mappings.

## Context Summary

**Two parallel email systems exist:**

1. **Modern (n8n webhook)** — `src/emails/emailService.ts`
   - Sends via n8n webhook → Mailgun on the `email.getalloro.com` domain
   - From: `info@getalloro.com` / "Alloro"
   - Used by: `AuthPasswordController` (registration, verification, password reset), admin notifications, user notifications, error alerts, inquiries
   - Has: logging, validation, branded HTML templates via `base.ts`

2. **Legacy (direct Mailgun)** — `src/utils/core/mail.ts`
   - Sends directly via Mailgun SDK on `email.hamiltonwise.com` domain
   - From: `SignalsAI <noreply@email.hamiltonwise.com>`
   - Used by: `service.otp-generation.ts` (OTP login), `service.user-management.ts` (invitations)
   - Has: no logging, no validation, inline HTML templates, old branding

**Active consumers of legacy `mail.ts`:**
- `src/controllers/auth-otp/feature-services/service.otp-generation.ts` → `sendOTP()`
- `src/controllers/settings/feature-services/service.user-management.ts` → `sendInvitation()`

**Other hamiltonwise references:**
- `.env` line 4-5: `DB_USER=hamiltonwise`, `DB_PASSWORD=hamiltonwise22` (DB credentials — leave alone, infrastructure concern)
- `.env` line 45-46: `MAILGUN_API_KEY`, `MAILGUN_DOMAIN=email.hamiltonwise.com`
- `.env` line 48: `SUPER_ADMIN_EMAILS=info@hamiltonwise.com,laggy80@gmail.com`
- `.env` line 76: `CONTACT_FORM_RECIPIENTS` includes `info@hamiltonwise.com` and `rustinedave@hamiltonwise.com`
- `oauthConfig.ts` line 9: `email: "info@hamiltonwise.com"` (hardcoded)
- `domainMappings.ts` line 16: comment referencing `info@hamiltonwise account`
- `domainMappings.ts` lines 77-87: HamiltonWise domain mapping entry (legitimate client data — leave alone)
- `.github/workflows/main.yml` line 40: `git clone https://github.com/Hamiltonwise/signalsai.git` (GitHub org name — leave alone)

## Existing Patterns to Follow

- `AuthPasswordController` already uses `sendEmail()` from `emailService.ts` with inline HTML for verification/reset codes — same pattern we'll follow for OTP and invitations
- All n8n emails use `{ subject, body, recipients }` shape via `SendEmailOptions`
- Branded template wrapper available via `wrapInBaseTemplate()` from `base.ts`
- Email service returns `EmailResult` with `{ success, messageId?, error?, timestamp }`

## Proposed Approach

### Step 1 — Migrate OTP Email to n8n System

**File:** `src/controllers/auth-otp/feature-services/service.otp-generation.ts`

- Replace `import { sendOTP } from "../../../utils/core/mail"` with `import { sendEmail } from "../../../emails/emailService"`
- Rewrite `createAndSendOtp()` to build HTML body inline (matching the pattern in `AuthPasswordController`) and call `sendEmail({ subject, body, recipients })`
- Subject: "Your Alloro Login Code" (not "SignalsAI")
- Return `result.success` to maintain the existing boolean contract

### Step 2 — Migrate Invitation Email to n8n System

**File:** `src/controllers/settings/feature-services/service.user-management.ts`

- Replace `import { sendInvitation } from "../../../utils/core/mail"` with `import { sendEmail } from "../../../emails/emailService"`
- Rewrite the `inviteUserToOrganization()` email section to build HTML body inline and call `sendEmail({ subject, body, recipients })`
- Subject: "You've been invited to join {orgName} on Alloro" (not "SignalsAI")
- All copy references changed from "SignalsAI" to "Alloro"
- Return `result.success` to maintain the existing boolean contract

### Step 3 — Delete Legacy mail.ts

**File:** `src/utils/core/mail.ts`

- Delete the entire file
- It exports: `sendEmail`, `sendOTP`, `sendVerificationCode`, `sendPasswordResetCode`, `sendInvitation`
- After Steps 1-2, no consumers remain (the AuthPasswordController already uses the n8n system and does NOT import from `mail.ts`)
- Verify no other imports reference this file

### Step 4 — Clean Up Environment Variables

**File:** `.env`

- Remove `MAILGUN_API_KEY` and `MAILGUN_DOMAIN` lines (no longer needed after mail.ts deletion)
- Update `SUPER_ADMIN_EMAILS`: replace `info@hamiltonwise.com` with `info@getalloro.com`
- Update `CONTACT_FORM_RECIPIENTS`: replace `info@hamiltonwise.com` and `rustinedave@hamiltonwise.com` with appropriate `@getalloro.com` addresses (confirm with user)
- Leave `DB_USER` and `DB_PASSWORD` alone — changing DB credentials is an infrastructure operation, not a code change

### Step 5 — Fix oauthConfig.ts

**File:** `src/controllers/googleauth/utils/oauthConfig.ts`

- Line 9: Change `email: "info@hamiltonwise.com"` to `email: "info@getalloro.com"`

### Step 6 — Clean Up domainMappings.ts Comment

**File:** `src/utils/core/domainMappings.ts`

- Line 16: Update comment from `relates to parent info@hamiltonwise account` to `relates to parent info@getalloro.com account`
- Leave the HamiltonWise domain mapping entry (lines 77-87) as-is — it's a legitimate client/business entry

### Step 7 — Remove Mailgun Dependency (if no longer used elsewhere)

- Check if `mailgun.js` and `form-data` packages are used anywhere else
- If `mail.ts` was the sole consumer, remove from `package.json` via `npm uninstall mailgun.js form-data`

## Risk Analysis

**Escalation: Level 2 — Concern**

- OTP login and invitation emails are user-facing flows. If the n8n webhook is down, these emails won't send. However, this is already the case for all other email flows (registration, password reset) — so no new risk is introduced.
- The `sendEmail()` return shape changes from `boolean` to `EmailResult`. Both consumers check truthiness, but we need to adapt to check `result.success` explicitly.

## Security Considerations

- No secrets are being added or exposed
- The `.env` changes remove unused credentials (Mailgun API key)
- OAuth email reference update is cosmetic — the actual auth tokens remain env-driven

## Performance Considerations

- No performance impact. The n8n webhook path is already handling the majority of email volume.

## Blast Radius Analysis

- **OTP login flow** — users logging in via OTP will receive emails from `info@getalloro.com` branded as Alloro instead of `noreply@email.hamiltonwise.com` branded as SignalsAI
- **Invitation flow** — invited users will receive properly branded Alloro emails
- **No other flows affected** — AuthPasswordController already uses the n8n system

## Definition of Done

- [ ] OTP emails send via n8n webhook with correct Alloro branding
- [ ] Invitation emails send via n8n webhook with correct Alloro branding
- [ ] `src/utils/core/mail.ts` deleted
- [ ] `MAILGUN_API_KEY` and `MAILGUN_DOMAIN` removed from `.env`
- [ ] `SUPER_ADMIN_EMAILS` updated to use `@getalloro.com`
- [ ] `CONTACT_FORM_RECIPIENTS` updated (pending user input on addresses)
- [ ] `oauthConfig.ts` email updated to `info@getalloro.com`
- [ ] `domainMappings.ts` comment updated
- [ ] `mailgun.js` and `form-data` dependencies removed if unused elsewhere
- [ ] No remaining imports of `utils/core/mail`
- [ ] Zero `hamiltonwise` references in source code (excluding DB credentials, GitHub org name, and legitimate client domain mapping)
