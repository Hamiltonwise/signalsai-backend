# Spec: Fix Google Places textSearch 403

**Priority:** Critical. This blocks the entire data pipeline. Without it, no fresh rankings, no real Monday email intelligence, no competitor discovery.

**Auth note:** All admin endpoints require a super admin JWT. Log in as a super admin, grab the token from localStorage (`auth_token`), and use as `$TOKEN` in curl commands below.

## Card 1: Diagnose textSearch API Key Permissions

Blast Radius: Green (read-only investigation)
Complexity: Low
Dependencies: none

What Changes:
- Nothing. Investigation only.

Touches:
- Database: no
- Auth: no
- Billing: no
- New API endpoint: no

Investigation Steps:
1. SSH into sandbox EC2
2. Run: `echo $GOOGLE_PLACES_API` to confirm the key is set
3. Run: `curl -X POST "https://places.googleapis.com/v1/places:searchText" -H "Content-Type: application/json" -H "X-Goog-Api-Key: $GOOGLE_PLACES_API" -H "X-Goog-FieldMask: places.displayName,places.rating,places.userRatingCount" -d '{"textQuery": "dentist in Salt Lake City", "maxResultCount": 3}'`
4. If 403: the key is missing the "Places API (New)" permission in Google Cloud Console
5. If 200: the key works and the issue is something else (IP restriction, quota, billing)

What This Blocks:
- Competitor discovery returns 0 competitors for all non-cached orgs
- Weekly ranking snapshots store position=0
- Monday email bullets fall back to generic "your market is being tracked"
- Customer-facing readings show stale data from initial checkup instead of fresh weekly data

Done Gate:
textSearch returns 200 with real results from EC2. Confirm by checking: `curl` returns places array with displayName, rating, userRatingCount.

---

## Card 2: Fix the API Key

Blast Radius: Green (env var change only)
Complexity: Low
Dependencies: Card 1 diagnosis

What Changes:
- Google Cloud Console: enable "Places API (New)" on the project associated with `GOOGLE_PLACES_API` key
- OR: remove IP restriction on the API key (if it restricts to IPs that don't include EC2)
- OR: create a new key with correct permissions and update `.env` on EC2

Touches:
- Database: no
- Auth: no
- Billing: no (Places API has $200/month free credit)
- New API endpoint: no

Verification Tests:
1. From EC2, run the curl from Card 1. Must return 200 with places data.
2. Trigger a manual ranking refresh: `curl -X POST https://sandbox.allorohealth.com/api/admin/rankings/run-now -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"org_id": 39}'` (org 39 = Shawn Hatch Endodontics). Check `weekly_ranking_snapshots` table: position must be > 0, competitor_name must be populated.
3. Trigger a manual score recalc: `curl -X POST https://sandbox.allorohealth.com/api/admin/score-recalc/run-now -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"org_id": 39}'`. Check `organizations` table: `current_clarity_score` must reflect real data (should be 50-80 range for Shawn, not 17-33).

Done Gate:
All verification tests pass? Yes = the data pipeline is unblocked. Monday email for all orgs will have real intelligence.

---

## Card 3: Run Catch-Up After Fix

Blast Radius: Yellow (writes to DB for all orgs)
Complexity: Low
Dependencies: Card 2

What Changes:
- Run: `curl -X POST https://sandbox.allorohealth.com/api/admin/rankings/run-all -H "Authorization: Bearer $TOKEN"`
- Run: `curl -X POST https://sandbox.allorohealth.com/api/admin/score-recalc/run-all -H "Authorization: Bearer $TOKEN"`
- SSH into sandbox EC2, cd to alloro repo, run: `npx knex migrate:latest` to apply pending migration (resets previous_clarity_score so Monday email doesn't report phantom jumps from the algorithm change)

Touches:
- Database: yes (writes fresh snapshots and scores for all orgs)
- Auth: no
- Billing: no
- New API endpoint: no

Verification Tests:
1. Check `weekly_ranking_snapshots` for 3 orgs: all have position > 0 and competitor_name populated
2. Check `organizations` for 3 orgs: `current_clarity_score` is in 40-90 range (not 17-33)
3. Check `organizations` for all orgs: `previous_clarity_score` is null (migration applied)

Done Gate:
All verification tests pass? Yes = ready for Monday email. No = investigate which org failed and why.
