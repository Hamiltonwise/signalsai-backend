# Skill Builder Brain Context & Opinionated Flow

## Problem Statement
Skill builder prompt has no brain context, personality, or existing knowledge. The agent asks basic discovery questions it should already know the answers to. Should leverage brain to propose answers, confirm rather than discover, and push back with recommendations.

## Context Summary
- `service.minds-skills.ts` — `skillBuilderChat` and `skillBuilderChatStream` both build system prompts with only `mind.name` and available work types/publish targets
- Brain loading pattern exists in parenting chat: `mind.published_version_id` → `MindVersionModel.findById` → `brain_markdown`
- `mind.personality_prompt` available but not injected
- Both streaming and non-streaming functions share the same system prompt structure

## Existing Patterns to Follow
- Parenting chat loads brain via `published_version_id` (service.minds-parenting-chat.ts lines 64-76)
- RAG retrieval available via `shouldUseRag` + `retrieveForChat` but overkill here — full brain as context is fine since skill builder is a short conversation

## Proposed Approach
- Load published brain markdown in both `skillBuilderChat` and `skillBuilderChatStream`
- Inject brain + personality into system prompt
- Rewrite conversation flow to be opinionated: propose defaults from knowledge, ask for confirmation not discovery, push back when appropriate
- Extract shared prompt builder to avoid duplication between streaming and non-streaming

## Risk Analysis
Level 1 — Prompt tuning + adding context that's already loaded. No structural change.

## Definition of Done
- Skill builder agent uses brain context to propose skill configurations
- Agent confirms rather than discovers basic info
- Agent pushes back and recommends when appropriate
- Both streaming and non-streaming endpoints updated
- TypeScript clean

## Revision Log

### 2026-03-01 — Fix streaming reply duplication bug
**Reason**: Real-time JSON reply field parser in `skillBuilderChatStream` had no guard against re-detecting the `"reply"` marker. Every incoming token re-scanned `fullText.lastIndexOf('"reply"')`, found the same marker, and re-streamed all accumulated content — causing the reply text to duplicate ~50x.

**Fix**: Added `replyStarted` boolean flag. Once the `"reply": "` boundary is detected and initial content extracted, the flag prevents re-detection. After the reply field closes (unescaped closing quote), subsequent tokens are skipped entirely.

**Files changed**: `service.minds-skills.ts` — `skillBuilderChatStream` streaming loop
