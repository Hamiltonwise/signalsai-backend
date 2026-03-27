# Delete Sessions & Minds

**Date:** 02/28/2026
**Ticket:** --no-ticket

---

## Problem Statement

No way to delete parenting sessions or minds. Both need DELETE endpoints, backend service logic, and frontend wiring.

---

## Context Summary

- `BaseModel.deleteById()` already exists — inherited by all models
- Parenting sessions have child `mind_parenting_messages` rows (FK cascade needed)
- Minds have many children: versions, sources, conversations, messages, sync runs, proposals, parenting sessions, embeddings, skills
- Existing delete patterns: `deleteConversation`, `deleteSource`, `deleteBatch`, `deleteSkill` — all follow the same controller → model pattern
- Frontend uses `apiDelete()` from `api/index.ts`

---

## Existing Patterns to Follow

| Pattern | Example |
|---------|---------|
| Controller delete | `MindsController` doesn't have one, but `deleteConversation` in `MindsChatController` does: find → delete → return success |
| Route | `mindsRoutes.delete("/:mindId/sources/:sourceId", ...)` |
| Frontend | `apiDelete({ path: ... })` returning `!!res.success` |

---

## Proposed Approach

### 1. Delete Parenting Session
- Backend: Add `deleteSession` to `MindsParentingController` — deletes messages first (or rely on CASCADE), then session
- Route: `DELETE /:mindId/parenting/sessions/:sessionId`
- Frontend: Add `deleteParentingSession()` API fn, add delete button to session cards

### 2. Delete Mind
- Backend: Add `deleteMind` to `MindsController` via `service.minds-crud.ts` — cascade delete all children
- Route: `DELETE /:mindId`
- Frontend: Add `deleteMind()` API fn, add delete option in Agent Anatomy or mind list

### DB Cascade
- Check if FK constraints already have ON DELETE CASCADE. If not, handle in service layer by deleting children first.

---

## Risk Analysis

| Risk | Level | Mitigation |
|------|-------|------------|
| Deleting mind with active sync run | Level 2 | Block delete if active run exists |
| Orphaned data | Level 2 | Delete children before parent in a transaction |

---

## Definition of Done

- [ ] Can delete a parenting session (backend + frontend)
- [ ] Can delete a mind (backend + frontend)
- [ ] Confirmation prompt before both deletes
- [ ] Active sync runs block mind deletion
