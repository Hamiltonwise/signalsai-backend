# Fix Form Submissions Display, Delete, Export & Auth

## Problem Statement

Form submissions don't appear in the user's website tab despite being saved to DB (emails arrive). Investigation revealed: `apiGet` silently swallows API errors, backend doesn't return `totalPages`, no user DELETE endpoint, no export, and auth bypass bugs on two endpoints.

## Context Summary

- `apiGet` catches axios errors and returns error body — FormSubmissionsTab treats it as empty data
- Backend returns `pagination: { page, limit, total }` but frontend expects `totalPages`
- User route file has no DELETE for submissions
- `getFormSubmission` and `toggleFormSubmissionRead` don't validate submission belongs to user's org
- DFYWebsite.tsx doesn't pass `deleteSubmissionFn` or `isAdmin` to FormSubmissionsTab

## Existing Patterns to Follow

- User endpoints resolve project via `ProjectModel.findByOrganizationId(req.organizationId)`
- `apiGet` returns response body directly (error or success)
- FormSubmissionsTab uses injectable `fetchFn`/`toggleReadFn`/`deleteSubmissionFn` props
- CSV export pattern: set `Content-Type: text/csv` + `Content-Disposition: attachment`

## Proposed Approach

### 1. Fix silent error in FormSubmissionsTab
- After `fetchFn`, check `res.error` or `!res.success` → show toast, don't set empty submissions

### 2. Add `totalPages` to backend response
- In `listFormSubmissions`: add `totalPages: Math.ceil(result.total / limit)` to pagination object

### 3. Fix auth bypass on `getFormSubmission` and `toggleFormSubmissionRead`
- Resolve project via org, verify `submission.project_id === project.id` before returning/updating

### 4. Add user DELETE endpoint
- Add `deleteFormSubmission` to `UserWebsiteController` with org ownership validation
- Add `DELETE /form-submissions/:id` route in `user/website.ts`

### 5. Add CSV export endpoint
- Add `GET /form-submissions/export` to user routes
- Query all submissions, build CSV, return as download

### 6. Wire delete + export in frontend
- Add `userDeleteSubmission` wrapper in DFYWebsite.tsx, pass to FormSubmissionsTab
- Remove `isAdmin` gate on delete button (all users with role admin/manager can delete)
- Add export button in FormSubmissionsTab header

## Risk Analysis

Level 2 — Targeted fixes. Auth bypass fix is security-critical but scoped to 2 methods. No schema changes.

## Definition of Done

- [x] FormSubmissionsTab shows error toast on API failure instead of silent empty
- [x] Backend returns `totalPages` in pagination
- [x] `getFormSubmission` and `toggleFormSubmissionRead` validate org ownership
- [x] User DELETE endpoint exists and works
- [x] CSV export endpoint exists and works
- [x] Delete button visible for user page
- [x] Export button visible in submissions header
- [x] Both repos compile clean (tsc --noEmit passes)
