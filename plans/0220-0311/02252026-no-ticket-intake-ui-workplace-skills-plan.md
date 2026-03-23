# Intake UI Overhaul + Workplace / Skills Feature

## Problem Statement

Two interrelated tracks:

**Track 1 — Intake UI Overhaul:** The current `SlideProposalsReview.tsx` renders proposals as flat list items with minimal diff visibility and tiny approve/reject icons. Needs: progress bar at top showing completion %, a proper diff table for UPDATE proposals, card-based layout with better buttons, undo support (approved/rejected → revert to pending), and updated creative copy.

**Track 2 — Workplace / Skills Feature:** A new tab "Workplace" that lets admins create focused skill variants of the mind's brain. Each skill has a definition, output schema (JSON validated via Monaco editor), and generates a "skill neuron" — a transmuted version of the brain specialized for that task. Skills expose public API endpoints (`/api/minds/:agentSlug/:skillSlug`) and track call analytics (total work points, today's work points, 7-day trend graph).

## Context Summary

### Existing Architecture
- **Minds subsystem** lives in `minds` Postgres schema, all routes behind `superAdmin` middleware
- **Brain** = published `mind_versions.brain_markdown` (immutable snapshots)
- **Proposals** state machine: `pending → approved|rejected`, with `approved → rejected` allowed. `finalized` is terminal (set during compile)
- **Frontend**: React + Vite + TypeScript + Tailwind v4 + Framer Motion
- **Backend**: Express + Knex + BullMQ workers for async operations
- **LLM**: Anthropic Claude SDK (`claude-sonnet-4-6`)

### Existing Patterns to Follow
- Models: Static classes extending `BaseModel` with `tableName = "minds.table_name"`
- Controllers: Extract params → call feature service → return `{ success: true, data: ... }`
- Feature services: `service.minds-*.ts` in `controllers/minds/feature-services/`
- API module: `apiGet/apiPost/apiPatch/apiDelete` from `api/index.ts`
- UI components: `ActionButton`, `StatusPill`, `EmptyState` from `DesignSystem.tsx`
- Worker pattern: BullMQ queues with dedicated worker files

## Proposed Approach

---

### TRACK 1 — Intake UI Overhaul

#### 1A. Update `SlideProposalsReview.tsx`

**Progress Bar at Top:**
- Horizontal progress bar showing `(approved + rejected) / total` as completion percentage
- Color: gradient from alloro-orange to green as it approaches 100%
- Text label: "4 of 7 reviewed"

**Updated Header Copy:**
```
"Class is over. {mindName} stands at the gate. Time slows. New knowledge queued.
You decide what {mindName} forgets — and what stays forever."
```

**Proposal Cards (replacing flat list items):**
Each proposal rendered as a card with:
- Rounded-2xl border, shadow-sm, generous padding (p-5)
- Type badge (NEW = green, UPDATE = blue, CONFLICT = amber) — larger, left-aligned
- Summary as card title (text-base font-semibold)
- Reason as subtitle (text-sm text-gray-500)
- **Diff table for UPDATE proposals**: Two-column layout
  - Left column: "Current" — `target_excerpt` with red-tinted background
  - Right column: "Proposed" — `proposed_text` with green-tinted background
  - Headers: "Will Forget" / "Will Learn"
- **For NEW proposals**: Single "Will Learn" section showing `proposed_text`
- **Action buttons** (visible for pending AND approved/rejected):
  - Pending: Green "Approve" button + Red "Reject" button (full buttons with labels, not just icons)
  - Approved: Shows green "Approved" state + gray "Undo" button
  - Rejected: Shows red "Rejected" state + gray "Undo" button
  - Finalized: Locked state, no actions

**Undo Support:**
- Backend already supports `approved → rejected` transition
- Need to add `rejected → pending` and `approved → pending` transitions to `MindsProposalsController.ts`
- Frontend sends `status: "pending"` to revert
- Undo button shows on approved/rejected cards

#### 1B. Backend: Allow Undo Transitions

**Modify:** `MindsProposalsController.ts` — extend `validTransitions`:
```
pending → approved | rejected
approved → rejected | pending   (add pending)
rejected → pending              (new)
```

**Modify:** `updateProposalStatus` API call in `api/minds.ts` — already supports any status string, no change needed.

---

