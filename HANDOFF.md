# Session Handoff -- April 3, 2026

## Read These First (In Order)

1. Memory: `session_apr3_the_breakthrough.md` -- the 10 knowns, the quadrant, what's proven, what's not built
2. Memory: `spec_annotations_apr3.md` -- full spec review, all decisions locked, simulations, pre-mortem
3. Memory: `feedback_lemonis_not_a_gate.md` -- Lemonis is optional at day 30, not a login blocker
4. The Master Build Spec: https://www.notion.so/32cfdaf120c481ea8803ffce4f042178

## The Rule

Every build decision is checked against the Master Build Spec.
If the spec doesn't cover it, update the spec BEFORE writing code.
The spec is the product. The code is the implementation.
Two weeks of drift happened because sessions built from their own understanding instead of the spec.

## What Happened

The Master Build Spec was written March 23. It was right. Five specs: Checkup, Dashboard, Monday Email, PatientPath, HQ.

Over the next 10 days, multiple sessions built 526 commits on sandbox without checking against the spec. The scoring model was reinvented. Six dashboards were built instead of one. 62 agents were created that nobody can explain. A five-page dashboard redesign was built on top of the drift. The code grew to 303K lines serving 10 customers.

Meanwhile: zero Monday emails sent automatically. Zero DFY actions taken. Zero GBP posts published. The product showed data but did nothing. Customers said "you're doing the same thing I already do."

Today the first Monday email was sent manually to McPherson. Mailgun works. Real data. That's the proof of life.

## Decisions Locked

- **Google Position is the only position.** From Places API text search. Verifiable. No internal model rank.
- **Scoring model:** three sub-scores from public Google data. Google Position + Review Health + GBP Completeness. No Puppeteer. No assumptions.
- **DFY is the product.** Website + GBP posts + review responses + SEO + AEO, all automatic. This is the GLP-1. Owner.com proved the model at $1B. Without DFY, Alloro is a dashboard nobody opens.
- **Monday email:** get it sending automatically. Refine format later. The heartbeat matters more than the word count.
- **Lemonis Protocol:** optional at day 30. NOT a gate. NOT on first login.
- **One Alloro:** five pages, role determines data. Never build another role-specific dashboard. But don't build the role-aware layer now. Build for customers first.
- **No fabricated dollar figures.** Real data only.
- **Community proof:** "Business owners across the country received this brief." Number shown only at 100+ customers.

## The Goal

Get sandbox fully working. Archive main. Promote sandbox to production. One codebase.

Sandbox has the right architecture and the right infrastructure. It also has things that crash and things that show wrong data. The job is to fix what's broken, verify what works, and get every customer-facing surface stable. Then sandbox becomes production and main is archived.

## The Priority Order

### 1. Fix what crashes (DO THIS FIRST)
The V1 dashboard (/dashboard) crashes on BillingPromptBar.tsx line 141 -- ttfvData.signals is undefined. A guard was added (ttfvData && ttfvData.signals && ttfvData.signals.length) but the server may be serving a cached bundle.

Fastest fix: redirect /dashboard to /home in App.tsx. The five-page /home works and renders. This also fixes pilot mode, which currently crashes because it opens /dashboard.

```
// In App.tsx, replace the /dashboard route:
<Route path="/dashboard" element={<Navigate to="/home" replace />} />
```

Verify: log in, confirm /home renders. Pilot into McPherson, confirm /home renders with their data.

### 2. Monday Email Sends Automatically
The cron fires every Monday 7am. Every paying customer gets an email. Named competitor. Real Google Position. One finding. One action. This is the heartbeat. If it doesn't beat, nothing else matters.

What exists: BullMQ cron, Mailgun integration (proven today), email template, Monday email job in src/jobs/mondayEmail.ts. First email sent manually to McPherson today. Works.

What's blocking: the sendAllMondayEmails() function in mondayEmail.ts has a Go/No-Go gate (pollForDelivery) that requires 4 voters to approve before each email sends. This gate was blocking all automatic sends. The gate is in src/services/agents/goNoGo.ts.

