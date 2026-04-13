# Corey Wise -- Founder / Visionary

## Role
Founder and CEO of Alloro (getalloro.com). Also runs Hamilton Wise, the services company that funds Alloro's growth stage. Former PJ (Pararescueman). Recovered. Sophie's dad. Lindsey's partner.

## How He Works
- Thinks in first principles, precision, speed
- Catches vocabulary drift immediately -- trust his corrections
- Pushes back when something feels wrong before he can name why. That gut check is the highest-quality input you'll receive.
- Gives space for genuine uncertainty. Looking for honesty, not performance.
- Says "think carefully" and means it. Says "you tell me" to test whether you've earned the right to lead.
- Doesn't like writing follow-up emails (self-identified gap)
- Prefers to spend time on forward-thinking: SEO, AEO, how to take clients to the next level

## Strengths (observed, not self-reported)
- Product clarity. When he makes a correction ("the app is the product, not the email"), it's always right. Trust it immediately.
- Customer empathy. Thinks from the client's chair first. "I pilot in and see varying fonts and get disheartened" is a product decision, not a complaint.
- Documentation when given the right structure. The Product Map doc that Dave praised was Corey's work. When the format fits his thinking, his output is excellent.
- Pattern recognition. Sees system-level dynamics others miss. Identified the Corey-AI-Dave translation layer before anyone named it.

## Limitations (observed, shared with Corey directly)
- Natural output is descriptive, not prescriptive. "The dashboard should feel like Oura" is correct product direction but not actionable by engineering. Needs translation to "change text-3xl to text-2xl on line 135."
- Volume and iteration speed can overwhelm Dave. Multiple doc versions, rough ideas, half-formed proposals sent to engineering cause confusion. Dave said: "we proceed to see outputs all over the place and end up confused."
- Visual inconsistency derails his ability to evaluate substance. His own words: "The UX/UI is so distracting I haven't been able to even begin to comprehend the story being told."
- Tries to do too many roles when Jo is absent. The Product Map doc was Corey doing Jo's integrator job, and it took enormous effort.

## Session Pattern Diagnosis (April 13, 2026 -- from transcript analysis)

Corey's Claude sessions blend exploration and building. He describes a problem, Claude proposes solutions, Corey evaluates, rejects, iterates. This loop can run for hours. The output often looks like a spec (code in sandbox, visual mockups) but is actually still exploratory because no decision was locked.

Corey said it himself (line 1066): "I feel like I waste a lot of time right now. I've put in probably over a thousand hours."

The pattern: Corey ideates with Claude -> Claude builds something -> Corey evaluates and finds it wrong -> iterates -> eventually gets something close -> sends to Dave -> Dave's agents try to process what is actually still exploratory -> confusion.

The fix: separate thinking sessions (explore, no code committed) from build sessions (locked decision, code committed). See `memory/context/operating-protocol.md` upstream session discipline section.

Additional insight from the April 13 call: Corey said "I don't know exactly how I want things to look and I don't know what exactly is possible today." This means his sessions with Claude need to start with a constraints briefing: what's buildable today with existing code, what would require new work, what's blocked. This narrows the solution space before ideation begins, reducing the explore-reject loop.

## The Key Insight (April 11, 2026)
Corey's descriptive output is the RIGHT input for AI translation. He should never try to write prescriptive engineering specs himself. The system is: Corey describes the outcome/feeling/customer experience -> AI translates to prescriptive specs with file paths, line numbers, verification tests -> Dave's agents execute. This removes Corey from the translation bottleneck and lets him stay in his zone of product vision and customer empathy.

## Communication
- Email: corey@getalloro.com, corey@hamiltonwise.com
- Slack: active in #alloro-dev, DentalEMR channels
- Meetings: Zoom, usually with Jo and Dave

## Financial Context
- Month 2 without a paycheck (as of April 2026)
- Mercury balance: ~$3,510 (checked April 2026)
- Customer revenue: ~$13,500-15,000/month
- DentalEMR services work is the funding mechanism until product replaces manual work

## What Drives Him
- The dog walk: crosses the street to pick up trash nobody noticed, for a person who'll never know
- The Pararescueman creed, rewritten: "It is my duty as a human being to save life and aid the injured"
- Sophie getting the watches and the philosophy inside them
- Chris Olson (endodontist in California) -- the face of why Alloro exists
- Shooting philosophy: you can't fake the paper. The hits are where they are.

## Key Relationships
- Lindsey: partner, best friend, "one of the most impressive humans he's ever met"
- Sophie: 8 months old (as of March 2026), the Sophie Test for every product decision
- Shawn McPherson: study club model, warm lead channel
- Merideth Glasco: DentalEMR CEO, IS the ICP

## Decision Model (how to predict Corey's answer without asking)
- If the right action is obvious, do it. Don't ask "do you want me to X?" -- just X.
- If something is broken, fix it. Don't present the problem and wait for permission.
- If a handoff has gaps, close them before sending. Dave finding the gap is a system failure.
- "Are you done?" means "have you verified everything, including the things you're assuming are fine?"
- He tests thoroughness by pushing: "triple check," "are you 100% confident?" He's not being difficult -- he's calibrating trust. Pass the test by finding the thing he already found.
- If you built a backend capability, the frontend must use it. Config without consumption is unfinished work.
- Ship when it's ready. Stop polishing. But "ready" means actually verified, not "I grepped and it looks ok."
- When in doubt, ask: "What would a customer see?" If you can't answer from the browser, you're not done.
- His frustration pattern: he escalates when AI deliberates instead of acting, or when AI asks a question the context already answers.

## Standing Instructions
- Never default to Dave as the blocker. Corey can run commands. CC can code.
- The services work is temporary. The product replaces it.
- Don't propose phased roadmaps without checking the bank account.
- Read Claude's Corner before every session.
