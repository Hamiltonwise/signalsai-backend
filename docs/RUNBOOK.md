# Alloro Runbook

> When something breaks, open this document. Follow the steps. Escalate if needed.
> Every section: what's wrong, how to verify, how to fix, who to contact.

---

## Escalation Chain

| Level | Who | When | How to Reach |
|-------|-----|------|-------------|
| 1 | Claude Code | Code changes, debugging, data tracing | New session, point to this runbook |
| 2 | Dave (CTO) | Infrastructure (EC2, Redis, DNS, env vars, deploys) | Notion task page, async |
| 3 | Corey (Founder) | Customer communication, billing, product decisions | Direct |

**Response expectations:**
- Level 1: Immediate (Claude session)
- Level 2: Same business day (Dave is Philippines, UTC+8)
- Level 3: Same day

---

## Incident: Monday Email Didn't Send

**Customer impact:** Owner doesn't get their weekly intelligence. Trust erodes silently -- they don't complain, they just stop expecting value.

**Verify:**
1. `pm2 status` -- is `minds-worker` online?
2. `redis-cli ping` -- does Redis respond PONG?
3. Check `weekly_ranking_snapshots` for this week's `week_start` -- did snapshots run Sunday?
4. Check `pm2 logs minds-worker --lines 200` for `[MINDS-WORKER]` entries around Monday UTC hours

**Fix:**
- If minds-worker is down: `pm2 restart minds-worker`
- If Redis is down: `sudo systemctl restart redis` or restart the EC2 instance
- If snapshots didn't run: `POST /api/admin/rankings/run-all` (admin auth required)
- If scores didn't recalc: `POST /api/admin/score-recalc/run-all`
- Manual email trigger: `POST /api/admin/monday-email/run-all`

**If it still doesn't send:**
- Check `MAILGUN_API_KEY` and `MAILGUN_DOMAIN` env vars are set
- Check `ALLORO_EMAIL_SERVICE_WEBHOOK` env var (P0 -- all emails fail without this)
- Escalate to Dave (Level 2)

**Customer communication:** Don't. Fix it and ensure next Monday works. If a customer asks, Corey responds directly.

---

## Incident: Customer Data Doesn't Match Google

**Customer impact:** This is the #1 trust killer. If Garrison sees "Missing: Phone" when his phone is on Google, every reading becomes suspect.

**Verify:**
1. What does Google say right now?
```bash
curl -s -X POST "https://places.googleapis.com/v1/places:searchText" \
  -H "Content-Type: application/json" \
  -H "X-Goog-Api-Key: $GOOGLE_PLACES_API" \
  -H "X-Goog-FieldMask: places.displayName,places.rating,places.userRatingCount,places.nationalPhoneNumber,places.websiteUri,places.regularOpeningHours,places.editorialSummary,places.photos" \
  -d '{"textQuery":"BUSINESS NAME CITY STATE","maxResultCount":1}'
```
2. Compare against what's in `organizations.checkup_data` for that org

**Fix:**
- Force refresh for one org: `POST /api/admin/rankings/run-now` with `{ "orgId": X }`
- Then recalculate: `POST /api/admin/score-recalc/run-now` with `{ "orgId": X }`
- This fetches fresh Places API data and writes it back to checkup_data
- Verify after: check the customer's Home page readings

**Root cause:** Data is stale because the weekly recalc hasn't run (minds-worker down) or the org missed the Sunday window.

**If the data still doesn't match after refresh:**
- The Places API may not return all fields (e.g., editorialSummary is sometimes null even when it exists on Google)
- This is a Google API limitation, not an Alloro bug
- Escalate to Claude Code (Level 1) to investigate field mapping

---

## Incident: Reviews Page Empty

**Customer impact:** They connected Google, expected to see their reviews, see nothing. Feels broken.

**Verify:**
1. Does the org have a connected Google Business Profile? Check `google_connections` table for their org_id
2. Is a location selected? Check `google_properties` where `selected = true` for their connection
3. Has the review sync run? Check `pm2 logs minds-worker` for `[REVIEW-SYNC]` entries
4. Are there rows in `review_notifications` for their org_id?

**Fix:**
- If no connection: customer needs to connect Google in Settings > Integrations
- If no selected location: customer needs to select a primary location
- If sync hasn't run: `POST /api/admin/reviews/poll`
- If sync ran but no reviews: check that the org has a `placeId` in their checkup_data

**Timeline:** Reviews sync daily at 4 AM UTC. After connecting, reviews appear within 24 hours. The startup hook `pollReviewsOnStartup()` also runs on server restart.

---

## Incident: Review Response Didn't Post to Google

