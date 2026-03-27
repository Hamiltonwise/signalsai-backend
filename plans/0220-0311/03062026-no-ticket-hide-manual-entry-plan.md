# Hide PMS Manual Entry Option

**Ticket:** --no-ticket
**Date:** 03/06/2026

## Problem Statement

The manual entry option in the PMS upload wizard should be hidden for now.

## Context Summary

- `PMSUploadWizardModal.tsx` has a "Step 2B: Alternatives" screen with 3 options: CSV template, manual entry, and support
- Manual entry option is rendered as Option 2 (lines 549–580) in the alternatives step

## Existing Patterns to Follow

N/A — simple hide.

## Proposed Approach

Comment out the manual entry option block in the alternatives step. Keep the code intact for easy re-enabling later.

### File Changes

| File | Change |
|------|--------|
| `signalsai/src/components/PMS/PMSUploadWizardModal.tsx` | Comment out manual entry option block |

## Risk Analysis

**Level 1 — Low risk.** Hiding a UI element. No logic changes.

## Definition of Done

- [x] Manual entry option hidden from wizard
- [x] Build passes clean
