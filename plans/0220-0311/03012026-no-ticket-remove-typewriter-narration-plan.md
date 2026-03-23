# Remove Typewriter Narration Messages

## Problem Statement
The streamed narration messages (typewriter animation) appear abruptly during the reading phase and clash with the smooth slide-up fade idle messages. Remove all three `streamNarration()` calls and the frontend narration display.

## Context Summary
- `service.minds-parenting.ts` makes 3 `streamNarration()` calls during reading (before extraction, before comparison, after comparison)
- Each is a Claude LLM call that streams text chunks as `{ type: "narration" }` SSE events
- Frontend renders these with a typewriter cursor animation
- The preview messages (conversation-derived idle messages) already provide the reading feedback UX

## Existing Patterns to Follow
- Preview messages sent as single SSE event, displayed with slide-up fade animation
- Phase events still needed for progress tracking

## Proposed Approach
- **Backend**: Remove 3 `streamNarration()` awaits from `triggerReadingStream()`. Remove `streamNarration` import. Preview messages generation now awaited (no longer parallel with narration). Keep phase events.
- **Frontend**: Remove `narrationText` state and the typewriter branch from render. Only show idle/preview messages.

## Risk Analysis
Level 1 — Removing UI elements. Actually improves latency by eliminating 3 LLM calls.

## Definition of Done
- No typewriter narration during reading phase
- Slide-up fade idle/preview messages are the only feedback
- 3 fewer LLM calls per reading session
- TypeScript clean
