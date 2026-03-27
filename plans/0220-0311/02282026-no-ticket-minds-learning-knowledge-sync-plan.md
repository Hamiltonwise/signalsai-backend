# Minds Learning & Knowledge Sync — Compile Fixes, Dark Mode, Agent Parenting

**Date:** 02/28/2026
**Ticket:** --no-ticket
**Execution:** 3 tickets, sequential (1 → 2 → 3)

---

## Problem Statement

Three interconnected issues in the Minds feature:

1. **Compile refresh bug** — Clicking "Compile & Publish" shows compiling UI, but refreshing the page loses the compile state. The wizard dumps the user back to the proposals review with approved proposals still visible. The BullMQ job runs in the background but nobody resumes polling.

2. **Dark mode gaps in University tab** — All 5 wizard components have hardcoded light-mode colors (23+ in SlideProposalsReview alone) that don't respect the `.minds-theme` dark scope.

3. **No manual knowledge teaching mechanism** — University auto-discovers and scrapes external sources. There's no way for an admin to teach the agent directly through conversation, paste custom text, or manually feed knowledge from their own expertise.

---

## Context Summary

### Compile Bug Root Cause
- `deriveSlide()` in `KnowledgeSyncWizard.tsx` (line 108) checks `statusData.activeSyncRunId` but doesn't check the **type** of the active run
- When a `compile_publish` run is active, `latestScrapeRunId` differs from `activeSyncRunId`, so the wizard goes to slide 3 in proposals-review mode (not compile mode)
- `SlideProposalsReview` mounts with `compiling = false` — no polling resumes

### Dark Mode Architecture
- App uses `.minds-theme` scoped CSS overrides in `index.css` (lines 420-823)
- Zero `dark:` Tailwind utilities in any component code
- Wizard components use hardcoded `bg-white`, `text-gray-900`, `border-gray-200`, hex values in Framer Motion animations

### Existing Infrastructure for Parenting
- Chat: Streaming SSE via Anthropic SDK, conversations/messages stored in DB
- RAG: pgvector embeddings, `retrieveForChat()` returns top-7 chunks + summary
- Comparison: `compareContent()` takes markdown input → returns typed proposals array
- Compilation: BullMQ worker processes compile_publish jobs (9 steps)
- Models: BaseModel pattern, UUID PKs, `minds` schema, Knex migrations

---

## Existing Patterns to Follow

| Pattern | Location | Notes |
|---------|----------|-------|
| Dark mode overrides | `index.css` lines 420-823 | `.minds-theme` scoped CSS with `!important` |
| DB migrations | `src/database/migrations/` | `YYYYMMDD000NNN_slug.ts`, transaction-wrapped, `minds` schema |
| Models | `src/models/Mind*.ts` | Extend `BaseModel`, static methods, optional `trx` param |
| Controllers | `src/controllers/minds/` | Feature-scoped controllers delegating to feature-services |
| Feature services | `src/controllers/minds/feature-services/` | `service.minds-*.ts` pattern |
| Frontend API client | `signalsai/src/api/minds.ts` | Type-safe functions, SSE streaming support |
| Chat system prompt | `service.minds-chat.ts` `buildSystemPrompt()` | Personality + brain context + rules |
| Streaming SSE | `MindsChatController.ts` `chatStream()` | Headers, `data: {json}\n\n` format, `[DONE]` signal |
| Wizard components | `signalsai/src/components/Admin/minds/wizard/` | Slide-based, AnimatePresence transitions |

---

## Proposed Approach

### Ticket 1: Compile Refresh Bug + Loading Animation

#### 1A. Fix Compile Refresh Persistence

**Backend change — expose run type in status endpoint:**

`service.minds-gating.ts` `getMindStatus()`:
- Add `activeSyncRunType: SyncRunType | null` to the return object
- Populate from the active run's `type` field

**Frontend change — `KnowledgeSyncWizard.tsx`:**

`deriveSlide()` must distinguish compile_publish vs scrape_compare:
```
if (statusData.activeSyncRunId) {
  if (statusData.activeSyncRunType === "compile_publish") {
    // Active compile — go to slide 3 in compile mode
    setScrapeRunIdForProposals(statusData.latestScrapeRunId);
    setInitialCompileRunId(statusData.activeSyncRunId);  // NEW
    return 3;
  }
  // Active scrape — go to slide 2
  setActiveScrapeRunId(statusData.activeSyncRunId);
  return 2;
}
```

New state: `initialCompileRunId` — passed to `SlideProposalsReview` as a prop.

**Frontend change — `SlideProposalsReview.tsx`:**

