# Form Submissions Tab Filters — All, Verified, Flagged, Confirmed Opt-ins

## Problem Statement

Form submissions page only has 2 tabs (All, Flagged). Need 4 distinct categories: All, Verified (non-flagged contact forms), Flagged, and Confirmed Opt-ins (newsletter signups).

## Context Summary

- `FormSubmissionsTab.tsx` — current tabs: `"all" | "flagged"`, prop `fetchSubmissionsFn` takes `flagged?: boolean`
- `FormSubmissionModel.findByProjectId` — supports `is_read` and `is_flagged` boolean filters
- Newsletter confirmations saved with `form_name: "Newsletter Signup"` (from `newsletterConfirmController.ts`)
- Two backend controllers: `UserWebsiteController.listFormSubmissions` (user) and `AdminWebsitesController.listFormSubmissions` (admin)
- Admin controller doesn't have flagged support yet

## Existing Patterns to Follow

- Tab styling: underline border-b-2, active color per tab type
- Count badges: rounded-full pills next to tab labels
- Lucide icons for tab labels

## Proposed Approach

### Filter semantics

| Tab | Filter | DB Query |
|-----|--------|----------|
| All | none | all submissions |
| Verified | `verified` | `is_flagged = false AND form_name != 'Newsletter Signup'` |
| Flagged | `flagged` | `is_flagged = true` |
| Confirmed Opt-ins | `optins` | `form_name = 'Newsletter Signup'` |

### Backend: `FormSubmissionModel`

- Extend `findByProjectId` filters to accept `form_name` and `form_name_not`
- Add `countVerifiedByProjectId(projectId)` — non-flagged, non-newsletter
- Add `countOptinsByProjectId(projectId)` — newsletter signups

### Backend: Both controllers

- Replace `flagged` query param with generic `filter` param (`verified | flagged | optins`)
- Return `verifiedCount` and `optinsCount` in response alongside existing `flaggedCount`

### Frontend: `websites.ts`

- Change `fetchFormSubmissions` param from `flagged?: boolean` to `filter?: string`
- Add `verifiedCount` and `optinsCount` to `FormSubmissionsResponse`

### Frontend: `FormSubmissionsTab.tsx`

- Extend `TabFilter` to `"all" | "verified" | "flagged" | "optins"`
- 4 tabs: All (neutral), Verified (green/CheckCircle2), Flagged (amber/ShieldAlert), Confirmed Opt-ins (blue/MailCheck)
- Pass `filter` string to fetch function instead of `flagged` boolean
- Update empty states per tab

### Frontend: `DFYWebsite.tsx`

- Update `userFetchSubmissions` to pass `filter` param

## Risk Analysis

Level 1 — UI filter extension. Non-breaking. Existing data already has the fields needed for filtering.

## Definition of Done

- [x] `FormSubmissionModel` extended with `form_name` filter + count methods
- [x] Both backend controllers support `filter` query param + return all counts
- [x] `fetchFormSubmissions` API function uses `filter` param
- [x] `userFetchSubmissions` uses `filter` param
- [x] `FormSubmissionsTab` renders 4 tabs with icons and counts
- [x] Empty states per tab
- [x] Both repos compile clean
