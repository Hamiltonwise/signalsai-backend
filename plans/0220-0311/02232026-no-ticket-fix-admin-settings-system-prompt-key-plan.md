# Fix Admin Settings System Prompt Key Mismatch

## Problem Statement

The Admin Settings page (`AdminSettings.tsx`) reads and writes the system prompt using the stale key `"editing_system_prompt"`. Migration `20260216000003` renamed this key to `"admin_editing_system_prompt"`. As a result:

- **On load:** `fetchSetting("websites", "editing_system_prompt")` returns 404, UI silently falls back to hardcoded `DEFAULT_PROMPT`
- **On save:** `updateSetting("websites", "editing_system_prompt", ...)` upserts a phantom row that no backend code reads
- **Net effect:** Saving a system prompt in settings has zero effect on LLM behavior or the debug tab

## Context Summary

- The debug tab and LLM both correctly read from `admin_editing_system_prompt` via `pageEditorPrompt.ts`
- The backend generic settings CRUD endpoints are key-agnostic — no backend changes needed
- The migration rename happened in `20260216000003_seed_user_system_prompt.ts`

## Existing Patterns to Follow

- `fetchSetting(category, key)` / `updateSetting(category, key, value)` — generic settings API, already correct
- Backend `pageEditorPrompt.ts` uses `"admin_editing_system_prompt"` — this is the source of truth

## Proposed Approach

Update two string literals in `signalsai/src/pages/admin/AdminSettings.tsx`:

1. **Line 48:** `fetchSetting("websites", "editing_system_prompt")` → `fetchSetting("websites", "admin_editing_system_prompt")`
2. **Line 70:** `"editing_system_prompt"` → `"admin_editing_system_prompt"`

No other files require changes.

## Risk Analysis

**Escalation: Level 1 — Suggestion**

- Zero structural risk
- No new dependencies
- No migration
- No API changes
- The correct key already exists and is populated in the DB

## Blast Radius Analysis

- **Impacted file:** `AdminSettings.tsx` only
- **Impacted behavior:** Admin settings page will now correctly load the live system prompt and save changes to the key that the LLM actually reads
- **No regressions:** Nothing else references the stale `editing_system_prompt` key outside of migrations

## Definition of Done

- [ ] `AdminSettings.tsx` reads from `admin_editing_system_prompt`
- [ ] `AdminSettings.tsx` writes to `admin_editing_system_prompt`
- [ ] Saving a prompt in settings is reflected in the debug tab and LLM behavior