Add optional prop `initialCompileRunId?: string`. On mount:
```
useEffect(() => {
  if (initialCompileRunId) {
    setCompileRunId(initialCompileRunId);
    setCompiling(true);
    startCompilePolling(initialCompileRunId);
  }
}, []);
```

This resumes polling for the active compile run on refresh.

**Files modified:**
- `signalsai-backend/src/controllers/minds/feature-services/service.minds-gating.ts`
- `signalsai/src/components/Admin/minds/KnowledgeSyncWizard.tsx`
- `signalsai/src/components/Admin/minds/wizard/SlideProposalsReview.tsx`
- `signalsai/src/api/minds.ts` (update `MindStatus` type)

#### 1B. Replace Compile Loading Screen

Remove `SyncStepTimeline` from the compile-in-progress render branch in `SlideProposalsReview.tsx` (lines 259-311).

Replace with a centered creative brain/neural animation:
- Animated brain visualization using SVG + Framer Motion
- Neural network nodes pulsing with connections lighting up
- Rotating status messages cycling through compile steps: "Applying changes...", "Creating new version...", "Publishing...", "Generating embeddings..."
- Fits the "Graduation Ceremony" theme
- Keep the header ("Graduation Ceremony" + description)
- Keep the error state (red alert box + retry button)

The `SyncStepTimeline` component itself is NOT deleted — it's still used by `SlideSyncProgress.tsx` for the scrape_compare phase.

**Files modified:**
- `signalsai/src/components/Admin/minds/wizard/SlideProposalsReview.tsx`
- New: `signalsai/src/components/Admin/minds/wizard/CompileAnimation.tsx`

---

### Ticket 2: Dark Mode for University Tab

Add CSS overrides in `index.css` within the `.minds-theme` scope for all wizard components.

**Components to fix:**

| Component | Key Issues |
|-----------|-----------|
| `KnowledgeSyncWizard.tsx` | `bg-white`, `border-gray-200`, `bg-gradient-to-r from-gray-50 to-white`, `bg-gray-200` inactive step line |
| `SlideDiscoveryTriage.tsx` | `bg-white` post cards, `border-gray-100`, `text-gray-800`, `bg-gray-100` empty state, `hover:bg-gray-100` buttons |
| `SlideSyncProgress.tsx` | `text-gray-900` heading, `text-gray-500` description |
| `SlideProposalsReview.tsx` | `bg-white` proposal cards, `border-gray-200`, `text-gray-900` headings (4x), `text-gray-500` descriptions (4x), `bg-gray-100` progress bar, `bg-green-50` diff sections |
| `SyncStepTimeline.tsx` | `bg-gray-100` connection line, hardcoded `#ffffff` and `#e2e8f0` in Framer Motion `animate` props, `text-gray-300` pending state |

**Approach:**
- Add scoped selectors in `.minds-theme` block in `index.css`
- For Framer Motion hardcoded hex values: use CSS custom properties (e.g., `var(--minds-surface)`) and reference them in the component
- For the timeline's animated `backgroundColor` and `borderColor`: replace hex literals with CSS variable references

**Files modified:**
- `signalsai/src/index.css`
- `signalsai/src/components/Admin/minds/wizard/SyncStepTimeline.tsx` (hex → CSS vars for animations)

---

### Ticket 3: Agent Parenting

#### 3A. Database Schema

New migration: `20260228000001_create_parenting_sessions.ts`

**Table: `minds.mind_parenting_sessions`**
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
mind_id UUID NOT NULL REFERENCES minds.minds(id) ON DELETE CASCADE,
status TEXT NOT NULL DEFAULT 'chatting'
  CHECK (status IN ('chatting', 'reading', 'proposals', 'compiling', 'completed', 'abandoned')),
