# Minds Dark Cobalt Theme + Chat Animations

**Date:** 2026-02-27
**Ticket:** no-ticket
**Status:** Complete

## Problem Statement

The Minds section uses default light-mode styling (white backgrounds, gray borders). The chat loading state is a generic bouncing dots indicator with no personality. The user wants a premium dark cobalt blue theme for the entire Minds section with animated background, rotating "thinking" words during chat loading, and dark mode throughout.

## Context Summary

- All Minds UI lives under `MindDetail.tsx` (detail page) and `MindsList.tsx` (list page)
- Child components: MindChatTab, MindSettingsTab, MindWorkplaceTab, KnowledgeSyncWizard
- Brand colors: alloro-navy (#11151C), alloro-orange (#D66853), alloro-deepBlue (#212D40)
- Project uses Tailwind v4 with `@tailwindcss/vite`, Framer Motion is available
- Shared DesignSystem components (TabBar, AdminPageHeader, ActionButton) cannot be modified directly
- Model already on `claude-sonnet-4-6` — no change needed

## Existing Patterns to Follow

- Tailwind utility classes with brand color variables
- Framer Motion for animations (AnimatePresence, motion.div)
- CSS custom properties defined in `@theme inline` block in index.css
- Component-level styling with Tailwind classes

## Proposed Approach

### Strategy: CSS Scope Overrides + Direct Component Edits

1. **index.css** — Add `.minds-theme` wrapper class with:
   - Animated cobalt gradient background (`@keyframes minds-gradient-shift`)
   - CSS custom property overrides for common Tailwind utilities within scope
   - Override shared DesignSystem components (TabBar, AdminPageHeader) styling within scope
   - Scrollbar styling for dark theme
   - Thinking animation keyframes

2. **MindDetail.tsx** — Wrap content in `.minds-theme` div

3. **MindChatTab.tsx** — Direct dark mode conversion:
   - Dark cobalt sidebar, chat area, input
   - Replace bouncing dots with animated thinking words (Framer Motion AnimatePresence)
   - Keep orange accents for user bubbles and interactive elements

4. **MindsList.tsx** — Wrap in `.minds-theme` div

5. Non-chat tabs (Settings, Workplace, KnowledgeSync) get dark styling automatically via CSS scope overrides — no file edits needed.

### Color Palette (Cobalt Dark)

| Token | Value | Usage |
|-------|-------|-------|
| minds-bg-deep | #070e1a | Deepest background |
| minds-bg | #0a1628 | Main background |
| minds-surface | #112240 | Cards, panels |
| minds-surface-hover | #163060 | Hover states |
| minds-border | rgba(255,255,255,0.08) | Borders |
| minds-text | #e2e8f0 | Primary text |
| minds-text-secondary | #94a3b8 | Secondary text |
| minds-text-muted | #64748b | Muted text |
| accent | #D66853 | Orange (unchanged) |

### Thinking Words Animation

Cycle through: "Thinking", "Pondering", "Analyzing", "Reflecting", "Processing", "Contemplating"
- 2-second intervals
- Framer Motion crossfade (opacity + y translation)
- Small orange bouncing dots alongside text

## Risk Analysis

- **Level 1**: UI-only changes, no backend impact, no data flow changes
- **Blast radius**: Scoped to Minds pages only via `.minds-theme` class
- Shared DesignSystem components stay untouched — overrides are CSS-scoped

## Definition of Done

- [x] Minds section has animated cobalt blue gradient background
- [x] All Minds pages and tabs render in dark mode
- [x] Chat loading shows rotating thinking words with animation
- [x] Orange accents preserved throughout
- [x] No visual regressions outside Minds section (scoped via .minds-theme)

## Files Modified

1. **signalsai/src/index.css** — Added `.minds-theme` class with animated gradient, CSS scope overrides for DesignSystem components and common patterns, dark scrollbar, thinking dot animation
2. **signalsai/src/components/Admin/minds/MindChatTab.tsx** — Full dark cobalt rewrite: sidebar, chat area, message bubbles, input area, streaming bubble. Added `ThinkingIndicator` component with Framer Motion AnimatePresence cycling through 6 thinking words
3. **signalsai/src/pages/admin/MindDetail.tsx** — Wrapped content in `.minds-theme` div
4. **signalsai/src/pages/admin/MindsList.tsx** — Wrapped content in `.minds-theme` div, dark-styled mind cards and create modal

## Note on Model

Model was already `claude-sonnet-4-6` across all Minds services. No backend change needed.

## Revision Log

### Revision 1 — 2026-02-27
**Reason:** User requested full incognito dark (no cobalt blue), fix body background white, fix thinking indicator not appearing.

**Changes:**
- Dropped cobalt palette, switched to neutral dark (#141414, #1e1e1e, etc.)
- Added `body.minds-page-active` CSS overrides + useEffect body class toggle
- Fixed `isLoading` staying `true` until first text token arrives (not HTTP connect)

### Revision 2 — 2026-02-27
**Reason:** User requested better contrast, subtle gradient background (not pure black), flowing microdots animation, liquid glass cards, and white overlay entry transition that shrinks to bottom-right.

**Changes:**
- **index.css**: Replaced pure black with subtle radial gradient background. Added `.minds-microdots` floating dot animation (two layers drifting at different speeds). Added `.liquid-glass` utility class (backdrop-filter blur, semi-transparent bg, inner glow). Added `.minds-entry-overlay` for white overlay. Updated all card overrides to use liquid glass properties. Improved text contrast variables (#eaeaea, #a0a0a8, #6a6a75). CSS variables now use rgba surfaces instead of hex.
- **MindDetail.tsx**: Added `MindsEntryTransition` component (Framer Motion clip-path circle shrinking from 150% to 0% at bottom-right). Added `<div className="minds-microdots" />` background layer. Wrapped content in `relative z-[1]`.
- **MindsList.tsx**: Same entry transition + microdots. Updated create modal and mind cards to use `liquid-glass` class. Updated all text colors to new contrast palette.
- **MindChatTab.tsx**: Updated all hex colors from second-iteration (#141414, #0f0f0f, #1e1e1e, #2a2a2a) to new palette (#121218, #0e0e14, white/[0.04], white/[0.06]). Chat container uses `liquid-glass`. Prose code block backgrounds use `bg-black/30`.

### Updated Color Palette (Incognito Dark)

| Token | Value | Usage |
|-------|-------|-------|
| minds-bg-deep | #0e0e14 | Deepest background |
| minds-bg | #121218 | Main background |
| minds-surface | rgba(255,255,255,0.035) | Cards, panels (liquid glass) |
| minds-surface-hover | rgba(255,255,255,0.06) | Hover states |
| minds-border | rgba(255,255,255,0.08) | Borders |
| minds-text | #eaeaea | Primary text |
| minds-text-secondary | #a0a0a8 | Secondary text |
| minds-text-muted | #6a6a75 | Muted text |
| accent | #D66853 | Orange (unchanged) |

### Updated Definition of Done

- [x] Minds section has subtle gradient dark background (not pure black)
- [x] Floating microdots animation in background
- [x] Cards use liquid glass effect (backdrop-filter blur + semi-transparent)
- [x] White overlay entry transition shrinks to bottom-right on page load
- [x] All text has improved contrast
- [x] Chat loading shows rotating thinking words with animation
- [x] Orange accents preserved throughout
- [x] No visual regressions outside Minds section (scoped via .minds-theme + body.minds-page-active)
