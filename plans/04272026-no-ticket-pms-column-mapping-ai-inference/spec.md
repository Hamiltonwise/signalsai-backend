---
id: spec-pms-column-mapping-ai-inference
created: 2026-04-27
ticket: no-ticket
mode: --start
status: planning
---

# PMS Column Mapping with AI Inference + User Override

## Why
The current PMS paste parser is positional — it assumes col 0 = Date, col 1 = Source, col 2 = Type, col 3 = Production. Real-world PMS exports (e.g., the procedure-log shape in `m.csv`: 11 tab-delimited columns including `Treatment Date`, `Procedure`, `Patient`, `Referring Practice`) blow this assumption up: the parser silently treats procedure codes as source names, status strings as referral type, and per-procedure rows as per-referral rows. Result: the doctor sees "D0364 - cone beam CT…" listed as a source with 119 referrals instead of "Fredericksburg Family Dentistry" as a source with N patient-visits.

Compounding: the file-upload path delegates parsing to an external n8n webhook, so vendor-specific quirks live outside this codebase and can't be fixed in the same PR. Two ingestion paths produce different parsed results from the same file.

## What
A column-mapping system that:

1. Hashes the uploaded file's headers into a signature.
2. Resolves the signature against (a) the org's cache, then (b) a small global library, then (c) AI inference (Haiku 4.5).
3. Applies the resolved mapping deterministically — supporting both pre-aggregated template format ("1 row = 1 referral") and raw procedure-log format ("group by patient + date + practice").
4. Shows the parsed result in the existing PMS modal (enlarged) with a side drawer for column mapping.
5. Lets the uploader edit the mapping (dropdowns + production formula builder with `+` and `−`) and re-process explicitly.
6. On confirm (with or without edits), clones the mapping into the org's own cache so subsequent uploads of the same signature are silent.
7. Eliminates the n8n parsing dependency for PMS uploads — both paste and file paths run the same code in this repo.

**Done when:**
- Pasting a file matching the Alloro 4-col template produces the same output it does today (zero behavior change).
- Pasting `m.csv` produces correct sources (Fredericksburg, Cox, Neibauer, etc.) with referral counts deduplicated by `(Patient, Date)` pairs and production totals matching `Σ Ins. Adj. Fee.` per source per month.
- Drag-and-drop / file picker upload of the same `m.csv` produces byte-identical parsed output to paste.
- Modal shows "New structure detected — please verify mapping" banner on first upload of unknown signature; silent on subsequent uploads of confirmed signatures.
- User can open the side drawer, change a mapping (e.g., source → "Referring User" instead of "Referring Practice"), click "Re-process", and see updated parsed output without re-uploading the file.
- Production formula builder accepts `Gross Revenue − Total Writeoffs − Ins. Adj. Fee.` and computes correctly per row.
- TS check passes; n8n PMS webhook calls disappear from the upload code path.

## Context

**Files modified or read:**

Backend:
- `src/controllers/pms/pms-services/pms-paste-parse.service.ts` (1-238) — currently positional parser, will dispatch through the new mapping system.
- `src/controllers/pms/pms-services/pms-paste-analysis.service.ts` (1-492) — keeps fuzzy dedup + Haiku merge step; runs AFTER mapping is applied.
- `src/controllers/pms/pms-services/pms-upload.service.ts` (18-227) — currently fires n8n webhook; v1 stops doing that and runs parsing inline.
- `src/controllers/pms/pms-utils/file-converter.util.ts` (1-54) — already handles CSV/XLSX → JSON; reused.
- `src/controllers/pms/PmsController.ts` — adds new mapping endpoints.
- `src/routes/pms.ts` — registers new routes.
- `src/utils/pms/pmsAggregator.ts` — unchanged.
- `src/agents/service.llm-runner.ts` — already has `outputSchema` corrective-retry from prior plan; reused for mapping inference.
- `src/database/migrations/<new>` — new `pms_column_mappings` table.

Frontend:
- The existing PMS Data modal — needs identification during execution. Likely `frontend/src/components/PMS/PMSDataModal.tsx` or similar; verify on T12.
- `frontend/src/api/pms.ts` — extends with new mapping endpoints.

**Patterns to follow:**

- **Header signature:** `sha1(sortedHeaders.map(normalize).join('|'))`. Normalize = lowercase + trim + strip non-alphanumeric. Reused in cache lookup, telemetry, and mapping rows.
- **AI inference uses the prior-plan plumbing:** `runAgent(...)` with `outputSchema: ColumnMappingResponseSchema` (Zod), `cachedSystemBlocks: []` for systemPrompt caching. Haiku 4.5 (`AGENTS_LLM_MAPPER_MODEL` env, default `claude-haiku-4-5-20251001`), temperature 0, maxTokens 2048.
- **Apply-mapping dispatch by mapped roles:**
    - `source` mapped → "template adapter" (existing 1-row-per-referral aggregation).
    - `referring_practice` mapped → "procedure-log adapter" (group by `(patient, date, referring_practice)`, count groups, sum production within each group).
    - Both mapped → block submit; mapping is invalid (UI should warn before submit).
