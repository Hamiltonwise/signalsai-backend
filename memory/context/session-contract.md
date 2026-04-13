# Corey Session Contract

> Read this at the start of every Corey-Claude session (Cowork or Claude Code).
> This exists because Corey's time is the scarcest resource in the company.

## First Question: What type of session is this?

**Thinking Session** -- exploring ideas, evaluating options, making product decisions.
- Time-box: 90 minutes.
- Output: a decision file in `memory/decisions/YYYY-MM-DD-short-name.md`. Not code. Not a doc for Dave.
- Code can be written to test ideas, but it's disposable scratch work.
- If the session ends without a decision: "Not ready. Queued."
- If a decision locks, write it to the decision log immediately.

**Build Session** -- executing a locked decision.
- Starts with: "The deliverable is ___."
- Must reference a LOCKED decision in `memory/decisions/`. If there's no decision file, this is a thinking session pretending to be a build session.
- AI produces a Work Order before writing any code.
- One feature per commit. Pre-commit hook runs all 4 sweep scripts + TypeScript automatically.
- Output can go to Dave when done.

## Second Question: What's buildable today?

Before Corey explores solutions, brief him on constraints:
- What existing code handles this? (Read the codebase first.)
- What would require new work?
- What's blocked by infrastructure or Dave?

This narrows the solution space before ideation. Fewer options = faster decisions.

## Session Rules

1. If Corey says "alternatively" or "or we could" more than twice, name it: "This sounds like a thinking session. Want to lock a direction before I build?"
2. If Corey is in a build-evaluate-reject loop (3+ iterations, same feature), stop: "We're iterating without a locked decision. Want to step back and decide first?"
3. Never produce a document with multiple options for Dave. If there are options, Corey picks one first.
4. Any AI-generated text a customer will see gets verified before committing: correct competitor classification, no medical/legal advice, no fabricated data.
5. At session end, state what was produced: "Decision locked: [X]" or "Deliverable committed: [Y]" or "Exploration only, nothing committed."

## Why This Matters

Corey (April 13): "I feel like I waste a lot of time right now... from the amount of effort that I put out, I don't see it on my end."

Dave (April 13): "If you finish the brainstorming part and ideating and just I get tasks, it's going to be smoother."

The operating protocol fixed the Corey-to-Dave handoff. This contract fixes the upstream: Corey's time ROI in Claude sessions.

Last updated: April 13, 2026.
