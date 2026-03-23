# Minds Skills & Workers Revamp — Full Vision

## Problem Statement
Transform the Minds Skills system from passive queryable endpoints into an active work pipeline: Skills become standing instructions that fire on schedules, produce artifacts via n8n agents, land in a dashboard for approval/rejection, and optionally auto-publish to external platforms. The Mind stays the brain; the Skill becomes the job the brain is hired to do.

## Context Summary
- **Current state**: Skills are definition + neuron (LLM-transmuted brain variant) exposed as public GET/POST endpoints. No scheduling, no work creation, no approval workflow.
- **Existing infrastructure**: BullMQ + Redis workers (3 existing: scrape-compare, compile-publish, discovery), pgvector embeddings, Anthropic Claude LLM, polling-based status UI patterns.
- **Tables**: `minds.mind_skills` (id, mind_id, name, slug, definition, output_schema, status), `minds.mind_skill_neurons` (one per skill), `minds.mind_skill_calls` (analytics log).
- **External dependency**: n8n handles the actual artifact creation and publication. Alloro provides the intelligence layer (portals) and the control layer (work runs, approval, dashboard).

## Architecture Overview

```
Mind (brain + personality + knowledge)
  └── Skill (trigger + instruction + output type + destination)
        └── Trigger fires (daily, weekly, day_of_week, manual)
              └── Alloro creates work_run row (status: pending)
                    └── Alloro calls n8n Work Creation Agent
                          ├── n8n consults Skill Portal (what to create, what to avoid)
                          ├── n8n consults Mind Portal (domain context)
                          ├── n8n creates artifact (image, text, video, markdown, etc.)
                          └── n8n updates work_run in Alloro DB (status: awaiting_review)
                                └── Dashboard shows artifact for review
                                      ├── PATH A: Review & Stop (internal use — approve/download)
                                      └── PATH B: Review → Publish (or Auto Pipeline)
                                            └── n8n Work Publication Agent fires
                                                  └── Posts to X, Instagram, YouTube, GBP, etc.
```

## Existing Patterns to Follow
- BullMQ queue factory in `workers/queues.ts` — `getMindsQueue(name)`
- Worker registration in `worker.ts` — add new processor alongside existing 3
- Status-driven polling: compilePublish processor uses status columns polled by frontend
- Portal-style endpoints: public API routes in `routes/mindsPublicApi.ts`
- Model layer: extends `BaseModel` with JSON field support
- Slug-based lookup: `MindSkillModel.findBySlug(mindId, slug)`

## Proposed Approach

### Phase 1 — Database Migrations

#### 1a. Revamp `minds.mind_skills` table
Add columns to existing table:

```sql
ALTER TABLE minds.mind_skills ADD COLUMN work_creation_type TEXT;
  -- text, markdown, image, video, pdf, docx, audio
ALTER TABLE minds.mind_skills ADD COLUMN output_count INTEGER DEFAULT 1;
ALTER TABLE minds.mind_skills ADD COLUMN trigger_type TEXT DEFAULT 'manual';
  -- manual, daily, weekly, day_of_week
ALTER TABLE minds.mind_skills ADD COLUMN trigger_config JSONB DEFAULT '{}';
  -- { day: "monday", time: "08:00", timezone: "America/New_York" }
ALTER TABLE minds.mind_skills ADD COLUMN pipeline_mode TEXT DEFAULT 'review_and_stop';
  -- review_and_stop, review_then_publish, auto_pipeline
ALTER TABLE minds.mind_skills ADD COLUMN work_publish_to TEXT;
  -- post_to_x, post_to_instagram, post_to_facebook, post_to_youtube, post_to_gbp, internal_only
ALTER TABLE minds.mind_skills ADD COLUMN publication_config JSONB DEFAULT '{}';
  -- account references, format preferences
ALTER TABLE minds.mind_skills ADD COLUMN portal_key_hash TEXT;
  -- hashed portal API key for Skill Portal auth
ALTER TABLE minds.mind_skills ADD COLUMN last_run_at TIMESTAMPTZ;
ALTER TABLE minds.mind_skills ADD COLUMN next_run_at TIMESTAMPTZ;
ALTER TABLE minds.mind_skills ADD COLUMN org_id UUID;
  -- nullable, null = admin-level, set = per-client (future-proofing)
```