- **Production formula:** array of `{ op: "+" | "-", column: string }` ops. First element implicit `+`. Evaluated per row using the existing `toNumber()` utility from `pmsAggregator.ts:49-59` for currency-aware coercion.

**Reference files:**
- `src/controllers/agents/types/agent-output-schemas.ts` (Zod schema pattern from the prior plan).
- `src/agents/monthlyAgents/ReferralEngineAnalysis.md` (system-prompt-as-markdown pattern).
- `service.delete-organization.ts` (transactional service style).

## Constraints

**Must:**
- Preserve byte-identical output for the existing 4-col Alloro template path. Tier 1 dispatch hits before AI inference.
- Use the prior plan's `outputSchema` retry pattern for the mapping inference LLM call. No bypassing.
- Run the existing `pms-paste-analysis.service.ts` fuzzy-dedup + Haiku merge step AFTER mapping is applied. The two LLM calls are sequential: (1) infer mapping, (2) infer dedup verdicts. Both cached by signature where applicable.
- Use postgres-only SQL for the new migration. Single Knex migration file, schema only (no data backfill).
- Cache resolution order: **org cache → global library → AI inference**. Never reverse, never merge.
- Clone-on-confirm: when the uploader clicks "Submit", the resolved mapping (with any edits) is upserted into the org cache. The global library is never written from app code.
- Global library is seeded ONLY by Knex seeds (engineering-controlled). Initial seed: (a) Alloro template signature, (b) the procedure-log signature derived from `m.csv` (probably Open Dental).
- Production formula uses only `+` and `−`. No `*`, `/`, parentheses, or expression strings. Operations are array elements.
- When the file is procedure-log style, count one referral per unique `(patient, date, referring_practice)` triplet. Sum production within the triplet first, then aggregate by source per month.
- When `referring_practice` is blank for a row, classify the row's referral as `self`. When non-blank, classify as `doctor`. No keyword inference on text.
- Strip leading/trailing `*` characters from `referring_practice` values before deduplication (handles `***Cox Family Dentistry & Orthodontics***` style annotations).
- AI inference must validate against `ColumnMappingResponseSchema` (Zod). On validation failure, single corrective retry per the prior-plan pattern. On second failure, fall through to "no inference — please map manually" UI state with empty mapping pre-populated.
- Telemetry: log `[pms-mapping]` line on every signature resolution with `{ signatureHash, source: "org-cache" | "global-library" | "ai-inference", confidence, orgId, success }`. Used to identify popular signatures for engineering to promote into global library in future seeds.
- Synchronous parse on upload. The endpoint returns parsed `monthly_rollup` in the response body. UI shows a loading state ≤8s (LLM bound). Timeouts surface as "Could not auto-detect — please configure mapping manually."
- Both paste and file-upload paths produce identical output for the same input file content.

**Must not:**
- Send any PMS data to n8n during this plan's execution. (Other n8n integrations untouched.)
- Add new dependencies. Zod 4.3.6, framer-motion, react-hot-toast, lucide-react, TanStack Query, csvtojson, xlsx all already present.
- Modify n8n workflows externally as part of this plan.
- Allow user-uploaded mappings to write to the global library. Global library writes are seed-only.
- Build a typed expression evaluator. Production formula is array-of-ops only.
- Block the Alloro template path on any new code. Tier 1 dispatch is fast-path; mapping system runs only when needed.
- Run AI inference inside a Knex migration or any background job. Inference is request-scoped only.
- Change the existing `pms_jobs` schema beyond an additive column for `column_mapping_id` (FK to new table). No removed columns. No renamed columns.

**Out of scope:**
- Mapping editor for already-approved jobs. Mapping is locked at submit.
- Multi-mapping per file (e.g., file has both template-style and procedure-log-style sections). Single mapping per upload.
- Drag-drop UI affordance redesign (zone styling, multi-file). v1 keeps the existing file picker behavior; "drag and drop" in this spec means "file upload regardless of how the file got into the picker."
- AI inference for the dedup step. Existing `pms-paste-analysis.service.ts` keeps its current Haiku call shape.
- Per-mapping Guardian / Governance review. Mappings are user-owned; no agent-side validation in v1.
- A UI for managing the global library (admin view). v2.
- Migration of historical `pms_jobs` rows to retroactively apply mappings. v2 if requested.
- Telemetry dashboard. Logs only in v1; engineering reads them manually.

## Risk

**Level:** 3 (Structural Risk — modifies the critical PMS data ingestion path, removes an external dependency, adds an LLM call to a synchronous user-facing flow)

**Risks identified:**

1. **Bypassing n8n is a one-way change.** The n8n workflow may have side effects this plan isn't aware of (audit logs, vendor-side hooks). → **Mitigation:** Keep the n8n endpoint reachable but stop calling it from `pms-upload.service.ts`. If telemetry shows missing data downstream, re-enable selectively with a feature flag. Confirm with stakeholder which n8n workflows must remain alive: workflows that don't touch PMS payloads are unaffected.

