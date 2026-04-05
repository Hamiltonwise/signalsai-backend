/**
 * Help Articles -- The knowledge base.
 *
 * These articles serve three purposes:
 * 1. The chatbot references them when answering questions
 * 2. The help page displays them for browsing
 * 3. Contextual "?" on reading cards pull from them
 *
 * Content sourced from docs/PRODUCT-OPERATIONS.md (the constitution).
 * If the constitution changes, these should too.
 */

export interface HelpArticle {
  id: string;
  title: string;
  category: "readings" | "pages" | "features" | "getting-started" | "troubleshooting" | "team";
  summary: string;
  body: string;
  audience: "customer" | "team" | "all";
}

export const HELP_ARTICLES: HelpArticle[] = [
  // ─── Readings ──────────────────────────────────────────────────────
  {
    id: "reading-star-rating",
    title: "What does my Star Rating mean?",
    category: "readings",
    summary: "Your star rating on Google and why it matters for visibility.",
    audience: "customer",
    body: `Your star rating is pulled directly from your Google Business Profile. You can verify it by searching your business name on Google.

Why it matters: 68% of consumers require 4 or more stars before considering a local business. 31% require 4.5 or higher. Below 4.0, conversion drops steeply.

Healthy: 4.5 stars or above. Attention: 4.0 to 4.4. Critical: below 4.0.

Every 5-star review moves your average. The most effective approach is asking happy customers for a review at the moment they're most satisfied, before they leave your office.`,
  },
  {
    id: "reading-review-volume",
    title: "What does Review Volume mean?",
    category: "readings",
    summary: "Your review count compared to your top competitor and why the gap matters.",
    audience: "customer",
    body: `Review volume shows how many Google reviews you have compared to your top competitor. Both numbers link to Google so you can verify them yourself.

Why it matters: Google uses review count as a top 3 local ranking factor. Businesses with 50 or more reviews earn 4.6 times more revenue than those with fewer. The gap between you and your top competitor directly affects which business appears first when someone searches.

Healthy: you have as many or more reviews than your top competitor. Attention: you have at least half as many. Critical: you have less than half.

At 3 reviews per week, you can calculate exactly how many weeks it takes to close the gap.`,
  },
  {
    id: "reading-profile-completeness",
    title: "What does Profile Completeness mean?",
    category: "readings",
    summary: "The five fields Google checks on your Business Profile.",
    audience: "customer",
    body: `Profile completeness measures five fields on your Google Business Profile: phone number, business hours, website, photos, and business description.

Why it matters: Google says complete profiles are 2.7 times more likely to be considered reputable and 70% more likely to attract location visits. GBP signals make up 32% of local ranking weight, the single largest factor.

Each missing field is a gap your competitors may not have. Adding a missing field takes minutes and has an immediate impact on how Google evaluates your business.

You can check your profile by clicking the verify link on your reading card.`,
  },
  {
    id: "reading-review-responses",
    title: "What does Review Responses mean?",
    category: "readings",
    summary: "Your response rate to Google reviews and why responding matters.",
    audience: "customer",
    body: `Review responses shows what percentage of your Google reviews have a reply from you.

Why it matters: Google confirms that responding to reviews improves local ranking. Businesses that respond to reviews earn 35% more revenue. A response signals to Google that your business is active and engaged.

Healthy: 80% or more of your reviews have responses. Attention: 1% to 79%. Critical: 0%.

Alloro drafts responses for you using AI. When your reviews appear on the Reviews page, you can approve and post a response with one tap.`,
  },
  {
    id: "reading-your-market",
    title: "What does Your Market mean?",
    category: "readings",
    summary: "The competitive landscape for your specialty in your city.",
    audience: "customer",
    body: `Your Market shows the competitive landscape: how many businesses offer your specialty in your city, and who your top competitor is.

This is a context reading. It helps you understand who you're compared against when someone searches for your specialty in your area.

The top competitor is identified by Google based on relevance, distance, and prominence. You can verify by clicking the search link, which runs the same search a potential customer would.

Alloro tracks this weekly. If a new competitor appears or an existing one gains ground, your Monday email will tell you.`,
  },

  // ─── Pages ─────────────────────────────────────────────────────────
  {
    id: "page-home",
    title: "What is the Home page?",
    category: "pages",
    summary: "Your readings at a glance plus the one thing that needs attention.",
    audience: "customer",
    body: `The Home page answers one question: "Am I okay?"

It shows your readings from Google, each with a colored status dot (green = healthy, yellow = attention, red = critical) and a link to verify the number on Google.

Below your readings is the One Action Card: the single most important thing for your business right now. It could be a competitor gaining ground, a referral source going quiet, or a simple fix that takes 10 minutes.

When nothing needs attention, the card says so. That's the product working perfectly.`,
  },
  {
    id: "page-compare",
    title: "What is the Compare page?",
    category: "pages",
    summary: "Side-by-side comparison with your top competitor.",
    audience: "customer",
    body: `The Compare page answers: "How do I compare?"

It shows a side-by-side table of your numbers vs your top competitor's numbers. Star rating, review count, photos. Each number links to Google for verification.

Below the comparison is "What to Focus On" with specific, actionable recommendations based on where the gaps are.

You can also track additional competitors by adding them on this page.`,
  },
  {
    id: "page-reviews",
    title: "What is the Reviews page?",
    category: "pages",
    summary: "Your Google reviews with AI-drafted responses.",
    audience: "customer",
    body: `The Reviews page answers: "What are people saying?"

It shows your individual Google reviews synced daily. For each review, Alloro drafts a professional response using AI.

For connected Google Business Profiles, you can approve and post the response with one tap. The response appears on your Google listing without you having to log in to Google.

The page also shows your review velocity: how fast you're gaining reviews compared to your competitor.`,
  },
  {
    id: "page-presence",
    title: "What is the Presence page?",
    category: "pages",
    summary: "Your website and Google Business Profile completeness.",
    audience: "customer",
    body: `The Presence page answers: "What does my online presence look like?"

It shows your Alloro-built website (if active) with a link to view it live, and your Google Business Profile completeness with which fields are complete and which are missing.

This is the mirror: what a potential customer sees when they search for your business.`,
  },
  {
    id: "page-settings",
    title: "What is the Settings page?",
    category: "pages",
    summary: "Connect Google, manage integrations, and billing.",
    audience: "customer",
    body: `The Settings page is where you connect your Google Business Profile, manage integrations, and handle billing.

Connecting Google unlocks weekly competitive tracking, review syncing, and the ability to post review responses directly to your listing.

If you have multiple locations, you can select which one Alloro monitors as your primary location.`,
  },

  // ─── Features ──────────────────────────────────────────────────────
  {
    id: "feature-monday-email",
    title: "What is the Monday email?",
    category: "features",
    summary: "Weekly intelligence delivered to your inbox every Monday at 7 AM.",
    audience: "customer",
    body: `Every Monday at 7 AM your local time, Alloro sends you an email with the current state of your competitive landscape.

The email includes: what changed this week, how you compare to your top competitor, and the one thing to focus on.

When nothing changed and everything is steady, the email says so. No upsell. No action items. Just: "Clean week. Enjoy it."

You don't need to log in to the dashboard. The email tells you everything. The dashboard is there when you want to look deeper.`,
  },
  {
    id: "feature-review-responses",
    title: "How do review responses work?",
    category: "features",
    summary: "AI drafts a response, you approve with one tap, it posts to Google.",
    audience: "customer",
    body: `When a new review appears on your Google Business Profile, Alloro:

1. Syncs the review to your Reviews page
2. Drafts a professional response using AI (warm, specific to what the reviewer said)
3. Shows you the draft with an "Approve and Post" button

When you tap approve, the response posts directly to your Google listing. You can verify by checking your reviews on Google.

For positive reviews: the response thanks the reviewer and invites them to share. For negative reviews: the response empathizes and invites them to contact your office directly.

This requires a connected Google Business Profile with OAuth.`,
  },
  {
    id: "feature-website",
    title: "How does my Alloro website work?",
    category: "features",
    summary: "A website built from your reviews and business data, live from day one.",
    audience: "customer",
    body: `When you sign up, Alloro builds a website from your Google Business Profile data and your reviews. It captures what makes your practice special using the words your own patients use.

The website is live at [your-practice].sites.getalloro.com. You can connect a custom domain through Settings.

To make changes, use the website editor accessible from your Presence page or the direct URL.`,
  },
  {
    id: "feature-checkup",
    title: "What is the Google Health Check?",
    category: "features",
    summary: "A free 60-second scan that shows how you compare in your market.",
    audience: "customer",
    body: `The Google Health Check (at getalloro.com/checkup) scans your Google Business Profile and compares you to every competitor in your market. In 60 seconds you see:

- Your readings: star rating, review count, profile completeness
- Your top competitor by name with their numbers
- The one thing that matters most right now
- Verification links so you can check every number on Google

The checkup is free. No login required. Your results are private.`,
  },

  // ─── Getting Started ──────────────────────────────────────────────
  {
    id: "getting-started-connect",
    title: "How do I connect my Google Business Profile?",
    category: "getting-started",
    summary: "Connect Google to unlock weekly tracking and review responses.",
    audience: "customer",
    body: `Go to Settings > Integrations and click "Connect Google." Sign in with the Google account that manages your Business Profile.

Once connected, Alloro will:
- Sync your reviews daily
- Track your competitive position weekly
- Enable one-tap review response posting
- Deliver personalized Monday emails with fresh data

If you manage multiple locations, select your primary location after connecting.`,
  },
  {
    id: "getting-started-expect",
    title: "What should I expect after signing up?",
    category: "getting-started",
    summary: "What happens in your first week with Alloro.",
    audience: "customer",
    body: `Within 60 seconds: Your readings appear from the Google Health Check.

Within 4 hours: A welcome email arrives with referral source intelligence and competitor velocity data.

Within 24 hours: Your website is live. Your reviews begin syncing.

Monday morning: Your first Monday email arrives with your competitive landscape, one finding, and one action.

Every week after: Alloro tracks your market, refreshes your data, and delivers a new brief. You run your business. Alloro runs the rest.`,
  },
  {
    id: "getting-started-verify",
    title: "How do I verify my readings?",
    category: "getting-started",
    summary: "Every number links to Google so you can check it yourself.",
    audience: "customer",
    body: `Every reading on your Home page has a verify link. Click it and you'll see the same number on Google.

For your star rating: the link searches your business name.
For review volume: the link searches your competitor's name.
For profile completeness: the link opens your Google Business Profile.
For your market: the link runs the search a potential customer would.

If a number doesn't match what you see on Google, it may be stale. Alloro refreshes data weekly on Sundays. You can also contact us through the chat.`,
  },

  // ─── Troubleshooting ──────────────────────────────────────────────
  {
    id: "troubleshoot-readings-wrong",
    title: "My readings don't match what I see on Google",
    category: "troubleshooting",
    summary: "Data refreshes weekly. Here's what to do if numbers are stale.",
    audience: "customer",
    body: `Alloro refreshes your data every Sunday evening. If your Google profile changed since the last refresh, the readings may be temporarily stale.

If the numbers don't match after Monday, contact us through the chat and we'll trigger a manual refresh.

Common causes of mismatches:
- You recently updated your Google profile (phone, hours, description)
- A review was added or removed since the last sync
- Google's API returns slightly different data than what appears in search (rare but possible)`,
  },
  {
    id: "troubleshoot-reviews-empty",
    title: "Why don't I see my reviews?",
    category: "troubleshooting",
    summary: "Reviews sync daily. Here's what to check if they're not appearing.",
    audience: "customer",
    body: `Reviews sync daily at 4 AM UTC. If your Reviews page shows "syncing," your reviews will appear within 24 hours of connecting your Google Business Profile.

If reviews still don't appear after 24 hours:
- Check that your Google Business Profile is connected in Settings > Integrations
- Make sure a primary location is selected
- Contact us through the chat and we'll check the connection`,
  },
  {
    id: "troubleshoot-profile-missing",
    title: "Why does it say my profile is missing fields I already have?",
    category: "troubleshooting",
    summary: "Profile data comes from Google's API, which may not return all fields.",
    audience: "customer",
    body: `Profile completeness data comes from Google's Places API. Occasionally, Google's API does not return all fields even when they exist on your listing.

If you see "Missing: Phone" but your phone number is on your Google Business Profile, it means Google's API didn't include it in the data Alloro received.

This resolves on the next weekly refresh. If it persists, contact us through the chat.`,
  },

  // ─── Team ──────────────────────────────────────────────────────────
  {
    id: "team-weekly-chain",
    title: "How does the weekly data chain work?",
    category: "features",
    summary: "Sunday snapshots, Sunday score recalc, Monday email.",
    audience: "team",
    body: `The weekly chain runs automatically:

Sunday 11 PM UTC (6 PM ET): Ranking snapshots refresh Google position and competitor data for all customers.

Monday 3 AM UTC (10 PM ET Sunday): Scores recalculate using fresh snapshot data.

Monday hourly: Monday email sends to orgs whose local time is 7 AM.

If snapshots don't run, scores use stale data and Monday emails contain last week's intelligence. All depend on Redis and the minds-worker PM2 process running on EC2.

Manual triggers available at /api/admin/rankings/run-all, /api/admin/score-recalc/run-all, and /api/admin/monday-email/run-all.`,
  },
  {
    id: "team-manual-triggers",
    title: "How do I manually trigger jobs?",
    category: "features",
    summary: "Admin endpoints for when crons fail.",
    audience: "team",
    body: `All manual triggers require admin auth (Authorization: Bearer $ADMIN_TOKEN):

POST /api/admin/rankings/run-now (body: { orgId }) -- snapshot for one org
POST /api/admin/rankings/run-all -- snapshots for all orgs
POST /api/admin/score-recalc/run-now (body: { orgId }) -- recalc for one org
POST /api/admin/score-recalc/run-all -- recalc for all orgs
POST /api/admin/monday-email/run-now (body: { orgId }) -- email for one org
POST /api/admin/monday-email/run-all -- email for all orgs
POST /api/admin/reviews/poll -- review poll for all practices`,
  },
  {
    id: "team-migrations",
    title: "What migrations are pending?",
    category: "features",
    summary: "Database migrations that need to run after deploy.",
    audience: "team",
    body: `Run from repo root: npx knex migrate:latest

Pending migrations:
- 20260403000001_add_org_timezone.ts: Adds timezone column to organizations
- 20260404000001_create_scoring_config.ts: Creates scoring_config table with 16 seed rows
- 20260404000002_add_review_postable_flag.ts: Adds postable boolean to review_notifications

After running, verify scoring config: GET /api/admin/scoring-config (should return 16 rows).`,
  },
];
