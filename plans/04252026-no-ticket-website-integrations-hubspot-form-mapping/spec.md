# Website Integrations — HubSpot Form-to-Contact Mapping (v1)

## Why

Customer websites collect form submissions today, but those submissions don't flow into customer CRMs. Customers who run HubSpot want every non-flagged submission pushed into a chosen HubSpot form so it lands as a contact, fires their existing form workflows, and triggers downstream automations (e.g., the Make.com "new contact" flow already in production). HubSpot is the wedge; the architecture must accommodate Salesforce/Pipedrive/etc. without rework.

## What

A new **Integrations** tab on the per-website admin dashboard. v1 ships HubSpot only:

- Connect a HubSpot account by pasting a Private App access token. Token validated, portal ID auto-fetched, credentials encrypted at rest.
- UI lists detected website forms (derived from `form_submissions.form_name`) with field-shape preview from recent submissions.
- UI lists HubSpot forms (live from HubSpot Forms API v3) and lets the user map each detected website form to a HubSpot form. Multiple website forms may map to one HubSpot form.
- Field mapping is a per-row dropdown UI with auto-inferred defaults (`email→email`, `phone→phone`, etc.). User adjusts and saves.
- A "Recent activity" panel under each integration shows the last 10 push attempts (success/skip/fail) so customers can self-diagnose.
- At runtime: every non-flagged form submission is pushed asynchronously to the mapped HubSpot form via the Forms Submissions API. Flagged submissions skip the push and are logged. Idempotent against worker retries.
- Broken-form detection: real-time on tab load (live cross-reference against HubSpot's current forms list, no stale cache) plus a daily scheduled validation job that ALSO re-validates the token. Broken mappings and revoked tokens surface in the UI immediately.
- Vendor-agnostic schema, controller, and worker shape so future adapters drop in without restructure.

**Done when:** a customer pastes a HubSpot Private App token, picks a HubSpot form, maps fields with sensible defaults, submits a form on their site, and sees a contact appear in HubSpot — and a flagged spam submission does not.

## Context

### Relevant files (read before editing)

**Backend — submission hot path:**
- `src/controllers/websiteContact/formSubmissionController.ts` — entry point; validates, sanitizes, AI-classifies, S3-uploads, calls `FormSubmissionModel.create()`. **Hook point** for enqueuing the CRM push. **T0 audits this end-to-end before any other work.**
- `src/models/website-builder/FormSubmissionModel.ts` — submission CRUD, schema reference for `form_name` + `contents` JSONB. Source of truth for the `FormSection[]` and legacy flat shapes.
- `src/database/migrations/20260228000001_add_recipients_and_form_submissions.ts` — base form_submissions schema.
- `src/database/migrations/20260302100000_add_form_submission_flagging_columns.ts` — `is_flagged` column.

**Backend — credential storage analog:**
- `src/models/PlatformCredentialModel.ts` — **reference analog** for new `WebsiteIntegrationModel`. Same encryption pattern (AES-256-GCM via `src/utils/encryption.ts`), same SAFE_COLUMNS approach, same lifecycle (active/expired/revoked).
- `src/controllers/minds/MindsPlatformCredentialsController.ts` — **reference analog** for new `WebsiteIntegrationsController`. Same CRUD + revoke shape.
- `src/database/migrations/20260228000004_platform_credentials.ts` — schema reference for new integrations migration.
- `src/utils/encryption.ts` — reuse as-is for token encryption.

**Backend — admin website CRUD pattern:**
- `src/controllers/admin-websites/AdminWebsitesController.ts` — controller layout, response envelope `{ success, data, ... }`, integration with feature services in `feature-services/`.
- `src/routes/admin/websites.ts` — route registration pattern; non-parameterized routes before parameterized ones.

**Backend — worker pattern:**
- `src/workers/worker.ts` — single worker process, 16 queues, 3 prefixes (`{minds}`, `{wb}`, `{audit}`). Add `{crm}` prefix.
- `src/workers/queues.ts` — queue helper pattern (`getMindsQueue`, `getAuditQueue`). Add `getCrmQueue`.
- `src/workers/processors/auditLeadgen.processor.ts` — **reference analog** for processor file structure (concurrency, lock duration, retry config).
- `src/controllers/audit/audit-services/auditWorkflowService.ts` — **reference analog** for enqueue-from-controller pattern.

**Frontend — tab and layout pattern:**
- `frontend/src/pages/admin/WebsiteDetail.tsx` — host page; `VALID_TABS` array (line ~319), tab bar render (lines ~1305–1348). 4 edits to register a new tab.
- `frontend/src/components/Admin/PostsTab.tsx` — **reference analog** for sidebar+main 30/70 layout, local state pattern, no React Query.
- `frontend/src/components/Admin/FormSubmissionsTab.tsx` — **reference analog** for list+detail data flow (closer fit than Posts since no rich editor).
- `frontend/src/api/posts.ts` — **reference analog** for new `frontend/src/api/integrations.ts`.
- `frontend/src/components/ui/DesignSystem.tsx` — `ActionButton`, shared UI primitives.

### Patterns to follow

- **3-layer backend:** controller → feature service → model. Cross-cutting business logic in `feature-services/service.{name}.ts`.
- **Naming:** `{Entity}Model.ts`, `{Feature}Controller.ts`, `service.{feature-name}.ts`, `{entity}.ts` for routes.
- **Encryption:** AES-256-GCM via `src/utils/encryption.ts`. `CREDENTIALS_ENCRYPTION_KEY` env var.
- **Response envelope:** `{ success: boolean, data?: T, error?: string }`.
- **Pagination:** `BaseModel.paginate()` (see `FormSubmissionModel.findByProjectId`).
- **Queue helper:** `getXxxQueue("name").add(jobName, payload, options)`. BullMQ + IORedis. Prefix `{xxx}`.
- **Frontend state:** local `useState` + `useCallback` + `useEffect`. No React Query. Plain `fetch` with `credentials: "include"`.
- **Multi-tenant scope:** all per-website state scoped by `project_id` FK. No cross-website reads.

### Vendor-agnostic abstraction (introduced in this plan)

```
src/services/integrations/
  types.ts            # ICrmAdapter interface + DTOs
  hubspotAdapter.ts   # HubSpot implementation
  fieldInference.ts   # auto-default field mapping rules
  index.ts            # getAdapter(platform) → ICrmAdapter
```

`ICrmAdapter` exposes:
- `validateConnection(decryptedCreds): Promise<{ ok: boolean; portalId?: string; accountName?: string; error?: string }>`
- `listForms(decryptedCreds): Promise<VendorForm[]>` — `VendorForm = { id, name, fields: { name, label, fieldType, required }[] }`
- `getFormSchema(decryptedCreds, formId): Promise<VendorForm | null>`
- `submitForm(decryptedCreds, formId, mappedFields, context): Promise<PushResult>`

Per-vendor queue, shared processor: `crmPush.processor.ts` dispatches via `getAdapter(integration.platform).submitForm(...)`. v1 registers only `hubspot-push`; future vendors add `{platform}-push` queues with their own concurrency caps.

## Constraints

**Must:**
- All credentials encrypted at rest with AES-256-GCM. Never log decrypted tokens. Never return decrypted tokens from any controller endpoint.
- All per-website integration state scoped by `project_id`. Cross-tenant reads impossible by query shape.
- Submission hot path (`formSubmissionController.ts`) MUST NOT block the visitor response on integration logic. Enqueue-only — actual push is async via worker. Wrap enqueue in try/catch; a Redis hiccup must not break form submissions.
- Push jobs are idempotent: BullMQ `jobId` MUST equal `submissionId` to deduplicate retries.
- Flagged submissions (`is_flagged === true`) are NEVER pushed. Skip is logged to `crm_sync_logs` with reason.
- Vendor-agnostic schema and adapter interface from day one. v1 implements HubSpot only but `platform` column and adapter registry MUST work for future vendors without migration. `platform` column has a CHECK constraint listing known values; adding a vendor = one tiny migration to extend the CHECK.
- Match existing layering: controller → feature service → model. No direct DB access from controllers.
- Match existing naming conventions exactly. Models in `src/models/website-builder/` (since per-website-scoped).
- Migration files use Knex `.ts` migrations matching existing format (`20260228000004_platform_credentials.ts`).
- Routes in `src/routes/admin/websites.ts` follow non-parameterized-first ordering.
- Frontend tab matches `PostsTab.tsx` 30/70 layout and `FormSubmissionsTab.tsx` data flow.
- `crm_sync_logs` is an audit trail. Deleting an integration MUST NOT cascade-delete its log history. Use `ON DELETE SET NULL` on `integration_id` and denormalize `platform` + `vendor_form_id` onto each log row so logs remain useful after the integration row is gone.

**Must not:**
- No new top-level dependencies beyond `@hubspot/api-client` (only added if SDK is materially better than raw fetch — evaluate during execution).
- No drag-and-drop libraries. Field mapping uses native `<select>` dropdowns per row. (Decision: ship simpler UX in v1; revisit if user feedback demands it.)
- No OAuth in v1 (Private App token only). Code path designed to extend to OAuth later without rewrite.
- No backfill of historical submissions. Forward-only from mapping creation timestamp.
- No drive-by refactors of `formSubmissionController.ts`, `worker.ts`, or `WebsiteDetail.tsx` outside the integration hook points.
- No new worker process. New queue lives in the existing `worker.ts`.
- No marketplace app, no public app review.
- No "create HubSpot custom property for unmapped field" flow. Unmapped fields are silently dropped in v1 (logged for visibility).
- No in-memory caching of vendor forms list across requests. The HubSpot list-forms call is fast and infrequent — cache only if observed contention demands it, and only via Redis (we already have it for BullMQ) so it works under multi-instance API deployments.

**Out of scope (v1):**
- Salesforce, Pipedrive, ActiveCampaign, or any non-HubSpot adapter implementation. Schema and adapter registry support them; concrete implementations come later.
- OAuth installation flow. Add in v1.5.
- Multi-portal per customer (one HubSpot connection per website project).
- Custom HubSpot property creation for unmapped website fields (defer to v1.1).
- Bulk replay/backfill of past submissions.
- Email/in-app notification when a mapping breaks (logged + UI badge in v1; user-facing notification in v1.1).
- Deduping contacts before push (HubSpot dedupes by email natively).
- Webhook receiver from HubSpot (one-way push only in v1).
- **One-to-many fanout** (one website form pushing to multiple HubSpot forms). v1 enforces N→1 via `UNIQUE (integration_id, website_form_name)`.
- **Static defaults in mappings** (e.g., always set `lifecyclestage: "subscriber"`). Field mapping is pure 1:1 in v1.
- **Field transformations** (concatenation, phone normalization, lowercase email, splitting "Full Name" into first+last). 1:1 only.
- **Manual retry from UI** for failed pushes. v1 logs failures; v1.1 adds a retry button on log rows.
- **Soft delete** of integrations. v1 hard-deletes; sync log rows survive via `ON DELETE SET NULL` + denormalized columns.
- **Encryption key rotation support.** `CREDENTIALS_ENCRYPTION_KEY` rotation invalidates all stored tokens. Same limitation as existing `platform_credentials`. Documented; not addressed.

## Risk

**Level:** 2 (Concern)

### Risks identified

1. **Race condition on `is_flagged` evaluation** → **Mitigation:** **T0 audits this BEFORE any other task starts.** If `is_flagged` is set asynchronously after the response returns, the controller-level hook in T7 is wrong (we'd push spam). T0's outcome dictates whether T7 stays as-specified or pivots to enqueueing from the AI-classification completion handler. T0 is BLOCKING — T1 cannot start until T0 is resolved.

2. **Token revoked or rotated by customer in HubSpot** → **Mitigation:** All adapter calls catch 401 → mark integration `status: "revoked"` → surface "Reconnect" CTA in UI. Daily validation job (T8) ALSO re-validates tokens proactively, so revocation is caught within 24h even if no submissions arrive. Same code path will handle OAuth refresh-token failures later.

3. **HubSpot form deleted on customer side** → **Mitigation:** Two-layer detection (real-time on tab load + daily scheduled validation). Submission-time 404 marks the mapping `status: "broken"`. Failed submissions log to `crm_sync_logs`; user notified in UI on next tab open via the "Recent activity" panel.

4. **HubSpot rate limit (100 req / 10s for Private Apps)** → **Mitigation:** Concurrency 3 on `hubspot-push` queue. Adapter wraps 429 to throw → BullMQ retries with exponential backoff. Rate limit is per-portal, so cross-customer contention is impossible. Raise concurrency only if observed bottlenecks.

5. **Encryption key (`CREDENTIALS_ENCRYPTION_KEY`) missing in env** → **Mitigation:** Fail fast on application startup if the var is missing AND the integrations feature flag is on. Surface a clear deployment error. Existing `src/utils/encryption.ts` already handles this — verify behavior in T2.

6. **`form_submissions.contents` JSONB has two shapes** (legacy flat `Record<string,string>` vs sectioned `FormSection[]`) → **Mitigation:** Both T4 (form-detection) and T6 (push processor) include explicit pseudocode for shape detection and flattening. Add unit tests for both shapes.

7. **AI-flagged-but-actually-valid submissions blocked from CRM** → **Acknowledged, not mitigated in v1.** Customer can manually unflag in the submissions UI; we don't auto-replay to CRM on unflag (would require backfill which is out of scope). v1.1 candidate: "Push to CRM" action button on individual submission detail view.

8. **Worker retry duplication** → **Mitigation:** BullMQ `jobId` set to `submissionId` so a duplicate enqueue is a no-op. Eliminates the "5 of the same submission in HubSpot form analytics" failure mode.

### Blast radius

Files that take a behavioral change (not just additive):
- `src/controllers/websiteContact/formSubmissionController.ts` — adds enqueue call after `FormSubmissionModel.create()`. Change is gated on `is_flagged === false` AND active mapping found. **Hot path** — if the enqueue throws synchronously, visitor form submission breaks. Must wrap in try/catch with error log only.
- `src/workers/worker.ts` — additive (registers new queue). No risk to existing queues.
- `frontend/src/pages/admin/WebsiteDetail.tsx` — additive (new tab). No risk to existing tabs.
- `src/routes/admin/websites.ts` — additive (new routes). Verify no path collision with existing form-submissions routes.

Consumers of files being modified:
- `formSubmissionController.ts` consumed by every public website form submission. Test impact: any regression breaks lead capture across all customer sites.
- `worker.ts` consumed by every background job in the system. Test impact: a misregistered queue could fail worker startup.
- `WebsiteDetail.tsx` consumed by every admin viewing a website. Test impact: tab registration error crashes the dashboard for all customers.

All three files have low intrinsic change surface in this plan (one hook call, one queue registration, four edits for tab). Mitigation: extra care + manual smoke test of each hot path post-execution.

### Pushback (none — design has been pressure-tested)

The major design questions (auth model, vendor abstraction, worker placement, mapping schema, broken-form strategy, UI complexity) were debated during the `-b` phase and refined during `-c` revision. No remaining pushback at the architectural level. Implementation-level concerns are captured as Risks above.

## Tasks

T0 is blocking. T1→T2 sequential. After T2, the rest of backend (T3–T8) and the entire frontend (T9–T11) can proceed in parallel via sub-agents.

### T0: `is_flagged` timing audit (BLOCKING — must complete before T1)

**Do:** Read `src/controllers/websiteContact/formSubmissionController.ts` end-to-end. Trace the AI spam-classification flow. Determine:

1. Does the AI classification complete BEFORE `FormSubmissionModel.create()` is called?
2. Is `is_flagged` written synchronously to the row at create time, or set later by an async handler?
3. If async: where does the flag-setting handler live (file + line range)? Does it have access to BullMQ queue helpers?

Append a `## Findings` section to this spec capturing the answer with file:line references. Then act on the outcome:

- **Sync (expected case):** confirm and proceed with T7 as currently specified. Note "T7 design confirmed" in Findings.
- **Async (pivot case):** revise this spec under a new Revision Log entry BEFORE T1 starts. T7 must move from the controller to the AI-classification completion handler. Update Risk #1 to "resolved by re-architecture."

**Files (read-only):**
- `src/controllers/websiteContact/formSubmissionController.ts`
- Any AI-classification service file referenced from there

**Depends on:** none

**Verify:** `## Findings` section appended to spec; T7 wording aligned with finding; if pivot needed, Revision Log entry exists and T7 description is updated.

---

### T1: Database migrations

**Do:** Create three Knex `.ts` migrations in `src/database/migrations/` for the new tables. All in `website_builder` schema. Use `gen_random_uuid()` for PKs, `TIMESTAMPTZ` for timestamps, FK behavior chosen per audit-trail vs lifecycle data.

Tables:
1. **`website_builder.website_integrations`** — one row per (website project, vendor) pair.
   - `id` UUID PK
   - `project_id` UUID FK → `website_builder.projects(id)` ON DELETE CASCADE
   - `platform` TEXT NOT NULL — e.g., `'hubspot'`. Indexed.
   - `label` TEXT NULL — user-friendly display name
   - `encrypted_credentials` TEXT NOT NULL — AES-256-GCM blob
   - `metadata` JSONB NOT NULL DEFAULT `'{}'` — vendor-specific (HubSpot: `{ portalId, accountName }`)
   - `status` TEXT NOT NULL DEFAULT `'active'` — `'active'` | `'revoked'` | `'broken'`
   - `last_validated_at` TIMESTAMPTZ NULL
   - `last_error` TEXT NULL
   - `created_at`, `updated_at` TIMESTAMPTZ DEFAULT NOW()
   - UNIQUE (project_id, platform) — one HubSpot connection per project
   - **CHECK (platform IN ('hubspot'))** — DB-level safety against typos/rogue inserts. Extending vendors = tiny migration to broaden the CHECK.

2. **`website_builder.website_integration_form_mappings`** — many rows per integration.
   - `id` UUID PK
   - `integration_id` UUID FK → `website_integrations(id)` ON DELETE CASCADE
   - `website_form_name` TEXT NOT NULL — matches `form_submissions.form_name`
   - `vendor_form_id` TEXT NOT NULL — HubSpot form GUID
   - `vendor_form_name` TEXT NULL — cached for UI display
   - `field_mapping` JSONB NOT NULL DEFAULT `'{}'` — `{ "websiteFieldKey": "vendorFieldName" }`
   - `status` TEXT NOT NULL DEFAULT `'active'` — `'active'` | `'broken'` (vendor form deleted)
   - `last_validated_at` TIMESTAMPTZ NULL
   - `last_error` TEXT NULL
   - `created_at`, `updated_at` TIMESTAMPTZ DEFAULT NOW()
   - INDEX (integration_id, website_form_name)
   - UNIQUE (integration_id, website_form_name) — one mapping per (integration, website form). Enforces N→1 (multiple website forms can share one vendor_form_id; same website form cannot fan out to multiple vendor forms).

3. **`website_builder.crm_sync_logs`** — audit trail of every CRM push attempt. **Survives integration deletion.**
   - `id` UUID PK
   - `integration_id` UUID NULL FK → `website_integrations(id)` **ON DELETE SET NULL** (audit trail outlives integration)
   - `mapping_id` UUID NULL FK → `website_integration_form_mappings(id)` ON DELETE SET NULL
   - `submission_id` UUID NULL FK → `form_submissions(id)` ON DELETE SET NULL
   - `platform` TEXT NULL — **denormalized** from integration; preserved when integration row is deleted
   - `vendor_form_id` TEXT NULL — **denormalized** from mapping; preserved when mapping row is deleted
   - `outcome` TEXT NOT NULL — CHECK list: `'success'` | `'skipped_flagged'` | `'failed'` | `'no_mapping'`. **`'no_integration'` removed** — we don't write log rows for submissions on websites that have no CRM connected (write-amplification risk).
   - `vendor_response_status` INT NULL — HTTP status from vendor
   - `vendor_response_body` TEXT NULL — truncated to 4KB
   - `error` TEXT NULL
   - `attempted_at` TIMESTAMPTZ DEFAULT NOW()
   - INDEX (integration_id, attempted_at DESC)
   - INDEX (submission_id)
   - INDEX (outcome, attempted_at DESC) WHERE outcome IN ('failed', 'skipped_flagged') — partial index for the dashboard query

**Files:**
- `src/database/migrations/20260425100000_create_website_integrations.ts`
- `src/database/migrations/20260425100001_create_website_integration_form_mappings.ts`
- `src/database/migrations/20260425100002_create_crm_sync_logs.ts`

**Reference analog:** `src/database/migrations/20260228000004_platform_credentials.ts`

**Depends on:** T0

**Verify:** `npx knex migrate:latest` applies clean against a dev DB. Inspect schema with `\d+ website_builder.website_integrations` etc. Roll forward + roll back must both succeed. CHECK constraints reject bad inserts (try `INSERT ... platform = 'hubpost'` and confirm rejection).

---

### T2: Models

**Do:** Create three model classes following the `BaseModel` pattern used in `FormSubmissionModel` and `PlatformCredentialModel`. All in `src/models/website-builder/`.

1. **`WebsiteIntegrationModel.ts`**
   - `IWebsiteIntegration` interface (full row) and `IWebsiteIntegrationSafe` (omits `encrypted_credentials`)
   - `SAFE_COLUMNS` const for selects that must not leak credentials
   - Methods: `findById`, `findByProjectAndPlatform`, `findByProjectId` (returns SAFE), `create`, `update`, `delete`, `updateStatus`, `updateLastValidated`
   - Internal-only: `getDecryptedCredentials(id)` — returns plaintext token; only callable from adapter layer. Comment explicitly that this MUST NOT be exposed via any controller.
   - Encryption helpers wrap `src/utils/encryption.ts`.

2. **`IntegrationFormMappingModel.ts`**
   - `IIntegrationFormMapping` interface
   - Methods: `findById`, `findByIntegrationId`, `findByIntegrationAndWebsiteForm`, `create`, `update`, `delete`, `updateStatus`, `bulkUpdateStatus` (for daily validation), `bulkMarkBrokenByVendorIds` (used when a vendor form is deleted)

3. **`CrmSyncLogModel.ts`**
   - `ICrmSyncLog` interface (includes denormalized `platform` + `vendor_form_id`)
   - Methods:
     - `create(input)` — insert. Caller passes denormalized `platform` and `vendor_form_id` from the integration/mapping at write time
     - `findByIntegrationId(integrationId, pagination)` — paginated, recent first (used by Recent Activity panel)
     - `findBySubmissionId(submissionId)`
     - `pruneOlderThan(date)` — retention housekeeping; not yet wired to a cron in v1, but the method MUST exist and be tested so v1.1 can wire it without code changes

**Files:**
- `src/models/website-builder/WebsiteIntegrationModel.ts`
- `src/models/website-builder/IntegrationFormMappingModel.ts`
- `src/models/website-builder/CrmSyncLogModel.ts`

**Reference analog:** `src/models/PlatformCredentialModel.ts` (encryption pattern), `src/models/website-builder/FormSubmissionModel.ts` (paginate, schema scoping)

**Depends on:** T1

**Verify:** `npx tsc --noEmit` zero errors. No method exists that returns `encrypted_credentials` to a public caller. Manual: insert a row with a fake plaintext, fetch via `getDecryptedCredentials`, confirm round-trip. `pruneOlderThan` deletes rows older than the given date and leaves newer rows untouched.

---

### T3: Vendor adapter layer

**Do:** Create the vendor-agnostic adapter abstraction and HubSpot implementation.

1. **`src/services/integrations/types.ts`**
   - `ICrmAdapter` interface (signatures listed in Context section)
   - `VendorForm`, `VendorFormField`, `PushResult`, `ValidateConnectionResult`, `MappedFieldPayload` types
   - `CrmPlatform` type (string union) — initially `'hubspot'` only

2. **`src/services/integrations/hubspotAdapter.ts`**
   - Implements `ICrmAdapter` for HubSpot
   - `validateConnection`: calls `GET https://api.hubapi.com/account-info/v3/details` with Bearer token. On success returns `{ ok: true, portalId, accountName }`. 401 → `{ ok: false, error: 'invalid_token' }`.
   - `listForms`: calls `GET https://api.hubapi.com/marketing/v3/forms` (paginates if needed). Maps response to `VendorForm[]`.
   - `getFormSchema`: calls `GET https://api.hubapi.com/marketing/v3/forms/{formId}`. Returns `null` on 404 (used as broken-form signal).
   - `submitForm`: POSTs to `https://api.hsforms.com/submissions/v3/integration/submit/{portalId}/{formGuid}` with `{ fields: [{ name, value }, ...], context: { pageUri, pageName } }`. **Auth-less endpoint** (Forms Submissions API doesn't require token for non-sensitive fields). Returns `PushResult` with vendor status + body.
   - All methods catch network errors → return structured error, never throw to processor (except 429/5xx where throwing triggers BullMQ retry — see T6).
   - Decision point during execution: use `@hubspot/api-client` SDK or raw `fetch`? Default to raw `fetch` unless the SDK provides materially better retry/rate-limit handling. Document choice in code comment.

3. **`src/services/integrations/fieldInference.ts`**
   - `inferFieldMapping(websiteFields: string[], vendorFields: VendorFormField[]): Record<string, string>` — auto-defaults
   - Rules:
     - Exact match (case-insensitive, normalized): `email`, `phone`, `firstname`, `lastname`, `company`, `message`
     - Fuzzy: `first_name|firstName|fname → firstname`, `last_name|lastName|lname → lastname`, `phoneNumber|phone_number|tel → phone`, `email_address|emailAddress → email`, `comments|inquiry|notes → message`
     - Domain synonyms (dental/ortho): `practice_name → company`, `concern → message`, `preferred_appointment → custom property` (logged as unmappable in v1)
   - Returns partial mapping; user adjusts the rest manually in UI.

4. **`src/services/integrations/index.ts`**
   - `getAdapter(platform: CrmPlatform): ICrmAdapter` registry
   - Throws on unknown platform with clear error message

**Files:**
- `src/services/integrations/types.ts`
- `src/services/integrations/hubspotAdapter.ts`
- `src/services/integrations/fieldInference.ts`
- `src/services/integrations/index.ts`

**Reference analog:** none in this codebase (this introduces the pattern). Closest is `src/config/stripe.ts` (third-party SDK wrapper) — match its lazy-initialization style.

**Depends on:** T2 (uses model types)

**Verify:** Unit tests (or smoke script) calling `validateConnection` with a real HubSpot Private App token in dev → portalId returned. `listForms` returns array with at least 1 form on a populated test account. `inferFieldMapping` produces expected defaults for sample inputs.

---

### T4: Form-detection feature service

**Do:** Service that derives the website-side form catalog from existing `form_submissions` data.

`src/controllers/admin-websites/feature-services/service.form-detection.ts`

Methods:
- `listDetectedForms(projectId)`: `SELECT form_name, COUNT(*) AS submission_count, MAX(submitted_at) AS last_seen FROM website_builder.form_submissions WHERE project_id = ? GROUP BY form_name ORDER BY last_seen DESC`. Returns `DetectedForm[]`.
- `getFormFieldShape(projectId, formName, sampleSize = 20)`: Reads last N submissions for that form, unions field keys across both legacy flat and sectioned `FormSection[]` shapes (handle both — see T6 pseudocode), returns `FieldShape[]` with `{ key, sampleValue, occurrenceCount }`.

**Files:**
- `src/controllers/admin-websites/feature-services/service.form-detection.ts`

**Reference analog:** existing files in `src/controllers/admin-websites/feature-services/`

**Depends on:** T2

**Verify:** Manual via REPL or temporary endpoint: feed a known projectId, confirm distinct form_names returned with correct counts. Feed both legacy and sectioned submission rows, confirm field shape extracts keys from both.

---

### T5: Controller + routes

**Do:** New controller for integrations CRUD + HubSpot operations. Routes added to existing admin/websites router. **No in-memory caching** — vendor-forms list goes straight through to the adapter on each request.

1. **`src/controllers/admin-websites/WebsiteIntegrationsController.ts`**
   - `listIntegrations(req, res)` — GET — returns SAFE rows for project
   - `getIntegration(req, res)` — GET single — SAFE
   - `createIntegration(req, res)` — POST — accepts `{ platform, label, credentials }`. Validates token via adapter, fetches portalId/accountName into `metadata`, stores encrypted, returns SAFE row.
   - `updateIntegration(req, res)` — PUT — label/credentials update; revalidates
   - `deleteIntegration(req, res)` — DELETE — cascades mappings; sync_logs survive (SET NULL)
   - `revokeIntegration(req, res)` — POST — sets status `'revoked'`, leaves row for audit
   - `listVendorForms(req, res)` — GET — calls adapter `listForms` directly, no cache
   - `validateMappings(req, res)` — POST — cross-references current mappings against vendor forms, updates broken statuses, returns updated mapping list
   - `listDetectedForms(req, res)` — GET — wraps form-detection service
   - `getDetectedFormFieldShape(req, res)` — GET — wraps form-detection service
   - `inferFieldMapping(req, res)` — POST — calls fieldInference service for default mapping suggestion
   - `listMappings(req, res)` — GET
   - `createMapping(req, res)` — POST — `{ website_form_name, vendor_form_id, field_mapping }`
   - `updateMapping(req, res)` — PUT
   - `deleteMapping(req, res)` — DELETE
   - **`listSyncLogs(req, res)` — GET — paginated sync_log rows for an integration, recent first. Backs the Recent Activity panel.**

2. **Route additions in `src/routes/admin/websites.ts`** — placed BEFORE `/:id/form-submissions` block to maintain non-parameterized-first ordering within a sub-resource:

```
GET    /:id/integrations
POST   /:id/integrations
GET    /:id/detected-forms
GET    /:id/detected-forms/:formName/field-shape
GET    /:id/integrations/:integrationId
PUT    /:id/integrations/:integrationId
DELETE /:id/integrations/:integrationId
POST   /:id/integrations/:integrationId/revoke
GET    /:id/integrations/:integrationId/vendor-forms
POST   /:id/integrations/:integrationId/validate-mappings
POST   /:id/integrations/:integrationId/infer-mapping
GET    /:id/integrations/:integrationId/sync-logs
GET    /:id/integrations/:integrationId/mappings
POST   /:id/integrations/:integrationId/mappings
PUT    /:id/integrations/:integrationId/mappings/:mappingId
DELETE /:id/integrations/:integrationId/mappings/:mappingId
```

**Files:**
- `src/controllers/admin-websites/WebsiteIntegrationsController.ts`
- `src/routes/admin/websites.ts` (edit — additive)

**Reference analog:** `src/controllers/minds/MindsPlatformCredentialsController.ts`, `src/controllers/admin-websites/AdminWebsitesController.ts`

**Depends on:** T2, T3, T4

**Verify:** `curl` each endpoint with a real auth cookie. Token validation against real HubSpot dev portal returns portalId. `listVendorForms` returns forms. Mapping create/update round-trips. `sync-logs` endpoint paginates correctly. `npx tsc --noEmit` zero errors.

---

### T6: Worker queue + processor

**Do:** New queue + processor for async CRM push.

1. **`src/workers/queues.ts`** (edit) — add `getCrmQueue(platform: string)` that returns a queue named `${platform}-push` with prefix `{crm}`.

2. **`src/workers/processors/crmPush.processor.ts`** (new)
   - Job payload: `{ submissionId: string, mappingId: string }`
   - **Idempotency:** the job is enqueued with `jobId: submissionId` (T7 contract). BullMQ refuses duplicate jobIds, so retries of the same submission are deduped at the queue layer. Processor logic does NOT need additional dedup checks.
   - Reads submission + mapping + integration → decrypts credentials → applies field mapping → calls `getAdapter(integration.platform).submitForm(...)` → writes `crm_sync_logs` row with outcome AND denormalized `platform` + `vendor_form_id`
   - On 401 from adapter → mark integration `status: "revoked"`, log failure, do NOT throw (no point retrying with a dead token)
   - On 404 from adapter (form deleted) → mark mapping `status: "broken"`, log failure, do NOT throw
   - On 429 → throw to trigger BullMQ retry (exponential backoff handles rate-limit waits)
   - On other 5xx → throw for retry
   - On success → log row with `outcome: "success"`

   **`form_submissions.contents` flattening pseudocode** (used both in T4 form-detection and T6 push) — both shapes produce a flat `Record<string, string | FileValue>`:

   ```typescript
   function flattenSubmissionContents(
     contents: unknown
   ): Record<string, string | FileValue> {
     if (Array.isArray(contents)) {
       // sectioned shape: FormSection[] = [{ title, fields: [[key, value], ...] }]
       const out: Record<string, string | FileValue> = {};
       for (const section of contents) {
         if (!section || !Array.isArray(section.fields)) continue;
         for (const pair of section.fields) {
           if (!Array.isArray(pair) || pair.length < 2) continue;
           const [key, value] = pair;
           if (typeof key !== 'string' || value == null) continue;
           out[key] = value;
         }
       }
       return out;
     }
     if (contents && typeof contents === 'object') {
       // legacy flat shape: Record<string, string | FileValue>
       return contents as Record<string, string | FileValue>;
     }
     throw new Error(`unknown form_submissions.contents shape`);
   }

   // After flattening, apply field_mapping to translate website keys → vendor names.
   // FileValue entries are pushed as their .url field (HubSpot accepts a URL string).
   // null/undefined values are filtered out before the vendor request.
   ```

   Type definitions for `FormSection` and `FileValue` live in `src/models/website-builder/FormSubmissionModel.ts` — import from there, do NOT redefine.

3. **`src/workers/processors/crmMappingValidation.processor.ts`** (new) — daily validation
   - Iterates active integrations
   - For each integration: call `adapter.validateConnection()` first. On 401 → mark integration `status: "revoked"`, skip mapping checks, log to `crm_sync_logs` with `outcome: "failed"` + error description (no submission_id since this isn't a push attempt — submission_id NULL).
   - If token still valid: call `adapter.listForms()`, cross-reference active mappings for this integration. Mark any mapping whose `vendor_form_id` is missing from the list as `status: "broken"`, update `last_validated_at` and `last_error`.
   - Write a summary log line per integration (active mappings count, broken count, token status).

4. **`src/workers/worker.ts`** (edit) — register the `hubspot-push` queue:
   - Concurrency: 3
   - lockDuration: 30000
   - attempts: 5, exponential backoff 5000ms base
   - removeOnComplete: 100, removeOnFail: 50

   And register `crm-mapping-validation` repeat job at 4:30am UTC (mirror `setupDiscoverySchedule` pattern).

**Files:**
- `src/workers/queues.ts` (edit)
- `src/workers/processors/crmPush.processor.ts` (new)
- `src/workers/processors/crmMappingValidation.processor.ts` (new)
- `src/workers/worker.ts` (edit — additive registrations)

**Reference analog:** `src/workers/processors/auditLeadgen.processor.ts`, existing `setupDiscoverySchedule` in `worker.ts`

**Depends on:** T2, T3

**Verify:** `npm run dev:worker` starts cleanly, logs `hubspot-push` and `crm-mapping-validation` queue registrations. Manually enqueue a job via REPL → processor runs → log row appears with denormalized `platform` and `vendor_form_id`. Trigger a 401 path with a bad token → integration row flips to revoked. Enqueue same `submissionId` twice → BullMQ rejects the second enqueue (idempotency proven). Trigger the daily validation job manually with a known-good and known-bad token → connection validation marks the bad one revoked.

---

### T7: Hook submission hot path

**Do:** Add CRM-enqueue logic to `formSubmissionController.ts` **AFTER the AI analysis block (after line 475) and BEFORE the email send (line 478).** Per T0 findings, the local `flagged` boolean is finalized at line 475 and is the correct gate — NOT the DB row's `is_flagged` (which is always `false` immediately after `create()` because the AI UPDATE happens later).

Logic:
```
// Place between line 475 (end of AI block) and line 478 (email send).
// All operations wrapped in inner try/catch — must NOT throw to outer handler.

if (submissionId) {  // create() at line 444 may have failed silently; skip if so
  try {
    const integration = await WebsiteIntegrationModel.findByProjectAndPlatform(
      String(projectId),
      'hubspot'  // v1: HubSpot only. Future: loop active platforms or accept platform list
    );

    if (integration && integration.status === 'active') {
      const mapping = await IntegrationFormMappingModel.findByIntegrationAndWebsiteForm(
        integration.id,
        sanitizedFormName
      );

      if (flagged) {
        // Skip push, but log so the customer can see it in Recent Activity
        await CrmSyncLogModel.create({
          integration_id: integration.id,
          mapping_id: mapping?.id ?? null,
          submission_id: submissionId,
          platform: integration.platform,
          vendor_form_id: mapping?.vendor_form_id ?? null,
          outcome: 'skipped_flagged',
          error: flagReason || null,
        });
      } else if (!mapping || mapping.status !== 'active') {
        // No mapping configured for this form — log so customer knows why nothing was pushed
        await CrmSyncLogModel.create({
          integration_id: integration.id,
          mapping_id: null,
          submission_id: submissionId,
          platform: integration.platform,
          vendor_form_id: null,
          outcome: 'no_mapping',
        });
      } else {
        // Active mapping + non-flagged → enqueue idempotent push
        const queue = getCrmQueue(integration.platform);
        await queue.add(
          'push-submission',
          { submissionId, mappingId: mapping.id },
          {
            jobId: submissionId,                                 // IDEMPOTENCY KEY
            attempts: 5,
            backoff: { type: 'exponential', delay: 5000 },
            removeOnComplete: 100,
            removeOnFail: 50,
          }
        );
      }
    }
    // If no integration exists at all, write nothing (write-amplification rule per T1)
  } catch (err) {
    console.error('[Form Submission] CRM enqueue failed:', err);
    // Do not throw — visitor response must complete normally
  }
}
```

**Why this placement:**
- AFTER AI block: `flagged` is final
- BEFORE email send: doesn't matter functionally, but keeps the "external integrations" cluster together for readability
- `submissionId` precondition: the create() at line 444 catches its own errors and sets `submissionId = null`; we must skip the enqueue path in that case (nothing to push)
- Inner try/catch: the outer handler returns 500 on uncaught errors; we must never let CRM logic break form submissions

**Files:**
- `src/controllers/websiteContact/formSubmissionController.ts` (edit — additive block only, no changes to existing flow)

**Reference analog:** the `sendEmailWebhook` call at line 482 — same fire-and-forget shape (though here it's `await`-ed, the existing email send is also `await`).

**Depends on:** T0 (resolved — sync confirmed), T2, T6

**Verify:**
- Submit a non-flagged form on a website with active mapping → see job processed → contact in HubSpot. `crm_sync_logs` row with `outcome='success'`, denormalized `platform='hubspot'` and `vendor_form_id` set.
- Submit a flagged form (use spam-trigger content that the AI catches) → no push. `crm_sync_logs` row with `outcome='skipped_flagged'` and `error` populated with `flagReason`.
- Submit a form whose `form_name` has no mapping → no push. `crm_sync_logs` row with `outcome='no_mapping'`.
- Submit a form on a website with NO integration → NO `crm_sync_logs` row written (write-amplification rule).
- Stop Redis temporarily → submit form → submission still succeeds (visitor sees `{ success: true }`), error logged, no 500.
- Submit same form payload twice rapidly (BullMQ jobId dedup) → exactly ONE HubSpot contact created and ONE `outcome='success'` log row.
- Trusted form type (`onboarding` or `insurance-inquiry`) with active mapping → pushes (correctly skips AI; `flagged` stays false).
- Newsletter form (`formType === "newsletter"`) → does NOT reach this hook because `handleNewsletterSignup` returns at line 361 (out of scope for v1 CRM push).

---

### T8: Scheduled mapping + token validation job

Already covered as part of T6 (registered in `worker.ts` startup). Listed here so the Done checklist can reference it explicitly.

**Verify (already in T6):** Daily job appears in BullMQ inspection, fires on schedule, validates BOTH token (via `validateConnection`) AND mapping form existence (via `listForms`), updates statuses correctly.

---

### T9: Frontend API client

**Do:** New `frontend/src/api/integrations.ts` mirroring `frontend/src/api/posts.ts`.

Functions (one per backend endpoint listed in T5):
- `fetchIntegrations(projectId)`
- `getIntegration(projectId, integrationId)`
- `createIntegration(projectId, payload)`
- `updateIntegration(projectId, integrationId, payload)`
- `deleteIntegration(projectId, integrationId)`
- `revokeIntegration(projectId, integrationId)`
- `fetchVendorForms(projectId, integrationId)`
- `validateMappings(projectId, integrationId)`
- `fetchDetectedForms(projectId)`
- `fetchDetectedFormFieldShape(projectId, formName)`
- `fetchMappings(projectId, integrationId)`
- `createMapping(projectId, integrationId, payload)`
- `updateMapping(projectId, integrationId, mappingId, payload)`
- `deleteMapping(projectId, integrationId, mappingId)`
- `inferMapping(projectId, integrationId, payload)`
- **`fetchSyncLogs(projectId, integrationId, { page, limit })`** — backs Recent Activity panel

TypeScript types (mirror backend): `Integration`, `IntegrationFormMapping`, `DetectedForm`, `FieldShape`, `VendorForm`, `VendorFormField`, **`SyncLog`**.

**Files:**
- `frontend/src/api/integrations.ts`

**Reference analog:** `frontend/src/api/posts.ts`

**Depends on:** none (can be developed in parallel with backend; types verified at integration time)

**Verify:** All exports compile. Each fetch function accepts/returns correct shapes.

---

### T10: IntegrationsTab component

**Do:** New top-level tab component matching `PostsTab.tsx` 30/70 layout.

Structure:
- Sidebar (30%): list of integration providers. v1 shows HubSpot card with connection status (Connected / Not connected / Revoked / Broken). Selected provider highlighted.
- Main (70%): conditional on selected provider.
  - **HubSpot, not connected:** "Connect HubSpot" CTA → opens modal accepting Private App token paste → POSTs `createIntegration` → on success refresh list.
  - **HubSpot, connected:** four sections, vertically stacked:
    1. **Connection panel:** Account name, portal ID, last validated, "Reconnect" / "Disconnect" actions.
    2. **Detected forms:** list of website forms from `fetchDetectedForms`, each row shows form name + submission count + last seen + mapping status badge.
    3. **Field mapping editor** (visible when a detected form is expanded/selected): shows website form fields (from `fetchDetectedFormFieldShape`) on left as a table; each row has a `<select>` dropdown populated with HubSpot form fields (from `fetchVendorForms`). HubSpot form selector dropdown sits above the table. "Auto-fill defaults" button calls `inferMapping` and pre-fills empty selects without overwriting user choices. Save button → `createMapping` or `updateMapping`. Required HubSpot fields show a red asterisk; saving without all required mapped emits a non-blocking warning.
    4. **Recent Activity panel:** last 10 rows from `fetchSyncLogs` for this integration. Each row: timestamp, outcome badge (success/skipped/failed), website form name (from submission lookup), vendor response status, error excerpt for failures. "View all" link if >10 exist (reveals paginated table; v1 inline expansion).
- All state local `useState` + `useCallback` + `useEffect`, no React Query.

Subcomponents to keep file sizes sane:
- `frontend/src/components/Admin/integrations/IntegrationProviderList.tsx` — sidebar list
- `frontend/src/components/Admin/integrations/HubSpotConnectModal.tsx` — token paste modal
- `frontend/src/components/Admin/integrations/HubSpotConnectionPanel.tsx` — connection details
- `frontend/src/components/Admin/integrations/DetectedFormsPanel.tsx` — list + status badges
- `frontend/src/components/Admin/integrations/FieldMappingDropdown.tsx` — dropdown-per-row mapping table
- `frontend/src/components/Admin/integrations/RecentActivityPanel.tsx` — sync_log feed

**Files:**
- `frontend/src/components/Admin/IntegrationsTab.tsx`
- `frontend/src/components/Admin/integrations/IntegrationProviderList.tsx`
- `frontend/src/components/Admin/integrations/HubSpotConnectModal.tsx`
- `frontend/src/components/Admin/integrations/HubSpotConnectionPanel.tsx`
- `frontend/src/components/Admin/integrations/DetectedFormsPanel.tsx`
- `frontend/src/components/Admin/integrations/FieldMappingDropdown.tsx`
- `frontend/src/components/Admin/integrations/RecentActivityPanel.tsx`

**Reference analog:** `frontend/src/components/Admin/PostsTab.tsx` (layout), `frontend/src/components/Admin/FormSubmissionsTab.tsx` (list+detail flow)

**Depends on:** T9

**Verify:** Manual in browser: load tab, connect HubSpot with a test token, see real forms, map fields with auto-defaults via dropdowns, save, see mapping stored. Disconnect/reconnect cycle works. Broken mapping shows correct badge after deleting form on HubSpot side and reloading tab. Recent Activity panel populates after a few test submissions and accurately reflects success/skip/fail outcomes. Required-field warning fires when saving with missing required mappings.

---

### T11: Tab registration

**Do:** Four edits in `frontend/src/pages/admin/WebsiteDetail.tsx`:
1. Import `IntegrationsTab` and a `Plug` icon from lucide-react
2. Add `'integrations'` to `VALID_TABS` array
3. Add tabConfig entry: `'integrations': { label: 'Integrations', icon: <Plug className="w-3.5 h-3.5" /> }`
4. Add conditional render: `{detailTab === 'integrations' && <IntegrationsTab projectId={id} />}`

**Files:**
- `frontend/src/pages/admin/WebsiteDetail.tsx` (edit)

**Reference analog:** existing tab registrations in same file

**Depends on:** T10

**Verify:** Tab appears in nav, URL `?tab=integrations` selects it on refresh, switching to other tabs and back preserves state correctly.

---

## Done

- [ ] **T0 findings recorded** in `## Findings` section of this spec; T7 wording aligned (or revised under Revision Log if pivot was needed)
- [ ] `npx tsc --noEmit` — zero new errors (run from project root for backend, from `frontend/` for frontend)
- [ ] `npx knex migrate:latest` applies clean against dev DB; rollback also clean
- [ ] All three new tables exist in `website_builder` schema with expected columns and constraints
- [ ] CHECK on `website_integrations.platform` rejects unknown vendors (verify with `INSERT ... platform = 'hubpost'`)
- [ ] CHECK on `crm_sync_logs.outcome` does NOT include `'no_integration'`
- [ ] `crm_sync_logs.integration_id` cascade is `SET NULL` (verify by deleting an integration and confirming logs persist with `integration_id = NULL` and denormalized `platform` populated)
- [ ] `CrmSyncLogModel.pruneOlderThan` exists, has a unit test, deletes old rows correctly
- [ ] `npm run dev:worker` starts; logs show `hubspot-push` and `crm-mapping-validation` queues registered
- [ ] Manual: paste a real HubSpot Private App token in dev → integration created, portalId + accountName populated in `metadata`
- [ ] Manual: list HubSpot forms in UI → matches the forms in the connected portal (no stale cache; reload reflects HubSpot-side changes immediately within request latency)
- [ ] Manual: detected-forms panel shows distinct `form_name`s from existing submissions, with field shapes derived correctly for both legacy flat and sectioned `FormSection[]` payloads
- [ ] Manual: auto-infer fills sensible defaults for `email`, `phone`, `firstname`, `lastname`, `message`
- [ ] Manual: dropdown mapping save round-trips correctly on reload
- [ ] Manual: submit a non-flagged form → contact appears in HubSpot under the mapped form within 30s; `crm_sync_logs` row outcome `'success'` with denormalized `platform` and `vendor_form_id`
- [ ] Manual: submit a flagged form → no HubSpot push; `crm_sync_logs` row outcome `'skipped_flagged'`
- [ ] Manual: **idempotency** — submit same payload twice in quick succession → exactly ONE HubSpot contact created and ONE `crm_sync_logs` row with `outcome='success'`. (BullMQ `jobId` dedup proven.)
- [ ] Manual: Make.com "new contact" trigger fires for the HubSpot-side contact (regression check on existing automation)
- [ ] Manual: delete the mapped HubSpot form → reload Integrations tab → mapping shows `'broken'` badge (real-time on tab open)
- [ ] Manual: rotate the HubSpot token in HubSpot UI → wait for daily validation OR trigger it manually → integration flips to `'revoked'`, "Reconnect" CTA appears, no submission needed to detect this
- [ ] Manual: stop Redis → submit form on website → form submission still succeeds (visitor sees confirmation), error logged, no 500
- [ ] Manual: hot-path regression — submit a form on a website with NO active integration → behaves identically to pre-change baseline (no `crm_sync_logs` row written; per T1 write-amplification rule)
- [ ] Manual: **Recent Activity panel** displays the last 10 sync attempts in the UI with correct outcome badges and accurate timestamps
- [ ] Decrypted tokens never logged (grep server logs after a full test cycle)
- [ ] No controller endpoint returns `encrypted_credentials` or decrypted token
- [ ] CHANGELOG entry drafted (will be finalized in `--done`)

## Revision Log

### Rev 1 — 2026-04-25
**Change:** Pre-execution review surfaced 4 latent bugs and one build-cost concern. Applied surgical fixes; tightened scope.

**Reason:**
- Risk #1 (`is_flagged` timing) was treated as "verify during execution" but its outcome reshapes the entire T7 hook. Promoted to T0 as a hard prerequisite.
- Push retries had no idempotency. Worker retries on transient errors would create duplicate HubSpot contacts in form analytics.
- `crm_sync_logs.integration_id` was `ON DELETE CASCADE` — defeats the audit-trail purpose. Customer who deletes an integration loses all forensic data.
- Both-shapes (`FormSection[]` vs flat) translation was waved off with "handle both" — an executor would guess.
- 5-min in-memory vendor-forms cache breaks under multi-instance API deployments (each replica has its own cache; one tab open = N HubSpot calls).
- Drag-drop field mapping is real build cost (accessibility, mobile, keyboard nav) for v1 UX delta that's marginal vs dropdowns.
- Logging `'no_integration'` outcome causes write amplification on websites without HubSpot connected.
- `platform` column had no CHECK constraint — typo risk creates unreadable rows.

**Updated tasks:**
- **T0 added** — `is_flagged` timing audit. Blocking T1. Outcome may revise T7 placement before any code is written.
- **T1** — schema CHECK added on `website_integrations.platform`; `crm_sync_logs.integration_id` cascade changed to `ON DELETE SET NULL`; `platform` and `vendor_form_id` columns denormalized onto `crm_sync_logs` to preserve audit trail beyond integration/mapping deletion; `'no_integration'` removed from outcome CHECK.
- **T2** — `CrmSyncLogModel` interface explicitly includes denormalized columns; caller writes them at log-insert time; `pruneOlderThan` requirement reinforced (must be tested even though no cron yet).
- **T5** — 5-min in-memory cache dropped (`listVendorForms` now goes straight through). New endpoint `GET /:id/integrations/:integrationId/sync-logs` (paginated) added to back the Recent Activity panel.
- **T6** — explicit `flattenSubmissionContents` pseudocode added handling both `FormSection[]` and legacy flat shapes. Processor uses `submissionId` as BullMQ `jobId` for idempotency. Daily mapping-validation job ALSO calls `validateConnection` per integration to catch token rotation proactively (no submission needed to detect).
- **T7** — enqueue snippet now sets `jobId: row.id`; describes log-row writes for `'skipped_flagged'` and `'no_mapping'` paths with denormalized columns.
- **T8** — clarified to include token revalidation as part of the same daily run (still implemented in T6's processor).
- **T9** — `fetchSyncLogs` added to API client; `SyncLog` type added.
- **T10** — drag-drop UI replaced with dropdown UI per user decision (`FieldMappingDropdown.tsx`). New `RecentActivityPanel.tsx` subcomponent shows last 10 sync attempts in-UI for self-service diagnosis.
- **T12 removed** — drag-drop interaction work folded into T10; dropdown is trivial enough to live inside the field-mapping subcomponent.
- **Constraints "Must"** — added: idempotency rule, CHECK constraint on `platform`, audit-trail rule (SET NULL + denormalize) for `crm_sync_logs`.
- **Constraints "Must not"** — added: no drag-drop libraries, no in-memory caching of vendor forms.
- **Constraints "Out of scope (v1)"** — added: one-to-many fanout, static defaults, field transformations, manual retry from UI, soft delete, encryption key rotation support.
- **Risks** — Risk #1 mitigation rewritten (now blocking via T0). Risk #8 added (worker retry duplication, mitigated by jobId).

**Updated Done criteria:**
- Idempotency manual test (duplicate submission → exactly 1 HubSpot contact + 1 success log)
- `pruneOlderThan` exists with passing unit test
- Recent Activity panel verifies in browser
- `'no_integration'` absent from outcome CHECK constraint verified
- Cascade behavior on `crm_sync_logs.integration_id` verified to be SET NULL
- T0 findings section exists in spec
- Daily token revalidation verified to mark stale-token integrations as revoked without needing a real submission

### Rev 2 — 2026-04-25
**Change:** T7 hook placement clarified after T0 audit completed.

**Reason:** Original T7 wording said "after `FormSubmissionModel.create()` succeeds" with pseudocode `if (row.is_flagged) { ... }`. T0 audit revealed `create()` always writes `is_flagged: false` at line 442–443 (intentional — see source comment at line 432). The AI block at lines 458–475 then UPDATEs the row to flagged=true if needed. Hooking at create-time and reading `row.is_flagged` would push EVERY submission to HubSpot (including AI-caught spam) because the row hasn't been updated yet at that point.

**Updated tasks:**
- T7 hook placement moved from "after `create()`" to "after AI block (line 475), before email send (line 478)"
- T7 gate changed from `row.is_flagged` (DB read) to `flagged` (local boolean from AI block — final at line 475)
- T7 added explicit `submissionId !== null` precondition (silent create-failure handling per line 445–452)
- T7 added newsletter-form note: `formType === "newsletter"` short-circuits before the hook, so newsletter signups are explicitly out of scope for HubSpot push in v1
- T7 verify list expanded to cover: trusted form type, newsletter form, no-integration case (no log row written), no-mapping case (log row written), Redis-down resilience

**Updated Done criteria:** none (existing idempotency + flagged-skip + no-integration-no-log checks cover the verification surface).

## Findings

### T0 — `is_flagged` timing audit (resolved 2026-04-25)

**File audited:** `src/controllers/websiteContact/formSubmissionController.ts` (entire file, 506 lines).

**Flow (lines 195–506) — `handleFormSubmission`:**

1. **Pre-AI `flagReasons[]`** (line 211) — empty in production. Honeypot, timestamp, JS challenge, origin, pattern scoring, and flood detection are ALL currently commented out (lines 213–397). Only AI analysis is active in v1 of the existing controller.
2. **Submission persisted at lines 435–443 with `is_flagged: false`** regardless of spam status. Source comment at line 432: "Persist submission FIRST (unflagged) — guarantees DB record before AI call". Intentional design — DB record exists even if AI errors.
3. **AI content analysis runs synchronously at lines 458–475:**
   - Skipped for `formType === "onboarding" | "insurance-inquiry"` (`isTrustedFormType`, line 306)
   - `await analyzeContent(...)` blocks (line 459)
   - On flag: separate `UPDATE` to `form_submissions` setting `is_flagged = true, flag_reason = ?` (lines 467–469)
4. **Email webhook fires only if `!flagged`** (lines 478–491)
5. **Response returns at line 493** — AFTER all of the above complete.

**Verdict: SYNCHRONOUS.** The local `flagged` boolean is finalized BEFORE the response returns. No async-pivot needed.

**T7 placement correction:**

The original T7 spec said "hook fires after `FormSubmissionModel.create()` succeeds" with pseudocode gating on `row.is_flagged`. That is **wrong** — at line 444 the DB row's `is_flagged` is ALWAYS `false` (initial state). The AI block later UPDATEs the row. Hooking at create-time would push every submission (including AI-flagged spam) to HubSpot.

**Correct hook placement:** AFTER the AI block (after line 475), BEFORE the email send (line 478). Gate on the **local `flagged` boolean** (final value after AI), not on the DB row. Also gate on `submissionId !== null` (the `FormSubmissionModel.create()` at line 444 may have failed silently — see catch at line 445).

**Additional observations:**

- `formType === "newsletter"` short-circuits at line 360–362 with `handleNewsletterSignup`. Newsletter signups never reach the persistence step. **No CRM push for newsletter forms in v1** — they're a separate flow with double-opt-in. Out of scope for HubSpot mapping unless explicitly requested later.
- `isTrustedFormType` skips AI analysis. For trusted types, `flagged` stays `false` (assuming no pre-AI reasons, which are all currently commented out). They WILL be pushed to HubSpot — correct behavior since these are admin-driven forms.
- The whole controller is wrapped in `try { ... } catch (error)` (lines 196 / 494). Our enqueue logic must NOT throw — wrap in its own inner try/catch so a Redis hiccup doesn't fall through to the outer catch and 500 the visitor.

Spec body adjusted under Rev 2.