2. **Synchronous LLM call in upload path.** Adds 3–5s latency on first upload of an unknown signature. Cached signatures bypass it (sub-100ms). → **Mitigation:** Loading state in UI (existing pattern). 8s timeout in the inference service; on timeout fall through to manual-mapping UI state. Cost per first-upload-per-signature: ~$0.003. Cached signatures = $0.

3. **Production formula evaluation correctness.** Doctors will produce expressions like `Gross Revenue − Total Writeoffs` where Total Writeoffs may itself be negative ("-91.6"). Evaluator must compute `49 − (−91.6) = 140.6` not `49 − 91.6 = −42.6`. → **Mitigation:** `toNumber()` parses signed numerics correctly; evaluator does pure JS arithmetic on those numbers. Unit test fixture covers each sign permutation.

4. **Cache poisoning at the org level.** Org admin saves a wrong mapping → all future uploads from that org are wrong. → **Mitigation:** Each upload's modal still shows the parsed preview before submit. The doctor reviews and can re-edit the mapping at any time. The cache only auto-applies; it never blocks correction.

5. **Global library seed risk.** Wrong seed entry pollutes the experience for many orgs that fall through to library-tier dispatch. → **Mitigation:** Seed entries are tagged `requireConfirmation: true` so the user is always asked to verify on first use. Library matches act as suggestions, not silent applies. Org-cache matches are the only silent path.

6. **Header signature collisions.** Two different file shapes happen to hash the same. Practically unlikely with `sha1(sorted+normalized)` but theoretically possible. → **Mitigation:** Acceptable risk. If observed in telemetry, add column-count and sample-row check before applying cached mapping.

7. **AI inference returns plausible but wrong mapping.** The LLM might confidently map "Status" → `type` because "Done" looks vaguely like a type label. → **Mitigation:** Confidence threshold gating in the UI: any role mapped at confidence < 0.7 renders amber with a magnifying-glass icon prompting verification. The prompt's few-shot examples cover this exact failure mode (Status column should map to `status` filter, not `type`).

8. **State machine extension on `pms_jobs`.** Adding `column_mapping_id` FK touches a hot table. → **Mitigation:** Nullable column, indexed. No backfill. Old rows have `null` and are read by the existing aggregator unchanged.

**Blast radius:**
- Database: one new table (`pms_column_mappings`), one new column (`pms_jobs.column_mapping_id`). One new migration. No data deletion or backfill.
- Backend code: paste service refactored, upload service refactored to bypass n8n, new controller methods, new routes, new utilities (~10 backend files).
- Frontend code: enlarged modal, new ColumnMappingDrawer, new ProductionFormulaBuilder, banner state, API client extensions (~6 frontend files).
- LLM behavior: new inference call on Tier 3 dispatch only. Existing Referral Engine flow untouched. Existing dedup Haiku call unchanged.
- External dependencies: n8n PMS parsing webhook stops being called. n8n workflow itself remains deployed; this plan doesn't touch n8n config.

**Pushback:**
- This is the second plan in a row touching PMS pipeline correctness (after the Tier 1 accuracy fixes). Cumulative risk on a critical revenue-pipeline path. **Strong recommendation:** smoke test on a staging copy of prod data BEFORE merging — paste both the template and `m.csv`, confirm both produce expected outputs, walk through the mapping correction UX. The earlier accuracy plan deferred its smoke test; this one should not.
- Removing n8n parsing is a deliberate scope choice per Q9, not a forced dependency. If pushback comes from elsewhere, the architectural alternative is to keep n8n for file-upload and only fix paste path (v1a from the prior `-b` discussion).

## Decisions

**D1. Cache resolution order:** org cache → global library → AI inference. Read-only one-way fallback chain.

**D2. Clone-on-confirm:** every successful submit upserts the resolved mapping into the org's cache. Even if the user didn't edit anything, that confirms intent. Subsequent uploads of the same signature from this org are silent.

**D3. Global library is read-only from app code.** Seeded by Knex seed file. Engineering promotes signatures based on telemetry.

**D4. Initial global library seed:**
- (a) Alloro 4-col template: `["treatmentdate", "source", "type", "production"]` → mapping with `source` role assigned.
- (b) Procedure-log signature derived from `m.csv` (probably Open Dental): mapping with `referring_practice` role on column 9, `patient` on column 6, formula `Gross Revenue − Total Writeoffs` on `production_net`.

**D5. AI inference model:** Haiku 4.5 (`claude-haiku-4-5-20251001`). Temperature 0. Max tokens 2048. System prompt includes role enum + few-shot examples (Alloro template + Open Dental procedure-log). Prompt caching via `cachedSystemBlocks: []` (per the prior-plan fix).

