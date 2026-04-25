# Audit: Stealth Scrape Fallback + Blocked-State UX

## Why
The leadgen audit fails on Cloudflare-protected sites (`net::ERR_BLOCKED_BY_CLIENT`). We just shipped a graceful degrade-to-no-website fallback (2026-04-25), so blocked sites now complete with a partial GBP-only report. Two remaining problems:

1. **We don't even try to bypass.** Every CF-protected target falls straight to GBP-only because the default Puppeteer browser is trivially fingerprinted as headless. A stealth-plugin wrapper would recover ~50% of these for free with no vendor decision.
2. **Blocked vs no-website is conflated everywhere.** The UI shows "NO WEBSITE" placeholder, the GBP analysis prompts recommend "If website is down, outdated, or lacks NAP consistency, migrate to an Alloro-built dedicated practice website" — both are wrong/misleading. The site is up; the user has a website; it just blocks bots.

## What
A two-method scrape chain with smart retry + a new `website_blocked` signal threaded through backend → audit row → API response → frontend → prompts.

Done when:
- A CF-protected site that previously degraded to GBP-only now succeeds via stealth fallback when the stealth plugin can beat the protection
- A CF-protected site that even stealth can't beat completes with `website_blocked=true` and no misleading "site is down" recommendations
- A non-CF site is unchanged (default path, same speed)
- A no-website-provided audit is unchanged (existing path, generic "no website" UX)
- Default Puppeteer fails fast on `ERR_BLOCKED_BY_CLIENT` instead of wasting the second retry attempt (~5s saved per blocked audit before fallback even starts)

## Context

**Relevant files:**

Backend (`~/Desktop/alloro/`):
- `src/controllers/scraper/feature-services/service.puppeteer-manager.ts` — current scraper, retry logic at `navigateWithRetry` (lines 88-124). Bot-block fast-fail goes here.
- `src/controllers/scraper/feature-services/service.scraping-orchestrator.ts` — coordinates the scrape flow; chain logic goes here.
- `src/controllers/scraper/feature-utils/scraper.types.ts` — `ScrapingResult` interface (the contract both methods must return).
- `src/workers/processors/auditLeadgen.processor.ts` — Branch A degrade path lives here; needs to accept `blocked` signal from orchestrator and persist `website_blocked: true` when both methods fail.
- `src/models/AuditProcessModel.ts` — `IAuditProcess` interface needs new field.
- `src/controllers/audit/audit-services/auditUpdateService.ts` (or wherever `getAuditByIdWithStatus` lives) — response shape needs new field exposed.
- `src/agents/auditAgents/gbp/ProfileIntegrity.md` — line 40 has the "missing NAP footer → recommend Alloro-built website" instruction that fires inappropriately on blocked sites.
- `src/agents/auditAgents/gbp/CompetitorAnalysis.md` — similar Alloro-bias copy for website gaps.
- `src/database/migrations/` — new migration for `website_blocked` column.

Frontend (`~/Desktop/alloro-leadgen-tool/`):
- `src/types/index.ts` — `AuditStatusResponse` needs `website_blocked: boolean | null`.
- `src/hooks/useAuditPolling.ts` — already polls; just needs the new field passed through (no logic change).
- `src/components/stages/DashboardStage.tsx` — line 262 (`hasWebsiteData && screenshotUrl ? ... : "NO WEBSITE"`). Add a third branch: blocked → "Your website blocks Alloro scanners".

**Patterns to follow:**
- New scraper file mirrors `service.puppeteer-manager.ts` exactly: same exports (`launchBrowser`, `createPage`, `navigateWithRetry`, `closeBrowser`), same `Browser`/`Page` lifecycle, same logging via `util.scraper-logger`. Caller (orchestrator) doesn't care which manager produced the result.
- New migration file mirrors `20260418000000_add_retry_count_to_audit_processes.ts` (the closest analog — both add a single column to `audit_processes`).
- Frontend types match Postgres semantics (nullable boolean → `boolean | null`).
- Prompts branch on a contextual flag the same way they currently branch on `hasWebsite` (line 380-383 of the processor builds the user message conditionally).

