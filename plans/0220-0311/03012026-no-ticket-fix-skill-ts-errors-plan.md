# Fix TypeScript Errors in Skill Builder / Workplace Tab

## Problem Statement
Two TypeScript errors blocking build:
1. `MindWorkplaceTab.tsx:26` — `PublishChannel` type imported but never used (TS6133).
2. `SkillBuilderChat.tsx:247` — `work_publish_to` does not exist on `updateSkill`'s fields type. The correct property is `publish_channel_id`.

## Context Summary
- `updateSkill` (minds.ts:557) accepts `publish_channel_id?: string | null`, not `work_publish_to`.
- `ResolvedFields` (minds.ts:640) exposes `work_publish_to` from the AI chat builder, which needs to be mapped to `publish_channel_id` when calling `updateSkill`.
- `PublishChannel` type is imported in MindWorkplaceTab but never referenced — the component uses `listPublishChannels()` but infers the type from the return value.

## Existing Patterns to Follow
- Other fields in the same `updateSkill` call use casting from `resolvedFields`.

## Proposed Approach
1. Remove the unused `PublishChannel` type import from `MindWorkplaceTab.tsx`.
2. Change `work_publish_to` → `publish_channel_id` in the `updateSkill` call in `SkillBuilderChat.tsx`.

## Risk Analysis
- **Level 1 — Suggestion**: Direct property rename mapping. No behavioral change — `work_publish_to` was already being passed but ignored by the API type. Now it maps correctly.

## Definition of Done
- `tsc -b` passes with zero errors.
