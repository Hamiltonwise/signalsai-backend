# Alloro App Changelog

All notable changes to Alloro App are documented here.

## [0.0.12] - April 2026

### Allow Manager Role to Rename a Location

Manager-role users can now rename a location from Settings → Properties without escalating to an org admin. Rename is lightweight metadata and no longer requires full `canManageConnections` admin privilege. All other location management actions (Change GBP, Set Primary, Delete, Add Location, change domain) remain admin-only.

**Key Changes:**
- Backend `PUT /api/locations/:id` is now accessible to both `admin` and `manager` roles
- Server-side field-level guard rejects non-admin attempts to modify `domain` or `is_primary` with `403` — defense in depth, the client is not authoritative
- Frontend `PropertiesTab` exposes a distinct `canRenameLocation` flag (admin OR manager); the inline name-edit affordance uses this flag while every other action remains gated on `canManageConnections` (admin-only)
- Viewer role remains fully read-only; no edit affordance is rendered

**Commits:**
- `src/routes/locations.ts` — widened role gate on `PUT /:id` from `admin` to `admin, manager`; added field-level guard blocking `domain`/`is_primary` modification for non-admin roles
- `frontend/src/components/settings/PropertiesTab.tsx` — added `canRenameLocation` flag; swapped `canManageConnections` → `canRenameLocation` on the two call sites that gate the name-edit UI (click handler and hover pencil icon)

## [0.0.11] - April 2026

### PM QA Bug Fixes + UX Polish

Full Playwright QA pass on the PM feature surfaced five confirmed bugs and five friction points. All fixed before production rollout.

**Bug Fixes:**
- Task cards now immediately show "by dave" (creator name) and "→ dave" (assignee name) on creation and assignment — backend `createTask` and `assignTask` responses now enrich with LEFT JOIN on users
- Deadline panel display no longer shows the wrong date (off-by-one) — changed from `.slice(0, 10)` on a UTC ISO string to `toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" })` to get the correct PST date
- ME kanban card clicks now open the task detail panel — moved click handler to outer draggable div with a `didDrag` ref to distinguish click vs drag
- Text no longer selects during ME kanban drag — added `userSelect: "none"` to draggable elements
- ME kanban drag to DONE column now works reliably — replaced `pointerWithin` collision detection with `rectIntersection` filtered to column droppables only
- Fixed missing `format` import in `pmDateFormat.ts` that would crash for far-future deadlines

**UX Improvements:**
- Truncated task titles show full text as native browser tooltip (`title` attribute) on both kanban and ME kanban cards
- Task detail panel now shows "Created by {name} · X ago" metadata row at the bottom
- ME kanban columns show an orange border ring + subtle scale on drag-over for clearer drop targeting
- ME task cards show assignee name (`→ name`) when set
- Old notifications without `actor_name` in metadata are now enriched server-side via actor email fallback

**Commits:**
- `src/controllers/pm/PmTasksController.ts` — `enrichTask()` helper, applied to createTask + assignTask
- `frontend/src/components/pm/TaskDetailPanel.tsx` — PST deadline display fix, creator metadata row
- `frontend/src/components/pm/MeKanbanBoard.tsx` — click vs drag fix, column collision detection, drop zone ring
- `frontend/src/components/pm/MeTaskCard.tsx` — no-select on drag, assignee display, title tooltip
- `frontend/src/components/pm/TaskCard.tsx` — title tooltip
- `frontend/src/utils/pmDateFormat.ts` — `format` import fix
- `src/controllers/pm/PmNotificationsController.ts` — server-side actor_name enrichment

## [0.0.10] - April 2026

### Session Expired Crash Fix (ALLORO-FRONTEND-Q)

Users with expired JWT tokens hitting `/settings/billing` saw a white screen — "Something went wrong." — because the billing page crashed trying to render a 403 error response as billing data. The app now detects expired tokens globally and shows a "Session Expired" modal prompting re-login.

**Key Changes:**
- Global 403 axios interceptor in `api/index.ts` — detects `"Invalid or expired token"` responses, dispatches `session:expired` event with dedup flag to prevent multiple modals
- `SessionExpiredModal` component — non-dismissible dark glassmorphic modal, clears all auth state (localStorage, sessionStorage, query cache, cookies), broadcasts logout to other tabs, redirects to `/signin`
- Mounted in `App.tsx` at top level alongside `<Toaster />`
- `BillingTab.tsx` defensive guard — changed `success !== false` to `success === true` so malformed API responses never set state

