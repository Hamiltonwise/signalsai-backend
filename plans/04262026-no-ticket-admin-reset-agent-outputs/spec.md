---
id: spec-admin-reset-agent-outputs
created: 2026-04-26
ticket: no-ticket
mode: --start
status: planning
---

# Admin "Reset Agent Outputs" Feature

## Why
We just did a one-shot DB-level reset for org 36. That cost ~30 minutes of careful, ceremony-heavy operator work for what should be a routine debugging action when DFY-mode admins want to test a clean re-run of agents against a real org. Codifying it as an admin UI feature converts the next reset (and the next 50) into a one-minute action with safety rails baked in, no SSH, no env vars, no migration file proliferation.

## What
A "Reset Data" button in the admin Organization Detail header, next to the DFY badge. Clicking opens a modal that:
1. Fetches and displays current row counts per reset group.
2. Lets the admin check/uncheck which groups to wipe.
3. Requires the admin to type the exact org name to unlock the destructive action.
4. On submit, calls a single backend endpoint that deletes the selected groups in a single transaction and returns deletion counts.
5. Invalidates the relevant React Query keys so the affected tabs refetch and show empty state immediately.

**Done when:**
- The button renders next to the DFY badge for super-admins only (others don't see it).
- Modal lists all 9 reset groups with live row counts.
- Submitting with selections deletes only the selected groups; other groups untouched.
- After submit, navigating to each affected tab shows the empty state.
- Backend logs a structured audit line per reset (admin email, org id, groups, counts).
- TS check passes; `org delete` flow still works (regression check).

## Context

**Relevant files (read for understanding, modified or referenced during execution):**

Backend:
- `src/routes/admin/organizations.ts:116-122` — analog destructive route (`DELETE /:id` with `superAdminMiddleware`).
- `src/controllers/admin-organizations/AdminOrganizationsController.ts:173-206` — analog controller handler shape (`deleteOrg` requires `confirmDelete: true` body).
- `src/controllers/settings/feature-services/service.delete-organization.ts` — analog service file, transactional, console-logged.
- `src/middleware/superAdmin.ts` — RBAC check via `SUPER_ADMIN_EMAILS` env allowlist.
- `src/models/AgentRecommendationModel.ts` — `agent_results.id → agent_recommendations.agent_result_id` has NO ON DELETE CASCADE; manual delete required (we hit this in the prior one-off reset).
- `src/database/migrations/20260222000007_fix_fk_cascade_for_org_delete.ts` — confirms CASCADE FKs from `organizations.id` for `pms_jobs`, `agent_results`, `tasks`, `notifications`, `practice_rankings`. NOT relied on (we delete by org_id directly).

Frontend:
- `frontend/src/pages/admin/OrganizationDetail.tsx:214-221` — header section, DFY badge at line 219, button goes adjacent.
- `frontend/src/components/Admin/OrgSettingsSection.tsx:625-726` — analog modal (Delete Organization), inline JSX with framer-motion, "type org name to confirm" pattern. Reference structure to mimic.
- `frontend/src/components/Admin/OrgPmsTab.tsx`, `OrgAgentOutputsTab.tsx`, `OrgRankingsTab.tsx`, `OrgTasksTab.tsx`, `OrgNotificationsTab.tsx` — all use TanStack React Query with stable QUERY_KEYS. Modal must call `queryClient.invalidateQueries(...)` on the corresponding `*All(orgId)` keys after success.
- `frontend/src/api/admin-organizations.ts:172-173` — analog API client method (`adminDeleteOrganization`); add `adminResetOrgData` here.
- `frontend/src/api/agentOutputs.ts:100-113` — analog mutation shape for response types.

**Patterns to follow:**
- Backend: route → controller → service → model. Service file in `src/controllers/admin-organizations/feature-services/`, file name prefix `service.<verb>-<noun>.ts`.
- Frontend: typed API client function in `frontend/src/api/`, modal as inline JSX component (matches existing danger-zone pattern), framer-motion for the open animation.
- All destructive admin endpoints: `authenticateToken` → `superAdminMiddleware` → handler.
- Confirmation: type-org-name pattern, exact match of `org.name`, button disabled until match.

**Reference file:** `service.delete-organization.ts` — closest analog for transactional, multi-table, super-admin-only mutation. Reset service should mirror its shape (transaction wrapper, structured console log, best-effort partial-failure handling).

## Constraints

**Must:**
- Run all selected deletes in a single knex transaction. Partial failure rolls back entirely.
- Hard-delete; no soft-delete columns added.
- Manually delete `agent_recommendations` (FK no-cascade) before deleting `agent_results` for any agent_results-based reset group.
- Filter `tasks` reset to `category = 'ALLORO'` only — preserve user-created tasks.
- Filter `notifications` reset to `type IN ('task','pms','agent','ranking')` — preserve `type='system'` admin platform messages.
- Log a structured line via the existing app logger on every reset: `{ adminEmail, orgId, orgName, groups: [...], counts: {...}, timestamp }`. Use `console.log` with a stable prefix `[admin-reset]` (matches `service.delete-organization.ts` style).
- Return per-table deletion counts in the response so the frontend can show "Reset N rows across X groups".
- Modal must fetch row counts via a separate read-only `GET /admin/organizations/:id/reset-data/preview` endpoint before submit. No client-side count math.
- Super-admin only via existing `superAdminMiddleware`.

**Must not:**
- Touch `organizations`, `users`, `locations`, `user_locations`, `organization_users`, `invitations`, `google_connections`, `google_properties`, `google_data_store`, `website_builder.*`, `schedules`, `schedule_runs`, or any other table outside the 5 explicitly listed below.
- Cancel in-flight scheduler jobs, lock the org, or coordinate with BullMQ. Race-window risk is accepted for v1 (see Risk #3).
- Add a new audit table or migration. Logging is console-only for v1.
- Add new shared UI components (Modal, Button) — reuse the inline JSX pattern from OrgSettingsSection.tsx.
- Allow non-super-admins to see or call the endpoint.

**Out of scope:**
- In-flight job cancellation / org locking during reset (deferred — v2).
- Per-tab inline "Reset this tab" buttons inside each tab (deferred — single header button covers the use case).
- Snapshot/rollback per click (explicitly rejected — see Decision 1).
- Audit trail UI (console logs only for v1; if needed, separate plan for an `admin_audit_log` table).
- Resetting `google_data_store` (Proofline input, not output — outside the "agent outputs" framing).
- Admin-impersonation analytics events for the reset action.

## Risk

**Level:** 3 (Structural Risk — admin destructive feature, repeatedly callable, irreversible per click)

**Risks identified:**

1. **No undo per click.** Once the modal commits, deleted rows are gone. Mitigation: type-org-name confirm, response shows exact deletion counts so admin can spot errors immediately, server log captures the action.

2. **In-flight jobs race.** A BullMQ scheduler tick (60s cadence) could insert new `agent_results` rows post-delete. Result: reset appears to "not work" — admin re-runs reset. Mitigation for v1: documented in PR body, accepted because (a) DFY admins are the only callers, (b) re-clicking reset is cheap, (c) full mitigation requires job-cancel infrastructure that doesn't exist yet.

3. **`agent_recommendations` orphan if delete order is wrong.** `agent_recommendations.agent_result_id` has no CASCADE. Deleting `agent_results` first leaves orphans (FK violation in pg → tx fails). Mitigation: explicit ordering in service — recommendations first, then results.

4. **Endpoint exists in repo forever.** Once shipped, every future env has this destructive endpoint reachable by anyone on the SUPER_ADMIN_EMAILS list. Mitigation: standard for any super-admin route; the same risk already applies to `DELETE /admin/organizations/:id`.

5. **`type=system` notifications survive reset.** Could surprise admins who expect "all notifications gone." Mitigation: modal text explicitly says "Excludes admin platform messages."

6. **`category='USER'` tasks survive reset.** Same surprise risk. Mitigation: modal text explicitly says "User-created tasks preserved."

7. **Frontend stale-count race.** Counts shown in modal are fetched on modal open; if a job inserts rows between fetch and submit, counts in the response will be slightly higher than displayed. Acceptable — the response is authoritative.

**Blast radius:**
- Tables written to (DELETE only): `pms_jobs`, `agent_results`, `agent_recommendations`, `tasks` (filtered), `notifications` (filtered), `practice_rankings` — all scoped to one `organization_id`.
- Tables read (count preview): same set.
- New endpoints: 2 (`GET /admin/organizations/:id/reset-data/preview`, `POST /admin/organizations/:id/reset-data`).
- Frontend surface: 1 button + 1 modal on `/admin/organizations/:id`.

**Pushback:**
- This feature is the right call now that we've done the manual reset and confirmed the data model. But it concentrates a lot of destructive capability behind a single click. Recommend: after first 5 uses, review the structured logs and decide if a real audit table is warranted before this feature reaches non-DFY internal users.

## Decisions (with recommendations — redline via `--continue`)

**D1. Reversibility model:** **Hard delete, no per-click snapshot.** Snapshots-per-click pile up tables and create cleanup debt. Type-org-name confirm + response counts is the safety net. (Alternative considered: rolling per-org snapshot — rejected as over-engineered for v1.)

**D2. "Reset all" scope:** **All 9 groups checked by default in modal**, admin can uncheck. Groups defined below. Explicitly excludes `google_data_store`, user-category tasks, system-type notifications.

**D3. In-flight job protection:** **Deferred to v2.** Race window is small (60s), reset is rare, re-click is cheap.

**D4. RBAC:** **Super-admin only** via existing `superAdminMiddleware`. Matches Delete-Organization.

**D5. Confirm pattern:** **Type-org-name pattern** (matches Delete-Organization). Per-group selection via checkboxes within the same modal — admin types name once to unlock everything checked. (Alternative considered: lighter "type RESET" — rejected; org-name match is project standard for destructive ops.)

**D6. Audit:** **Console-log only for v1.** Existing infra, no new table. If usage grows, follow-up plan adds `admin_audit_log` table.

**Sub-decisions:**

**D7. Tasks filter:** `category = 'ALLORO'` only. User tasks preserved.

**D8. Notifications filter:** `type IN ('task','pms','agent','ranking')`. `system` (admin platform messages) preserved.

**D9. API shape:** Single endpoint `POST /admin/organizations/:id/reset-data` with body `{ groups: ResetGroupKey[], confirmName: string }`. Server validates `confirmName === org.name`. Plus `GET .../preview` returning row counts per group.

**Reset group keys (canonical):**

| Key | Tab | Tables affected | Filter |
|---|---|---|---|
| `pms_ingestion` | PMS Ingestion | `pms_jobs` | `organization_id = :id` |
| `rankings` | Rankings | `practice_rankings` | `organization_id = :id` |
| `tasks_alloro` | Tasks Hub | `tasks` | `organization_id = :id AND category = 'ALLORO'` |
| `notifications_non_system` | Notifications | `notifications` | `organization_id = :id AND type IN ('task','pms','agent','ranking')` |
| `agent_proofline` | Proofline | `agent_recommendations` (via join) + `agent_results` | `agent_results.organization_id = :id AND agent_type = 'proofline'` |
| `agent_summary` | Summary | `agent_recommendations` + `agent_results` | `... agent_type = 'summary'` |
| `agent_opportunity` | Opportunity | `agent_recommendations` + `agent_results` | `... agent_type = 'opportunity'` |
| `agent_cro` | CRO | `agent_recommendations` + `agent_results` | `... agent_type = 'cro_optimizer'` |
| `agent_referral` | Referral Engine | `agent_recommendations` + `agent_results` | `... agent_type = 'referral_engine'` |

## Tasks

Tasks split into two parallelizable groups: **Backend (T1–T4)** and **Frontend (T5–T8)**. Within each group, tasks are sequential. Backend and Frontend groups can be dispatched to two sub-agents in parallel.

### T1: Define types
**Do:** Create `src/types/adminReset.ts` exporting:
- `ResetGroupKey` literal union of the 9 keys above.
- `RESET_GROUP_KEYS: readonly ResetGroupKey[]`.
- `ResetGroupCounts = Record<ResetGroupKey, number>`.
- `ResetPreviewResponse = { orgId: number; orgName: string; counts: ResetGroupCounts }`.
- `ResetRequest = { groups: ResetGroupKey[]; confirmName: string }`.
- `ResetResponse = { success: true; deletedCounts: Record<string, number>; groupsExecuted: ResetGroupKey[] }`.
**Files:** `src/types/adminReset.ts` (new)
**Depends on:** none
**Verify:** `npx tsc --noEmit`.

### T2: Implement reset service
**Do:** Create `src/controllers/admin-organizations/feature-services/service.reset-org-data.ts` exporting:
- `previewResetCounts(orgId)` — runs the 9 read-only count queries, returns `ResetPreviewResponse`.
- `resetOrgData(orgId, groups, adminEmail)` — wraps all selected deletes in `knex.transaction()`. For each agent_results-based group: delete agent_recommendations via subquery first, then agent_results. For tasks/notifications: apply the filters from D7/D8. Returns `ResetResponse`. Logs `[admin-reset]` structured line.
**Files:** `src/controllers/admin-organizations/feature-services/service.reset-org-data.ts` (new)
**Depends on:** T1
**Verify:** `npx tsc --noEmit`. Manual: read service file end-to-end and confirm filter / order / log line.

### T3: Add controller methods
**Do:** Add `previewResetData` and `resetOrgData` handlers to `src/controllers/admin-organizations/AdminOrganizationsController.ts`. Validate: org exists (404), `confirmName === org.name` (400), `groups` non-empty subset of `RESET_GROUP_KEYS` (400). Call service. Return JSON.
**Files:** `src/controllers/admin-organizations/AdminOrganizationsController.ts` (modify)
**Depends on:** T2
**Verify:** `npx tsc --noEmit`.

### T4: Wire routes
**Do:** Add to `src/routes/admin/organizations.ts`:
- `GET /:id/reset-data/preview` → `authenticateToken, superAdminMiddleware, controller.previewResetData`
- `POST /:id/reset-data` → `authenticateToken, superAdminMiddleware, controller.resetOrgData`
**Files:** `src/routes/admin/organizations.ts` (modify)
**Depends on:** T3
**Verify:** `npx tsc --noEmit`. Manual: hit `GET /api/admin/organizations/36/reset-data/preview` against dev DB, confirm 200 + valid counts.

### T5: Add frontend API client
**Do:** Add `adminPreviewResetData(orgId)` and `adminResetOrgData(orgId, body)` to `frontend/src/api/admin-organizations.ts`. Match existing typed-fetch wrapper pattern from `adminDeleteOrganization`. Import types from a shared types file or duplicate locally (match existing convention in this file).
**Files:** `frontend/src/api/admin-organizations.ts` (modify)
**Depends on:** none (can run in parallel with T1–T4)
**Verify:** `npx tsc --noEmit` in frontend.

### T6: Build the modal component
**Do:** Create `frontend/src/components/Admin/ResetOrgDataModal.tsx`. Props: `{ org: { id; name }; open; onClose }`. On open: fetch preview, render checkbox list with row counts, "Select all" / "Select none" helpers. Type-org-name input, button disabled until match AND ≥1 group selected. On submit: call mutation, show toast with deletion summary, fire `queryClient.invalidateQueries` for all 5 tab keys, close modal. Match framer-motion + inline JSX pattern from `OrgSettingsSection.tsx:647-726`. Use react-hot-toast for feedback (existing convention).
**Files:** `frontend/src/components/Admin/ResetOrgDataModal.tsx` (new)
**Depends on:** T5
**Verify:** `npx tsc --noEmit`. Visual: modal renders, counts show, checkboxes toggle, confirm input behaves.

### T7: Place button in header
**Do:** In `frontend/src/pages/admin/OrganizationDetail.tsx` around line 219, add a "Reset Data" button next to the DFY badge. Wire `onClick` to open the modal. Render the modal at the end of the page JSX. Button styling: secondary danger (red border, transparent fill) — distinct from primary delete.
**Files:** `frontend/src/pages/admin/OrganizationDetail.tsx` (modify)
**Depends on:** T6
**Verify:** Visual: button visible to super-admin only (gate via existing `useIsSuperAdmin` hook or equivalent — confirm during execution which hook the codebase uses).

### T8: Verify React Query invalidation
**Do:** After T7 wiring works, manually click "Reset Data" with all groups selected, then click each tab. Confirm: PMS Ingestion empty, Agent Outputs (Proofline/Summary/Opportunity/CRO/Referral) empty, Rankings empty, Tasks Hub shows only USER-category tasks (or empty), Notifications shows only system-type notifications (or empty).
**Files:** none (manual verification)
**Depends on:** T7
**Verify:** Manual UI walkthrough.

## Done
- [ ] All 4 new files created, all 4 modified files updated.
- [ ] `npx tsc --noEmit` passes (backend root and frontend) with zero errors.
- [ ] `GET /api/admin/organizations/36/reset-data/preview` returns 200 with valid counts (org 36 will currently show all zeros — pick another org or a re-seeded org for verification).
- [ ] `POST /api/admin/organizations/36/reset-data` with all groups checked deletes the targeted rows in a single transaction.
- [ ] Backend log shows `[admin-reset]` line with admin email, org id, groups, counts.
- [ ] Modal type-org-name validation works (button disabled until exact match).
- [ ] Per-group checkboxes work — unchecked groups are NOT touched (verify via DB query).
- [ ] After reset, all 5 affected tabs render empty state on refetch.
- [ ] User-category tasks survive reset (regression check).
- [ ] System-type notifications survive reset (regression check).
- [ ] Delete-Organization button still works (regression).
- [ ] Non-super-admin users do NOT see the Reset button (RBAC gate).

## Out-of-Spec Follow-ups (not this plan)
- v2: in-flight job cancel + org-lock during reset.
- v2: per-tab inline reset buttons.
- v2: `admin_audit_log` table + admin-side audit log viewer.
- v2: include `google_data_store` reset as a separate group ("Reset Proofline source data").
- v2: extend modal to the remaining 7 groups (rankings, tasks_alloro, notifications_non_system, agent_proofline, agent_summary, agent_opportunity, agent_cro). Modal already structured to scale — just add list entries.

## Revision Log

### Rev 2 — 2026-04-26 (post-execution UX revision)

**Change:** Reset Data button visibility gated to the Agent Results section only. When the user is on Subscription & Project, Users & Roles, Connections, or Organization Settings, the button is hidden. When on any Agent Results sub-tab (Tasks Hub / Notifications / Rankings / PMS Ingestion / Proofline / Summary / Opportunity / CRO / Referral Engine), the button renders next to the DFY badge.

**Reason:** User direction — the button is contextually a "wipe agent outputs" action, so it shouldn't sit visible in unrelated sections (subscription/users/connections/settings). Reduces accidental-click surface and clarifies that it operates on agent data, not org metadata.

**Implementation:** Single-line gate — wrap the button JSX in `{activeSection === "agent" && (...)}` inside `actionButtons` of `OrganizationDetail.tsx`. `activeSection` is already tracked via URL search param `section` (line 142). No new state, no API change, backend untouched.

**Files affected:** `frontend/src/pages/admin/OrganizationDetail.tsx` only.

**Updated Done criterion:**
- [ ] Reset Data button visible only when `?section=agent` is active in URL.

---

### Rev 1 — 2026-04-26 (during planning, before execution)

**Change:** Scope reduced from 9 reset groups to **2** (`pms_ingestion`, `agent_referral`). Cascade rule added: PMS reset also clears Referral Engine output (derived data).

**Reason:** User direction — "let's start simple for now." Two-group v1 covers the most common debugging case (full re-run of PMS-driven analysis pipeline on a clean slate) and ships fast. The remaining 7 groups remain in the spec as v2 follow-up; modal architecture (checkbox list + type-org-name confirm) is unchanged so adding them later is a list-extension, not a redesign.

**Cascade rationale:** `agent_results` has no DB FK to `pms_jobs` — the link is semantic only (Referral Engine reads `pms_jobs.response_log.monthly_rollup`). Wiping PMS without RE leaves stale analysis pointing at deleted source data. Cascade is **PMS → RE only**; RE alone remains independent so admins can re-run analysis on existing PMS data without disturbing the source.

**Cascade implementation:** UI auto-checks (and disables uncheck of) the RE checkbox when PMS is checked, with a visible hint. Backend honors checkbox state literally — no hidden server-side cascade. This keeps the cascade rule visible to the operator at click time.

**Sections affected:**

- **What → "Done when":** reduced to 2 tabs (PMS Ingestion + Referral Engine show empty state).
- **Constraints → Must:** filters for `tasks_alloro` and `notifications_non_system` removed (those groups not in v1). Manual `agent_recommendations` delete still required for `agent_referral`.
- **Constraints → Must not:** preserved as-is (still must not touch the deferred groups' tables).
- **Constraints → Out of scope:** v1 explicitly excludes the 7 deferred groups (already covered by "Out-of-Spec Follow-ups").
- **Decisions → D2:** "Reset all" scope reduced — the modal default is "PMS + RE both checked" (not all 9).
- **Decisions → D7, D8:** **REMOVED for v1.** Tasks-category and notifications-type filters are not relevant when those groups aren't in scope. They return in v2 with the deferred groups.
- **Reset group keys table:** trimmed to 2 rows.
- **Tasks T1–T8:** scope of each task reduced. T1 type union shrinks to 2 keys. T2 service implements 2 reset paths + cascade enforcement (or rather, the request-time validation that checking PMS implies RE will be done in T6/T3 — see updated task notes below). T6 modal renders 2 checkboxes with the auto-check-and-disable behavior.
- **Done checklist:** reduced — fewer regression checks, no `category='ALLORO'` / `type=system` preservation checks for v1.

**Updated task deltas:**

- **T1** — `ResetGroupKey` literal union shrinks to `'pms_ingestion' | 'agent_referral'`. `RESET_GROUP_KEYS` array has 2 entries.
- **T2** — service implements `previewResetCounts` (2 counts) and `resetOrgData` (2 paths). For `agent_referral`: manual delete from `agent_recommendations` (via subquery join on `agent_results.agent_type='referral_engine'`) before deleting matching `agent_results`. For `pms_ingestion`: `DELETE FROM pms_jobs WHERE organization_id = :id`. **No backend cascade** — the cascade is UI-enforced.
- **T3** — controller validates `groups` is a non-empty subset of the 2 keys.
- **T6** — modal renders 2 checkboxes. When PMS is checked, RE checkbox is forced-checked and disabled with hint text "PMS reset also clears Referral Engine output (derived data)". When PMS is unchecked, RE becomes independently toggleable. Type-org-name input + confirm logic unchanged.
- **T8** — verify only 2 tabs (PMS Ingestion + Referral Engine) render empty after reset; verify the cascade UX (clicking PMS auto-locks RE).

**Updated Done criteria:**
- [ ] All 4 new files created, all 4 modified files updated.
- [ ] `npx tsc --noEmit` passes (backend + frontend) zero errors.
- [ ] `GET /api/admin/organizations/:id/reset-data/preview` returns 200 with counts for `pms_ingestion` + `agent_referral`.
- [ ] `POST /api/admin/organizations/:id/reset-data` with both groups deletes the targeted rows in a single transaction.
- [ ] Modal: checking PMS auto-checks-and-disables RE; unchecking PMS frees RE.
- [ ] Modal: type-org-name validation works.
- [ ] Backend log shows `[admin-reset]` line.
- [ ] After "PMS only" reset → both PMS Ingestion + Referral Engine tabs show empty state.
- [ ] After "RE only" reset → PMS Ingestion tab unchanged, Referral Engine empty.
- [ ] Other tabs (Rankings, Proofline, Summary, Opportunity, CRO, Tasks Hub, Notifications) untouched (regression).
- [ ] Delete-Organization button still works (regression).
- [ ] Non-super-admin users do not see the Reset button.
