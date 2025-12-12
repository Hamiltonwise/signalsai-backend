# Practice Ranking Analysis Agent

---

## 1. System Prompt

```
You are an expert SEO and local search analyst specializing in dental specialty practices. Analyze the practice's ranking performance against competitors and provide actionable insights.

## Ranking Factors (8 weighted factors)
1. Primary Category Match (25%)
2. Total Review Count (20%)
3. Overall Star Rating (15%)
4. Keyword in Business Name (10%)
5. Review Velocity/Recency (10%)
6. NAP Consistency (8%)
7. GBP Profile Activity (7%)
8. Review Sentiment (5%)

## Your Analysis Must Include
1. **Gap Analysis**: Where the practice underperforms vs competitors
2. **Driver Analysis**: Which factors impact their ranking most
3. **Recommendations**: Prioritized actions to improve

## Rules
- Be specific with numbers and comparisons
- Reference actual competitor data
- Prioritize by impact and effort
- Respond with valid JSON only
```

---

## 2. Input Schema

```json
{
  "additional_data": {
    "practice_ranking_id": 123,
    "callback_url": "https://backend/api/admin/practice-ranking/webhook/llm-response",
    "client": {
      "domain": "example-ortho.com",
      "practice_name": "Example Orthodontics",
      "specialty": "orthodontics",
      "location": "Austin, TX",
      "rank_score": 72.5,
      "rank_position": 4,
      "total_competitors": 20,
      "factors": {
        "category_match": { "score": 25.0, "max": 25.0, "details": "..." },
        "review_count": { "score": 15.2, "max": 20.0, "details": "..." },
        "star_rating": { "score": 13.5, "max": 15.0, "details": "..." },
        "keyword_name": { "score": 0.0, "max": 10.0, "details": "..." },
        "review_velocity": { "score": 7.8, "max": 10.0, "details": "..." },
        "nap_consistency": { "score": 8.0, "max": 8.0, "details": "..." },
        "gbp_activity": { "score": 3.0, "max": 7.0, "details": "..." },
        "sentiment": { "score": 4.5, "max": 5.0, "details": "..." }
      },
      "gbp_data": {
        "business_name": "string",
        "total_reviews": 245,
        "average_rating": 4.7,
        "reviews_last_30d": 12,
        "primary_category": "Orthodontist",
        "photos_count": 45,
        "posts_last_90d": 3
      },
      "gsc_data": {
        "top_queries": [
          {
            "query": "string",
            "clicks": 120,
            "impressions": 2500,
            "position": 3.2
          }
        ],
        "total_impressions": 12500,
        "total_clicks": 890,
        "avg_position": 4.2
      },
      "website_audit": {
        "lcp": 2.1,
        "performance_score": 78,
        "has_local_schema": true,
        "has_review_schema": false
      }
    },
    "competitors": [
      {
        "name": "Top Smile Orthodontics",
        "rank_score": 89.2,
        "rank_position": 1,
        "total_reviews": 412,
        "average_rating": 4.9,
        "has_keyword_in_name": true
      }
    ],
    "benchmarks": {
      "avg_score": 65.3,
      "avg_reviews": 185,
      "avg_rating": 4.5,
      "top_performer": { "name": "string", "score": 89.2 }
    }
  }
}
```

---

## 3. Output Schema

```json
{
  "practice_ranking_id": 123,
  "gaps": [
    {
      "type": "review_gap | profile_gap | activity_gap | technical_gap",
      "area": "string",
      "impact": "high | medium | low",
      "current_value": "string",
      "benchmark_value": "string",
      "gap_size": "string",
      "reason": "string",
      "recommended_action": "string"
    }
  ],
  "drivers": [
    {
      "factor": "category_match | review_count | star_rating | keyword_name | review_velocity | nap_consistency | gbp_activity | sentiment",
      "weight": 0.25,
      "current_score": 25.0,
      "max_score": 25.0,
      "direction": "positive | negative | neutral",
      "insight": "string"
    }
  ],
  "render_text": "Plain text analysis summary with executive summary, key findings, and 90-day action plan. NO MARKDOWN FORMATTING.",
  "verdict": "improving | stable | declining | needs_attention",
  "confidence": 0.87,
  "top_recommendations": [
    {
      "priority": 1,
      "title": "string",
      "description": "string",
      "impact": "high | medium | low",
      "effort": "high | medium | low",
      "timeline": "string",
      "expected_outcome": "string"
    }
  ],
  "citations": ["string"]
}
```

**Error Response:**

```json
{
  "practice_ranking_id": 123,
  "error": true,
  "error_code": "INVALID_INPUT",
  "error_message": "string"
}
```

---

## 4. n8n Dynamic Variables

Access all webhook data via this data set:

| Data         | n8n Variable                                                           |
| ------------ | ---------------------------------------------------------------------- |
| Full payload | `{{ JSON.stringify($json.body.additional_data) }}`                     |
| Practice ID  | `{{ JSON.stringify($json.body.additional_data.practice_ranking_id) }}` |
| Client data  | `{{ JSON.stringify($json.body.additional_data.client) }}`              |
| Competitors  | `{{ JSON.stringify($json.body.additional_data.competitors) }}`         |
| Benchmarks   | `{{ JSON.stringify($json.body.additional_data.benchmarks) }}`          |

---

## 5. OUTPUT CONSTRAINTS

- **Schema Compliance:** The output must strictly follow the output structure defined
- **Negative Constraints:**
  - Do NOT use markdown formatting.
  - Do NOT use code blocks (no ```json).
  - Do NOT include conversational text, prose, or comments outside the JSON object.
- **Format:** The response must begin immediately with `{` and end with `}`.
