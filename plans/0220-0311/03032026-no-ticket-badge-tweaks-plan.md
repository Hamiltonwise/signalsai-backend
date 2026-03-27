# Badge Tweaks — Translucent Orange, Correct Name, Animated Transition

## Problem Statement

Badge from previous redesign has three issues:
1. Hover orange (`#D66853`) is solid — should be translucent like the default color
2. Text says "Powered by Alloro™" — should be "Powered by Alloro Protect™"
3. Color change on hover is not animated — needs CSS transition on label and SVG path

## Context Summary

- Two copies need updating: `renderer.ts` (website-builder-rebuild) and `formScript.ts` (alloro-app backend)
- Frontend `templateRenderer.ts` has no badge — no change needed
- Current hover color: `#D66853` (solid)
- Current default color: `rgba(0,0,0,0.25)` (translucent) — good
- Transitions exist on badge element but not on the children that actually change color

## Existing Patterns to Follow

- Badge uses `var dColor` / `var hColor` pattern
- Inline styles via `style.cssText` for initial state
- `onmouseenter` / `onmouseleave` for hover

## Proposed Approach

1. Change `hColor` from `#D66853` to `rgba(214,104,83,0.65)` — translucent orange
2. Change label text from `Alloro` to `Alloro Protect` (keep ™ via `\u2122`)
3. Add `transition:color 0.2s ease,text-shadow 0.2s ease` to label `cssText`
4. Switch SVG path fill from `setAttribute` to `style.fill` so CSS transition works
5. Add `path.style.transition='fill 0.2s ease'` to path element
6. Remove unused `transition:all 0.2s ease` from badge element (children handle it now)

## Risk Analysis

Level 1 — Cosmetic. No functional impact.

## Definition of Done

- [x] Both copies updated with translucent hover, correct name, animated transitions
- [x] Both repos compile clean
