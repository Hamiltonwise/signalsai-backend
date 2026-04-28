# PMS Upload — Skip Admin + Client Approval Universally

## Why

The PMS ingestion pipeline used to need a two-stage human review (admin
QA → client confirmation) because n8n parsing was a black box and the
client never saw what was extracted. That world is gone. Every path
into PMS now resolves a column mapping inline, and the client confirms
the mapping in the drawer before submitting — they have already
reviewed the data. The downstream `admin_approval` and `client_approval`
gates are now ceremony: they delay agent runs by hours-to-days and
provide no incremental signal. Skip both, fire monthly_agents
immediately on submit.

Old jobs already stuck waiting on these gates need a one-shot recovery
sweep so the data the client uploaded actually produces insights.

## What

After this change, all three PMS ingestion paths
(`processManualEntry`, `processFileUpload`, `uploadWithMapping`) behave
identically post-submit:

- Job row created with `is_approved: true`, `is_client_approved: true`,
  `status: "approved"`.
- `automation_status_detail` initialized; `file_upload` and
  `pms_parser` marked `completed`; `admin_approval` and
  `client_approval` marked `skipped`.
- `monthly_agents` triggered immediately via the orchestrator HTTP
  call (`/api/agents/monthly-agents-run`).
- Existing PMS jobs sitting in `admin_approval` / `client_approval`
  awaiting state are unstuck via a guarded one-shot data migration,
  with a follow-up node script the operator runs to fire the agent
  trigger for each.

You'll know it's done when:

- A drag-drop CSV upload, a paste-with-mapping, and a manual entry all
  produce identical post-submit job state and reach `monthly_agents`
  without any approval click.
- The `pms_jobs.is_approved=0` count drops to zero on staging after
  the sweep migration runs.
- Admin's old "approve" button at `/admin/pms` is no longer load-
  bearing for new uploads (still wired — see "Out of scope").

## Context

**Relevant files (backend):**

- `src/controllers/pms/pms-services/pms-upload.service.ts` — houses
  `processManualEntry` (the working analog) and `processFileUpload`
  (the broken-by-default file path that still gates on admin).
- `src/controllers/pms/PmsController.ts` — `uploadWithMapping`
  (`PmsController.ts:793`) is the paste-with-mapping path. Currently
  creates a job but never initializes automation status, so it sits
  in limbo until an admin manually toggles approval.
- `src/controllers/pms/pms-services/pms-approval.service.ts` —
  `approveByAdmin` and `approveByClient`. These remain available for
  manual admin overrides on legacy jobs but are no longer hit by the
  default upload flow.
- `src/controllers/pms/pms-services/pms-automation.service.ts` —
  contains `getJobAutomationStatus` and the n8n-era parser callback
  (now unreachable from new uploads).
- `src/utils/pms/pmsAutomationStatus.ts` — `initializeAutomationStatus`,
  `updateAutomationStatus`, `completeStep`, `setAwaitingApproval`.
  No changes needed; just consumed by the new helper.
- `src/models/PmsJobModel.ts` — `PmsJobModel.create`. No changes.
- `src/database/migrations/20260423000002_reset_pms_data_org_36.ts` —
  reference for the env-var-guarded one-shot data migration pattern
  used in T4.

**Relevant files (frontend):**

No frontend changes in this spec. The drawer + confirm dialog already
treat the moment the user clicks Submit as the final step. Status
polling (`fetchAutomationStatus`) will pick up the new "skipped"
states automatically because `STEP_CONFIG` and `StepStatus` already
include them (`frontend/src/api/pms.ts:14-19`).

**Patterns to follow:**

- The "skip approvals + trigger monthly agents" block already exists in
  `processManualEntry` (`pms-upload.service.ts:63-144`). Extract this
  block verbatim into a shared helper; do not redesign the trigger.
- Async monthly_agents trigger via `axios.post` with promise-style
  error logging (no `await`); failures must not break job creation.
  `processManualEntry:111-133` is the template.
- Service layer files in `src/controllers/pms/pms-services/` follow the
  shape: top-of-file imports, JSDoc-described `export async function`s,
  no class wrappers. Match this when creating `pms-finalize.service.ts`.
