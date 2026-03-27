# Auth Overhaul — Master Plan

**Date:** February 21, 2026
**Ticket:** no-ticket
**Tier:** Migration (Level 4 — Major Impact)
**Table naming decision:** `google_connections` (confirmed)

---

## Problem Statement

The application currently requires Google OAuth as the sole login method. All session identity flows through `google_account_id`. This must change to email/password auth, GA4/GSC must be fully removed, GBP retained as optional integration, and the data model restructured around `organization_id`.

---

## Execution Sequence

Each plan is a self-contained unit. Execute in order. Each plan has entry conditions (what must be true before starting) and exit conditions (what must be true before moving to the next).

| # | Plan File | Summary | Depends On |
|---|-----------|---------|------------|
| 01 | `01-ga4-gsc-backend-removal.md` | Delete GA4/GSC routes, controllers, services from backend | Nothing |
| 02 | `02-ga4-gsc-frontend-removal.md` | Delete GA4/GSC components, hooks, contexts, API files from frontend | 01 |
| 03 | `03-database-schema-migration.md` | Add columns to users/orgs, data migration, rename table to google_connections | 01, 02 |
| 04 | `04-backend-auth-transformation.md` | New register/login/verify endpoints, refactor middleware chain, replace x-google-account-id | 03 |
| 05 | `05-frontend-auth-transformation.md` | New signup/login/verify pages, refactor AuthContext, remove google_account_id dependency | 04 |
| 06 | `06-onboarding-redesign.md` | Redesign onboarding to use email/password flow, GBP as optional connection | 04, 05 |
| 07 | `07-settings-gbp-only.md` | Strip settings to GBP only, connect/disconnect via org-scoped Google connection | 03, 04 |
| 08 | `08-agent-infrastructure-update.md` | Migrate agent_results/tasks to organization_id, update orchestrator and payloads | 03, 04 |

---

## Shared Context

All sub-plans inherit from the original master analysis. Key facts:

### Current Data Model
```
users: id, email, name, password_hash (nullable)
google_accounts: id, user_id, google_user_id, email, tokens, profile fields, organization_id, onboarding state, property_ids
organizations: id, name, domain, subscription fields
organization_users: user_id, organization_id, role
```

### Target Data Model
```
users: id, email, name, first_name, last_name, phone, password_hash, email_verified, verification fields
organizations: id, name, domain, operational_jurisdiction, onboarding_completed, onboarding_wizard_completed, setup_progress, subscription fields
google_connections: id, organization_id, google_user_id, email, tokens, scopes, google_property_ids
organization_users: user_id, organization_id, role
```

### Session Identity Shift
- **Current:** `x-google-account-id` header → `tokenRefreshMiddleware` → `req.googleAccountId`
- **Target:** `Authorization: Bearer <JWT>` → `authenticateToken` → `req.user.userId` → `rbacMiddleware` → `req.organizationId`

### Architectural Decisions (Final)
1. JWT as primary session identity
2. `organization_id` as data scoping boundary
3. Table renamed to `google_connections`
4. OAuth scopes reduced to: openid, email, profile, business.manage
5. GBP OAuth is connection-only, not login

---

## Risk Summary

- **Level 4 — Major Impact**: 90+ files across frontend, backend, database
- **Data migration**: Must preserve all existing data during schema restructure
- **Session break**: Existing users will need to re-authenticate after deployment
- **Agent webhooks**: External consumers (n8n) that reference googleAccountId must be updated in coordination
- **Rollback strategy**: Each migration is reversible. Sub-plans can be paused independently.

---

## Resume Protocol

If execution is interrupted at any sub-plan:
1. Check which plan was in progress
2. Read that plan's "Exit Conditions" to see what's done
3. Resume from the incomplete step within that plan
4. Do NOT skip ahead — dependencies are strict
