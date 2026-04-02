# Production Push: What's Ready, What's Broken, What Dave Needs

## Read This First

Dr. Pawlak just paid $1,500 on production. She's on getalloro.com (main branch). Production is 360+ commits behind sandbox. She is seeing the old, broken experience while a dramatically better product sits on sandbox.

This page has three sections. Read them in order. Push what's green.

---

## Section 1: What's Broken on Production RIGHT NOW

These are things customers are hitting today.

| Issue | Impact | Fix Location |
|-------|--------|-------------|
| PMS CSV upload confusing, data not parsing | Customers can't upload their data | src/services/pmsParser.ts |
| Production API routing: /api/health returns HTML | Backend may not be proxied correctly through Apache | Apache/nginx config on EC2 |
| Title says "Business Clarity for Specialists" | Old branding, signals dental-only | frontend/index.html |
| Orthodontist case value $800 (should be $5,500) | Wrong dollar figures destroy trust | src/routes/checkup.ts |
| "No login required" on entry but account required for results | Broken promise | frontend/src/pages/checkup/EntryScreen.tsx |
| "Great experience!" fabricated for empty reviews | Trust violation | frontend/src/pages/checkup/ScanningTheater.tsx |
| Booth #835 shown to ALL users (not just AAE) | Barbershop in Oregon sees dental conference | frontend/src/pages/ThankYou.tsx |
| "Prospects" language throughout findings | Cold B2B language for a person searching at 11pm | src/routes/checkup.ts |
| No Oz moment fallback (if Claude API slow, nothing shows) | The most important feature silently disappears | src/services/ozMoment.ts |

---

## Section 2: What's Ready to Push (Zero Dependencies)

These changes are on sandbox, tested, TypeScript clean, build clean. They need NO migrations, NO env vars, NO infrastructure changes. Pure code merge.

### Frontend Only (safest, push first):

1. **Warm Design System** -- frontend/src/index.css, frontend/src/lib/animations.ts. New card hierarchy, warm shadows, celebration animations. Pure CSS.
2. **Dashboard Warmth** -- frontend/src/pages/DoctorDashboard.tsx + dashboard components. Warm cards, warm empty states, warm section dividers.
3. **Homepage Rebuild** -- frontend/src/pages/marketing/HomePage.tsx. Complete rewrite. Identity-first, Foundation prominent.
4. **Checkup Entry** -- frontend/src/pages/checkup/EntryScreen.tsx. Warmer headline, question field removed, trust signals fixed.
5. **Checkup Results** -- frontend/src/pages/checkup/ResultsScreen.tsx. Dollar impact removed, blur gate reframed, 2 findings free instead of 1, DentalEMR gate.
6. **Scanning Theater** -- frontend/src/pages/checkup/ScanningTheater.tsx. Specialty vocabulary, "Great experience" removed.
7. **ThankYou** -- frontend/src/pages/ThankYou.tsx. Booth conditional, warm design.
8. **Signin** -- frontend/src/pages/Signin.tsx. Warm gradient, terracotta inputs.
9. **20 Content Pages** -- frontend/src/pages/content/*.tsx. "No login required" replaced across all.
10. **Admin Dashboards** -- VisionaryView, IntegratorView, RevenueDashboard. Warm design.

### Frontend + Backend (no migrations, no env vars):

11. **Checkup Backend** -- src/routes/checkup.ts. Research-backed economics, specialty detection fixes (Surf City Endo, oculofacial, garden designer, med spa), "People" not "Prospects", no-competitor reframing.
12. **Oz Moment Fallback** -- src/services/ozMoment.ts. Template-based insights when Claude API fails.
13. **Scoring Model** -- src/routes/checkup.ts + src/controllers/places/feature-utils/fieldMasks.ts. New Google API fields, openingDate scoring, trust assessment framing.

---

## Section 3: What Needs Infrastructure (Push After Section 2)

These require migrations, env vars, or Redis stability.

| Feature | Dependency | Files |
|---------|-----------|-------|
| Dream Team Agent Scheduler | Migration: agent_schedules table, Redis, BullMQ | src/jobs/ |
| Monday Email | MAILGUN_API_KEY, MAILGUN_DOMAIN, DNS verification | src/jobs/mondayEmail.ts |
| CS Pulse Engine | Migration: client_health_status, ALLORO_CS_SLACK_WEBHOOK | src/jobs/csPulse.ts |
| Weekly Digest | Migration: weekly_metrics, Redis, BullMQ | src/jobs/weeklyDigest.ts |

---

## How to Push

Option A (safest): Cherry-pick the frontend-only changes to main first. Verify on production. Then push backend changes.

Option B (faster): Merge sandbox to main. Run migrations. Verify.

Option C (fastest): Make sandbox the production branch. Point the deploy pipeline at sandbox. This is effectively what we want long-term.

Dave: pick whichever approach you're most confident in. The goal is Dr. Pawlak sees the real product by end of week.

---

## Verification After Push

1. curl https://getalloro.com/api/health should return JSON, not HTML
2. Run checkup for "Artful Orthodontics Winter Garden FL" -- should score ~74, show Oz moments
3. Sign in as a client account -- dashboard should show warm cards, not gray borders
4. Homepage should say "You trained for years in a craft you love" not the old copy
5. Title tag should say "Alloro - Business Clarity" not "Business Clarity for Specialists"

---

*Written April 1, 2026. This page is final. Do not scatter these instructions elsewhere. If something changes, update THIS page.*

---

## URGENT: Production API Not Routing (April 2, 2026)

**Every customer on production is affected right now.**

`curl https://getalloro.com/api/health` returns HTML instead of JSON.
The Apache/nginx proxy is not forwarding /api/* routes to the Node backend.

This means:
- Pawlak's dashboard shows no data (she thinks rankings dropped)
- Garrison can't reset his password (the reset endpoint doesn't respond)
- DentalEMR sees no metrics (Merideth reports demos/conversions dropping)
- EVERY API call from the React frontend fails silently

**The fix:** Apache or nginx config needs to proxy /api/* to the Node
backend (likely localhost:3000 or whatever port the Node process runs on).

**How to verify:**
```
curl https://getalloro.com/api/health
```
Should return: `{"status":"ok","timestamp":"..."}`
Currently returns: HTML (the React app's index.html)

**This is the single most impactful fix possible right now.**
Every feature, every dashboard, every score depends on the API working.