result TEXT CHECK (result IN ('learned', 'no_changes', 'all_rejected', NULL)),
knowledge_buffer TEXT NOT NULL DEFAULT '',
sync_run_id UUID REFERENCES minds.mind_sync_runs(id) ON DELETE SET NULL,
created_by_admin_id TEXT,
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
finished_at TIMESTAMPTZ
```

**Table: `minds.mind_parenting_messages`**
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
session_id UUID NOT NULL REFERENCES minds.mind_parenting_sessions(id) ON DELETE CASCADE,
role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
content TEXT NOT NULL,
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

**Indexes:**
```sql
CREATE INDEX idx_parenting_sessions_mind ON minds.mind_parenting_sessions(mind_id, status);
CREATE INDEX idx_parenting_messages_session ON minds.mind_parenting_messages(session_id, created_at);
```

#### 3B. Backend Models

**`MindParentingSessionModel.ts`**
- Extends BaseModel, table: `minds.mind_parenting_sessions`
- Methods: `createSession()`, `findById()`, `listByMind()`, `updateStatus()`, `updateBuffer()`, `findActiveByMind()`

**`MindParentingMessageModel.ts`**
- Extends BaseModel, table: `minds.mind_parenting_messages`
- Methods: `createMessage()`, `listBySession()`, `countBySession()`

#### 3C. Backend Services

**`service.minds-parenting.ts`** — Session lifecycle management
- `startSession(mindId, adminId)` → creates session, creates greeting message
- `getSessionDetails(sessionId)` → returns session + messages
- `appendToBuffer(sessionId, content)` → appends to knowledge_buffer
- `triggerReading(sessionId)` → extracts knowledge, runs comparison, creates sync run
- `submitProposals(sessionId)` → triggers compile via existing BullMQ pipeline

**`service.minds-parenting-chat.ts`** — Chat handling
- `buildParentingSystemPrompt(mind, brainContext)` → constructs system prompt with:
  - Personality
  - Full RAG context (every turn)
  - Parenting-specific rules (push-back, proactive suggestions, citation of brain chunks for conflicts)
  - Session flow awareness (greet → conversate → suggest reading → etc.)
- `chatStream(sessionId, userMessage, res)` → SSE streaming
  - Stores user message
  - Appends non-question content to knowledge_buffer
  - Loads full message history
  - Calls Anthropic with streaming
  - Stores assistant response
  - Returns stream to client

**`service.minds-extraction.ts`** — Knowledge extraction
- `extractKnowledgeFromTranscript(messages[], existingBrain)` → structured markdown
  - Separate LLM call
  - Input: all session messages + knowledge buffer
  - Output: clean, structured markdown suitable for comparison pipeline
  - Strips questions, chit-chat, meta-discussion
  - Handles structured data (JSON, CSV) → natural language
  - Max input: 50K chars (enforced at client + server)

**System Prompt for Parenting Chat:**
```
You are {mindName}, at home after school.

PERSONALITY:
{personalityPrompt}

KNOWLEDGE BASE (current brain context via RAG):
{brainContext}

YOUR ROLE IN THIS SESSION:
You are being taught by your parent (the admin). They want to teach you something specific.

RULES:
1. Start by greeting warmly and asking what they want you to learn today. Use your personality.
2. You can chat naturally — answer questions about what you know, discuss ideas.
3. When the parent shares new information:
   - If it conflicts with your knowledge base, push back with citations:
     "Hmm, this conflicts with what I know: '[exact quote from brain]'. Are you sure?"
   - If it's genuinely new, acknowledge it positively.
4. When you sense enough new information has been shared, proactively suggest:
   "Want me to start reading and processing this? Click 'Ready to Learn' when you're ready."
5. After information is saved, add playful notes like:
   "Is that all for today? Click finish so I can go back to playing!"
