# Stale Skills Detection + Skill Upgrade Sessions

## Context

A Mind's brain evolves through parenting sessions and knowledge sync. Skills are transmuted snapshots — when the brain updates, skill neurons become stale. Currently there's no detection, no notification, and no way to upgrade a skill's neuron without full regeneration from the brain. Two features address this:

- **Feature A**: Detect stale neurons, show warnings, enable bulk refresh
- **Feature B**: Parenting-like "Upgrade Skill" sessions scoped to the neuron

User confirmed: neuron amendments from upgrade sessions are independent of the brain. Regenerating from brain overwrites them — that's acceptable.

---

## Feature A: Stale Skills Detection + Bulk Regeneration

### A1. Backend — Enrich `listSkills` with stale status

**File**: `signalsai-backend/src/controllers/minds/MindsSkillsController.ts`

In `listSkills`, after fetching skills:
- Fetch mind's `published_version_id`
- Batch-fetch neurons via new `MindSkillNeuronModel.findBySkillIds(ids)`
- Enrich each skill with `{ has_neuron, is_neuron_stale }` where stale = neuron exists AND `neuron.mind_version_id !== published_version_id`

**File**: `signalsai-backend/src/models/MindSkillNeuronModel.ts`

Add method: `findBySkillIds(skillIds: string[]): Promise<IMindSkillNeuron[]>` — `SELECT * FROM minds.mind_skill_neurons WHERE skill_id = ANY($1)`

### A2. Backend — Bulk regeneration endpoint

**File**: `signalsai-backend/src/controllers/minds/MindsSkillsController.ts`

New handler `regenerateStaleNeurons(req, res)`:
- Get mind's `published_version_id`
- Fetch all neurons for this mind's skills via `findBySkillIds`
- Filter to stale (where `mind_version_id !== published_version_id`)
- For each stale skill, call existing `generateNeuron(skillId)` from `service.minds-skills.ts`
- Run sequentially to avoid LLM rate limits
- Return `{ regeneratedCount, failedCount, errors[] }`

**File**: `signalsai-backend/src/routes/minds.ts`

Add route: `POST /:mindId/skills/regenerate-stale` (before `/:mindId/skills/:skillId` routes)

### A3. Frontend — API + types

**File**: `signalsai/src/api/minds.ts`

- Add `has_neuron: boolean` and `is_neuron_stale: boolean` to `MindSkill` interface
- Add `regenerateStaleNeurons(mindId): Promise<{ regeneratedCount, failedCount }>` function

### A4. Frontend — Stale UI

**File**: `signalsai/src/components/Admin/minds/MindWorkplaceTab.tsx`
- Compute `staleCount` from skills list
- Show banner when `staleCount > 0`: "X skills have stale neurons — brain has been updated since last generation" + "Refresh All" button
- On SkillCard: amber dot/badge next to status pill when `skill.is_neuron_stale`

**File**: `signalsai/src/components/Admin/minds/SkillDetailPanel.tsx`
- Accept `isNeuronStale` prop (derived from skill data)
- Neuron tab header: show amber warning "Neuron is out of date — brain was updated since generation" when stale
- Change "Re-learn Skill" button label to "Refresh Neuron" when stale

---

## Feature B: Skill Upgrade Sessions

### B1. Migration

**File**: `signalsai-backend/src/database/migrations/20260302000001_skill_upgrade_sessions.ts`

```sql
CREATE TABLE minds.skill_upgrade_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID NOT NULL REFERENCES minds.mind_skills(id) ON DELETE CASCADE,
  mind_id UUID NOT NULL REFERENCES minds.minds(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'chatting'
    CHECK (status IN ('chatting','reading','proposals','compiling','completed','abandoned')),
  result TEXT CHECK (result IN ('learned','no_changes','all_rejected')),
  title TEXT,
  knowledge_buffer TEXT DEFAULT '',
  sync_run_id UUID REFERENCES minds.mind_sync_runs(id),
  created_by_admin_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE minds.skill_upgrade_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES minds.skill_upgrade_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_skill_upgrade_sessions_skill_id ON minds.skill_upgrade_sessions(skill_id);
CREATE INDEX idx_skill_upgrade_messages_session_id ON minds.skill_upgrade_messages(session_id);
```

### B2. Backend — Models

**File**: `signalsai-backend/src/models/SkillUpgradeSessionModel.ts`

Mirror `MindParentingSessionModel` pattern. Interface `ISkillUpgradeSession` with `skill_id` + `mind_id`. Methods: `createSession`, `findById`, `listBySkill`, `updateStatus`, `setResult`, `appendToBuffer`, `setSyncRunId`, `updateTitle`, `findActiveBySkill`.

