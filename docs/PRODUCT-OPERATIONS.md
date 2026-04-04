# Alloro Product Constitution

> The Knowns. If these are followed, the product works. Everything else is a variable.
> If code contradicts this document, the code is wrong.
> If a Known needs to change, it requires an override: name, date, reason.

---

## How to Read This Document

Every section is a **Known**: a locked decision with a test that proves it's being followed.

- **Rule**: What must be true. One sentence.
- **Test**: How to verify in under 30 seconds.
- **Violation**: What it looks like when broken, so you recognize it instantly.
- **Locked**: Date and who locked it.
- **Override requires**: Who must approve changing this.

Anyone (Claude, Dave, Jo, a new hire) can open this document, run the tests, and know whether the product is in compliance.

---

## Part 1: The Absolutes

These never bend. No exceptions. No "just this once."

### Known 1: Every customer-facing number is verifiable

**Rule:** Every number a customer sees can be confirmed by Googling it themselves. You can disagree with Google, but not with Alloro.

**Test:** Pick any number on any customer-facing page. Google it. It matches.

**Violation:** Customer sees "72 reviews" but Google shows 68. Customer sees "#3 in West Orange" but Google shows #4. Customer sees a score of 90 when their reviews are red and GBP is incomplete.

**Locked:** April 4, 2026, Corey Wise.
**Override requires:** Corey only.

---

### Known 2: One scoring algorithm

**Rule:** Every score in the system traces to `calculateClarityScore()` in `src/services/clarityScoring.ts`. No other file calculates scores. No duplicates. No shortcuts.

**Test:** `grep -r "computeScore\|calculateScore\|rankScore.*=" src/ --include="*.ts"` returns only clarityScoring.ts and its callers.

**Violation:** A second scoring function exists somewhere. Two customers with identical data get different scores. The checkup produces a number that the weekly recalc disagrees with.

**Locked:** April 4, 2026, Corey Wise.
**Override requires:** Corey only.

---

### Known 3: No position claims

**Rule:** No customer-facing surface displays a Google search position number. Not "#3." Not "You rank #3 of 12." Not "outranking." The Places API rank does not match what the customer sees on Google.

**Test:** Search all customer-facing code for `#\${` combined with position/rank. Search emails for "#" followed by a number in ranking context. Zero results.

**Violation:** Monday email says "You're #3 in your market." Action card says "outranking." Home page shows "#1 in West Orange."

**Locked:** April 4, 2026, Corey Wise.
**Override requires:** Corey only. Requires a new, verified data source that matches Google Search results.

---

### Known 4: No fabricated dollar figures

**Rule:** Dollar figures only appear when backed by real data. PMS referral counts, GBP engagement metrics, verified case values. Never from projections ("348 reviews = $X revenue").

**Test:** Find every dollar figure in customer-facing output. Trace it to a real data source. If the source is a formula with assumptions, it's fabricated.

**Violation:** Monday email says "The gap represents $52,000 in annual revenue at risk" based on a review count projection, not real revenue data.

**Locked:** April 3, 2026, Corey Wise.
**Override requires:** Corey only.

---

### Known 5: The Recipe

**Rule:** Every customer-facing finding follows the Recipe: one finding, one dollar figure (when real), one action. Named specifically (not "a competitor" but "Peluso Orthodontics"). Specific numbers. Plain English. No hedging. No jargon.

**Test:** Read any action card, email bullet, or dashboard finding. Does it name names? Does it use specific numbers? Would a tired business owner at 10pm understand it immediately?

**Violation:** "Consider improving your online presence." "A competitor has more reviews." "Revenue may be at risk." Anything generic, unnamed, or hedged.

**Locked:** March 25, 2026, Corey Wise.
**Override requires:** Corey only.

---

### Known 6: The credit score pattern

**Rule:** The Business Clarity Score (0-100) is displayed as a semi-circular gauge with color gradient, large number, plain-English label, contributing factor cards with verifiable data, trend indicator, and source attribution. This is the pattern hundreds of millions of people already know from Credit Karma.

**Test:** Open the Home page. Can you read the score in under 1 second? Do the factor cards show data you can verify by Googling? Is there a trend indicator? Does it say where the data comes from?

**Violation:** Score displayed as plain text with no context. No factor breakdown. No way to understand why the number is what it is. Customer sees 90 and has no idea what it means.

