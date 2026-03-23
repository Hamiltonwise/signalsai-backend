# Fix Minds Reading Stuck State + LLM JSON Resilience

**Date:** 03/09/2026
**Ticket:** no-ticket
**Status:** Executed

---

## Problem Statement

Parenting sessions and skill upgrade sessions get permanently stuck in `"reading"` status when the LLM comparison step fails. The root cause is a missing error rollback in `triggerReadingStream` — the session status is set to `"reading"` before async LLM work begins, but there is no catch block to revert it on failure.

The specific failure observed: the LLM returned 12,557 chars of malformed JSON (missing comma at position 927), `JSON.parse()` threw, the error propagated to the controller's catch block which sent an SSE error event, but the database session remained in `"reading"` forever.

Secondary issue: the `compareContent` service has no JSON repair, no retry, and no markdown fence stripping — making LLM JSON parsing unnecessarily brittle.

---

## Context Summary

- **Affected flows:** Parenting `triggerReadingStream` (`service.minds-parenting.ts:177-289`), Skill Upgrade `triggerReadingStream` (`service.skill-upgrade.ts:74-190`)
- **State machine:** `chatting → reading → proposals → compiling → completed`
- **The bug:** Status set to `"reading"` at line 188 (parenting) / 86 (skill upgrade) with no rollback on error
- **Cascade effect:** If a sync run was created mid-flow and left `"running"`, `hasActiveRun()` blocks all future compiles, scrape-compare runs, and mind deletion
- **Frontend behavior:** `onError` callback fetches session details, gets back `"reading"` status, UI shows infinite reading animation with no escape
- **JSON parsing:** Raw `JSON.parse()` in `service.minds-comparison.ts:126` with zero recovery

---

## Existing Patterns to Follow

- **BullMQ worker pattern:** `scrapeCompare.processor.ts` wraps all work in try/catch with `markFailed()` on error — we follow this pattern for session rollback
- **Error events:** Controller already sends `{ type: "error" }` SSE events on failure — we keep this
- **Zod validation:** Already in place for proposal schema — we keep this as final validation after JSON repair
- **Model methods:** `MindParentingSessionModel.updateStatus()` and `SkillUpgradeSessionModel.updateStatus()` already exist for rollback

---

## Proposed Approach

### 1. Add JSON Repair Utility (`service.minds-comparison.ts`)

Create a `repairAndParseJson` function that handles common LLM JSON failures:

1. **Strip markdown fences** — LLMs sometimes wrap JSON in ```json ... ``` despite instructions
2. **Extract JSON array** — regex to find `[...]` if surrounded by explanation text
3. **Attempt `JSON.parse()`** on cleaned text
4. **If parse fails: single retry** — call the LLM again with the broken output and a short "fix this JSON" prompt using the same model
5. **If retry also fails:** throw with clear error

This is a shared utility used by `compareContent` — both web scrape and parenting flows benefit.

### 2. Improve Comparison Prompt (`service.minds-comparison.ts`)

Add explicit JSON formatting instructions to all three comparison prompts:

- Emphasize raw JSON array output (no wrapping, no explanation)
- Add: "Ensure all string values properly escape special characters (quotes, newlines, backslashes)"
- Add: "Verify your JSON is complete and valid before outputting"

### 3. Error Recovery in Parenting `triggerReadingStream` (`service.minds-parenting.ts`)

Wrap the LLM work (extraction + comparison + proposal storage) in a try/catch:

- **On error:** Roll session status back to `"chatting"`
- **If sync run was created:** Mark it `"failed"`
- **Send error event** via the `onEvent` callback
- **Add system message** to session so the user sees what happened
- **Re-throw** so the controller's catch block also fires (sends SSE error + ends stream)

### 4. Error Recovery in Skill Upgrade `triggerReadingStream` (`service.skill-upgrade.ts`)

Same pattern as parenting — identical rollback logic.

### 5. Frontend Error Recovery (`MindParentingTab.tsx`, `SkillUpgradeTab.tsx`)

The `onError` handlers already fetch session details after error. With the backend rollback, the session will now be back in `"chatting"` state, so:

- The UI will naturally show the chat view again (since `showChat` is true when `status === "chatting"`)
- Add a toast message suggesting the user try again
- No structural frontend changes needed — the backend fix makes the existing frontend error path work correctly

---

## Risk Analysis

| Risk | Level | Mitigation |
|------|-------|------------|
| JSON repair regex misidentifies content | Low | Final Zod validation catches any malformed proposals |
| Retry LLM call adds latency on failure | Low | Only triggered on parse failure; single retry with small prompt |
| Rollback to "chatting" loses extracted knowledge | None | Extraction happens fresh each time; knowledge_buffer persists |
| Race condition on status rollback | Very Low | SSE is single-request; no concurrent writers for same session |

---

## Definition of Done

- [ ] `compareContent` has a robust JSON parsing pipeline: strip fences → extract array → parse → on failure: single LLM retry → parse again → Zod validate
- [ ] Comparison prompts updated with explicit JSON formatting guidance
- [ ] Parenting `triggerReadingStream` rolls session back to `"chatting"` on any error during LLM work
- [ ] Skill Upgrade `triggerReadingStream` has identical rollback behavior
- [ ] If a sync run was created before the error, it gets marked `"failed"`
- [ ] Frontend `onError` correctly shows chat view after rollback (no code change needed — verify behavior)
- [ ] Manual test: trigger a parenting reading, confirm it completes; simulate error, confirm session returns to chatting state

---

## Files to Modify

1. `signalsai-backend/src/controllers/minds/feature-services/service.minds-comparison.ts` — JSON repair + prompt improvement + retry
2. `signalsai-backend/src/controllers/minds/feature-services/service.minds-parenting.ts` — error rollback in `triggerReadingStream`
3. `signalsai-backend/src/controllers/minds/feature-services/service.skill-upgrade.ts` — error rollback in `triggerReadingStream`
