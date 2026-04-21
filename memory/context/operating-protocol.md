# Alloro Operating Protocol

## The Problem This Solves

Corey thinks in customer experience and product outcomes (descriptive).
Dave thinks in files, endpoints, and blast radius (prescriptive).
Neither output is natively consumable by the other.

Previous attempts: Corey sent high-level vision docs to Dave. Dave couldn't act on them. Outputs ended up "all over the place." Both sides frustrated despite being fully aligned on vision.

The breakthrough (April 10-11, 2026): Corey produced a Product Map doc that was prescriptive -- "build this" not "achieve this" -- and Dave's agents consumed it immediately. Dave called it the best handoff yet.

The system below makes that breakthrough repeatable without Corey doing the translation himself.

## Three Roles, Three Languages

### Corey (Visionary) -- Owns Intent
- Output: descriptive. Outcomes, feelings, customer experience, corrections.
- Examples of valid Corey input:
  - "I pilot in and the fonts are all over the place. Fix it."
  - "The dashboard should feel like Oura."
  - "The email is not the product. Stop building email-first."
  - "This page doesn't tell a story. What's the most surprising thing?"
- Corey does NOT need to: name files, write specs, sequence cards, define blast radius.
- Corey DOES need to: approve Red blast radius, make product decisions, define what "done" looks like from the customer's chair.

### AI (Translator + Builder) -- Owns Translation and Execution
- Input: Corey's descriptive intent.
- Output: prescriptive specs Dave can act on + working code in sandbox.
- Translation steps:
  1. Read Corey's intent.
  2. Read the codebase, design system, Product Constitution.
  3. Produce a Work Order: files, line numbers, blast radius, verification tests.
  4. Build it in sandbox. One commit per feature.
  5. Produce a Dave-ready handoff: changeset summary, blast radius map, card-by-card sequence.
- AI does NOT: approve merges, make product decisions, skip verification.
- AI DOES: catch design system violations, enforce the Product Constitution, translate between descriptive and prescriptive.

### Dave (Engineer) -- Owns Production Truth
- Input: prescriptive specs + working sandbox code.
- What he needs per card:
  - What changed (files, endpoints)
  - Blast radius (Green/Yellow/Red)
  - Verification tests (runnable, specific)
  - Whether it touches: database, auth, billing (yes/no)
  - Code diff against current production
- Dave does NOT: interpret Corey's intent, guess what "feels right," build from abstract goals.
- Dave DOES: verify code quality, ensure API consistency, merge to production, flag risks.

### Jo (Integrator) -- Owns the System (when active)
- Oversees the protocol itself. Are handoffs clean? Is anything stuck?
- Prioritization and sequencing across cards.
- Customer-eye verification: "Does this look right from the client's chair?"
- Does NOT need to translate between Corey and Dave. AI handles that.
- Her return role is system oversight, not grunt-work translation.

## The Handoff Flow

```
Corey describes intent (Slack, conversation, voice memo, whatever)
         |
         v
AI translates to Work Order
  - Files to touch
  - Blast radius
  - Current state -> Target state
  - Verification tests
         |
         v
AI builds in sandbox (one commit per feature, tsc clean)
         |
         v
AI produces Dave-Ready Handoff
  - Changeset summary (files changed, endpoints affected)
  - Blast radius map (touches DB? auth? billing?)
  - Card sequence (simplest first, complexity noted)
  - Verification tests (browser, SQL, Network tab)
  - Done gates between cards
         |
         v
Dave's agents intake spec + sandbox diff
  - Build visual report of changes
  - Validate: design consistent, APIs intact, code matches patterns
  - Execute card by card, test by test
         |
         v
Dave merges to production
```

## Dave-Ready Handoff Format

This is the format Dave's agents work best with (confirmed April 11, 2026):

```
## Card [N]: [Feature Name]
Blast Radius: Green / Yellow / Red
Complexity: Low / Medium / High
Dependencies: [cards that must be done first, or "none"]

### What Changes
- [file]: [specific change description]
- [file]: [specific change description]

### Touches
- Database: yes/no
- Auth: yes/no
- Billing: yes/no
- New API endpoint: yes/no

### Verification Tests
1. [Specific, runnable test]
2. [Specific, runnable test]

### Done Gate
All verification tests pass? Yes = move to next card. No = fix before proceeding.
```

## Corey Input Format

Corey can use ANY of these. All are valid. AI handles the rest.

- Voice memo transcription
- Slack message: "the fonts on Compare page look wrong"
- Conversation: "I want the dashboard to feel calmer"
- Screenshot with annotation
- Product decision: "no composite scores, ever"
- Correction: "stop calling it a practice. It's a business."

The only requirement: Corey states what's wrong or what should be true.
He never needs to say how to fix it.

## Upstream Session Discipline (ADDED April 13, 2026 -- from Corey-Dave transcript analysis)

### The Problem This Solves

The Corey-to-Dave handoff works. The protocol below it works. But Corey's upstream sessions with Claude (Cowork, Claude Code) were producing volume without decisions. Multiple versions of the same feature accumulated in sandbox. Dave received exploratory output disguised as specs. Dave's agents tried to interpret brainstorms, producing inconsistent results. Corey spent hours iterating and felt low ROI on his time.

Dave said it directly (April 13): "If you finish the brainstorming part and ideating and just I get tasks, it's going to be smoother."

Corey said it directly (April 13): "I feel like I waste a lot of time right now... from the amount of effort that I put out, I don't see it on my end."

### Session Types

Every Corey-Claude session is one of two types. Name it at the start.

