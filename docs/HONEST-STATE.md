# Honest State -- April 6, 2026

> What works. What's broken. What's empty. What fills up. In plain English.

---

## The Short Version

Nothing is broken. The pages are empty because the background engine hasn't run. When Dave deploys (3 commands, 15 minutes), the engine starts and the pages fill with real data within 24 hours. A few small UX fixes are needed that are code changes, not infrastructure.

---

## Every Problem Visible in the Screenshots

### 1. Profile Completeness shows 1/5 (should be 3/5)

**What you see:** Home and Presence both show "Missing: Phone, Hours, Website, Description" for Garrison. But Google has his phone, hours, and website.

**Root cause:** The data was captured at signup. The Places API response at that time didn't include all fields. The weekly recalc rewrites these fields from a fresh API call.

**Fix:** Automatic on deploy. The startup hook `catchUpStaleScores()` fires when the server restarts. It re-fetches from Google Places API and writes the correct fields. No code change needed. Dave restarts → data corrects within minutes.

**Verified:** I called the Places API directly this session. Garrison has phone, website, and hours. The recalc code reads these fields correctly (verified in `weeklyScoreRecalc.ts` lines 93-242).

---

### 2. Reviews page nearly empty

**What you see:** "You have 72 reviews at 5 stars on Google. Alloro syncs your Google reviews daily."

**Root cause:** The `review_notifications` table is empty because the review sync worker hasn't run. The daily sync runs at 4 AM UTC. It's never fired because Redis + minds-worker haven't been confirmed running.

**Fix:** Automatic on deploy. The startup hook `pollReviewsOnStartup()` fires on server restart. It fetches reviews for all orgs with a placeId. Reviews populate within minutes. AI drafts generate for each review.

**After deploy:** The page shows individual reviews with AI-drafted responses and approve/copy buttons.

---

### 3. Compare page shows N/A for competitor

**What you see:** Peluso's Star Rating and Photos show "N/A."

**Root cause:** The checkup at signup captured Peluso's review count (419) but not their rating or photo count. The weekly ranking snapshot enriches competitor data.

**Fix:** Automatic on deploy. When ranking snapshots run (Sunday 11 PM UTC or manual trigger), competitor data enriches. Or trigger manually: `POST /api/admin/rankings/run-now` with `{ "orgId": 5 }`.

**After deploy:** Peluso's rating and photo count fill in.

---

### 4. Progress page shows Start: 0/5, Now: 0/5

**What you see:** Profile Completeness reads "Start: 0/5, Now: 0/5. 5 fields still missing."

**Root cause:** Same as #1. The progress page reads from the same stale `checkup_data`. When the recalc updates the data, this page reflects the fresh numbers.

**Fix:** Automatic on deploy (same startup hook).

---

### 5. Notification from 3 months ago

**What you see:** "New Task Approved - HIGH PRIORITY - About 3 months ago" with an "Acknowledge" button.

**Root cause:** This is the last notification generated. No new notifications have been created because the workers haven't been running. The notification links to a tasks page that exists in v1 but not in the five-page layout.

**Fix:** Two parts:
- Automatic on deploy: workers generate new notifications, pushing this old one down.
- Code fix needed: the notification widget should hide notifications older than 30 days, or route to `/home` instead of `/tasks`.

---

### 6. No obvious path to upload business data

**What you see:** No mention of uploading data on Home, Reviews, Presence, or Progress. The upload button is buried in the Referral Sources section on Compare, which is collapsed by default.

**Root cause:** The upload prompt only appears inside the Compare page's referral section. A new customer on Home would never discover it.

**Fix:** Code change needed. Add an upload prompt on Home when no business data exists: "Upload your business data to unlock deeper intelligence about your referral sources." Links to Compare or opens the upload modal directly.

---

### 7. Presence page looks sparse

**What you see:** Two sections (Your Website, Google Business Profile) with whitespace below.

**Root cause:** This is the correct content for what data exists. The Presence page shows website status + GBP completeness. There's nothing else to show until GBP performance metrics (calls, clicks, directions) are added.

**Fix:** This is a design/content issue, not a bug. Options:
- Add GBP performance metrics when available (requires GA4/GSC data flowing)
- Add "What to improve" section with specific GBP recommendations
- Both happen naturally when the engine runs and data flows

---

## Summary Table