- Knex one-shot data migrations follow the dual-env-var-guard pattern
  in `20260423000002_reset_pms_data_org_36.ts`: `*_CONFIRM=true` plus
  `*_DB_NAME=<expected>` matched against `process.env.DB_NAME`. No-op
  when guards fail. Snapshot rows to a `_backup_*` table before
  mutating. Provide a working `down()` that restores from snapshot.

**Reference files for new code:**

- `pms-finalize.service.ts` (new) — closest analog is
  `pms-approval.service.ts`. Same folder, same export style, same
  error-throwing convention (`throw Object.assign(new Error(...),
  { statusCode })`).
- New knex migration — analog is
  `20260423000002_reset_pms_data_org_36.ts`.

## Constraints

**Must:**

- Reuse the existing `monthly_agents` trigger pattern from
  `processManualEntry:99-144`. Do not re-route via a new endpoint.
- All three upload paths must produce byte-equivalent job rows
  post-submit (same flag values, same `automation_status_detail`
  shape).
- The `axios.post` to `/api/agents/monthly-agents-run` stays
  fire-and-forget. A failure to dispatch must not fail the upload
  request — log and move on.
- `GoogleConnectionModel.findOneByOrganization` must be called
  exactly once per upload; if it returns null, skip the trigger and
  log a warning (no exception).
- The data sweep migration must be guarded by `PMS_SWEEP_CONFIRM=true`
  AND `PMS_SWEEP_DB_NAME=<expected>` matching `process.env.DB_NAME`.
  No-op otherwise. Snapshot affected rows before mutation.
- Document in JSDoc on `pms-finalize.service.ts` that this helper is
  the single source of truth for "PMS data is approved, run agents
  now." Future paths must call this — no parallel implementations.

**Must not:**

- Don't touch `approveByAdmin` / `approveByClient` /
  `togglePmsJobApproval` / `updatePmsJobClientApproval`. They stay
  callable for manual admin operations on legacy jobs.
- Don't change `automation_status_detail` schema, `StepKey` union, or
  `STEP_CONFIG` values. The "skipped" state is already valid.
- Don't introduce a new dependency. axios + knex + existing models only.
- Don't refactor `processManualEntry` beyond extracting the helper.
  The validation, parsing, and `PmsJobModel.create` call stay in place.
- Don't auto-trigger `monthly_agents` from inside the knex migration.
  Migrations are pure DB. The agent kickoff is a separate operator-run
  script.
- Don't delete the admin approval endpoints or remove
  `setAwaitingApproval` / the "awaiting_approval" status. Old jobs
  predating this change may still have legitimate admin work pending.

**Out of scope:**

- Deleting `/pms/jobs/:id/approval` and `/pms/jobs/:id/client-approval`
  routes (separate cleanup once all legacy jobs are drained).
- Removing the admin's PMS approval UI at `/admin/pms`.
- The "Paste detected" → "File detected" dialog wording fix when
  drag-dropping a file. Tracked separately as a `--quickfix`.
- Adding a richer per-row preview to the column mapping drawer.
- Cost / rate-limiting controls on the auto-triggered `monthly_agents`
  run.

## Risk

**Level:** 3 — Structural Risk

**Risks identified:**

- **No human gate before agents run.** A misinferred mapping or a
  garbage paste now hits the agent orchestrator immediately, costing
  five LLM agent runs of tokens per upload. The client may not catch
  the problem until they see broken dashboard numbers.
  → **Mitigation:** the `ColumnMappingDrawer` parsedPreview is the
  canonical client review step. If the preview is wrong, the client
  edits + reprocesses before clicking Submit. Out-of-band: we can
  follow up by adding monthly totals + source counts to the drawer
  preview so it surfaces the same shape as the dashboard. Not in
  this spec — flagged as a recommended sequel.

- **No undo for a bad upload.** Today an admin spotting a wrong
  upload simply does not approve. After this change, agents are
  already running by the time anyone notices.
  → **Mitigation:** the existing `/pms/jobs/:id/restart` flow already
  supports re-running agents. To abort an in-flight bad job, an admin
  uses `DELETE /pms/jobs/:id` (already wired,
  `PmsController.ts:385-403`). No new endpoint needed; document this
  recovery path in the spec's "Operator notes" task.

- **Cost amplification.** Each upload now fires 5 monthly agents
  unconditionally. Previously gated by human approval cadence
  (sometimes days), now per-upload.
  → **Mitigation:** acknowledged by user. Not blocking. Worth a
  follow-up dashboard metric (`pms_jobs` per day × agent cost) but
  not in this spec.