**D6. UI state machine:**
- `cache-hit-org`: silent apply, no banner.
- `cache-hit-global`: amber banner — "Using a system template. Please verify it matches your data."
- `inference-success`: amber banner — "New structure detected. We auto-mapped your columns — please verify."
- `inference-failed`: red banner — "Could not auto-map. Please configure your column mapping manually."

**D7. Production formula:** array of `{ op: "+" | "-", column: string }`. First element implicit `+`. UI builder allows `+` and `−` only. Evaluator uses `toNumber()` for safe coercion.

**D8. Referral count semantics for procedure-log:** unique `(patient_id, date, referring_practice)` triplets per month. One patient visiting same practice on the same date = one referral, regardless of how many procedures were billed.

**D9. Type classification (when no `type` column mapped):** `referring_practice` non-blank → `doctor`; blank → `self`. No keyword inference.

**D10. Bypass n8n for PMS parsing.** `pms-upload.service.ts` no longer calls `PMS_PARSER_WEBHOOK` for parsing. The n8n integration code path remains in the repo but is unreachable from PMS upload after this plan.

## Role Enum (the contract)

```typescript
export type ColumnRole =
  | "date"                  // when the visit/procedure happened
  | "source"                // pre-aggregated source name (template path)
  | "referring_practice"    // raw row-level referring practice name (procedure-log path)
  | "referring_doctor"      // optional doctor names from referring practice
  | "patient"               // patient ID (for procedure-log grouping; not displayed)
  | "type"                  // explicit "self" / "doctor" if column exists
  | "status"                // filter; only count rows matching e.g. "Done"
  | "production_gross"      // billed amount (formula component)
  | "production_net"        // collected amount (formula component)
  | "production_total"      // already-summed (template path)
  | "writeoffs"             // formula component
  | "ignore";               // explicitly "this column doesn't matter"
```

UI labels per Q4 (locked earlier in the discussion). Production-related roles collapse into the formula builder; non-production roles render as a single-column dropdown.

## Mapping Shape

```typescript
export interface ColumnMapping {
  // Source headers, in original file order
  headers: string[];

  // Per-header role assignment
  assignments: Array<{
    header: string;
    role: ColumnRole;
    confidence: number;     // 0..1, set by AI; user-edited entries get 1.0
  }>;

  // Production formula (only when production_* roles are mapped via formula builder)
  productionFormula?: {
    target: "production_gross" | "production_net" | "production_total";
    ops: Array<{ op: "+" | "-"; column: string }>;
  };

  // Filter spec (when status role is mapped)
  statusFilter?: {
    column: string;
    includeValues: string[];   // e.g. ["Done", "Completed"]
  };
}
```

## Cache Schema

New table `pms_column_mappings`:

| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `organization_id` | int FK → organizations(id) ON DELETE CASCADE | NULL for global library entries |
| `header_signature` | varchar(64) | sha1 hex of normalized + sorted headers |
| `mapping` | jsonb | full `ColumnMapping` |
| `is_global` | bool | true for library entries (seed-only) |
| `require_confirmation` | bool | true for global library; false for org cache |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |
| `last_used_at` | timestamptz | updated on every cache hit |
| `usage_count` | int | telemetry |

Indexes:
- `(organization_id, header_signature)` unique partial WHERE `organization_id IS NOT NULL`
- `(header_signature) WHERE is_global = true` unique
- `(header_signature)` non-unique for fast scan

Pms_jobs additive column: `column_mapping_id int NULL FK → pms_column_mappings(id) ON DELETE SET NULL`. Indexed.

## State Machine for `pms_jobs`

Existing states keep working unchanged. New optional field `column_mapping_id` records which mapping was applied. The status flow remains `uploaded → admin_approval → client_approval → completed`. If a user re-processes via a different mapping, a NEW `pms_jobs` row is NOT created — the existing row's `column_mapping_id` is updated and `response_log` is regenerated.

## Tasks

Tasks split into four parallelizable groups: **A (foundation)**, **B (mapping system)**, **C (backend integration)**, **D (frontend)**. A is sequential foundation. B depends on A. C and D can run in parallel after B completes.

### Group A — Schema + types + utilities

#### T1: Migration + model
**Do:** Create migration `<timestamp>_create_pms_column_mappings.ts` (postgres) per the schema above. Add `column_mapping_id` to `pms_jobs` as additive nullable FK. Create `src/models/PmsColumnMappingModel.ts` with `findByOrgAndSignature`, `findGlobalBySignature`, `upsertOrgMapping`, `touchUsage`, `seedGlobal`.
**Files:** `src/database/migrations/<timestamp>_create_pms_column_mappings.ts`, `src/models/PmsColumnMappingModel.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit`. Apply migration locally; confirm schema.

#### T2: Types + Zod schemas
**Do:** Create `src/types/pmsMapping.ts` exporting `ColumnRole`, `ColumnMapping`, `ColumnMappingResponse` interfaces and a sibling `ColumnMappingResponseSchema` (Zod) for AI output validation. Sibling schema mirrors the prior-plan pattern: `z.object({...}).strict()` top-level, role enum tightened to literal union, confidence `z.number().min(0).max(1)`.
**Files:** `src/types/pmsMapping.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit`.

