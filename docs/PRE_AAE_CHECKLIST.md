# Pre-AAE Deployment Checklist

Conference date: April 14, 2026
Everything below must be TRUE before Corey walks into the AAE venue.

---

## CRITICAL PATH: Dave (Infrastructure)

These are sequential. Each one depends on the one before it.

- [ ] **Step 1: DATABASE_URL in GitHub Actions secrets**
  Needed for: CI/CD pipeline to run migrations on deploy
  Verify: Push a no-op commit, confirm Actions workflow passes

- [ ] **Step 2: Rotate Google Places API key**
  Needed for: Live checkup data (reviews, ratings, place details)
  Verify: `curl` the Places API from production server, confirm 200

- [ ] **Step 3: DEPLOY-PLAYBOOK.md complete**
  All production environment variables configured:
  - DATABASE_URL (PostgreSQL connection string)
  - REDIS_URL (BullMQ job queue)
  - MAILGUN_API_KEY + MAILGUN_DOMAIN (transactional email)
  - ANTHROPIC_API_KEY (AI agent services)
  - GOOGLE_PLACES_API_KEY (reviews and place data)
  - DEMO_MODE=true (conference fallback for bad WiFi)
  - SESSION_SECRET, JWT_SECRET
  - Node process manager (PM2 or equivalent)
  - Nginx reverse proxy configured
  - SSL certificate active on getalloro.com
  Verify: All vars present in EC2 environment, `npm run smoke` passes

- [ ] **Step 4: Run `npm run seed:demo` on production**
  Needed for: Demo data available if checkup is slow or WiFi fails
  Verify: Hit /api/health, confirm demo businesses exist in DB

- [ ] **Step 5: Run `npm run smoke` on production (all 12 checks PASS)**
  Checks: health endpoint, DB connection, Redis connection, Places API, Mailgun send, checkup flow, score calculation, competitor lookup, trial creation, Monday email generation, agent service availability, demo mode fallback
  Verify: All 12 green. If any red, fix before proceeding.

- [ ] **Step 6: Send test Monday email to corey@getalloro.com**
  Verify: Arrives in inbox (not spam/promotions), formatting correct, links work, unsubscribe works

- [ ] **Step 7: Shawn password reset before April 3**
  Needed for: Early access account is functional for demo if needed
  Verify: Can log in as Shawn, see dashboard, see checkup results

---

## CRITICAL PATH: Corey (Sales Readiness)

- [ ] **Rehearse booth script 3x with timer**
  Each full demo (hook through close) must complete in under 90 seconds
  Practice on 3 different practice names
  Practice all 3 hook options
  Practice the top 4 objection responses out loud

- [ ] **Test checkup on personal phone**
  Test on WiFi AND on cellular (LTE/5G)
  Confirm: scanning theater animates, score appears, competitor shows, improvement plan renders
  Test on both Safari and Chrome mobile

- [ ] **Test checkup on 3 businesses NOT in the test set**
  Fresh practices that have never been through the system
  Confirm: data is real, scores are reasonable, no errors
  Log any issues for CC to fix before April 14

- [ ] **Prepare business cards with QR code**
  QR code links to: getalloro.com/checkup
  Card includes: Corey's name, Alloro logo, "Free Business Checkup" tagline
  Order quantity: 500 minimum
  Test QR code with 3 different phone cameras

- [ ] **Confirm booth number and setup**
  Booth number: ____
  Power outlet confirmed: Y/N
  Table/counter for phone demo: Y/N
  Signage dimensions: ____

- [ ] **DentalEMR agreement sent to Merideth**
  Needed for: partnership channel
  Verify: Sent and acknowledged

---

## CRITICAL PATH: CC (Code Readiness)

All complete as of March 27, 2026.

- [x] 50 agent services built and wired
- [x] First Impression scoring calibrated on 9 real businesses
- [x] Score Improvement Plan, Competitor Comparison, Track Competitor built
- [x] Weekly Score Recalculation + What-If Simulator + Score History
- [x] Trial engine, referral rewards, autonomous billing
- [x] Conference fallback handles bad WiFi (DEMO_MODE)
- [x] Admin panel: revenue dashboard, live feed, ghost filter
- [x] Vocabulary sweep complete (universal language in core, vertical-specific in configs)
- [x] Sandbox branch pushed to origin, ready for Dave to review and merge

---

## NICE TO HAVE (if time permits before April 14)

- [ ] Booth signage with live score counter ("We've scanned [N] practices today")
- [ ] iPad stand for self-service checkups when Corey is talking to someone else
- [ ] Pre-loaded competitor data for top 20 endodontic practices in AAE host city
- [ ] "Text me my results" option (Twilio) as alternative to email capture

---

## DAY-OF CHECKLIST (April 14 morning)

- [ ] Phone charged to 100%, backup battery charged
- [ ] Open getalloro.com/checkup in Chrome, confirm it loads
- [ ] Run one test checkup on a known business, confirm full flow
- [ ] Business cards in left pocket
- [ ] Notebook and pen for logging conversations
- [ ] Water bottle filled
- [ ] Booth signage set up
- [ ] WiFi credentials saved, cellular data enabled as backup
- [ ] Demo mode toggle bookmarked in case of network issues

---

## ROLLBACK PLAN

If production is broken on April 14:

1. Enable DEMO_MODE=true (serves cached/seeded data)
2. If DEMO_MODE fails: pull up sandbox on localhost via phone hotspot to laptop
3. If all tech fails: hand them the business card, say "Run it when you get back to the office. It takes 60 seconds." The QR code is the last line of defense.

The checkup URL works on their phone. If your demo breaks, put the phone in their hand and let them run it themselves.

---

## SUCCESS CRITERIA

By end of day April 14:
- 50+ checkups completed (live or demo)
- 10+ email addresses captured
- 5+ accounts created
- 0 crashes or error screens shown to a prospect
- Corey's voice still works

By end of week (April 20):
- All captured emails in the system
- 7-day trial sequences triggered for every account
- Conversation log digitized with hook/objection/outcome data
- First Monday email scheduled for April 21
