# PM Router Mount + Defensive API Guards

## Why
`/admin/pm` crashes on load with `TypeError: Cannot read properties of undefined (reading 'length')`. Root cause: `src/index.ts` imports and mounts only `./routes/pms` (legacy singular route). The actual PM aggregate router at `src/routes/pm/index.ts` (which wires `/projects`, `/tasks`, `/stats`, `/activity`, etc.) is never imported and never mounted. Every `/api/pm/*` request therefore falls through to the production SPA catch-all (`app.get("/{*splat}", …)`) and returns `index.html` with `200 text/html`. The frontend's `apiGet` returns that HTML string as the response envelope; `fetchProjects` reads `.data` off the string (undefined); the store writes `projects: undefined`; render crashes.

## What
1. Backend: mount the PM aggregate router at `/api/pm` so `/api/pm/projects`, `/api/pm/tasks/*`, `/api/pm/stats/*`, `/api/pm/activity/*`, `/api/pm/users`, `/api/pm/notifications`, `/api/pm/ai-synth/*` all reach Express handlers.
2. Frontend: add a response-shape guard in `frontend/src/api/pm.ts` that throws when the response isn't the `{ success: true, data }` envelope. This flips the silent-HTML failure mode into a normal error path so the store's `try/catch` actually fires and writes `projects: []`.

Done when:
- `/admin/pm` loads without the error boundary and shows the empty-state (or existing projects).
- Backend TS build clean; frontend TS build clean.

## Context

**Relevant files:**
- `src/index.ts` — app entrypoint; mounts all route modules.
- `src/routes/pm/index.ts` — existing, compiled, but unmounted aggregate router.
- `frontend/src/api/pm.ts` — PM API helpers; every GET/POST/PUT returns `res.data` without shape validation.
- `frontend/src/api/index.ts` — `apiGet`/`apiPost`/etc. swallow errors and return response bodies; do NOT throw on non-2xx or non-JSON. Out of scope to refactor here.
- `frontend/src/stores/pmStore.ts` — already has `try/catch` around `fetchProjects`; will work correctly once `pm.ts` throws.
- `frontend/src/pages/admin/ProjectsDashboard.tsx:127` — crash site (`projects.length`).

**Patterns to follow:**
- Route mount order in `src/index.ts:151-189` — one `app.use("/api/…", routes)` per line, grouped with similar routes.
- All PM controllers respond with `res.json({ success: true, data: … })` (see `src/controllers/pm/PmProjectsController.ts:85`).

**Reference file:** `src/routes/pm/index.ts` is the analog — already written, just needs mounting. For the frontend guard, there is no existing analog; this is a localized helper scoped to `pm.ts` only.

## Constraints

**Must:**
- Mount `pmRoutes` BEFORE the SPA catch-all in `src/index.ts` (the catch-all is at line 196, inside the `isProd` block).
- Keep the legacy `/api/pms` mount untouched — unrelated consumers may depend on it.
- The frontend guard must be scoped to `pm.ts`. Do not change `apiGet` contract.

**Must not:**
- Introduce new dependencies.
- Refactor `apiGet`/`apiPost`/etc. — their contract is cross-cutting and changing it is Level 3 risk, out of scope here.
- Touch other store methods' error handling beyond what's required.

**Out of scope:**
- Rewriting the api envelope layer (apiGet etc).
- Backfilling unit tests for PM API.
- Any behavior change when the backend IS working correctly — the guard must be a no-op on valid `{ success: true, data }` responses.

## Risk

**Level:** 2

**Risks identified:**
- Route mount collision with `/api/pms` → **Mitigation:** `/api/pm` and `/api/pms` are distinct prefixes; Express matches on exact prefix, no overlap.
- Frontend guard throws on endpoints whose contract differs (`fetchGlobalActivity`, `fetchProjectActivity`, `fetchCrossProjectBatches`, `fetchBatches` currently `return res` — full envelope, not `res.data`). **Mitigation:** unwrap helper is only used at call sites that already expect `res.data`. For the `return res` sites, add a lighter guard that verifies the response is an object with an expected shape (has `data` or `success`), not HTML string.
- Other callers of `/api/pm/*` outside the PM module? **Blast radius check:** `grep -r "/api/pm" frontend/src` — confirmed only `frontend/src/api/pm.ts` references `/pm/` paths. No other consumer.

**Blast radius:**
- `src/index.ts`: adding one import + one mount. No existing behavior modified.
- `frontend/src/api/pm.ts`: every `res.data` extraction. Callers: `pmStore` (already try/catch'd), `ProjectsDashboard`, `MeTabView`, PM modal components. All already call these via the store with error handling, or via React Query / direct try/catch.

**Pushback:** None at this level. The backend bug is an unambiguous omission. The frontend guard is the narrower, safer version of the broader `apiGet` fix that would be Level 3.

## Tasks

### T1: Mount `/api/pm` aggregate router
**Do:** In `src/index.ts`, add `import pmRoutes from "./routes/pm"` near the other PM import (line 29), and `app.use("/api/pm", pmRoutes)` in the route-mount block immediately after `/api/pms` (line 157). Order matters only insofar as it must precede the SPA catch-all — that condition is already satisfied.
**Files:** `src/index.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit` clean. After deploy, `curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/pm/projects?status=active` returns JSON with `success: true`.

### T2: Defensive unwrap in PM API module
**Do:** Add a local `unwrapPmEnvelope<T>(res: unknown): T` helper at the top of `frontend/src/api/pm.ts`. It validates the response is an object with `success === true` and has a `data` key; otherwise it throws with a best-effort error message. Replace every `return res.data` with `return unwrapPmEnvelope<…>(res)`. For the four endpoints that currently `return res` (`fetchGlobalActivity`, `fetchProjectActivity`, `fetchCrossProjectBatches`, `fetchBatches`), add a matching `assertPmEnvelope(res)` guard that verifies the envelope shape before passing through.
**Files:** `frontend/src/api/pm.ts`
**Depends on:** none (can run in parallel with T1)
**Verify:** `cd frontend && npx tsc --noEmit` clean. Manual: with backend down, store's `fetchProjects` catch fires and `projects` stays `[]` rather than `undefined`.

### T3: Type checks
**Do:** Run `npx tsc --noEmit` from repo root (backend) and from `frontend/`. Fix any errors caused by these changes.
**Files:** none (verification only)
**Depends on:** T1, T2
**Verify:** Both tsc runs exit with zero errors from this execution.

## Done
- [ ] `src/index.ts` imports `./routes/pm` and mounts at `/api/pm`
- [ ] `frontend/src/api/pm.ts` unwrap helper implemented; every `res.data` path validated
- [ ] `npx tsc --noEmit` (root) — zero new errors
- [ ] `cd frontend && npx tsc --noEmit` — zero new errors
- [ ] Manual: after deploy, `/admin/pm` loads without PM error boundary