**Reference files:**
- Scraper analog: `src/controllers/scraper/feature-services/service.puppeteer-manager.ts` (137 lines).
- Migration analog: `src/database/migrations/20260418000000_add_retry_count_to_audit_processes.ts`.
- Prompt-context analog: the existing `hasWebsite ? "site_markup:" : "site_markup: (no website provided...)"` branch in `auditLeadgen.processor.ts` lines 380-383.

## Constraints

**Must:**
- `ScrapingResult` shape stays identical regardless of which method produced it. Branch B (Claude website analysis) must not need to know whether stealth or default was used.
- New scraper file uses Playwright (already in deps) + `playwright-extra` + `puppeteer-extra-plugin-stealth`. Don't add a second browser engine.
- Default-path retry tightening must NOT affect non-CF errors (timeout, DNS) — keep current 2-retry behavior for those.
- Migration must be additive: nullable boolean default false. Existing audit rows in DB must continue to work without backfill.
- New `website_blocked` field must default to false (or null treated as false) so old polling clients don't crash.
- Prompts must be able to branch on three states: full website data / no website provided / website blocked. Don't collapse blocked into "no website" — that's the bug we're fixing.

**Must not:**
- No new browser engine (don't install Chromium twice — Playwright already ships its own).
- No changes to `WebsiteAnalysis` LLM prompt (Branch B). It only runs when scrape succeeds, regardless of method.
- No vendor scraping API in this scope (ScrapingBee/ZenRows etc. — that's a separate `-s` if Method B success rate is insufficient).
- No removal of the existing degrade-to-no-website path. It remains the safety net when both methods fail.
- No telemetry that PII-leaks the blocked URL contents (just the domain + outcome).

**Out of scope:**
- Residential proxy integration.
- Paid scraping API integration.
- A "retry with different method" button in the UI (manual user-facing escalation). Future `-s` if needed.
- Cleaning up the related-but-separate finding that Branch C (self GBP scrape via Apify) sometimes writes AFTER the scrape failure flips status — independent issue.
- Two-repo split cleanup (`~/Desktop/alloro` vs `~/Desktop/alloro-app/signalsai-backend`). Separate `-s`.

## Risk

**Level: 3** (Structural — new dependency, schema change, prompt edits affecting LLM output quality, signal threading through 4 system layers).

**Risks identified:**

- **Stealth plugin maintenance burden.** Cloudflare updates detection signatures regularly. A plugin version that beats CF today may not in 6 months. → **Mitigation:** feature flag `AUDIT_USE_STEALTH_FALLBACK` env var (default true). If plugin starts hurting, flip flag and we revert to old behavior (default → degrade) instantly. Track success/failure rate in worker logs so future regression is detectable.

- **Stealth plugin may interfere with non-CF sites.** Most reports show stealth is benign on normal sites, but edge cases exist (some sites actively reject browsers with anti-fingerprinting patterns). → **Mitigation:** stealth is invoked ONLY as fallback after default fails. Default path is unchanged for sites that work. Worst case: a site that worked under default but fails under stealth would still degrade to GBP-only — same outcome as today.

- **Migration timing.** New column on `audit_processes` table. RDS sandbox. Concurrent in-flight audits during migration could fail or read NULL. → **Mitigation:** column is nullable with default false; in-flight audits write via `updateAuditFields` which won't reference the new column unless the new code is also deployed. Run migration BEFORE deploying new processor code.

- **Prompt edits could degrade non-blocked audit output quality.** ProfileIntegrity.md is shared by all audits. If we add branching badly, we risk the model getting confused. → **Mitigation:** branching is done via context injection (the user message), not by editing the system prompt's instructions. The existing pattern (`hasWebsite ? ... : ...` in processor lines 380-383) already does this — we extend it with a third state, same mechanism.

- **`puppeteer-extra-plugin-stealth` + `playwright-extra` compat.** Stealth plugin is canonical for Puppeteer; Playwright support comes via the `playwright-extra` shim. Some plugin features may not apply cleanly. → **Mitigation:** verify with a quick local test before commit; if compat breaks, fall back to `puppeteer-extra` + plain Puppeteer (slightly less strong fingerprinting baseline but proven combo). Recorded as decision point in T1.

- **Bundle/cold-start size.** `playwright-extra` adds dep weight. Playwright-Chromium is already downloaded; the plugin layer is small (~MB). → **Mitigation:** measure post-install. If significant, consider lazy-loading the stealth manager only when the fallback is needed.

**Blast radius:**
- All audits that hit the scraper (~100% of leadgen flow). Default path is byte-equivalent for non-CF cases — no behavior change there.
- All status-polling clients (frontend `useAuditPolling`). New field is additive — old clients ignore it.
- Direct DB consumers of `audit_processes` (admin dashboard? analytics export?) — verify nothing fails on extra column. Default false is safe for ORM/raw query reads.

**Pushback:**

- **"Always-stealth" vs "stealth-only-on-failure-chain"** — could simplify by ALWAYS launching with stealth (no chain, no fallback decision). Saves complexity but pays ~100-300ms per scrape and broadens blast radius. Recommendation: stick with the chain because the default path is fast for the 70% that don't need stealth, and we get isolated risk. Open to reverting to always-stealth if chain proves brittle in production.

- **Method B alone won't beat CF Pro / Bot Management Premium.** Realistic expectation: this fix recovers ~50% of currently-blocked targets. The remaining tail (~5–10% of total audits) will still hit `website_blocked=true`. We should plan a follow-up `-s` for vendor API integration if the metric of "website-analyzed audits / total audits" doesn't move enough. Not blocking this plan — flagging for after we have data.

- **The `website_blocked` column is a denormalization of state already implicit in `step_screenshots IS NULL AND step_website_analysis IS NULL AND domain IS NOT NULL`.** Could be a generated column or computed in the API layer instead of a stored column. Recommendation: store it explicitly. Reasons: (a) easier indexing for analytics, (b) clearer intent at the row level, (c) lets us mark blocked even on hypothetical future paths where step_screenshots gets populated despite block, (d) cheap (1 boolean column). Open to rethinking if the team prefers compute-on-read.

## Tasks

### T1: Add stealth dependency + new Playwright stealth scraper
**Do:**
- `npm install playwright-extra puppeteer-extra-plugin-stealth` in `~/Desktop/alloro`.
- Create `src/controllers/scraper/feature-services/service.playwright-stealth-manager.ts` — exports `launchStealthBrowser`, `createStealthPage`, `navigateStealthWithRetry`, `closeStealthBrowser` matching the Puppeteer manager's API but using `playwright-extra` chromium with stealth plugin registered.
- Same launch args philosophy as the Puppeteer one; same logging via `util.scraper-logger`.
- Returns Playwright `Browser`/`Page` (different types from Puppeteer — abstract via the orchestrator, see T3).
- Single retry attempt by default (not 2 — we already wasted 9s on the default path; stealth gets one shot).

**Files:** `package.json`, `package-lock.json`, `src/controllers/scraper/feature-services/service.playwright-stealth-manager.ts` (new).
**Depends on:** none.
**Verify:** `npx tsc --noEmit` passes. Manual smoke: `node -e "require('playwright-extra')"` doesn't throw.

### T2: Tighten default Puppeteer retry — fail fast on `ERR_BLOCKED_BY_CLIENT`
**Do:**
- Edit `service.puppeteer-manager.ts` `navigateWithRetry` to return a richer result: `{ ok: boolean, blocked: boolean, error?: string }` instead of a bare boolean.
- On `ERR_BLOCKED_BY_CLIENT` (and `ERR_TOO_MANY_REDIRECTS` from Cloudflare challenge loops): return `{ ok: false, blocked: true }` immediately, no retry. Today this wastes ~5s on the second attempt that always fails the same way.
- All other navigation errors keep the current 2-retry behavior.
- Update orchestrator caller to consume new shape.

**Files:** `src/controllers/scraper/feature-services/service.puppeteer-manager.ts`, `src/controllers/scraper/feature-services/service.scraping-orchestrator.ts`.
**Depends on:** none (independent of T1).
**Verify:** Local Coastal Endo audit fails the default path in ~3-4s instead of ~9s. `npx tsc --noEmit` passes.

### T3: Wire two-method chain in scraping orchestrator
**Do:**
- `service.scraping-orchestrator.ts`: refactor `scrapeHomepage(domain)` so it tries default first, then on `blocked=true` retries via stealth manager (if `AUDIT_USE_STEALTH_FALLBACK` is unset or true), then returns null.
- New return contract: `Promise<{ result: ScrapingResult | null, blocked: boolean }>`. `blocked: true` is set when both methods returned blocked. Non-block failures (timeout, DNS) return `{ result: null, blocked: false }`.
- Both methods produce the same `ScrapingResult`; the caller (Branch A in processor) is unaware of which won.
- Log clearly which path served each scrape: `[SCRAPER] default succeeded` / `[SCRAPER] default blocked, trying stealth` / `[SCRAPER] stealth succeeded` / `[SCRAPER] both methods blocked — falling through to no-website`.

**Files:** `src/controllers/scraper/feature-services/service.scraping-orchestrator.ts`, possibly `src/controllers/scraper/feature-utils/scraper.types.ts` (extend signature).
**Depends on:** T1, T2.
**Verify:** Local Artful audit (non-CF) still completes via default path in ~10s scrape time. Local Coastal Endo audit shows the chain log lines and either succeeds via stealth or falls through to no-website with `blocked: true`. `npx tsc --noEmit` passes.

### T4: Add `website_blocked` column + thread the signal through processor and API response
**Do:**
- Migration: add `website_blocked BOOLEAN NOT NULL DEFAULT false` to `audit_processes`. Three migration files per CLAUDE.md (mssql.sql, pgsql.sql, knexmigration in `.ts` per repo convention). The Knex migration is what actually runs against the sandbox/prod RDS Postgres.
- Update `IAuditProcess` interface in `AuditProcessModel.ts` with `website_blocked?: boolean`.
- `auditLeadgen.processor.ts` Branch A: when orchestrator returns `{ result: null, blocked: true }`, set `hasWebsite=false`, `websiteBlocked=true` (new local var), `updateAuditFields(auditId, { ..., website_blocked: true })`. When `result` is non-null (either method succeeded), don't set the flag (or set `website_blocked: false` explicitly to be safe).
- `getAuditByIdWithStatus` (or whatever the response-shaping function is — found in `audit-services/`) must include `website_blocked` in the JSON response.
- Frontend `AuditStatusResponse` type adds `website_blocked: boolean | null`.

**Files:**
- `src/database/migrations/{newtimestamp}_add_website_blocked_to_audit_processes.ts` (new).
- `src/models/AuditProcessModel.ts`.
- `src/workers/processors/auditLeadgen.processor.ts`.
- `src/controllers/audit/audit-services/auditUpdateService.ts` (or `getAuditByIdWithStatus` location — confirm during execution).
- `~/Desktop/alloro-leadgen-tool/src/types/index.ts`.
- Plan folder `migrations/` (the three required scaffolds for documentation).

**Depends on:** T3 (signal originates from orchestrator).
**Verify:** Run migration on local sandbox RDS. New audit on Coastal Endo writes `website_blocked=true` in DB. Status response JSON includes `website_blocked`. Frontend type compiles. Old audit rows have `website_blocked=false` (default backfill).

### T5: Update GBP analysis prompts to handle blocked-vs-missing distinction
**Do:**
- Pass a third state into the GBP pillar prompts. Today the processor builds the prompt user-message with `hasWebsite ? strippedHtml : "(no website provided ...)"`. Extend to: `websiteBlocked ? "(website is live but blocks automated analysis — do NOT recommend the site is down, outdated, or that the user migrate to a new website. The user already has a working website; we just couldn't scan it. Skip website-related advice; focus on GBP-only optimizations.)" : (hasWebsite ? strippedHtml : "(no website provided ...)")`.
- Audit `ProfileIntegrity.md` — line 40's "Solution Bias — Alloro First" instruction needs a sentence appended: "When the user message indicates the website is blocked from automated analysis (not missing), do NOT recommend website migration — assume NAP coverage is acceptable and emit `null` for any check that requires reading the site."
- Audit `CompetitorAnalysis.md` — similar guard: "If website is blocked, omit website-related competitor gaps from recommendations."
- All other pillar prompts (SearchConversion, TrustEngagement, VisualAuthority) — quick scan to confirm none of them generate site-status copy. Patch only if needed.
- LocalRanking dashboard text shown in screenshot #1 comes from one of these pillars or a separate aggregator. Trace during execution.

**Files:**
- `src/agents/auditAgents/gbp/ProfileIntegrity.md`.
- `src/agents/auditAgents/gbp/CompetitorAnalysis.md`.
- Possibly other `.md` prompts under `src/agents/auditAgents/gbp/`.
- `src/workers/processors/auditLeadgen.processor.ts` (the prompt-context branch at lines 380-383 area).

**Depends on:** T4 (`websiteBlocked` flag must be threadable into prompt context).
**Verify:** New audit on Coastal Endo. Inspect the GBP analysis output: zero recommendations should reference "site is down", "outdated website", "migrate to new website", or "verify website is live". The competitor-gaps and review-volume recommendations should still appear normally. `npx tsc --noEmit` passes (prompts are markdown but the processor changes are TS).

### T6: Frontend — distinguish blocked vs no-website in dashboard
**Do:**
- `DashboardStage.tsx` line ~262: extend the `hasWebsiteData && screenshotUrl ? <Screenshot /> : <NoWebsitePlaceholder />` ternary into a three-way branch using `auditData?.website_blocked` (passed via props).
  - Has data + screenshot: existing screenshot render
  - `website_blocked === true`: "Your website blocks Alloro scanners" placeholder + small explainer ("This site uses bot protection that prevents automated analysis. Your GBP report below is unaffected.")
  - else: existing "NO WEBSITE" placeholder
- Same three-way branch in any other place that currently renders NO WEBSITE (search the file). The "Website Performance Metrics" / "Website Key Insights" sidebar items should similarly distinguish (e.g., "Website Analysis Skipped — Bot Protection" vs "No Website Provided").
- Pass `websiteBlocked` from `App.tsx` into `DashboardStage` as a prop alongside the existing `hasWebsiteData`.
- Don't make this prop required (default false) so existing tests/callers don't break.

**Files:**
- `~/Desktop/alloro-leadgen-tool/src/components/stages/DashboardStage.tsx`.
- `~/Desktop/alloro-leadgen-tool/App.tsx` (prop wiring).
- Possibly `~/Desktop/alloro-leadgen-tool/src/components/stages/index.ts` (if prop types need re-export).

**Depends on:** T4 (the field must exist in the response type).
**Verify:** Local Coastal Endo audit completes. Dashboard shows the new "Your website blocks Alloro scanners" placeholder. Local Artful audit shows the screenshot as before (no regression). Visit the dashboard with `?audit_id=...` for a no-website-provided audit (if you have one in DB) to confirm the third path still works. `npx tsc --noEmit` passes on frontend.

### T7: Feature flag + telemetry (defensive)
**Do:**
- Add env var `AUDIT_USE_STEALTH_FALLBACK` (default `true`). Read in orchestrator T3. When `false`, skip stealth fallback entirely; default → null → degrade. Lets us cut over instantly if stealth misbehaves in prod.
- Add log-line counters inside the orchestrator for `default-success`, `default-blocked`, `stealth-success`, `stealth-blocked-final`. These are grep-able from worker pm2 logs to compute success rate.
- Document the env var in the backend `.env.example` with explanation.

**Files:**
- `src/controllers/scraper/feature-services/service.scraping-orchestrator.ts`.
- `.env.example`.

**Depends on:** T3.
**Verify:** Setting `AUDIT_USE_STEALTH_FALLBACK=false` in `.env` and re-running Coastal Endo skips the stealth path (worker log shows `default blocked, AUDIT_USE_STEALTH_FALLBACK=false — falling through to no-website` or similar). Setting back to `true` re-enables.

### T8: End-to-end verification + Playwright drive
**Do:**
- Restart all three local services if needed (or rely on tsx-watch reload).
- Drive via Playwright (the running session — already opened on `localhost:3002`):
  - Search Coastal Endodontic Studio → confirm: backend logs show `[SCRAPER] default blocked → trying stealth → stealth succeeded` (best case) OR `[SCRAPER] both methods blocked` (acceptable case). DB shows `website_blocked` = true only if both methods failed. Frontend dashboard renders "Your website blocks Alloro scanners" if blocked.
  - Search Artful Orthodontics → confirm: `[SCRAPER] default succeeded` (no chain entered). Full website analysis. Dashboard shows screenshot.
  - Inspect a blocked audit's GBP analysis output — confirm zero "site is down / migrate to new website" copy.
- TS check both repos.
- Mark spec Done items.

**Files:** none modified — verification only.
**Depends on:** T1–T7.
**Verify:** All Done items below pass.

## Done

- [ ] `npm install playwright-extra puppeteer-extra-plugin-stealth` lands in backend `package.json`/`package-lock.json`
- [ ] Migration applied to sandbox RDS — new column `audit_processes.website_blocked` exists, default false
- [ ] `npx tsc --noEmit` — zero errors in `~/Desktop/alloro`
- [ ] `npx tsc --noEmit` — zero errors in `~/Desktop/alloro-leadgen-tool`
- [ ] Manual: local Artful audit completes via default scraper, screenshot rendered on dashboard, no chain log lines (`[SCRAPER] default succeeded` only)
- [ ] Manual: local Coastal Endo audit shows `[SCRAPER] default blocked` then either `stealth succeeded` (best case) or `stealth blocked` (acceptable case)
- [ ] Manual: when stealth succeeds, dashboard renders the screenshot + full website analysis (no "blocked" UX)
- [ ] Manual: when stealth fails, `audit_processes.website_blocked = true` in DB, status response includes `website_blocked: true`, dashboard renders "Your website blocks Alloro scanners" placeholder
- [ ] Manual: Coastal Endo blocked-case GBP analysis recommendations contain ZERO instances of "site is down", "outdated website", "migrate to new website", "verify website is live and accessible"
- [ ] Manual: setting `AUDIT_USE_STEALTH_FALLBACK=false` in `.env` and re-auditing Coastal Endo skips the stealth attempt (visible in worker log)
- [ ] No regression in non-CF audits (Artful or any other healthy site)
- [ ] Default scraper fails fast on `ERR_BLOCKED_BY_CLIENT` — total scrape time on Coastal Endo's blocked-only path drops from ~9s (current) to ~4s before fallback kicks in

## Revision Log

### Rev 1 — 2026-04-25 (during execution)

**Change:** T1 stealth manager API simplified. The spec asked for granular helpers (`launchStealthBrowser`, `createStealthPage`, `navigateStealthWithRetry`, `closeStealthBrowser`) mirroring `service.puppeteer-manager.ts`. Implementation collapses these into one self-contained `scrapeHomepageStealth(domain)` function that returns a full `ScrapingResult` directly.

**Reason:** Existing helper services (`service.screenshot-capture.ts`, `service.performance-metrics.ts`, `service.link-checker.ts`) are typed against Puppeteer's `Page`. Reusing them with Playwright's `Page` would require rewriting each helper or wrapping types. A single self-contained function avoids that fan-out and keeps the stealth path's blast radius minimal. Tradeoff: stealth path doesn't share screenshot/metrics helpers with default — small code duplication, but the stealth path is intentionally simpler (no broken-link check, no NAP extraction) so the duplication is small.

**Updated Done criteria:** none changed — the public `scrapeHomepage(domain)` orchestrator API is unchanged; only the internal stealth-manager API differs from spec.

### Rev 2 — 2026-04-25 (during execution)

**Change:** T3 (chain wiring) and T4 (column + signal threading) merged into one continuous execution rather than completed as discrete steps.

**Reason:** The processor's chain consumer (T3) writes `website_blocked: true` to the audit row. That field doesn't exist as a column or in the `IAuditProcess` interface until T4. Splitting the executions left a temporary state where the processor referenced a non-existent column, which would have failed TS compilation as a checkpoint. Merging them keeps every intermediate state TS-clean.

**Updated Done criteria:** none changed.

### Rev 3 — 2026-04-25 (during execution)

**Change:** T7 `.env.example` documentation skipped.

**Reason:** Repo doesn't have a `.env.example` file. Existing env files are `.env`, `.env.active`, `.env.sandbox` — none are tracked or canonical for documentation. The `AUDIT_USE_STEALTH_FALLBACK` flag is documented in the `service.scraping-orchestrator.ts` file header JSDoc instead. If a future commit adds a real `.env.example`, the flag can be added there.

**Updated Done criteria:** removed "Document the env var in the backend `.env.example`" from T7 verify line.

### Rev 4 — 2026-04-25 (during execution)

**Change:** T8 stealth-path validation is partial. Default path's bot-block was NOT triggered during the verification window (Cloudflare stopped blocking `coastalendostudio.com` between the spec-writing time and the verification time — bot detection is stochastic).

**What was validated:**
- ✅ TS compiles both repos cleanly (BACKEND_TSC=0, FRONTEND_TSC=0)
- ✅ Migration applied to sandbox RDS (Knex Batch 84)
- ✅ End-to-end audit completes for Coastal Endo (~66-79s) via default path — confirms the chain doesn't break the happy path. Result: `status=completed, website_blocked=false, screenshots+website_analysis populated`.
- ✅ Standalone smoke test of `scrapeHomepageStealth()` invoked the new module, logged correctly, returned the expected `{result, blocked}` shape on timeout (CF challenge took >30s on the stealth path, returned `{result: null, blocked: false}` — correct semantics for "non-block failure").
- ⚠ End-to-end stealth fallback succeeding-on-block was NOT directly observed because CF didn't block during the test window. Code path is wired, type-checked, smoke-tested, but not yet seen working against an actual block in production logs.

**What still needs validation in production:**
- Real CF-blocked audit triggers `[CHAIN] default path blocked — escalating to stealth` log line.
- Either `[CHAIN] stealth path succeeded` (best case) or `[CHAIN] both default and stealth paths blocked` with `website_blocked=true` written to the row (acceptable case).
- Frontend renders the new "Your website blocks Alloro scanners" placeholder when `website_blocked=true`.
- GBP analysis prompts on a `website_blocked=true` audit produce zero "site is down / migrate to new website" copy.

**Updated Done criteria:** the manual checklist items for "Coastal Endo blocked-case" remain valid — they will be ticked when the next CF block hits in production logs. Suggest scheduling a follow-up review (`/schedule`) in 48-72h to grep prod worker logs for `[CHAIN]` lines and the `website_blocked=true` rate.

**Note on the stealth timeout behavior:** the smoke test revealed CF challenge pages on Coastal Endo can hang Playwright's `domcontentloaded` waitUntil for >30s. This isn't a bug in our code — it's CF's challenge taking longer than the navigation timeout. Future tuning could increase `STEALTH_NAV_TIMEOUT_MS` to 45-60s on the stealth path specifically (it's already on the slow path, so a few extra seconds is acceptable). Out of current scope; flag for follow-up `-q` if real-world success rate is too low.