Update status enum from `draft | ready | generating | failed` to:
`draft | active | paused | generating | failed`

#### 1b. Create `minds.skill_work_runs` table

```sql
CREATE TABLE minds.skill_work_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID NOT NULL REFERENCES minds.mind_skills(id) ON DELETE CASCADE,
  triggered_by TEXT NOT NULL, -- schedule, manual
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'pending',
    -- pending, running, consulting, creating, awaiting_review,
    -- approved, rejected, publishing, published, failed
  artifact_type TEXT, -- image, text, markdown, video, pdf, docx, audio
  artifact_url TEXT,
  artifact_content TEXT, -- for text/markdown artifacts
  title TEXT,
  description TEXT,
  approved_by_admin_id UUID,
  approved_at TIMESTAMPTZ,
  rejection_category TEXT,
  rejection_reason TEXT,
  rejected_by_admin_id UUID,
  rejected_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  publication_url TEXT,
  n8n_run_id TEXT, -- for debugging
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### 1c. Add Mind-level configuration columns

```sql
ALTER TABLE minds.minds ADD COLUMN available_work_types JSONB DEFAULT '["text", "markdown"]';
ALTER TABLE minds.minds ADD COLUMN available_publish_targets JSONB DEFAULT '["internal_only"]';
ALTER TABLE minds.minds ADD COLUMN rejection_categories JSONB DEFAULT '["too_similar", "wrong_tone", "off_brand", "factually_incorrect", "wrong_format", "topic_not_relevant", "too_generic"]';
ALTER TABLE minds.minds ADD COLUMN portal_key_hash TEXT;
  -- hashed portal API key for Mind Portal auth
