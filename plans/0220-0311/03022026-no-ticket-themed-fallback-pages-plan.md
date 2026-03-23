# Themed Fallback Pages — Use Project Primary Color

## Problem Statement

The `/confirmed` and `/success` fallback pages use a hardcoded brand color (`#d66853`). They should use the project's `primary_color` so they match the site's theme.

## Context Summary

- `confirmedPage(businessName?)` and `successPage(businessName?)` in `website-builder-rebuild/src/templates/`
- Both import `brandColor` and `icons` from `styles.ts` — icons also embed `brandColor`
- `siteRoute` in `site.ts` has the full `project` object with `primary_color`
- Currently only passes `businessName` to templates

## Existing Patterns to Follow

- Template functions accept optional params, return HTML strings
- `brandColor` used in inline styles and SVG stroke attributes

## Proposed Approach

1. Add `primaryColor?: string` param to `confirmedPage()` and `successPage()`
2. Default to `brandColor` if not provided
3. Replace all `brandColor` references in the template body with the param value
4. For icons that embed `brandColor`, create inline SVGs with the dynamic color
5. Update `siteRoute` to pass `project.primary_color`

## Risk Analysis

Level 1 — Cosmetic change. No behavioral impact. Falls back to existing brand color.

## Definition of Done

- [x] `confirmedPage` accepts and uses `primaryColor`
- [x] `successPage` accepts and uses `primaryColor`
- [x] `siteRoute` passes `project.primary_color` to both templates
- [x] `primary_color` added to `Project` type interface
- [x] Repo compiles clean
