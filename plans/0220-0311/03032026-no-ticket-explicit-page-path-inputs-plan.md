# Explicit Per-Page Path Inputs

**Date:** 03/03/2026
**Ticket:** no-ticket
**Tier:** Minor Change
**Apps touched:** `signalsai` (frontend only)

---

## Problem Statement

The "Create All Pages" confirmation card auto-derives the URL path for each page from the template page name (e.g. "About Us" → `/about-us`). There is no input for the user to explicitly set or review the path. Paths must be set explicitly — no auto-derivation.

---

## Context Summary

- File: `signalsai/src/pages/admin/WebsiteDetail.tsx`
- `pageConfigs` built at line 505-513: path derived via `tp.name.toLowerCase().replace(...)` with a special case forcing the first page to `/`
- `pageWebsiteUrls` state pattern (`Record<string, string>` keyed by `templatePageId`) is the model to follow
- Per-page URL override section currently gated on `dataSource === "website"` — paths must be shown regardless of data source
- Backend `startPipeline` already accepts `path` from client; no server changes needed

---

## Proposed Approach

1. Add `pagePathInputs: Record<string, string>` state (keyed by `templatePageId`)
2. Add a path input section (always visible when `selectedTemplatePages.length > 0`) with one row per template page showing `tp.name` label + path text input
3. Remove derivation logic at lines 507 and 511-513
4. Use `pagePathInputs[tp.id] ?? ""` as path in `pageConfigs`
5. Disable the submit button when any path input is empty

---

## Risk Analysis

**Level 1 — Low.** Frontend-only. Backend already takes `path` from the client payload.

---

## Definition of Done

- [ ] `pagePathInputs` state exists
- [ ] Path input rendered per page in confirmation card, always visible (not gated on data source)
- [ ] Name-derived path logic removed entirely
- [ ] Submit disabled when any path is blank
- [ ] `pageConfigs` uses `pagePathInputs[tp.id]` directly
