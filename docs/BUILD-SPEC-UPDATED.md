# Alloro Master Build Spec -- Updated April 3, 2026

> **Original:** March 23, 2026 (Notion HQ). Five specs.
> **This update:** Incorporates everything established April 2-3 across all sessions.
> **What changed:** Spec 2 simplified to minivan dash. Dollar figure rule corrected. Spec 6 added (DFY Engine). Owner.com model integrated. Knowns validated against real customer data.
> **What didn't change:** The Recipe, the North Stars, Spec 1 (Checkup), Spec 3 (Monday Email), Spec 4 (PatientPath), Spec 5 (HQ). These are solid.

---

## The Foundation (Unchanged, Locked)

Read RECIPE.md first. It governs every output.

**DWY -- Done With You.** The blood panel read back in plain English. Function Health for your business. Yuka for every business decision. Scan your data, see red/orange/green, know what to do. Not a dashboard. A diagnosis.

**DFY -- Done For You.** The GLP-1. The agency replacement. The better mousetrap. Alloro actively improves your online presence while you do root canals. Website built. GBP managed. SEO running. Review responses posted. The owner doesn't learn SEO. They see results.

**Together:** Saved money (replaced the agency). Visible improvement (Google yourself and see it). Clarity (understand why). Confidence (someone is watching). The owner didn't change their behavior. The weight just started coming off.

**The tribe:** Local service businesses whose customers find them on Google.

**The better mousetrap:** Business owners already pay agencies $2-5K/month for work they can't verify. Alloro does the same work, costs less, and results are verifiable. Same buying motion. Better outcome.

---

## What Changed From the Original Spec

### 1. Dashboard (Spec 2) -- Simplified to Minivan Dash

The original spec had 6 sidebar items, a competitor leaderboard, sub-score bars, gap-closing timeline calculations, and detailed stage-based layouts. That's a cockpit for a pilot. The ICP is a mom driving a minivan.

**Updated principle:** The dashboard shows three things. Speed (your position). Fuel (your score). Engine light (anything that needs attention). If no engine light, the dash is calm. You glance. You know. You drive.

**What stays:** Practice Health Score. One finding if there is one. Silence if there isn't. Competitor leaderboard (named, not numbered). PatientPath breadcrumb.

**What moves behind a tap:** Sub-score breakdowns. Gap-closing timelines. Historical charts. Referral matrices. Score simulator. These exist for the 20% who want to dig. Not on the main screen.

**What's cut:** Growth mode toggle. Streak badges. Activity feed. 28 cards competing for attention. Mode switching. Everything that makes it feel like a gym instead of a scoreboard.

**Navigation:** 5 icons. Home (am I okay), Compare (how do I compare), Reviews (what are people saying), Presence (what does my online presence look like), Settings (touch once, forget). Not a sidebar with 12 items.

### 2. Dollar Figure Rule -- Corrected

**Original:** "One finding. One dollar figure. One action."

**Updated:** One finding. One dollar figure WHEN THE DATA IS REAL. One action.

Dollar figures come from:
- PMS referral data: "Heart of Texas sent 60 referrals. At $5,500 average case value, that's $330,000." REAL. Use it.
- GBP engagement data: "23 calls from Google this month, up from 14." REAL. Use it.

Dollar figures do NOT come from:
- Review gap projections: "348 more reviews = $X in revenue." FABRICATED. Don't use it.
- Ranking position projections: "Moving from #4 to #2 = $X." FABRICATED. Don't use it.

When there's no real dollar figure, the finding stands on its own: "Peluso has 348 more reviews than you. When a parent searches, they see that gap." Undeniable without a dollar sign.

### 3. Score Labels -- Updated

Original: Below 60 "Needs Attention," 60-79 "Room to Grow," 80-100 "Strong Position."

Updated: Below 60 "Your Starting Point," 60-79 "Building Momentum," 80-100 "Strong Position."

No shame. No anxiety. The score tells you where you are, not how to feel about it.

### 4. Checkup Gate -- Noted for Review

The gate (email + password at score reveal) creates friction at the moment of highest curiosity. Owner.com delivers value before asking for payment. The gate may need to move later in the flow (after showing all findings, not after showing 2). This is a conversion optimization decision, not a spec change. Test both.

### 5. GBP Connection -- Not Required for Value

The original dashboard spec has two states: "GBP Not Connected" and "GBP Connected." Public data from Google Places is sufficient to show position, competitors, reviews, and score. GBP OAuth adds: GBP posts, review responses, performance data (calls/clicks/directions). The dashboard should deliver value from public data on day 1. GBP connection enhances it, not gates it.

