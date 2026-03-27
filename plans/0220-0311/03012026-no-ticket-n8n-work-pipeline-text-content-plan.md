# n8n Work Pipeline — Text Content Architecture

## Problem Statement
The work pipeline backend is built but the webhook payload is too lean, the skill portal bakes works history into an inflating system prompt, portal auth requires per-skill keys (not mind-agnostic), and there's no clear spec for the n8n workflow. The frontend also exposes output schema which isn't needed for text content.

## Context Summary
- `fireWorkCreationWebhook` (service.minds-work-pipeline.ts:23-62) sends portal URLs + keys placeholder + work type + callback URL. Missing: skill definition, output_count, works history.
- Skill portal (MindsPortalController.ts:111-251) hardcodes 30 approved + 20 rejected works + digests + dedup in system prompt. Will inflate with volume.
- Portal auth uses per-skill `x-portal-key` header. n8n needs one key for all minds/skills.
- Portal keys are hashed (bcrypt) — raw keys aren't stored. Current webhook sends `"__use_stored_key__"` placeholder.
- Frontend SkillDetailPanel has an "Output Schema" tab that's unnecessary for text content.
- Frontend polling already works (WorkRunsTab.tsx, 4s interval on active statuses).
- State machine, internal callback, auto-pipeline, content safety check — all built and functional.

## Existing Patterns to Follow
- Internal key auth pattern exists: `MindsInternalController.ts` validates `x-internal-key` header against `INTERNAL_API_KEY` env var.
- `SkillWorkRunModel` has `recentApproved()` and `recentRejected()` — need a new lightweight variant that returns metadata only (no artifact content).
- Portal endpoints follow consistent pattern: validate auth → load context → build system prompt → call Claude → return response.

## Proposed Approach

### 1. Add internal key auth to portal endpoints
**Files:** `MindsPortalController.ts`

Both `mindPortal()` and `skillPortal()` currently only accept `x-portal-key`. Add `x-internal-key` as an alternative auth path:
- If `x-portal-key` is present → validate against skill/mind portal_key_hash (existing behavior)
- If `x-internal-key` is present → validate against `INTERNAL_API_KEY` env var
- If neither → 401

This makes the pipeline mind-agnostic. n8n uses one internal key for all portal queries.

### 2. Clean up skill portal system prompt
**Files:** `MindsPortalController.ts`

Remove hardcoded works history from the skill portal system prompt. The portal becomes a focused chatbot:
- Loads neuron (compiled brain for this skill)
- System prompt contains: skill name, definition, neuron, work type
- Responds to queries about what the skill creates, its voice, its constraints
- NO approved works, NO rejected works, NO digests, NO dedup in system prompt

Works history moves to the webhook payload (step 3). Dedup stays as a separate concern (embedding-based, can be added to webhook later).

Keep the `recentApproved`/`recentRejected` DB queries available but don't inject them into the prompt. The test portal endpoint (`testSkillPortal`) gets the same cleanup.

### 3. Expand `fireWorkCreationWebhook` payload
**Files:** `service.minds-work-pipeline.ts`, `SkillWorkRunModel.ts`

New model method `getWorksHistoryMetadata(skillId, limit)` returns:
```ts
{ title: string; description: string; status: "approved" | "rejected"; rejection_reason: string | null }[]
```
No artifact_content, no artifact_url, no embeddings. Lightweight metadata only. Pulls from both approved/published and rejected, ordered by date desc, capped at 50.

Expanded webhook payload:
```json
{
  "work_run_id": "uuid",
  "mind_slug": "virmedia",
  "skill_slug": "x-content-posting-skill",
  "skill_name": "X Content Posting Skill",
  "skill_definition": "Produces sharp, platform-native X posts...",
  "output_count": 3,
  "work_creation_type": "text",
  "work_publish_to": "post_to_x",
  "pipeline_mode": "review_and_stop",
  "mind_portal_url": "https://app.alloro.io/api/minds/virmedia/portal",
  "skill_portal_url": "https://app.alloro.io/api/skills/x-content-posting-skill/portal",
  "internal_key": "the-internal-api-key",
  "internal_update_url": "https://app.alloro.io/api/internal/skill-work-runs/{id}",
  "works_history": [
    { "title": "...", "description": "...", "status": "approved", "rejection_reason": null },
    { "title": "...", "description": "...", "status": "rejected", "rejection_reason": "Too generic" }
  ]
}
```

