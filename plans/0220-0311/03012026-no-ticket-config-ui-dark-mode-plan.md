# Config UI Dark Mode Text Fix

## Problem Statement
Skill detail Configuration tab uses light-mode Tailwind classes (text-gray-900, text-gray-600, bg-gray-50, bg-white, border-gray-200) which render dark text on the dark minds-theme background, making labels and options nearly invisible.

## Context Summary
- Dark theme uses inline hex colors: #eaeaea (headings), #a0a0a8 (labels), #6a6a75 (descriptions), #c2c0b6 (body), #1a1a18 (input bg), white/[0.06] (card bg), white/8 (borders)
- Config tab is lines 670-957 of SkillDetailPanel.tsx
- All form controls (selects, inputs, radio labels, buttons) need color conversion

## Existing Patterns to Follow
- SkillBuilderChat.tsx uses inline styles + dark Tailwind utilities
- `.minds-theme` scoped CSS overrides in index.css, zero `dark:` utilities

## Proposed Approach
Replace all light-mode Tailwind color classes in the config tab with dark-mode equivalents.

## Risk Analysis
Level 1 — Cosmetic only. No logic changes.

## Definition of Done
- All config tab text readable on dark background
- Inputs, selects, radio cards, portal key section all themed
- No light-mode colors remaining in config tab
