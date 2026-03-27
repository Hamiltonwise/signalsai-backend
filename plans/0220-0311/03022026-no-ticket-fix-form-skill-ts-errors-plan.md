# Fix TypeScript Errors in FormSubmissionsTab and SkillBuilderChat

## Problem Statement
1. `FormSubmissionsTab.tsx:34` — `isAdmin` destructured but never read (TS6133).
2. `SkillBuilderChat.tsx:255` — `artifact_attachment_type` does not exist on `ResolvedFields` (TS2339).

## Context Summary
- `isAdmin` is in the Props interface but unused in the component body.
- `ResolvedFields` (minds.ts:657) is missing `artifact_attachment_type`. The `updateSkill` function accepts it.

## Existing Patterns to Follow
- Prefix unused props with `_` to preserve public interface.
- Add missing fields to `ResolvedFields` to match what the AI builder can resolve.

## Proposed Approach
1. Prefix `isAdmin` with `_` in the destructure.
2. Add `artifact_attachment_type?: string;` to `ResolvedFields`.

## Risk Analysis
- Level 1 — Both trivial, no behavioral change.

## Definition of Done
- `tsc --noEmit` passes with zero errors.