**Commits:**
- `frontend/src/api/index.ts` — 403 interceptor with `sessionExpiredFired` dedup flag
- `frontend/src/components/SessionExpiredModal.tsx` — new modal component
- `frontend/src/App.tsx` — mount SessionExpiredModal
- `frontend/src/components/settings/BillingTab.tsx` — tighten response guards

## [0.0.9] - March 2026

### Billing Quantity Override for Flat-Rate Legacy Clients

Caswell Orthodontics and One Endodontics have flat-rate deals — they pay for a single unit regardless of how many locations they have. A new `billing_quantity_override` column on organizations allows per-org override of the Stripe subscription quantity, bypassing the automatic location count.

**Key Changes:**
- Migration `20260323000001_add_billing_quantity_override` — adds nullable integer column, seeds `1` for Caswell (org 25) and One Endo (org 39)
- `BillingService.createCheckoutSession()` — uses override when set, falls back to location count
- `BillingService.syncSubscriptionQuantity()` — uses override when set, prevents location add/remove from changing the billed quantity
- `IOrganization` interface — added `billing_quantity_override: number | null`

**Commits:**
- `src/database/migrations/20260323000001_add_billing_quantity_override.ts` — column + seed data
- `src/controllers/billing/BillingService.ts` — guard clauses in checkout and quantity sync
- `src/models/OrganizationModel.ts` — interface update

## [0.0.8] - March 2026

### Stripe Subscription Quantity Sync on Location Change

Adding or removing a location now automatically updates the Stripe subscription quantity and sends an email notification to org admins with the billing change details.

**Key Changes:**
- `syncSubscriptionQuantity()` in BillingService — retrieves Stripe subscription, compares item quantity to current location count, updates if different
- Hooked into `LocationService.createLocation()` and `removeLocation()` as fire-and-forget after transaction commits
- Email notification to org admins: old/new quantity, unit price, new monthly total, proration note
- Best-effort: Stripe failures are logged but never block location operations
- No-op for admin-granted orgs (no `stripe_subscription_id`)

**Commits:**
- `signalsai-backend/src/controllers/billing/BillingService.ts` — Add syncSubscriptionQuantity() with Stripe update + email notification
- `signalsai-backend/src/controllers/locations/LocationService.ts` — Hook sync into createLocation() and removeLocation()

## [0.0.7] - March 2026

### Rybbit Analytics Integration & Proofline Migration

Automated Rybbit website analytics provisioning, migrated Proofline from N8N to direct Claude calls, and enriched both daily and monthly agents with website analytics data from Rybbit.

**Key Changes:**
- Automated Rybbit site creation when a custom domain is verified — creates site via Rybbit API and auto-injects tracking script into project header code
- Migrated Proofline agent from N8N webhook to direct Claude LLM call with proper JSON output schema (title, proof_type, trajectory, explanation)
- Proofline daily agent now includes Rybbit website analytics (sessions, pageviews, bounce rate) alongside GBP data for yesterday vs day-before comparison
- Monthly Summary agent now includes Rybbit website analytics (current month vs previous month) alongside GBP and PMS data
- New shared Rybbit data fetcher utility with daily and monthly comparison functions, reused across both agent types
- Added `rybbit_site_id` column to projects table for linking to Rybbit sites
- Added `ProoflineAgentOutput` and `ProoflineSkippedOutput` backend type definitions
- Added `trajectory` field to frontend `ProoflineAgentData` type