**Locked:** April 4, 2026, Corey Wise.
**Override requires:** Corey only.

---

### Known 7: Factor cards show verifiable facts, not algorithm output

**Rule:** Factor cards display data the customer can check (review count, competitor count, GBP fields complete). Sub-score numbers (21/33) only appear after the current algorithm has calculated them. Status colors (red/yellow/green) derive from verifiable data (review count vs competitor, GBP fields out of 5), not from algorithm sub-scores.

**Test:** Look at any factor card. Can the customer verify every piece of information shown? Is the red/yellow/green based on something they can see on Google?

**Violation:** Factor card shows "Review Health: 35/33" (score from old algorithm exceeding max). Status shows green but competitor has 5x more reviews. Numbers from different algorithms mixed on the same screen.

**Locked:** April 4, 2026, Corey Wise.
**Override requires:** Corey only.

---

### Known 8: Monday email is the product

**Rule:** The Monday email IS the product. The dashboard is the reference library. The email comes to you. You don't go to it. DWY mode: "here's what you should know." DFY mode: "here's what we did." The email shifts from advice to receipt as the DFY engine activates.

**Test:** Read the Monday email without logging into the dashboard. Do you know the state of your business? Do you know what Alloro did? Do you know if anything needs your attention?

**Violation:** Email says "log in to see your results." Email requires the dashboard to be useful. Email is generic and could apply to any business.

**Locked:** April 3, 2026, Corey Wise.
**Override requires:** Corey only.

---

### Known 9: Clean week is a gift

**Rule:** When nothing needs attention, the Monday email says so. "Clean week. No competitor gained ground. Enjoy the week." Zero upsell. Zero action items. This is Will Guidara's unreasonable hospitality. A coffee brought without asking.

**Test:** Read the clean week email. Does it try to sell anything? Does it create anxiety? Does it make the owner feel good about their life?

**Violation:** Clean week email includes "but you could improve by..." or "consider upgrading to..." or any action item. The clean week is not a sales opportunity.

**Locked:** April 3, 2026, Corey Wise.
**Override requires:** Corey only.

---

### Known 10: Scoring weights live in the database

**Rule:** All scoring weights are stored in the `scoring_config` database table, editable from admin without code changes. Preview shows old vs new score before saving. At 10,000 customers, changing a weight should not require a deploy.

**Test:** `GET /api/admin/scoring-config` returns all weights. `POST /api/admin/scoring-config/preview` with `{ org_id }` shows projected impact. No scoring weights are hardcoded without a database fallback.

**Violation:** A weight change requires editing clarityScoring.ts, committing, deploying. Changing one number requires a developer.

**Locked:** April 4, 2026, Corey Wise.
**Override requires:** Corey only.

---

## Part 2: The Three Factors

The Business Clarity Score is the sum of three factors. Each must be independently verifiable.

### Factor 1: Review Health (0-33, High Impact)

**What it measures:** Star rating, review count relative to competitors and specialty benchmarks, recency of reviews, review response rate.

**What the customer sees:** "72 reviews at 5 stars" with "Peluso has 420."

**How they verify:** Google their business. Google the competitor. Count the reviews. Check the stars.

**Status color logic:** Green if review count >= competitor's. Yellow if >= 50% of competitor's. Red if less than 50%.

---

### Factor 2: GBP Completeness (0-33, High Impact)

**What it measures:** Five fields present on Google Business Profile: phone, hours, website, photos, description.

**What the customer sees:** "2/5 fields complete. Missing: hours, phone, description."

**How they verify:** Open their Google Business Profile. Check each field.

**Status color logic:** Green if 4-5 complete. Yellow if 2-3 complete. Red if 0-1 complete.

---

### Factor 3: Google Visibility (0-34, Medium Impact)

**What it measures:** Search presence signals derived from photo count, review response activity, posting frequency, and website presence.

**What the customer sees:** "Strong search presence" / "Moderate search presence" / "Low search visibility."

**How they verify:** Check their GBP photos, responses, and posts.

**Status color logic:** Green if score >= 23. Yellow if >= 12. Red if below 12.

**Note:** This factor is hidden until the current scoring algorithm has run (weekly recalc). It does NOT show a Google search position number (see Known 3).

---

### Score Labels

