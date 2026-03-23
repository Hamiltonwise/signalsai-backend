# Fix Invitation Acceptance for Password-Auth Users

## Problem Statement
When an admin invites a user via the Users & Roles settings, the invited user receives an email directing them to `/signin`. When they sign up via email/password and complete onboarding, `bootstrapOrganization` always creates a new org for them — ignoring the pending invitation. The user ends up in their own org instead of joining the inviting org.

The OTP flow handles this correctly (checks `InvitationModel.findPendingByEmail` in `onboardUser`), but the password-auth flow does not.

## Context Summary
- `InvitationModel.findPendingByEmail(email)` exists and works — used by OTP flow
- `InvitationModel.updateStatus(id, "accepted")` exists
- `bootstrapOrganization` is the single chokepoint for password-auth org creation
- Called from: `completeOnboardingForPasswordUser` and `saveProfileAndBootstrapOrg`
- Both callers pass `userId` — need to look up email from `UserModel`

## Existing Patterns to Follow
- OTP flow in `service.user-onboarding.ts`: checks `findPendingByEmail`, creates `OrganizationUserModel` with invitation role, marks invitation accepted
- `bootstrapOrganization` already guards against duplicate org creation via `OrganizationUserModel.findByUserId`

## Proposed Approach

### Backend: `OrganizationBootstrapService.bootstrapOrganization`
1. After the existing `findByUserId` guard, look up the user's email via `UserModel.findById`
2. Check `InvitationModel.findPendingByEmail(email)` for a pending invitation
3. If found and not expired:
   - Add user to the inviting org with the invited role via `OrganizationUserModel.create`
   - Mark invitation as accepted via `InvitationModel.updateStatus`
   - Return `{ organizationId: invitation.organization_id }`
   - Skip new org creation
4. If not found or expired: proceed with existing behavior (create new org)

### Why `bootstrapOrganization` and not `verifyEmail`?
- `bootstrapOrganization` is called during onboarding, not during email verification
- At verify-email time, the user has no org yet — that's normal for both invited and non-invited users
- The org assignment should happen during onboarding when the user provides their profile

## Risk Analysis
- Level 1 — Suggestion. Adding a check before org creation. No breaking changes. Falls through to existing behavior if no invitation found.

## Definition of Done
- [x] `bootstrapOrganization` checks for pending invitations before creating a new org
- [x] Invited user joins the inviting org with the correct role
- [x] Invitation status updated to "accepted"
- [x] Non-invited users still get a new org (existing behavior preserved)
- [x] Callers skip org name/domain overwrite when joining via invitation
- [x] TypeScript compiles clean
