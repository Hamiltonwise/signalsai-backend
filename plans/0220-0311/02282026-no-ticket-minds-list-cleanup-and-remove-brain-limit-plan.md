# Minds List Cleanup & Remove Brain Limit

## Problem Statement
1. Minds list page has too much detail — should be a clean 3-column grid of glass cards with just the agent name
2. The 50,000 character brain limit is artificial and should be removed everywhere

## Context Summary
- Minds list: `signalsai/src/pages/admin/MindsList.tsx` — currently 2-column grid with Bot icon, name, personality prompt, published status, creation date
- Brain limit locations:
  - Frontend: `MindSettingsTab.tsx` — `MAX_BRAIN_CHARACTERS = 50_000` with character counter + textarea enforcement
  - Backend compiler: `service.minds-compiler.ts` — `MAX_BRAIN_CHARACTERS` defaults to 50000
  - Backend CRUD: `service.minds-crud.ts` — `MAX_BRAIN_CHARACTERS` defaults to 500000 (inconsistent)
  - Worker: `compilePublish.processor.ts` — `MAX_BRAIN_CHARACTERS` defaults to 500000 (inconsistent)
  - Parenting controller: 50k per-message limit (leaving alone — per-message, not brain)

## Proposed Approach

### 1. Simplify MindsList grid
- Change to 3-column grid (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`)
- Strip cards down to just the Bot icon + mind name
- Remove personality prompt, published status, created date
- Keep glass effect + hover interaction
- Remove unused imports

### 2. Remove brain character limit
- **Frontend** (`MindSettingsTab.tsx`): Remove `MAX_BRAIN_CHARACTERS`, character counter display, textarea length enforcement
- **Backend compiler** (`service.minds-compiler.ts`): Remove `MAX_BRAIN_CHARACTERS` const and the size validation block
- **Backend CRUD** (`service.minds-crud.ts`): Remove `MAX_BRAIN_CHARACTERS`, `BRAIN_WARN_THRESHOLD`, size validation, and warning logic
- **Worker** (`compilePublish.processor.ts`): Remove `MAX_BRAIN_CHARACTERS` const and the VALIDATE_BRAIN_SIZE step (mark completed immediately)

## Risk Analysis
- **Level 1**: UI simplification + removing artificial constraint. No logic impact beyond removing guardrails.

## Definition of Done
- [x] Minds list is a 3-column glass card grid with only agent name
- [x] All 50k brain character limits removed (frontend + backend)
- [x] TypeScript clean
