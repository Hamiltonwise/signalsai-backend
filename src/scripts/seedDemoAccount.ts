/**
 * Seed AAE Demo Account
 *
 * Creates or updates a demo org accessible via demo@getalloro.com / demo2026.
 * Seeds: org, user, ranking snapshot, referral sources (if table exists).
 *
 * Run: npx ts-node src/scripts/seedDemoAccount.ts
 * Or:  npm run seed:demo
 */

import * as dotenv from "dotenv";
dotenv.config();

import bcrypt from "bcrypt";
import { db } from "../database/connection";
import { generateReferralCode } from "../utils/referralCode";

const DEMO_EMAIL = "demo@getalloro.com";
const DEMO_PASSWORD = "demo2026";
const BCRYPT_ROUNDS = 12;

async function seed() {
  console.log("[SeedDemo] Starting...");

  // ── 1. Create or update user ──
  let user = await db("users").where({ email: DEMO_EMAIL }).first();
  if (!user) {
    const hash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_ROUNDS);
    [user] = await db("users")
      .insert({
        email: DEMO_EMAIL,
        password_hash: hash,
        first_name: "Demo",
        last_name: "Doctor",
        email_verified: true,
      })
      .returning("*");
    console.log(`[SeedDemo] Created user: ${user.id}`);
  } else {
    // Update password in case it changed
    const hash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_ROUNDS);
    await db("users").where({ id: user.id }).update({ password_hash: hash, email_verified: true });
    console.log(`[SeedDemo] Updated user: ${user.id}`);
  }

  // ── 2. Create or update organization ──
  let orgUser = await db("organization_users").where({ user_id: user.id }).first();
  let orgId: number;

  if (orgUser) {
    orgId = orgUser.organization_id;
    await db("organizations").where({ id: orgId }).update({
      name: "Valley Endodontics",
      subscription_tier: "DFY",
      subscription_status: "active",
      operational_jurisdiction: "Salt Lake City, UT",
      onboarding_completed: true,
      onboarding_wizard_completed: true,
      organization_type: "health",
      referral_code: generateReferralCode(),
      patientpath_status: "preview_ready",
      ttfv_response: "yes",
      first_win_attributed_at: new Date(Date.now() - 5 * 86_400_000),
      checkup_score: 61,
      checkup_data: JSON.stringify({
        score: { composite: 61, localVisibility: 22, onlinePresence: 24, reviewHealth: 15 },
        market: { city: "Salt Lake City", totalCompetitors: 7, avgRating: 4.5, avgReviews: 142, rank: 4 },
        topCompetitor: { name: "Wasatch Endodontics", rating: 4.9, reviewCount: 281, placeId: "demo-wasatch" },
        reviewCount: 58,
      }),
      owner_profile: JSON.stringify({
        vision_3yr: "I want to be the #1 endodontist in SLC and have Fridays off to coach my daughter's soccer team.",
        sunday_fear: "Losing Dr. Rodriguez as a referral source. She used to send 5 cases a month.",
        confidence_score: 6,
        confidence_threat: "DSO buyout offers keep coming. Hard to say no when the business feels like a second job.",
        people_challenge: "yes",
        personal_goal: "Fly fish on Fridays. Watch Sophie's games. Stop checking rankings on Sunday nights.",
        completed_at: new Date(Date.now() - 30 * 86_400_000).toISOString(),
      }),
      owner_archetype: "craftsman",
      archetype_confidence: 0.85,
      research_brief: JSON.stringify({
        findings: [
          "127 of your Google reviews mention 'gentle' or 'painless.' No competitor in your market uses this language on their site.",
          "You are the only endodontist within 15 miles offering same-day emergency appointments, but it is not on your website.",
          "Wasatch Endodontics has team photos from 2019. Yours are current and show matching scrubs.",
        ],
        irreplaceable_thing: "Same-day emergency access with a reputation for gentle, painless care",
      }),
      created_at: new Date(Date.now() - 90 * 86_400_000),
    });
    console.log(`[SeedDemo] Updated org: ${orgId}`);
  } else {
    const [org] = await db("organizations")
      .insert({
        name: "Valley Endodontics",
        subscription_tier: "DFY",
        subscription_status: "active",
        operational_jurisdiction: "Salt Lake City, UT",
        onboarding_completed: true,
        onboarding_wizard_completed: true,
        organization_type: "health",
        referral_code: generateReferralCode(),
        patientpath_status: "preview_ready",
        ttfv_response: "yes",
        first_win_attributed_at: new Date(Date.now() - 5 * 86_400_000),
        checkup_score: 61,
        checkup_data: JSON.stringify({
          score: { composite: 61, localVisibility: 22, onlinePresence: 24, reviewHealth: 15 },
          market: { city: "Salt Lake City", totalCompetitors: 7, avgRating: 4.5, avgReviews: 142, rank: 4 },
          topCompetitor: { name: "Wasatch Endodontics", rating: 4.9, reviewCount: 281, placeId: "demo-wasatch" },
          reviewCount: 58,
        }),
        owner_profile: JSON.stringify({
          vision_3yr: "I want to be the #1 endodontist in SLC and have Fridays off to coach my daughter's soccer team.",
          sunday_fear: "Losing Dr. Rodriguez as a referral source. She used to send 5 cases a month.",
          confidence_score: 6,
          confidence_threat: "DSO buyout offers keep coming. Hard to say no when the business feels like a second job.",
          people_challenge: "yes",
          personal_goal: "Fly fish on Fridays. Watch Sophie's games. Stop checking rankings on Sunday nights.",
          completed_at: new Date(Date.now() - 30 * 86_400_000).toISOString(),
        }),
        owner_archetype: "craftsman",
        archetype_confidence: 0.85,
        research_brief: JSON.stringify({
          findings: [
            "127 of your Google reviews mention 'gentle' or 'painless.' No competitor in your market uses this language on their site.",
            "You are the only endodontist within 15 miles offering same-day emergency appointments, but it is not on your website.",
            "Wasatch Endodontics has team photos from 2019. Yours are current and show matching scrubs.",
          ],
          irreplaceable_thing: "Same-day emergency access with a reputation for gentle, painless care",
        }),
        created_at: new Date(Date.now() - 90 * 86_400_000),
      })
      .returning("*");
    orgId = org.id;

    await db("organization_users").insert({
      organization_id: orgId,
      user_id: user.id,
      role: "admin",
    });
    console.log(`[SeedDemo] Created org: ${orgId}`);
  }

  // ── 3. Create location ──
  const existingLoc = await db("locations")
    .where({ organization_id: orgId, is_primary: true })
    .first();
  if (!existingLoc) {
    await db("locations").insert({
      organization_id: orgId,
      name: "Valley Endodontics",
      is_primary: true,
    });
    console.log("[SeedDemo] Created location");
  }

  // ── 4. Seed weekly_ranking_snapshots ──
  const weekStart = (() => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(now.setDate(diff)).toISOString().split("T")[0];
  })();

  const existingSnapshot = await db("weekly_ranking_snapshots")
    .where({ org_id: orgId, week_start: weekStart })
    .first();

  if (!existingSnapshot) {
    // Seed 8 weeks of snapshots for streak and delta data
    const snapshots = [
      { weeksAgo: 7, position: 7, clientReviews: 41, compReviews: 265, score: 48 },
      { weeksAgo: 6, position: 6, clientReviews: 43, compReviews: 268, score: 51 },
      { weeksAgo: 5, position: 6, clientReviews: 45, compReviews: 270, score: 53 },
      { weeksAgo: 4, position: 5, clientReviews: 48, compReviews: 273, score: 56 },
      { weeksAgo: 3, position: 5, clientReviews: 51, compReviews: 275, score: 58 },
      { weeksAgo: 2, position: 4, clientReviews: 54, compReviews: 278, score: 59 },
      { weeksAgo: 1, position: 4, clientReviews: 56, compReviews: 280, score: 60 },
      { weeksAgo: 0, position: 4, clientReviews: 58, compReviews: 281, score: 61 },
    ];

    for (const s of snapshots) {
      const ws = new Date();
      ws.setDate(ws.getDate() - ws.getDay() + 1 - s.weeksAgo * 7);
      const weekStartStr = ws.toISOString().split("T")[0];

      await db("weekly_ranking_snapshots").insert({
        org_id: orgId,
        week_start: weekStartStr,
        position: s.position,
        rank_score: s.score,
        keyword: "endodontist salt lake city",
        bullets: JSON.stringify([
          `You rank #${s.position} for endodontist in Salt Lake City.`,
          `Wasatch Endodontics has ${s.compReviews - s.clientReviews} more reviews than you.`,
        ]),
        competitor_note: "Wasatch Endodontics continues steady review growth.",
        finding_headline: s.position <= 4
          ? "You moved up. Here's what's next."
          : "Wasatch Endodontics is pulling away.",
        dollar_figure: Math.round((s.compReviews - s.clientReviews) * 14),
        competitor_position: 1,
        competitor_name: "Wasatch Endodontics",
        competitor_review_count: s.compReviews,
        client_review_count: s.clientReviews,
      }).catch(() => {}); // Ignore duplicate week conflicts
    }
    console.log("[SeedDemo] Seeded 8 weeks of ranking snapshots (streak + delta)");
  }

  // ── 5. Seed referral_sources (if table exists) ──
  const hasReferralSources = await db.schema.hasTable("referral_sources");
  if (hasReferralSources) {
    const existingRefs = await db("referral_sources")
      .where({ organization_id: orgId })
      .count("id as count")
      .first();

    if (Number(existingRefs?.count) === 0) {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
      const sixtySevenDaysAgo = new Date(now.getTime() - 67 * 86400000);

      const sources = [
        {
          organization_id: orgId,
          gp_name: "Dr. Chen",
          name: "Dr. Chen",
          gp_practice: "Chen Family Dentistry",
          referral_count: 8,
          recent_referral_count: 3,
          prior_3_month_avg: 2.5,
          monthly_average: 2.7,
          last_referral_date: thirtyDaysAgo,
        },
        {
          organization_id: orgId,
          gp_name: "Dr. Patel",
          name: "Dr. Patel",
          gp_practice: "Patel Dental Group",
          referral_count: 6,
          recent_referral_count: 2,
          prior_3_month_avg: 2,
          monthly_average: 2,
          last_referral_date: thirtyDaysAgo,
        },
        {
          organization_id: orgId,
          gp_name: "Dr. Williams",
          name: "Dr. Williams",
          gp_practice: "Williams DDS",
          referral_count: 4,
          recent_referral_count: 1,
          prior_3_month_avg: 1.3,
          monthly_average: 1.3,
          last_referral_date: thirtyDaysAgo,
        },
        {
          organization_id: orgId,
          gp_name: "Dr. Rodriguez",
          name: "Dr. Rodriguez",
          gp_practice: "Rodriguez Family Dental",
          referral_count: 8,
          total_referrals: 24,
          recent_referral_count: 2,
          prior_3_month_avg: 1.7,
          monthly_average: 1.7,
          last_referral_date: new Date(now.getTime() - 5 * 86400000),
        },
      ];

      await db("referral_sources").insert(sources);
      console.log("[SeedDemo] Seeded 4 referral sources (1 drift alert)");
    }
  } else {
    console.log("[SeedDemo] referral_sources table not found, skipping");
  }

  // ── 6. Seed vocabulary config ──
  const existingVocab = await db("vocabulary_configs").where({ org_id: orgId }).first();
  if (!existingVocab) {
    await db("vocabulary_configs").insert({
      org_id: orgId,
      vertical: "endodontics",
      overrides: JSON.stringify({}),
    });
    console.log("[SeedDemo] Seeded vocabulary config");
  }

  // ── 7. Seed behavioral events for win celebration + actions ──
  const hasBehavioralEvents = await db.schema.hasTable("behavioral_events");
  if (hasBehavioralEvents) {
    const existingEvents = await db("behavioral_events")
      .where({ org_id: orgId })
      .count("id as count")
      .first();

    if (Number(existingEvents?.count) === 0) {
      const now = new Date();
      await db("behavioral_events").insert([
        {
          id: db.raw("gen_random_uuid()"),
          org_id: orgId,
          event_type: "first_win.achieved",
          properties: JSON.stringify({
            headline: "Alloro caught something. You acted. It worked.",
            detail: "Dr. Rodriguez was quiet for 47 days. You called her Tuesday. She sent 2 cases by Friday. $18,000/year protected.",
          }),
          created_at: new Date(now.getTime() - 5 * 86_400_000),
        },
        {
          id: db.raw("gen_random_uuid()"),
          org_id: orgId,
          event_type: "one_action.completed",
          properties: JSON.stringify({ action: "Call Dr. Rodriguez" }),
          created_at: new Date(now.getTime() - 7 * 86_400_000),
        },
        {
          id: db.raw("gen_random_uuid()"),
          org_id: orgId,
          event_type: "one_action.completed",
          properties: JSON.stringify({ action: "Request 3 Google reviews" }),
          created_at: new Date(now.getTime() - 14 * 86_400_000),
        },
        {
          id: db.raw("gen_random_uuid()"),
          org_id: orgId,
          event_type: "one_action.completed",
          properties: JSON.stringify({ action: "Add services to GBP" }),
          created_at: new Date(now.getTime() - 21 * 86_400_000),
        },
        {
          id: db.raw("gen_random_uuid()"),
          org_id: orgId,
          event_type: "monday_email.opened",
          properties: JSON.stringify({}),
          created_at: new Date(now.getTime() - 7 * 86_400_000),
        },
        {
          id: db.raw("gen_random_uuid()"),
          org_id: orgId,
          event_type: "monday_email.opened",
          properties: JSON.stringify({}),
          created_at: new Date(now.getTime() - 14 * 86_400_000),
        },
        {
          id: db.raw("gen_random_uuid()"),
          org_id: orgId,
          event_type: "competitor.review_surge",
          properties: JSON.stringify({ competitor: "Wasatch Endodontics", reviews_added: 6 }),
          created_at: new Date(now.getTime() - 3 * 86_400_000),
        },
      ]);
      console.log("[SeedDemo] Seeded 7 behavioral events (win + actions + emails + competitor)");
    }
  }

  // ── 8. Seed thank-you draft for Dr. Rodriguez (WO-47) ──
  const hasThankYou = await db.schema.hasTable("referral_thank_you_drafts");
  if (hasThankYou) {
    const existing = await db("referral_thank_you_drafts")
      .where({ organization_id: orgId })
      .first();
    if (!existing) {
      await db("referral_thank_you_drafts").insert({
        organization_id: orgId,
        gp_name: "Rodriguez",
        patient_initials: "M.K.",
        body: "Dr. Rodriguez, thank you for referring M.K. to us last week. The treatment went smoothly and we will send a full report to your office by Thursday. It is genuinely good to be working together again. -- Valley Endodontics",
        status: "pending",
      });
      console.log("[SeedDemo] Seeded thank-you draft for Dr. Rodriguez");
    }
  }

  // ── 9. Seed week1_win on org (WO-48) ──
  const hasWeek1 = await db.schema.hasColumn("organizations", "week1_win_headline");
  if (hasWeek1) {
    await db("organizations").where({ id: orgId }).update({
      week1_win_headline: "Your Google Business Profile was 71% complete. We fixed it.",
      week1_win_detail: "Missing: services list and business description. Both are now live. These are the two most searched fields on any GBP.",
      week1_win_type: "gbp_completeness",
      week1_win_shown_at: new Date(Date.now() - 85 * 86_400_000),
    });
    console.log("[SeedDemo] Seeded Week 1 win data");
  }

  console.log(`\n[SeedDemo] Done!`);
  console.log(`  Email: ${DEMO_EMAIL}`);
  console.log(`  Password: ${DEMO_PASSWORD}`);
  console.log(`  Org ID: ${orgId}`);
  console.log(`  Practice: Valley Endodontics, Salt Lake City UT`);

  await db.destroy();
}

seed().catch((err) => {
  console.error("[SeedDemo] Fatal error:", err);
  process.exit(1);
});
