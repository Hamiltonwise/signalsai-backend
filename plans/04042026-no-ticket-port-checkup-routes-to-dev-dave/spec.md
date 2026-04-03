# Port Checkup Routes: sandbox → dev/dave

## Why
The audit tool at audit.getalloro.com calls `/api/checkup/track` and `/api/checkup/analyze` which return 404. These routes exist only in the sandbox branch and haven't been ported to dev/dave (which deploys to app.getalloro.com).

## What
Copy the checkup route file, all 13 direct dependencies, and 8 migrations from sandbox into dev/dave. Register the route in `src/index.ts`. User will PR dev/dave → main.

## Context

**Source:** `sandbox` branch
**Target:** `dev/dave` branch

**Files to port (22 total):**

Source/service files:
- `src/routes/checkup.ts`
- `src/utils/driveTimeMarket.ts`
- `src/utils/referralCode.ts`
- `src/models/BehavioralEventModel.ts`
- `src/services/businessMetrics.ts`
- `src/services/reviewSentiment.ts`
- `src/services/ozMoment.ts`
- `src/services/surpriseFindings.ts`
- `src/services/reviewThemeExtractor.ts`
- `src/services/vocabularyAutoMapper.ts`
- `src/services/firstPatientAttribution.ts`
- `src/services/referralReward.ts`
- `src/emails/templates/CheckupResultEmail.ts`
- `src/emails/templates/WelcomeCheckupEmail.ts`

Migrations:
- `src/database/migrations/20260324000002_create_behavioral_events.ts`
- `src/database/migrations/20260324000004_create_batch_checkup_results.ts`
- `src/database/migrations/20260324000010_add_checkup_review_count.ts`
- `src/database/migrations/20260325000009_add_billing_and_checkup_columns.ts`
- `src/database/migrations/20260326000007_create_checkup_shares.ts`
- `src/database/migrations/20260326000008_add_output_gate_fields_to_behavioral_events.ts`
- `src/database/migrations/20260329000001_create_checkup_invitations.ts`
- `src/database/migrations/20260402000010_add_behavioral_events_composite_index.ts`

**Already in dev/dave (no action needed):**
- `src/controllers/practice-ranking/feature-services/service.places-competitor-discovery.ts`
- `src/controllers/places/feature-services/GooglePlacesApiService.ts`
- `src/workers/queues.ts`
- `src/controllers/auth-otp/feature-services/service.jwt-management.ts`

## Constraints

**Must:**
- Copy files verbatim from sandbox — no modifications
- Register route as `app.use("/api/checkup", checkupRoutes)` in `src/index.ts`
- Stay on dev/dave branch throughout

**Must not:**
- Touch any existing dev/dave files beyond `src/index.ts`
- Cherry-pick unrelated sandbox changes

**Out of scope:**
- Deploying to production (user will PR → main)
- Admin checkup routes (`src/routes/admin/batchCheckup.ts`, `checkupFunnel.ts`)

## Risk

**Level:** 2

**Risks identified:**
- Each service file may have transitive dependencies not in dev/dave → **Mitigation:** Run `npx tsc --noEmit` after copy and fix any missing imports
- Migration conflicts if DB already has some tables → **Mitigation:** Knex migrations are idempotent; run-up will skip already-applied

## Tasks

### T1: Copy all 22 files from sandbox to dev/dave
**Do:** Use `git show sandbox:<path>` redirect to copy each file verbatim
**Files:** All 14 source files + 8 migrations listed above
**Verify:** All 22 files exist at correct paths

### T2: Register checkup route in src/index.ts
**Do:** Add import and `app.use("/api/checkup", checkupRoutes)` alongside places/practiceRanking
**Files:** `src/index.ts`
**Verify:** `grep "checkup" src/index.ts` shows import and mount

### T3: TypeScript verification + fix transitive deps
**Do:** Run `npx tsc --noEmit`; fix any missing dependency errors
**Files:** Any files flagged by TS
**Verify:** `npx tsc --noEmit` exits 0

## Done
- [ ] `npx tsc --noEmit` passes
- [ ] All 22 files present
- [ ] `src/index.ts` has `/api/checkup` route registered
- [ ] Committed to dev/dave and pushed