| Range | Label | Gauge Color | What It Means |
|-------|-------|-------------|--------------|
| 90-100 | Exceptional | Deep green | Top of market across all three factors |
| 75-89 | Strong | Green | Ahead of most competitors |
| 55-74 | Good | Yellow-green | Competitive, room to improve |
| 35-54 | Developing | Amber | Gaps in one or more factors |
| 0-34 | Needs Attention | Red | Significant gaps, competitors are ahead |

---

## Part 3: The One Action Card

The single most important piece of intelligence on the Home page. One card. One action. Selected by the first condition met in this waterfall:

| Priority | Trigger | What They See | Why This Order |
|----------|---------|--------------|---------------|
| 1 | Referral source silent 60+ days (3+ prior referrals) | "Dr. Torres sent you 12 referrals. Quiet for 67 days." | Revenue at risk. Named. Dollar figure real (from PMS). |
| 2 | Review gap closeable in under 2 weeks | "You're 4 reviews from passing Peluso." | Achievable. Motivating. Verifiable. |
| 3 | Competitor gained ground this week | "Peluso gained ground on you this week." | Market moved. Urgency is real. |
| 4 | PatientPath website preview ready | "Your website is ready to review." | DFY action completed. Owner sees the result. |
| 0 | Nothing needs attention | "Your business is steady. Nothing needs you right now." | The gift. The product is working. Relax. |
| 5 | New account / insufficient data | Personalized from weakest checkup factor | First impression. Specific to their data. |

**Rules for every action card:**
- Names the specific competitor, referral source, or data point. Never generic.
- Dollar figures only from real data (Known 4).
- No position claims (Known 3).
- The "clear" state (priority 0) is not a failure. It is the product working perfectly.

---

## Part 4: The DFY Engine

What Alloro does FOR the customer, not just what it tells them.

### Current State

| Action | Status | What Happens | Customer Verification |
|--------|--------|-------------|----------------------|
| Review response posting | WIRED | Customer approves AI draft, posts to GBP | Google their reviews, see the response |
| Instant snapshot on signup | WIRED | Fresh data 5 min after account creation | Score and factors appear on first login |
| Welcome intelligence email | WIRED | Second surprise 4 hours after signup | Check inbox |
| Weekly snapshot | WORKING | Sunday refresh of all competitor data | Monday email reflects current reality |
| Weekly score recalc | WORKING | Fresh score from current algorithm | Score changes week to week |
| Monday email | WORKING | Weekly intelligence delivery | Check inbox Monday 7 AM |
| GBP post publishing | NOT BUILT | Weekly AI posts to customer's GBP | Blocked: Google deprecated LocalPosts API |
| SEO content publishing | NOT BUILT | Bi-weekly pages on PatientPath site | Needs content pipeline |
| GBP profile optimization | NOT BUILT | Auto-fix missing descriptions/fields | Needs GBP write endpoints |

### The Chain

```
Sunday 6 PM ET: Ranking snapshots refresh (all customers)
    ↓
Sunday 10 PM ET: Scores recalculate with fresh data
    ↓
Monday 7 AM local: Email delivers with current intelligence
```

### Infrastructure Reality

BullMQ crons require Redis + minds-worker PM2 process on EC2. If either is down, nothing fires. Admin endpoints bypass this:
- `POST /api/admin/score-recalc/run-now` (one org)
- `POST /api/admin/score-recalc/run-all` (all orgs)
- `POST /api/admin/rankings/run-now` (one org)
- `POST /api/admin/rankings/run-all` (all orgs)
- `POST /api/admin/monday-email/run-now` (one org)
- `POST /api/admin/monday-email/run-all` (all orgs)
- `POST /api/admin/reviews/poll` (all practices)

---

## Part 5: The Pages

Five pages. Five questions. One product.

| Page | Question | What They See | What's Verifiable |
|------|----------|--------------|------------------|
| Home | "Am I okay?" | Gauge + factors + one action | Every number Googleable |
| Compare | "How do I compare?" | Score plan + competitors + simulator | Competitor names and review counts |
| Reviews | "What are people saying?" | Individual reviews + AI response drafts | Their own Google reviews |
| Presence | "What does my presence look like?" | Website + GBP completeness + keywords | Their own GBP listing |
| Progress | "Am I getting better?" | 365-day view, milestones, trajectory | Review count growth over time |

---

