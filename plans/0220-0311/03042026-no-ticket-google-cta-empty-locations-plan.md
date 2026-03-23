# Google Connect CTA in Empty Locations State

## Problem Statement
When a user skips GBP during onboarding, the Settings locations section shows an empty "No locations configured" card with no way to connect Google. The user is stuck.

## Context Summary
- `PropertiesTab.tsx` — renders empty state at line 242-249 with just a MapPin icon and generic text
- `GoogleConnectButton.tsx` — existing reusable component with popup OAuth flow + `onSuccess` callback
- `useAuth()` hook exposes `hasGoogleConnection` and `refreshUserProperties`
- The "Add Location" flow requires Google connection to fetch GBP profiles

## Existing Patterns to Follow
- `GoogleConnectButton` is already used in onboarding Step 2 (`Step2_DomainInfo.tsx`)
- Auth context provides `hasGoogleConnection` boolean

## Proposed Approach
In `PropertiesTab.tsx`, replace the empty state card:
- Import `useAuth` and `GoogleConnectButton`
- When `locations.length === 0` AND no Google connection: show a "Connect Google Account" CTA card instead of the generic empty state
- When `locations.length === 0` AND Google IS connected: show the existing empty state (they can use "Add Location" button)
- After Google connect success: call `refreshUserProperties()` then `loadData()` to refresh

## Risk Analysis
- Level 1 — Suggestion. Additive UI change in the empty state only.

## Definition of Done
- [x] Empty locations state shows Google Connect CTA when no Google connection
- [x] After connecting, state refreshes
- [x] Existing empty state preserved when Google is already connected
