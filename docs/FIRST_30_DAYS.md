# First 30 Days Playbook

Post-AAE operational plan. April 14 through May 14, 2026.
Every day has a purpose. Every week has a target. No coasting.

---

## Week 1: AAE + Immediate Follow-Up (April 14-20)

### April 14 (AAE Day)

**Morning:**
- Run 1 test checkup to confirm production is live
- Review booth script one final time
- Goal for the day: demo to every doctor who makes eye contact

**During the conference:**
- Demo to every doctor who stops at the booth
- Log every conversation in notebook:
  - Practice name
  - Doctor name
  - What hook worked (A, B, or C)
  - What objection came up
  - What excited them most
  - Email captured? (Y/N)
  - Account created? (Y/N)
- Between conversations: check for any error reports, monitor system health

**End of day targets:**
- 50+ checkups completed
- 10+ email addresses captured
- 5+ accounts created
- 0 system failures visible to prospects

### April 15-16 (Immediate follow-up)

- Digitize the conversation log into a spreadsheet
- Tag each contact: HOT (created account), WARM (gave email), COOL (took card only)
- Verify all accounts triggered the 7-day trial sequence
- For HOT contacts: send personal follow-up email referencing something specific from the conversation
- For WARM contacts: confirm their checkup results email (Day 1) was delivered
- For COOL contacts: nothing yet. The card is in their pocket. They will either scan it or they won't.

### April 17-18 (Data review)

- Review all checkup results generated at AAE
- Flag any scoring anomalies or data quality issues
- Identify the 3 most compelling "Oz findings" from real demos (these become marketing material)
- Update First Impression scoring weights if any calibration issues surfaced
- Learning Agent: first real-world feedback loop. What patterns emerged?

### April 19-20 (Weekend)

- Write a LinkedIn post about the AAE experience (not a sales pitch, a story)
  - "I showed 50 specialists something about their business they didn't know. Here's what surprised me."
  - Include one anonymized finding that is genuinely interesting
- Prepare for Monday email launch

**Week 1 Targets:**
| Metric | Target | How to measure |
|--------|--------|---------------|
| Checkups completed | 50+ | Dashboard count |
| Emails captured | 10+ | CRM/database count |
| Accounts created | 5+ | User table count |
| Trial sequences triggered | 5+ | BullMQ job log |
| System uptime during AAE | 100% | Health check logs |

---

## Week 2: First Monday Emails (April 21-27)

### Monday, April 21 (The big test)

**Morning:**
- First real Monday emails fire to AAE signups
- This is the moment of truth. The email must deliver the same "How did they know that?" feeling as the live demo.
- Monitor in real-time: delivery rate, bounce rate, spam complaints

**By noon:**
- Check open rate (target: 60%+)
- Check click rate (target: 20%+)
- Check for any replies (every reply gets a personal response from Corey within 4 hours)

**If open rate is below 40%:**
- Check spam folder placement (send test to Gmail, Outlook, Yahoo)
- Review subject line. Consider A/B test for next week.
- Check if Mailgun domain reputation is clean

### Tuesday, April 22

- Day 3 email fires for April 19 signups ("Reply with a GP name")
- Monitor reply rate. Every reply is gold.
- If replies come in: respond personally, add the referral source to their account, confirm it shows in their dashboard

### Wednesday, April 23

- Competitive Scout fires first Tuesday alerts to accounts that have competitors tracked
- Monitor: did the alerts deliver? Were they accurate? Did anyone click through?
- Review the data quality of competitor tracking across all AAE accounts

### Thursday-Friday, April 24-25

- First Day 5 emails fire for April 19 signups ("Know someone who should see this?")
- Monitor referral link clicks. If anyone forwards the checkup: this is the split-the-check mechanic working.
- Learning Agent: first weekly calibration. Update heuristics based on:
  - Which hook worked most often at AAE
  - Which objection was most common
  - Which Oz finding generated the strongest reaction
  - Email engagement patterns

### Saturday-Sunday, April 26-27

- First Day 7 emails fire ("Your score this week")
- This is the habit hook. If they open this, the weekly cadence has begun.
- Review: how many of the 50+ checkup users are still engaged?

**Week 2 Targets:**
| Metric | Target | How to measure |
|--------|--------|---------------|
| Monday email open rate | 60%+ | Mailgun analytics |
| Monday email click rate | 20%+ | Mailgun analytics |
| Reply-trap replies | 3+ | Inbox count |
| Referral links clicked | 2+ | Analytics |
| Trial conversions to paid | 3+ | Billing table |
| Competitor tracking active | 5+ accounts | Database query |

---

## Week 3: Content Engine Ignition (April 28 - May 4)

### Content production

Publish first 4 blog posts on getalloro.com/blog:

1. **"What [N] Specialist Practices Taught Us About First Impressions"**
   Source: anonymized, aggregated AAE checkup data
   Angle: data-driven, interesting findings, not a sales pitch
   CTA: "Run your own checkup" link at bottom

