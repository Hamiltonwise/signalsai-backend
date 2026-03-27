# N8N Domain Migration: n8napp.getalloro.com → n8n.getalloro.com

## Problem Statement

All n8n webhook integrations across four Alloro projects reference the old domain `n8napp.getalloro.com`. The n8n instance has been migrated to `n8n.getalloro.com`. All references — environment variables, hardcoded URLs, GitHub Secrets, and production configs — must be updated to the new domain. The webhook paths remain unchanged.

## Context Summary

### How N8N Is Used

N8N serves as the workflow automation backbone for Alloro. It handles:

- **AI Agent orchestration** — 10 agent webhooks (proofline, summary, opportunity, copy companion, CRO optimizer, guardian, governance, referral engine, practice ranking, identifier)
- **Email dispatch** — All outbound email goes through n8n (`alloro-email-service` webhook)
- **PMS data parsing** — CSV upload parsing via `parse-csv` webhook
- **Website builder pipeline** — Deployment workflow trigger
- **Web scraping** — Website scraping tool for audits
- **Custom website emails** — Public-facing contact form emails

### Projects Affected

| Project | Integration Type | Webhook Count |
|---------|-----------------|---------------|
| alloro-app (signalsai-backend) | Direct webhook calls, env-driven + hardcoded | 15 webhooks |
| alloro-site | Email service webhook (env + hardcoded fallback) | 1 webhook |
| alloro-leadgen-tool | Email service webhook (env + hardcoded fallback) | 1 webhook |
| website-builder-rebuild | None (DB consumer only, comment reference) | 0 webhooks |

### Architecture

All webhook calls are outbound POST requests from backend/frontend → n8n. N8N also writes directly to the database (website-builder pipeline steps), but that integration is not URL-dependent from the codebase side.

## Existing Patterns to Follow

- Backend (alloro-app): Webhook URLs are stored as environment variables, consumed via `process.env.*` in service files. A centralized orchestrator exists at `service.webhook-orchestrator.ts`.
- Frontend projects (alloro-site, alloro-leadgen-tool): Use `VITE_N8N_EMAIL_URL` env var with `import.meta.env`, but include hardcoded fallback URLs.
- CI/CD: GitHub Actions workflows inject webhook URLs from GitHub Secrets during build.

**Pattern violation found:** Two PMS service files have hardcoded URLs that bypass the env var pattern entirely.

## Proposed Approach

### Tier: Structural Feature (multi-repo, multi-environment)

### Phase 1 — In-Code Changes (4 repos)

#### alloro-app (signalsai-backend)

1. **`.env` (local)** — Update all 14 webhook URLs from `n8napp.getalloro.com` to `n8n.getalloro.com`
2. **`pms-upload.service.ts` line 181** — Replace hardcoded `https://n8napp.getalloro.com/webhook/parse-csv` with `process.env.PMS_PARSER_WEBHOOK` (new env var) or update URL directly
3. **`pms-retry.service.ts` line 105** — Same as above, same hardcoded URL
4. **Recommended:** Extract the PMS hardcoded URL into an env var (`PMS_PARSER_WEBHOOK`) to match the existing pattern used by all other webhooks

#### alloro-site

1. **`.env`** — Update `VITE_N8N_EMAIL_URL` value
2. **`src/utils/emailService.ts` line 3** — Update hardcoded fallback URL

#### alloro-leadgen-tool

1. **`.env`** — Update `VITE_N8N_EMAIL_URL` value
2. **`utils/emailService.ts` line 3** — Update hardcoded fallback URL

#### website-builder-rebuild

1. No changes required (comment-only reference, no active integration)

### Phase 2 — External/Infrastructure Changes (outside codebase)

