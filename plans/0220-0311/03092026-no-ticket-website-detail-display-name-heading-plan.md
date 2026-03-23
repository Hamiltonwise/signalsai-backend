# Website Detail Display Name as Heading

**Date:** 03/09/2026
**Ticket:** no-ticket
**Status:** Complete

---

## Problem Statement

The single website project detail view shows the default slug (`smart-health-2982`) as the main heading instead of the user-set display name.

## Context Summary

- `WebsiteProject` has `display_name: string | null` field
- Header title currently resolves: `gbpData?.name` → `generated_hostname`
- `display_name` was never included in the resolution chain

## Existing Patterns to Follow

- AdminPageHeader accepts a `title` string prop
- GBP name was already used as an override when available

## Proposed Approach

Prepend `display_name` to the title resolution: `display_name` → `gbpData.name` → `generated_hostname`.

## Risk Analysis

Level 1 — One-line display change. No data mutations.

## Definition of Done

- [x] `display_name` shown as heading when set
- [x] Falls back to GBP name → hostname when null
- [x] TypeScript compiles cleanly
