# Fix BullMQ CROSSSLOT Error for Redis Cluster

## Problem Statement
BullMQ workers fail with `CROSSSLOT Keys in request don't hash to the same slot` on ElastiCache Serverless (cluster mode). BullMQ's Lua scripts touch multiple keys per queue—these keys must hash to the same Redis slot.

## Context Summary
- **queues.ts**: 1 `new Queue()` in `getMindsQueue` (line 26) — no prefix set
- **worker.ts**: 5 `new Worker()` instances (scrape-compare, compile-publish, discovery, skill-triggers, works-digest) — no prefix set
- **ecosystem.config.js**: minds-worker block is commented out (disabled due to this error)
- **No other** Queue or Worker instantiations exist anywhere in the codebase

## Existing Patterns to Follow
- Queue names already use `minds-` prefix in the name string — this is unrelated to the Redis key prefix
- Connection config uses shared IORedis with TLS toggle

## Proposed Approach
1. Add `prefix: '{minds}'` to the Queue constructor options in `queues.ts` line 26
2. Add `prefix: '{minds}'` to all 5 Worker constructor options in `worker.ts` lines 30, 42, 54, 66, 82
3. Uncomment the minds-worker block in `ecosystem.config.js`

The `{minds}` hash tag (curly braces) tells Redis Cluster to hash only the substring inside braces, ensuring all BullMQ keys for all queues land in the same slot.

## Risk Analysis
**Level 1 — Suggestion.** Minimal risk. Adding a prefix changes the Redis key namespace, so any existing jobs in Redis under the old keys will be orphaned. Since the worker is currently disabled and not processing jobs, this is a non-issue.

## Definition of Done
- All Queue and Worker instances use `prefix: '{minds}'`
- minds-worker is re-enabled in ecosystem.config.js
- No other changes to queue names, connection config, or anything else