| Target | Action | Owner |
|--------|--------|-------|
| Production server `.env` (alloro-app backend) | Update all 14+ webhook URLs | DevOps / Deploy |
| GitHub Secrets — `alloro-site` repo | Update `VITE_N8N_EMAIL_URL` secret | Repo admin |
| GitHub Secrets — `alloro-leadgen-tool` repo | Update `VITE_N8N_EMAIL_URL` secret | Repo admin |
| Staging/Preview environments (if separate) | Update same env vars | DevOps |
| DNS for `n8napp.getalloro.com` | Keep as redirect or decommission (decide) | Infrastructure |
| Uptime monitors / health checks | Update any monitors pointing to old domain | Monitoring |
| n8n instance at `n8n.getalloro.com` | Verify all 15 webhook paths are active and functional | N8N admin |

### Phase 3 — Validation

1. After code changes, verify each webhook is reachable at new domain
2. Test email dispatch (alloro-site contact form, leadgen tool)
3. Test PMS CSV upload flow
4. Test agent orchestration (at least one agent round-trip)
5. Test website builder deployment pipeline trigger
6. Monitor logs for any residual old-domain calls

## Architectural Decisions

### Decision: Extract PMS hardcoded URLs to env var

**Reasoning:** Every other webhook in the system uses an env var. The PMS `parse-csv` webhook is the only one hardcoded. This is a pattern violation that makes domain changes like this one harder and introduces silent failure risk.

**Tradeoff:** One new env var (`PMS_PARSER_WEBHOOK`) to add to all environments. Minimal cost, high consistency gain.

### Decision: Update fallback URLs in frontend services

**Reasoning:** The fallback pattern (`import.meta.env.VITE_N8N_EMAIL_URL || "https://..."`) means even if env vars are correct, the hardcoded fallback can mask configuration failures by silently pointing to the old domain. Updating the fallback ensures safety.

**Alternative considered:** Remove the fallback entirely and fail loudly. Decided against — the fallback provides resilience during local dev when env might not be set.

## Risk Analysis

| Risk | Level | Mitigation |
|------|-------|------------|
| Old domain decommissioned before migration complete | Level 2 — Concern | Coordinate timing: update all environments before DNS change |
| Missed hardcoded URL in future code | Level 1 — Suggestion | Extract PMS URL to env var to eliminate the pattern |
| GitHub Secrets not updated, old builds still work but new deploys break | Level 2 — Concern | Update secrets before next deploy of alloro-site and leadgen-tool |
| Webhook paths differ between old and new n8n instance | Level 2 — Concern | Verify all 15 paths are registered on new instance before cutover |
| Production env not updated, local-only change | Level 3 — Structural Risk | Treat production env update as mandatory part of this work, not follow-up |

## Failure Mode Analysis

- **If old domain goes down before migration:** All agent calls, emails, PMS parsing, and website builder pipeline fail. Email is user-facing — highest impact.
- **If new domain webhooks aren't configured:** Same failures but on new domain. Validate before switching.
- **If partial migration (some vars updated, some not):** Mixed state where some features work and others don't. Risk of hard-to-diagnose bugs. Migration should be atomic per environment.

## Security Considerations

- No secrets are changing, only the domain portion of webhook URLs
- Webhook paths remain the same — no auth model changes
- Ensure new n8n instance has equivalent security posture (HTTPS, auth headers if any)

## Performance Considerations

- No performance impact. Domain change only — same webhook paths, same payloads.

## Observability & Monitoring Impact

- Any monitoring/alerting pointing to `n8napp.getalloro.com` needs updating
- Log grep patterns that reference the old domain should be noted

## Blast Radius Analysis

- **alloro-app:** All AI agents, email, PMS parsing, website builder, web scraping — effectively the entire backend automation layer
- **alloro-site:** Contact/demo request form emails
- **alloro-leadgen-tool:** Audit report emails, error notification emails
- **website-builder-rebuild:** Zero impact

## Test Strategy

1. After local env update — hit one webhook endpoint manually to confirm connectivity
2. Trigger email from alloro-site contact form (staging if available)
3. Upload a test CSV through PMS flow
4. Trigger at least one agent (e.g., summary agent) to confirm round-trip
5. Trigger website builder pipeline to confirm deployment flow