6. Be conversational, warm, and personality-driven. You're at home, not in a classroom.
7. Never invent facts about your existing knowledge. If asked what you know, only reference the KNOWLEDGE BASE above.
```

#### 3D. Backend Controller & Routes

**`MindsParentingController.ts`**
- `POST /admin/minds/:mindId/parenting/sessions` → start new session
- `GET /admin/minds/:mindId/parenting/sessions` → list all sessions
- `GET /admin/minds/:mindId/parenting/sessions/:sessionId` → get session details + messages
- `POST /admin/minds/:mindId/parenting/sessions/:sessionId/chat/stream` → SSE chat
- `POST /admin/minds/:mindId/parenting/sessions/:sessionId/trigger-reading` → extract + compare
- `GET /admin/minds/:mindId/parenting/sessions/:sessionId/proposals` → get proposals from comparison
- `POST /admin/minds/:mindId/parenting/sessions/:sessionId/proposals/:proposalId` → approve/reject
- `POST /admin/minds/:mindId/parenting/sessions/:sessionId/compile` → trigger compile
- `POST /admin/minds/:mindId/parenting/sessions/:sessionId/abandon` → manually abandon

**Route registration:** Add to existing minds routes file.

#### 3E. Frontend — Tab Registration

**`MindDetail.tsx`:**
Add new tab:
```
{
  id: "parenting",
  label: "Agent Parenting",
  description: `Teach ${mindName} at home`,
  icon: <Heart className="h-4 w-4" />,  // or Home icon
}
```

Position: After "Agent University", before "Agent Workplace"

Tab content: `<MindParentingTab mindId={mindId} mindName={mindName} />`

#### 3F. Frontend — Parenting Tab Components

**`MindParentingTab.tsx`** — Main tab container
- On mount: fetch all sessions for this mind
- Shows session cards list:
  - Each card: session date, status badge, result badge (if completed), message count
  - Click → opens that session (read-only if completed/abandoned)
  - "New Parenting Session" button at top
- Active/incomplete sessions highlighted at top
- Completed sessions below with summary

**`ParentingSession.tsx`** — Active session view
- State machine driven by `session.status`:
  - `chatting` → Full chat UI with input + "Ready to Learn" button
  - `reading` → Chat history (read-only) + loading animation ("Processing your teachings...")
  - `proposals` → Chat history (read-only) + diff table (same as University intake)
  - `compiling` → Chat history (read-only) + compile animation (reuse from Ticket 1B)
  - `completed` → Chat history (read-only) + completion message + result badge
  - `abandoned` → Chat history (read-only) + "Abandoned" badge

**`ParentingChat.tsx`** — Chat interface
- Message list with user/assistant bubbles
- Input field with send button
- "Ready to Learn" button (persistent, visible when status = chatting)
- Auto-scroll on new messages
- Streaming SSE handling (same pattern as MindChatTab)
- Input disabled when status !== chatting
- 50K char limit on individual messages (client-side check)

**`ParentingProposals.tsx`** — Diff table for proposals
- Reuses same UI pattern as SlideProposalsReview's proposal cards
- Approve/reject/undo per proposal
- "Submit" button when all reviewed
- Back to chat NOT available (hard disable)

**Files created:**
- `signalsai/src/components/Admin/minds/MindParentingTab.tsx`
- `signalsai/src/components/Admin/minds/parenting/ParentingSession.tsx`
- `signalsai/src/components/Admin/minds/parenting/ParentingChat.tsx`
- `signalsai/src/components/Admin/minds/parenting/ParentingProposals.tsx`

**Files modified:**
- `signalsai/src/pages/admin/MindDetail.tsx` (add tab)
- `signalsai/src/api/minds.ts` (add parenting API functions + types)

#### 3G. Frontend API Client Additions

```typescript
// Sessions
createParentingSession(mindId: string): Promise<ParentingSession>
listParentingSessions(mindId: string): Promise<ParentingSession[]>
getParentingSession(mindId: string, sessionId: string): Promise<ParentingSessionDetails>
abandonParentingSession(mindId: string, sessionId: string): Promise<boolean>

// Chat
sendParentingChatStream(mindId: string, sessionId: string, message: string): Promise<Response>

