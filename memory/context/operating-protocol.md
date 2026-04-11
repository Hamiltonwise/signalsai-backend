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

## Protocol Rules

1. Corey never writes engineering specs. If he's writing file names and line numbers, the system failed.
2. Dave never interprets product intent. If he's guessing what Corey meant, the system failed.
3. AI always reads the Product Constitution and design system before building. No exceptions.
4. Every card has verification tests. Not unit tests. Specific checks a human or agent can run.
5. Cards are sequenced simplest-first. Complexity noted on every card.
6. One feature = one commit = one checkpoint. The IKEA rule still applies.
7. Red blast radius still requires Corey approval before any code. This is non-negotiable.

## When the System Breaks

If any of these happen, stop and fix the system, not the symptom:

- Corey is writing specs -> AI should be translating. Something is wrong with the handoff.
- Dave is confused by a handoff -> the spec wasn't prescriptive enough. Rewrite it.
- Outputs are "all over the place" -> too many things changed at once. Break into smaller cards.
- Dave stalls -> he's missing information. Ask what's unclear, don't push harder.
- Corey is frustrated by visuals -> design system sweep needed before feature work.

## Living Document

This protocol evolves. When something doesn't work, update this doc.
Last updated: April 11, 2026.
