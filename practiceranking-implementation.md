This request is identical to the user's previous request. Since the previous response provided the complete implementation plan in a Markdown format, I will repeat that final, correct output.

---

## Final Implementation Plan: SEO Intelligence Agent

This plan outlines the final requirements and data flow for integrating the SEO Intelligence Agent as a new feature within your existing application structure.

### 1\. ⚙️ Deployment & Context Instructions

The implementation must adhere to the following structural and deployment parameters:

| Component               | Instruction                                                                                                                | Location/Requirement                                                           |
| :---------------------- | :------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------- |
| **Feature Access**      | The new feature will be accessible via a dedicated **"Practice Ranking" tab** within the admin section of the application. | New Admin UI page/route required.                                              |
| **Frontend Code**       | The frontend counterpart of this project resides in the `signalsai` folder.                                                | Front-end development should be executed within the **`signalsai`** directory. |
| **Backend Integration** | The backend logic (API orchestration, scoring, LLM calls) must be callable from the new "Practice Ranking" tab.            | New backend services/endpoints required to support the data flow.              |

---

### 2\. 🎯 Project Goal & Core Strategy

**Goal:** Analyze client dental specialty practices (Endo/Ortho) against local competitors, produce a **proprietary local ranking score**, and generate a comprehensive, actionable JSON report.

**Strategy:** Implement a **Hybrid Credential Strategy** utilizing both private client OAuth tokens for authenticated data (GSC/GBP) and third-party APIs (Apify/SEMRush) for scalable competitor intelligence.

---

### 3\. 🛡️ Data Sources and Credential Strategy

The solution requires five parallel data streams:

| Data Stream                  | Tool/API                                | Access Requirement                 | Purpose                                                                             |
| :--------------------------- | :-------------------------------------- | :--------------------------------- | :---------------------------------------------------------------------------------- |
| **Own Internal Metrics**     | **Google Business Profile (GBP) API**   | Pre-Stored Client **OAuth Tokens** | Private views, clicks, and authenticated review data.                               |
| **Own Search Performance**   | **Google Search Console (GSC) API**     | Pre-Stored Client **OAuth Tokens** | Accurate organic search queries (`top_queries`), impressions, and CTR.              |
| **Local Competitor Data**    | **Apify Google Maps Scraper**           | API Key / Public Access            | Scalable **deep public data** on $\sim 100$ competitors (full reviews, categories). |
| **Website Audit Data**       | **Apify Lighthouse/SEO Actor**          | API Key / Public Access            | Client website technical audit (`core_web_vitals`, `schema`).                       |
| **Competitor Organic Proxy** | **Third-Party SEO API** (e.g., SEMrush) | Paid Subscription API Key          | **Estimated organic rankings** and traffic volume for competitor domains.           |

---

### 4\. 🛠️ Complete Step-by-Step Data Flow (12 Steps)

The backend service will manage this orchestration:

1.  **Input/Auth:** Collect input (Specialty, Location) and retrieve client credentials (Place ID, Domain, Tokens) from the database.
2.  **Competitor Discovery:** Call **Apify Maps Scraper** with the search query to identify $\sim 100$ competitor Place IDs.
3.  **Client Data Fetch:** Concurrently call the **GBP API** and **GSC API** using stored OAuth tokens.
4.  **Competitor Deep Scrape:** Call **Apify Maps Scraper** for detailed competitor review/activity data.
5.  **Website Audit:** Call **Apify SEO Actor** on the client's domain to gather Core Web Vitals.
6.  **Competitor Proxy Fetch:** Call the **Third-Party SEO API** for estimated organic rankings on competitor domains.
7.  **Data Standardization:** Map all five streams of raw data to a single, unified JSON schema.
8.  **Proprietary Score Calculation:** Execute the weighted 8-factor formula on all practices (client and competitors).
9.  **Storage:** Save all raw data, processed metrics, and the final Rank Score to the database.
10. **LLM Input Compilation:** Compile a master JSON object for LLM input (Score, GSC data, CWV results, Benchmarks).
11. **LLM Analysis:** Pass the compiled JSON to the LLM to generate the analytical fields (`gaps`, `drivers`, `render_text`).
12. **Final Output:** Validate the LLM output against the required schema and return the final JSON to the frontend.

---

### 5\. 🔢 Proprietary Ranking Algorithm (8 Weighted Factors)

This formula is essential for calculating the Rank Score for the client and all competitors:

$$\text{Rank Score} = \sum_{n=1}^{8} (W_n \times \text{Normalized } M_n)$$

| Rank   | Factor (Metric)          | Weight ($W_n$) |
| :----- | :----------------------- | :------------- |
| **1.** | Primary Category Match   | **25%**        |
| **2.** | Total Review Count       | **20%**        |
| **3.** | Overall Star Rating      | **15%**        |
| **4.** | Keyword in Business Name | **10%**        |
| **5.** | Review Velocity/Recency  | **10%**        |
| **6.** | NAP Consistency          | **8%**         |
| **7.** | GBP Profile Activity     | **7%**         |
| **8.** | Review Sentiment         | **5%**         |

---

### 6\. 📤 Final Expected Output Schema

The final backend endpoint must return a JSON object strictly conforming to this structure:

```json
{
  "practice_id": "string",
  "specialty": "orthodontics",
  "observed_at": "2025-10-24T00:00:00Z",
  "period": "last_14d",
  "snapshot": {
    /* GSC DATA: organic_avg_position, map_pack_presence_rate, impressions, clicks, ctr, volatility_index */
  },
  "top_queries": [
    {
      /* GSC DATA: query, pos_avg, pos_delta, competitors (from third-party SEO API) */
    }
  ],
  "page_mapping": [
    {
      /* WEBSITE AUDIT DATA: page, primary_queries, coverage_score, core_web_vitals, schema */
    }
  ],
  "gaps": [
    /* LLM GENERATED: Type, query_class, impact, reason */
  ],
  "drivers": [
    /* LLM GENERATED: factor, weight, direction */
  ],
  "render_text": "string" /* LLM GENERATED: Summary of performance and recommendations */,
  "links": [{ "label": "GSC query report", "url": "string" }],
  "verdict": "string",
  "confidence": "number",
  "citations": ["string"],
  "freshness": "string",
  "lineage": "string"
}
```
