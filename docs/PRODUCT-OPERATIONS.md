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

### Known 1: Every number is verifiable with a link

**Rule:** Every number a customer sees links to where they can verify it on Google. No composite scores. No algorithm output. Raw readings from Google with verification links. The customer clicks the link and sees the same number.

**Test:** Click every link on every customer-facing page. The number in Alloro matches the number on Google.

**Violation:** A number without a verification link. A composite "score" that doesn't link to anything. A number the customer can't verify by clicking through.

**Locked:** April 4, 2026, Corey Wise.
**Override requires:** Corey only.

**Last tested:** PASS. April 4, 2026. All 5 pages show raw readings with Google verification links. No composite scores. Every number links to where the customer can verify it. Pending: verification against live data after deploy (numbers may be stale until startup catch-up runs).

---

### Known 2: One scoring algorithm

**Rule:** Every score in the system traces to `calculateClarityScore()` in `src/services/clarityScoring.ts`. No other file calculates scores. No duplicates. No shortcuts.

**Test:** `grep -r "computeScore\|calculateScore\|rankScore.*=" src/ --include="*.ts"` returns only clarityScoring.ts and its callers.

**Violation:** A second scoring function exists somewhere. Two customers with identical data get different scores. The checkup produces a number that the weekly recalc disagrees with.

**Locked:** April 4, 2026, Corey Wise.
**Override requires:** Corey only.

**Last tested:** PASS. April 4, 2026. `grep -r "computeScore" src/` returns zero. Old duplicate in batchCheckup.ts deleted. All callers trace to clarityScoring.ts.

---

### Known 3: No position claims

**Rule:** No customer-facing surface displays a Google search position number. Not "#3." Not "You rank #3 of 12." Not "outranking." The Places API rank does not match what the customer sees on Google.

**Test:** Search all customer-facing code for `#\${` combined with position/rank. Search emails for "#" followed by a number in ranking context. Zero results.

**Violation:** Monday email says "You're #3 in your market." Action card says "outranking." Home page shows "#1 in West Orange."

**Locked:** April 4, 2026, Corey Wise.
**Override requires:** Corey only. Requires a new, verified data source that matches Google Search results.

**Last tested:** PASS. April 4, 2026. Position claims removed from all surfaces: HomePage, ComparePage, action cards, Monday email, clean week email, snapshot bullets, notifications, milestoneDetector, ozMoment, tierGating, csAgent, contentAgent, trendScout. All use "more visible on Google" language instead of position numbers.

---

### Known 4: No fabricated dollar figures

**Rule:** Dollar figures only appear when backed by real data. PMS referral counts, GBP engagement metrics, verified case values. Never from projections ("348 reviews = $X revenue").

**Test:** Find every dollar figure in customer-facing output. Trace it to a real data source. If the source is a formula with assumptions, it's fabricated.

**Violation:** Monday email says "The gap represents $52,000 in annual revenue at risk" based on a review count projection, not real revenue data.

**Locked:** April 3, 2026, Corey Wise.
**Override requires:** Corey only.

**Last tested:** PASS. April 4, 2026. `annualAtRisk` removed from Monday email fallback bullets and oneActionCard referral drift card. Replaced with verifiable language ("every review you add closes that gap," "they averaged X referrals per month before going silent"). No fabricated dollar figures remain in customer-facing output.

---

### Known 5: The Recipe

**Rule:** Every customer-facing finding follows the Recipe: one finding, one dollar figure (when real), one action. Named specifically (not "a competitor" but "Peluso Orthodontics"). Specific numbers. Plain English. No hedging. No jargon.

**Test:** Read any action card, email bullet, or dashboard finding. Does it name names? Does it use specific numbers? Would a tired business owner at 10pm understand it immediately?

**Violation:** "Consider improving your online presence." "A competitor has more reviews." "Revenue may be at risk." Anything generic, unnamed, or hedged.

**Locked:** March 25, 2026, Corey Wise.
**Override requires:** Corey only.

**Last tested:** PARTIAL PASS. April 4, 2026. Action card names specific competitors and uses specific numbers. Some Monday email fallback bullets use generic language when LLM analysis fails.

---

### Known 6: No scores. Readings with links.

**Rule:** No composite scores. No gauges. No "Business Clarity Score." The customer sees raw readings from Google, each with a link to verify. The value is the doctor's interpretation (what it means) and the work done (what Alloro did about it). Not a number.

**Test:** Is there any composite score or gauge on any customer-facing page? If yes, it fails. Does every reading have a verification link? If not, it fails.