**Thinking Session** -- exploring, ideating, evaluating options.
- Output: a decision, not code. "We're going with option B because X."
- Code may be written to test ideas, but it's disposable.
- Nothing from a thinking session goes to Dave. Nothing gets committed to sandbox as a feature.
- Time-box: 90 minutes max. If no decision by then, the decision is "not ready."

**Build Session** -- executing a locked decision.
- Starts with: "The deliverable is ___." One sentence. Specific.
- AI produces a Work Order before writing code.
- Code gets committed. One feature per commit.
- Output goes to Dave when ready.

The boundary: if the word "alternatively" or "option" appears in the session, it's a thinking session. Thinking sessions don't produce Dave documents.

### Decision Lock

Before any feature leaves Corey's session for Dave:
1. One direction is chosen. Not three. Not a hybrid. One.
2. The chosen direction is written to `memory/decisions/YYYY-MM-DD-short-name.md` with status LOCKED.
3. AI writes the Work Order against that one direction.
4. Corey confirms: "Lock it."

If Corey can't choose, the feature isn't ready. Queue it. Move to something that is ready.

Build sessions must reference a LOCKED decision file. If there's no decision file, the build session should not start. This is the traceability chain: decision log -> work order -> code -> pre-commit gate -> Dave card.

### AI Content Safety Gate

Any AI-generated text that a customer or prospect will see is treated as Red blast radius, regardless of the feature's blast radius. This includes:
- Checkup results and recommendations
- Competitor analysis and comparisons
- Email copy
- Dashboard narrative text

Verification required before shipping:
- Competitor classification is correct (specialty matches, not just proximity)
- No medical, legal, or compliance-violating advice (HIPAA, etc.)
- No fabricated statistics or revenue figures
- Data matches what a human can verify on Google

### Corey Time ROI Rule

AI should reduce Corey's time per decision, not increase it. If Corey is in a build-evaluate-reject loop for more than 3 iterations on the same feature, stop. The problem is upstream: the decision isn't locked, or the constraints aren't clear enough. Switch to a thinking session and lock the decision before building again.

## Protocol Rules

1. Corey never writes engineering specs. If he's writing file names and line numbers, the system failed.
2. Dave never interprets product intent. If he's guessing what Corey meant, the system failed.
3. AI always reads the Product Constitution and design system before building. No exceptions.
4. Every card has verification tests. Not unit tests. Specific checks a human or agent can run.
5. Cards are sequenced simplest-first. Complexity noted on every card.
6. One feature = one commit = one checkpoint. The IKEA rule still applies.
7. Red blast radius still requires Corey approval before any code. This is non-negotiable.
8. Dave never receives a document with options or alternatives. If there are options, Corey hasn't decided yet.
9. AI-generated customer-facing content is Red blast radius regardless of feature blast radius.
10. Every Corey-Claude session names its type (thinking or build) and its deliverable in the first message.

## When the System Breaks

If any of these happen, stop and fix the system, not the symptom:

- Corey is writing specs -> AI should be translating. Something is wrong with the handoff.
- Dave is confused by a handoff -> the spec wasn't prescriptive enough. Rewrite it.
- Outputs are "all over the place" -> too many things changed at once. Break into smaller cards.
- Dave stalls -> he's missing information. Ask what's unclear, don't push harder.
- Corey is frustrated by visuals -> design system sweep needed before feature work.
- Multiple versions exist in sandbox with no decision -> thinking session didn't finish. Lock it before building more.
- Corey feels low ROI on time spent -> build-evaluate-reject loop. Stop building, lock the decision upstream.
- Dave's agents produce inconsistent output -> they received brainstorm, not spec. Check for "alternatively" in the source doc.

## Canonical Examples

**Rule One (shape):** The canonical example is the April 10, 2026 Migration Manifest, mirrored to Notion at https://www.notion.so/349fdaf120c4810aa045dfa4124ffa68 and described in detail in the Dave-Ready Handoff Format section above. Before producing any Dave-bound handoff, open the canonical example and match its shape: Card Sequence summary table at the top, detailed cards below with done gates between. Do not reason toward the format from principle. Open the artifact and modify it. Canonical until superseded by a dated replacement.

**Rule Two (remove-jargon test):** Before any Dave-bound handoff is considered complete, strip the technical language and produce three sections in plain English: **What it is** (one sentence, no jargon), **How it works** (4-5 numbered steps), **What it achieves** (outcomes for the user and outcomes for the business). If the plain version does not cohere, the technical version has hidden complexity. Catch it before Dave's agents have to.

Catalyst: Dave's April 20 PatientPath intake. He asked his agents to "remove the jargon and just give me its purpose, what needs to be built as a feature and how." His agents produced:

- **What PatientPath is:** A feature inside Alloro that auto-builds a practice's website before the doctor ever logs in.
- **How it works (4 steps):**
  1. Scrape the practice's public data (Google Business Profile, reviews, competitors)
  2. AI agent #1 turns that into a structured brief about the practice
  3. AI agent #2 turns the brief into website copy
  4. System publishes a preview site, then emails the doctor "your site is ready"
- **What it achieves:**
  - Doctor signs up and a working personalized site already exists. Removes the "build your site" friction from onboarding.
  - Reuses the same pipeline across verticals later (rename to ClearPath, swap config, run for chiropractors/PT/optometry).

Pass criterion: the plain version coheres on its own. A non-technical person reads it and understands the feature without referring to the technical spec. Failure mode: incoherent plain version means hidden complexity in the technical version.

Rule One governs format. Rule Two governs underlying clarity. Both must pass before any handoff ships.

## Living Document

This protocol evolves. When something doesn't work, update this doc.
Last updated: April 21, 2026 (added Rule Two remove-jargon test from Dave's April 20 PatientPath intake).