```

#### 1d. Create `minds.skill_portal_config` table (optional, could be columns on skill)

Decision: Keep it simple — the skill definition + neuron_markdown serve as the Skill Portal's brain. No separate table needed. The portal endpoint synthesizes context from skill definition + approved works + rejection history dynamically.

---

### Phase 2 — Mind Portal Endpoint

**Purpose**: Queryable POST endpoint exposing the Mind's brain for machine-to-machine queries. Stateless — no conversation history.

**Endpoint**: `POST /api/minds/:mindSlug/portal`

**Auth**: `x-portal-key` header, validated against `minds.portal_key_hash`

**Implementation**:
- New controller: `MindsPortalController.ts`
- New route in `mindsPublicApi.ts`
- Reuses existing `resolveBrainContext()` from chat service for RAG
- Builds system prompt from mind personality + brain context
- Single LLM call, returns response
- Logs to `mind_skill_calls` for analytics

**Response**:
```json
{
  "response": "...",
  "mind_version": "v3",
  "tokens_used": 1250
}
```

---

### Phase 3 — Skill Portal Endpoint

**Purpose**: Queryable POST endpoint for the Skill's instruction set, aware of previous approved/rejected works.

**Endpoint**: `POST /api/skills/:skillSlug/portal`

**Auth**: `x-portal-key` header, validated against `mind_skills.portal_key_hash`

**Implementation**:
- Same controller file as Mind Portal
- Builds context from:
  - Skill definition
  - Skill neuron_markdown (if exists)
  - Last 30 approved works (title, description, date, type)
  - Last 20 rejected works (title, rejection_category, rejection_reason)
  - Topics-covered digest for works older than 30 (weekly background job compresses)
- System prompt instructs LLM to:
  - Provide direction for what to create next
  - Avoid duplicating approved works
  - Avoid repeating rejected directions
  - Stay within skill constraints

**Response**:
```json
{
  "response": "...",
  "context": {
    "approved_count": 45,
    "rejected_count": 8,
    "last_run": "2026-02-27"
  }
}
```

---

### Phase 4 — Internal Status Update Endpoint

**Purpose**: n8n writes work run progress here. Keeps database writes inside the application layer.

**Endpoint**: `PATCH /api/internal/skill-work-runs/:workRunId`

**Auth**: `x-internal-key` header (env variable, not per-entity)

**Accepts**:
```json
{
  "status": "creating",
  "title": "The Real Cost of Skipping the Dentist",
  "description": "...",
  "artifact_url": "https://...",
  "artifact_type": "image",
  "artifact_content": "...",
  "n8n_run_id": "...",
  "error": "..."
}
```

**Validates**: status transitions are valid (no going backwards), work run exists.

---

### Phase 5 — Trigger Worker (BullMQ Scheduler)

**Purpose**: Background job that checks for skills due to fire and creates work runs.

**Queue**: `minds-skill-triggers`
**Processor**: `skillTrigger.processor.ts`

**Behavior**:
- Runs every 5 minutes via BullMQ repeatable job
- Queries skills where `status = 'active'` AND `next_run_at <= NOW()`
- For each due skill:
  1. Creates a `skill_work_runs` row with `status: pending`
  2. Calls n8n Work Creation webhook with payload:
     ```json
     {
       "work_run_id": "uuid",
       "skill_portal_url": "https://app.alloro.io/api/skills/:slug/portal",
       "skill_portal_key": "...",
       "mind_portal_url": "https://app.alloro.io/api/minds/:slug/portal",
       "mind_portal_key": "...",
       "work_creation_type": "image",
       "work_publish_to": "instagram",
       "pipeline_mode": "review_then_publish",
       "internal_update_url": "https://app.alloro.io/api/internal/skill-work-runs/:workRunId",
       "internal_key": "..."
     }
     ```
  3. Calculates and sets `next_run_at` based on trigger_config
  4. Updates `last_run_at`

**Dead letter strategy**: A separate check runs every 10 minutes for work runs stuck in `pending` or `running` beyond 15 minutes. Marks them `failed` with `error: "n8n_timeout"`.

---

### Phase 6 — Portal Authentication

**Portal key lifecycle**:
- Generated at Mind/Skill creation or on-demand via admin action
- Stored hashed (bcrypt or SHA-256) in `portal_key_hash` column
- Displayed once to admin, never stored in plaintext
- Rate limited: 60 requests/minute per key
- Rotation: admin can regenerate, old key immediately invalidated

**Implementation**:
- Middleware function `validatePortalKey(type: 'mind' | 'skill')` that:
  - Reads `x-portal-key` header
  - Looks up entity by slug
  - Compares hash
  - Returns 401 if invalid, 429 if rate limited

---

### Phase 7 — Skill Builder Revamp

**Purpose**: Guided conversation that progressively resolves a JSON skill definition. Output is the complete skill config saved to DB.

**System prompt design**: The Skill Builder knows:
- The Mind it's building for (name, personality, available work types, available publish targets)
- What fields need resolving (work_creation_type, work_publish_to, trigger_type, trigger_config, pipeline_mode, output_count, definition)

**Conversation flow**:
1. "What is this skill about?" → Infer work_creation_type, draft name
2. "What format should the output be?" → Confirm/refine work_creation_type (gated by Mind's available_work_types)
3. "Where does it go?" → Resolve work_publish_to (gated by Mind's available_publish_targets)
4. "How often should it run?" → Resolve trigger_type + trigger_config
5. "Auto-publish or manual approval?" → Resolve pipeline_mode
6. "Anything specific to always do or never do?" → Enrich definition
7. Summary + confirm → Save JSON to database

**Output**: Complete skill record with all fields populated, status: `draft`.

**Implementation**: Reuses existing `suggestSkill` chat pattern but with a multi-turn conversation stored in a temporary session. The Skill Builder endpoint maintains conversation state and emits the final JSON when all fields are resolved.

---

### Phase 8 — Work Publication Pipeline

**Two distinct n8n agents**:

**Work Creation Agent**:
- Receives skill payload from Alloro trigger worker
- Consults Skill Portal: "what should I create?"
- Consults Mind Portal: "give me context on [topic]"
- Routes to sub-agent by work_creation_type (photo, video, text, etc.)
- Creates artifact
- Updates work run via internal endpoint

**Work Publication Agent**:
- Fires when a work run is approved AND pipeline_mode includes publication
- Receives approved artifact + destination instruction
- Posts to target platform (X, Instagram, YouTube, GBP, etc.)
- Updates work run with publication_url

**Pipeline modes**:
- `review_and_stop` — work lands in dashboard, human reviews, done
- `review_then_publish` — human approves → publication agent fires automatically
- `auto_pipeline` — work auto-approved → publication fires without review (requires 5+ prior approved works as guardrail)

**Auto pipeline guardrails**:
- Not available until 5 approved works exist for that skill
- First run of newly activated skill always forces `review_then_publish`
- Content safety check before auto-approval (LLM call reviewing output)
- Post-publication notification to admin regardless

---

### Phase 8b — n8n Pipeline Build Instructions

These workflows are built in n8n's visual editor, not in the Alloro codebase. Below are the exact specifications for each.

#### Work Creation Workflow

**Trigger**: Webhook node (POST) — receives payload from Alloro trigger worker.

**Incoming payload from Alloro**:
```json
{
  "work_run_id": "uuid",
  "skill_portal_url": "https://app.alloro.io/api/skills/:slug/portal",
  "skill_portal_key": "sk_...",
  "mind_portal_url": "https://app.alloro.io/api/minds/:slug/portal",
  "mind_portal_key": "mk_...",
  "work_creation_type": "image",
  "work_publish_to": "instagram",
  "pipeline_mode": "review_then_publish",
  "internal_update_url": "https://app.alloro.io/api/internal/skill-work-runs/:workRunId",
  "internal_key": "internal_secret_key"
}
```

**Node-by-node flow**:

```
1. [Webhook] Receive trigger payload
      │