**Commits:**
- `signalsai-backend/src/database/migrations/20260312000001_add_rybbit_site_id_to_projects.ts` — Add rybbit_site_id to projects
- `signalsai-backend/src/controllers/admin-websites/feature-services/service.rybbit.ts` — Rybbit site provisioning on domain verification
- `signalsai-backend/src/controllers/admin-websites/feature-services/service.custom-domain.ts` — Hook provisioning into verifyDomain
- `signalsai-backend/src/utils/rybbit/service.rybbit-data.ts` — Shared Rybbit data fetcher (daily + monthly comparison)
- `signalsai-backend/src/agents/dailyAgents/Proofline.md` — Output schema added to prompt
- `signalsai-backend/src/controllers/agents/types/agent-output-schemas.ts` — ProoflineAgentOutput type
- `signalsai-backend/src/controllers/agents/feature-services/service.agent-orchestrator.ts` — Proofline migration to direct Claude call, Rybbit data wiring for daily + monthly
- `signalsai-backend/src/controllers/agents/feature-services/service.agent-input-builder.ts` — websiteAnalytics param in proofline + summary payloads
- `signalsai/src/types/agents.ts` — Add trajectory to ProoflineAgentData

## [0.0.6] - March 2026

### Stripe Production Billing — Org Type Pricing + Dynamic Quantity

Billing was hardcoded to a single $2,000 flat price with `quantity: 1`. Now supports per-location/per-team pricing driven by organization type, dynamic quantity based on location count, and a persistent subscribe banner for unpaid users.

**Key Changes:**
- Checkout resolves Stripe price by organization type: `health` ($2,000/location/mo) or `saas` ($3,500/team/mo)
- Checkout quantity dynamically set to org's location count from DB (minimum 1)
- New `organization_type` column on organizations (nullable, immutable once set, null = health)
- Admin org detail page: type dropdown (Health / SaaS) with confirmation, locked after save
- `PATCH /api/admin/organizations/:id/type` endpoint with 409 immutability enforcement
- Persistent amber banner for admin-granted users without Stripe subscription ("Subscribe in Settings > Billing")
- ENV restructured: `STRIPE_DFY_PRICE_ID` renamed to `STRIPE_HEALTH_PRICE_ID`, added `STRIPE_SAAS_PRICE_ID`, comment-swap blocks for test/prod keys

**Commits:**
- `signalsai-backend/src/database/migrations/20260312000002_add_organization_type.ts` — Add organization_type column
- `signalsai-backend/src/config/stripe.ts` — Replace `getPriceId(tier)` with `getPriceIdByOrgType(orgType)`
- `signalsai-backend/src/controllers/billing/BillingService.ts` — Dynamic price + quantity in checkout session
- `signalsai-backend/src/controllers/admin-organizations/AdminOrganizationsController.ts` — Add updateOrganizationType handler
- `signalsai-backend/src/routes/admin/organizations.ts` — Add PATCH /:id/type route
- `signalsai-backend/src/models/OrganizationModel.ts` — Add organization_type to IOrganization
- `signalsai/src/components/Admin/OrgSubscriptionSection.tsx` — Org type dropdown with immutability lock
- `signalsai/src/components/PageWrapper.tsx` — Persistent non-subscriber amber banner
- `signalsai/src/api/admin-organizations.ts` — Add organization_type to types, adminUpdateOrganizationType function

## [0.0.5] - March 2026

### SEO Data Version Propagation & Backfill

SEO data was siloed on individual page versions. Bulk generation targeted the highest version number (often an inactive version), and manual SEO edits only wrote to one row. The page list showed score 77 from an old inactive version while the editor showed 15 (draft had null seo_data). The public renderer serves from the published row — if that row had no seo_data, zero SEO tags were injected.

**Key Changes:**
- Added `propagateSeoToSiblings` helper — when SEO data is written to any page version, all sibling versions of the same path with null seo_data are backfilled (additive only, never overwrites)
- Fixed bulk SEO generation to target the published page per path (fallback to draft, then highest version) instead of blindly picking the highest version number
- Fixed page list SEO score to use `displayPage` (published or latest) instead of scanning all versions for any with seo_data
- Fixed `getAllSeoMeta` endpoint to deduplicate pages by path (one entry per path) — prevents false uniqueness failures between draft and published versions of the same page
- Fixed SeoPanel uniqueness filter to exclude by page path instead of entity ID, preventing score flicker (77 → 66) when sibling metadata loads
- One-time backfill migration: copied best seo_data to all 79 page versions across 13 page groups that had gaps

