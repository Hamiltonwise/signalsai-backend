# Alloro Technical Architecture

> How the system is built. What runs, when, and why.
> Read `PRODUCT-OPERATIONS.md` for WHAT the product does.
> Read this document for HOW the code implements it.

---

## Infrastructure

| Component | What It Is | Where It Runs | Required For |
|-----------|-----------|---------------|-------------|
| Express API | Node.js server, all routes | EC2 (PM2: `alloro-api`) | Everything |
| Minds Worker | BullMQ job processor, all crons | EC2 (PM2: `minds-worker`) | All scheduled jobs |
| PostgreSQL | Primary database | RDS | Everything |
| Redis | BullMQ queue backend | EC2 (local) or ElastiCache | All scheduled jobs |
| Frontend | React 18 + Vite + Tailwind | Static build served by Express | Customer dashboard |

### If Redis is down
No scheduled jobs fire. No Monday emails. No ranking snapshots. No review syncing. The API still serves pages but no background work happens. Use the manual admin endpoints (see Troubleshooting) to trigger jobs directly.

### If minds-worker is down
Same as Redis down. The workers process BullMQ jobs. If the process isn't running, jobs queue in Redis but never execute.

### Verify both are running
```bash
pm2 status                    # Both alloro-api and minds-worker should show "online"
redis-cli ping                # Should return PONG
```

---

## The Weekly Chain

This is the core product loop. Each step depends on the one before it.

```
Sunday 11 PM UTC (6 PM ET)    Ranking Snapshots
    |                          Refreshes Google position + competitor data for all customers.
    |                          Source: src/services/rankingsIntelligence.ts
    |                          Worker queue: minds-weekly-ranking-snapshot
    v
Monday 3 AM UTC (10 PM ET)    Score Recalculation
    |                          Recalculates clarity scores using fresh snapshot data.
    |                          Source: src/workers/processors/weeklyScoreRecalc.processor.ts
    |                          Worker queue: minds-weekly-score-recalc
    v
Monday hourly (all day)        Monday Email
                               Sends to orgs whose local time = 7 AM that hour.
                               A New York customer gets it at 7 AM ET. LA at 7 AM PT.
                               Source: src/jobs/mondayEmail.ts
                               Worker queue: minds-monday-email
```

**If a step fails:** The chain breaks downstream. If snapshots don't refresh, scores use stale data, and Monday emails contain last week's intelligence.

---

## All Scheduled Jobs

| Job | Schedule | Queue Name | Source | What It Does |
|-----|----------|-----------|--------|-------------|
| Daily Analytics Fetch | 5 AM UTC daily | minds-daily-analytics | src/services/analyticsService.ts | Pulls GA4 + GSC data for connected orgs |
| Daily Review Sync | 4 AM UTC daily | minds-review-sync | src/workers/processors/reviewSync.processor.ts | Fetches GBP reviews for all connected locations |
| Daily Discovery | 6 AM UTC daily | minds-discovery | src/workers/processors/discovery.processor.ts | Scans for new competitive signals |
| Dreamweaver | 6 AM UTC daily | minds-dreamweaver | src/services/agents/dreamweaver.ts | Scans for hospitality patterns |
| Skill Trigger Check | Every 5 min | minds-skill-triggers | src/workers/processors/skillTrigger.processor.ts | Checks DB for triggered agent skills |
| Dead Letter Check | Every 10 min | minds-skill-triggers | src/workers/processors/skillTrigger.processor.ts | Cleans up stuck/failed jobs |
| Scheduler Tick | Every 60 sec | minds-scheduler | src/workers/processors/scheduler.processor.ts | Checks DB for due scheduled tasks |
| Weekly Ranking Snapshot | Sun 11 PM UTC | minds-weekly-ranking-snapshot | src/services/rankingsIntelligence.ts | Refreshes Google position + competitor data |
| Weekly Score Recalc | Mon 3 AM UTC | minds-weekly-score-recalc | src/workers/processors/weeklyScoreRecalc.processor.ts | Recalculates all scores |
| Monday Email | Hourly on Mondays | minds-monday-email | src/jobs/mondayEmail.ts | Sends weekly intelligence email |
| Feedback Loop | Tue 3 PM UTC | minds-feedback-loop | src/workers/processors/feedbackLoop.processor.ts | Measures if recommended actions improved metrics |
| Works Digest | Sun 3 AM UTC | minds-works-digest | src/workers/processors/worksDigest.processor.ts | Weekly summary of system activity |
| Collective Intelligence | Mon 4 AM UTC | minds-collective-intelligence | src/services/collectiveIntelligence.ts | Cross-account pattern analysis |
| Product Evolution | Mon 7 AM UTC | minds-product-evolution | src/jobs/productEvolution.ts | Self-improvement proposals |
| PM Daily Brief | 10 PM UTC daily | pm-daily-brief | src/workers/processors/pmDailyBrief.processor.ts | Dave's daily briefing |