2. **"The Monday Email Your Practice Manager Will Actually Read"**
   Source: what the Monday email contains and why it matters
   Angle: show the product without selling the product
   CTA: free checkup

3. **"Your Patients Are Talking About You. Here's What They Say."**
   Source: sentiment analysis patterns from real reviews
   Angle: the Oz effect, things you didn't know about your own business
   CTA: free checkup

4. **"How to Beat Your Top Competitor Without Spending a Dollar on Ads"**
   Source: the improvement plan methodology
   Angle: practical, actionable, builds authority
   CTA: free checkup + competitor tracking

### Content distribution

- Corey reviews and edits all 4 posts (CMO Agent drafts, Corey finalizes)
- Publish 1 per day, Monday through Thursday
- Share each on LinkedIn with a personal take
- First HeyGen video: convert the top-performing post into a 90-second video
  - Post to LinkedIn, embed on the blog post page
- Submit sitemap to Google Search Console
- Verify all blog pages are indexable (no accidental noindex tags)

### Product iteration

- Review all feedback from Week 2 email engagement
- Fix any UX issues surfaced by real users
- If any checkup scoring needs adjustment, ship the fix
- Priority: anything that blocks a trial-to-paid conversion

**Week 3 Targets:**
| Metric | Target | How to measure |
|--------|--------|---------------|
| Blog posts published | 4 | Site check |
| LinkedIn posts | 4 | LinkedIn activity |
| First HeyGen video | 1 | Published URL |
| Sitemap submitted | Yes | Search Console |
| First organic checkup from content | 1+ | UTM tracking |
| Paid conversions cumulative | 5+ | Billing table |

---

## Week 4: First Intelligence Report (May 5-11)

### State of Clarity micro-report

If 50+ checkups have been completed (AAE + organic combined):

**Title:** "We analyzed [N] specialist practices. Here's what the best ones do differently."

**Contents:**
- Average First Impression Score across all practices scanned
- Top 3 factors that separate high scorers from low scorers
- Most common "blind spot" (thing practices don't know about themselves)
- One surprising finding that makes people stop and think

**Format:** Clean PDF, Alloro branding, 2-3 pages max. Not a whitepaper. A quick read that delivers one "How did they know that?" moment.

**Distribution:**
- Corey posts on LinkedIn with personal commentary
- Email to all AAE contacts (even COOL ones who only took a card)
- Embed on the website as a lead magnet
- If any press/podcast interest: this is the talking point

### "Split the check" mechanic

- Review referral data: has anyone used their referral link?
- If yes: celebrate it. Send a personal thank-you. This is the growth loop starting.
- If no: review the referral email (Day 5). Is the ask clear? Is the reward compelling?
- Consider: is there a way to make sharing easier? (Pre-written text, one-tap share?)

### System health

- Review all agent service performance over 30 days
- Identify any services that are slow, inaccurate, or unused
- Learning Agent: monthly calibration. What changed? What improved? What needs human review?
- Prepare a list of product improvements for the next build cycle

**Week 4 Targets:**
| Metric | Target | How to measure |
|--------|--------|---------------|
| Micro-report published | Yes | PDF + LinkedIn post |
| Total checkups (all sources) | 75+ | Dashboard count |
| First referral conversion | 1+ | Referral tracking |
| Paid accounts | 7+ | Billing table |
| Monthly recurring revenue | $1,000+ | Stripe/billing |
| Churn (cancelled trials) | Under 30% | Billing table |

---

## Day 30 Review (May 14)

Sit down. Look at the numbers. Answer three questions:

**1. Did the product deliver undeniable value?**
- Did anyone say "How did they know that?" unprompted?
- Did anyone share their checkup without being asked?
- Did the Monday email get replies?

**2. Is the growth loop working?**
- Are new checkups coming from outside the AAE list?
- Did the content drive any organic traffic?
- Did the referral mechanic produce any signups?

**3. What needs to change?**
- What was the #1 reason people did NOT convert from trial to paid?
- What was the #1 thing people loved?
- What did Corey hear at AAE that the product doesn't address yet?

Write the answers down. These three answers determine the entire Q2 roadmap.

---

## Key Dates Summary

| Date | Event |
|------|-------|
| April 3 | Shawn password reset deadline |
| April 7 | Final production smoke test |
| April 10 | Business cards must be in hand |
| April 12 | Full dress rehearsal (3 timed demos, phone test, backup battery test) |
| April 14 | AAE conference |
| April 15 | Follow-up emails to HOT contacts |
| April 21 | First Monday emails fire |
| April 28 | First blog post published |
| May 5 | State of Clarity micro-report |
| May 14 | Day 30 review |

---

## The Standard

Every action in this playbook points at one outcome: a specialist runs the checkup, sees something they did not know, and decides they want that clarity every week.

If that happens, the business works. If it does not happen, no amount of content, email sequences, or conference demos will save it.

Build for that moment. Measure against that moment. Everything else is noise.
