# Manual Verification Code Send & Backend Logging

## Problem Statement
During onboarding, the verification code is auto-sent on registration. This means you can't onboard a user without them receiving the OTP email. Need the ability to capture the code from backend logs and type it in manually.

## Context Summary
- `POST /api/auth/register` — creates user, generates 6-digit code, auto-sends email via n8n webhook
- `POST /api/auth/resend-verification` — generates new code, sends email (manual trigger already exists)
- `VerifyEmail.tsx` — has "Resend Code" button with 60s cooldown
- Code stored in `users` table: `email_verification_code` + `email_verification_expires_at`

## Existing Patterns to Follow
- `console.log(`[AUTH] ...`)` logging convention
- `generateSixDigitCode()` from `service.otp-generation.ts`

## Proposed Approach

### 1. `AuthPasswordController.ts` — `register()`
- Remove the `sendEmail()` call (code is still generated and stored)
- Add `console.log` that outputs the verification code
- Update response message to indicate user should click "Send Code"

### 2. `AuthPasswordController.ts` — `resendVerification()`
- Add `console.log` that outputs the verification code before sending email
- Email sending stays (this is now the manual trigger)

### 3. No frontend changes needed
- VerifyEmail page already has "Resend Code" button
- User flow: register → land on verify page → click "Resend Code" to send email OR admin reads code from backend log

## Risk Analysis
- Level 1 — Suggestion. Logging OTP codes is fine for dev/staging. In production, the code is ephemeral (10-min TTL) and only visible to whoever has server log access.

## Security Considerations
- OTP codes in logs are acceptable for internal tooling — same access level as direct DB access
- Codes still expire after 10 minutes

## Definition of Done
- [x] Registration does NOT auto-send verification email
- [x] Verification code is logged in backend console on register and resend
- [x] "Resend Code" button on VerifyEmail page still works (sends email)
- [x] TypeScript compiles clean
