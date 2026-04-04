# Product Operations Guide

> How the Alloro product works, what customers see, and why every decision was made.
> This is the source of truth for anyone building, reviewing, or explaining the product.
> Updated April 4, 2026.

---

## The Rule

Every number a customer sees must be verifiable by Googling it themselves. If they can disagree with it, it shouldn't be there. You can disagree with Google, but not with Alloro.

---

## 1. The Business Clarity Score (0-100)

### What It Is
A single number that tells a business owner how visible and healthy their online presence is. Modeled after credit scores (Credit Karma, FICO). People already know how to read a gauge with a number, a color, and contributing factors. We use that same pattern.

### How It's Calculated

Three contributing factors, each scored from public Google data:

| Factor | Max Points | Impact Level | What It Measures | How Customer Verifies |
|--------|-----------|-------------|-----------------|----------------------|
| Review Health | 33 | High | Rating, review count vs competitors, recency, response rate | Google the competitor, count the reviews |
| GBP Completeness | 33 | High | Phone, hours, website, photos, description present on GBP | Open their own Google Business Profile |
| Google Visibility | 34 | Medium | Search presence signals (photo count, activity, responses) | Check their GBP photos and responses |

**Total: 0-100.** Every input is publicly verifiable.

### Score Labels

| Range | Label | Gauge Color |
|-------|-------|-------------|
| 90-100 | Exceptional | Deep green |
| 75-89 | Strong | Green |
| 55-74 | Good | Yellow-green |
| 35-54 | Developing | Amber |
| 0-34 | Needs Attention | Red |

No shame. No anxiety. The score tells you where you are, not how to feel about it. "Your Starting Point" at signup, not "Needs Attention."

### Where the Weights Live

The `scoring_config` database table. Every weight is editable from the admin panel (`GET /api/admin/scoring-config`). Preview any change before saving (`POST /api/admin/scoring-config/preview` with `org_id` to see old vs new score). No code changes needed to adjust scoring.

The scoring engine (`src/services/clarityScoring.ts`) reads from the database with a 5-minute cache, falls back to hardcoded defaults if the table doesn't exist. This is the single source of truth. No other file calculates scores.

### Score Updates

- **At signup:** Calculated from checkup data (Places API snapshot at the time of the free checkup).
- **Weekly:** Recalculated every Sunday night with fresh Google Places data (`src/services/weeklyScoreRecalc.ts`). The recalc calls the same `calculateClarityScore()` function.
- **Manual:** Admin can force recalc via `POST /api/admin/score-recalc/run-now` with `{ org_id }`.

### What We Do NOT Show

- **Google search position numbers.** "#3 in West Orange" is unverifiable because the Places API returns different results than what the customer sees when they Google. We removed all "#X" position claims from every customer-facing surface: Home page, Compare page, Monday email, clean week email, action cards, notifications, snapshot bullets.
- **Fabricated dollar figures.** "348 more reviews = $X revenue" is projection, not data. Dollar figures only appear when backed by real data (PMS referral counts, GBP engagement metrics).

---

## 2. What the Customer Sees (Page by Page)

### Home Page ("Am I okay?")

The 3-second experience. Open. See. Know. Close.

