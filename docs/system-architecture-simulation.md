# Alloro System Architecture Simulation
## April 1, 2026 -- Is This the Right Architecture or Lipstick on a Pig?

### THE TEST
Walk through every user journey, every data flow, every handoff. Find where the system breaks, where the design is wrong (not just incomplete), and where we're building the wrong thing entirely.

---

## SIMULATION 1: Dr. Sarah Chen, Endodontist, Salt Lake City
### She scans the QR code at AAE.

**Step 1: Checkup entry (mobile)**
- Types "Sarah Chen Endodontics"
- Autocomplete finds her (Google Places)
- Geo endpoint biases to SLC (server-side, no permission popup)
- PASS: No friction. 3 seconds.

**Step 2: Scanning theater**
- Radar pulse. Competitor names appear. Review counts tick.
- Her own Google reviews scroll past.
- 12-15 seconds total.
- QUESTION: Does the scanning theater pull her actual review TEXT? Or just counts?
- FINDING: The scanning theater shows review counts and ratings but NOT review quotes. The review quotes only appear on the generated website. The theater misses an emotional hook. Seeing "Dr. Chen was the most gentle endodontist my son has ever seen" during the scan would lower her wall before the score even appears.
- DESIGN ISSUE: The theater is informational, not emotional. It should be both.

**Step 3: Score reveal**
- Score: 72/100. #6 of 14 in SLC endodontists.
- Top competitor: Wasatch Endodontics, 281 reviews vs her 34.
- Dollar figure: "$3,100/month at risk from review velocity gap"
- Findings blurred behind email gate.
- PASS: The Oz moment lands. Named competitor. Specific number. Dollar figure.
- QUESTION: Is the score CALIBRATED for endodontists specifically? Or is it the same algorithm for barbershops and med spas?
- FINDING: The scoring algorithm uses the same weights for all verticals. An endodontist with 34 reviews might be excellent for their specialty (referral-based, lower volume) but scores poorly because the algorithm compares raw counts. A barbershop with 34 reviews is underperforming.
- DESIGN ISSUE: Scoring needs vertical calibration. The vocabulary system handles LANGUAGE but not SCORING WEIGHTS. A referral-based specialist should be scored against referral-based benchmarks, not direct-acquisition benchmarks.

**Step 4: Email gate / account creation**
- Headline: "Your Sarah Chen Endodontics Comparison" (fixed: practice name, not competitor)
- Email: her personal email (fixed: "Your email" not "Your work email")
- Password created inline.
- PASS: Gate is clear and low-friction.

**Step 5: Colleague share screen**
- "I just found out where I rank in my market. Took 60 seconds. You should see yours."
- Native share sheet on iPhone.
- QUESTION: Does the share link include HER practice name so the colleague sees "Referred by Dr. Chen"?
- FINDING: The referral link includes a referral CODE but not the referrer's name. The colleague sees a generic checkup page, not "Dr. Chen thought you should see this."
- DESIGN ISSUE: The share should feel personal. "Sarah thought you should see where you rank" on the landing page. The referral code should resolve to a name.

**Step 6: Onboarding questions (5 Lemonis questions)**
- "What does success feel like to you in 3 years?"
- PASS: Emotional, differentiating, sets tone.
- QUESTION: Do these answers ACTUALLY influence anything? Or are they stored and never read?
- FINDING: The answers are stored on the org as `lemonis_responses`. The Monday email template checks for these to adjust tone (confident craftsman vs anxious first-timer). The CEO Chat uses them for mentor context. But the DASHBOARD doesn't reflect them. If she said "I want to be home by 5pm every day," nothing on the dashboard acknowledges that goal.
- DESIGN ISSUE: The Lemonis responses should shape the progress report. "You said success means being home by 5pm. This week, your agents handled 14 actions that would have taken you 3 hours. That's 3 hours closer." The responses are captured but not reflected back.

**Step 7: Dashboard (first load, day 1)**
- Checkup data populates: #6 of 14, Wasatch comparison, score 72.
- Onboarding checklist: 2 of 5 complete (IKEA endowment).
- Website preview notification.
- PASS: Not empty. Has real data.
- QUESTION: Does the website preview actually exist at this point?
- FINDING: The instant website generator fires during account creation. But it depends on checkup_data having reviews. If the Google Places data didn't include review text (it often doesn't for the practice itself, only for competitors), the website testimonials section will be empty or use fallback text.
- DESIGN ISSUE: The website generator should pull reviews from Google Places API specifically for THIS practice before generating. The checkup flow fetches competitor reviews but may not fetch the practice's own review text in detail.