// Pipeline
triggerParentingReading(mindId: string, sessionId: string): Promise<{ runId: string }>
getParentingProposals(mindId: string, sessionId: string): Promise<SyncProposal[]>
updateParentingProposal(mindId: string, sessionId: string, proposalId: string, status: string): Promise<boolean>
startParentingCompile(mindId: string, sessionId: string): Promise<{ runId: string }>
```

#### 3H. State Machine & Refresh Handling

Session status drives everything. On page load/refresh:
1. Fetch session details (status + messages + active run)
2. Render based on status:
   - `chatting` → chat UI with full history
   - `reading` → chat (read-only) + poll comparison run
   - `proposals` → chat (read-only) + fetch proposals + diff table
   - `compiling` → chat (read-only) + poll compile run
   - `completed` → chat (read-only) + completion message
   - `abandoned` → chat (read-only) + abandoned badge

This avoids the University compile refresh bug by design — status is authoritative.

---

## Risk Analysis

| Risk | Level | Mitigation |
|------|-------|------------|
| Compile resume breaks scrape flow | Level 2 | Test both paths: refresh during scrape AND refresh during compile |
| Dark mode CSS overrides fragile | Level 1 | Follow existing pattern, test each component visually |
| Full RAG per chat turn is expensive | Level 2 | Accepted trade-off. Monitor costs. Can downgrade to progressive RAG later if needed. |
| Extraction LLM produces poor output | Level 2 | Extraction prompt must be precise. Test with varied inputs (prose, JSON, fragments). Fallback: pass raw buffer if extraction fails. |
| Concurrent compile block confuses user | Level 2 | Clear UI message explaining which process holds the lock and which tab to check |
| Session state gets stuck | Level 2 | DB transactions for every status transition. WHERE clause guards prevent invalid transitions. Manual abandon as escape hatch. |
| LLM doesn't suggest "Ready to Learn" naturally | Level 1 | Button is always visible as fallback. LLM suggestion is bonus, not required. |

---

## Definition of Done

### Ticket 1
- [ ] Refreshing during an active compile_publish run resumes the compile UI + polling
- [ ] SyncStepTimeline replaced with centered brain/neural animation on compile screen
- [ ] Scrape_compare refresh behavior unchanged (no regression)
- [ ] Error state and retry still work on compile screen

### Ticket 2
- [ ] All 5 wizard components render correctly in dark mode (.minds-theme)
- [ ] No hardcoded light-only colors remain in wizard components
- [ ] SyncStepTimeline animations use CSS variables instead of hex literals
- [ ] Visual QA passes on all wizard states (empty, loading, populated, error)

### Ticket 3
- [ ] New "Agent Parenting" tab visible in MindDetail
- [ ] Can create new parenting session
- [ ] Chat works with streaming SSE and full RAG context
- [ ] Agent pushes back on conflicts with brain chunk citations
- [ ] "Ready to Learn" button triggers extraction + comparison
- [ ] Diff table shows proposals with approve/reject/undo
- [ ] Submit triggers compile via existing BullMQ pipeline
- [ ] Session auto-completes after compile with creative message
- [ ] Zero proposals / all rejected → auto-end with friendly message, no compile
- [ ] Concurrent compile shows clear block message
- [ ] Page refresh resumes correct state for every session status
- [ ] Completed sessions are read-only
- [ ] Session card list shows all sessions with status badges
- [ ] 50K char limit enforced on messages
- [ ] Hard disable chat input after proposals phase

---

## Blast Radius Analysis

| Area | Impact |
|------|--------|
| Existing chat tab | None — completely separate |
| Existing University tab | Ticket 1 fixes a bug, Ticket 2 fixes dark mode. No behavior changes. |
| Existing compile pipeline | Reused by Parenting. No modifications to pipeline itself. |
| Database | New tables only. No changes to existing tables. |
| API routes | New routes only. No changes to existing routes. |
| Frontend routing | New tab only. No changes to existing tabs. |
| BullMQ workers | Existing compile-publish worker handles Parenting compiles too (same queue). |

---

## Dependency Impact

- No new npm packages required
- Reuses existing Anthropic SDK, OpenAI SDK, BullMQ, Knex
- New Knex migration required (Ticket 3)
- No breaking changes to existing APIs

---

## Execution Log

### Ticket 1A — Compile Refresh Persistence ✅
- Added `activeSyncRunType` to `service.minds-gating.ts` and `api/minds.ts`
- Fixed `deriveSlide()` in `KnowledgeSyncWizard.tsx` to distinguish `compile_publish` vs `scrape_compare`
- Added `initialCompileRunId` prop to `SlideProposalsReview.tsx` with useEffect resume polling

### Ticket 1B — Compile Animation ✅
- Created `CompileAnimation.tsx` — neural network SVG with Framer Motion animations
- Replaced `SyncStepTimeline` with `CompileAnimation` in `SlideProposalsReview.tsx` compile view

### Ticket 2 — Dark Mode CSS Overrides ✅
- Added CSS custom properties to `.minds-theme` in `index.css`
- Replaced hardcoded hex values in `SyncStepTimeline.tsx` Framer Motion animate props with `var()` refs
- Added CSS overrides for tooltips and connection lines

### Ticket 3A — Database Schema ✅
- Created migration `20260228000002_create_parenting_sessions.ts`
- Tables: `minds.mind_parenting_sessions`, `minds.mind_parenting_messages`

### Ticket 3B — Backend Models ✅
- Created `MindParentingSessionModel.ts` with full CRUD + status management
- Created `MindParentingMessageModel.ts` with message storage

### Ticket 3C — Backend Services ✅
- Created `service.minds-extraction.ts` — LLM knowledge extraction from transcript
- Created `service.minds-parenting-chat.ts` — SSE streaming chat with parenting system prompt + RAG
- Created `service.minds-parenting.ts` — Session lifecycle, reading trigger, compile orchestration

### Ticket 3D — Backend Controller & Routes ✅
- Created `MindsParentingController.ts` with 10 endpoint handlers
- Registered all routes in `signalsai-backend/src/routes/minds.ts`

### Ticket 3E — Frontend API Client ✅
- Added `ParentingSession`, `ParentingMessage`, `ParentingSessionDetails` types
- Added 9 API functions in `signalsai/src/api/minds.ts`

### Ticket 3F — Frontend Components ✅
- Created `MindParentingTab.tsx` — session list + session view orchestration
- Created `parenting/ParentingChat.tsx` — SSE streaming chat with "Ready to Learn" button
- Created `parenting/ParentingProposals.tsx` — dark-mode proposal review with compile trigger
- Registered "Agent Parenting" tab in `MindDetail.tsx` (between University and Workplace)

### TypeScript Verification
- Frontend: Clean build (0 new errors)
- Backend: Clean build (4 pre-existing errors in unrelated files)