---

## Event-Triggered Jobs (Not Cron)

| Job | Trigger | Queue Name | Source | What It Does |
|-----|---------|-----------|--------|-------------|
| Welcome Intelligence | 4h after checkup signup | minds-welcome-intelligence | src/workers/processors/welcomeIntelligence.processor.ts | Sends referral sources + competitor velocity email |
| Instant Snapshot | Immediately after signup | minds-instant-snapshot | src/services/rankingsIntelligence.ts | Fresh competitive data so new customer sees readings on first login |
| Website Builder | During checkup signup | (synchronous) | src/services/instantWebsiteGenerator.ts | Generates website from GBP data + reviews |

---

## Startup Hooks

When the Express server starts (`src/index.ts`), these fire automatically:

| Hook | What It Does | Why |
|------|-------------|-----|
| `catchUpStaleScores()` | Recalculates scores for orgs with scores older than 7 days | Covers orgs that missed the Sunday cron |
| `pollReviewsOnStartup()` | Fetches reviews for orgs not polled in 24h | Catches up if review sync cron missed |
| `pollAnalyticsOnStartup()` | Fetches GA4/GSC for connected orgs | Catches up if analytics cron missed |

All are non-blocking with 2-second delays between orgs to avoid rate limits.

---

## DFY Services -- Status

| Service | File | Status | What's Missing |
|---------|------|--------|---------------|
| Clarity Scoring | src/services/clarityScoring.ts | WORKING | Reads from scoring_config DB (migration pending) |
| Rankings Intelligence | src/services/rankingsIntelligence.ts | WORKING | Scheduled and firing |
| Monday Email | src/jobs/mondayEmail.ts | WORKING | Scheduled and firing |
| Review Sync | src/workers/processors/reviewSync.processor.ts | WORKING | Scheduled and firing |
| Welcome Intelligence | src/workers/processors/welcomeIntelligence.processor.ts | WORKING | Triggered on signup |
| Website Generator | src/services/instantWebsiteGenerator.ts | WORKING | Generates at signup, no ongoing updates |
| Review Response Posting | src/services/gbpReviewReply.ts | SEVERED | Code exists but no route calls `approveAndPostReview()`. The approve button saves to DB but never posts to Google. |
| CRO Engine | src/services/croEngine.ts | DEAD CODE | 574 lines, complete implementation, never invoked by any route, worker, or cron |
| Review Sentiment Comparison | src/services/reviewSentiment.ts | DEAD CODE | Compares review themes between customer and competitor. Never called. |
| SEO Content Generation | src/services/programmaticSEO.ts | DEAD CODE | Generates city/specialty pages. Never invoked. |
| AEO Linking | src/services/aeoLinking.ts | DEAD CODE | Entity optimization mappings. Never invoked. |

---

## Database -- Pending Migrations

These migrations exist in code but have NOT been run on sandbox or production:

