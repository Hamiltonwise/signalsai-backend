# Fix Pilot Mode "Websites" Tab Not Visible

**Date:** 2026-03-05
**Ticket:** --no-ticket
**Status:** Executed

## Problem Statement

The "Websites" sidebar tab is not visible when an admin enters pilot mode (impersonation) for an organization that has a website project. The tab should appear but doesn't.

## Context Summary

- **Pilot mode** stores a pilot JWT in `sessionStorage` under key `"token"` (not `"auth_token"`)
- **Sidebar.tsx** `checkWebsite()` (lines 220-240) resolves the JWT with: `getPriorityItem("auth_token") || getPriorityItem("token")`
- **`getPriorityItem("auth_token")`** checks sessionStorage first (no `auth_token` there in pilot mode), then falls back to localStorage — where it finds the **admin's** `auth_token`
- The `||` short-circuits, so the pilot token in sessionStorage is never used
- The `GET /api/user/website` request goes out authenticated as the admin, not the impersonated user
- `rbacMiddleware` resolves the admin's org context → response either 403s or returns wrong org's data → `hasWebsite` stays `false`
- Every other API call goes through `api/index.ts` `getCommonHeaders()` which has correct pilot-mode detection

## Existing Patterns to Follow

- `api/index.ts` `getCommonHeaders()` has the authoritative pilot-mode token resolution pattern
- `apiGet()` from `api/index.ts` is used throughout the app for GET requests
- Silent failure for missing website is the existing behavior (catch block swallows errors)

## Proposed Approach

### Step 1: Replace raw axios call with `apiGet` in Sidebar.tsx

Replace the manual `axios.get` + manual header construction in `checkWebsite()` with `apiGet` from `../api/index.ts`. This reuses the centralized pilot-aware token logic. Preserve the silent-fail behavior by checking for error in the response.

- Add `import { apiGet } from "../api/index"`
- Remove `import axios from "axios"` (check if axios is used elsewhere in file first)
- Replace the checkWebsite body to use `apiGet({ path: "/user/website" })`

## Risk Analysis

- **Level 1 — Low risk**
- Single file change, one function body
- `apiGet` already handles pilot mode correctly — proven by every other API call in the app working in pilot mode
- Silent-fail behavior preserved
- No backend changes needed

## Definition of Done

- [x] `checkWebsite()` uses `apiGet` instead of raw `axios.get`
- [x] Pilot-mode token resolution is correct (sessionStorage token used via `getCommonHeaders()`)
- [x] No unused imports remain (`axios` removed, `apiGet` added)
