# Message for Dave -- #alloro-dev

Copy-paste this to #alloro-dev when you're ready to kick off Dave's review.

---

Hey Dave -- sandbox is ready for your review. Here's everything organized the way you asked for it: features not goals, simplest first, tests on every card.

**Blast radius summary (13 cards):**
- Cards 1-6: Green (frontend, context providers, static pages -- no DB/auth/billing)
- Cards 7-11: Yellow (new services, migrations -- notify #alloro-dev then deploy)
- Card 12: Red (Trial + Billing Gate -- requires Corey approval + your conversation)
- Card 13: Yellow (Agent Canon -- backlog, not blocking anything)

**What was NOT touched:** Your PM system (37 files, 0 lines changed), website builder, notification system, form submissions, E2E test framework, infrastructure configs. All intact.

**3 documents, each serves a different purpose:**
- **Migration Manifest V2** (13 cards, simplest-first): how to merge -- https://docs.google.com/document/d/1d1XDTAAiGAD1qSGKK_5kmb9VaOI7hvlV3xFFmx9O3dk
- **Confidence Sheet** (answers your 3 validation gates): is it clean -- `docs/DAVE-CONFIDENCE-SHEET.md`
- **Product Inventory** (every file, every route, every migration explained): what is all this -- `docs/SANDBOX-INVENTORY.md`

764 commits, 73 new route files, 69 new migrations, 22 new pages.

**Pattern alignment (done):**
After you said code needs to be consistent with what we have, we ran a full audit of every new file against your main branch patterns. Fixed across 6 commits:
- `{ success: boolean }` on every JSON response
- `[Tag]` prefix on every console statement
- JSDoc headers on all 73 new route files
- `export default` on everything
- Hardcoded localhost URLs replaced with `API_BASE_URL` env var
- 0 violations remaining

**What you need to do (infrastructure only):**
1. Set `SENTRY_DSN` env var on EC2 (5 min, Green)
2. Set `SLACK_WEBHOOK_URL` GitHub secret (5 min, Green)
3. Set `APP_URL` env var on EC2 (5 min, Green)
4. GBP OAuth callback URL (15 min, Yellow -- Card 8)
5. Rotate Google Places API key (15 min, Yellow)
6. Cherry-pick sandbox onto main when ready (Migration Manifest guides this)

**What's NOT in this merge:**
- 58-agent system (backlogged)
- PatientPath pipeline (post-AAE)
- SMS/Twilio (post-AAE)
- n8n Monday email webhook (post-AAE)

**AAE (April 15-18):**
Conference mode runs entirely on sandbox with fallback data. No prod deploy needed for AAE. The booth demo works today.

Card 1 is ready now. Green blast radius, frontend-only, ~15 minutes. Start whenever you're ready.

---