## GitHub Secrets — Manual Update Instructions

These secrets live outside the codebase. You must update them manually in each repo's GitHub Settings.

### Repo 1: alloro-site

1. Go to: **GitHub → alloro-site repo → Settings → Secrets and variables → Actions**
2. Update this secret:

| Secret Name | New Value |
|-------------|-----------|
| `VITE_N8N_EMAIL_URL` | `https://n8n.getalloro.com/webhook/alloro-email-service` |

3. After updating, trigger a new deploy (or push a commit) so the build picks up the new secret.

### Repo 2: alloro-leadgen-tool

1. Go to: **GitHub → alloro-leadgen-tool repo → Settings → Secrets and variables → Actions**
2. Update this secret:

| Secret Name | New Value |
|-------------|-----------|
| `VITE_N8N_EMAIL_URL` | `https://n8n.getalloro.com/webhook/alloro-email-service` |

3. After updating, trigger a new deploy (or push a commit) so the build picks up the new secret.

### Repo 3: alloro-app (signalsai-backend) — Production Server

This one is NOT a GitHub Secret — it's the production `.env` file on the server.

Update ALL of these values in the production environment:

```
PROOFLINE_AGENT_WEBHOOK=https://n8n.getalloro.com/webhook/proofline-agent
SUMMARY_AGENT_WEBHOOK=https://n8n.getalloro.com/webhook/summary-agent
OPPORTUNITY_AGENT_WEBHOOK=https://n8n.getalloro.com/webhook/opportunity-agent
COPY_COMPANION_AGENT_WEBHOOK=https://n8n.getalloro.com/webhook/copy-companion-agent
CRO_OPTIMIZER_AGENT_WEBHOOK=https://n8n.getalloro.com/webhook/cro-optimizer-agent
GUARDIAN_AGENT_WEBHOOK=https://n8n.getalloro.com/webhook/guardian-agent
GOVERNANCE_AGENT_WEBHOOK=https://n8n.getalloro.com/webhook/governance-agent
REFERRAL_ENGINE_AGENT_WEBHOOK=https://n8n.getalloro.com/webhook/referral-engine-analysis-agent
PRACTICE_RANKING_ANALYSIS_AGENT_WEBHOOK=https://n8n.getalloro.com/webhook/practice-ranking-analysis
IDENTIFIER_AGENT_WEBHOOK=https://n8n.getalloro.com/webhook/identifier-agent
WEB_SCRAPING_TOOL_AGENT_WEBHOOK=https://n8n.getalloro.com/webhook/website-scraping-tool
PMS_PARSER_WEBHOOK=https://n8n.getalloro.com/webhook/parse-csv
ALLORO_EMAIL_SERVICE_WEBHOOK=https://n8n.getalloro.com/webhook/alloro-email-service
N8N_WEBHOOK_START_PIPELINE=https://n8n.getalloro.com/webhook/website-builder-workflow
ALLORO_CUSTOM_WEBSITE_EMAIL_WEBHOOK=https://n8n.getalloro.com/webhook/public-websites-email
```

After updating, restart the backend service.

### Repo 4: website-builder-rebuild

No secrets or env changes needed. This project does not call n8n.

## Definition of Done

- [ ] All `.env` files across 3 repos updated (local)
- [ ] Hardcoded URLs in `pms-upload.service.ts` and `pms-retry.service.ts` replaced (env var or direct update)
- [ ] Hardcoded fallback URLs in `alloro-site/src/utils/emailService.ts` and `alloro-leadgen-tool/utils/emailService.ts` updated
- [ ] Production environment variables updated on server
- [ ] GitHub Secrets updated for `alloro-site` and `alloro-leadgen-tool`
- [ ] All 15 webhook paths verified active on `n8n.getalloro.com`
- [ ] Smoke test: email, agent call, PMS parse each confirmed working
- [ ] Documentation/plan files with old domain references noted (non-blocking, cosmetic)
