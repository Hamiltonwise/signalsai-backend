# Alloro Tasks

## Critical -- Before AAE (April 15)

- [x] **Checkup output polish** -- Oz Moments moved above readings, dynamic competitive headline, velocity in diagnostic, tighter reveal timing. TypeScript clean. (April 9)
- [ ] **Deploy sandbox to production** -- BLOCKER. Every automated system is built and waiting. Proofline, score recalc, Monday emails, AEO monitor. Dave runs 3 commands. Nothing fires until this happens. Escalate daily.
- [ ] **Fix proofline cron** -- daily 6am, stopped firing after April 2. 467 narratives sitting unseen. Dave to investigate.
- [ ] **Fix score recalculation cron** -- Monday 3am, last_run_at: never. Scores frozen at checkup values. Dashboard never reflects improvement.
- [ ] **Seven-day free trial flow** -- Dave says "fast" to build. QR scan -> checkup -> competitor rank -> auto-account creation -> email with dashboard link. No payment gate before TTFV.
- [ ] **QR code -> checkup -> trial pipeline** -- end-to-end for AAE booth. QR code design is printed (Dave confirmed). Routes to /checkup?source=aae2026&mode=conference. AAELanding.tsx exists.
- [ ] **One Endo Go Live** -- April 10 (tomorrow). DNS A-record change. Dave on standby in Slack at 8am.
- [ ] **DentalEMR partner page** -- Dave building today. Meredith needs it to rebuild vendor trust.
- [ ] **DentalEMR form submissions** -- spam filter disabled to stop blocking real leads. ~10 leads lost.
- [ ] **AAE landing page updates** -- date changes, contact info, pricing corrections. On Dave's project board.
- [ ] **Google Search Console setup** -- Corey creating accounts for all clients. TXT record verification needed.

## High -- Post-AAE, Customer Value

- [ ] **Surface proofline on Home page** -- 467 "What Alloro Did" narratives in agent_results (type=proofline). Home page has the section but reads from wrong source. Wire to agent_results. Green blast radius. CC builds.
- [ ] **Surface GBP performance on Home page** -- calls, directions, clicks stored in practice_rankings.raw_data.client_gbp.performance. 7 orgs have this. Not shown anywhere. The revenue proof bridge. CC builds.
- [ ] **Surface full competitor landscape** -- 20 competitors per scan with velocity. Only top competitor shown. The data exists. CC builds.
- [ ] **Business data uploader on Home** -- warm prompt when no data exists. Uses full intelligence ingestion (vision parser, paste, CSV, any format). NOT just PMS wizard.
- [ ] **Automated review responses** -- AI drafts response, customer approves with one click. GBP API can push responses. "Huge game changer" (Corey).
- [ ] **GBP posting automation** -- Google wants engagement every 30 days. Alloro could write and push posts. Needs GBP API write access.
- [ ] **Website makeover tool** -- PatientPath site generation from reviews + market data. WebsiteMakeover component exists (admin-only). "We're not there yet" (Corey).

## Medium -- Inbound Engine

- [ ] **"Bring a friend" referral program** -- Jo's language: "split the check." Prompt appears halfway through free trial. Community, not transaction.
- [ ] **Nurturing language development** -- tribe language: "we're all on the same side." Not B2B SaaS tone.
- [ ] **Confirmation email (Oz Pearlman)** -- triggered when PatientPath build completes. Dynamic: actual URLs, actual ranking status, actual AEO confirmation.
- [ ] **SEO + AEO + CRO Intelligence Panel** -- three-tab UI. "The Built-In Ahrefs" spec in Notion. Phase 1 needs Places API data only.

## Low -- Infrastructure (Post-Pipeline)

- [ ] **Evaluate Claude Managed Agents** -- released April 8. Could replace BullMQ+Redis+PM2 worker infra. Dave experiments with AEO monitor first (low-risk).
- [ ] **WO-14: Human Authenticity Agent** -- gates all external content. Build after pipeline is live.
- [ ] **WO-12: Biological-Economic Lens** -- output gate for 5 agent files. Build after pipeline is live.
- [ ] **WO-13: getalloro.com full rebuild** -- marketing site already works. Only rebuild when inbound data justifies changes.

## Ongoing

- [ ] **Morning brief automation** -- Cowork scheduled task, daily 6am. Scans Slack, Fireflies, Notion, Stripe, Gmail, Calendar.
- [ ] **Weekly review automation** -- Cowork scheduled task, Friday 5pm. Shipped items, customer pulse, financial snapshot, risk register.
- [ ] **Client communication follow-ups** -- Artful: congratulate on new review. Garrison: monthly cadence (first Wednesday 11am starting May 6). Safe: monitor data upload.
- [ ] **DentalEMR site migration** -- video content migration, dropdown menu restoration. Dave's bandwidth.

## Data Gaps Found (April 9 inventory)

- 467 proofline narratives never shown to any client
- 826 rows of GBP impression data never surfaced
- GBP performance (calls, directions, clicks) for 7 orgs, shown nowhere
- Full 20-competitor landscape with velocity, only top competitor surfaced
- Score recalculation cron never ran (scores frozen at checkup)
- Proofline cron stopped after April 2
- CS Agent reads from agent_outputs table that doesn't exist (guarded with .catch)
- 1,073 agent tasks never shown to clients
- GA4/GSC data in google_data_store, never surfaced
- Client review trajectory exists in data but never visualized

## Completed

- [x] Checkup output polish: Oz Moments above fold, competitive headline, velocity diagnostic, reveal timing (April 9)
- [x] Business data uploader prompt added to Home page (April 9)
- [x] Website editor link on Presence page (already existed)
- [x] CRO insights surface on Presence page (already existed with backend route)
- [x] Known 3 violation fixed: removed position claims from Home page
- [x] Universal language fix: "patient" -> "customer" on Presence page
- [x] Memory system initialized (people, glossary, company context)
- [x] Cowork operating system: scheduled morning brief + weekly review
- [x] Full product inventory completed (87 tables, 47 with data, 40 empty)
