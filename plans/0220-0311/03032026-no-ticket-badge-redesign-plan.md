# Badge Redesign — "Powered by Alloro™"

## Problem Statement

Current badge says "Protected by Alloro" with a circle+shield icon in flat gray. Needs to be "Powered by Alloro™" with a shield icon, subtle black translucent text with inset shadow, and alloro orange on hover.

## Context Summary

- Badge is built via JS DOM in `buildFormScript` (3 copies)
- Current: gray (#999) text and SVG, opacity 0.45 → 0.7 on hover
- Alloro orange: #D66853

## Proposed Approach

- Shield SVG (no circle wrapper) — simple shield path
- Text: "Powered by Alloro™" (™ superscript via unicode)
- Default: `rgba(0,0,0,0.25)` color with `text-shadow: inset` effect (use `0 1px 1px rgba(0,0,0,0.1)` for weight)
- Hover: text and SVG transition to `#D66853`
- Keep same size (11px text, 12px icon)

## Risk Analysis

Level 1 — Cosmetic. No functional impact.

## Definition of Done

- [x] Badge updated in all 3 buildFormScript copies
- [x] Both repos compile clean
