# Fix: Form Submission Origin Validation Ignores generated_hostname

## Why
Projects on `*.sites.getalloro.com` have their subdomain stored in `generated_hostname`, not `hostname`. The origin validation in `formSubmissionController.ts` only checks `project.hostname`, which is null for all projects that haven't connected a custom domain. This causes every cross-origin form submission from a `*.sites.getalloro.com` site to silently pass without persisting or emailing — because `allowedOrigins` is empty and the browser always sends an `Origin` header on cross-origin fetches.

Artful ortho works because it has `custom_domain` set. Endo (and any other project without a connected domain) silently drops all submissions.

## What
Two-file fix:
1. Add `generated_hostname` to `IProject` in `ProjectModel.ts`
2. Include `generated_hostname` in the allowed origins check in `formSubmissionController.ts`

## Context

**Relevant files:**
- `src/models/website-builder/ProjectModel.ts` — `IProject` interface is missing `generated_hostname: string | null`
- `src/controllers/websiteContact/formSubmissionController.ts:244-268` — origin validation builds `allowedOrigins` from `project.hostname` (null for all non-custom-domain projects) and `project.custom_domain`

**Root cause chain:**
- Projects are created with `generated_hostname` (e.g. `smart-health-2982`) via `service.project-manager.ts:115`
- Website builder serve resolves project via `where({ generated_hostname: hostname })` — works fine
- Form submission resolves project via `ProjectModel.findById(projectId)` — returns `generated_hostname` from DB
- But `IProject` doesn't declare `generated_hostname`, so TypeScript treats it as `unknown`
- Origin check uses `project.hostname` (null) → `allowedOrigins` is empty → silentOk → no persist, no email

**Reference file:** `src/controllers/websiteContact/formSubmissionController.ts` — the origin check block at line 244

## Constraints

**Must:**
- Add `generated_hostname: string | null` to `IProject`
- In origin check, push `https://${project.generated_hostname}.sites.getalloro.com` when `generated_hostname` is set
- Keep the existing `project.hostname` check (may be used by legacy projects)

**Must not:**
- Remove or relax the origin check — it's a security layer
- Touch anything else in `formSubmissionController.ts`
- Modify any other models, migrations, or controllers

**Out of scope:**
- Backfilling `hostname` from `generated_hostname` for old projects
- Any changes to how projects are created

## Risk

**Level:** 1

**Risks identified:**
- None. The change only expands the allowlist for projects that currently have zero allowed origins. Security posture is unchanged for projects with `custom_domain`.

**Blast radius:** `formSubmissionController.ts` (self-contained), `ProjectModel.ts` (interface addition only — no query changes, no consumers break).

## Tasks

### T1: Add generated_hostname to IProject
**Do:** In `src/models/website-builder/ProjectModel.ts`, add `generated_hostname: string | null;` to `IProject` after `hostname`.
**Files:** `src/models/website-builder/ProjectModel.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit` — zero new errors

### T2: Include generated_hostname in origin allowlist
**Do:** In `src/controllers/websiteContact/formSubmissionController.ts:248`, before the `project.hostname` check, add:
```ts
if (project.generated_hostname) {
  allowedOrigins.push(`https://${project.generated_hostname}.sites.getalloro.com`);
}
```
**Files:** `src/controllers/websiteContact/formSubmissionController.ts`
**Depends on:** T1
**Verify:** `npx tsc --noEmit` — zero new errors. Manual: submit a form on a `.sites.getalloro.com` project with no custom domain — submission persists and email fires.

## Done
- [ ] `IProject` has `generated_hostname: string | null`
- [ ] `allowedOrigins` includes `https://${project.generated_hostname}.sites.getalloro.com` when set
- [ ] `npx tsc --noEmit` — zero errors
- [ ] Manual: endo form submission persists to list and sends email