**Customer impact:** They tapped "Approve and Post" and expect to see the response on their Google listing.

**Verify:**
1. Check `review_notifications` for the review -- is `status` = "responded"?
2. Is `postable` = true? If false, the review was fetched via Places API (wrong ID format), not MyBusiness API
3. Check `behavioral_events` for a `dfy.review_reply_posted` event for that review

**Fix:**
- If `postable` = false: the review needs to be re-fetched via MyBusiness API. Trigger: `POST /api/admin/reviews/poll`
- If `postable` = true but no behavioral_event: the Google API call failed. Check server logs for `[GBPReply]` errors
- Common errors: 401 (OAuth token expired -- customer needs to reconnect Google), 403 (permissions), 404 (review deleted)

**Requires:** Migration `20260404000002_add_review_postable_flag.ts` must be run. If `postable` column doesn't exist, all reviews default to non-postable.

---

## Incident: Checkup Flow Fails or Hangs

**Customer impact:** Prospect typed their business name, the scanning theater started, and it never completed. First impression destroyed.

**Verify:**
1. Is `GOOGLE_PLACES_API` env var set and the key valid?
2. Is the API quota exceeded? Check Google Cloud Console
3. Check server logs for `/api/checkup/analyze` errors

**Fix:**
- If API key invalid: rotate key in Google Cloud Console, update env var, restart server
- If quota exceeded: wait for reset (daily) or request quota increase
- If the business isn't found: the textQuery may not match. Customer can try a different name format

**Conference mode:** If running at AAE or a conference with poor WiFi, the conference fallback (`conferenceFallback.ts`) generates personalized results from cached data without API calls. Activate with `?conference=true` URL parameter.

---

## Incident: Server Won't Start

**Verify:**
1. `pm2 logs alloro-api --lines 50` -- look for startup errors
2. Common: `DATABASE_URL` not set, database unreachable, port already in use
3. Check `node --version` (requires 18+)

**Fix:**
- If database unreachable: check RDS security groups, verify DB_HOST/DB_PORT/DB_USER/DB_PASSWORD
- If port in use: `pm2 delete alloro-api && pm2 start ecosystem.config.js`
- If module not found: `npm install` from repo root

**After restart:** The startup hooks automatically run:
- `catchUpStaleScores()` -- recalculates any score older than 7 days
- `pollReviewsOnStartup()` -- fetches reviews for orgs not polled in 24h
- `pollAnalyticsOnStartup()` -- fetches GA4/GSC for connected orgs

---

## Incident: Billing Not Working

**Escalation: RED. Corey approves all billing changes.**

**Verify:**
1. Is `STRIPE_SECRET_KEY` set?
2. Is `STRIPE_GROWTH_PRICE_ID` / `STRIPE_FULL_PRICE_ID` set?
3. Check Stripe dashboard for the customer's subscription status

**Do NOT:**
- Modify billing code without Corey's approval
- Change pricing without Corey's approval
- Delete or cancel a subscription without Corey's explicit instruction

---

## Routine: Weekly Health Check

Run every Monday after the email window closes (after 12 PM UTC):

1. **Did all Monday emails send?**
   - Check `behavioral_events` for `monday_email_sent` events this week
   - Count should match number of active orgs with `subscription_status = 'active'`

2. **Are snapshots fresh?**
   - Check `weekly_ranking_snapshots` for this week's `week_start`
   - Every active org should have a row

3. **Are reviews syncing?**
   - Check `review_notifications` for rows created in the last 7 days
   - At least one row per connected org

4. **Is the worker healthy?**
   - `pm2 status` -- both `alloro-api` and `minds-worker` should show `online`
   - `pm2 logs minds-worker --lines 20` -- recent completed jobs, no crash loops

---

## Deploy Checklist

Before deploying sandbox to main:

1. [ ] `npx knex migrate:latest` -- run pending migrations
2. [ ] `pm2 restart alloro-api` -- restart server (startup hooks fire)
3. [ ] `pm2 restart minds-worker` -- restart worker (schedules re-register)
4. [ ] Verify: `pm2 status` shows both online
5. [ ] Verify: `redis-cli ping` returns PONG
6. [ ] Trigger: `POST /api/admin/rankings/run-all` -- force fresh snapshots
7. [ ] Trigger: `POST /api/admin/score-recalc/run-all` -- force fresh scores
8. [ ] Trigger: `POST /api/admin/reviews/poll` -- force review sync
9. [ ] Wait 5 minutes, then check one customer's Home page -- do readings match Google?
10. [ ] Check one customer's Reviews page -- do reviews appear?

---

*If this runbook doesn't cover the incident, escalate to Claude Code (Level 1) with the error message and affected org ID.*