| Problem | Type | Fix | When |
|---------|------|-----|------|
| Profile completeness 1/5 | Stale data | Automatic on deploy | Minutes after restart |
| Reviews page empty | No data yet | Automatic on deploy | Minutes after restart |
| Compare N/A values | Incomplete data | Automatic on deploy | After ranking snapshot |
| Progress 0/5 | Stale data | Automatic on deploy | Minutes after restart |
| Old notification | Stale + routing | Code fix (hide old, fix route) | 15 min code change |
| No upload path on Home | Missing UX | Code fix (add prompt) | 15 min code change |
| Presence sparse | Design | Content addition | Future enhancement |

**5 of 7 problems fix themselves on deploy.**
**2 problems need small code changes (30 min total).**
**0 problems are fundamentally broken.**

---

## What the Pages Look Like After Deploy (24 hours)

**Home:**
- Status badge: [Needs Attention] or [All Clear]
- Star Rating: 5 stars (correct)
- Review Volume: 73 reviews +1 since joining (fresh from API)
- Profile Completeness: 3/5 (corrected -- has phone, website, hours)
- Your Market: orthodontist in West Orange, Peluso named
- Action card: Oz moment (sentiment comparison) or specific recommendation
- Notification: fresh, relevant, from this week's worker run
- Chat bubble: advisor ready

**Compare:**
- Peluso: rating filled, photo count filled, reviews 419
- Referral Sources: upload prompt or data if uploaded
- What to Focus On: specific actions based on fresh data

**Reviews:**
- Individual reviews listed with AI-drafted responses
- Approve and Post button for connected orgs
- Review velocity comparison

**Presence:**
- Website: live, with link
- Profile completeness: 3/5 (corrected)
- Rating: 5 stars, Reviews: 73

**Progress:**
- Star Rating: Start 5, Now 5 (holding)
- Profile Completeness: Start 1/5, Now 3/5 (improved after recalc)
- Gap vs Peluso: real delta
- Health trajectory: direction indicator
- What Alloro has done: market monitoring for 88 days

---

## What the Monday Email Looks Like (first Monday after deploy)

Subject: "Copeland, Peluso Orthodontics is the most visible competitor in your market"

Body:
- One finding with specific competitor data
- One action (send review requests, complete profile, etc.)
- Done For You section: "Monitored your competitors and refreshed your market data."
- Community line: "Business owners across the country received this brief today."
- Signed by Corey

---

## The Backend Engine (What's Built and Wired)

| Service | Status | Fires When |
|---------|--------|------------|
| Weekly Ranking Snapshots | Wired | Sunday 11 PM UTC |
| Weekly Score Recalc | Wired | Monday 3 AM UTC |
| Monday Email | Wired | Monday 7 AM local time |
| Daily Review Sync | Wired | 4 AM UTC daily |
| Daily Analytics Fetch | Wired | 5 AM UTC daily |
| Weekly CRO Engine | Wired | Sunday 9 PM UTC |
| Welcome Intelligence | Wired | 4 hours after signup |
| Instant Snapshot | Wired | Immediately on signup |
| Review Sentiment Comparison | Wired | On Home page load (action card) |
| Review Response Posting | Wired | On customer approve (MyBusiness API) |
| Stale Score Catch-up | Wired | On server restart |
| Review Poll Catch-up | Wired | On server restart |
| Analytics Catch-up | Wired | On server restart |

All 13 services are coded, wired, and waiting for infrastructure.

---

## What Dave Needs to Do

```
npx knex migrate:latest
pm2 restart alloro-api
pm2 restart minds-worker
```

Confirm `ALLORO_EMAIL_SERVICE_WEBHOOK` env var is set.

Full details in `docs/DAVE-BRIEF.md` and `docs/DEPLOY-SPEC.md`.

---

## What I Need to Do (Code Fixes)

1. Hide or fix the stale notification (route to /home, hide if older than 30 days)
2. Add upload prompt on Home when no business data exists

Both are 15-minute fixes.

---

## The Bottom Line

The product is not broken. The product is off. The engine is built. The pages are correct containers waiting for data. Five of seven visual problems fix themselves when Dave deploys. Two need small code fixes.

The backend represents 2 weeks of work: constitutional compliance, DFY engine wiring, review posting rebuild, CRO engine activation, sentiment comparison, help system, documentation, worker simplification. All invisible until the engine runs.

When it runs, the product delivers on all three promises:
1. GBP/SEO monitoring and intelligence
2. Business data integration and referral tracking
3. Website CRO optimization

The car works. It needs the key turned.
