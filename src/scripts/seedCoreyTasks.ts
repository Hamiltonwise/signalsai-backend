/**
 * Seed Corey's action items from the March 28-29 session.
 * These are tasks only Corey can do. The dream team + agents handle everything else.
 *
 * Run: npx tsx src/scripts/seedCoreyTasks.ts
 */

import { db } from "../database/connection";

const TASKS = [
  {
    title: "Record 60-second checkup demo video (Loom-style, raw, look at camera)",
    owner_name: "Corey",
    priority: "urgent",
    source: "CC Session Mar 29 -- CRO research: +30-80% engagement",
    node_id: null,
  },
  {
    title: "Get 3 named customer testimonials with practice name, city, and specific result",
    owner_name: "Corey",
    priority: "urgent",
    source: "CC Session Mar 29 -- conversion audit: +20-40% social proof",
  },
  {
    title: "Write guarantee copy for pricing page: 'If your first 3 Monday briefs don't show something you didn't know, full refund'",
    owner_name: "Corey",
    priority: "high",
    source: "CC Session Mar 29 -- Hormozi value equation: removes final objection",
  },
  {
    title: "Provide professional headshot for homepage founder section",
    owner_name: "Corey",
    priority: "high",
    source: "CC Session Mar 29 -- conversion audit: +15-25% credibility",
  },
  {
    title: "Draft Script Writer agent brief for 60-second HeyGen video (or record yourself)",
    owner_name: "Corey",
    priority: "high",
    source: "CC Session Mar 29 -- Flanagan: craft remains human. Your voice, not AI.",
  },
  {
    title: "Review and approve Dreamweaver Agent legend copy (anniversary, milestone, clean week messages)",
    owner_name: "Corey",
    priority: "normal",
    source: "CC Session Mar 29 -- Guidara: legends need founder voice check",
  },
  {
    title: "Decide on AAE booth demo script: which business to type, which findings to show",
    owner_name: "Corey",
    priority: "urgent",
    source: "AAE April 14 -- 16 days. Conference fallback data is SLC Valley Endodontics.",
  },
];

async function seed() {
  console.log("[SeedCoreyTasks] Starting...");

  const hasTable = await db.schema.hasTable("dream_team_tasks");
  if (!hasTable) {
    console.log("[SeedCoreyTasks] dream_team_tasks table not found. Run migrations first.");
    process.exit(1);
  }

  for (const task of TASKS) {
    // Skip if already exists (by title match)
    const existing = await db("dream_team_tasks")
      .where({ title: task.title })
      .first();

    if (existing) {
      console.log(`[SeedCoreyTasks] Skip (exists): ${task.title.substring(0, 50)}...`);
      continue;
    }

    await db("dream_team_tasks").insert({
      ...task,
      status: "open",
      created_at: new Date(),
    });
    console.log(`[SeedCoreyTasks] Added: ${task.title.substring(0, 60)}...`);
  }

  console.log("[SeedCoreyTasks] Done. Tasks visible in VisionaryView 'What Needs You' section.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("[SeedCoreyTasks] Error:", err.message);
  process.exit(1);
});