#### T3: Header signature utility
**Do:** Create `src/utils/pms/headerSignature.ts` with `normalizeHeader(s: string): string` and `signHeaders(headers: string[]): string`. Pure functions, no I/O. Sort headers before hashing so `[Date, Source]` and `[Source, Date]` produce the same signature.
**Files:** `src/utils/pms/headerSignature.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit`. Spot-test with template headers and `m.csv` headers — distinct outputs.

#### T4: Production formula evaluator
**Do:** Create `src/utils/pms/productionFormula.ts` with `evaluateFormula(row: Record<string, any>, formula: ColumnMapping["productionFormula"]): number`. Uses `toNumber()` from `pmsAggregator.ts` for coercion. Pure function. Handles missing columns (treats as 0), negative values (preserves sign), currency strings ("$1,234.56" → 1234.56).
**Files:** `src/utils/pms/productionFormula.ts`
**Depends on:** T2
**Verify:** `npx tsc --noEmit`. Spot-test: `Gross − Writeoffs` with values 49, -91.6 → 140.6.

#### T5: Global library seed
**Do:** Create `src/database/seeds/<timestamp>_pms_column_mappings_global.ts` seeding the two initial entries from D4. Idempotent (uses `ON CONFLICT DO NOTHING` on the `header_signature` partial unique).
**Files:** `src/database/seeds/<timestamp>_pms_column_mappings_global.ts`
**Depends on:** T1, T2, T3
**Verify:** Run seed; assert two rows in `pms_column_mappings` with `is_global = true`.

### Group B — Mapping system

#### T6: AI inference system prompt
**Do:** Create `src/agents/monthlyAgents/PmsColumnMapper.md` with system prompt that: defines the role enum, explains template vs procedure-log shapes, includes 2 few-shot examples (Alloro template + `m.csv` shape), instructs JSON-only output matching `ColumnMappingResponse`. Includes the GROUNDING RULES — STRICT and confidence-scoring instructions from the prior plan's pattern.
**Files:** `src/agents/monthlyAgents/PmsColumnMapper.md`
**Depends on:** T2 (role enum locked)
**Verify:** Manual: read prompt end-to-end. Confirm few-shot examples cover both template and procedure-log shapes.

#### T7: AI inference service
**Do:** Create `src/utils/pms/columnMappingInference.ts` with `inferColumnMapping(headers: string[], sampleRows: Record<string, any>[]): Promise<ColumnMappingResponse>`. Loads the prompt via `loadPrompt("monthlyAgents/PmsColumnMapper")`. Calls `runAgent` from `service.llm-runner.ts` with `outputSchema: ColumnMappingResponseSchema`, `cachedSystemBlocks: []`, model from `AGENTS_LLM_MAPPER_MODEL` env (default `claude-haiku-4-5-20251001`), temperature 0, maxTokens 2048. Hard timeout 8s. On timeout or repeat-Zod-failure, returns null.
**Files:** `src/utils/pms/columnMappingInference.ts`
**Depends on:** T2, T6
**Verify:** `npx tsc --noEmit`. Manual: call with `m.csv` headers + 5 rows; confirm output validates and identifies `Referring Practice` as `referring_practice`.

#### T8: Mapping resolver
**Do:** Create `src/utils/pms/resolveColumnMapping.ts` with `resolveMapping(orgId: number, headers: string[], sampleRows: any[]): Promise<{ mapping: ColumnMapping; source: "org-cache" | "global-library" | "ai-inference"; }>`. Implements the three-tier dispatch from D1. Logs `[pms-mapping]` telemetry line on every resolution. Handles inference failure by returning an empty mapping with all roles `ignore` and source `"ai-inference"` with confidence 0 (UI then prompts manual configuration).
**Files:** `src/utils/pms/resolveColumnMapping.ts`
**Depends on:** T1, T3, T7
**Verify:** Unit tests covering all three tiers + the failure path.

#### T9: Apply-mapping (template adapter)
**Do:** Create `src/utils/pms/adapters/templateAdapter.ts` with `applyTemplateMapping(rows: any[], mapping: ColumnMapping): MonthlyRollup`. Implements existing 4-col semantics but accepts arbitrary header names. Filters out rows where `statusFilter` (if any) excludes them. Computes production via `evaluateFormula` if formula present; else uses `production_total` column directly.
**Files:** `src/utils/pms/adapters/templateAdapter.ts`
**Depends on:** T2, T4
**Verify:** Unit fixture: feed it Alloro 4-col template content + mapping; assert output matches existing parser's output byte-for-byte.

