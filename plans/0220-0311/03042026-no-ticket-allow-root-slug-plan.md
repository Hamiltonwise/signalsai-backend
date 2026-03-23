# Allow Root Slug (/) in Create Page Modal

## Problem Statement
The Create Page modal blocks `/` as a page slug due to three validation checks: minimum length 2, regex requiring chars after `/`, and submit button disabled when slug < 2 chars. Users need `/` for homepage creation.

## Context Summary
- Single file: `signalsai/src/components/Admin/CreatePageModal.tsx`
- `validateSlug` (line 92-111): length check and regex both reject `/`
- Submit button disabled condition (line 480): `slug.length < 2`
- No backend validation on path — this is frontend-only

## Existing Patterns to Follow
- Validation returns boolean and sets `slugError` state
- Submit button disabled condition mirrors validation logic

## Proposed Approach
1. In `validateSlug`: if value is exactly `/`, return valid immediately (skip length and regex checks)
2. In submit button: change `slug.length < 2` to `slug.length < 1` (or `!slug`)
3. Update helper text to mention `/` is valid for homepage

## Risk Analysis
- **Level 1 — Low risk.** Frontend-only validation change. Single file. No API changes.

## Definition of Done
- `/` accepted as valid slug in Create Page modal
- Submit button enabled when slug is `/`
- All other slug validation unchanged (still requires `/` prefix, no spaces, etc.)
