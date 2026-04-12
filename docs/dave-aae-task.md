# AAE Environment Readiness -- Dave Task Sheet

> Due: Monday April 13, before end of day PH time
> Conference: AAE, Salt Lake City, April 15-18
> Branch: sandbox (auto-deploys on push)
> No code changes needed from Dave. All code work is done.

## Status of code (for Dave's confidence)

Every customer-facing screen in the QR-to-trial flow has been audited, tested, and committed. Constitution compliance check passes 7/7 on the critical path. TypeScript compiles with zero errors. Ten commits on sandbox since Friday, each individually verified.

| Commit | What | Status |
|--------|------|--------|
| a703e5b6 | K3/K4/K6 compliance sweep across all pages | PASS |
| efad7985 | RankingsScreen reframe, HomePage cleanup | PASS |
| 53b3c061 | Email kill switch (safety: no accidental sends) | PASS |
| b378054e | Constitution check script (automated compliance) | PASS |
| 4586a8ec | Conference fallback: category-aware names, tribal copy | PASS |
| 227675ab | ScanningTheater: URL crash, K3 copy, K14 font, GBP jargon | PASS |
| 01d4ff3a | PMS upload org resolution (data no longer orphaned) | PASS |
| 9d229883 | PMS upload prompt in post-signup flow (closes banner loop) | PASS |
| 0c67006c | Cards, QR asset, sprint nav, Dave task spec | PASS |

## What Dave needs to do

### Task 1: Set APP_URL (5 minutes)

On sandbox EC2, add to the environment and restart Node:

```
APP_URL=https://sandbox.getalloro.com
```

**Why:** Share links use `APP_URL` to build URLs. Without it, links default to `https://app.getalloro.com`. Every prospect who shares their checkup at AAE sends friends to a potentially unresolvable domain.

**Verify:**
```bash
# 1. Endpoint responds
curl -s https://sandbox.getalloro.com/api/checkup/geo
# Should return JSON with lat/lng

# 2. Share URLs correct (run a checkup, create account, share)
# Generated URL should start with https://sandbox.getalloro.com/checkup
```

### Task 2: Verify n8n webhook (2 minutes)

```bash
curl -s -o /dev/null -w "%{http_code}" https://n8n.getalloro.com/webhook/parse-csv
```

**Expected:** `200` or `405` (GET not allowed = endpoint exists, which is correct).

**Why:** PMS file uploads send data to this webhook. If n8n is down, `syncReferralSourcesFromPmsJob()` still populates the dashboard from local preprocessing, but the full analysis pipeline stalls silently. For AAE, the local sync is sufficient, but confirming n8n gives us the complete pipeline.

**If n8n is down:** Not a blocker. Local preprocessing handles it. But flag it so we can fix before Day 2 uploads.

### Task 3: Email decision (Corey + Dave)

The 7-day trial email drip is blocked on sandbox (`ALLOW_EMAIL_SEND` not set). Three options:

**A) Enable on sandbox.** Set `ALLOW_EMAIL_SEND=true`. Safeguard: only accounts created after April 14 receive emails (the code already timestamps account creation). Risk: test accounts may receive emails.

**B) Deploy sandbox to production before AAE.** Point the QR code at `app.getalloro.com`. Email pipeline works there. Stripe would need live keys. This is the real answer if we want the full 7-day trial experience.

**C) Accept no emails.** Dashboard-only trial. Prospects see checkup + referral intelligence but get zero re-engagement emails. Conversion risk: they forget about us by Day 3.

**Recommendation:** B if time allows. A as fallback. C only if neither is possible.

## What Dave does NOT need to do

- No code changes
- No merge to main
- No DNS changes (unless choosing Option B)
- No reviewing PRs

All code is committed, compiled, and constitution-checked on sandbox. CC and Cowork handled everything. Dave's role is environment configuration only.