**Commits:**
- `signalsai-backend/src/controllers/admin-websites/feature-services/service.page-editor.ts` — Add propagateSeoToSiblings helper, call from updatePageSeo
- `signalsai-backend/src/workers/processors/seoBulkGenerate.processor.ts` — Fix getPageEntities to prefer published, add sibling propagation after bulk save
- `signalsai-backend/src/controllers/admin-websites/AdminWebsitesController.ts` — Deduplicate getAllSeoMeta by path
- `signalsai/src/pages/admin/WebsiteDetail.tsx` — List score uses displayPage, allPageSeoMeta uses published/latest per group
- `signalsai/src/components/PageEditor/SeoPanel.tsx` — Uniqueness filter excludes by path for pages
- `signalsai-backend/src/database/migrations/20260310000001_backfill_seo_data_across_versions.ts` — One-time backfill migration

## [0.0.4] - March 2026

### Fix Monthly Agents 400 Error (Org-Centered Alignment)

Removed vestigial `domain` requirement from the monthly-agents-run endpoint — a leftover from the domain-centered execution model replaced in February. Organizations without a domain set caused silent 400 failures in the PMS pipeline.

**Key Changes:**
- `domain` no longer required in `POST /api/agents/monthly-agents-run` — endpoint resolves display name from its internal org join
- PMS retry and approval services no longer resolve org domain just to pass it back; removed unnecessary `OrganizationModel` lookups
- Fire-and-forget axios calls replaced with `await` so errors propagate correctly instead of being swallowed
- `notifyAdminsMonthlyAgentComplete` parameter renamed from `domain` to `practiceName`

**Commits:**
- `src/controllers/agents/AgentsController.ts` — Remove domain validation, use org join for admin email
- `src/utils/core/notificationHelper.ts` — Rename domain param to practiceName
- `src/controllers/pms/pms-services/pms-retry.service.ts` — Remove org lookup, domain payload, fix await
- `src/controllers/pms/pms-services/pms-approval.service.ts` — Same cleanup

### Fix SEO Data Lost on Page Draft Creation

SEO scores displayed correctly in the website page list but appeared empty when opening a page for editing. The `createDraft` function was not copying `seo_data` from the published page to the draft.

**Key Changes:**
- Draft creation now copies `seo_data` from the published source page
- Stale draft refresh now syncs `seo_data` from the published version

**Commits:**
- `src/controllers/admin-websites/feature-services/service.page-editor.ts` — Add seo_data to draft insert and stale refresh update

## [0.0.3] - March 2026

### SEO Scoring System & Meta Injection

Full SEO scoring, editing, and meta injection pipeline across admin frontend, backend, and website-builder-rebuild rendering server.

**Key Changes:**
- SEO scoring panel with sidebar navigation, per-section scores, colored dot indicators, and inline field editing for meta title, description, canonical URL, robots, OG tags, and JSON-LD schema
- SEO meta injection in website-builder-rebuild renderer: smart replace-or-inject for `<title>`, meta tags, canonical, OG tags, and JSON-LD schema blocks
- Business data service with Redis-cached lookups (10-min TTL) for org + location data
- Post-level SEO support: Content/SEO tab bar in post editor with auto-save
- Backend: `seo_data` JSONB column on pages and posts, business_data on organizations/locations, SEO generation endpoint
- Migration: `20260308000001_add_seo_and_business_data.ts`

### Admin Sidebar Collapsed Spacing

Fixed collapsed admin sidebar overlaying PageEditor and LayoutEditor content. Content now reserves 72px left margin when sidebar is collapsed.

### SeoPanel Redesign

Restructured SeoPanel from a full-width scrolling list to a sidebar+main split layout. Removed emoji indicators, added colored dot score indicators, section navigation sidebar, and business data warning CTA linking to organization settings.

### Project Display Name & Custom Domain in List

Added editable display name to website projects and custom domain preference in the list view.

**Key Changes:**
- `display_name` column on `website_builder.projects` (migration `20260309000001`)
- Inline-editable display name in WebsitesList (pencil icon, Enter to save)
- "View Site" link and domain display prefer `custom_domain` over generated subdomain
- Backend: `display_name` and `custom_domain` included in list query, set on project create

### Misc Fixes
- Removed unused imports (`Download`, `HelpCircle`, `FileText`, `Upload`, `Sparkles`) and dead `LocationFormRow` component to fix TS6133 errors

