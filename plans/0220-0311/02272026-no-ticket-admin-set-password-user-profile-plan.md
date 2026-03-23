# Admin Set Password + User Profile Settings

**Date:** 02/27/2026
**Ticket:** no-ticket
**Status:** Executed

---

## Problem Statement

Legacy users who signed up via Google OAuth don't have a `password_hash` in the `users` table. They cannot log in via email/password. Two things are needed:

1. **Admin ability** to set a temporary password for any user, with an optional "Notify User" checkbox that emails them about the change.
2. **User-facing Profile tab** in Settings (after Billing) where users can set or change their own password.

---

## Context Summary

- **Users table** already has `password_hash` (nullable), `email_verified`, `first_name`, `last_name`, `phone`.
- **UserModel** already has `updatePasswordHash(id, hash)` and `findById(id)`.
- **Admin panel**: OrganizationDetail.tsx shows users in a card grid (lines 512-549). Each user card has name, email, and a "pilot" button. No edit capability exists.
- **Admin backend**: `getById` handler (AdminOrganizationsController.ts:87-94) maps user data but does NOT expose whether a user has a password.
- **Settings page**: Settings.tsx has 3 tabs — `profile` (Integrations), `users`, `billing`. Tab state type is `"profile" | "users" | "billing"`.
- **Email service**: `sendEmail()` in `emailService.ts` accepts `{ subject, body, recipients }` and sends via n8n webhook.
- **Password rules**: 8+ chars, 1 uppercase, 1 number. Bcrypt with 12 salt rounds.
- **Frontend URL**: `/settings` is the settings page. Profile tab would be at `/settings` with `activeTab=account`.
- **App domain**: `app.getalloro.com` in production.

---

## Existing Patterns to Follow

- **Admin endpoints**: Express routes in `routes/admin/organizations.ts`, gated by `authenticateToken` + `superAdminMiddleware`. Controller in `controllers/admin-organizations/`.
- **Admin API client**: `api/admin-organizations.ts` — typed functions using `apiPost`/`apiPatch`.
- **Frontend admin UI**: User cards in OrganizationDetail.tsx use Lucide icons, Tailwind, and `toast` for feedback.
- **Email HTML**: Inline-styled HTML (see AuthPasswordController.ts registration email pattern).
- **Password handling**: Bcrypt hash in `AuthPasswordController.ts`, validation via `isStrongPassword()`.
- **Settings tabs**: Pill-style buttons in Settings.tsx, content swapped via `activeTab` state.
- **Backend profile routes**: `routes/settings.ts` and `routes/profile.ts` with `authenticateToken` + `rbacMiddleware`.

---

## Proposed Approach

### Part 1: Admin Set Password

#### Backend

**New admin route** in `routes/admin/organizations.ts`:
```
POST /api/admin/users/:userId/set-password
```

**New controller function** in `AdminOrganizationsController.ts`:
- Accepts: `{ notifyUser: boolean }` in body
- Generates a random 12-char temporary password (uppercase, lowercase, numbers)
- Hashes with bcrypt (12 rounds)
- Updates `password_hash` via `UserModel.updatePasswordHash()`
- Marks `email_verified = true` (so they can log in immediately)
- If `notifyUser === true`, sends email via `sendEmail()` with:
  - Subject: "Your Alloro password has been set"
  - Body: Greeting, temporary password in styled box, link to `/settings` to change it, recommendation to change immediately
- Returns: `{ success: true, temporaryPassword: string }` (admin sees it once to communicate via other channels if needed)

**Modify `getById` handler**: Add `has_password: boolean` field to user mapping so admin UI can show password status.

#### Frontend

**Modify `AdminUser` interface** in `api/admin-organizations.ts`:
- Add `has_password: boolean`

**New API function** in `api/admin-organizations.ts`:
```ts
adminSetUserPassword(userId: number, notifyUser: boolean)
```

**Modify OrganizationDetail.tsx** user cards (lines 522-548):
- Add a visual indicator (badge/icon) showing whether user has a password set
- Add a "Set Password" button (key icon) on each user card
- On click: opens a small modal with:
  - User name/email displayed
  - Checkbox: "Notify user via email" (default: checked)
  - "Set Temporary Password" button
  - On success: shows the generated password in a copyable field + success toast
  - Close button

