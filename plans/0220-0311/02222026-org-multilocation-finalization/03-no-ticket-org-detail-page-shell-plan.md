# Plan 03 — Organization Detail Page Shell

## Problem Statement

Need a new page at `/admin/organizations/:id` housing: location selector, 7 tab scaffold, subscription management, users list, connected properties, and danger zone.

## Context Summary

- No org detail route currently exists — all detail is inline accordion in `OrganizationManagement.tsx`.
- Data requirements at page load:
  - `adminGetOrganization(id)` — org, users[], connections[], website
  - `adminGetOrganizationLocations(id)` — locations[] with googleProperties[]
- GBP metadata (address, phone, rating, placeId) lives in `google_properties.metadata` JSONB.
- User-facing `LocationSwitcher` is bound to `LocationContext` — cannot reuse for admin.

## Existing Patterns to Follow

- `WebsiteDetail.tsx` — parameterized route, load on mount, loading state.
- `OrganizationManagement.tsx` accordion expanded section — extract subscription, users, connections, danger zone.
- `AIDataInsightsList` — uses `useSearchParams` for URL-driven state.

## Proposed Approach

### Create `signalsai/src/pages/admin/OrganizationDetail.tsx`

```
Header (org name + tier badge + back link)
OrgLocationSelector (location dropdown + metadata card)
Tab bar (7 tabs, URL-driven via ?tab=)
Tab content (stubs in this plan — filled in Plans 04-06)
---
Subscription section (tier + upgrade/downgrade buttons + confirm modal)
Users section (user cards + pilot buttons)
Connections section (GBP connection details)
Settings / Danger zone (delete with name-confirmation input)
```

- `useParams()` → `orgId`
- Parallel load: `adminGetOrganization(orgId)` + `adminGetOrganizationLocations(orgId)`
- Tab state via `useSearchParams` for `?tab=` URL param. Default: `tasks`
- Tab keys: `tasks`, `pms`, `proofline`, `summary`, `opportunity`, `cro`, `referral`

### Create `signalsai/src/components/Admin/OrgLocationSelector.tsx`

- Props: `locations[], selectedLocation, onSelect`
- 1 location → auto-select, show metadata card only (no dropdown)
- N locations → dropdown selector + metadata card for selected
- Metadata card displays: name, address, phone, stars, location ID (`external_id`), Google Place ID (`metadata.placeId`)
- Defensive access with optional chaining — missing fields show dash

### Non-tab sections

Extract from existing `OrganizationManagement.tsx` accordion content:
- Subscription: tier display + upgrade/downgrade with confirm modal
- Users: user cards with name, email, role, pilot button
- Connections: GBP connection email + property list
- Danger zone: delete org with name-confirmation text input

## Risk Analysis

- **Level 1:** `google_properties.metadata` JSONB shape may vary. All access must use optional chaining.
- **Level 2:** Org with 0 locations — selector renders empty state, tabs receive `null` locationId.

## Definition of Done

- `/admin/organizations/:id` loads and displays: org header, location selector, tab bar, and all 4 non-tab sections
- Location selector auto-selects single location, shows dropdown for multi
- `?tab=` URL param drives active tab; default is `tasks`
- Tier change and delete with confirmation work
- Pilot button works per-user in users section