- **Stuck-jobs migration data corruption.** The sweep migration
  flips approval flags on real production data. If the matcher is
  wrong (e.g., catches jobs that legitimately need admin review),
  recovery requires the snapshot table.
  → **Mitigation:** dual-env-var guards, snapshot-before-mutate,
  working `down()`. Run on staging first. The match condition
  (`is_approved=0` AND `automation_status_detail.currentStep IN
  ('admin_approval', 'client_approval')`) is narrow and explicit.

- **Old jobs without `automation_status_detail` may exist.** Pre-
  status-tracking-era jobs may have NULL `automation_status_detail`.
  The sweep migration's WHERE clause must handle this — either skip
  them or include them under a separate condition.
  → **Mitigation:** migration logs both counts (matched-with-status,
  matched-NULL) and only acts on rows with non-NULL status detail in
  the `currentStep` IN (...) bucket. NULL-status rows are listed in
  log output for manual review.

**Pushback (Level 3):**

The minimal-friction path here is to ship #1 and trust the column
mapping drawer as the sole client review surface. That's correct
provided the drawer's preview is honest about what data is going in.
Today the drawer shows the parsed `monthly_rollup` preview at the
month level, which is decent — but it does not flag low-confidence
column assignments visually on the row. A misinferred
`production_total` column will look fine in the preview because the
math sums the same way; only inspection of the raw column-role
mapping reveals the issue. **Recommendation:** add a follow-up plan
for "drawer trust signals" — confidence pills on each column
assignment, a low-confidence warning state on submit. Not blocking
this spec.

**Blast radius (consumers of changed surface area):**

Direct consumers of `processManualEntry`, `processFileUpload`,
`uploadWithMapping`:
- `PmsController.uploadPmsData` (file upload + manual entry router)
- `PmsController.uploadWithMapping` (paste-with-mapping)
- Frontend: `frontend/src/api/pms.ts:uploadPMSData`,
  `submitManualPMSData`, `uploadWithMapping`
- Frontend components: `DirectUploadModal`, `PMSUploadModal`,
  `PMSUploadWizardModal`, `TemplateUploadModal`,
  `PMSManualEntryModal` (consumes the API wrappers)

No backend service outside this directory consumes these functions.

Indirect consumers of `pms_jobs.is_approved`:
- `src/utils/pms/pmsAggregator.ts:167` — `WHERE is_approved=1`
  (aggregations skip unapproved jobs). After this change, every new
  job is `is_approved=1`, so aggregations include them immediately.
  This is the desired behavior (agents need the data) but worth
  noting: dashboard numbers will reflect uploaded data the moment
  agents finish, not after a human approval delay.
- `src/utils/dashboard-metrics/service.dashboard-metrics.ts:508,517`
  — same pattern.

No DB-level consumers of `automation_status_detail.currentStep ===
'admin_approval'` other than the polling endpoint, which already
handles `skipped` state.

## Tasks

### T1: Extract `finalizePmsJob` helper

**Do:** Create a new service module that owns the "skip approvals +
trigger monthly agents" workflow. Export
`finalizePmsJob(jobId: number, organizationId: number | null,
locationId: number | null, options?: { domain?: string })` that:
1. Calls `initializeAutomationStatus(jobId)`.
2. Marks `file_upload` and `pms_parser` as `completed`.
3. Marks `admin_approval` and `client_approval` as `skipped` with
   custom messages matching the existing manual-entry copy.
4. Sets the `monthly_agents` step to `processing` with substep
   `data_fetch`.
5. Looks up the org's google connection via
   `GoogleConnectionModel.findOneByOrganization(organizationId)`.
6. If found: fires the async axios POST to
   `/api/agents/monthly-agents-run` with the standard payload
   (`googleAccountId`, `force: true`, `pmsJobId`, `locationId`, and
   `domain` when provided). Promise-style `.then`/`.catch` logging.
7. If org or google connection is missing: logs a warning, returns
   without throwing.

Refactor `processManualEntry` to call this helper in place of its
existing inlined block.

**Files:**
- `src/controllers/pms/pms-services/pms-finalize.service.ts` (new,
  matches `pms-approval.service.ts` shape)
