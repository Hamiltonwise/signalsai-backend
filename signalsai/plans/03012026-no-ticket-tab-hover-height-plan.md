# Tab Hover Height Parity

## Problem Statement
Inactive tabs are shorter than the active tab (no description). On hover, they should expand to the same height by showing the description, making them easier to click.

## Context Summary
- TabBar in DesignSystem.tsx, description only rendered when `isActive`

## Existing Patterns to Follow
- Tailwind `group`/`group-hover` pattern for hover-triggered children

## Proposed Approach
Show the description on both active AND hovered tabs. Use `group` on the button and `hidden group-hover:block` on the description for inactive tabs.

## Risk Analysis
- Level 1 — Cosmetic only

## Definition of Done
- Hovered inactive tabs show description (same height as active)
- Active tab always shows description
- TypeScript clean