### Part 2: User Profile Tab in Settings

#### Backend

**New endpoint** in `routes/settings.ts` or new `routes/account.ts`:
```
PUT /api/settings/password
```

**Controller logic**:
- Authenticated user only (from JWT)
- Body: `{ currentPassword?: string, newPassword: string, confirmPassword: string }`
- If user HAS a `password_hash`: require `currentPassword`, verify with bcrypt
- If user has NO `password_hash` (legacy Google user): skip `currentPassword` check — this is "Set Password" mode
- Validate new password strength (same rules)
- Validate `newPassword === confirmPassword`
- Hash and store via `UserModel.updatePasswordHash()`
- Mark `email_verified = true` if not already
- Return: `{ success: true }`

**New endpoint** to check password status:
```
GET /api/settings/password-status
```
- Returns: `{ hasPassword: boolean }`

#### Frontend

**New component**: `components/settings/ProfileTab.tsx`
- Displays user info (email — read only, first name, last name, phone — editable)
- Password section:
  - If `hasPassword === false`: "Set Password" header, only new password + confirm fields
  - If `hasPassword === true`: "Change Password" header, current password + new password + confirm fields
- Same password validation rules shown inline (8+ chars, 1 uppercase, 1 number)
- Submit button with loading state
- Success toast on completion

**Modify Settings.tsx**:
- Add 4th tab: "Account" (with User icon) after Billing
- Tab state type becomes `"profile" | "users" | "billing" | "account"`
- Render `<ProfileTab />` when `activeTab === "account"`

**New API functions** in `api/profile.ts` or new `api/account.ts`:
```ts
changePassword(data: { currentPassword?: string, newPassword: string, confirmPassword: string })
getPasswordStatus(): Promise<{ hasPassword: boolean }>
```

---

## Risk Analysis

**Level 1 — Low Risk**

- No database migration needed — `password_hash`, `email_verified` columns already exist.
- No auth flow changes — existing login works as-is once `password_hash` is populated.
- Admin endpoint is gated behind `superAdminMiddleware` — no privilege escalation risk.
- User password change requires JWT auth — no unauthenticated access.

**Concerns:**
- Temporary password is returned in the API response to admin — acceptable since admin panel is already privileged. Password is also optionally emailed.
- The "Set Password" mode (no current password required for legacy users) is intentional for migration but should only work when `password_hash IS NULL`. Once set, changing requires current password.

---

## Definition of Done

1. Admin can see which users have/don't have a password in the OrganizationDetail user cards.
2. Admin can click "Set Password" on any user, which generates a temp password.
3. Admin can optionally notify the user via email with the temp password and a link to change it.
4. Admin sees the generated password once in the modal for manual communication.
5. Users see a new "Account" tab in Settings after Billing.
6. Users without a password can set one (no current password required).
7. Users with a password can change it (current password required).
8. Password validation enforces existing rules (8+ chars, 1 uppercase, 1 number).
9. All new endpoints are properly authenticated and authorized.

---

## Security Considerations

- Temporary passwords are auto-generated with sufficient entropy (12 chars, mixed case + numbers).
- Bcrypt with 12 salt rounds — consistent with existing pattern.
- Admin set-password endpoint requires super admin auth — no escalation vector.
- User change-password endpoint requires valid JWT — no unauthenticated access.
- Legacy "Set Password" mode only available when `password_hash IS NULL` — once set, current password is always required to change.
- Email notification is optional — admin controls whether temp password is emailed.
- Temp password shown once to admin — not stored in plaintext anywhere.

---

## Blast Radius Analysis

- **Backend**: 2-3 new endpoints, minor modification to 1 existing endpoint (getById user mapping).
- **Frontend admin**: Modification to OrganizationDetail.tsx (user cards + modal), addition to admin API client.
- **Frontend settings**: New ProfileTab component, minor modification to Settings.tsx (add tab).
- **No database changes**: All columns already exist.
- **No auth flow changes**: Existing login/OTP/Google flows unaffected.
- **No breaking changes**: All additions are additive.
