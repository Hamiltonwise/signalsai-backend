# Data Pipeline Audit -- April 1, 2026

## Key Finding: THE DATA IS THERE

Every GBP-connected client has ranking data:

| Client | Org ID | Rank | Score | Location | Competitors |
|--------|--------|------|-------|----------|-------------|
| One Endodontics | 39 | #2/19 | 98.72 | Falls Church, VA | 19 |
| Caswell Orthodontics | 25 | #7/20 | 92.51 | Honolulu, HI | 20 |
| Artful Orthodontics | 8 | #6/20 | 89.46 | Winter Garden, FL | 20 |
| Garrison Orthodontics | 5 | #6/18 | 89.52 | West Orange, NJ | 18 |
| McPherson Endodontics | 21 | #1/15 | 87.35 | College Station, TX | 15 |
| DentalEMR | 6 | #1/1 | 50.46 | Unknown, US | 1 |

## The Problem is NOT data. It's rendering.

The ranking pipeline runs. The GBP connections work. The snapshots generate.
The dashboards appear empty because of FRONTEND rendering issues, not missing data.

## Issues Found

1. **Duplicate orgs**: Garrison Orthodontics exists as both org 5 and org 66
2. **Test orgs polluting the list**: test-preflight, Pre-Mortem, Pre-Mortem Test, multiple Smoke Test practices
3. **DentalEMR location**: "Unknown, US" -- GBP connected but location not resolved
4. **JSON special characters**: Review text contains control characters that break JSON.parse in some contexts
5. **Valley Endodontics**: No GBP connection (org 42)

## What Needs Fixing (in priority order)

1. Clean up duplicate/test orgs from the admin view
2. Fix any frontend rendering bugs that prevent ranking data from displaying
3. Resolve DentalEMR location data
4. Connect Valley Endodontics GBP
5. Fix JSON special character handling in ranking raw data

## Root Cause of "Empty Dashboards"

The dashboards are NOT empty because data is missing. They may APPEAR empty because:
- Frontend components may have rendering errors that fail silently
- The sub-score mapping between ranking API and dashboard components may have mismatches
- Specific data fields expected by UI components may be null despite the ranking existing
- CSS/layout issues may hide content that technically exists in the DOM

## Next Steps

Walk through each client's dashboard in the BROWSER (not just API) and identify
exactly what renders vs. what doesn't. The API returns data. If the screen is
empty, the bug is between the API response and the React render.
