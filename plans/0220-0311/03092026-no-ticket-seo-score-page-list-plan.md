# SEO Score in Page List View

**Date:** 03/09/2026
**Ticket:** no-ticket
**Status:** Complete

---

## Problem Statement

The page list view in WebsiteDetail shows no indication of SEO health per page. Users must open each page's editor to see its SEO score.

## Context Summary

- Page list lives in `WebsiteDetail.tsx`, grouped by path with expandable versions
- Each page has `seo_data: SeoData | null` available on the row
- SeoPanel has a full scoring engine but depends on `wrapperHtml`, `allTitles`, `allDescriptions`

## Existing Patterns to Follow

- Page row has status badges and action buttons on the right side
- Colored indicators used throughout admin UI (score bars, dot colors)

## Proposed Approach

Add a `quickSeoScore()` function that computes an approximate SEO score from `seo_data` alone (no wrapper/uniqueness deps). Show a compact colored progress bar + percentage in each page row.

## Risk Analysis

Level 1 — Additive, display-only. No data mutations.

## Definition of Done

- [x] `quickSeoScore()` function computes score from seo_data fields
- [x] Colored bar + percentage shown in page list rows
- [x] Color coding: green (90+), lime (75+), orange (55+), red (35+), gray (0)
- [x] TypeScript compiles cleanly