2. [HTTP Request] Update status → "running"
      PATCH {{ $json.internal_update_url }}
      Headers: { "x-internal-key": "{{ $json.internal_key }}" }
      Body: { "status": "running" }
      │
3. [HTTP Request] Update status → "consulting"
      PATCH (same endpoint)
      Body: { "status": "consulting" }
      │
4. [HTTP Request] Consult Skill Portal
      POST {{ $json.skill_portal_url }}
      Headers: { "x-portal-key": "{{ $json.skill_portal_key }}" }
      Body: { "query": "What should I create today? What has already been made? What should I avoid?" }
      → Store response as {{ $node.SkillPortal.json.response }}
      │
5. [HTTP Request] Consult Mind Portal
      POST {{ $json.mind_portal_url }}
      Headers: { "x-portal-key": "{{ $json.mind_portal_key }}" }
      Body: { "query": "Based on this direction: [skill portal response], give me rich context, facts, and details I should incorporate." }
      → Store response as {{ $node.MindPortal.json.response }}
      │
6. [HTTP Request] Update status → "creating"
      PATCH (same endpoint)
      Body: { "status": "creating" }
      │
7. [Switch] Route by work_creation_type
      ├── "text" / "markdown" → Text Creation Sub-flow
      ├── "image" → Image Creation Sub-flow
      ├── "video" → Video Creation Sub-flow
      ├── "pdf" / "docx" → Document Creation Sub-flow
      └── "audio" → Audio Creation Sub-flow
      │
8. [Sub-flow: Text/Markdown Creation]
      [AI Agent Node] (Claude / GPT)
      System prompt: "You are a content creator. Use the following context to produce the requested work."
      User message: combines Skill Portal direction + Mind Portal context
      → Output: { title, description, content }
      │
   [Sub-flow: Image Creation]
      [AI Agent Node] Generate image prompt from Skill + Mind Portal context
      [HTTP Request] Call image generation API (DALL-E, Midjourney API, Flux, etc.)
      [HTTP Request] Upload resulting image to file storage (S3/R2)
      → Output: { title, description, artifact_url }
      │
   [Sub-flow: Video Creation]
      [AI Agent Node] Generate video script from context
      [HTTP Request] Call video generation API (Runway, Pika, etc.)
      [HTTP Request] Upload to storage
      → Output: { title, description, artifact_url }
      │
   [Sub-flow: Document Creation]
      [AI Agent Node] Generate document content
      [Code Node] Format as PDF/DOCX using a library
      [HTTP Request] Upload to storage
      → Output: { title, description, artifact_url }
      │
   [Sub-flow: Audio Creation]
      [AI Agent Node] Generate script
      [HTTP Request] Call TTS API (ElevenLabs, OpenAI TTS, etc.)
      [HTTP Request] Upload to storage
      → Output: { title, description, artifact_url }
      │
