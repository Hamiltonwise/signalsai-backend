# Alloro -- Company Context

## What Alloro Is
Autonomous growth infrastructure for local service businesses. Not software. Not a dashboard. Not an agency. The doctor's job: exist. Alloro's job: make sure every person looking for that doctor finds them, trusts them, and converts.

## The Three Promises
1. GBP/SEO monitoring and intelligence
2. Business data integration and referral tracking
3. Website CRO optimization

## The Google Moment
The library required the trip. Google eliminated the trip. Alloro eliminates the question. Intelligence comes to you before you search for it.

## Current Customers (as of April 12, 2026)
| Customer | Revenue | Stripe Status | Notes |
|----------|---------|---------------|-------|
| Garrison Orthodontics | $2,000/mo | Active (sub_1THnrvD) | Monthly check-ins, AI search #1, reference account |
| Artful Orthodontics | $1,500/mo | Active (sub_1THUSbD) | Grandfathered discount (couldn't afford full price, didn't see value yet). Data accuracy issues with Edge PMS. Form submission drop. |
| Caswell | $2,000 + $1,500 x 2 locations = $5,000/mo | NOT in Stripe yet | Multi-location |
| DentalEMR | $3,500/mo | NOT in Stripe yet | Exception pricing. Partner/reseller. AAE conference prep. |
| Kargoli | Discounted (TBD) | NOT in Stripe yet | Early adopter discount |
| One Endo (Dr. Safe Cuda) | $1,500/mo | NOT in Stripe yet | Go Live April 10 |
| McPherson | $0 | N/A | Beta/study club model (RISE Scholars #1 and #2) |

Alloro Stripe MRR: $3,500 (Garrison + Artful)
Old HW Stripe: DEMR ($3,500) + Caswell ($5,000) still on Hamilton Wise account
1Endo: billing set up, not yet completed
Note: Dave (CTO) has a $2,000/mo test subscription in Alloro Stripe -- needs cleanup before external demos.

## Tech Stack
- Frontend: React 18+, TypeScript, Vite, Tailwind CSS, shadcn/ui
- Backend: Node.js, Express, Knex, PostgreSQL
- Workers: BullMQ + Redis + PM2 (54 processors, ~6 needed for launch)
- Repo: ~/Desktop/alloro, branch: sandbox
- Production: EC2 (Dave manages), getalloro.com

## Key Dates
- AAE Conference: April 15-18, 2026 (Salt Lake City)
- One Endo Go Live: April 10, 2026
- Jo maternity: currently active but on leave

## Financial Reality
- Mercury balance: ~$3,510 (April 2026)
- Corey: month 2 without paycheck
- DentalEMR services work funds growth stage
- Urgency is existential, not theoretical

## Connected Systems
- Slack: #alloro-dev for build reports and blockers only
- Notion: Build Queue, Build State, Claude's Corner, HQ
- Fireflies: All meeting transcripts
- Stripe: Billing and subscriptions
- Mercury: Banking
- Google Calendar: Team scheduling
- Gmail: Client communication