### TRACK 2 — Workplace / Skills Feature

#### 2A. Database Migrations

**Migration 1: Add `slug` to `minds.minds`**
- Column: `slug TEXT UNIQUE` (nullable initially for backfill)
- Backfill existing minds: `slug = lower(replace(name, ' ', '-'))`
- Then set `NOT NULL` constraint
- Index: unique on `slug`

**Migration 2: Create skills tables**

Table: `minds.mind_skills`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| mind_id | UUID FK → minds | ON DELETE CASCADE |
| name | TEXT | |
| slug | TEXT | Unique per mind |
| definition | TEXT | Instruction for brain transmutation |
| output_schema | JSONB | JSON Schema for skill output validation |
| status | TEXT | `draft`, `ready`, `generating`, `failed` |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |
| **Constraint** | | UNIQUE (mind_id, slug) |

Table: `minds.mind_skill_neurons`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| skill_id | UUID FK → mind_skills | ON DELETE CASCADE |
| mind_version_id | UUID FK → mind_versions | Which brain version was transmuted |
| neuron_markdown | TEXT | The transmuted brain content |
| generated_at | TIMESTAMPTZ | |
| **Constraint** | | UNIQUE (skill_id) — one active neuron per skill |

Table: `minds.mind_skill_calls`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| skill_id | UUID FK → mind_skills | ON DELETE CASCADE |
| caller_ip | TEXT | For basic analytics |
| request_payload | JSONB | nullable |
| response_payload | JSONB | nullable |
| status | TEXT | `success`, `error` |
| duration_ms | INTEGER | |
| called_at | TIMESTAMPTZ | DEFAULT now() |
| **Index** | | (skill_id, called_at DESC) for analytics queries |

#### 2B. Backend Models

**New: `MindSkillModel.ts`**
- `findById`, `findBySlug(mindId, slug)`, `listByMind(mindId)`
- `create(mindId, name, slug, definition, outputSchema)`
- `update(id, fields)`, `updateStatus(id, status)`
- `deleteById(id)`

**New: `MindSkillNeuronModel.ts`**
- `findBySkill(skillId)`, `upsert(skillId, versionId, markdown)`
- `deleteBySkill(skillId)`

**New: `MindSkillCallModel.ts`**
- `log(skillId, callerIp, request, response, status, durationMs)`
- `countBySkill(skillId)` — total calls
- `countBySkillToday(skillId)` — calls since midnight UTC
- `dailyCountsLast7Days(skillId)` — returns `{ date: string, count: number }[]`

#### 2C. Backend Feature Service

**New: `service.minds-skills.ts`**
- `generateNeuron(skillId)`:
  1. Load skill definition + output schema
  2. Load mind's published brain markdown
  3. Send to Claude: system prompt instructs transmutation of brain based on skill definition
  4. If output schema provided, include in prompt: "Structure your output to produce responses conforming to this schema: {schema}"
  5. Store result in `mind_skill_neurons` (upsert)
  6. Update skill status to `ready`
  7. On failure: update status to `failed`
- `executeSkill(skillId, inputPayload)`:
  1. Load skill + neuron + output schema
  2. Send input to Claude with neuron as system context
  3. If output schema exists, instruct Claude to respond in that JSON format
  4. Log call to `mind_skill_calls`
  5. Return response

#### 2D. Backend Controllers

**New: `MindsSkillsController.ts`**
- `listSkills` — GET `/:mindId/skills`
- `createSkill` — POST `/:mindId/skills` (auto-generates slug from name)
- `getSkill` — GET `/:mindId/skills/:skillId`
- `updateSkill` — PUT `/:mindId/skills/:skillId`
- `deleteSkill` — DELETE `/:mindId/skills/:skillId`
- `generateNeuron` — POST `/:mindId/skills/:skillId/generate`
- `getSkillAnalytics` — GET `/:mindId/skills/:skillId/analytics`

**New: `MindsSkillApiController.ts`** (public-facing, separate route file)
- `executeSkill` — POST `/api/minds/:agentSlug/:skillSlug`
- No superAdmin auth — this is the public API endpoint
- Validates skill exists + has ready neuron
- Rate limiting consideration (future)

#### 2E. Backend Routes

