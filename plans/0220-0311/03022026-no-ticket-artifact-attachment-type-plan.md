# Artifact Attachment Type

## Problem Statement
Some skills produce both text content AND an image (or other media) attachment. Currently `work_creation_type` is a single value. Need a nullable `artifact_attachment_type` field on skills to tell the pipeline "this skill also produces an attachment of this type," and corresponding fields on work runs to store the attachment.

## Context Summary
- `work_creation_type` on `mind_skills` labels the main output (text, image, etc.)
- `artifact_type`, `artifact_url`, `artifact_content` on `skill_work_runs` store the produced artifact
- n8n webhook receives `work_creation_type` and returns artifact data via internal endpoint
- WorkRunsTab displays artifacts (images, markdown, text) based on `artifact_type`

## Existing Patterns to Follow
- Nullable fields on skill config: `work_creation_type`, `publish_channel_id`
- n8n payload includes skill config fields for pipeline routing
- Internal endpoint accepts arbitrary `artifact_*` fields from n8n callback
- WorkRunsTab conditionally renders artifact types

## Proposed Approach

### 1. Migration
Add `artifact_attachment_type` (nullable TEXT) to `minds.mind_skills`.
Add `artifact_attachment_url` (nullable TEXT) and `artifact_attachment_content` (nullable TEXT) to `minds.skill_work_runs`.

### 2. Backend Models
- `IMindSkill`: add `artifact_attachment_type: WorkCreationType | null`
- `ISkillWorkRun`: add `artifact_attachment_url: string | null`, `artifact_attachment_content: string | null`

### 3. Backend Services
- `service.minds-skills.ts` `updateSkill`: allow `artifact_attachment_type`
- `service.minds-work-pipeline.ts`: include `artifact_attachment_type` in n8n creation payload, and `artifact_attachment_url`/`artifact_attachment_content` in publication payload
- `MindsInternalController.ts`: accept `artifact_attachment_url` and `artifact_attachment_content` from n8n callback
- Skill Builder prompt: add `artifact_attachment_type` field description

### 4. Frontend
- `MindSkill` type: add `artifact_attachment_type`
- `SkillWorkRun` type: add `artifact_attachment_url`, `artifact_attachment_content`
- `updateSkill` function: accept `artifact_attachment_type`
- `SkillDetailPanel.tsx` config tab: add nullable attachment type selector
- `WorkRunsTab.tsx`: display attachment below main artifact when present

## Risk Analysis
- Level 1: Additive schema change, nullable columns, no breaking changes
- n8n workflows may need updating to populate the new attachment fields, but existing workflows are unaffected (all new fields nullable)

## Definition of Done
- Migration adds columns to both tables
- Backend models expose new fields
- n8n payload includes attachment type
- Internal endpoint accepts attachment data from n8n
- Config UI allows setting attachment type (nullable dropdown)
- WorkRunsTab shows attachment when present
- `npx tsc --noEmit` clean on both projects
