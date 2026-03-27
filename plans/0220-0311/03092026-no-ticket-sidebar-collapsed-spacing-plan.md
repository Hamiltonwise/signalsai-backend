# Sidebar Collapsed Spacing Fix

**Date:** 03/09/2026
**Ticket:** no-ticket
**Status:** Executing

---

## Problem Statement

The collapsed AdminSidebar overlays content in PageEditor and LayoutEditor instead of reserving its own space. The expanded overlay behavior is fine and should be kept.

## Context Summary

- `AdminSidebar` uses `position: fixed` with `z-40`
- `AdminLayout.tsx` already handles this correctly: `<motion.main animate={{ marginLeft: collapsed ? 72 : 288 }}>`
- `PageEditor.tsx` and `LayoutEditor.tsx` roll their own layouts and don't apply any left margin
- Both force-collapse the sidebar on mount

## Existing Patterns to Follow

`AdminLayout.tsx` pattern: animated `marginLeft` on the content container that responds to `collapsed` state from `useSidebar()`.

## Proposed Approach

Add `marginLeft` matching the collapsed sidebar width (72px) to the main content wrappers in:
1. `PageEditor.tsx` — the `div.flex-1.flex.overflow-hidden.relative` container
2. `LayoutEditor.tsx` — the `div.flex-1.flex.overflow-hidden` containers

Since both editors force-collapse and never expand (they need max space), a static `ml-[72px]` is sufficient — no animation needed.

## Risk Analysis

Level 1 — Suggestion. Purely visual CSS change, no logic affected.

## Definition of Done

Collapsed sidebar no longer overlaps content in PageEditor or LayoutEditor. Content shifts right to accommodate the collapsed sidebar width.