**Step 8: Welcome email (immediate)**
- Subject: "Sarah, here's what we found about Sarah Chen Endodontics"
- Contains top finding, score, competitor name.
- Fires via Mailgun synchronously.
- PASS: No Redis dependency. Instant.

**Step 9: Welcome intelligence (4 hours later)**
- BullMQ job fires (Redis required).
- Finds nearby GPs who could refer to her.
- QUESTION: Does this actually produce useful output for an endodontist in SLC?
- FINDING: The welcome intelligence processor queries Google Places for nearby GPs. For an endodontist, these ARE the referral sources. This is the second Oz moment. "Dr. Patel at Riverside Family Dental sent 6 cases to your top competitor last quarter." But this finding requires referral data that we may not have on day 1.
- DESIGN ISSUE: Welcome intelligence for referral-based specialists should focus on the GP LANDSCAPE (who are the nearby GPs, how many, what are their ratings) rather than referral tracking (which requires PMS data we don't have yet). The current processor may promise referral insights it can't deliver on day 1.

**Step 10: Monday email (day 7)**
- Cron fires Monday 7am PT.
- One finding, one dollar figure, one action.
- QUESTION: What finding can the system produce after only 7 days with no GBP connection and no PMS data?
- FINDING: The Monday email falls back to checkup data if no weekly ranking snapshot exists. The first-week email uses the checkup findings. But after the first week, if no new ranking scan has run (Rankings Intelligence runs Sundays), the second Monday email may have nothing new to say.
- DESIGN ISSUE: The first 4 weeks need a content calendar. Week 1: checkup recap + "here's what we're watching." Week 2: first competitive scan results. Week 3: website performance (if live). Week 4: referral landscape. Each week has guaranteed content even without user action. The clean week email handles the "nothing happened" case but the system needs to actively generate NEW intelligence each week, not just monitor for changes.

---

## SIMULATION 2: Jo opens Alloro Monday morning.

**Step 1: IntegratorView loads**
- "Good morning, Jo. 2 things need you today."
- Client health grid: 5 amber, 7 green.
- QUESTION: Are the amber flags ACCURATE?
- FINDING: Amber means "no login in 14+ days." But some clients (like McPherson, beta) may never log in because they're not actively using the product yet. The health algorithm doesn't distinguish between "hasn't logged in because they're busy" and "hasn't logged in because they're churning."
- DESIGN ISSUE: Health status needs context. A client who signed up 2 days ago and hasn't logged in is normal. A client who logged in daily for 3 weeks and then stopped for 14 days is a churn signal. Time-since-signup should factor into the health score.

**Step 2: Jo flags a blue tape item**
- Taps the flag button. Types "The progress report date picker doesn't work."
- Concierge classifies: BUG. Green blast radius.
- Task created. Response: "Got it. Task created for the team."
- PASS: Routing works.
- QUESTION: Does the task reach Dave?
- FINDING: The task is in dream_team_tasks. Dave's BuildView shows tasks from that table. But Dave's BuildView queries tasks where owner_name matches or where the task is unassigned. Concierge tasks have owner_name set to Jo's email, not "Dave." Dave may not see it unless he filters for all open tasks.
- DESIGN ISSUE: Concierge bug tasks should have an assigned_to field that routes to Dave by default. The current implementation creates the task but doesn't explicitly assign it.

**Step 3: Jo checks the Dream Team Activity feed**
- Shows last 10 agent outputs.
- QUESTION: What does she see right now?
- FINDING: With agents just registered, the activity feed will be empty until the first cron cycle fires. After that, she'll see entries. But the agent_results table may have sparse data because most agents haven't produced output before. The first few days will be underwhelming.
- DESIGN ISSUE: The activity feed needs a "warming up" state for the first week. "Your agents started their first shifts today. Results will appear here as they complete their work." Not an empty card. A progress indicator.

---

## SIMULATION 3: A customer tries to pay.

**Step 1: Artful Orthodontics clicks "Add Payment Method"**
- Goes to /settings/billing.
- Clicks the CTA.
- QUESTION: Does the Stripe checkout session create correctly with the test price ID Corey configured?
- FINDING: The STRIPE_HEALTH_PRICE_ID was updated by Corey. But I haven't verified that the checkout session creation endpoint actually works end-to-end. The endpoint creates a Stripe checkout session and redirects. If the price ID is wrong or the session creation fails, the customer sees nothing or an error.
- CRITICAL: This has NEVER been tested with a real click. It's the revenue gate. If Artful can't pay, that's $1,500/month lost.

---

## ARCHITECTURAL ISSUES FOUND (Not Lipstick Issues -- Foundation Issues)

### 1. SCORING IS NOT VERTICAL-AWARE
The Business Clarity Score uses the same weights for every vertical. An endodontist with 34 reviews is excellent. A barbershop with 34 reviews is average. The vocabulary system handles language. Nothing handles scoring calibration per vertical.
**Fix needed:** Vertical-specific scoring benchmarks. The vocabulary config should include scoring weight overrides, not just term replacements.

### 2. LEMONIS RESPONSES ARE CAPTURED BUT NEVER REFLECTED
The onboarding asks deeply personal questions. The answers are stored. Nothing in the product says "you told us success means X, here's how we're getting you there." The emotional investment of answering is wasted.
**Fix needed:** The progress report should reference the Lemonis responses. The Monday email should occasionally reference them. The dashboard greeting could reflect them.

### 3. FIRST 4 WEEKS HAVE NO CONTENT CALENDAR
After the checkup Oz moment, what does the customer receive each week? If the Monday email has nothing new to say by week 2, the magic fades. The clean week email is a great fallback but the system should be GENERATING new intelligence each week, not just monitoring for changes.
**Fix needed:** A 4-week content calendar baked into the Monday email logic. Week 1: checkup recap. Week 2: first competitive scan. Week 3: website metrics. Week 4: market landscape. Guaranteed value even with zero user action.

### 4. HEALTH SCORING DOESN'T ACCOUNT FOR ACCOUNT AGE
A 2-day-old account with no login is normal. A 30-day account that was active daily and then went silent for 14 days is a churn signal. The current health algorithm treats both the same.
**Fix needed:** Weight health score by account age and activity pattern, not just days-since-last-login.

### 5. CONCIERGE BUG ROUTING DOESN'T ASSIGN TO DAVE
Tasks created by the Concierge have an owner (the reporter) but no assignee. Dave won't see them unless he checks all open tasks. The routing says "Dave will see this" but doesn't guarantee it.
**Fix needed:** Green/Yellow bugs auto-assign to Dave's user ID. Red items auto-assign to Corey.

### 6. REFERRAL SHARE DOESN'T PERSONALIZE THE LANDING
The colleague who receives the share link sees a generic checkup page. Not "Dr. Chen thought you should see where you rank." The share is personal in the message but impersonal at the destination.
**Fix needed:** Referral code resolves to referrer name on the checkup entry page. "Referred by Dr. Sarah Chen" above the search bar.

### 7. STRIPE CHECKOUT IS UNTESTED
The payment gate has never been clicked by a real user on the current configuration. This is the revenue gate. Everything before it is free. This is where money happens.
**Fix needed:** Test with 4242 4242 4242 4242 test card. Today. Before AAE.

### 8. WEBSITE GENERATOR MAY PRODUCE EMPTY TESTIMONIALS
The instant website generator uses checkup_data reviews. But checkup_data may not include the practice's OWN review text (it focuses on competitor data). The testimonials section could be empty or use generic fallbacks.
**Fix needed:** The website generator should make a dedicated Google Places API call for the practice's reviews before generating the page.

---

## VERDICT: LIPSTICK OR FOUNDATION?

**The foundation is real.** The architecture (checkup -> account -> dashboard -> Monday email -> self-improving loop -> dream team) is correct. The Rube Goldberg chain works. The Google moment vision is right.

**But 8 issues are foundation-level, not cosmetic.** Scoring calibration, Lemonis reflection, content calendar, health scoring, task routing, referral personalization, Stripe testing, and website testimonials. These aren't features to add. These are places where the current architecture promises something it can't deliver yet.

**The most critical:** Stripe checkout (can't collect revenue without it) and scoring calibration (an endodontist getting a score that doesn't make sense destroys the Oz moment).

**My confidence after this simulation:**
- Before: "the architecture can deliver." Generic confidence.
- After: "the architecture delivers for week 1. Weeks 2-4 need the content calendar. Vertical calibration needs to happen before the non-dental verticals see it. Stripe needs to be tested TODAY."

This is not lipstick on a pig. This is a house with a strong foundation, good framing, and 8 places where the plumbing isn't connected yet. The plumbing is specific, identifiable, and fixable.
