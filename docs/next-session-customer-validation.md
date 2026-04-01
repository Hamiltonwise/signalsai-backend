# Next Session Prompt -- Customer Validation Sweep

## The Mission
Alloro doesn't build custom dashboards for each customer. Alloro builds ONE product so intelligent that every customer feels like it was built for them. The way Google doesn't have a different search page for doctors vs barbers vs lawyers. One box. Every answer. Personalized by what it knows about you, not by a custom template.

This session validates that the ONE product meets or exceeds the needs of every paying customer BEFORE they have to ask. The Google moment: eliminate the question. SpaceX: test every system before humans board.

Copy everything below this line into a new Claude Code session:

---

Read every memory file indexed in /Users/coreys.air/.claude/projects/-Users-coreys-air-Desktop-alloro/memory/MEMORY.md. Read them ALL before doing anything. The critical ones:

1. user_corey_deep.md -- who you're building for
2. user_corey_profile.md -- how he thinks and decides
3. project_session_apr1_final.md -- complete state from last session, 41 commits, what shipped
4. feedback_google_moment.md -- THE foundational analogy. Library -> Google -> Alloro. Alloro eliminates the question, not just the search.
5. feedback_b2c_not_b2b.md -- Alloro serves a PERSON, not a business
6. feedback_oz_effect.md -- "how did they know that?" moments
7. feedback_rube_goldberg_principle.md -- every feature connects to the next
8. user_merideth_profile.md -- DentalEMR CEO profile (for context on partner customers)

Read the Design Philosophy: https://www.notion.so/334fdaf120c48184907ef6c11a6bec8d
Read Mission, Vision, Values: https://www.notion.so/327fdaf120c481eaa078e3e9e71f62aa
Read Claude's Corner: https://www.notion.so/330fdaf120c481ea95fccb43650bfd0a

## Phase 1: Deep Research -- Know Every Customer

Search Fireflies for ALL transcripts involving each paying customer. Read them LINE BY LINE. Not summaries. The actual words. These are the people paying $13,500/month (now $15,000 with Artful's first payment through Stripe).

**Artful Orthodontics ($1,500/month) -- Dr. Pawlak**
- Search Fireflies: keyword "Artful", keyword "Pawlak", participants with artful domain
- Search Slack: DMs with Dr. Pawlak or any Artful contacts, any channel mentioning Artful
- Find: What did she ask for? What frustrated her? What delighted her? What questions has she asked that the product should answer before she asks again? She JUST paid $1,500 through Stripe. What made her decide today?

**Garrison Orthodontics ($2,000/month) -- Dr. Copeland**
- Search Fireflies: keyword "Garrison", keyword "Copeland"
- Search Slack: any messages about Garrison
- Find: Same questions. What does he need? What has he complained about? What would make him say "how did they know that?"

**One Endodontics ($1,500/month) -- Kargoli team (Kuda, Tylene, Feras)**
- Search Fireflies: keyword "Kargoli", keyword "One Endo", keyword "1Endo"
- Search Slack: any messages about One Endo or Kargoli
- Find: They have 5 locations. Multi-location is their reality. Does the product handle their world? What do they need that a single-location practice doesn't?

**Caswell Orthodontics ($5,000/month) -- 3 locations**
- Search Fireflies: keyword "Caswell"
- Search Slack: any messages about Caswell
- Find: They're the biggest customer. $5,000/month across 3 locations. What are they getting for that money? What should they be getting?

**DentalEMR ($3,500/month) -- Merideth, Jay, Rosanna**
- Already profiled deeply. Read user_merideth_profile.md. But search for any NEW transcripts or messages since April 1.
- They're a software company, not a practice. Different needs. Different dashboard. Being handled in a separate session.

**McPherson Endodontics ($0/month beta) -- Shawn**
- Search Fireflies: keyword "McPherson", keyword "Shawn"
- Search Slack: any messages about McPherson
- Find: He's the beta tester. He's a veteran (RISE Scholar #1). What has he reported? What's working? What isn't? What would convert him from $0 to paying?

## Phase 2: The Universal Needs Map

After reading EVERY transcript and message, build a map:

| Need | Artful | Garrison | One Endo | Caswell | McPherson | Universal? |
|------|--------|----------|----------|---------|-----------|------------|
| See competitive position | ? | ? | ? | ? | ? | ? |
| Monday email with finding | ? | ? | ? | ? | ? | ? |
| Referral source tracking | ? | ? | ? | ? | ? | ? |
| Website that converts | ? | ? | ? | ? | ? | ? |
| Review velocity tracking | ? | ? | ? | ? | ? | ? |
| Multi-location support | N/A | N/A | YES | YES | N/A | No |
| ... | | | | | | |

The "Universal?" column is the key. If 4 of 5 customers need it, the ONE product should deliver it. If only 1 needs it, it's a vertical or tier feature, not a core feature.

## Phase 3: The Gap Analysis

For each universal need, check: does the current product deliver it?

- If YES: verify it works. Run it. Screenshot it. Confirm the customer would actually see it.
- If NO: flag it. What would it take to add it? Is it a backend data issue, a frontend display issue, or a missing feature entirely?
- If PARTIALLY: what's missing? Is it 80% there and needs polish, or 20% there and needs a rebuild?

## Phase 4: The "Before They Ask" Audit

For each customer, list:
1. The top 3 questions they've asked in calls/messages
2. Whether the product currently answers those questions WITHOUT them asking
3. If not, what would need to change so the Monday email or dashboard pre-answers it

This is the Google moment test. If Dr. Pawlak has to call Corey to ask "why did my ranking drop?", the product failed. The Monday email should have told her before she noticed.

## Phase 5: The Simulation

Walk through the product as each customer:
1. Log in as their account (or use the "Customer View" toggle from admin)
2. Screenshot every page they'd see
3. For each page: does this feel like it was built by a company with 10,000 clients? Or does it feel like a beta product?
4. What's the FIRST thing they see? Is it the most important thing for THEM?
5. What's missing that they asked for in a call?

## Phase 6: Fix Everything

Fix every gap found. One commit per fix. Verify TypeScript compiles after each. The goal: after this session, ANY customer could log in and feel like Alloro was built for them, without a single custom template.

## Rules

- This is NOT about building custom dashboards. It's about making ONE product universally intelligent.
- The vocabulary system handles language (customer vs patient). The scoring should handle vertical calibration. The Monday email should handle personalization. ONE product. Every customer feels seen.
- Never use em-dashes in any output.
- Before every commit: `cd frontend && npx tsc -b --force && npm run build` must be zero errors.
- Before every commit: `npx tsc --noEmit` from repo root must be zero errors.
- Never push to main. Always sandbox.
- If you find something that contradicts what's in memory, flag it. Fresh data wins over stale memory.
- If you're uncertain about what a customer needs, ASK COREY. Don't guess. Don't build the wrong thing.

## The Standard

When this session is complete, Corey should be able to send the Alloro link to any of the 6 customers and know, with green confidence, that they'll see something that makes them say "how did they know that?" Not because we built something custom. Because the product is that intelligent.

One search box. Every answer. Personalized by what it knows about you.

That's the Google moment. Build to that.