**File**: `signalsai-backend/src/models/SkillUpgradeMessageModel.ts`

Mirror `MindParentingMessageModel`. Methods: `createMessage`, `listBySession`.

### B3. Backend — Services

**File**: `signalsai-backend/src/controllers/minds/feature-services/service.skill-upgrade-chat.ts`

Mirror `service.minds-parenting-chat.ts` but context is the skill:
- `buildUpgradeSystemPrompt(mindName, skillName, neuronMarkdown)` — "You are {mindName}'s skill '{skillName}'. You're being upgraded by your admin."
- `generateGreeting(mindId, skillId, sessionId)` — Load neuron, generate greeting in skill context
- `chatStream(mindId, skillId, sessionId, message, onChunk)` — Stream chat using neuron as context (no RAG needed, neurons are small)
- `generatePreviewMessages(mindName, skillName, messages)` — Same pattern, skill-scoped
- `generateSessionTitle(sessionId, buffer)` — Reuse same pattern

**File**: `signalsai-backend/src/controllers/minds/feature-services/service.skill-upgrade.ts`

Mirror `service.minds-parenting.ts`:
- `startSession(mindId, skillId, adminId?)` — Create session, generate greeting
- `getSessionDetails(sessionId)` — Load session + messages + proposals
- `triggerReadingStream(mindId, skillId, sessionId, onEvent)` — Extract knowledge, compare against **neuron_markdown** (not brain). Use a `SKILL_UPGRADE_COMPARE_SYSTEM_PROMPT` variant of `compareContent`.
- `startCompile(mindId, skillId, sessionId)` — **Synchronous** (no BullMQ worker). Load approved proposals, `applyProposals(currentNeuron, proposals)`, `MindSkillNeuronModel.upsert(skillId, existingVersionId, newNeuron)`.
- `completeSession(sessionId)` — Mark completed + learned
- `abandonSession(sessionId)` — Mark abandoned

Key difference in `triggerReadingStream`: comparison target is `neuron.neuron_markdown` not `brain_markdown`. New system prompt variant:

```
SKILL_UPGRADE_COMPARE_SYSTEM_PROMPT = "You are a skill neuron curator. An admin just taught a skill something new. Compare what was taught against the skill's current neuron (specialized system prompt) and produce proposals for updating it. The admin's input is authoritative..."
```

Key difference in `startCompile`: synchronous, no worker. Steps:
1. Load approved proposals
2. Load current neuron
3. `applyProposals(neuron.neuron_markdown, proposals)` — reuse existing compiler
4. `MindSkillNeuronModel.upsert(skillId, neuron.mind_version_id, newNeuronMarkdown)` — keep same version_id since we're amending, not regenerating
5. Finalize proposals
6. Complete session

### B4. Backend — Controller + Routes

**File**: `signalsai-backend/src/controllers/minds/MindsSkillUpgradeController.ts`

Handlers: `createSession`, `listSessions`, `getSession`, `chatStream`, `triggerReadingStream`, `getProposals`, `updateProposal`, `startCompile`, `getCompileStatus`, `deleteSession`, `abandonSession`, `updateSession`

**File**: `signalsai-backend/src/routes/minds.ts`

Routes under `/:mindId/skills/:skillId/upgrade/...`:
```
POST   /:mindId/skills/:skillId/upgrade/sessions
GET    /:mindId/skills/:skillId/upgrade/sessions
GET    /:mindId/skills/:skillId/upgrade/sessions/:sessionId
POST   /:mindId/skills/:skillId/upgrade/sessions/:sessionId/chat/stream
POST   /:mindId/skills/:skillId/upgrade/sessions/:sessionId/trigger-reading/stream
GET    /:mindId/skills/:skillId/upgrade/sessions/:sessionId/proposals
PATCH  /:mindId/skills/:skillId/upgrade/sessions/:sessionId/proposals/:proposalId
POST   /:mindId/skills/:skillId/upgrade/sessions/:sessionId/compile
GET    /:mindId/skills/:skillId/upgrade/sessions/:sessionId/compile-status
DELETE /:mindId/skills/:skillId/upgrade/sessions/:sessionId
POST   /:mindId/skills/:skillId/upgrade/sessions/:sessionId/abandon
PATCH  /:mindId/skills/:skillId/upgrade/sessions/:sessionId
```

### B5. Frontend — API

**File**: `signalsai/src/api/minds.ts`

Types: `SkillUpgradeSession`, `SkillUpgradeMessage`, `SkillUpgradeSessionDetails` — mirror parenting types with `skill_id`.

