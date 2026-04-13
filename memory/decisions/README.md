# Decision Log

Every THINKING session that produces a locked decision writes it here.
Every BUILD session reads from here before writing code.

## Format

One file per decision. Filename: `YYYY-MM-DD-short-name.md`

```
# Decision: [Short Name]

Date: YYYY-MM-DD
Session type: THINKING
Status: LOCKED / SUPERSEDED / REVERTED

## What was decided
[One paragraph. The decision, not the reasoning.]

## Why
[What constraint, data, or principle drove this. 2-3 sentences max.]

## What this means for code
[Which files, routes, or components are affected. What changes.]

## What this does NOT mean
[Scope boundary. What was explicitly excluded or deferred.]

## Lock confirmation
Corey said: "[exact quote or paraphrase]"
```

## Rules

1. Only THINKING sessions write here. BUILD sessions read.
2. A decision is LOCKED when Corey confirms it. Not before.
3. If a decision is reversed, mark it SUPERSEDED with a link to the new decision. Don't delete.
4. Dave never receives a task that doesn't trace back to a LOCKED decision in this log.
5. If you're about to build something and can't find the decision here, stop. It's a thinking session pretending to be a build session.
