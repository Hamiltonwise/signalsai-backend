# Dave -- Sandbox Update Brief

> Read this before looking at the code. It takes 3 minutes.
> It will save you hours of confusion.

---

## What Happened

Corey and Claude did a deep cleanup of the sandbox over April 4-5. The goal was NOT to add features. The goal was to fix what was broken, remove what was fake, and simplify what was complex.

**The short version:** The product is now simpler, more honest, and better documented than it has ever been. Your infrastructure work is minimal.

---

## What This Means For You

### Your work (small):

1. **Run 3 migrations** -- all additive, no destructive changes. Adds a column here, creates a table there. Nothing breaks if they don't run (scoring falls back to defaults).

2. **Confirm Redis + minds-worker are running** -- same as always. Nothing changed about your PM2 setup.

3. **Confirm one env var** -- `ALLORO_EMAIL_SERVICE_WEBHOOK`. All emails fail without it. Every other env var is the same.

4. **Restart services after merge** -- `pm2 restart alloro-api && pm2 restart minds-worker`. Startup hooks auto-catch-up stale data.

That's it. No new EC2 instances. No new DNS records. No new PM2 processes. No new API keys.

### NOT your work:

- **Visual design** -- the five-page layout looks sparse right now. That's intentional. A design pass is coming. You don't need to worry about how it looks.
- **Content changes** -- "Business Clarity Score" was renamed to "Google Health Check" across 50+ files. These are string replacements. No logic changed.
- **Feature review** -- the new frontend features (help page, referral tabs, location picker) are self-contained React components. They don't touch your backend infrastructure.

---

## The Thing You Were Most Worried About

On our April 2 call, you said you wanted to cherry-pick features, not dump everything. You wanted to understand each agent before migrating. You were concerned about hidden bugs.

Here's what happened:

**14 of 21 workers were DISABLED.** The agents you were worried about understanding? They're commented out. They don't run. The worker file went from 642 lines to 228 lines. Only 7 workers remain -- the same 7 that were already running:

1. Weekly Ranking Snapshot (Sunday)
2. Weekly Score Recalc (Sunday night)
3. Monday Email (Monday mornings)
4. Daily Review Sync (4 AM UTC)
5. Daily Analytics Fetch (5 AM UTC)
6. Welcome Intelligence (4h after signup)
7. Instant Snapshot (on signup)

No Dreamweaver. No Collective Intelligence. No Product Evolution. No Skill Triggers. No Scheduler Tick. No Discovery. None of the ones you didn't understand. They're all disabled until someone verifies them and re-enables them intentionally.

**The merge is a simplification, not a dump.** Net code was deleted, not added. The product does fewer things now, but the things it does are honest and documented.

---

## What Was Removed (Customer-Facing)

These were broken or dishonest. They're gone:

- **Composite scores** -- "Business Clarity Score: 90/100" was replaced with raw readings (star rating, review count, profile completeness) with links to verify on Google
- **Position claims** -- "#3 in your market" was removed everywhere. The Places API rank doesn't match what Google Search shows. We were lying.
- **Fabricated dollar figures** -- "$52,000 in annual revenue at risk" was calculated from a formula with assumptions, not real data. Replaced with research-backed facts.
- **14 workers** -- disabled, not deleted. Code is preserved as comments.

---

## What Was Added

| Feature | Where | Backend Impact |
|---------|-------|---------------|
| Help page | /help (React page) | New GET endpoint: /api/user/help-articles. Returns static data from a TypeScript file. No DB. |
| Referral category tabs | Compare page | Frontend only. Reads existing referral engine data. No new endpoint. |
| Location picker | FivePageLayout | Frontend only. Uses existing locationContext. No new endpoint. |
| Contextual "?" on readings | Home page | Frontend only. Static research text in component props. |
| Advisor chatbot | Five-page layout | Uses existing /api/cs-agent/chat endpoint. System prompt updated (no new logic). |
| Review posting via MyBusiness API | reviewMonitor.ts | Modified existing service. Tries MyBusiness API first (postable IDs), falls back to Places API. Requires `postable` column migration. |

---

## Documentation Created

These are in the repo. They're for you, for Corey, for Jo, for any future session:

| Doc | What It Covers | Why It Matters To You |
|-----|---------------|----------------------|
| `docs/TECHNICAL-ARCHITECTURE.md` | Every worker, every endpoint, every cron schedule, every service status | You can verify any claim about the system by reading this |
| `docs/RUNBOOK.md` | Step-by-step for every failure mode (email, data, reviews, server) | When something breaks at 2 AM, open this |
| `docs/DEPLOY-SPEC.md` | Exact merge/migrate/restart commands with verification | Your deploy checklist |
| `docs/ONBOARDING.md` | How to get started (customer + team) | If anyone new joins |
| `docs/PRODUCT-OPERATIONS.md` | What the product does and why (updated) | The source of truth |

---

## How To Review Before Merging

```bash
# See all commits (one line each)
git log main..sandbox --oneline

# See the worker simplification specifically
git diff main..sandbox -- src/workers/worker.ts

# See net lines changed (expect net DELETION)
git diff --stat main..sandbox | tail -5

# See only backend changes (ignore frontend)
git diff --stat main..sandbox -- src/
```

If you want to cherry-pick instead of full merge, the commits are organized by purpose. Run the log command above and pick the ones you want. The critical ones are the worker simplification and the migration files.

---

## Timeline

No rush. The five-page layout needs a design pass before it replaces v1 for customers. Your infrastructure work (migrations, restart, env var check) can happen whenever you're ready. The code is stable and tested (TypeScript clean, build passes, verified April 5).

When you're ready, the deploy spec has the exact commands. Total time: ~15 minutes of your time, plus 5 minutes of waiting for data refresh.

---

## What Wasn't Touched

Your PM system, website builder, SectionsEditor, form submissions, notification system, E2E tests, kanban boards -- none of that was modified. The sandbox changes are in different files: customer-facing pages, email templates, worker.ts, scoring services, and new documentation.

Your code style (prop-driven components, domain-focused naming, pragmatic error handling) is preserved everywhere you built. The new code follows a different documentation pattern (external docs, narrative commits) but doesn't overwrite your patterns.

---

*This merge makes your life easier, not harder. Fewer workers to monitor. Better documentation for troubleshooting. Same infrastructure.*