9. [HTTP Request] Update work run → "awaiting_review"
      PATCH {{ $json.internal_update_url }}
      Body: {
        "status": "awaiting_review",
        "title": "{{ $node.SubFlow.json.title }}",
        "description": "{{ $node.SubFlow.json.description }}",
        "artifact_url": "{{ $node.SubFlow.json.artifact_url }}",
        "artifact_content": "{{ $node.SubFlow.json.content }}",  // text/markdown only
        "artifact_type": "{{ $json.work_creation_type }}"
      }
      │
10. [Respond to Webhook] Return 200 OK
```

**Error handling**: Wrap nodes 3-9 in a try/catch. On error:
```
[HTTP Request] Update work run → "failed"
  PATCH {{ $json.internal_update_url }}
  Body: {
    "status": "failed",
    "error": "{{ $error.message }}"
  }
```

**AI Agent node configuration tips**:
- Use the "AI Agent" node type (not basic LLM node) for multi-step reasoning
- Set temperature to 0.7 for creative work, 0.3 for reports/analysis
- Max tokens: 2000 for text, 500 for image prompts, 4000 for documents
- System prompt should include: "You are working for a dental practice marketing team. The Skill Portal has given you direction on what to create. The Mind Portal has given you domain context. Produce exactly what was requested."

#### Work Publication Workflow

**Trigger**: Webhook node (POST) — called by Alloro when a work run is approved and `pipeline_mode` includes publication.

**Incoming payload from Alloro**:
```json
{
  "work_run_id": "uuid",
  "artifact_url": "https://storage.example.com/image.png",
  "artifact_content": "...",
  "artifact_type": "image",
  "title": "The Real Cost of Skipping the Dentist",
  "description": "Infographic about preventive care costs",
  "work_publish_to": "instagram",
  "publication_config": {
    "account_ref": "credential_id_in_alloro",
    "format": "square_1080x1080"
  },
  "credential_token": "short-lived-oauth-token",
  "internal_update_url": "https://app.alloro.io/api/internal/skill-work-runs/:workRunId",
  "internal_key": "internal_secret_key"
}
```

**Node-by-node flow**:

```
1. [Webhook] Receive publication payload
      │
2. [HTTP Request] Update status → "publishing"
      PATCH {{ $json.internal_update_url }}
      Body: { "status": "publishing" }
      │
3. [Switch] Route by work_publish_to
      ├── "post_to_x" → X/Twitter Sub-flow
      ├── "post_to_instagram" → Instagram Sub-flow
      ├── "post_to_facebook" → Facebook Sub-flow
      ├── "post_to_youtube" → YouTube Sub-flow
      └── "post_to_gbp" → Google Business Profile Sub-flow
      │
4. [Sub-flow: X/Twitter]
      [HTTP Request] Download artifact if image/video
      [HTTP Request] POST to X API v2
        - Upload media endpoint first (if image/video)
        - Create tweet endpoint with text + media_id
      → Output: { publication_url: "https://x.com/..." }
      │
   [Sub-flow: Instagram]
      [HTTP Request] Upload media via Instagram Graph API
      [HTTP Request] Create media container
      [HTTP Request] Publish media container
      → Output: { publication_url: "https://instagram.com/p/..." }
      │
   [Sub-flow: Facebook]
      [HTTP Request] POST to Facebook Graph API /feed or /photos
      → Output: { publication_url: "https://facebook.com/..." }
      │
   [Sub-flow: YouTube]
      [HTTP Request] Upload via YouTube Data API v3 (resumable upload)
      [HTTP Request] Set video metadata (title, description, tags)
      → Output: { publication_url: "https://youtube.com/watch?v=..." }
      │
   [Sub-flow: Google Business Profile]
      [HTTP Request] POST to GBP API /localPosts
      → Output: { publication_url: "..." }
      │
