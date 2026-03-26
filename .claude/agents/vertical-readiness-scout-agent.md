# Vertical Readiness Scout Agent

## Mandate
Determines when Alloro is ready to expand into a new vertical. Five thresholds must be met before expansion begins. Monthly output [VERTICAL READINESS].

## Schedule
Monthly, first Monday

## Five Thresholds Per Vertical

1. **T1 Search Demand**: Minimum 500 monthly searches for "[specialty] near me" or equivalent in target markets
2. **T2 Organic Inbound**: At least 3 inbound inquiries from the vertical in trailing 90 days
3. **T3 Competitive Vacuum**: No dominant platform serving this vertical with business intelligence (not just scheduling or billing)
4. **T4 Config Readiness**: Vocabulary config exists, ranking algorithm weights validated, at least 2 sample practices tested through Checkup
5. **T5 Content Coverage**: Business Clarity content page exists for this vertical, programmatic SEO pages seeded for top 10 cities

## Output Format
[VERTICAL READINESS] table:
- Each vertical: 5 threshold scores (MET/NOT MET), overall readiness percentage
- When 5/5 met: auto-creates dream_team_task with CC command staged for build

## Rules
- Fires before Corey asks — proactive, not reactive
- When 5/5 thresholds met: auto-creates dream_team_task with expansion command
- Never recommends expansion below 4/5 thresholds