## Part 6: Design Knowns

### Known 11: Warm, not clinical

**Rule:** Background is #F8F6F2 (warm off-white). Never pure white. Never cold blue. The product feels like a private study, not a hospital dashboard.

**Test:** Take a screenshot. Does it feel warm? Would you show it at a dinner party?

**Violation:** Pure white background. Blue-gray enterprise aesthetic. Cold, clinical feel.

---

### Known 12: Brand constants

**Rule:**
- Terracotta #D56753: CTAs and accents only
- Navy #212D40: Action card background only, NEVER text color
- Text: #1A1D23 always
- Minimum font: text-xs (12px). Never text-[10px] or text-[11px].
- Maximum weight: font-semibold. Never font-black or font-extrabold.
- No em-dashes. Anywhere. Ever.

**Test:** `grep -r "font-black\|font-extrabold\|text-\[10px\]\|text-\[11px\]"` in frontend/src returns zero. `grep -r "text-\[#212D40\]"` in customer-facing components returns zero.

**Violation:** Navy text on a page. 10px fine print. Bold headlines screaming.

---

### Known 13: Max 2 temporary prompts

**Rule:** The Home page shows at most 2 conditional/temporary elements (billing prompt, milestone card, onboarding). The core experience (gauge + factors + action card) is always visible. Temporary prompts never push core content below the fold.

**Test:** Count visible prompts on the Home page. Never more than 2.

**Violation:** Three banners stacked above the gauge. Score pushed off screen by notifications.

---

## Part 7: Data Sources

Every data point has a source and a verification method.

| Data | Source | Customer Verifies By | Updates |
|------|--------|---------------------|---------|
| Review count | Google Places API | Googling their business | Weekly |
| Star rating | Google Places API | Googling their business | Weekly |
| Competitor review count | Google Places API | Googling the competitor | Weekly |
| Competitor name | Google Places API | Googling "[specialty] near [city]" | Weekly |
| GBP phone/hours/website | Google Places API | Checking their GBP listing | Weekly |
| GBP photo count | Google Places API | Checking their GBP listing | Weekly |
| Individual review text | GBP OAuth (review_notifications) | Checking their GBP reviews | Daily |
| Website status | Internal (PatientPath) | Visiting the URL | Real-time |

**No data comes from a source the customer cannot verify themselves.**

---

## Part 8: Key Decisions Log

Every locked decision with the reasoning. If someone asks "why," point them here.

| # | Decision | Why | Locked | By |
|---|----------|-----|--------|-----|
| 1 | No position claims | Places API != Google Search. Disproved in 10 seconds. | Apr 4 2026 | Corey |
| 2 | One scoring algorithm | Two algorithms = two scores = confusion | Apr 4 2026 | Corey |
| 3 | Weights in database | 10,000 customers, no deploys for tuning | Apr 4 2026 | Corey |
| 4 | Credit score gauge | Zero learning curve, billions of prior impressions | Apr 4 2026 | Corey |
| 5 | Verifiable factors only | If they can't Google it, don't show it | Apr 4 2026 | Corey |
| 6 | "More visible" not "outranking" | Can't claim ranking we can't prove | Apr 4 2026 | Corey |
| 7 | Review replies as first DFY | Verifiable: they see the response on Google | Apr 4 2026 | Corey |
| 8 | Email is receipt not advice | "Here's what we did" > "here's what you should do" | Apr 3 2026 | Corey |
| 9 | No fabricated dollar figures | Projections aren't data | Apr 3 2026 | Corey |
| 10 | Clean week is a gift | Not a sales opportunity. Pure relief. | Apr 3 2026 | Corey |

---

## How to Use This Document

**Before building:** Read the relevant Knowns. Write a Customer Reality Check that references them. If your build would violate a Known, stop.

**Before committing:** Check each Known your changes touch. Run the test. If it fails, fix it before pushing.

**Before handing off:** Point to this document. The receiver reads it and knows exactly how the product is intended to work and what tests to run.

**To change a Known:** Write the proposed change, the reason, and get the override approval listed in that Known. Add the old decision and the new one to the Key Decisions Log with dates. Knowns are constitutional. They don't change casually.

---

*Alloro Product Constitution. Authored by Corey Wise. Built by Claude. April 4, 2026.*
*If code contradicts this document, the code is wrong.*