**Add to `routes/minds.ts`** (admin routes):
```
GET    /:mindId/skills                      → listSkills
POST   /:mindId/skills                      → createSkill
GET    /:mindId/skills/:skillId             → getSkill
PUT    /:mindId/skills/:skillId             → updateSkill
DELETE /:mindId/skills/:skillId             → deleteSkill
POST   /:mindId/skills/:skillId/generate    → generateNeuron
GET    /:mindId/skills/:skillId/analytics   → getSkillAnalytics
```

**New: `routes/mindsPublicApi.ts`** (public endpoint):
```
POST   /api/minds/:agentSlug/:skillSlug     → executeSkill
```
- Mounted at app level (not behind superAdmin)
- Basic API key auth or open (TBD — start open, add auth later)

#### 2F. Frontend API Module

**Add to `api/minds.ts`:**
```typescript
interface MindSkill {
  id: string;
  mind_id: string;
  name: string;
  slug: string;
  definition: string;
  output_schema: object | null;
  status: "draft" | "ready" | "generating" | "failed";
  created_at: string;
  updated_at: string;
}

interface MindSkillNeuron {
  id: string;
  skill_id: string;
  mind_version_id: string;
  neuron_markdown: string;
  generated_at: string;
}

interface SkillAnalytics {
  totalCalls: number;
  callsToday: number;
  dailyCounts: { date: string; count: number }[];
}
```

Functions:
- `listSkills(mindId)`, `getSkill(mindId, skillId)`, `createSkill(mindId, name, definition, outputSchema)`
- `updateSkill(mindId, skillId, fields)`, `deleteSkill(mindId, skillId)`
- `generateSkillNeuron(mindId, skillId)`, `getSkillNeuron(mindId, skillId)`
- `getSkillAnalytics(mindId, skillId)`

#### 2G. Frontend — Workplace Tab

**Modify:** `MindDetail.tsx` — Add 4th tab:
- Key: `workplace`
- Label: `Workplace`
- Icon: `Briefcase`
- Description: `Where {mindName} punches in and gets to work`
- Component: `MindWorkplaceTab`

**New: `MindWorkplaceTab.tsx`**
Main layout:
- Header: "Workplace" / "{mindName}'s skills on deck"
- "Create Skill" button → opens create form
- Skills listed as cards in a grid (2 columns)

**Each Skill Card:**
- Name + slug badge
- Status pill (draft/ready/generating/failed)
- Definition preview (first 2 lines)
- API endpoint: `POST /api/minds/{agentSlug}/{skillSlug}` (copiable)
- Analytics mini-display: "X total work points · Y today"
- Click → opens skill detail

**New: `SkillDetailPanel.tsx`** (slide-over or expanded view)
- Tabs or sections:
  1. **Definition** — editable textarea for the skill definition
  2. **Output Schema** — Monaco editor for JSON schema validation
  3. **Neuron Preview** — read-only markdown preview of generated neuron (if exists)
  4. **Analytics** — total calls, today's calls, 7-day trend chart

- Actions:
  - "Generate Neuron" / "Re-learn Skill" button (triggers generation)
  - "Save" button (saves definition + schema changes)
  - "Delete Skill" button (with confirmation)

**Analytics Section:**
- Two big number cards: "Total Work Points" and "Today's Work Points"
- Below: Simple bar chart showing 7-day daily call counts
- Use a lightweight chart approach (CSS bars or a small chart lib if one exists in deps)

#### 2H. Monaco Editor Integration

Check if `@monaco-editor/react` is already a dependency. If not, install it. Used for the output schema JSON editor with:
- JSON language mode
- Schema validation
- Auto-formatting

---

## Risk Analysis

| Risk | Level | Mitigation |
|------|-------|------------|
| Public API endpoint without auth | Level 3 | Start with open endpoint, add API key auth in follow-up. Document as "internal use only" |
| Neuron generation cost (Claude calls) | Level 2 | Generation is manual (admin-triggered), not automatic. Cost is bounded. |
| Skill execution adds ongoing API costs | Level 2 | Analytics tracking provides visibility. Rate limiting can be added later. |
| Monaco editor bundle size | Level 2 | Already a large bundle. Monaco adds ~2MB. Lazy-load the component. |
| Undo on proposals — state consistency | Level 1 | Simple transition addition. Gating logic already prevents compile if pending exist. |
| Slug collision | Level 1 | UNIQUE constraints at DB level. Auto-generation from name with collision check. |