**Violation:** A gauge showing "45" or "90." A "Business Clarity Score." Any number the customer has to trust because they can't click through to verify it.

**Locked:** April 4, 2026, Corey Wise.
**Override requires:** Corey only.

**Last tested:** PASS. April 4, 2026. All 5 customer-facing pages rebuilt. Gauge removed. Composite score removed. "Business Clarity Score" replaced with "Google Health Check" across all surfaces: customer pages, marketing pages (20+ content pages), email templates, Monday email, checkup flow, action cards, onboarding wizard, trial emails, MondayPreview. No composite score displayed anywhere. All pages show raw readings with verification links.

---

### Known 7: Readings are raw Google data with verification links

**Rule:** Each reading shows: the raw number, what it means (the doctor's note), a link to verify it on Google, and the status (healthy/attention/critical based on researched ranges). No algorithm transforms the number. The number IS the measurement.

**Test:** Pick any reading. Click the link. The number matches. The status (healthy/attention/critical) is based on published research ranges (e.g., "68% of consumers require 4+ stars" makes 4.5+ healthy).

**Violation:** A transformed number (rating/5 * 8 = 8). A status based on algorithm output. A reading without a verification link.

**Locked:** April 4, 2026, Corey Wise.
**Override requires:** Corey only.

**Last tested:** PASS. April 4, 2026. Home page shows 5 readings (Star Rating, Review Volume, Profile Completeness, Review Responses, Your Market). Each has a verification link to Google. Status colors based on research ranges. Compare page shows side-by-side raw numbers with verify links. Progress page shows reading trends (start vs now). No transforms.

---

### Known 8: Monday email is the product

**Rule:** The Monday email IS the product. The dashboard is the reference library. The email comes to you. You don't go to it. DWY mode: "here's what you should know." DFY mode: "here's what we did." The email shifts from advice to receipt as the DFY engine activates.

**Test:** Read the Monday email without logging into the dashboard. Do you know the state of your business? Do you know what Alloro did? Do you know if anything needs your attention?

**Violation:** Email says "log in to see your results." Email requires the dashboard to be useful. Email is generic and could apply to any business.

**Locked:** April 3, 2026, Corey Wise.
**Override requires:** Corey only.

**Last tested:** UNTESTED. Monday email code exists and has sent in testing. Not verified from a real customer's inbox perspective. Position claims removed from email text April 4.

---

### Known 9: Clean week is a gift

**Rule:** When nothing needs attention, the Monday email says so. "Clean week. No competitor gained ground. Enjoy the week." Zero upsell. Zero action items. This is Will Guidara's unreasonable hospitality. A coffee brought without asking.

**Test:** Read the clean week email. Does it try to sell anything? Does it create anxiety? Does it make the owner feel good about their life?

**Violation:** Clean week email includes "but you could improve by..." or "consider upgrading to..." or any action item. The clean week is not a sales opportunity.

**Locked:** April 3, 2026, Corey Wise.
**Override requires:** Corey only.

**Last tested:** UNTESTED. Clean week email template exists. Copy reviewed April 4: no upsell, no action items. Not verified from a real customer's inbox.

---

### Known 10: Scoring weights live in the database

**Rule:** All scoring weights are stored in the `scoring_config` database table, editable from admin without code changes. Preview shows old vs new score before saving. At 10,000 customers, changing a weight should not require a deploy.

**Test:** `GET /api/admin/scoring-config` returns all weights. `POST /api/admin/scoring-config/preview` with `{ org_id }` shows projected impact. No scoring weights are hardcoded without a database fallback.

**Violation:** A weight change requires editing clarityScoring.ts, committing, deploying. Changing one number requires a developer.

**Locked:** April 4, 2026, Corey Wise.
**Override requires:** Corey only.

**Last tested:** UNTESTED. Migration created April 4, not yet run on sandbox. API endpoints built. Scoring engine reads from DB with fallback to hardcoded defaults. Requires: `npx knex migrate:latest` on sandbox, then `GET /api/admin/scoring-config` to verify.

---

## Part 2: The Readings

No score. No gauge. Raw readings from Google, each with a verification link. The doctor reads the blood panel and tells you what it means.

### Reading: Star Rating
**What they see:** "5.0 stars" with a verify link to Google.
**Status:** Healthy (4.5+), Attention (4.0-4.4), Critical (below 4.0). Based on: 68% of consumers require 4+ stars (BrightLocal 2026).

### Reading: Review Volume
**What they see:** "36 reviews. My Orthodontist has 342. Gap: 306." with verify links for both.
**Status:** Healthy (>= competitor), Attention (>= 50% of competitor), Critical (< 50%).

### Reading: Profile Completeness
**What they see:** "3/5 fields complete. Missing: hours, phone." with verify link to GBP.
**Status:** Healthy (5/5), Attention (3-4), Critical (0-2). Based on: Complete profiles 2.7x more reputable (Google).

### Reading: Review Responses
**What they see:** "0% responded" with verify link to check reviews for owner responses.
**Status:** Healthy (80%+), Attention (1-79%), Critical (0%). Based on: Responding earns 35% more revenue (Womply).

### Reading: Your Market
**What they see:** "Orthodontist in West Orange. Top competitor: My Orthodontist." with verify link to Google search.
**Status:** Context reading. Shows the competitive landscape.

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
| Review response posting | BLOCKED | AI drafts shown with "copy and post" instruction. Approve button removed. Root cause: reviewMonitor stores Places API review IDs but gbpReviewReply uses MyBusiness API which expects different ID format. Cannot post until ID mapping is resolved. | Requires: map Places API review names to MyBusiness resource names, or switch review fetching to MyBusiness API |
| Instant snapshot on signup | WIRED | Fresh data 5 min after account creation | Readings appear on first login |
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
| Home | "Am I okay?" | Readings with verify links + one action card | Every number links to Google |
| Compare | "How do I compare?" | Side-by-side raw numbers + competitors + referrals | Every number links to Google |
| Reviews | "What are people saying?" | Individual reviews + AI response drafts with approve | Their own Google reviews |
| Presence | "What does my presence look like?" | Website + GBP completeness | Their own GBP listing |
| Progress | "Am I getting better?" | Reading trends (start vs now) + proof of work | Every trend verifiable on Google |

---

## Part 6: Process Knowns

### Known 11: Check the map

**Rule:** Before every commit, walk through what each affected customer-facing page will show. Describe it in the conversation. If you can't describe it with certainty, you haven't verified it and you don't commit.

**Test:** Is there a Customer Reality Check in the conversation before the commit message? Does it describe what the customer sees on each affected page?

**Violation:** Code pushed after "TypeScript compiles" without describing the customer experience. Code pushed after saying "I'm not confident." Screenshots from Corey revealing problems that should have been caught.

**Locked:** April 4, 2026, Corey Wise.
**Override requires:** Corey only.

**Last tested:** PASS (late session). April 4, 2026. Process established and followed for all page rebuilds, checkup fixes, and UI passes. CRC written before scoring simplification, page rebuilds, and checkup changes. Future sessions test from start.

---

### Known 12: Customer Reality Check before every build

**Rule:** Before touching code, write a Customer Reality Check: what the customer sees now, what they should see after, what could go wrong, what you're confident about, what you're not confident about.

**Test:** Is there a CRC in the conversation before the first code change? Does it reference specific Knowns from this document?

**Violation:** Code changes start without describing the current or target customer experience. Assumptions made without stating them. Problems discovered after commit that were predictable.

**Locked:** April 4, 2026, Corey Wise.
**Override requires:** Corey only.

**Last tested:** PASS (late session). April 4, 2026. CRC process followed for page rebuilds and UI fixes. Constitution checked before each commit. 4 passes caught hidden score references in checkup flow, vocabulary defaults, building screen, shared results page.

---

### Known 13: Warm, not clinical

**Rule:** Background is #F8F6F2 (warm off-white). Never pure white. Never cold blue. The product feels like a private study, not a hospital dashboard.

**Test:** Take a screenshot. Does it feel warm? Would you show it at a dinner party?

**Violation:** Pure white background. Blue-gray enterprise aesthetic. Cold, clinical feel.

**Last tested:** PASS. April 4, 2026. All 5 pages use #F8F6F2 background. All cards use bg-stone-50/80. bg-white removed from Compare, Presence, and Progress section components. No pure white on any customer-facing page.

---

### Known 14: Brand constants

**Rule:**
- Terracotta #D56753: CTAs and accents only
- Navy #212D40: Action card background only, NEVER text color
- Text: #1A1D23 always
- Minimum font: text-xs (12px). Never text-[10px] or text-[11px].
- Maximum weight: font-semibold. Never font-black or font-extrabold.
- No em-dashes. Anywhere. Ever.

**Test:** `grep -r "font-black\|font-extrabold\|text-\[10px\]\|text-\[11px\]"` in frontend/src returns zero. `grep -r "text-\[#212D40\]"` in customer-facing components returns zero.

**Violation:** Navy text on a page. 10px fine print. Bold headlines screaming.

**Last tested:** PASS. April 4, 2026. Preflight grep for font-black, font-extrabold, text-[10px], text-[11px] returns zero in customer-facing code. text-[#212D40] returns zero. No em-dashes in customer-facing strings.

---

### Known 15: Max 2 temporary prompts

**Rule:** The Home page shows at most 2 conditional/temporary elements (billing prompt, milestone card, onboarding). The core experience (readings + action card) is always visible. Temporary prompts never push core content below the fold.

**Test:** Count visible prompts on the Home page. Never more than 2.

**Violation:** Three banners stacked above the readings. Core content pushed off screen by notifications.

**Last tested:** PASS. April 4, 2026. Code review confirms `limitPrompts()` function caps visible prompts at 2. Logic verified in HomePage.tsx.

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
| 4 | No scores, readings with verify links | Scores are algorithm output. Readings are Google's numbers. Supersedes credit score gauge decision. | Apr 4 2026 | Corey |
| 5 | Verifiable factors only | If they can't Google it, don't show it | Apr 4 2026 | Corey |
| 6 | "More visible" not "outranking" | Can't claim ranking we can't prove | Apr 4 2026 | Corey |
| 7 | Review replies as first DFY | Verifiable: they see the response on Google | Apr 4 2026 | Corey |
| 8 | Email is receipt not advice | "Here's what we did" > "here's what you should do" | Apr 3 2026 | Corey |
| 9 | No fabricated dollar figures | Projections aren't data | Apr 3 2026 | Corey |
| 10 | Clean week is a gift | Not a sales opportunity. Pure relief. | Apr 3 2026 | Corey |
| 11 | The metric is what AI says about you | Google Ask Maps reads review words, not stars. Position is dying. What the AI says when someone asks is the new visibility. | Apr 4 2026 | Corey |
| 12 | First-party data is the moat | Google shows profiles. Alloro connects referral sources, revenue, retention, competitive intelligence. Every week of data deepens the moat. Leaving Alloro = knowledge loss. | Apr 4 2026 | Corey |
| 13 | Review sentiment > review count | Google reads what reviews SAY. "Gentle with anxious patients" in 14 competitor reviews vs 0 in yours is the gap that matters. Count is table stakes. Themes are the edge. | Apr 4 2026 | Corey |
| 14 | Three things Google will never do | Show competitors' data. Connect internal to external data. Tell you what to DO. Alloro does all three. This is permanent. | Apr 4 2026 | Corey |
| 15 | Alloro replaces the question, not the search | Google replaced the library. Alloro replaces the question. The owner doesn't search, doesn't ask, doesn't know they needed to know. The answer arrives Monday morning. | Mar 25 2026 | Corey |

---

## Part 9: The Strategic Edge

### Where Google Is Going (and Why It Matters)

**Ask Maps (launched March 2026):** Google's AI reads 500 million reviews and answers natural language questions about local businesses. "Where can I find a good orthodontist near West Orange?" gets a conversational answer based on review sentiment, GBP attributes, and photos. Not a list of links. A recommendation.

**Zero-click reality:** 80%+ of searches end without a click. 78% of local "near me" searches are zero-click. Traffic is dying. Intent is concentrating. The people who DO click convert at 23x the rate of traditional organic.

**AI search fragmentation:** 45% of consumers now use AI tools (ChatGPT, Gemini, Perplexity) for local services. Up from 6% one year ago. Very little overlap in what each AI recommends. A business visible on Google may be invisible on ChatGPT.

### What This Means for Alloro's Product

**The old metric (dying):** "You rank #3 for orthodontist in West Orange."
**The new metric (building):** "When someone asks Google's AI for an orthodontist in West Orange, here's what it says about you vs Peluso. Here's the gap. Here's what to do about it."

**The old moat (shallow):** Dashboard showing Google data anyone can get.
**The new moat (deep):** First-party business data + longitudinal competitive intelligence + automated actions. Every week of data makes it harder to replicate. Every action compounds.

### The Five-Layer Moat

1. **First-party operations data.** Referral sources, revenue per source, retention, case acceptance. No public API has this. It comes from PMS integrations and owner input.
2. **Longitudinal competitive intelligence.** Any tool can snapshot today. Only Alloro has been watching for 26 weeks. "Competitor's review velocity increased 300% starting in October" is intelligence that requires time to build.
3. **The action layer (DFY).** Data is not a moat. Dashboards are not a moat. Automated actions based on proprietary data ARE a moat. Auto-posted review responses. Auto-generated GBP content. Auto-flagged referral declines.
4. **The compound flywheel.** More data makes better intelligence. Better intelligence drives actions. Actions produce results. Results produce engagement. Engagement produces more data.
5. **Multi-surface AI visibility.** What ChatGPT, Perplexity, Gemini, and Google all say about the business. Since there's almost no overlap between what each AI cites, the business invisible on one surface is losing customers it doesn't know about.

### What to Build Next (Strategic Priority)

1. **Review sentiment comparison.** "Patients describe Peluso as 'gentle with anxious kids' in 14 reviews. You have 0 reviews mentioning this." Undeniable. Verifiable. Actionable. Nobody else shows this.
2. **"What Google Says About You" report.** Weekly snapshot of how AI systems describe the business vs competitors. The new ranking report.
3. **Cross-AI visibility monitoring.** What does ChatGPT say? Perplexity? Gemini? Track all surfaces. The AEO Monitor agent's original purpose, now mission-critical.
4. **GEO optimization for PatientPath sites.** Structured data, FAQ schema, sequential headings. Pages with proper structure get cited 2.8x more by AI systems.

---

## Part 10: The Three Questions

Every product decision answers one of these. If it doesn't answer any, it doesn't get built.

**Question 1: What do local service business owners want and need?**
1. Where they stand in their community. Not data they know. Intelligence they can't find by Googling.
2. Clarity in their numbers. Raw readings with the doctor's interpretation.
3. What is being done on their behalf. Proof of work. The receipt.

**Question 2: What needs to happen technically?**
Read Google data (exists) -> Analyze for intelligence they can't see (building) -> Take automated actions (wired, untested) -> Deliver without login (Monday email, exists) -> Show proof when they log in (building).

**Question 3: What do things cost and what will people pay?**
Agencies charge $3-5K/month for work customers can't verify. Alloro does the same work for $2,000/month, and every result is verifiable by Googling. The pitch: "You're paying $3-5K/month for a black box. Alloro does it for $2,000 and you can check every result yourself."

---

## How to Use This Document

**Before building:** Read the relevant Knowns. Write a Customer Reality Check that references them. If your build would violate a Known, stop.

**Before committing:** Check each Known your changes touch. Run the test. If it fails, fix it before pushing.

**Before handing off:** Point to this document. The receiver reads it and knows exactly how the product is intended to work and what tests to run.

**To change a Known:** Write the proposed change, the reason, and get the override approval listed in that Known. Add the old decision and the new one to the Key Decisions Log with dates. Knowns are constitutional. They don't change casually.

**Check the map:** Before every commit, walk through what the customer sees. Reference this document. If something contradicts a Known, the code is wrong.

---

## Part 11: The Science (Why Each Page Exists)

Alloro is not inventing new knowledge. Every factor we score, every page we show, every action we recommend is backed by existing research. We are tying known things together for someone who doesn't have time to read 50 sources.

### Why Five Pages (Not 4, Not 7)

**Cognitive science:** Cowan (2001) narrows Miller's Law to 3-5 items for active processing. Five is the sweet spot: 3 feels sparse, 7 requires effort to distinguish.

**Competitive precedent:** Owner.com ($1B): 5 tabs. Podium: 5 sections. Housecall Pro: 5 nav items. Platforms with 7-8 sections score lower on ease of use (G2 ratings).

**Data completeness:** Every factor from Whitespark 2026 (8 ranking categories), Moz (6 categories), and BrightLocal surveys maps to one of the 5 pages. Zero orphans.

### Each Page Maps to a Ranking Factor AND a Human Need

| Page | Question | Human Need (Maslow) | Ranking Factors Covered | Research Backing |
|------|----------|-------------------|------------------------|-----------------|
| Home | "Am I okay?" | Safety | Readings with verify links, one action card | Maslow: safety is the base. Until this is answered, nothing else matters. |
| Compare | "How do I compare?" | Status | Competitive position, behavioral signals, referral health | Kahneman: loss aversion (2x pain of loss vs pleasure of gain). Seeing the gap motivates action. |
| Reviews | "What are people saying?" | Belonging | Review signals (20% of ranking weight per Whitespark 2026) | BrightLocal 2026: 98% read reviews. 74% only care about last 3 months. Ask Maps reads sentiment. |
| Presence | "What does my presence look like?" | Achievement | GBP signals (32%), on-page, citations, AI visibility | Google: complete profiles 2.7x more reputable. 70% more likely to attract visits. |
| Progress | "Am I getting better?" | Autonomy | Trajectory over time | Self-determination theory (Deci & Ryan): autonomy and competence drive intrinsic motivation. |

### Why Each Factor Matters (The Research)

**Review count matters because:**
- Google confirmed: review count is a top 3 local ranking factor (Whitespark 2026, 20% weight)
- BrightLocal 2026: 98% of consumers read online reviews before choosing a local business
- Businesses with 50+ reviews earn 4.6x more revenue than those with fewer (Womply)

**Review recency matters because:**
- BrightLocal 2026: 74% of consumers only care about reviews from the last 3 months
- Google's 2026 algorithm weights recent reviews more heavily
- Ask Maps prioritizes recent sentiment when making recommendations

**Review sentiment matters because:**
- Google Ask Maps (launched March 2026) reads the WORDS in reviews, not just stars
- Sentiment analysis determines what a business is "known for" in AI recommendations
- "Gentle with anxious patients" in competitor reviews vs 0 in yours is the gap AI sees

**Review response rate matters because:**
- Google confirmed: responding to reviews improves local ranking
- Businesses that respond to reviews earn 35% more revenue (Womply)
- Response signals to Google that the business is active and engaged

**Star rating matters because:**
- BrightLocal 2026: 31% of consumers require 4.5+ stars (up from 17%)
- 68% require 4+ stars minimum
- Conversion drops steeply below 4.0 stars

**GBP completeness matters because:**
- Google: complete profiles are 2.7x more likely to be considered reputable
- Complete profiles are 70% more likely to attract location visits
- GBP signals are 32% of local ranking weight (the single largest factor, Whitespark 2026)

**Photos matter because:**
- Businesses with 100+ photos get 520% more calls (BrightLocal)
- Photo freshness (last 30 days) is a 2026 ranking signal
- Ask Maps uses photos for visual recommendations

**Hours matter because:**
- "Open now" is the 5th most important local pack factor (Whitespark 2026)
- Wrong hours = customer shows up to closed door = negative review = ranking damage

**Description matters because:**
- Ask Maps reads business descriptions for context
- No description = Google guesses what your business does
- A complete description with services improves relevance matching

**Website matters because:**
- 36% of local businesses still don't have a website
- On-page signals (website content, schema markup) contribute to ranking
- GEO: pages with structured data get cited 2.8x more by AI systems

### Why Financial Health Is Correctly Excluded (For Now)

SCORE, Harvard, and NetSuite all rank financial metrics (revenue, cash flow, CAC/LTV) as the #1 indicator of business success. This is real.

But Alloro excludes it today because:
1. Reliable financial data requires PMS/QuickBooks integrations that are fragile (Kuda's parser broke)
2. Showing unreliable financial data violates Known 1 (every number verifiable)
3. The data Alloro DOES have (online presence, reviews, competitive position) is complete and verifiable
4. When PMS/QuickBooks integration is robust, financial intelligence folds into existing pages: referral revenue into Compare, cash flow trend into Home

Financial health does not need a 6th page. It needs reliable data. When that data exists, it deepens the existing 5.

### The Human Psychology Behind Key Features

**One Action Card priority (referral drift first):** Kahneman's loss aversion. Losing $330K/year in referrals triggers 2x stronger action than gaining $330K in new patients. The pain of loss is the most powerful motivator.

**Clean week email:** Maslow's safety need. The business owner's deepest fear is "am I going to be okay?" The clean week answers the safety question before the owner asks it.

**Monday email variable content:** Nir Eyal's Hook Model. The email content changes weekly: sometimes a warning, sometimes a gift, sometimes a receipt. The variable reward creates the habit loop that drives weekly engagement.

**Readings with verify links:** Every number links to where you check it. The customer doesn't have to trust Alloro. They click the link and see the same number on Google. Trust through verification, not through design.

**Named competitors in findings:** Specificity bias. "Peluso has 348 more reviews" is 5x more motivating than "a competitor has more reviews." Named threats feel real. Generic warnings feel ignorable.

---

*Alloro Product Constitution. Authored by Corey Wise. Built by Claude. April 4, 2026.*
*If code contradicts this document, the code is wrong.*
*The science is not ours. The synthesis is.*