```bash
npx knex migrate:latest    # Run from repo root
```

| Migration | File | What It Creates |
|-----------|------|----------------|
| Org Timezone | 20260403000001_add_org_timezone.ts | Adds timezone column to organizations table |
| Scoring Config | 20260404000001_create_scoring_config.ts | Creates scoring_config table with 16 seed rows |

**After running migrations, verify:**
```bash
# Scoring config loaded
curl -H "Authorization: Bearer $ADMIN_TOKEN" https://sandbox.getalloro.com/api/admin/scoring-config

# Should return 16 rows with keys like: ratingWeight, reviewCountWeight, etc.
```

---

## Scoring Algorithm

**One algorithm:** `calculateClarityScore()` in `src/services/clarityScoring.ts`

Reads weights from `scoring_config` database table (5-min cache). Falls back to hardcoded defaults if table doesn't exist.

**Readings (customer-facing):**
- Star Rating: raw from Google Places API
- Review Volume: raw count vs top competitor count
- Profile Completeness: 5 boolean checks (phone, hours, website, photos, description)
- Review Responses: response rate from review_notifications
- Your Market: competitive landscape context

**Internal composite (never shown to customer):**
- localVisibility (0-40): GBP completeness, photos, hours, description
- onlinePresence (0-40): rating, review count vs competitor
- reviewHealth (0-20): response rate, sentiment
- Total: 0-100, stored in `checkup_score` and `current_clarity_score`

**Admin endpoints:**
- `GET /api/admin/scoring-config` -- view all weights
- `PUT /api/admin/scoring-config` -- edit weights
- `POST /api/admin/scoring-config/preview` -- preview impact before saving

---

## Manual Trigger Endpoints

When crons fail or you need to run something immediately:

| Endpoint | What It Does |
|----------|-------------|
| `POST /api/admin/rankings/run-now` | Ranking snapshot for one org (body: `{ orgId }`) |
| `POST /api/admin/rankings/run-all` | Ranking snapshots for all orgs |
| `POST /api/admin/score-recalc/run-now` | Score recalc for one org (body: `{ orgId }`) |
| `POST /api/admin/score-recalc/run-all` | Score recalc for all orgs |
| `POST /api/admin/monday-email/run-now` | Monday email for one org (body: `{ orgId }`) |
| `POST /api/admin/monday-email/run-all` | Monday email for all orgs |
| `POST /api/admin/reviews/poll` | Review poll for all connected practices |
| `POST /api/admin/reviews/poll/:placeId` | Review poll for one practice |
| `POST /api/admin/clarity-metrics/run` | Trigger clarity metrics snapshot |

All require admin auth header: `Authorization: Bearer $ADMIN_TOKEN`

---

## Troubleshooting

### Monday email didn't send

1. **Check if minds-worker is running:** `pm2 status`
2. **Check if Redis is up:** `redis-cli ping`
3. **Check if snapshots ran Sunday:** Look in `weekly_ranking_snapshots` for this week's `week_start`
4. **Manual trigger:** `POST /api/admin/monday-email/run-all`
5. **Check logs:** `pm2 logs minds-worker --lines 100`

### Customer data is stale

1. **Run fresh snapshot:** `POST /api/admin/rankings/run-now` with `{ "orgId": X }`
2. **Recalculate score:** `POST /api/admin/score-recalc/run-now` with `{ "orgId": X }`
3. **Poll reviews:** `POST /api/admin/reviews/poll`
4. **Or restart server:** Startup hooks auto-catch-up stale data

### Reviews page is empty

1. **Check if review sync ran:** Look at `pm2 logs minds-worker` for `[review-sync]`
2. **Check review_notifications table:** `SELECT count(*) FROM review_notifications WHERE org_id = X`
3. **Manual poll:** `POST /api/admin/reviews/poll`
4. **Check GBP connection:** Org must have a connected Google Business Profile with a selected location

### Readings don't match Google