## Security Considerations

- Public skill API endpoint (`/api/minds/:agentSlug/:skillSlug`) is intentionally open for now
- No user data is exposed through skill endpoints — only mind's transmuted knowledge
- Caller IP logged for audit trail
- Request/response payloads stored for debugging (consider TTL cleanup later)
- Slug validation: alphanumeric + hyphens only, no special characters

## Performance Considerations

- `mind_skill_calls` table will grow with usage — index on `(skill_id, called_at DESC)` handles queries
- Neuron generation is async from user perspective (button click → loading state)
- Analytics queries use simple COUNT with date filtering — efficient with index
- Monaco editor lazy-loaded to avoid blocking initial page render

## Definition of Done

### Track 1 — Intake UI
- [ ] Progress bar shows review completion percentage
- [ ] Updated creative copy on header
- [ ] Proposals render as proper cards with diff table for UPDATEs
- [ ] Full-label Approve/Reject buttons (not just icons)
- [ ] Undo button on approved/rejected proposals reverts to pending
- [ ] Backend accepts `pending` as valid transition target from `approved`/`rejected`
- [ ] TypeScript compiles, Vite builds

### Track 2 — Workplace / Skills
- [ ] Migration adds `slug` to `minds.minds` with backfill
- [ ] Migration creates `mind_skills`, `mind_skill_neurons`, `mind_skill_calls` tables
- [ ] Backend CRUD for skills (list, create, get, update, delete)
- [ ] Backend neuron generation via Claude (definition + brain → transmuted markdown)
- [ ] Backend skill execution endpoint (public API)
- [ ] Backend analytics (total, today, 7-day)
- [ ] Frontend Workplace tab with skill cards grid
- [ ] Frontend skill detail with definition editor, Monaco JSON schema, neuron preview
- [ ] Frontend analytics display (big numbers + 7-day chart)
- [ ] API endpoint shown and copiable on each skill card
- [ ] "Re-learn Skill" regenerates neuron
- [ ] TypeScript compiles, Vite builds

## Blast Radius Analysis

- **Track 1** changes are isolated to `SlideProposalsReview.tsx` + one controller file. Low blast radius.
- **Track 2** adds new tables, models, controllers, routes, and frontend components. Medium blast radius but fully additive — no existing behavior changes.
- The public API route is a new attack surface — start simple, harden later.

## Critical Files

| File | Action |
|------|--------|
| **Track 1** | |
| `signalsai/src/components/Admin/minds/wizard/SlideProposalsReview.tsx` | Rewrite |
| `signalsai-backend/src/controllers/minds/MindsProposalsController.ts` | Modify (add undo transitions) |
| **Track 2 — Migrations** | |
| `signalsai-backend/src/database/migrations/20260225000006_add_slug_to_minds.ts` | Create |
| `signalsai-backend/src/database/migrations/20260225000007_create_skills_tables.ts` | Create |
| **Track 2 — Models** | |
| `signalsai-backend/src/models/MindModel.ts` | Modify (add `slug` to interface, add `findBySlug`) |
| `signalsai-backend/src/models/MindSkillModel.ts` | Create |
| `signalsai-backend/src/models/MindSkillNeuronModel.ts` | Create |
| `signalsai-backend/src/models/MindSkillCallModel.ts` | Create |
| **Track 2 — Backend** | |
| `signalsai-backend/src/controllers/minds/MindsSkillsController.ts` | Create |
| `signalsai-backend/src/controllers/minds/feature-services/service.minds-skills.ts` | Create |
| `signalsai-backend/src/controllers/minds/MindsSkillApiController.ts` | Create |
| `signalsai-backend/src/routes/minds.ts` | Modify (add skill admin routes) |
| `signalsai-backend/src/routes/mindsPublicApi.ts` | Create |
| **Track 2 — Frontend** | |
| `signalsai/src/api/minds.ts` | Modify (add skill types + endpoints) |
| `signalsai/src/pages/admin/MindDetail.tsx` | Modify (add Workplace tab) |
| `signalsai/src/components/Admin/minds/MindWorkplaceTab.tsx` | Create |
| `signalsai/src/components/Admin/minds/SkillDetailPanel.tsx` | Create |