Fix: either make the gate pass by default (return cleared:true) until the system is proven with real sends, or bypass it entirely in sendAllMondayEmails. The other session today bypassed it manually to send McPherson's email. Do the same thing permanently until the Monday email has sent successfully for 4 consecutive weeks.

### 3. Checkup Aligned to Spec
The scoring model needs to swap to the three new sub-scores (Google Position, Review Health, GBP Completeness). The finding quality standard (4 criteria: named competitor, specific number, invisible insight, stops them cold) needs to be enforced. Verify with one real checkup on a real business.

### 4. Data Accuracy Pass
Every customer's dashboard must show correct data. Google Position verified against actual Google results. Competitor names correct. No fabricated numbers. Walk through each customer account and verify what they see.

### 5. First DFY Action
One GBP post published for one customer. Requires GBP OAuth connection. This is the proof that Alloro does the work, not just shows the data. The Monday email reports what it did.

### 6. Dave Reviews, Archive Main, Promote Sandbox
Once sandbox is stable and verified, Dave reviews the critical paths (auth, billing, data serving). Archive main. Sandbox becomes production.

## Timeline
- Items 1-2: today/tonight. Get the dashboard rendering and the Monday email unblocked.
- Items 3-4: before Monday. Every customer must see correct data when Monday email sends.
- Items 5: this week. One DFY action for one customer.
- Item 6: when Dave confirms stable. Don't rush this.

## AAE (April 15 -- 12 days)
QR code on printed banner points to getalloro.com/checkup. Dave said he'd set up a redirect to audit.getalloro.com. Verify this works on a phone. If the redirect isn't set up, the QR code is a dead link at the conference.

## Test Account
Use McPherson (org 21, Shawn, operations@mcpendo.com) as the primary test. He received the first Monday email today. He's a partner, not a paying critic. Safest to verify with.

## For Dave
Dave needs a one-page summary of what's on sandbox vs main. Not 526 commit messages. A summary of: what routes exist, what database tables were added, what env vars are needed, what's stable vs unstable. Create this when handing off to Dave for the archive/promote step.

## How to Work

**One thing at a time.** Build it. Verify it works with real data (not TypeScript, not tests -- customer eyes). Screenshot the output. Confirm it matches reality. Commit. Move to the next thing.

**Dave reviews each commit going forward.** The IKEA Rule: one card, one feature, one commit, one verifiable step.

**Check the spec before writing code.** Every time. No exceptions.

## What's on Sandbox

- Checkup flow: works
- Monday email: works manually, cron blocked by conductor gate
- Mailgun: works (proven today)
- Google Places API: works
- Stripe billing: works
- BullMQ: works
- Database: 59 migrations, real customer data
- /home (five-page v2): renders, needs real data verification
- /dashboard (V1): crashes (BillingPromptBar.tsx ttfvData.signals undefined)
- 62 agents: mostly unverified, gray dots
- Admin panels: functional but data accuracy issues

## Customers (Real People Paying Real Money)

- Garrison Orthodontics ($2,000/mo)
- Artful Orthodontics ($1,500/mo)
- DentalEMR ($3,500/mo)
- Caswell Orthodontics ($5,000/mo)
- One Endodontics ($1,500/mo)
- McPherson Endodontics (not yet billing, first email sent today)

## The Quadrant

|  | Visible results | No visible results |
|---|---|---|
| Zero behavior change | Owner.com, GLP-1, Netflix = $1B | Agencies with PDFs = churn |
| New behavior required | Gym with trainer = some retention | Dashboard nobody opens = dead |

Alloro must be top-left. The product does the work. The owner sees results. Zero behavior change required.

## The Test

Would a business owner at 10pm, tired, mildly anxious, skeptical of everything, understand this immediately and know exactly what to do next?

If yes, ship it. If not, simplify it.