**Commits:**
- `website-builder-rebuild/src/utils/renderer.ts` — SEO meta injection with `injectSeoMeta()`, `replaceOrInjectMeta()`, `replaceOrInjectLink()`
- `website-builder-rebuild/src/services/seo.service.ts` — Business data fetch with Redis caching
- `website-builder-rebuild/src/routes/site.ts` — SEO injection in page and post assembly
- `website-builder-rebuild/src/services/singlepost.service.ts` — Added `seo_data` to post query
- `website-builder-rebuild/src/types/index.ts` — `SeoData` interface, `organization_id` on Project, `seo_data` on Page
- `signalsai-backend/src/database/migrations/20260308000001_add_seo_and_business_data.ts` — SEO + business_data columns
- `signalsai-backend/src/database/migrations/20260309000001_add_display_name_to_projects.ts` — display_name column
- `signalsai-backend/src/controllers/admin-websites/feature-services/service.project-manager.ts` — display_name in list/create, `updateProjectDisplayName()`
- `signalsai-backend/src/controllers/admin-websites/feature-services/service.seo-generation.ts` — SEO generation service
- `signalsai-backend/src/controllers/admin-websites/AdminWebsitesController.ts` — SEO endpoints
- `signalsai-backend/src/routes/admin/websites.ts` — SEO routes
- `signalsai-backend/src/routes/locations.ts` — Business data routes
- `signalsai-backend/src/controllers/locations/BusinessDataService.ts` — Business data service
- `signalsai-backend/src/models/LocationModel.ts` — Fixed create signature for optional business_data
- `signalsai/src/components/PageEditor/SeoPanel.tsx` — Redesigned SEO panel with sidebar navigation
- `signalsai/src/components/Admin/PostsTab.tsx` — Content/SEO tab bar, post SEO editing
- `signalsai/src/pages/admin/PageEditor.tsx` — SEO tab integration, sidebar margin fix
- `signalsai/src/pages/admin/LayoutEditor.tsx` — Sidebar margin fix
- `signalsai/src/pages/admin/WebsitesList.tsx` — Inline display name editing, custom domain links
- `signalsai/src/api/websites.ts` — `display_name`, `custom_domain`, SEO API functions
- `signalsai/src/api/locations.ts` — Business data API functions
- `signalsai/src/components/PMS/PMSUploadWizardModal.tsx` — Removed unused imports
- `signalsai/src/components/PMS/PMSVisualPillars.tsx` — Removed unused imports
- `signalsai/src/pages/admin/PracticeRanking.tsx` — Removed unused `LocationFormRow` and `Sparkles`

## [0.0.2] - February 2026

### Admin Set Password & User Profile Account Tab

Enables password management for legacy Google-only accounts via admin tools and user self-service.

**Key Changes:**
- Admin can now see password status (PW / No PW badge) on each user card in Organization Detail
- Admin can set a temporary auto-generated password for any user with optional email notification
- New "Account" tab in Settings (after Billing) where users can set or change their password
- Smart UX: legacy users (no password) see "Set Password" without current password requirement; users with a password must enter their current one to change it
- Password validation enforces existing rules (8+ chars, 1 uppercase, 1 number)

**Commits:**
- `signalsai-backend/src/models/OrganizationUserModel.ts` — Added password_hash to user join query
- `signalsai-backend/src/controllers/admin-organizations/AdminOrganizationsController.ts` — Added has_password mapping + setUserPassword handler with temp password generation and email notification
- `signalsai-backend/src/controllers/settings/SettingsController.ts` — Added getPasswordStatus and changePassword handlers
- `signalsai-backend/src/routes/admin/organizations.ts` — Added POST /users/:userId/set-password route
- `signalsai-backend/src/routes/settings.ts` — Added GET /password-status and PUT /password routes
- `signalsai/src/api/admin-organizations.ts` — Added has_password to AdminUser, adminSetUserPassword API function
- `signalsai/src/api/profile.ts` — Added getPasswordStatus and changePassword API functions
- `signalsai/src/components/settings/ProfileTab.tsx` — New password set/change component
- `signalsai/src/pages/Settings.tsx` — Added Account tab
- `signalsai/src/pages/admin/OrganizationDetail.tsx` — Password status badges, Set Password modal with notify checkbox
