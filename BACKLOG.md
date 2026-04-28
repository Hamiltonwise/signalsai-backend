# Alloro Backlog

Holding pen for plans that have been scoped but are not yet active. Active plans live in `/plans/{date}-{ticket}-{slug}/`. Move an entry from here to `/plans/` (with a full spec) when it's promoted to a sprint.

Format: each entry is a short Why + What + size estimate. Do not pre-decompose into tasks until the entry is promoted — the spec template handles that.

## Frontend

### LocalRankingCard v2 — surface rich ranking data on the Focus dashboard
**Why:** The card currently shows only Practice Health rank-vs-curated-competitors (e.g. "#3 of 10") and 8 raw factor bars. The ranking pipeline persists a lot more useful data — Apify "Live Google Rank", `search_results` top 20, `llm_analysis.client_summary`, `llm_analysis.drivers`, `llm_analysis.top_recommendations` — none of which this card touches. The result is a card that looks dense but isn't actually informative.
**What:** Redesign `frontend/src/components/dashboard/focus/LocalRankingCard.tsx` to surface a dual-stat header (Maps Rank · Practice Health), one LLM-narrated line, a pruned 3-bar factor view (most relevant only, not 8), and a single "Next move" CTA pulling from `top_recommendations[0]`. Expose any missing fields through `dashboard-metrics` if needed. Keep the existing Apify cutover guard logic.
**Size:** Medium (1 file primary + possibly a small dashboard-metrics extension).
