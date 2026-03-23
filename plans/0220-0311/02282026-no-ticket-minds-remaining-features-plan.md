# Minds Skills & Workers Revamp — Remaining Features

## Problem Statement
All 4 sprints of the Skills & Workers Revamp are complete. Four features were scoped but not yet built: portal test interfaces, platform credentials, embeddings dedup, and works history compression.

## Context Summary
- Working on `feature/skills-workers-revamp` branch
- Backend: Express + Knex + PostgreSQL, models extend BaseModel
- Frontend: React 19 + Vite, API layer in `api/minds.ts`
- LLM: Claude (chat/comparison), OpenAI (embeddings via `text-embedding-3-small`)
- Workers: BullMQ + Redis, processors in `src/workers/processors/`
- Portal: slug-based + portal key header validation, RAG context + LLM response
- Encryption: Node crypto, no external deps

## Existing Patterns to Follow
- Models: extend BaseModel, static methods, optional trx for transactions
- Controllers: thin layer, delegate to feature services
- Routes: auth middleware at top, feature-grouped
- Frontend API: type-safe async functions, error handling via try/catch
- Dark mode: `.minds-theme` scoped CSS, no `dark:` Tailwind
- Workers: BullMQ queues, processor files in `src/workers/processors/`

## Proposed Approach
9 tasks in 3 batches:
- **Batch 1** (Tasks 1-3): Test portal backend + frontend, credentials migration + encryption
- **Batch 2** (Tasks 4-6): Credentials model/controller/routes, credentials frontend, dedup migration + model
- **Batch 3** (Tasks 7-9): Dedup embedding on approval + portal, digests migration + model, digests worker + portal

## Risk Analysis
- **Level 1**: Test portal — low risk, reuses existing logic
- **Level 1**: Platform credentials — isolated new table, encryption is standard
- **Level 2**: Embeddings dedup — requires pgvector, async embedding generation could fail silently
- **Level 2**: Works digest — weekly cron + LLM calls, needs error handling for batch failures

## Definition of Done
- TypeScript clean on both frontend and backend
- Test portal endpoints return valid LLM responses
- Credentials stored encrypted, never returned in API responses
- Embedding generated on approval, dedup warning in portal for similar queries
- Digest worker compresses 30+ works into summaries, portal includes digests in context
