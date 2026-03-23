# Parenting Compile UX Polish

## Problem Statement
1. "Graduation Ceremony" compile view text is bland — needs more creative, personality-driven copy
2. StatusPill "Compiling" (yellow) uses light-mode colors (bg-amber-50, text-amber-600) — unreadable on dark minds-theme background

## Proposed Approach

### 1. Compile view copy — `MindParentingTab.tsx`
Replace static "Graduation Ceremony" / "walking the stage" with more creative, dynamic copy.

### 2. StatusPill dark mode — `MindParentingTab.tsx`
The StatusPill component uses light-mode Tailwind classes. Instead of modifying the shared DesignSystem component (which would affect all admin pages), replace StatusPill usage in the parenting tab's session header with inline dark-mode-friendly pill styling.

## Risk Analysis
- **Level 1**: Copy change + cosmetic styling fix. Zero logic impact.

## Definition of Done
- [x] Compile view copy is more creative and personality-driven
- [x] Status pills in parenting session header are readable on dark background
- [x] TypeScript clean

## Implementation Summary

### 1. Compile view copy (done prior to this session continuation)
- "Graduation Ceremony" → "Rewiring neurons..."
- "walking the stage" → "{mindName} is locking in new synapses. Don't unplug — this brain is mid-upgrade."

### 2. StatusPill → DarkPill
- Removed `StatusPill` import from DesignSystem (shared light-mode component)
- Created local `DarkPill` component with dark-mode-friendly colors using semi-transparent backgrounds:
  - `bg-blue-500/15 text-blue-400 border-blue-500/25` (chatting)
  - `bg-amber-500/15 text-amber-400 border-amber-500/25` (reading, compiling)
  - `bg-orange-500/15 text-orange-400 border-orange-500/25` (proposals)
  - `bg-green-500/15 text-green-400 border-green-500/25` (completed)
  - `bg-slate-500/15 text-slate-400 border-slate-500/25` (abandoned)
- Replaced both StatusPill usages (session header + session list cards)