5. [HTTP Request] Update work run → "published"
      PATCH {{ $json.internal_update_url }}
      Body: {
        "status": "published",
        "publication_url": "{{ $node.SubFlow.json.publication_url }}"
      }
      │
6. [Respond to Webhook] Return 200 OK
```

**Error handling**: Same try/catch pattern — on error, PATCH status to `failed` with error message.

#### n8n Credential Setup

For each platform the Publication Agent posts to, configure n8n credentials:

| Platform | n8n Credential Type | Required Tokens |
|----------|-------------------|-----------------|
| X/Twitter | OAuth2 | API Key, API Secret, Access Token, Access Secret |
| Instagram | OAuth2 (Facebook) | Page Access Token (long-lived) |
| Facebook | OAuth2 | Page Access Token |
| YouTube | OAuth2 (Google) | Client ID, Client Secret, Refresh Token |
| GBP | OAuth2 (Google) | Same as YouTube, different scopes |

**Alternative (recommended)**: Instead of storing credentials in n8n, Alloro passes a short-lived token in the webhook payload (`credential_token` field). n8n uses this directly in HTTP Request nodes rather than its own credential store. This keeps Alloro as the credential authority and avoids token duplication.

#### n8n Environment Variables

Set these in n8n's `.env` or environment config:

```env
# Alloro internal key for status updates (must match Alloro's INTERNAL_API_KEY)
ALLORO_INTERNAL_KEY=your_internal_key_here

# File storage for artifacts
ARTIFACT_STORAGE_BUCKET=your-s3-or-r2-bucket
ARTIFACT_STORAGE_REGION=us-east-1
ARTIFACT_STORAGE_ACCESS_KEY=...
ARTIFACT_STORAGE_SECRET_KEY=...

# AI APIs for content creation
OPENAI_API_KEY=...          # For DALL-E image generation
ANTHROPIC_API_KEY=...       # For Claude text generation
ELEVENLABS_API_KEY=...      # For audio/TTS (optional)
```

#### Testing the Pipeline

**Manual test flow** (before scheduler is live):

1. Create a skill in Alloro with `trigger_type: manual`
2. Click "Run Now" in the skill dashboard (creates work run, fires webhook)
3. Watch n8n execution log for the workflow
4. Check Alloro work run status progression: pending → running → consulting → creating → awaiting_review
5. Verify artifact appears in dashboard
6. Approve → verify publication fires (if configured)

**Webhook URL registration**:
- In n8n, the Work Creation Workflow's webhook URL looks like: `https://your-n8n.example.com/webhook/work-creation`
- In n8n, the Work Publication Workflow's webhook URL looks like: `https://your-n8n.example.com/webhook/work-publication`
- Store these in Alloro's environment config:
  ```env
  N8N_WORK_CREATION_WEBHOOK=https://your-n8n.example.com/webhook/work-creation
  N8N_WORK_PUBLICATION_WEBHOOK=https://your-n8n.example.com/webhook/work-publication
  ```

---

### Phase 9 — Credential Management

**Purpose**: Store OAuth tokens for external platforms (X, Instagram, YouTube, GBP).

**Approach**: Credentials managed inside Alloro, not n8n. n8n receives a short-lived reference token per publication job.