Functions (mirror parenting functions, scoped to skill):
- `createSkillUpgradeSession(mindId, skillId)`
- `listSkillUpgradeSessions(mindId, skillId)`
- `getSkillUpgradeSession(mindId, skillId, sessionId)`
- `sendSkillUpgradeChatStream(mindId, skillId, sessionId, message)`
- `triggerSkillUpgradeReadingStream(mindId, skillId, sessionId)`
- `getSkillUpgradeProposals(mindId, skillId, sessionId)`
- `updateSkillUpgradeProposal(mindId, skillId, sessionId, proposalId, status)`
- `startSkillUpgradeCompile(mindId, skillId, sessionId)`
- `getSkillUpgradeCompileStatus(mindId, skillId, sessionId)`
- `deleteSkillUpgradeSession(mindId, skillId, sessionId)`
- `abandonSkillUpgradeSession(mindId, skillId, sessionId)`
- `updateSkillUpgradeSession(mindId, skillId, sessionId, { title })`

### B6. Frontend — Upgrade Tab in SkillDetailPanel

**File**: `signalsai/src/components/Admin/minds/SkillDetailPanel.tsx`

Add "Upgrade" tab to the tabs array (between "neuron" and "config").

The upgrade tab renders a `SkillUpgradeTab` component.

**File**: `signalsai/src/components/Admin/minds/SkillUpgradeTab.tsx` (new)

Mirror `MindParentingTab.tsx` structure:
- List view: grid of past upgrade sessions (cards with status, title, result)
- Session view: conditional sub-views based on session status
  - `chatting` → reuse `ParentingChat` component (pass skill upgrade API functions)
  - `reading` → reuse `ParentingReadingView` component
  - `proposals` → reuse `ParentingProposals` component
  - `compiling` → compile status view (simpler — synchronous, so shows "complete" quickly)
  - `completed` → completion message

**Component reuse strategy**: The existing `ParentingChat`, `ParentingReadingView`, and `ParentingProposals` components accept callbacks (`onSend`, `onReady`, `onApprove`, etc.). Make them generic by passing the API functions as props instead of hardcoding parenting-specific API calls. If they currently hardcode API calls, refactor to accept callbacks.

---

## Build Order

| # | Task | Feature | Key Files |
|---|------|---------|-----------|
| 1 | Add `findBySkillIds` to neuron model | A | `MindSkillNeuronModel.ts` |
| 2 | Enrich `listSkills` with stale status | A | `MindsSkillsController.ts` |
| 3 | Add bulk regeneration endpoint | A | `MindsSkillsController.ts`, `minds.ts` |
| 4 | Frontend stale API + UI | A | `minds.ts`, `MindWorkplaceTab.tsx`, `SkillDetailPanel.tsx` |
| 5 | Migration: upgrade session tables | B | migration file |
| 6 | Models: SkillUpgradeSessionModel + MessageModel | B | 2 new model files |
| 7 | Services: skill-upgrade-chat.ts + skill-upgrade.ts | B | 2 new service files |
| 8 | Controller + routes | B | `MindsSkillUpgradeController.ts`, `minds.ts` |
| 9 | Frontend API functions | B | `minds.ts` |
| 10 | Frontend SkillUpgradeTab UI | B | `SkillUpgradeTab.tsx`, `SkillDetailPanel.tsx` |

## Patterns to Follow

- **Models**: Extend `BaseModel` pattern from `MindParentingSessionModel.ts`
- **Controller**: Express handlers pattern from `MindsParentingController.ts`
- **Service**: Session lifecycle pattern from `service.minds-parenting.ts`
- **Chat**: Streaming SSE pattern from `service.minds-parenting-chat.ts`
- **Comparison**: Reuse `compareContent()` from `service.minds-comparison.ts` with new system prompt
- **Compiler**: Reuse `applyProposals()` from `service.minds-compiler.ts`
- **Proposals**: Reuse `MindSyncRunModel` + `MindSyncProposalModel` for storing proposals

## Risk Analysis

- **Low risk**: Feature A is pure read + existing `generateNeuron` calls. No new tables, no schema changes.
- **Medium risk**: Feature B introduces 2 new tables and mirrors a complex lifecycle. Mitigated by following existing parenting patterns exactly.
- **Synchronous compile**: Neurons are small enough (~8KB) that `applyProposals` is instant. No need for BullMQ worker overhead.
- **No data loss**: Upgrade amendments intentionally don't survive regeneration from brain. User is aware.

## Definition of Done

- Stale skills detected and displayed after brain publish
- Bulk regeneration refreshes all stale neurons with progress feedback
- Skill upgrade session full lifecycle works: create → chat → reading → proposals → compile → completed
- Compiled neuron reflects approved proposal changes
- TypeScript clean on both frontend and backend
