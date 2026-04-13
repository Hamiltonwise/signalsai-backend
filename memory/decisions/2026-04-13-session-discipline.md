# Decision: Session Discipline System

Date: 2026-04-13
Session type: THINKING
Status: LOCKED

## What was decided
All Corey-Claude sessions declare a type (THINKING or BUILD) at start. Thinking sessions produce decisions, not code. Build sessions start from locked decisions, not open questions. Four sweep scripts run as a pre-commit hook, blocking the commit if they fail.

## Why
Fireflies transcript analysis (April 13) showed the same pattern Dave described: experimental code reached him as if it were decided. Corey spent 1000+ hours in sessions that blurred exploration and execution. The root cause is structural -- nothing in the workflow forced a decision to lock before code was written.

## What this means for code
- .git/hooks/pre-commit: hard gate running all 4 sweep scripts + TypeScript
- memory/context/session-contract.md: read at every session start
- CLAUDE.md: Session Discipline section + updated Session Start sequence
- memory/context/operating-protocol.md: upstream session discipline added

## What this does NOT mean
This doesn't change the Dave handoff format (cards are still the unit). It doesn't add process to Dave's side. All changes are upstream of Dave.

## Lock confirmation
Corey: "I would much prefer if you took this information to analyze and evaluate everything you possibly can in order to try to find an effective and efficient solution."
Corey then reviewed the combined CC + Cowork analysis without objection.