---

## Spec 6: The DFY Engine (NEW)

### What This Is

The thing that runs every week, for every customer, whether or not they log in. The GLP-1. The agency replacement. The reason the Monday email has something to report.

Without this spec, Alloro is a dashboard that shows you data. With this spec, Alloro is a product that improves your business.

### Prerequisites

- GBP OAuth connected (for write access to their Google Business Profile)
- PatientPath website live (for SEO/AEO content publishing)
- Organization active (not cancelled, not paused)

### Weekly Automated Actions

**Action 1: GBP Post (Weekly)**

Trigger: Every Tuesday at 10 AM local time (staggered by org to avoid rate limits).

Content source: AI-generated from the business's recent reviews, services, and seasonal context. Each post highlights something real about the practice. Not generic. Not templated across practices.

Good: "Patients this month praised Dr. Garrison's gentle approach with nervous kids. If your child needs braces, you're not alone in feeling anxious about it."

Bad: "Visit us for all your orthodontic needs! We offer braces and Invisalign."

Format: 150-300 words. One photo from GBP library (select highest quality). Link to PatientPath website or booking URL.

Publishing: Google Business Profile API, `accounts.locations.localPosts` endpoint. OAuth required.

Verification: After publishing, confirm post appears on GBP. Log to behavioral_events as `dfy.gbp_post_published`.

**Action 2: Review Response Drafting (Continuous)**

Trigger: New review detected via GBP API polling (daily check).

Process:
1. AI drafts a response using the review text, rating, and practice context
2. For 4-5 star reviews: auto-post the response (owner pre-approved this category during GBP connection)
3. For 1-3 star reviews: draft saved, owner notified via Monday email ("1 review response needs your approval"), one-tap approve in dashboard
4. Response follows practice voice (warm, professional, specific to what the reviewer mentioned)

Good: "Thank you, Sarah. We're glad the procedure went smoothly and that you felt comfortable throughout. We'll see you at your follow-up."

Bad: "Thank you for your kind review! We appreciate your feedback."

Publishing: Google Business Profile API, `accounts.locations.reviews.updateReply` endpoint.

Verification: Log to behavioral_events as `dfy.review_response_posted` or `dfy.review_response_drafted`.

**Action 3: SEO/AEO Content Publishing (Bi-weekly)**

Trigger: 1st and 15th of each month.

