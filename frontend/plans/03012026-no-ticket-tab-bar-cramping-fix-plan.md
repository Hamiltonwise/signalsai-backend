# Tab Bar Cramping Fix

## Problem Statement
MindDetail now has 6 tabs. The TabBar renders label + description for every tab simultaneously, causing horizontal overflow/cramping.

## Context Summary
- TabBar is a shared DesignSystem component in `DesignSystem.tsx`
- Each tab renders: icon + label + description subtitle (10px)
- 6 tabs with long labels: "Talk to {name}", "Agent Anatomy", "Agent University", "Agent Parenting", "Agent Workplace", "Publish Channels"

## Existing Patterns to Follow
- Dark mode: `.minds-theme` scoping
- TabBar uses framer-motion `layoutId` for active indicator

## Proposed Approach
1. **TabBar component**: Only render the description subtitle on the active tab. Inactive tabs show icon + label only.
2. **Reduce horizontal padding** from `px-4` to `px-3` on tab buttons.
3. **Reduce label font size** from `text-sm` to `text-xs` for tighter fit.

No content is removed — descriptions still appear on the selected tab.

## Risk Analysis
- Level 1 — Cosmetic change to shared component
- TabBar is used in MindDetail only (the sole consumer of description)

## Definition of Done
- 6 tabs fit without cramping
- Active tab still shows its description
- TypeScript clean
