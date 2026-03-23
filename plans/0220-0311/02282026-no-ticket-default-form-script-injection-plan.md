# Default Form Script Injection in website-builder-rebuild

## Problem Statement
The website-builder-rebuild renderer serves live website pages but does not inject the form submission interception script. Forms on live sites are non-functional — submissions go nowhere. The script must be injected as a **default on all pages**, not managed through the header_footer_code system.

## Context Summary
- `signalsai-backend/src/utils/website-utils/formScript.ts` has `buildFormScript(projectId, apiBase)` — generates an inline `<script>` that intercepts all `<form>` submits and POSTs to `/api/websites/form-submission`.
- `website-builder-rebuild/src/utils/renderer.ts` has `renderPage()` which assembles final HTML.
- `website-builder-rebuild/src/routes/site.ts` calls `renderPage()` via `assembleHtml()` — has access to `project.id`.
- The API endpoint is public (no auth): `POST {apiBase}/api/websites/form-submission`.
- Websites are served from `*.sites.getalloro.com` or custom domains, but the API lives at `app.getalloro.com` — cross-origin POST required.

## Existing Patterns to Follow
- `buildFormScript()` in signalsai-backend — identical script to be added to website-builder-rebuild renderer.
- Code snippet injection already uses string replacement on `</body>`.

## Proposed Approach
1. Add `buildFormScript()` to `website-builder-rebuild/src/utils/renderer.ts`.
2. Update `renderPage()` signature to accept optional `projectId` and `apiBaseUrl`.
3. When both are provided, inject the form script before `</body>` — always, on every page.
4. Update `assembleHtml()` in `site.ts` to pass `project.id` and `process.env.API_BASE_URL`.
5. Add `API_BASE_URL` to `.env`.

## Risk Analysis
- **Level 1 — Suggestion**: Low risk. The script is self-contained, uses `data-alloro-ignore` to opt-out, and the endpoint already exists.
- Cross-origin fetch requires CORS on the backend — already handled (form-submission route is public).

## Definition of Done
- [x] `buildFormScript()` added to renderer.ts
- [x] `renderPage()` injects form script before `</body>` when projectId provided
- [x] `site.ts` passes projectId and apiBaseUrl via `API_BASE_URL` env var
- [x] `API_BASE_URL` added to .env (defaults to `https://app.getalloro.com`)
- [x] TypeScript compiles cleanly