**Layout (top to bottom):**
1. Greeting: "Good morning, Garrison." One sentence. Warm. Short.
2. Semi-circular gauge: Score number large in center, color-coded label below (Developing/Good/Strong/Exceptional), trend indicator (+X pts since last update), source line ("Based on public Google data, updated [date]").
3. Factor cards (up to 3): Each shows the factor name, impact level badge, verifiable data (review count, GBP fields, competitor name + count), and status color (green/yellow/red). Sub-score numbers only appear after the weekly recalc has run with the current algorithm.
4. One Action Card: The single most important thing. Navy background (#212D40). Specific headline, specific body, specific action button in terracotta (#D56753). Determined by the priority waterfall (see section 3).
5. Conditional elements: streak badges (when earned), milestone cards (when earned), billing prompts (max 2 visible at once).

**The credit score pattern:** People see a gauge, a number, factor cards with red/yellow/green, and specific actions to improve. They already know this from Credit Karma. No learning curve.

### Compare Page ("How do I compare?")

For the 20% who want to dig. One scrollable page, not tabs.

**Sections:**
1. Score + Score Improvement Plan: three specific actions with point values ("+8 pts, Easy, 10 minutes"). Same pattern as "Ways to improve your credit score."
2. Position Over Time: chart (shows after first week of tracking).
3. Competitors: named, tracked, with review counts. Customer can verify every number.
4. Referral Sources: who's sending, who stopped (when PMS data exists).
5. Score Simulator: "What if I add 10 reviews?" Interactive, shows projected impact.

### Reviews Page ("What are people saying?")

**Data source priority:**
1. `review_notifications` table (from review monitor polling, includes AI-drafted responses)
2. Fallback: `checkup_data.place.reviews` (from initial checkup)
3. Fallback: aggregate count + rating

**When AI drafts exist:** Each review card shows the review text + an AI-drafted response with "Approve and Post" and "Dismiss" buttons. Approving calls `PATCH /api/user/review-drafts/:id` which posts the response directly to Google via GBP API (`src/services/gbpReviewReply.ts`). This is the first DFY action.

### Presence Page ("What does my online presence look like?")

Shows what people see when they search for the business:
- Website status (live URL if PatientPath built one)
- GBP Profile Completeness (X/5 fields: phone, hours, website, photos, description)
- Quick facts (rating, review count)
- Focus keywords (SEO tracking)
- Compliance check (FTC-risky claims)

**Known issue (April 4):** Existing accounts from before this date may show "Missing: Phone" even when the GBP has a phone number. The checkup only stored 3 fields (rating, category, types) at signup. Fix applied for new signups. Existing accounts need the score recalc to run (which re-fetches Place data).

### Progress Report ("Am I getting better?")

365-day view. Tasks completed, reviews gained, revenue impact estimate, goal progress, key milestones, next 90 days. Shows "intelligence building" state for new accounts.

---

## 3. The One Action Card (Priority Waterfall)

Every customer sees exactly ONE recommended action. Selected deterministically by the first condition met:

| Priority | Condition | Example Headline |
|----------|-----------|-----------------|
| 1 (highest) | GP referral source silent 60+ days, 3+ prior referrals | "Dr. Torres sent you 12 referrals. They've been quiet for 67 days." |
| 2 | Review gap closeable in under 2 weeks at current velocity | "You're 4 reviews from passing Peluso." |
| 3 | Competitive landscape shifted (competitor gained ground) | "Peluso gained ground on you this week." |
| 4 | PatientPath website preview ready | "Your website is ready to review." |
| 0 (clear) | Nothing needs attention, market stable | "Your business is steady. Nothing needs you right now." |
| 5 (steady) | New account or insufficient data | Personalized based on weakest factor from checkup data |

**Rules:**
- Never claim a specific Google ranking position.
- Every headline names the specific competitor or referral source.
- Dollar figures only when backed by real data (PMS, GBP engagement).
- The "clear" state (priority 0) is the gift. It means the product is working and the owner can relax.

---

## 4. The Monday Email

### What It Is
The heartbeat. Every Monday at 7 AM local time. The product that comes to you. Per the Library Analogy: the Monday email IS the product. The dashboard is the reference library.

### Current State (DWY Mode)
Reports on data: review counts, competitor activity, market status. Three bullets of intelligence. One 5-minute fix action. Competitor tracking line.

### Target State (DFY Mode)
Receipt for work done: "This week: 1 GBP post published, 2 review responses posted. Here's what changed." The email shifts from "here's what you should do" to "here's what we did."

### Clean Week Email
When nothing significant moved: "Clean week. No competitor gained ground. Enjoy the week." Zero upsell. Zero action items. Pure relief. Will Guidara's unreasonable hospitality.

### What We Do NOT Include
- Position numbers ("#3 in your market"). Unverifiable.
- Fabricated dollar projections.
- Generic agency language ("optimize your online presence").
- Em-dashes (replaced automatically by `stripEmDashes()`).

---

## 5. The DFY Engine (What's Built vs What's Not)

The difference between a dashboard (DWY) and a product that improves your business (DFY).

| Action | Status | What It Does | Blocked By |
|--------|--------|-------------|------------|
| Review Response Posting | WIRED | Customer approves AI draft, response posts to GBP via OAuth | Needs first live test with real review |
| Instant Snapshot on Signup | WIRED | Fresh Google data 5 min after signup, not 6-day wait | Worker registered, needs Redis/BullMQ running |
| Welcome Intelligence Email | WIRED | Second "how did they know?" email 4 hours after signup | Worker registered, needs Redis/BullMQ running |
| Weekly Ranking Snapshot | WORKING | Sunday refresh of competitor data for all customers | Cron depends on Redis/worker process on EC2 |
| Weekly Score Recalculation | WORKING | Fresh score from current algorithm every Sunday | Same infrastructure dependency |
| Monday Email | WORKING | Sends weekly with market intelligence | Timezone-aware delivery partially implemented |
| GBP Post Publishing | NOT BUILT | Weekly AI-generated posts to customer's GBP | Google deprecated LocalPosts API. Alternative approach needed. |
| SEO Content Publishing | NOT BUILT | Bi-weekly FAQ/service pages on PatientPath site | Needs PatientPath + content pipeline |
| GBP Profile Optimization | NOT BUILT | Auto-fix missing descriptions, flag incomplete fields | Needs GBP write endpoints beyond review replies |

### The Chain
Snapshots (Sunday 6 PM ET) -> Score Recalc (Sunday 10 PM ET) -> Monday Email (Monday 7 AM local). Each step feeds the next.

### Infrastructure Dependency
BullMQ cron jobs require Redis + the minds-worker PM2 process running on EC2. If either is down, crons don't fire. Admin manual trigger endpoints (`/api/admin/score-recalc/run-now`, `/api/admin/rankings/run-now`) bypass BullMQ and call services directly.

---

## 6. Data Sources and Verification

| Data Point | Source | How Customer Verifies | Update Frequency |
|-----------|--------|----------------------|-----------------|
| Review count | Google Places API | Google the business | Weekly (snapshot) |
| Star rating | Google Places API | Google the business | Weekly (snapshot) |
| Competitor review count | Google Places API | Google the competitor | Weekly (snapshot) |
| Competitor name | Google Places API (first non-self result) | Google "[specialty] near [city]" | Weekly (snapshot) |
| GBP phone/hours/website | Google Places API | Check own GBP listing | At signup + weekly recalc |
| GBP photo count | Google Places API | Check own GBP listing | At signup + weekly recalc |
| Review text | GBP OAuth API (review_notifications) | Check own GBP reviews | Daily polling (when connected) |
| Website status | Internal (PatientPath) | Visit the URL | Real-time |

**No data point comes from a source the customer cannot verify themselves.**

---

## 7. Design Principles

### The Credit Score Pattern
Semi-circular gauge, large number, color-coded label, contributing factor cards, trend indicator, source attribution, specific improvement actions with estimated impact. Hundreds of millions of people already know this pattern.

### The Recipe
One finding. One dollar figure (when real). One action. Named specifically. Plain English. No hedging. No jargon.

### The Test
"Would a tired, mildly anxious, skeptical business owner at 10pm understand this immediately and know exactly what to do next?"

### The Apple Principle
Radical reduction. Score occupies the hero position. Instant comprehension. Warm off-white (#F8F6F2) background, never pure white. Max 2 temporary prompts visible at once.

### Brand Constants
- Terracotta: #D56753 (CTAs, accents)
- Navy: #212D40 (action card background only, never text)
- Text: #1A1D23 (never #212D40)
- Background: #F8F6F2 (warm off-white)
- Min font: text-xs (12px)
- Max weight: font-semibold
- No em-dashes anywhere

---

## 8. Admin Operations

### Score Management
- View all weights: `GET /api/admin/scoring-config`
- Edit weights: `PUT /api/admin/scoring-config`
- Preview impact: `POST /api/admin/scoring-config/preview` with `{ org_id, proposed: { key: value } }`
- Force recalc one org: `POST /api/admin/score-recalc/run-now` with `{ org_id }`
- Force recalc all: `POST /api/admin/score-recalc/run-all`

### Rankings
- Refresh one org: `POST /api/admin/rankings/run-now` with `{ org_id }`
- Refresh all: `POST /api/admin/rankings/run-all`
- HQ "Refresh All Rankings" button triggers run-all

### Reviews
- Poll all practices: `POST /api/admin/reviews/poll`
- Poll single practice: `POST /api/admin/reviews/poll/:placeId`

### Monday Email
- Send for one org: `POST /api/admin/monday-email/run-now` with `{ org_id }`
- Send for all: `POST /api/admin/monday-email/run-all`

---

## 9. Key Decisions and Why

| Decision | Why | Date |
|----------|-----|------|
| Removed all "#X" position claims | Places API rank doesn't match Google Search. Customer can disprove in 10 seconds. Trust destroyed. | April 4, 2026 |
| One scoring algorithm (clarityScoring.ts) | Duplicate in batchCheckup.ts produced different scores. Two sources of truth = confusion. | April 4, 2026 |
| Scoring weights in database, not code | At 10,000 customers, changing a weight shouldn't require a deploy. Admin preview shows impact before saving. | April 4, 2026 |
| Credit score gauge pattern | Hundreds of millions already know how to read it. Zero learning curve. | April 4, 2026 |
| Factor cards show verifiable data, not sub-scores | Sub-score numbers are algorithm output customers can't verify. Review counts and GBP fields are facts. | April 4, 2026 |
| "Outranking" replaced with "more visible on Google" | "Outranking" implies we know the ranking. We don't. Visibility is based on verifiable GBP completeness. | April 4, 2026 |
| Review replies post to Google on approval | First DFY action. Customer approves, response appears on their listing. "How did they do that?" | April 4, 2026 |
| Monday email is a receipt, not advice | DWY mode: "here's what you should do." DFY mode: "here's what we did." Receipt > recommendation. | April 3, 2026 |
| No fabricated dollar figures | "348 reviews = $X" is projection. Dollar figures only from real data (PMS referrals, GBP engagement). | April 3, 2026 |
| Clean week email is a gift, not a gap | Nothing to report means the product is working. "Enjoy the week." Zero upsell. | April 3, 2026 |

---

*This document is the source of truth for how the Alloro product operates. If code contradicts this document, the code is wrong. Updated by Corey Wise and Claude, April 4, 2026.*
