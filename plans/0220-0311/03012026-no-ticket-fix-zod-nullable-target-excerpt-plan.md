# Fix Zod nullable target_excerpt Validation

## Problem Statement
LLM comparison returns `target_excerpt: null` on NEW proposals. Zod schema uses `.optional()` which only accepts `undefined`, not `null`. This crashes the entire reading stream, preventing proposals from being stored and compiled.

## Context Summary
- `minds.schemas.ts` line 7: `target_excerpt: z.string().optional()`
- `.optional()` allows `undefined` but rejects `null`
- LLM frequently returns explicit `null` for fields it considers empty
- Error: `Invalid input: expected string, received null`
- The `superRefine` check already validates that UPDATE/CONFLICT proposals have `target_excerpt`

## Existing Patterns to Follow
- Zod validation with `.nullable()` is standard for LLM-returned fields

## Proposed Approach
- Change `z.string().optional()` to `z.string().nullable().optional()` on `target_excerpt`
- This allows `null`, `undefined`, or a valid string
- The existing `superRefine` still enforces that UPDATE/CONFLICT proposals have a truthy `target_excerpt`

## Risk Analysis
Level 1 — One-word fix. No behavioral change for valid proposals.

## Definition of Done
- LLM proposals with `target_excerpt: null` pass validation
- Reading stream completes and proposals are stored
- TypeScript clean
