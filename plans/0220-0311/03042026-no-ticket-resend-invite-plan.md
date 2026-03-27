# Add Resend Invite Feature

## Problem Statement
No way to resend an invitation email if the original wasn't received or expired.

## Context Summary
- Invitations are created in `service.user-management.ts` with a 7-day expiry
- Pending invitations are listed in the UsersTab Pending Invitations section
- Email is sent via `sendEmail` (n8n webhook)
- Existing patterns: invite, remove, changeRole all follow service → controller → route → frontend

## Existing Patterns to Follow
- Service functions in `service.user-management.ts`
- Controller functions in `SettingsController.ts`
- Routes in `settings.ts` with `authenticateToken`, `rbacMiddleware`, `requireRole`
- Frontend uses `apiPost` from `../../api`

## Proposed Approach

### 1. Backend: `resendInvitation` service function
- Find invitation by ID and org
- Validate it's still pending
- Regenerate token and extend expiry (fresh 7-day window)
- Resend the same email template

### 2. Backend: Controller + Route
- `POST /api/settings/users/invite/:invitationId/resend`
- Requires admin or manager role

### 3. Frontend: Resend button in Pending Invitations table
- Add a "Resend" button per invitation row
- Show success/error via AlertModal

## Risk Analysis
- Level 1 — Suggestion. Adding a new endpoint. No breaking changes.

## Definition of Done
- [x] Service function resends invitation email with fresh token/expiry
- [x] Route wired with auth + role check (admin, manager)
- [x] Frontend Resend button in pending invitations table
- [x] TypeScript compiles clean