Content: AI-generated FAQ page or service page published to PatientPath website. Topics derived from:
- Keywords patients actually search (inferred from specialty + location)
- Competitor content gaps (what competitors rank for that this practice doesn't)
- Seasonal relevance (back-to-school for orthodontists, etc.)

Format: One page. 500-800 words. Schema markup (FAQ structured data for AEO). Published to PatientPath site automatically.

Verification: Page live, indexed check after 48 hours. Log as `dfy.seo_content_published`.

**Action 4: GBP Profile Monitoring and Optimization (Weekly)**

Trigger: Every Sunday at 6 AM (before weekly ranking snapshot).

Checks:
- Hours still accurate (compare to last known)
- Photos count (flag if below 8)
- Description exists and is optimized
- Services list complete
- Categories correct

Actions (automatic, no owner approval needed):
- If description is missing or generic, generate and publish an optimized one
- If categories are incomplete, suggest additions (owner approves)
- If hours are missing for a day, flag in Monday email

Verification: Log changes as `dfy.gbp_profile_updated`.

**Action 5: Competitive Position Tracking (Weekly)**

Trigger: Every Sunday at 11 PM (existing weekly snapshot cron).

Process: Already built. Query Google Places for the practice's keywords. Record position. Compare to previous week. Identify competitor movements.

Output: Feeds Monday email and dashboard. "You held #2. Caswell moved from #5 to #3."

This is the ONE action that already works and should be verified first.

### What the DFY Engine Does NOT Do

- Send review requests to patients (no access to patient data, HIPAA)
- Modify the practice's actual Google ranking (that's Google's algorithm; Alloro improves the inputs)
- Guarantee revenue outcomes (the inputs improve; the outcomes follow naturally)
- Make changes the owner hasn't approved for their category (positive review responses: auto. Negative: owner approves.)

### How the Owner Knows It's Working

1. Google themselves. See the GBP posts they didn't write. See the review responses they didn't draft. See the website content they didn't create.
2. Monday email reports what was done: "This week: 1 GBP post published, 2 review responses posted, your position held at #2."
3. GBP insights show calls, direction requests, and website clicks trending up over weeks.

### The Monday Email as Receipt (Updated Understanding)

The Monday email is not the product. It is the receipt for work the DFY engine already did. The format from Spec 3 is correct. The content shifts from "here's what you should do" to "here's what we did and here's what changed."

When the DFY engine has done work:
Subject: "Dr. Garrison, here's what Alloro did for your practice this week."
Body: 1 GBP post published. 2 reviews responded to. Position held at #2. One thing still needs you: [if anything].

When nothing needs attention:
Subject: "Dr. Garrison, clean week."
Body: Rankings stable. Alloro is watching. [Clean week copy from Spec 3.]

---

## Build Sequence (Updated)

The original build sequence is correct in principle. Step 0 (audit and reset) before any feature. One feature per PR. No step starts until previous is verified.

Updated sequence reflecting the four-layer model:

**Layer 1: See the business (Spec 1 -- Checkup)**
Build and verify the checkup works end to end from a customer's perspective. Enter a business name. See accurate competitors (same specialty only, drive-time filtered per Competitive Market Definition spec). See a score that's one number, publicly verifiable. See findings that are named, specific, plain English. Verified when: Corey runs the checkup for Garrison Orthodontics and every number matches what he can verify on Google.

**Layer 2: Fix the business (Spec 4 -- PatientPath + Spec 6 -- DFY Engine)**
Build and verify the DFY engine executes for one real customer. Website generated. First GBP post published. First review response drafted. Verified when: Garrison Googles himself and sees a GBP post he didn't write.

**Layer 3: Explain the business (Spec 2 -- Dashboard, simplified)**
Build the minivan dash. Five pages. Speed, fuel, engine light. Deep dive behind a tap. Verified when: Garrison logs in and understands his business in 3 seconds.

**Layer 4: Report the results (Spec 3 -- Monday Email)**
Send the first real email to one real customer. With data about work that actually happened. Verified when: Garrison opens his email Monday morning and sees what Alloro did for him.

Each layer verified before the next starts. Compounding growth. No lipstick on a pig.

---

## Gap Analysis: Spec vs BLUEPRINT.md (Current State)

| Spec Layer | Spec Says | BLUEPRINT Says | Gap |
|------------|-----------|----------------|-----|
| Layer 1 (Checkup) | Works end to end, accurate data | Checkup API endpoints work. UI broken at email gate. Competitor filter includes wrong specialties for McPherson. Two scores disagree. | Checkup needs UI fix, competitor filter fix, score reconciliation |
| Layer 2 (DFY Engine) | GBP posts, review responses, SEO content, profile optimization running weekly | NOT BUILT. Agents produce findings, not actions. 30 of 40 agents never executed. | The entire DFY execution layer needs to be built |
| Layer 3 (Dashboard) | Minivan dash, 5 pages, 5 icons | 5-page structure built and routed. Nav live. Wiring verified. Data accuracy issues remain. | Close. Needs real-data verification and score reconciliation |
| Layer 4 (Monday Email) | Sends every Monday with receipt of DFY work | Code exists. Has never sent to a paying customer. | Needs DFY engine working first (Layer 2), then email reports on it |
| PatientPath | Website built automatically from GBP data | Instant website generator exists. Not verified from customer eyes. | Needs verification |
| DWY (Data Upload) | PMS/financial data scanned like Yuka | PMS parser fragile. Kuda gave up. No QuickBooks integration. | Parser needs fixing. Scope limited to PMS for now. |
| Scoring | One score, publicly verifiable, per Competitive Market Definition | Two scores disagree (checkup vs rank). Scoring doesn't follow the March 24 spec. | Reconcile to one score per Competitive Market Definition |
| Competitor Filtering | Drive time + specialty matching per Competitive Market Definition | Text search returns wrong specialties. Routes API not enabled. | Implement Competitive Market Definition spec (requires Routes API) |

**The critical path:** Layer 1 (fix checkup) -> Layer 2 (build DFY engine) -> Layer 3 (verify dashboard) -> Layer 4 (send email). In that order. Each verified before the next.

**The biggest single gap:** Layer 2. The DFY engine doesn't exist. Everything else is built or partially built. The thing that makes Alloro a GLP-1 instead of a gym membership has zero code executing.

---

*Updated April 3, 2026. Based on: Master Build Spec (March 23), Competitive Market Definition (March 24), Recipe (March 25), Owner.com research, real customer data from Garrison/Pawlak/McPherson/Caswell/One Endo, Fireflies transcripts (Merideth April 2, Dave April 2), ICP research, and 18 hours of founder conversation establishing knowns.*