Note: `internal_key` now serves double duty — used for both portal auth (`x-internal-key` header) and status callback auth. No more per-skill portal key management for n8n.

### 4. Hide output schema from frontend
**Files:** `SkillDetailPanel.tsx`

Remove the "Output Schema" tab from the skill detail panel tabs. The DB column and model interface stay — just hidden from the UI. If a skill already has an output schema set, it still works; it's just not editable from the UI.

### 5. n8n Workflow Spec (Text Content)

This is documentation, not code. The user builds this in n8n's visual editor.

```
[1. Webhook Trigger]
    Method: POST
    Path: /minds-work-creation
    Response: Immediately (200 OK)
    → Receives full payload from backend

[2. Switch Node: Route by work_creation_type]
    "text" → Text Creation Route
    "image" → (future)
    "video" → (future)
    Default → fail

--- TEXT CREATION ROUTE ---

[3. HTTP Request: Update status to "running"]
    PATCH {{internal_update_url}}
    Headers: x-internal-key: {{internal_key}}
    Body: { "status": "running" }

[4. HTTP Request: Query Mind Portal]
    POST {{mind_portal_url}}
    Headers: x-internal-key: {{internal_key}}, Content-Type: application/json
    Body: { "query": "Describe your brand voice, tone, and standards. What makes your content distinctly yours? How do you speak to your audience?" }
    → Extracts: mind_context = response.response

[5. HTTP Request: Query Skill Portal]
    POST {{skill_portal_url}}
    Headers: x-internal-key: {{internal_key}}, Content-Type: application/json
    Body: { "query": "What kind of content do you create, for whom, and what makes it effective? What are your constraints and creative boundaries?" }
    → Extracts: skill_context = response.response

[6. HTTP Request: Update status to "creating"]
    PATCH {{internal_update_url}}
    Headers: x-internal-key: {{internal_key}}
    Body: { "status": "creating" }

[7. AI Agent Node: Generate Content]
    Model: Claude Sonnet (or configured model)
    System prompt:
      You are a content creation agent.

      BRAND VOICE & STANDARDS:
      {{mind_context}}

      SKILL FOCUS:
      {{skill_context}}

      SKILL DEFINITION:
      {{skill_definition}}

      PREVIOUSLY CREATED WORK (do NOT repeat these topics):
      {{works_history formatted as bullet list}}

      TARGET: Create {{output_count}} {{work_creation_type}} item(s) for {{work_publish_to}}.

      RULES:
      - Each piece must be distinct from previously created work.
      - Match the brand voice exactly.
      - Stay within the skill's creative boundaries.
      - For rejected works, learn from the rejection reasons and avoid repeating those patterns.

    User message: "Create {{output_count}} new piece(s) now."

    → Extracts: generated_content

[8. HTTP Request: Submit artifact]
    PATCH {{internal_update_url}}
    Headers: x-internal-key: {{internal_key}}
    Body: {
      "status": "awaiting_review",
      "title": "{{generated title}}",
      "description": "{{generated description}}",
      "artifact_content": "{{generated_content}}",
      "artifact_type": "text"
    }

[Error Handler: On any failure]
    PATCH {{internal_update_url}}
    Headers: x-internal-key: {{internal_key}}
    Body: { "status": "failed", "error": "{{error message}}" }
```

## Risk Analysis
Level 1 — Additive payload changes + prompt cleanup + auth expansion. No structural migration. No DB schema changes. No breaking changes to existing flows.

Only concern: adding `x-internal-key` to portal endpoints broadens auth surface. Mitigated by: internal key is already trusted for status updates, and portal endpoints are already public-facing (just with different auth).

## Definition of Done
- `fireWorkCreationWebhook` sends expanded payload with skill definition, output_count, works_history, mind_slug, skill_slug
- Portal endpoints accept `x-internal-key` as alternative to `x-portal-key`
- Skill portal system prompt no longer includes hardcoded works history
- `SkillWorkRunModel.getWorksHistoryMetadata()` returns lightweight metadata
- Output schema tab hidden from SkillDetailPanel
- n8n workflow spec documented (this plan file)
- TypeScript clean on both frontend and backend
- Existing portal key auth unchanged (backward compatible)
- Test portal endpoints updated to match
