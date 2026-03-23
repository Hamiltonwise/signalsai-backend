# Minds UX Polish

## Problem Statement
Four UX issues in the Minds knowledge sync flow:
1. Static "Extracting knowledge..." message during reading — should cycle dynamic messages
2. Approve/reject/undo/approve-all buttons have no loading states
3. "Compile & Publish" label should be "Remember"

## Context Summary
- `ParentingReadingView.tsx` — reading phase with SSE streaming, shows static fallback text per phase
- `ParentingProposals.tsx` — parenting flow proposals with approve/reject/undo/bulk approve + compile
- `SlideProposalsReview.tsx` — wizard flow proposals with same buttons + compile
- `MindKnowledgeSyncTab.tsx` — sync tab with compile button and run type labels

## Existing Patterns to Follow
- AnimatePresence + motion for text transitions already in ParentingReadingView
- ActionButton component supports `loading` prop
- Individual button loading tracked via state (e.g., `compileStarting`)

## Proposed Approach

### Task 1: Dynamic reading messages
- Add a `useEffect` timer in `ParentingReadingView` that cycles through contextual messages every 3 seconds
- Messages are playful, POV-style: "Scanning for new patterns...", "Cross-referencing with what I already know...", etc.
- Only shown when `narrationText` is empty (before streaming narration arrives)

### Task 2: Loading states for action buttons
- In both `ParentingProposals.tsx` and `SlideProposalsReview.tsx`:
  - Track `actioningId` state (which proposal is being actioned)
  - Show spinner on the active button, disable others
  - Track `bulkApproving` state for "Approve all"

### Task 3: Rename "Compile & Publish" → "Remember"
- All label instances across: `ParentingProposals.tsx`, `SlideProposalsReview.tsx`, `MindKnowledgeSyncTab.tsx`
- Toast messages too

## Risk Analysis
Level 1 — Minor UI polish. No structural impact.

## Definition of Done
- Reading view cycles through dynamic messages every 3s
- All approve/reject/undo/approve-all buttons show loading state
- "Compile & Publish" renamed to "Remember" everywhere
