# Admin Org + User Creation

**Date:** 02/26/2026
**Ticket:** no-ticket
**Tier:** Structural Feature

---

## Problem Statement

There is no way for admins to create organizations and user accounts from the admin panel. The only paths to create an org are:
1. User self-registers → goes through onboarding → org bootstrapped at Step 2
2. Google OAuth flow → org created during onboarding

For the admin-granted DFY use case, we need admins to create an organization with GBP data and an initial admin user account — all from the admin panel — so that the client can log in and skip onboarding entirely.

---

## Context Summary

### What Exists
- **Admin org list page:** `OrganizationManagement.tsx` — lists orgs, edit name, no create button
- **Admin org detail page:** `OrganizationDetail.tsx` — view/edit details, tier change, delete, pilot session
- **Admin API routes:** GET list, GET detail, PATCH name, PATCH tier, DELETE — **no POST create**
- **User creation:** `POST /api/auth/register` creates user with email + password (bcrypt 12 rounds), sends verification email
- **User model:** `UserModel.create({ email, password_hash, ... })` + `UserModel.setEmailVerified(id)`
- **Org-user link:** `OrganizationUserModel.create({ user_id, organization_id, role })` — roles: admin, manager, viewer
- **Org model:** `OrganizationModel.create({ name, domain, operational_jurisdiction })`
- **Location model:** `LocationModel` — locations belong to orgs
- **Google property model:** `GooglePropertyModel` — GBP properties linked to locations

### What's Missing
- No `POST /api/admin/organizations` endpoint
- No "Create Organization" button in admin UI
- No admin flow to create a user account on behalf of a client
- No admin flow to configure GBP without Google OAuth (admin enters GBP data manually or via Google API on behalf of client)

### Key Constraint — GBP Setup Without User's OAuth
The normal GBP flow requires the user's Google OAuth tokens. For admin-created orgs, the admin configures GBP. Two approaches:
- **Option A:** Admin connects their own Google account temporarily to set up GBP for the client, then the client re-connects later
- **Option B:** Admin manually enters GBP location data (name, address) without a Google connection — the client connects Google OAuth post-login to complete the sync

**Recommendation:** Option B. Admin creates the org with basic location info (name, address). The client connects Google OAuth from the dashboard after login. This is cleaner — no token ownership confusion, no shared OAuth state. The dashboard already has a "Connect GBP" prompt for orgs without google connections.

---

## Existing Patterns to Follow

1. **Admin controller pattern:** `AdminOrganizationsController.ts` — request validation, service call, response formatting
2. **Service pattern:** `TierManagementService.ts` — transactional business logic separated from HTTP
3. **Model pattern:** `OrganizationModel`, `UserModel`, `OrganizationUserModel` — Knex-based, static methods
4. **Password hashing:** bcrypt with 12 salt rounds (from `AuthPasswordController.ts`)
5. **Admin route protection:** `authenticateToken` + `superAdminMiddleware`
6. **Frontend admin pages:** React components with toast notifications, confirmation modals, API calls via `apiPost`/`apiGet`

---

## Proposed Approach

### 1. Backend — Admin Org Creation Service

**New file:** `signalsai-backend/src/controllers/admin-organizations/feature-services/AdminOrgCreationService.ts`

**Function:** `createOrganizationWithUser(data, trx)`

Transactional operation:
1. Validate email uniqueness (fail if user already exists)
2. Create organization record: `name`, `domain`, `operational_jurisdiction`
3. Hash password with bcrypt (12 rounds)
4. Create user record: `email`, `password_hash`, `email_verified = true` (admin-created users skip verification), `first_name`, `last_name`
5. Create org-user link: `organization_id`, `user_id`, `role = 'admin'`
6. Create primary location: `name` (same as org name), `organization_id`, `is_primary = true`
7. Set onboarding flags:
   - `onboarding_completed = true`
   - `onboarding_wizard_completed = true`
   - `setup_progress = { step1_api_connected: false, step2_pms_uploaded: false, dismissed: false, completed: false }`
8. Return created org + user IDs

**Input shape:**
```typescript
{
  organization: {
    name: string;
    domain?: string;
    address?: string;  // operational_jurisdiction
  };
  user: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
  };
  location: {
    name: string;
    address?: string;
  };
}
```

### 2. Backend — Admin Org Creation Controller

**Modify:** `signalsai-backend/src/controllers/admin-organizations/AdminOrganizationsController.ts`

**New function:** `createOrganization(req, res)`

- Validates required fields (org name, user email, user password)
- Password validation: min 8 chars, 1 uppercase, 1 number (same rules as registration)
- Calls `AdminOrgCreationService.createOrganizationWithUser()` in transaction
- Returns 201 with created org and user IDs

### 3. Backend — Admin Routes Update

**Modify:** `signalsai-backend/src/routes/admin/organizations.ts`

Add:
```
POST /api/admin/organizations  →  authenticateToken + superAdminMiddleware → createOrganization
```

### 4. Frontend — Admin API Module Update

**Modify:** `signalsai/src/api/admin-organizations.ts`