- `src/controllers/pms/pms-services/pms-upload.service.ts` (modify
  `processManualEntry` to delegate)

**Depends on:** none

**Verify:**
- `npx tsc --noEmit` zero errors on changed files
- Manual: existing manual-entry submit still creates job + fires
  agents (regression check) — submit a manual entry, watch
  `pms_jobs` row appear with `is_approved=1`, watch
  `automation_status_detail.currentStep` advance to `monthly_agents`,
  confirm `monthly-agents-run` endpoint hit in server logs

### T2: Update `processFileUpload` to skip approvals

**Do:** Replace the post-creation block in `processFileUpload`
(currently `pms-upload.service.ts:289-300` — the `completeStep` →
`setAwaitingApproval(admin_approval)` chain) with:
1. Set the `PmsJobModel.create` payload's `is_approved: true`,
   `is_client_approved: true`, `status: "approved"`.
2. Call `finalizePmsJob(jobId, organizationId, locationId, { domain })`
   in place of the manual `completeStep` + `setAwaitingApproval` calls.

Remove the now-unused imports (`completeStep`,
`setAwaitingApproval`) if no other call site in this file needs them
after T1's refactor.

**Files:**
- `src/controllers/pms/pms-services/pms-upload.service.ts`

**Depends on:** T1

**Verify:**
- `npx tsc --noEmit` zero errors
- Manual: drag-drop a CSV in `DirectUploadModal` → verify in DB
  the resulting `pms_jobs` row has `is_approved=1`,
  `is_client_approved=1`, `status="approved"`,
  `automation_status_detail.steps.admin_approval.status="skipped"`,
  `automation_status_detail.steps.client_approval.status="skipped"`,
  `automation_status_detail.currentStep="monthly_agents"`
- Manual: confirm in server logs that
  `/api/agents/monthly-agents-run` is invoked

### T3: Update `uploadWithMapping` to skip approvals

**Do:** In `PmsController.uploadWithMapping`
(`PmsController.ts:793-903`):
1. Change the `PmsJobModel.create` payload to set `is_approved: true`,
   `is_client_approved: true`, `status: "approved"`.
2. After job creation, call `finalizePmsJob(job.id, orgId, locationId,
   { domain: req.body?.domain })`.
3. Domain isn't currently part of the request body — add an optional
   `domain` field on the body, plumbed through from the frontend's
   `uploadWithMapping({ domain, ... })` payload (already part of the
   API wrapper signature in `frontend/src/api/pms.ts:868-893`, but
   the backend currently ignores it).

**Files:**
- `src/controllers/pms/PmsController.ts`

**Depends on:** T1

**Verify:**
- `npx tsc --noEmit` zero errors
- Manual: paste a non-template CSV in `PMSManualEntryModal`, confirm
  mapping in drawer, click Submit → DB shows job created with
  `is_approved=1`, automation status advanced to `monthly_agents`,
  `monthly-agents-run` endpoint hit in server logs

### T4: One-shot data sweep for stuck legacy jobs

**Do:** Create a new knex migration that recovers PMS jobs trapped in
`admin_approval` or `client_approval` awaiting state.

Migration shape (modeled on
`20260423000002_reset_pms_data_org_36.ts`):
1. Dual-env-var guard: `PMS_SWEEP_CONFIRM=true` AND
   `PMS_SWEEP_DB_NAME=<expected>` matched against `process.env.DB_NAME`.
   No-op with explanatory log otherwise.
2. Identify candidate jobs: `is_approved=0` AND
   `automation_status_detail->>'currentStep' IN ('admin_approval',
   'client_approval')`. Log count.
3. Snapshot the matched rows into
   `pms_jobs_sweep_backup_20260428` (full row copy). Log snapshot
   count.
4. For each candidate: update `is_approved=1`,
   `is_client_approved=1`, `status='approved'`. Patch the JSONB
   `automation_status_detail` so `steps.admin_approval.status` and
   `steps.client_approval.status` are `"skipped"`. Leave
   `currentStep` as-is (a follow-up script in T5 advances it +
   triggers agents).
5. Log NULL-status rows separately (no action taken; surfaced for
   manual review).
6. Working `down()` restores from snapshot table; drops snapshot
   table on success.

Plan-folder migrations:
- `migrations/pgsql.sql` — equivalent SQL for direct execution
  (Postgres is the prod DB).