1. **Stale checkup_data:** Data comes from `checkup_data.place` which is set at signup and refreshed weekly
2. **Force refresh:** `POST /api/admin/rankings/run-now` with `{ "orgId": X }`
3. **GBP field mapping:** Profile completeness checks: `hasPhone || nationalPhoneNumber`, `hasHours || regularOpeningHours`, `hasWebsite || websiteUri`, `photosCount || photos.length`, `hasEditorialSummary || editorialSummary`
4. **If fields still wrong after refresh:** The Places API may not return all fields. Check `checkup_data` JSON in the organizations table.

### Review responses not posting to Google

**Known issue.** The approve flow saves the response to the database (`review_notifications.status = 'responded'`) but does NOT call `approveAndPostReview()` from `gbpReviewReply.ts`. The posting path is severed. This requires wiring the route handler in `src/routes/user/reviewDrafts.ts` to call the GBP reply function.

### Scoring config not loaded

**Pending migration.** Run `npx knex migrate:latest` from repo root. The scoring engine falls back to hardcoded defaults until the migration runs, so scoring still works -- it just can't be edited from admin.

---

## File Map -- Key Files

### Backend Core
| File | Purpose |
|------|---------|
| src/index.ts | Express server, all route mounting, startup hooks |
| src/workers/worker.ts | All BullMQ workers and cron schedules |
| src/services/clarityScoring.ts | The ONE scoring algorithm |
| src/services/rankingsIntelligence.ts | Google position + competitor data |
| src/jobs/mondayEmail.ts | Monday email generation and sending |
| src/services/oneActionCard.ts | Home page action card waterfall logic |
| src/services/gbpReviewReply.ts | Review response posting to Google (severed) |
| src/services/croEngine.ts | CRO recommendations (dead code) |
| src/services/reviewSentiment.ts | Sentiment comparison (dead code) |
| src/services/instantWebsiteGenerator.ts | Website generation at signup |

### Frontend Core
| File | Purpose |
|------|---------|
| frontend/src/pages/HomePage.tsx | Readings + action card (the "Am I okay?" page) |
| frontend/src/pages/ComparePage.tsx | Side-by-side competitor comparison |
| frontend/src/pages/ReviewsPage.tsx | Review list + AI response drafts |
| frontend/src/pages/PresencePage.tsx | Website + GBP completeness |
| frontend/src/pages/ProgressReport.tsx | Reading trends over time |
| frontend/src/components/FivePageLayout.tsx | Navigation (5 pages, bottom mobile, side desktop) |

### Configuration
| File | Purpose |
|------|---------|
| docs/PRODUCT-OPERATIONS.md | Product constitution (WHAT and WHY) |
| docs/TECHNICAL-ARCHITECTURE.md | This file (HOW) |
| CLAUDE.md | Session start instructions for Claude |
| .claude/rules/build-safety.md | Work Order format, blast radius |
| .claude/rules/task-routing.md | Who owns what |

---

## Environment Variables (Required)

| Variable | Purpose | Used By |
|----------|---------|--------|
| DATABASE_URL | PostgreSQL connection | All |
| REDIS_URL | Redis connection (default: redis://localhost:6379) | minds-worker |
| ANTHROPIC_API_KEY | Claude API for intelligence generation | Monday email, action cards, agents |
| GOOGLE_PLACES_API_KEY | Google Places API for rankings | Rankings intelligence |
| MAILGUN_API_KEY | Email sending | Monday email, welcome email, checkup results |
| MAILGUN_DOMAIN | Email domain | All emails |
| SENTRY_DSN | Error tracking | All |
| STRIPE_SECRET_KEY | Billing | Billing routes |
| STRIPE_GROWTH_PRICE_ID | Growth tier price | Billing |
| STRIPE_FULL_PRICE_ID | Full tier price | Billing |

---

*Last updated: April 4, 2026. If this document contradicts the code, check the code.*