**Table**: `minds.platform_credentials`
```sql
CREATE TABLE minds.platform_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mind_id UUID REFERENCES minds.minds(id),
  platform TEXT NOT NULL, -- x, instagram, youtube, gbp, facebook
  account_name TEXT,
  encrypted_tokens JSONB NOT NULL, -- encrypted OAuth tokens
  status TEXT DEFAULT 'active', -- active, expired, revoked
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Health check**: Background job verifies token validity weekly. Flags expired tokens in dashboard.

---

### Phase 10 — Rejection Learning & Feedback Loop

**Structured rejection flow**:
- Admin clicks reject → sees category checkboxes (from Mind's `rejection_categories`) + optional notes
- Rejection stored on work run: `rejection_category`, `rejection_reason`, `rejected_by_admin_id`, `rejected_at`

**Skill Portal context enrichment**:
- Portal endpoint queries last 20 rejected works when building context
- Injects into system prompt:
  ```
  REJECTION HISTORY:
  - Feb 23: Rejected — Too clinical. "Made patients uncomfortable"
  - Feb 16: Rejected — Too similar to previous content

  LEARNED CONSTRAINTS:
  - Avoid clinical imagery
  - Ensure meaningful differentiation from previous works
  ```

**Approved works history at scale** (after 30+):
- Recent 30: verbatim JSON (title, description, date, type)
- 31-120: weekly background job compresses into topics-covered digest
- 120+: embeddings similarity search against proposed topics (reuses pgvector)

---

### Phase 11 — Frontend Changes

#### 11a. Skill Dashboard Revamp (MindWorkplaceTab)
- Skill cards now show: trigger schedule, pipeline mode, last run, next run
- Click skill → SkillDetailPanel with new tabs

#### 11b. SkillDetailPanel New Tabs
Expand from current 4 tabs (Definition, Schema, Neuron, Analytics) to:
- **Configuration** — trigger, pipeline mode, work type, publish target (replaces old Definition tab)
- **Definition** — skill instruction text + Skill Builder conversation
- **Work Runs** — chronological list of all runs with status, date, artifact preview
- **Neuron** — (existing) view transmuted brain
- **Portal** — test interface to query the Skill Portal manually
- **Analytics** — (existing) calls + work run stats

#### 11c. Work Run Detail View
- Polling UI: shows status progression with animation (pending → running → consulting → creating → awaiting_review)
- Artifact preview: image display, text/markdown render, document download
- Approve/reject controls (only when `awaiting_review`)
- Rejection modal with structured categories + notes
- Publication status (if applicable)

#### 11d. Mind Settings Additions
- Available Work Creation Types — checkbox list
- Available Publish Targets — checkbox list
- Rejection Categories — editable list
- Portal Key — generate/rotate/copy

#### 11e. Skill Builder Chat
- New component: `SkillBuilderChat.tsx`
- Conversational form UX within the skill creation flow
- Shows resolved fields in real-time as conversation progresses
- Confirm step with full summary before save

---

### Phase 12 — Mind Portal + Skill Portal Frontend

#### 12a. Mind Settings → Portal Tab
- Generate/rotate portal key
- Copy portal URL
- Test query interface (send query, see response)
- Usage stats (queries today, total)

#### 12b. Skill Detail → Portal Tab
- Same as above but for skill portal
- Shows context: approved works count, rejection history count
- Preview what context the portal would send

---

## Build Order (Recommended)

### Sprint 1 — Foundation (Days 1-3)
1. Database migration: skill schema revamp + work_runs table + mind columns
2. Models: `SkillWorkRunModel`, update `MindSkillModel`, update `MindModel`
3. Mind Portal endpoint (POST, portal-key auth)
4. Skill Portal endpoint (POST, portal-key auth, work history context)
5. Internal status update endpoint (PATCH, internal-key auth)
6. Portal key generation + validation middleware

### Sprint 2 — Worker + Dashboard (Days 4-6)
7. Trigger worker: BullMQ scheduler processor
8. Dead letter check worker
9. Frontend: Work runs list in SkillDetailPanel
10. Frontend: Work run detail with polling + status progression
11. Frontend: Approve/reject controls + structured rejection
12. Frontend: Mind settings additions (work types, publish targets, rejection categories, portal key)

### Sprint 3 — Skill Builder + Publication (Days 7-10)
13. Skill Builder conversation: multi-turn chat resolving JSON
14. Frontend: SkillBuilderChat component
15. Publication pipeline: trigger publication agent on approval
16. Credential management: platform_credentials table + UI
17. Frontend: Portal test interfaces

### Sprint 4 — Intelligence Layer (Days 11-14)
18. Rejection learning: feed rejections into Skill Portal context
19. Approved works history compression (background job)
20. Embeddings similarity for deduplication
21. Auto pipeline mode with guardrails (5-work threshold, safety check, notifications)
22. Content safety check LLM call

---

## Risk Analysis

| Risk | Level | Mitigation |
|------|-------|------------|
| n8n dependency / downtime | L3 | Dead letter worker marks stuck runs as failed. Retry button in UI. |
| Portal key leakage | L3 | Scoped per-entity keys. Rate limiting. Rotation endpoint. |
| LLM cost on portal queries | L2 | Cache Skill Portal response per work run in Redis. Mind Portal cached by query+TTL. |
| Auto pipeline publishing bad content | L3 | 5-work minimum, safety check, first run always manual, post-pub notification. |
| Approved works history growth | L2 | 3-tier strategy: verbatim (recent 30), digest (31-120), embeddings (120+). |
| OAuth token expiry for publish targets | L2 | Weekly health check, dashboard warnings before failure. |
| Schema migration on production data | L2 | All new columns nullable or with defaults. No data loss risk. |
| Skill Builder producing bad definitions | L2 | Skills start in draft. Portal test interface before activation. First run forced manual. |

## Security Considerations
- Portal endpoints are public-facing — must be rate-limited and key-authenticated
- Internal status update endpoint uses env-level key, not exposed publicly
- OAuth credentials stored encrypted in DB, never passed to n8n raw
- Portal keys hashed at rest, displayed once on generation
- Content safety check prevents harmful auto-published content

## Performance Considerations
- Trigger worker runs every 5 minutes — lightweight query, no heavy computation
- Portal queries cached per work run (Redis, TTL = run completion)
- Mind Portal reuses existing RAG infrastructure
- Polling UI uses lightweight status endpoint, stops polling on terminal states
- Skill Portal context limited to last 30 approved + 20 rejected works

## Dependency Impact
- **New dependency**: n8n (external, self-hosted or cloud)
- **Existing dependencies leveraged**: BullMQ, Redis, pgvector, Anthropic Claude
- **No new npm packages required** for Alloro-side work

## Rollback Plan
- All schema changes are additive (new columns, new tables) — no existing columns modified
- Old skill functionality (definition, neuron, public endpoint) continues to work unchanged
- New features are behind new UI tabs — no disruption to existing workflow
- Worker can be disabled by removing from `worker.ts` registration

## Definition of Done
- [x] Mind Portal and Skill Portal respond to queries with correct context
- [x] Skills can be configured with triggers, work types, pipeline modes
- [x] Trigger worker fires skills on schedule and creates work runs
- [x] n8n can update work run status via internal endpoint
- [x] Dashboard shows work runs with real-time polling
- [x] Approve/reject with structured rejection reasons works
- [x] Portal keys are generated, hashed, validated, rate-limited
- [x] Skill Builder conversation produces complete skill JSON
- [x] Publication pipeline fires on approval when configured
- [x] Auto pipeline enforces guardrails (5-work min, safety check)
- [x] Content safety check LLM call on auto-pipeline
- [x] Rejection learning feeds into Skill Portal context
- [x] Skill Configuration tab (trigger, pipeline, work type, portal key)
- [x] TypeScript clean across frontend and backend

## Revision Log
### 2026-02-28 — Implementation Complete
All 4 sprints executed sequentially. Full implementation across backend and frontend:
- Sprint 1: Foundation (migration, models, portal endpoints, internal API, trigger worker)
- Sprint 2: Worker + Dashboard (work runs UI, approval flow, mind settings, skill cards)
- Sprint 3: Skill Builder + Publication (multi-turn chat, config tab, publication pipeline)
- Sprint 4: Intelligence Layer (rejection learning verified, auto-pipeline guardrails, safety check)
