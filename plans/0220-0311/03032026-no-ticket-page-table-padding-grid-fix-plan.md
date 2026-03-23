# Page Table Padding & Grid Fix

**Date:** 03/03/2026
**Ticket:** no-ticket
**Tier:** Minor Change
**Apps touched:** `signalsai` (frontend only)

---

## Problem Statement

The per-page path/URL section has no horizontal padding (content flush to card edge) and uses flexbox with mismatched column sizing. Header labels don't align cleanly with input rows.

---

## Proposed Approach

- Add `px-4 pb-3` to the outer section container
- Replace flex rows with CSS grid: `grid-cols-[5rem_1fr_1fr]` (with URL) or `grid-cols-[5rem_1fr]` (path only) so headers and inputs are in identical columns

---

## Risk Analysis

**Level 1.** Layout only.

---

## Definition of Done

- [ ] Section has consistent horizontal padding matching the rest of the card
- [ ] Header labels align with their respective input columns