#### T10: Apply-mapping (procedure-log adapter)
**Do:** Create `src/utils/pms/adapters/procedureLogAdapter.ts` with `applyProcedureLogMapping(rows: any[], mapping: ColumnMapping): MonthlyRollup`. Strips leading/trailing `*` from `referring_practice` values. Groups rows by `(patient_id, date, referring_practice)` triplet. Sums production per triplet via `evaluateFormula`. Aggregates per `(referring_practice, month)`. Type classification: `referring_practice` non-blank → `doctor`, blank → `self`.
**Files:** `src/utils/pms/adapters/procedureLogAdapter.ts`
**Depends on:** T2, T4
**Verify:** Unit fixture: feed `m.csv` rows + mapping with `referring_practice` on col 9 + production formula `Gross Revenue − Total Writeoffs`. Assert: source list contains "Fredericksburg Family Dentistry", "Cox Family Dentistry & Orthodontics" (asterisks stripped), referral counts deduplicate per `(patient, date, practice)`.

#### T11: Apply-mapping (dispatcher)
**Do:** Create `src/utils/pms/applyColumnMapping.ts` with `applyMapping(rows: any[], mapping: ColumnMapping): MonthlyRollup`. Dispatches to template or procedure-log adapter based on which roles are mapped. Throws clear error when both `source` AND `referring_practice` are mapped, or when neither is mapped.
**Files:** `src/utils/pms/applyColumnMapping.ts`
**Depends on:** T9, T10
**Verify:** `npx tsc --noEmit`. Unit fixture: dispatcher routes to correct adapter; throws on invalid combinations.

### Group C — Backend integration

#### T12: New API endpoints
**Do:** Add to `src/controllers/pms/PmsController.ts`:
- `POST /pms/preview-mapping` — body: `{ headers, sampleRows }`. Calls `resolveMapping(orgId, ...)`. Returns `{ mapping, source, parsedPreview }` where `parsedPreview` is the result of `applyMapping(sampleRows, mapping)`.
- `POST /pms/upload-with-mapping` — body: `{ rows, mapping, month }` OR `{ pasteText, mapping, month }`. Stores raw rows + applied mapping in `pms_jobs`. Skips n8n. Returns the parsed `monthly_rollup`.
- `POST /pms/jobs/:id/reprocess` — body: `{ mapping }`. Re-applies mapping to existing raw rows. Updates `pms_jobs.column_mapping_id` + `response_log`. Returns updated parsed output.
- `GET /pms/mappings/cache?signature=<hash>` — returns the org's cached mapping for this signature, or null.
**Files:** `src/controllers/pms/PmsController.ts`
**Depends on:** T8, T11
**Verify:** `npx tsc --noEmit`. Manual: hit each endpoint via curl with sample payloads.

#### T13: Refactor paste service
**Do:** Refactor `src/controllers/pms/pms-services/pms-paste-parse.service.ts`. Existing positional path → fast-path Tier 1 (matched by Alloro template signature). Otherwise dispatch through `resolveMapping → applyMapping`. Existing return shape preserved for backward compat.
**Files:** `src/controllers/pms/pms-services/pms-paste-parse.service.ts`
**Depends on:** T8, T11
**Verify:** Existing paste of Alloro 4-col template still works (smoke test). Paste of `m.csv` content produces expected output.

#### T14: Refactor upload service
**Do:** Refactor `src/controllers/pms/pms-services/pms-upload.service.ts`. Remove the n8n webhook call. After `convertFileToJson(file)`, dispatch through `resolveMapping → applyMapping` synchronously. Store raw JSON rows + mapping ID + parsed `monthly_rollup` in `pms_jobs`. Existing job status flow preserved (`uploaded → admin_approval → ...`).
**Files:** `src/controllers/pms/pms-services/pms-upload.service.ts`
**Depends on:** T8, T11
**Verify:** Upload `m.csv` via the existing endpoint. Confirm n8n is NOT called (network log). `pms_jobs.response_log` populated with correct `monthly_rollup`.

#### T15: Routes
**Do:** Register the four new endpoints from T12 in `src/routes/pms.ts` with appropriate auth middleware (uploader permission for the upload/reprocess endpoints; the preview endpoint same).
**Files:** `src/routes/pms.ts`
**Depends on:** T12
**Verify:** `npx tsc --noEmit`.

### Group D — Frontend

