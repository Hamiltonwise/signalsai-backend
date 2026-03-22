# Global Publish Channels

## Problem Statement
Publish channels are currently scoped per-mind (`mind_id` FK). They should be mind-agnostic — shared across all minds. The management UI should live on the Minds list page, not inside an individual mind.

## Context Summary
- Migration hasn't been run yet, so we can modify it in-place
- Routes are all under `authenticateToken + superAdminMiddleware` (no org_id scoping)
- `MindPublishChannelsTab.tsx` already exists with full CRUD UI, just needs `mindId` removed
- SkillDetailPanel and MindWorkplaceTab fetch channels by mindId — need global fetch

## Existing Patterns to Follow
- MindsList.tsx: dark theme with `minds-theme`, `liquid-glass` cards
- API functions in `minds.ts` use `apiGet`/`apiPost`/etc.

## Proposed Approach

### Backend
1. **Migration**: Remove `mind_id` column and its index from `publish_channels`
2. **Model**: Remove `mind_id` from interface, replace `listByMind`/`listActiveByMind` with `listAll`/`listActive`
3. **Controller**: Remove `mindId` params and mind ownership checks
4. **Routes**: Move from `/:mindId/publish-channels` to top-level `/publish-channels`

### Frontend
5. **API**: Remove `mindId` param from all publish channel functions, update paths to `/admin/publish-channels`
6. **MindPublishChannelsTab**: Remove `mindId` prop
7. **MindDetail.tsx**: Remove the publish-channels tab (tab key, buildTabs entry, render block, import)
8. **MindsList.tsx**: Add "Publish Channels" button in header + render component
9. **SkillDetailPanel.tsx** + **MindWorkplaceTab.tsx**: Update `listPublishChannels()` calls (no mindId)

## Risk Analysis
- Level 1 — Straightforward scope change, no new concepts

## Definition of Done
- Channels table has no `mind_id`
- CRUD routes at `/admin/minds/publish-channels` (global)
- MindsList shows Publish Channels management
- MindDetail has no publish-channels tab
- Skill config still loads channels globally
- TypeScript clean
