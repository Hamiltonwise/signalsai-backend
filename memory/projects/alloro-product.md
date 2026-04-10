# Alloro Product -- What's Built, What's Not

## Source of Truth
docs/PRODUCT-OPERATIONS.md (the Product Constitution) -- 15 Knowns

## Backend Intelligence (BUILT, waiting for deploy)
| Service | Status | When |
|---------|--------|------|
| Weekly Ranking Snapshots | Wired | Sunday 11 PM UTC |
| Weekly Score Recalc | Wired | Monday 3 AM UTC |
| Monday Email | Wired | Monday 7 AM local time |
| Daily Review Sync | Wired | 4 AM UTC daily |
| Daily Analytics Fetch | Wired | 5 AM UTC daily |
| Weekly CRO Engine | Wired | Sunday 9 PM UTC |
| Welcome Intelligence | Wired | 4 hours after signup |
| Instant Snapshot | Wired | On signup |
| Review Sentiment Comparison | Wired | On Home page load |
| Stale Score Catch-up | Wired | On server restart |
| Review Poll Catch-up | Wired | On server restart |

## Key Backend Services
- surpriseFindings.ts -- 420 lines, 6 finding types, the "Oz Pearlman Homework Strategy"
- mondayEmail.ts -- imports surprise findings, fires during steady-state override
- croEngine.ts -- reads GSC + GA4, identifies 4 opportunity types, generates copy changes via LLM
- patientpathCRO.ts -- A/B testing system, 3 variants, deterministic hash, auto-concludes
- aeoMonitor.ts -- weekly check of 20+ monitoring queries against Google search results
- programmaticSEOAgent.ts -- weekly page performance analysis
- pms-vision-parser.service.ts -- Claude Vision extracts data from ANY image/PDF
- oneActionCard.ts -- 6-priority waterfall
- systemConductor.ts -- 7-gate quality system
- feedbackLoop.ts -- Karpathy Loop for Monday emails

## Frontend Pages (5-page layout)
1. Home ("Am I okay?") -- greeting, watchline, one action card, status strip, weekly finding
2. Compare/Get Found ("How do I compare?") -- competitor comparison, referral sources
3. Reviews ("What are people saying?") -- individual reviews with AI drafts
4. Presence/Your Website ("What does my presence look like?") -- website, GBP, CRO insights
5. Progress/Your Numbers ("Am I getting better?") -- trajectory, gap-closing

## What's NOT Built Yet
- Seven-day free trial flow
- Auto-account creation from QR/checkup
- PatientPath auto-generation (makeover tool is admin-only trigger)
- SEO/AEO/CRO Intelligence Panel (three-tab UI)
- Automated GBP post publishing
- Automated review response push via API
- GSC integration (no accounts connected yet)
- "Bring a friend" referral mechanism
- Confirmation email triggered by PatientPath build completion