- `migrations/mssql.sql` — placeholder for MSSQL execution (TODO at
  execution time per CLAUDE.md template).
- `migrations/knexmigration.ts` — TS scaffold mirroring the actual
  knex file. (Project uses TS migrations; CLAUDE.md template says
  `.js` but the codebase convention overrides.)

The actual knex migration file lives at
`src/database/migrations/20260428000010_sweep_stuck_pms_approvals.ts`
(timestamp-suffixed to land after the latest existing migration,
`20260428000005_add_search_position_source.ts`).

**Files:**
- `src/database/migrations/20260428000010_sweep_stuck_pms_approvals.ts`
  (new)
- `plans/04282026-no-ticket-pms-skip-admin-client-approval/migrations/pgsql.sql`
  (new — scaffolded with TODOs during planning, filled at execution)
- `plans/04282026-no-ticket-pms-skip-admin-client-approval/migrations/mssql.sql`
  (new — TODO scaffold)
- `plans/04282026-no-ticket-pms-skip-admin-client-approval/migrations/knexmigration.ts`
  (new — TS scaffold mirroring the actual file)

**Depends on:** T1, T2, T3 (helper + new code paths must be live before
recovering stuck jobs, otherwise newly-unstuck jobs would have
inconsistent automation_status_detail relative to fresh uploads)

**Verify:**
- Migration is a no-op on local without env vars set
- On a staging DB snapshot: with env vars set, run migration → query
  `SELECT count(*) FROM pms_jobs WHERE is_approved=0` returns 0
- Snapshot table `pms_jobs_sweep_backup_20260428` populated with
  pre-update row copies
- `down()` restores; re-running `up()` after `down()` works
- Logs clearly state: matched count, snapshot count, NULL-status row
  IDs, post-update verification count

### T5: Agent-kickoff script for swept jobs

**Do:** Create a one-off node script that operators run **after**
T4's migration is applied, to fire `monthly_agents` for every job the
sweep flipped.

