# Fix Stale user_role in localStorage

## Problem Statement
`user_role` in localStorage is set during login and never refreshed. For users who signed up via email/password, the role defaults to `"viewer"` at login time (before org/admin role exists). After onboarding creates the org with "admin" role, localStorage still has `"viewer"`. This hides "Invite Member", "Add Location", and other admin-gated buttons across multiple components.

## Context Summary
- `user_role` set in localStorage during login: `orgUser?.role || "viewer"`
- Read by: PropertiesTab, UsersTab, Settings, Sidebar, PMSVisualPillars, TasksView
- Onboarding status API (`GET /api/onboarding/status`) called on every page load via AuthContext — does NOT return role
- `OrganizationUserModel.findByUserAndOrg(userId, orgId)` returns the org_user row with role

## Existing Patterns to Follow
- AuthContext updates localStorage for `onboardingCompleted`, `hasProperties`
- Onboarding status response already returns `organizationId`

## Proposed Approach

### 1. Backend: Add `role` to onboarding status response
- In `OnboardingController.getOnboardingStatus`, look up the user's role via `OrganizationUserModel`
- Add `role` field to all 3 response branches (no org, org no google, org with google)

### 2. Frontend: AuthContext updates localStorage on load
- In `AuthContext.loadUserProperties`, when status response includes `role`, update `localStorage.user_role`
- All components reading `getPriorityItem("user_role")` will get the correct value on next mount/render

## Risk Analysis
- Level 1 — Suggestion. Adding a field to an existing API response. No breaking changes.

## Definition of Done
- [x] Onboarding status API returns `role` field
- [x] AuthContext updates `user_role` in localStorage from API response
- [x] "Invite Member" button visible for admin users after onboarding
- [x] TypeScript compiles clean
