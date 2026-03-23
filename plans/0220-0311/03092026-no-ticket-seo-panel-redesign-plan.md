# SEO Panel Redesign

**Date:** 03/09/2026
**Ticket:** no-ticket
**Status:** Executing

---

## Problem Statement

The SEO panel spans full width, uses emoji indicators, lacks internal navigation structure, and has no actionable CTA for the business data warning.

## Context Summary

- Single file: `SeoPanel.tsx` (~773 lines)
- Must preserve: SeoPanelProps interface, scoring engine, field groups, generation logic, auto-save
- Stack: Tailwind CSS, lucide-react, existing API functions

## Existing Patterns to Follow

Admin UI: clean whites/grays, alloro-orange accent, rounded-xl cards, text-sm weights, border-gray-200 borders.

## Proposed Approach

1. **Sidebar + main split layout** — left nav lists 6 sections with colored dots and score badges; main area shows only the active section
2. **Compact header bar** — overall score, location selector, and generate button in a single horizontal strip
3. **Remove all emojis** — replace with small colored circle indicators (`w-2 h-2 rounded-full`)
4. **CTA link** — business data warning links to `/admin/settings` with React Router `<Link>`
5. **Active section** — click sidebar item to show that section's criteria + fields; default to "critical"

## Risk Analysis

Level 1 — Purely visual restructure. No logic changes.

## Definition of Done

- SeoPanel renders with sidebar navigation and single-section view
- No emojis anywhere
- Business data warning has clickable link to settings
- All scoring, generation, save logic works unchanged
