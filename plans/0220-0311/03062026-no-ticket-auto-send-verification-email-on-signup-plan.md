# Auto-Send Verification Email on Signup

## Problem Statement
When a user registers, the backend generates a 6-digit verification code and stores it in the DB but never emails it. The user lands on the Verify Email page which says "Enter the 6-digit code sent to [email]" but no code was actually sent. The user has to manually click "Resend code" to receive the email.

## Context Summary
- `register()` in `AuthPasswordController.ts` generates code, saves to DB, only logs to console
- `resendVerification()` in the same file already has the working email send pattern
- `sendEmail` is already imported in the controller
- Frontend `VerifyEmail.tsx` assumes the code was already sent on arrival

## Existing Patterns to Follow
- Same email template and `sendEmail()` call used in `resendVerification()`

## Proposed Approach
- Add `sendEmail()` call in the `register` function after user creation, using the same template as `resendVerification`
- Remove the misleading "no auto-send" comment

## Risk Analysis
- Level 1 — Minor fix. `sendEmail` is already used in the same file. No new dependencies.

## Definition of Done
- Registration endpoint sends the verification email automatically
- Misleading comment removed
