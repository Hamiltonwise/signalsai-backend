# Fix Parenting "Ready to Learn" Flow

## Problem Statement
When clicking "Ready to Learn" in a parenting session, the user gets kicked to the sessions list instead of seeing the proposals/diff table. The backend comparison returns 0 proposals when the brain is empty (new mind), and the frontend uses `window.location.reload()` as a fallback.

## Context Summary
- Backend `triggerReading` is synchronous (~5s) — extracts knowledge, compares against brain, returns proposal count
- When `currentBrain` is empty string, the comparison LLM sees blank brain context and returns `[]` instead of NEW proposals
- Frontend `ParentingChat.tsx` line 232-236: `if (proposalCount === 0) → window.location.reload()` — terrible UX
- Session data confirms: `status: "completed"`, `result: "no_changes"`, `sync_run_id: null` — never reached proposals step

## Existing Patterns to Follow
- Synchronous backend processing pattern (keep as-is, no need for async queue)
- `handleOpenSession` pattern for re-fetching session data after state transitions
- `onTriggerReading` callback from ParentingChat → MindParentingTab

## Proposed Approach

### Backend Fix — `service.minds-comparison.ts`
- When `brainContext` is empty/blank, replace it with an explicit marker: "(EMPTY — the agent has no knowledge base yet. ALL content from the scraped section should be proposed as NEW entries.)"
- This gives the comparison LLM clear instructions to generate NEW proposals for everything

### Frontend Fix — `ParentingChat.tsx`
- Remove `window.location.reload()` entirely
- Change `onTriggerReading` callback to pass `proposalCount` so parent can decide behavior
- Always call `onTriggerReading(proposalCount)` after successful trigger

### Frontend Fix — `MindParentingTab.tsx`
- Update `onTriggerReading` handler to accept `proposalCount`
- Re-fetch session details (silently, no loading spinner) to get updated status + proposals + messages
- If proposals: session transitions to "proposals" view naturally
- If no proposals: session transitions to "completed" view (read-only chat with system message)
- Show appropriate toast

## Risk Analysis
- **Level 1**: Small, targeted changes. No new patterns introduced.
- Comparison prompt change might need tuning if LLM still returns `[]` — but explicit instructions should work.

## Definition of Done
- Empty brain minds generate NEW proposals when taught something
- Frontend never calls `window.location.reload()`
- "No proposals" case shows completed session inline (read-only chat + toast)
- "Has proposals" case transitions to proposals/diff view correctly
- TypeScript clean on both sides

## Execution Log

### Backend: `service.minds-comparison.ts`
- Added `brainDisplay` variable: when `brainContext` is empty, replaces with explicit marker telling LLM all content is NEW
- This prevents the LLM from returning `[]` when comparing against an empty brain

### Frontend: `ParentingChat.tsx`
- Changed `onTriggerReading` callback type from `() => void` to `(proposalCount: number) => void`
- Removed `window.location.reload()` entirely
- Removed the `proposalCount === 0` branch — always passes result to parent

### Frontend: `MindParentingTab.tsx`
- Updated `onTriggerReading` handler to accept `proposalCount`
- After trigger completes, re-fetches session via `getParentingSession` to get updated status, messages, and proposals
- If no proposals: shows toast "No new knowledge found", session renders as completed (read-only chat with system message)
- If proposals: session transitions to "proposals" view naturally via the re-fetched status

### TypeScript
- Frontend: clean
- Backend: clean (pre-existing errors in unrelated files only)
