# Publish Channels — Mind-Level Publication Routing

## Problem Statement
After a work run is approved, there's no dynamic way to route publication. The current approach uses a hardcoded `PublishTarget` enum (`post_to_x`, `post_to_instagram`, etc.) and a single global `N8N_WORK_PUBLICATION_WEBHOOK` env var. This means all publication goes through one webhook regardless of platform, and the platform list is baked into source code. We need mind-scoped publish channels where each channel is a name + n8n webhook URL, selectable per skill.

## Context Summary
- `work_publish_to` is a TEXT column on `minds.mind_skills` with hardcoded enum values
- `PublishTarget` type defined in both backend model and frontend API
- `publication_config` JSONB on skills — currently unused placeholder
- `N8N_WORK_PUBLICATION_WEBHOOK` single env var — one global webhook
- On approval, `MindsWorkRunsController.approveWorkRun` checks `work_publish_to !== "internal_only"` and fires webhook
- `fireWorkPublicationWebhook` in `service.minds-work-pipeline.ts` sends artifact data to the single webhook
- `available_publish_targets` JSONB on `minds.minds` table — hardcoded defaults
- Mind detail page has 5 tabs: Chat, Settings, Knowledge Sync, Parenting, Workplace

## Existing Patterns to Follow
- Mind-level CRUD: same pattern as skills (controller + model + routes under `/:mindId/`)
- Dark theme: inline hex colors (#eaeaea, #a0a0a8, #6a6a75, #c2c0b6, #1a1a18, white/[0.04], white/8)
- Tab pattern: `MindDetail.tsx` uses `TAB_KEYS` array and renders tab components
- Model pattern: extends BaseModel with static methods, uses `minds` schema

## Proposed Approach

### Database
**Migration: `20260301000001_publish_channels.ts`**

1. Create `minds.publish_channels` table:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `mind_id UUID NOT NULL REFERENCES minds.minds(id) ON DELETE CASCADE`
   - `name TEXT NOT NULL` (e.g. "X / Twitter", "Instagram Reels")
   - `webhook_url TEXT NOT NULL` (n8n webhook URL for this channel)
   - `description TEXT` (optional — what this channel does)
   - `status TEXT DEFAULT 'active' CHECK (status IN ('active', 'disabled'))`
   - `created_at TIMESTAMPTZ DEFAULT NOW()`
   - `updated_at TIMESTAMPTZ DEFAULT NOW()`

2. Add `publish_channel_id UUID REFERENCES minds.publish_channels(id) ON SET NULL` to `minds.mind_skills`

3. Drop columns from `minds.mind_skills`:
   - `work_publish_to`
   - `publication_config`

4. Drop column from `minds.minds`:
   - `available_publish_targets`

### Backend Model
**New: `PublishChannelModel.ts`**
- Extends BaseModel, schema `minds`, table `publish_channels`
- Methods: `listByMind(mindId)`, `findById(id)`, `create(data)`, `updateById(id, data)`, `deleteById(id)`

**Update: `MindSkillModel.ts`**
- Remove `PublishTarget` type
- Replace `work_publish_to` and `publication_config` with `publish_channel_id: string | null`
- Remove `publication_config` from `jsonFields`

### Backend Controller
**New: `MindsPublishChannelsController.ts`**
- `listChannels(req, res)` — GET /:mindId/publish-channels
- `createChannel(req, res)` — POST /:mindId/publish-channels (name, webhook_url, description)
- `updateChannel(req, res)` — PUT /:mindId/publish-channels/:channelId
- `deleteChannel(req, res)` — DELETE /:mindId/publish-channels/:channelId

**Update: `MindsWorkRunsController.ts` → `approveWorkRun`**
- Instead of checking `skill.work_publish_to !== "internal_only"`, check `skill.publish_channel_id`
- Load the channel via `PublishChannelModel.findById(skill.publish_channel_id)`
- Use `channel.webhook_url` instead of `N8N_WORK_PUBLICATION_WEBHOOK`

**Update: `service.minds-work-pipeline.ts` → `fireWorkPublicationWebhook`**
- Accept `webhookUrl: string` parameter instead of reading from env var
- Remove `N8N_WORK_PUBLICATION_WEBHOOK` env var usage
- Update payload: remove `work_publish_to` / `publication_config`, add `channel_name`

**Update: `service.minds-work-pipeline.ts` → `evaluateAutoPipeline`**
- Same change — load channel, use its webhook_url

### Backend Routes
In `minds.ts`:
- `GET /:mindId/publish-channels`
- `POST /:mindId/publish-channels`
- `PUT /:mindId/publish-channels/:channelId`
- `DELETE /:mindId/publish-channels/:channelId`

### Frontend API
**Update: `minds.ts`**
- New type: `PublishChannel { id, mind_id, name, webhook_url, description, status, created_at, updated_at }`
- Remove: `PublishTarget` type
- New functions: `listPublishChannels(mindId)`, `createPublishChannel(mindId, data)`, `updatePublishChannel(mindId, channelId, data)`, `deletePublishChannel(mindId, channelId)`
- Update `MindSkill` interface: replace `work_publish_to` / `publication_config` with `publish_channel_id: string | null`

### Frontend UI

**New Tab: "Publish Channels" on Mind Detail page**
- Add to `TAB_KEYS` in `MindDetail.tsx`
- New component: `MindPublishChannelsTab.tsx`
- List view: cards for each channel (name, webhook URL masked, description, status pill, delete button)
- Add form: name input, webhook URL input, optional description, create button
- Edit inline or via modal
- Dark themed (same palette as other tabs)

**Update: `SkillDetailPanel.tsx` Config tab**
- Replace hardcoded "Publish Target" dropdown with a channel selector
- Load channels via `listPublishChannels(mindId)`
- Dropdown shows channel names, value is channel ID
- "No channel (internal only)" as default/empty option
- Remove `cfgPublishTo` state, replace with `cfgPublishChannelId`

**Update: `MindWorkplaceTab.tsx`**
- Replace `skill.work_publish_to` badge with channel name lookup

## Risk Analysis
Level 3 — Structural Feature.
- New table + column changes across skills table
- Touches approval flow (critical path)
- Removes existing enum — clean break, no backward compat
- Multiple file changes across both repos

Mitigations:
- Migration handles column drops cleanly
- Approval flow change is isolated to one function
- Channel deletion sets `publish_channel_id` to NULL via ON SET NULL

## Definition of Done
- Publish channels CRUD works from Mind detail tab
- Skill config shows channel selector instead of hardcoded targets
- Approving a work run fires the channel's specific webhook URL
- Auto-pipeline also uses channel webhook URL
- `N8N_WORK_PUBLICATION_WEBHOOK` env var no longer needed
- `PublishTarget` type fully removed from codebase
- All dark themed
- TypeScript clean on both repos
