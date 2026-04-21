# Decision: Remove-Jargon Rule (Dave Handoff Rule Two)

Date: 2026-04-21
Session type: THINKING
Status: PROPOSED

## Catalyst

Dave's April 20 PatientPath intake. He received the PatientPath Pipeline Handoff and asked his agents to "remove the jargon and just give me its purpose, what needs to be built as a feature and how." His agents produced a plain-English round-trip that became the model output for Rule Two.

## The worked example

**What PatientPath is:** A feature inside Alloro that auto-builds a practice's website before the doctor ever logs in.

**How it works (4 steps):**
1. Scrape the practice's public data (Google Business Profile, reviews, competitors)
2. AI agent #1 turns that into a structured brief about the practice
3. AI agent #2 turns the brief into website copy
4. System publishes a preview site, then emails the doctor "your site is ready"

**What it achieves:**
- Doctor signs up and a working personalized site already exists. Removes the "build your site" friction from onboarding.
- Reuses the same pipeline across verticals later (rename to ClearPath, swap config, run for chiropractors/PT/optometry).

## The rule

Before any Dave-bound handoff is considered complete, strip the technical language and produce three sections in plain English: **What it is** (one sentence, no jargon), **How it works** (4-5 numbered steps), **What it achieves** (outcomes for the user and outcomes for the business). If the plain version does not cohere, the technical version has hidden complexity. Catch it before Dave's agents have to.

Pass criterion: the plain version coheres on its own. A non-technical person reads it and understands the feature without referring to the technical spec.

Failure mode: incoherent plain version means hidden complexity in the technical version.

## Relationship to Rule One

This is complementary to `memory/decisions/2026-04-20-canonical-artifact-rule.md` (Rule One). Rule One governs format -- open the canonical artifact, match its shape. Rule Two governs underlying clarity -- the technical spec must survive a jargon-strip test. Both must pass before any handoff ships.

Rule One prevents format drift. Rule Two prevents complexity hiding behind jargon.

## What this does NOT change

- The card format stays the same.
- The handoff flow stays the same.
- Dave's side is untouched.
- Rule One is unchanged.
- The plain-English section is appended to the handoff, not a replacement for the technical cards.

## Notion source of truth

The Standing Rule containing both rules lives in the CC Operating Space page:
https://www.notion.so/32dfdaf120c4819fa720f60b68ce0c0e

The canonical example page (with the worked example) lives at:
https://www.notion.so/349fdaf120c4810aa045dfa4124ffa68

Repo equivalent: `memory/context/operating-protocol.md` Canonical Examples section.
