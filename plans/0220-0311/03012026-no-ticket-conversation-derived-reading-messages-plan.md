# Conversation-Derived Reading Messages

## Problem Statement
During the reading phase, the idle messages shown between narration events are generic ("Scanning for new patterns...", "Cross-referencing with what I already know..."). They should be generated from the actual conversation content — e.g., "Learning that I should always recommend X...", "Noting your preference for Y...". Generic messages are only the fallback while waiting for meaningful ones to arrive.

## Context Summary
- `service.minds-parenting.ts` orchestrates reading: narration → extraction → narration → comparison → narration → complete
- Between narration LLM calls and extraction/comparison LLM calls, there's dead time with no SSE events
- `ParentingReadingView.tsx` cycles through hardcoded `IDLE_MESSAGES` every 3s during dead time
- Conversation messages are available via `MindParentingMessageModel.listBySession(sessionId)`
- SSE events use `onEvent({ type, ... })` pattern

## Existing Patterns to Follow
- SSE event structure: `{ type: string, [key: string]: any }`
- LLM calls use `getClient()` from parenting-chat service
- `streamNarration()` pattern for quick Claude calls with personality

## Proposed Approach

### Backend: Generate preview messages early
In `service.minds-parenting.ts`, right after loading messages and before Narration 1:
1. Make a fast Claude call (non-streaming, max 300 tokens) with the conversation transcript
2. Prompt: generate 10-15 short first-person loading messages based on what was discussed
3. Send them as a single SSE event: `{ type: "preview_messages", messages: string[] }`
4. New function `generatePreviewMessages()` in `service.minds-parenting-chat.ts`

### Frontend: Consume preview messages
In `ParentingReadingView.tsx`:
1. Add state for `previewMessages: string[]`
2. Listen for `preview_messages` SSE event, store the messages
3. When cycling idle text: use `previewMessages` if available, fall back to `IDLE_MESSAGES`
4. Show preview messages when `narrationText` is empty (same condition as current idle)

## Risk Analysis
Level 1 — Minor UX improvement. One additional LLM call (~300 tokens) at start of reading. Non-blocking to the main flow since narration starts immediately after.

## Definition of Done
- Preview messages generated from conversation content arrive before extraction phase
- Frontend cycles through conversation-derived messages every 3s
- Generic messages shown only as fallback until preview messages arrive
- No regression in narration streaming behavior
