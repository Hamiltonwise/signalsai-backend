# Checkup Tool — Current State Investigation

**Date**: 2026-04-22
**Branch**: checkup-upgrade (from sandbox)

## Current Output Format

The Checkup tool (`POST /api/checkup/analyze`) produces a "Clarity Score" based on
6 GBP readings (Stage 1 data tier):

1. **Star Rating** — 4.5+ healthy, 4.0-4.4 attention, <4.0 critical
2. **Review Volume** — vs competitor leader
3. **Review Recency** — last 30 days
4. **Profile Completeness** — phone, hours, website, photos, description
5. **Review Response Rate** — 80%+ healthy
6. **Photos** — 10+ healthy

### Score Structure
```
score: {
  composite: 0-100,
  googlePosition: 0-34,    // Response rate
  reviewHealth: 0-33,       // Stars + volume + recency
  gbpCompleteness: 0-33,   // Profile + photos
}
```

### Additional Output
- `competitors[]` — up to 5 with rating, reviewCount, driveTime
- `findings[]` — type/title/detail/value/impact
- `sentimentInsight` — review sentiment comparison
- `ozMoments[]` — high-shareability insights
- `surpriseFindings[]` — HIGH confidence only
- `gaps[]` — CheckupGapItem progress bars
- `market` — city, totalCompetitors, avgRating, rank
- `vocabulary` — vertical-specific terminology
- `websiteIntelligence` — hero quote, themes for site generation

## Recognition Tri-Score (Built, Not Wired In)

The Recognition Tri-Score (`recognitionScorer.ts`) exists but is NOT currently
wired into the main checkup route response. It:
- Scores practice in SEO + AEO + CRO modes simultaneously
- Extracts 3-5 missing examples from Google reviews
- Has a bridge service (`checkupRecognitionSection.ts`) for persistence
- Feature flag: `recognition_score_enabled`
- Persists to `organizations.checkup_data.recognition`

## What Needs to Change

1. Wire tri-score into the checkup analyze response as primary output
2. Add prospect-appropriate framing (inviting, not indicting)
3. Emit `checkup_completed` behavioral event for Sales Agent
4. Feature flag `checkup_tri_score_enabled` gates the new output
5. Notion-driven copy templates for framing
