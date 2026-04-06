# Deploy Spec -- Sandbox to Main

> Dave: this is the single page. Everything you need. Exact commands.
> Read once. Execute in order. Verify at the end.

---

## Pre-Deploy

1. Sandbox branch is `sandbox`, 20+ commits ahead of `main`
2. All TypeScript compiles clean (frontend + backend, verified April 5)
3. Production build passes (Vite, verified April 5)
4. No customer-facing changes on main until this deploys

---

## Step 1: Merge

```bash
git checkout main
git merge sandbox
git push origin main
```

---

## Step 2: Migrations (3 pending)

```bash
npx knex migrate:latest
```

This runs:
- `20260403000001_add_org_timezone.ts` -- adds timezone column to organizations
- `20260404000001_create_scoring_config.ts` -- creates scoring_config table with 16 seed rows
- `20260404000002_add_review_postable_flag.ts` -- adds postable boolean to review_notifications

**Verify:**
```bash
# Scoring config created
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

---

## Step 4: Trigger Data Refresh

The server startup hooks auto-catch-up, but to be safe:

```bash
# Force fresh competitive snapshots for all orgs
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  https://app.getalloro.com/api/admin/rankings/run-all

# Force fresh score recalculation
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  https://app.getalloro.com/api/admin/score-recalc/run-all

# Force review sync
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  https://app.getalloro.com/api/admin/reviews/poll
```

---

## Step 5: Verify (5 minutes after Step 4)

1. **Log into sandbox as Garrison** (Pilot Mode from admin)
   - Home page: readings should show 5 stars, 73 reviews, 3/5+ profile completeness
   - Compare page: side-by-side vs Peluso Orthodontics (419 reviews)
   - Reviews page: should show reviews (if sync ran) or "syncing within 24 hours"
   - Presence page: website live, GBP completeness updated

2. **Check profile completeness specifically:**
   - Garrison should show 3/5 (has phone, website, hours). If still showing 1/5, the recalc didn't run.

3. **Check admin:**
   ```bash
   curl -H "Authorization: Bearer $ADMIN_TOKEN" \
     https://app.getalloro.com/api/admin/scoring-config | head -5
   # Should return config rows, not empty
   ```

---

## Step 6: Environment Variables

Confirm these are set. If any are missing, the corresponding feature fails silently:

| Variable | Required For | Fatal If Missing |
|----------|-------------|-----------------|
| `DATABASE_URL` | Everything | Yes |
| `REDIS_URL` | All scheduled jobs | Yes |
| `ANTHROPIC_API_KEY` | Chatbot, AI review drafts, Monday email intelligence | Yes |
| `GOOGLE_PLACES_API` | Rankings, competitive data, readings | Yes |
| `MAILGUN_API_KEY` | All emails | Yes |
| `MAILGUN_DOMAIN` | All emails | Yes |
| `ALLORO_EMAIL_SERVICE_WEBHOOK` | All emails (P0) | Yes |
| `SENTRY_DSN` | Error tracking | No (graceful) |
| `STRIPE_SECRET_KEY` | Billing | Only if billing active |
| `STRIPE_GROWTH_PRICE_ID` | Growth tier | Only if billing active |
| `STRIPE_FULL_PRICE_ID` | Full tier | Only if billing active |

---

## What Changed (Summary)

### Customer-Facing
- Five-page layout: Home, Compare, Reviews, Presence, Progress
- Readings with Google verification links (no more composite scores)
- No position claims anywhere (no "#3 in your market")
- No fabricated dollar figures (research-backed facts only)
- Review response posting via MyBusiness API (approve and post to Google)
- Advisor chatbot on every page (knows customer's data)
- Help page with 23 searchable articles
- Referral sources with categorization on Compare page
- Location picker for multi-location orgs
- Contextual "?" on every reading card

### Infrastructure
- Workers reduced from 21 to 7 (Essential 7 only)
- 3 new migrations (timezone, scoring config, review postable flag)
- Startup hooks auto-catch-up stale data on restart
- Design system rules for future UI work

### Documentation
- Product Constitution updated (all Knowns re-tested April 5)
- Technical Architecture doc created
- Runbook with incident response
- Onboarding guide (customer + team)
- Deploy spec (this document)

---

## If Something Goes Wrong

See `docs/RUNBOOK.md` for incident-specific troubleshooting.

**Quick fixes:**
- Server won't start: check DATABASE_URL, run `npm install`
- Emails not sending: check MAILGUN_API_KEY and ALLORO_EMAIL_SERVICE_WEBHOOK
- Data stale: run the Step 4 commands again
- Worker not processing: `pm2 restart minds-worker`

**Escalation:** Claude Code (Level 1) > Dave (Level 2) > Corey (Level 3)

---

*One page. Exact commands. No ambiguity.*
