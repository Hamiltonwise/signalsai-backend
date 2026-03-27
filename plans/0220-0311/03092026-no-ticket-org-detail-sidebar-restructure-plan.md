# Organization Detail — Sidebar Restructure & Business Data UI

**Date:** 03/09/2026
**Ticket:** no-ticket
**Status:** Complete

---

## Problem Statement

The Organization Detail page (`/admin/organizations/:id`) uses a horizontal tab bar for agent results plus vertically stacked static sections below. This creates a long scrolling page with no clear navigation. Additionally, there is no UI to generate/refresh business data for SEO — the backend endpoints exist but no admin-facing controls are wired up. The SeoPanel CTA incorrectly links to `/settings` (client settings) instead of the admin org detail page.

## Context Summary

- **Current structure:** 973-line component with 9 horizontal tabs + 4 static sections stacked below
- **Tab components:** Already extracted (`OrgTasksTab`, `OrgRankingsTab`, `OrgNotificationsTab`, `OrgPmsTab`, `OrgAgentOutputsTab`)
- **Static sections:** Subscription & Project, Users & Roles, Connections, Danger Zone — all inline JSX in OrganizationDetail.tsx
- **Business data backend:** Fully built — `BusinessDataService.ts`, `POST /api/locations/:id/refresh-business-data`, `GET /api/locations/business-data`, `PATCH` endpoints for manual overrides
- **Frontend API:** `refreshLocationBusinessData()`, `getBusinessData()`, `updateOrgBusinessData()`, `updateLocationBusinessData()` all exist in `src/api/locations.ts`
- **URL state:** Currently uses `?tab=tasks` search params for tab selection

## Existing Patterns to Follow

- URL-driven state via `useSearchParams` (extend to `?section=` param)
- Tab components receive `orgId` + `locationId` props
- `AdminPageHeader` for page header
- Tailwind card pattern: `rounded-xl border border-gray-200 bg-white shadow-sm`
- Location selector component `OrgLocationSelector` already exists
- Motion animations for transitions (keep light)

## Proposed Approach

### 1. Sidebar Layout

Replace the current layout with a two-column structure:
- **Left sidebar** — Fixed ~220px, always visible, white background, border-right
- **Right content area** — Flex-1, renders the active section

Sidebar items (top to bottom):
| # | Label | Icon | Content |
|---|-------|------|---------|
| 1 | Subscription & Project | `Crown` | Tier, billing, website project (default/auto-selected) |
| 2 | Users & Roles | `Users` | User cards, password mgmt, pilot sessions |
| 3 | Connections | `Globe` | Google connections, GBP location count |
| 4 | Agent Results | `BarChart3` | Expandable — reveals 9 sub-items as indented links |
|   | ↳ Tasks Hub | `CheckSquare` | OrgTasksTab |
|   | ↳ Notifications | `Bell` | OrgNotificationsTab |
|   | ↳ Rankings | `Trophy` | OrgRankingsTab |
|   | ↳ PMS Ingestion | `Database` | OrgPmsTab |
|   | ↳ Proofline | `MessageSquare` | OrgAgentOutputsTab (proofline) |
|   | ↳ Summary | `FileText` | OrgAgentOutputsTab (summary) |
|   | ↳ Referral Engine | `Share2` | OrgAgentOutputsTab (referral_engine) |
|   | ↳ Opportunity | `TrendingUp` | OrgAgentOutputsTab (opportunity) |
|   | ↳ CRO | `Target` | OrgAgentOutputsTab (cro_optimizer) |
| 5 | Organization Settings | `Settings` | Danger Zone + Business Data management |

### 2. URL State

- Change `?tab=` to `?section=` for the sidebar selection
- Default: `section=subscription`
- Agent Results sub-items: `section=agent&tab=tasks`, `section=agent&tab=rankings`, etc.
- Clicking "Agent Results" in sidebar defaults to `section=agent&tab=tasks` and expands sub-items
- Back button / bookmarking preserved

### 3. Location Selector Placement

- **NOT** in the page header globally
- Rendered inside the content area only when section is `agent` (Agent Results) — appears at the top of the content panel above the active tab component
- Also shown when `section=agent&tab=rankings` since rankings are location-dependent

### 4. Component Extraction

Extract inline JSX blocks from OrganizationDetail.tsx into standalone components:

| Component | Source Lines | New File |
|-----------|-------------|----------|
| `OrgSubscriptionSection` | ~477-640 | `src/components/Admin/OrgSubscriptionSection.tsx` |
| `OrgUsersSection` | ~642-704 + password modal ~765-890 | `src/components/Admin/OrgUsersSection.tsx` |
| `OrgConnectionsSection` | ~706-734 | `src/components/Admin/OrgConnectionsSection.tsx` |
| `OrgSettingsSection` | ~736-763 (Danger Zone) + new Business Data UI | `src/components/Admin/OrgSettingsSection.tsx` |

Each receives `org`, `orgId`, and necessary callbacks as props.

### 5. Organization Settings Section — Business Data UI

New content within `OrgSettingsSection`:

**Business Data Management:**
- Card per location showing:
  - Location name + place_id
  - Last refreshed timestamp (from `business_data.refreshed_at`) or "Never refreshed"
  - Status indicator: green dot if data exists, gray if empty
  - "Refresh from Google" button → calls `refreshLocationBusinessData(locationId)`
  - Loading state while refreshing
- Organization-level business data summary (name, address, phone from primary location)
- If no Google connection exists → show message: "Connect Google account first" with link to Connections section

**Danger Zone** (existing, moved here):
- Delete organization with confirmation modal

### 6. SeoPanel CTA Fix

Update the SeoPanel warning CTA:
- **Current:** `<Link to="/settings">Open Settings</Link>`
- **New:** Link to `/admin/organizations/{orgId}?section=settings` where `orgId` comes from the project's `organization_id`
- If no `organization_id` on the project → show "Link an organization first" instead of the settings link
- The `orgId` is available from the page editor's project data (`project.organization_id`)

### 7. Sidebar Visual Design

- Background: `bg-white` with `border-r border-gray-200`
- Items: `px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 rounded-lg mx-2`
- Active item: `bg-alloro-orange/10 text-alloro-orange font-semibold`
- Agent Results expanded sub-items: indented with `ml-4`, smaller text `text-xs`, left border accent `border-l-2 border-gray-200` (active: `border-alloro-orange`)
- Section dividers: subtle `border-t border-gray-100 my-2` between major groups
- Icons: `w-4 h-4` inline with labels

## Risk Analysis

**Level 2 — Concern (Manageable)**

- Large file restructure but all tab components are pre-extracted
- Inline sections need extraction — mechanical work, no logic changes
- Business data UI is new but backend is fully built
- URL state change from `?tab=` to `?section=` may break bookmarks — low impact, admin-only page
- No migration, no auth changes, no backend changes

## Definition of Done

- [ ] OrganizationDetail.tsx uses sidebar + content layout
- [ ] Sidebar shows all 5 top-level items with Agent Results expandable to 9 sub-items
- [ ] Default section is Subscription & Project
- [ ] URL state uses `?section=` + `?tab=` for deep linking
- [ ] Location Selector appears only in Agent Results content area
- [ ] Inline sections extracted into standalone components
- [ ] Organization Settings section contains Danger Zone + Business Data UI
- [ ] Business Data UI shows per-location refresh status and "Refresh from Google" button
- [ ] SeoPanel CTA links to `/admin/organizations/{orgId}?section=settings`
- [ ] Referral Engine included in Agent Results sub-items
- [ ] TypeScript compiles cleanly
- [ ] Existing functionality preserved — no regressions in tab content
