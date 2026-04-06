# Deploy Spec -- Sandbox to Main

> Dave: this merge makes things SIMPLER. Not more complex.
> 21 workers → 7. Fake data removed. Text cleaned up. Frontend improved.
> No new infrastructure. No new agents. No new services to manage.

---

## Why This Is Safe (Read First)

This is not a feature dump. This is a cleanup.

**What was REMOVED:**
- 14 of 21 workers disabled (Dreamweaver, Collective Intelligence, Product Evolution, SEO Bulk, Scheduler Tick, Skill Trigger, Dead Letter, Works Digest, Discovery, PM Brief, Website Backup/Restore, Compile/Publish, Scrape/Compare, Feedback Loop)
- All fabricated dollar figures from emails and checkup findings
- All position claims ("#3 in your market") from customer-facing surfaces
- "Business Clarity Score" replaced with "Google Health Check" (text changes, not logic)
- Composite score gauge/ring removed from customer pages

**What was SIMPLIFIED:**
- worker.ts went from 642 lines to 228 lines
- Only 7 workers remain -- the same ones already running on EC2:
  1. Weekly Ranking Snapshot (Sun 11 PM UTC)
  2. Weekly Score Recalc (Mon 3 AM UTC)
  3. Monday Email (hourly on Mondays)
  4. Daily Review Sync (4 AM UTC)
  5. Daily Analytics Fetch (5 AM UTC)
  6. Welcome Intelligence (4h after signup)
  7. Instant Snapshot (on signup)

**What was ADDED (frontend only, no infrastructure changes):**
- Help page at /help (React page, fetches articles from new API endpoint)
- Referral category tabs on Compare page (All/Active/New/Declining/Dormant)
- Location picker for multi-location orgs (reads existing locationContext)
- "?" expand buttons on reading cards (research backing text)
- Advisor chatbot mounted on five-page layout (uses existing /api/cs-agent/chat endpoint)

**What needs your infrastructure work:**
- 3 database migrations (all additive, no destructive changes)
- Confirm Redis + minds-worker are running (same as always)
- Confirm environment variables are set (same ones, no new ones except ALLORO_EMAIL_SERVICE_WEBHOOK)

---

## How to Verify Before Merging

If you want to review before merging (I expect you will):

```bash
# See all commits
git log main..sandbox --oneline

# See net code change
git diff --stat main..sandbox

# See the worker.ts change specifically (14 workers removed)
git diff main..sandbox -- src/workers/worker.ts

# See what text changed in customer emails
git diff main..sandbox -- src/jobs/mondayEmail.ts

# See the new help articles (just data, no logic)
git diff main..sandbox -- src/data/helpArticles.ts
```

The largest changes by line count are:
1. worker.ts (net -414 lines -- workers removed)
2. Text replacements across 50+ files ("Business Clarity Score" → "Google Health Check", position claims removed)
3. New files: HelpPage.tsx, helpArticles.ts, helpArticles route, TECHNICAL-ARCHITECTURE.md, RUNBOOK.md, ONBOARDING.md, DEPLOY-SPEC.md, design-system.md

---

## Step 1: Merge

```bash
git checkout main
git pull origin main
git merge sandbox
# Review the merge. If anything looks wrong, `git merge --abort`
git push origin main
```

If you prefer to cherry-pick specific commits instead of merging all at once, the commits are organized by purpose. Run `git log main..sandbox --oneline` to see them. The critical ones are the worker simplification and the text cleanup commits.

---

## Step 2: Migrations (3 pending, all additive)

None of these delete data or modify existing columns. They only ADD:

```bash
npx knex migrate:latest
```

| Migration | What It Adds | Risk |
|-----------|-------------|------|
| add_org_timezone | timezone column to organizations | None. Nullable column. |
| create_scoring_config | New table with 16 seed rows | None. New table. Scoring falls back to defaults if table missing. |
| add_review_postable_flag | boolean column to review_notifications | None. Defaults to false. |

**Verify:**
```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" https://app.getalloro.com/api/admin/scoring-config
# Should return 16 rows
```

---

## Step 3: Restart Services

```bash
pm2 restart alloro-api
pm2 restart minds-worker
```

**Verify:**
```bash
pm2 status
# Both should show "online"

redis-cli ping
# Should return PONG
```

**What happens on restart:**
- Startup hooks fire automatically: catchUpStaleScores (recalcs stale data), pollReviewsOnStartup (syncs reviews), pollAnalyticsOnStartup (fetches GA4/GSC)
- Worker registers 5 cron schedules (review sync, analytics, snapshots, score recalc, Monday email)
- That's it. No new processes. Fewer than before.

---

## Step 4: Trigger Data Refresh

```bash
# Force fresh competitive snapshots
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  https://app.getalloro.com/api/admin/rankings/run-all

# Force fresh scores
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  https://app.getalloro.com/api/admin/score-recalc/run-all

# Force review sync
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  https://app.getalloro.com/api/admin/reviews/poll
```

---

## Step 5: Verify

1. Open admin, Pilot Mode into Garrison's account
2. Home page should show: 5 stars, ~73 reviews, 3/5+ profile completeness (was showing 1/5 before because data was stale)
3. Compare page should show: Peluso Orthodontics comparison with verify links
4. Reviews should show: reviews syncing message (reviews appear within 24 hours)
5. No page should show: a composite score, "#3 in your market", or "$X in revenue at risk"

---

## Step 6: Environment Variables

Same as current, plus one:

| Variable | Status |
|----------|--------|
| DATABASE_URL | Already set |
| REDIS_URL | Already set |
| ANTHROPIC_API_KEY | Already set |
| GOOGLE_PLACES_API | Already set (note: NOT GOOGLE_PLACES_API_KEY) |
| MAILGUN_API_KEY | Already set |
| MAILGUN_DOMAIN | Already set |
| SENTRY_DSN | Already set |
| STRIPE_SECRET_KEY | Already set |
| **ALLORO_EMAIL_SERVICE_WEBHOOK** | **CHECK THIS. P0. All emails fail without it.** |

---

## If Something Goes Wrong

`docs/RUNBOOK.md` has step-by-step for every failure mode.

**Quick rollback:** If the merge causes problems:
```bash
git revert HEAD
git push origin main
pm2 restart alloro-api
pm2 restart minds-worker
```

This puts main back to exactly where it was. No data loss. No infrastructure changes.

---

## What You DON'T Need to Do

- No new EC2 instances
- No new Redis configuration
- No new PM2 processes
- No new DNS records
- No new API keys (except verifying EMAIL_SERVICE_WEBHOOK)
- No new services to monitor
- The 14 disabled workers are still in the code as comments. Nothing to uninstall.

---

## Full Documentation

After deploy, these docs are in the repo:

| Doc | Purpose |
|-----|---------|
| docs/PRODUCT-OPERATIONS.md | What the product does and why (the constitution) |
| docs/TECHNICAL-ARCHITECTURE.md | How everything is wired, every endpoint, every worker |
| docs/RUNBOOK.md | When things break, exact steps with escalation |
| docs/ONBOARDING.md | New team member or customer getting started |
| docs/DEPLOY-SPEC.md | This document |
| frontend/.claude/rules/design-system.md | Visual design rules for future UI work |

---

*This merge makes things simpler. Fewer workers. Cleaner text. Better docs. Same infrastructure.*
