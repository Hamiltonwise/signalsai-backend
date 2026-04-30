# Unified Recipient Settings

## Why
Website form recipients and agent notification recipients are configured in different ways today. Website forms use `website_builder.projects.recipients`; agent notification emails fall back to `google_connections.email`, which means the sender is whoever connected Google, not necessarily who should receive monthly insights.

## What
Create one recipient settings layer with two channels: `website_form` and `agent_notifications`. Admin Organization Settings can edit both; existing website recipient UI remains a second entry point for the same `website_form` source; monthly agent emails use `agent_notifications` instead of the Google connection email.

## Context

**Relevant files:**
- `src/controllers/websiteContact/formSubmissionController.ts` — resolves website form recipients before saving and emailing submissions.
- `src/utils/core/notificationHelper.ts` — creates in-app notifications and sends user emails; currently uses `google_connections.email`.
- `src/controllers/admin-websites/AdminWebsitesController.ts` — admin website recipient endpoints.
- `src/controllers/user-website/UserWebsiteController.ts` — client website recipient endpoints.
- `src/controllers/admin-organizations/AdminOrganizationsController.ts` — admin org settings backend home.
- `frontend/src/components/Admin/OrgSettingsSection.tsx` — admin org settings UI surface.
- `frontend/src/components/Admin/RecipientsConfig.tsx` — existing reusable website recipient editor.

**Patterns to follow:**
- Backend DB access should go through models/services, not inline queries in new controllers.
- Existing recipient editor UX: typed email chips, org-user quick-add, custom email input.
- Existing API patterns: thin routes/controllers and typed frontend API modules.

**Key decisions already made:**
- Channels are `website_form` and `agent_notifications`.
- Recipient values are email string arrays.
- Website form recipients must not be copied into a second table without a migration path; Org Settings and Website Detail must edit the same source.

## Constraints

**Must:**
- Add a canonical recipient settings resolver used by both website form emails and agent notification emails.
- Preserve existing website recipient behavior during migration.
- Keep existing Website Detail recipient UI working.
- Validate recipient email format server-side.
- Store which recipients a website submission was sent to in `form_submissions.recipients_sent_to`.
- Replace hardcoded fallback emails with env/config-backed fallback.

**Must not:**
- Keep two independent mutable recipient lists for the same channel.
- Continue relying on `google_connections.email` as the primary agent notification recipient.
- Send flagged website submissions by email.
- Refactor unrelated notification, PMS, or website builder code.

**Out of scope:**
- Per-location recipient rules.
- User-level notification preferences.
- Unsubscribe management.
- Changing in-app notification visibility.
- Leadgen audit "email me when ready" flow.

## Risk

**Level:** 3

**Risks identified:**
- Recipient drift if `website_builder.projects.recipients` and new recipient settings are both mutable → **Mitigation:** migrate existing values into the new canonical table, then route old website recipient endpoints through the new service.
- Email blast risk if fallback broadens from one Google account email to all org admins → **Mitigation:** explicit fallback order and no duplicate recipients; document it in service tests.
- Cross-channel confusion in UI → **Mitigation:** label sections as "Website Form Recipients" and "Agent Notification Recipients"; show fallback behavior under each.
- DB migration touches live email routing → **Mitigation:** backward-compatible resolver reads legacy project recipients only when the canonical `website_form` row is empty/missing.

**Pushback:**
- This should not be a "mirror" implemented by copying website recipients into org settings. That creates architectural drift. The org settings panel should be another editor for the same canonical `website_form` channel.

## Tasks

### T1: Recipient settings persistence
**Do:** Add `organization_recipient_settings` with `organization_id`, `channel`, `recipients`, timestamps, and a unique key on `(organization_id, channel)`. Backfill `website_form` from `website_builder.projects.recipients` where present.
**Files:** `src/database/migrations/*`, `src/models/OrganizationRecipientSettingsModel.ts`
**Verify:** `npx tsc --noEmit`; migration review for backfill and rollback safety.

### T2: Recipient resolver service
**Do:** Add a service that gets/updates recipients and resolves effective recipients with fallback order: explicit channel recipients → legacy project recipients only for unmigrated `website_form` rows → org admins → legacy Google connection email only for `agent_notifications` → env fallback. Deduplicate and normalize emails.
**Files:** `src/services/recipientSettingsService.ts`, `src/models/OrganizationUserModel.ts`, `src/models/GoogleConnectionModel.ts`
**Verify:** Unit/service-level checks for both channels and empty/fallback cases.

### T3: Backend routing integration
**Do:** Use the resolver in website form submission email routing, newsletter confirmed-subscriber owner notifications, and in `createNotification` email routing for `type: "agent"`. Keep existing website recipient endpoints but have them read/write the canonical `website_form` channel.
**Files:** `src/controllers/websiteContact/formSubmissionController.ts`, `src/controllers/websiteContact/newsletterConfirmController.ts`, `src/utils/core/notificationHelper.ts`, `src/controllers/admin-websites/AdminWebsitesController.ts`, `src/controllers/user-website/UserWebsiteController.ts`
**Verify:** `npx tsc --noEmit`; manual API checks for recipient reads/writes and form email recipient resolution.

### T4: Organization settings API
**Do:** Add admin org endpoints for reading/updating both recipient channels, returning configured recipients, effective fallback preview, and org user choices.
**Files:** `src/controllers/admin-organizations/AdminOrganizationsController.ts`, `src/routes/admin/organizations.ts`, `frontend/src/api/admin-organizations.ts`
**Verify:** API returns both channels for an org with and without explicit recipients.

### T5: Admin Organization Settings UI
**Do:** Add a recipients section in Organization Settings with two editable blocks: Website Form Recipients and Agent Notification Recipients. Reuse or extract the existing chip/add/remove UI so Website Detail and Org Settings stay visually consistent.
**Files:** `frontend/src/components/Admin/OrgSettingsSection.tsx`, `frontend/src/components/Admin/RecipientsConfig.tsx`, optional new `frontend/src/components/Admin/OrgRecipientSettingsSection.tsx`
**Verify:** `cd frontend && npx tsc --noEmit`; manually edit both channels and confirm Website Detail reflects `website_form` changes.

## Done
- [x] `npx tsc --noEmit` passes.
- [x] `cd frontend && npx tsc --noEmit` passes.
- [x] Website form submissions use canonical `website_form` recipients and still persist `recipients_sent_to`.
- [x] Website Detail recipient editor and Organization Settings website recipient editor read/write the same data.
- [x] Monthly agent notification emails use `agent_notifications` recipients before fallback.
- [x] Empty recipient fallback behavior is deterministic and does not use hardcoded personal emails.
- [x] No unrelated notification, PMS, or website builder refactors.

## Revision Log

### Rev 1 — 2026-05-01
**Change:** Route newsletter confirmed-subscriber owner notifications through the same `website_form` recipient resolver.
**Reason:** Newsletter confirmations persist as website form submissions and email the site owner, so leaving them on the old project/org-admin/hardcoded recipient path would keep recipient behavior split.
**Updated Done criteria:** Website form recipient routing includes regular submissions and confirmed newsletter subscriber notifications.
