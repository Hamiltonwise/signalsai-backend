# Side-by-Side Path + URL Inputs

**Date:** 03/03/2026
**Ticket:** no-ticket
**Tier:** Minor Change
**Apps touched:** `signalsai` (frontend only)

---

## Problem Statement

Path inputs and per-page scrape URL inputs are in two separate stacked sections, doubling the list length. Should be a single section with one row per page showing both inputs side by side.

---

## Proposed Approach

- Merge "Page paths" and "Per-page scrape URL" sections into one
- Each row: `tp.name` | path input | URL input (URL column only when `dataSource === "website"`)
- Section label: "Page paths & scrape URLs" (or just "Pages")

---

## Risk Analysis

**Level 1.** Pure layout change. No logic affected.

---

## Definition of Done

- [ ] Single section renders one row per page
- [ ] Path and URL inputs are side by side per row
- [ ] URL input hidden when `dataSource !== "website"`
- [ ] No duplicate page lists