Script behavior:
1. Read jobs from the snapshot table
   `pms_jobs_sweep_backup_20260428` (the canonical "what we
   touched" list — survives even if `pms_jobs` is mutated further).
2. For each job ID still present in `pms_jobs`: call the existing
   `retryService.restartMonthlyAgents(jobId)` programmatically (same
   service the `/pms/jobs/:id/restart` endpoint uses).
3. Log per-job success/failure. Continue on individual failure.
4. Final summary: total, succeeded, failed (with error per failure).
5. Exit 0 if all succeeded, exit 1 if any failed.

Script lives at
`scripts/pms-restart-stuck-jobs.ts`. Invocation:
`npx ts-node scripts/pms-restart-stuck-jobs.ts` (or the project's
existing script-runner convention — verify at execution time).

**Files:**
- `scripts/pms-restart-stuck-jobs.ts` (new)

**Depends on:** T4 (snapshot table must exist; T1's helper indirectly
via `restartMonthlyAgents` which already wraps it)

**Verify:**
- Dry-run mode (`--dry-run` flag) lists jobs without calling restart
- Run on staging post-migration → confirm each job advances from
  `currentStep="admin_approval"` (with `skipped` admin/client steps)
  to `currentStep="monthly_agents"` with status `processing`
- Confirm `agent_results` rows produced for each restarted job
- Exit code 0 with no failures

### T6: Document the operator runbook

**Do:** Add a brief operator-facing block to the spec's "Done" section
documenting the deploy + sweep order:
1. Deploy code change (T1–T3 live).
2. Set env vars `PMS_SWEEP_CONFIRM=true` +
   `PMS_SWEEP_DB_NAME=<db>` and run knex migrations on staging,
   verify, run on prod.
3. Run `scripts/pms-restart-stuck-jobs.ts` on prod once migration
   succeeds.
4. After 7 days, drop `pms_jobs_sweep_backup_20260428` via a
   follow-up cleanup migration.

Also document: to **abort** a bad in-flight upload, admins use
`DELETE /pms/jobs/:id` (existing endpoint, no new wiring needed).

**Files:** spec.md (this file, in the Done section)

**Depends on:** T1–T5

**Verify:** N/A — documentation only.

## Done

**Code-level checks:**

- [ ] `npx tsc --noEmit` exits with zero errors caused by this change
- [ ] `npm run lint` passes (or no new warnings introduced)
- [ ] All three upload paths (`processManualEntry`,
      `processFileUpload`, `uploadWithMapping`) call
      `finalizePmsJob` and produce identical post-creation job state
- [ ] `pms-finalize.service.ts` exists and is the only place that
      contains the "skip approvals + fire monthly agents" workflow
- [ ] No callers of `setAwaitingApproval(jobId, "admin_approval")`
      remain in the upload paths (still callable from legacy code
      paths is fine)
- [ ] New knex migration is a no-op without env vars; populated
      snapshot table when guards pass; working `down()`

**Manual verification:**

- [ ] Drag-drop a real CSV via `DirectUploadModal` → job in DB has
      `is_approved=1`, `is_client_approved=1`, `status="approved"`,
      automation status shows admin/client `skipped` and
      `monthly_agents` `processing`, agent endpoint hit in logs
- [ ] Paste a non-template CSV via `PMSManualEntryModal`, confirm
      mapping in drawer, submit → same end state
- [ ] Type a manual entry via `PMSManualEntryModal` (legacy path) →
      same end state (regression)
- [ ] Sweep migration on staging snapshot: pre-state count of
      `is_approved=0` jobs > 0; post-state = 0; snapshot table has
      original rows
- [ ] Run agent-kickoff script post-migration: every swept job
      advances to `monthly_agents` with `processing` status
- [ ] Admin's `/admin/pms` dashboard still renders job list and the
      manual approval toggle still works on legacy jobs (regression)

**Operator runbook:**

1. **Deploy code change** (T1–T3 + T4 migration file shipped). Knex
   migrations on deploy will see `20260428000010_sweep_stuck_pms_approvals`
   but it is a no-op without env vars set.
2. **Stage sweep on staging:**
   ```
   PMS_SWEEP_CONFIRM=true \
   PMS_SWEEP_DB_NAME=<staging-db-name> \
   npx knex migrate:up 20260428000010_sweep_stuck_pms_approvals.ts
   ```
   Verify logs show non-zero `matched` count and `snapshot complete`.
   Confirm `SELECT COUNT(*) FROM pms_jobs WHERE is_approved=false`
   dropped to zero (modulo NULL-status rows). Confirm
   `pms_jobs_sweep_backup_20260428` exists.
3. **Run kickoff script on staging:**
   ```
   npx tsx scripts/pms-restart-stuck-jobs.ts --dry-run
   # review the printed job ids, then:
   npx tsx scripts/pms-restart-stuck-jobs.ts
   ```
   Watch for per-job `kicked off` log lines and a final summary with
   `succeeded === total` and `failed === 0`.
4. **Verify on staging:** swept jobs should now have
   `automation_status_detail.currentStep === 'monthly_agents'` with
   `status === 'processing'`. Within minutes, `agent_results` rows
   should appear and dashboards should refresh.
5. **Repeat steps 2–4 on prod** with `PMS_SWEEP_DB_NAME=<prod-db-name>`.
6. **After 7-day rollback window**, drop the snapshot table via a
   follow-up cleanup migration:
   ```sql
   DROP TABLE public.pms_jobs_sweep_backup_20260428;
   ```

**Abort path for a bad in-flight upload (post-this-change):**

If an admin spots a wrong upload after agents have started running,
use the existing `DELETE /pms/jobs/:id` endpoint
(`PmsController.ts:385-403`). It removes the job row and any
in-flight agent traffic that references the deleted `pms_jobs.id`
will error harmlessly. No new wiring needed.

**Done — runbook checklist:**

- [ ] Deploy order documented: code → migration → kickoff script
- [ ] Abort path documented: `DELETE /pms/jobs/:id` for bad
      in-flight uploads
- [ ] Backup-table cleanup follow-up scheduled (drop
      `pms_jobs_sweep_backup_20260428` after 7-day rollback window)

**No regressions:**

- [ ] Dashboard metrics (`getPmsKeyData`) still aggregate correctly —
      pre-existing `is_approved=1` filter still includes the now-
      auto-approved jobs
- [ ] Admin-side approval endpoints (`PATCH
      /pms/jobs/:id/approval` and `/client-approval`) still callable
      and still mutate `pms_jobs` correctly (legacy compatibility)
- [ ] `getJobAutomationStatus` polling endpoint serializes the new
      `skipped` step states without errors