#### T16: API client extensions
**Do:** Extend `frontend/src/api/pms.ts` with `previewMapping(headers, sampleRows)`, `uploadWithMapping(payload)`, `reprocessJob(jobId, mapping)`, `getCachedMapping(signature)`. TanStack Query keys: `pmsMappingPreview`, `pmsMappingCached`. Match existing typed-fetch pattern.
**Files:** `frontend/src/api/pms.ts`, `frontend/src/api/queryKeys.ts` (probably)
**Depends on:** T12 (API contract — start in parallel with C using the spec'd shape)
**Verify:** `npx tsc --noEmit` from frontend.

#### T17: ProductionFormulaBuilder component
**Do:** Create `frontend/src/components/PMS/ProductionFormulaBuilder.tsx`. Props: `{ availableColumns: string[], value: ColumnMapping["productionFormula"], onChange }`. UI: primary column dropdown, `+ Add column` and `− Subtract column` buttons that append rows. Live preview against the first 3 sample rows showing computed value. Match Tailwind styling of existing PMS components.
**Files:** `frontend/src/components/PMS/ProductionFormulaBuilder.tsx`
**Depends on:** T16 (types)
**Verify:** `npx tsc --noEmit`. Visual: render with `m.csv` columns, build `Gross Revenue − Total Writeoffs`, confirm preview computes correctly.

#### T18: ColumnMappingDrawer component
**Do:** Create `frontend/src/components/PMS/ColumnMappingDrawer.tsx`. Props: `{ headers, sampleRows, mapping, source, onChange, onReprocess }`. Renders:
- Banner per D6 state machine.
- Each header row: header label + role dropdown (doctor-readable labels per Q4) + confidence indicator (green ≥0.95, amber <0.7, otherwise plain).
- Production formula builder when any `production_*` role is selected.
- Status filter chip when `status` role is selected (allows specifying include values).
- "Re-process with this mapping" button (explicit, per Q2).
**Files:** `frontend/src/components/PMS/ColumnMappingDrawer.tsx`
**Depends on:** T16, T17
**Verify:** `npx tsc --noEmit`. Visual: open drawer, edit a mapping, confirm onChange fires.

#### T19: Modal redesign + integration
**Do:** Identify the existing PMS Data modal during execution (likely `frontend/src/components/PMS/PMSDataModal.tsx`). Enlarge the modal max-width. Wire ColumnMappingDrawer as a side panel (collapsed by default when cache-hit-org; expanded when banner is amber/red). Wire previewMapping → display banner → user reviews → user submits via uploadWithMapping. Re-process flow: drawer onReprocess → mutate job + refetch + show updated parsed output.
**Files:** Existing PMS modal file (~1, identified during execution)
**Depends on:** T16, T17, T18
**Verify:** Visual: paste `m.csv` content, see banner "New structure detected", review parsed output, click "Adjust mapping", change a role, click "Re-process", confirm parsed output updates without re-uploading.

### Group E — Verification

#### T20: TS + smoke
**Do:** `npx tsc --noEmit` from project root and `frontend/`. Smoke matrix:
- Paste Alloro template content → no banner → parsed output identical to today.
- Paste `m.csv` content → amber "New structure detected" banner → parsed output has correct sources (Fredericksburg, Cox, Neibauer, ...) with referral counts deduplicated by `(patient, date, practice)` and production summed per formula.
- File upload (CSV + XLSX) of both shapes → same output as paste.
- After submit on `m.csv`: re-upload same file → no banner (org cache hit); same parsed output.
- Edit a mapping in the drawer → re-process → updated parsed output without losing other state.
- Pre-existing approved jobs (with no `column_mapping_id`) still display correctly in admin org view.
**Files:** none (operational)
**Depends on:** T1–T19
**Verify:** Manual matrix walkthrough. Document in execution summary.

## Done

- [ ] Migration + seed applied; `pms_column_mappings` populated with 2 global entries.
- [ ] Backend `npx tsc --noEmit` zero errors.
- [ ] Frontend `npx tsc --noEmit` zero errors.
- [ ] Paste of Alloro template content produces output identical to current behavior (regression: zero diff).
- [ ] Paste of `m.csv` produces correct sources, deduplicated referral counts, formula-computed production.
- [ ] File upload of `m.csv` produces output identical to paste of same content.
- [ ] n8n PMS webhook is no longer called from upload service (verified via network log or feature flag).
- [ ] Modal banner correctly reflects D6 state machine for each cache-tier dispatch.
- [ ] Mapping side drawer renders, dropdowns work, formula builder computes preview, re-process updates parsed output.
- [ ] First-confirm of an unknown signature clones into org cache; second upload of same signature is silent.
- [ ] Telemetry `[pms-mapping]` lines visible in logs with signature + source + confidence + orgId.
- [ ] No regression in existing approved jobs' display in admin org view.
- [ ] No regression in Referral Engine consumption of approved PMS data (the upstream change must propagate cleanly).

## Out-of-Spec Follow-ups (not this plan)
- Admin UI for managing the global library + telemetry dashboard.
- AI inference for the dedup step (currently deterministic + Haiku merge verdict).
- Backfill: re-process historical `pms_jobs` rows with the new mapping system.
- Multi-mapping per file (sectioned exports).
- Drag-drop UI affordance (drop zone styling, multi-file).
- Per-uploader mapping (vs per-org).
- Telemetry-driven auto-promotion of org cache entries into the global library.
- Multiplication / division / parentheses in production formulas.
- 1-hour cache TTL on the LLM call (Anthropic beta).
- Unit test scaffolding for the broader PMS pipeline (this plan adds tests for the new code only).

## Revision Log

### Rev 1 — 2026-04-28
**Change:** Procedure-log dedup model changed from per-`(patient, date, referring_practice)` triplet to per-`(patient, referring_practice)` pair. Multiple visits by the same patient to the same practice within the period collapse into one referral; production sums across the visits. Month bucketing uses the first date encountered for each pair.
**Reason:** Verified against Hamilton Wise's reference pivot on the Fredericksburg Feb 2026 dataset. The spreadsheet treats a patient referred by Practice X as one referral for the period regardless of visit count — per-patient mental model, not per-visit. Per-source counts and production now match the pivot exactly. Supersedes spec D8.
**Files:** `src/utils/pms/adapters/procedureLogAdapter.ts`

### Rev 2 — 2026-04-28
**Change:** Zero-production skip rule was prototyped (Q1c "skip zero AND non-positive triplets") then removed entirely. No skip rule on the procedure-log path.
**Reason:** Hamilton Wise's reference pivot retains zero-production referrals (e.g. post-op visits) as legitimate referral events. Skipping them undercounted real referrals. Confirmed during numbers-match verification on the Fredericksburg dataset.
**Files:** `src/utils/pms/adapters/procedureLogAdapter.ts`. The `flags?: string[]` parameter on `applyMapping` and `applyProcedureLogMapping` is preserved for future data-quality use.

### Rev 3 — 2026-04-28
**Change:** Clone-on-confirm cache write now also fires from the drawer's "Re-process and save" CTA, not only on initial Submit.
**Reason:** User reported edits persisted only when they hit Submit; reuploading the same file post-clear-data showed the seed/global mapping again. Edits made during the preview/drawer flow weren't being persisted, defeating the cache.
**Files:** `src/controllers/pms/PmsController.ts` (override branch in `previewResetMapping` writes via `PmsColumnMappingModel.upsertOrgMapping`).

### Rev 4 — 2026-04-28
**Change:** ColumnMappingDrawer redesigned from per-column dropdowns to 3 main fields (Date, Source, Production) + Advanced collapsible (Patient + status filter). Single "Re-process and save" CTA, disabled until edits exist.
**Reason:** Doctors found the per-header dropdown matrix unintuitive. Inverting to "tell us where Date / Source / Production live" matches the mental model of someone who knows their PMS export but not the role enum. Production target dropdown also removed (overengineered — defaults to `production_net` silently).
**Files:** `frontend/src/components/PMS/ColumnMappingDrawer.tsx`, `frontend/src/components/PMS/ProductionFormulaBuilder.tsx`.

### Rev 5 — 2026-04-28
**Change:** `seed-second-location.ts` moved from `src/database/seeds/` to `scripts/`.
**Reason:** Adding the `seeds:` config block to `src/database/config.ts` (required for the global-library seed) made the knex seed loader pick up `seed-second-location.ts`, which is a standalone ts-node script with its own entrypoint and isn't compatible with knex's seed contract. Moved to `scripts/` to keep both runnable.
**Files:** `scripts/seed-second-location.ts` (renamed), `src/database/config.ts` (added `seeds:` block).

### Rev 6 — 2026-04-28
**Change:** CSV paste parser replaced with a state-machine implementation in `PMSManualEntryModal.tsx`.
**Reason:** Naive `split(',')` shifted columns whenever a quoted field contained a comma (e.g., patient name `"Diab, Zied"`), silently corrupting all downstream parsing. State machine handles quoted fields, escaped quotes (`""`), and CRLF.
**Files:** `frontend/src/components/PMS/PMSManualEntryModal.tsx` (`parseTabularToRows`).

### Rev 7 — 2026-04-28
**Change:** Backend `applyMapping` returns `MonthlyRollupForJob` (a flat array). Controller now wraps it as `{ monthly_rollup: parsedPreview }` in both override and normal branches before responding.
**Reason:** Frontend expected `{ monthly_rollup: [...] }` shape; backend was returning a bare array, so `parsedPreview.monthly_rollup` was `undefined` and the preview table never updated on re-process. Wrapping at the controller boundary preserves the adapter signatures and matches what the existing UI consumes.
**Files:** `src/controllers/pms/PmsController.ts`.

### Rev 8 — 2026-04-28
**Change:** Re-process-and-save flow now sends the full row set (`mappingAllRows`), not the 5-row sample (`mappingSampleRows`).
**Reason:** First implementation re-applied mapping to the sample only, so toast counts and rollup totals didn't change. Re-process must operate on the same data the original Submit operates on.
**Files:** `frontend/src/components/PMS/PMSManualEntryModal.tsx`.

### Rev 9 — 2026-04-28
**Change:** Drawer auto-open deferred to fire from `handleParsedPaste` after legacy paste-detected modal completes, via `pastedRawTextRef` and `runMappingPreviewRef`.
**Reason:** Mapping pipeline was running in parallel with the legacy "Paste detected" modal, opening the drawer over it. Sequencing fixes the race; refs avoid the TDZ that direct closure capture caused.
**Files:** `frontend/src/components/PMS/PMSManualEntryModal.tsx`.