Add:
```typescript
export async function adminCreateOrganization(data: {
  organization: { name: string; domain?: string; address?: string };
  user: { email: string; password: string; firstName?: string; lastName?: string };
  location: { name: string; address?: string };
}): Promise<{ success: boolean; organizationId: number; userId: number }>
```

### 5. Frontend — Create Organization Modal/Form

**Modify:** `signalsai/src/pages/admin/OrganizationManagement.tsx`

Add "Create Organization" button at the top of the org list page.

**On click:** Opens a multi-step modal (or expandable form) with:

**Section 1 — Organization Info:**
- Organization name (required)
- Domain (optional)
- Address (optional)

**Section 2 — Location Info:**
- Location name (required — defaults to org name)
- Location address (optional)

**Section 3 — Admin User Account:**
- Email (required)
- Temporary password (required — with generate random option)
- First name (optional)
- Last name (optional)

**Submit button:** "Create Organization"

**On success:**
- Toast: "Organization created successfully"
- Refresh org list
- Optionally navigate to the new org's detail page

**On error:**
- Show validation errors inline (email already exists, password too weak, etc.)

### 6. Post-Creation — Admin Promotes to DFY

After creating the org, the admin navigates to the org detail page and uses the existing "Upgrade to DFY" button to promote the org. This triggers `TierManagementService.updateTier()` which auto-creates the website project.

This is intentionally separate — not all admin-created orgs need DFY immediately. The admin has control.

### 7. Client Login Experience

When the admin-created user logs in:

1. `POST /api/auth/login` — email + password → JWT token
2. App checks `GET /api/onboarding/status` → `onboarding_completed: true`
3. Onboarding is skipped → straight to dashboard
4. Dashboard shows:
   - "Connect Google Business Profile" prompt (since no google connection exists)
   - If DFY: website section accessible
   - If no Stripe subscription: billing CTA (handled by Ticket D)

### 8. Onboarding Flag Pre-Completion Details

The service must set these flags correctly so the client never sees the onboarding flow:

| Flag | Value | Location |
|------|-------|----------|
| `onboarding_completed` | `true` | `organizations` table |
| `onboarding_wizard_completed` | `true` | `organizations` table |
| `setup_progress` | `{ step1_api_connected: false, ... }` | `organizations.setup_progress` JSONB |
| `email_verified` | `true` | `users` table |

The `setup_progress` steps are set to `false` because the client hasn't actually connected APIs or uploaded PMS data — but the onboarding gate itself (`onboarding_completed`) is bypassed.

The setup wizard (28-step product tour) is also marked complete (`onboarding_wizard_completed = true`) since it's irrelevant for admin-created accounts that may have a non-standard setup.

---

## Risk Analysis

| Risk | Level | Mitigation |
|------|-------|------------|
| Admin creates user with weak password | Level 1 | Enforce same password validation as registration (8+ chars, uppercase, number). Consider auto-generate option. |
| Duplicate email on user creation | Level 1 | Check uniqueness before insert. Return clear error. |
| Org created but no GBP connected | Level 1 | Expected state. Dashboard shows "Connect GBP" prompt. App handles null google connections gracefully (already verified in context-building). |
| Admin forgets to promote to DFY | Level 1 | Org defaults to DWY. Admin can promote later. No data corruption risk. |
| Transaction failure mid-creation | Level 2 | Entire operation wrapped in Knex transaction. All-or-nothing. No partial org/user records. |

---

## Definition of Done

- [ ] `POST /api/admin/organizations` endpoint created behind `superAdminMiddleware`
- [ ] `AdminOrgCreationService.createOrganizationWithUser()` handles: org creation, user creation (bcrypt), org-user link, primary location, onboarding flag pre-completion — all in a single transaction
- [ ] Password validation enforced (same rules as registration)
- [ ] Email uniqueness enforced with clear error message
- [ ] `email_verified = true` set on admin-created users (skip email verification)
- [ ] `onboarding_completed = true` and `onboarding_wizard_completed = true` set on org
- [ ] Frontend: "Create Organization" button on `OrganizationManagement.tsx`
- [ ] Frontend: Multi-section form (org info, location, user account) with validation
- [ ] Frontend API function `adminCreateOrganization()` added
- [ ] Admin-created user can log in with email + password and land on dashboard (no onboarding)
- [ ] Dashboard shows "Connect GBP" prompt for admin-created orgs without google connections

---

## Security Considerations

- Admin-created passwords are hashed with bcrypt (12 rounds) — same as registration
- Users should be told to change their password on first login (consider: add `must_change_password` flag for future enhancement — out of scope for this ticket)
- Only super admins can create orgs (enforced by middleware)
- No verification email sent for admin-created accounts — `email_verified` set to `true` directly

---

## Performance Considerations

- Single transaction with 4-5 inserts — negligible performance impact
- No external API calls during creation (GBP is deferred to client post-login)

---

## Dependency Impact

- **No new npm packages**
- **No new migrations** — all tables and columns already exist
- **Modifies existing files:** `AdminOrganizationsController.ts`, `admin/organizations.ts` routes, `OrganizationManagement.tsx`, `admin-organizations.ts` API module
- **New file:** `AdminOrgCreationService.ts`
- **Independent of Ticket A** — can be built in parallel with Stripe Billing Core
