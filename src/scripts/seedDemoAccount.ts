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
      first_win_attributed_at: new Date(),
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
        first_win_attributed_at: new Date(),
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
    await db("weekly_ranking_snapshots").insert({
      org_id: orgId,
      week_start: weekStart,
      position: 4,
      keyword: "endodontist salt lake city",
      bullets: JSON.stringify([
        "You rank #4 for endodontist in Salt Lake City.",
        "Wasatch Endodontics has 223 more reviews than you.",
        "At your current pace, that gap grows by 8 reviews per month.",
      ]),
      competitor_note: "Wasatch Endodontics added 6 reviews this week.",
      finding_headline: "Dr. Demo, Wasatch Endodontics is pulling away.",
      dollar_figure: 3200,
      competitor_position: 1,
      competitor_name: "Wasatch Endodontics",
      competitor_review_count: 281,
      client_review_count: 58,
    });
    console.log("[SeedDemo] Seeded ranking snapshot");
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
          referral_count: 5,
          recent_referral_count: 0,
          prior_3_month_avg: 1.7,
          monthly_average: 1.7,
          last_referral_date: sixtySevenDaysAgo,
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
