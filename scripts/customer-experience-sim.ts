/**
 * Customer Experience Simulation
 *
 * For each paying customer, simulates their login experience by hitting
 * the same API endpoints the frontend calls, then evaluates the CONTENT
 * against the Alloro standard.
 *
 * This is not a test suite. It's the question: "Would this person say
 * 'how did they know that?' when they see their dashboard?"
 *
 * Run: npx ts-node scripts/customer-experience-sim.ts
 * Integrates with preflight-check.sh.
 *
 * The Alloro Standard (from Design Philosophy):
 * 1. Does the most important information appear without a single click?
 * 2. Could someone understand what to do in 8 seconds?
 * 3. Does it make them feel understood before informed?
 */

import knex from "knex";
import jwt from "jsonwebtoken";
import * as dotenv from "dotenv";
dotenv.config();

import configMap from "../src/database/config";

const db = knex(configMap.development);
const JWT_SECRET = process.env.JWT_SECRET!;
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

// =====================================================================
// TYPES
// =====================================================================

interface CustomerSim {
  orgId: number;
  userId: number;
  name: string;
  ownerName: string;
  specialty: string;
  intelligenceMode: "referral_based" | "hybrid" | "direct_acquisition";
  locationCount: number;
  isDoctor: boolean;
}

interface ExperienceScore {
  customer: string;
  greeting: { pass: boolean; value: string; issue?: string };
  trajectory: { pass: boolean; value: string; issue?: string };
  ranking: { pass: boolean; value: string; issue?: string };
  competitors: { pass: boolean; value: string; issue?: string };
  wins: { pass: boolean; value: string; issue?: string };
  risks: { pass: boolean; value: string; issue?: string };
  dollarFigures: { pass: boolean; value: string; issue?: string };
  tasks: { pass: boolean; value: string; issue?: string };
  vocabulary: { pass: boolean; value: string; issue?: string };
  specificity: { pass: boolean; value: string; issue?: string };
  multiLocation: { pass: boolean; value: string; issue?: string } | null;
  ozMoment: { pass: boolean; value: string; issue?: string };
  score: number; // 0-100
  verdict: "UNDENIABLE" | "CLOSE" | "GAPS" | "BROKEN";
}

const CUSTOMERS: CustomerSim[] = [
  { orgId: 5, userId: 26, name: "Garrison Orthodontics", ownerName: "Garrison Copeland", specialty: "orthodontist", intelligenceMode: "hybrid", locationCount: 1, isDoctor: true },
  { orgId: 8, userId: 28, name: "Artful Orthodontics", ownerName: "Caroline Pawlak", specialty: "orthodontist", intelligenceMode: "hybrid", locationCount: 1, isDoctor: true },
  { orgId: 21, userId: 30, name: "McPherson Endodontics", ownerName: "Shawn McPherson", specialty: "endodontist", intelligenceMode: "referral_based", locationCount: 1, isDoctor: false },
  { orgId: 25, userId: 32, name: "Caswell Orthodontics", ownerName: "Erin White", specialty: "orthodontist", intelligenceMode: "hybrid", locationCount: 3, isDoctor: false },
  { orgId: 39, userId: 53, name: "One Endodontics", ownerName: "Saif Kargoli", specialty: "endodontist", intelligenceMode: "referral_based", locationCount: 5, isDoctor: true },
];

// =====================================================================
// HELPERS
// =====================================================================

function makeToken(userId: number, orgId: number): string {
  return jwt.sign(
    { userId, organizationId: orgId, role: "admin", isSuperAdmin: false },
    JWT_SECRET,
    { expiresIn: "1h" },
  );
}

async function apiGet(path: string, token: string): Promise<any> {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// =====================================================================
// EXPERIENCE EVALUATION
// =====================================================================

async function simulateCustomer(c: CustomerSim): Promise<ExperienceScore> {
  const token = makeToken(c.userId, c.orgId);
  const result: ExperienceScore = {
    customer: c.name,
    greeting: { pass: false, value: "" },
    trajectory: { pass: false, value: "" },
    ranking: { pass: false, value: "" },
    competitors: { pass: false, value: "" },
    wins: { pass: false, value: "" },
    risks: { pass: false, value: "" },
    dollarFigures: { pass: false, value: "" },
    tasks: { pass: false, value: "" },
    vocabulary: { pass: false, value: "" },
    specificity: { pass: false, value: "" },
    multiLocation: c.locationCount > 1 ? { pass: false, value: "" } : null,
    ozMoment: { pass: false, value: "" },
    score: 0,
    verdict: "BROKEN",
  };

  let points = 0;
  const maxPoints = c.locationCount > 1 ? 12 : 11;

  // --- 1. GREETING ---
  const user = await db("users")
    .where({ id: c.userId })
    .select("first_name", "last_name", "name")
    .first();

  if (user?.first_name && user?.last_name) {
    const prefix = c.isDoctor ? "Dr. " : "";
    result.greeting = { pass: true, value: `"Good Morning, ${prefix}${user.last_name}"` };
    points++;
  } else {
    const fallback = user?.name || "unknown";
    result.greeting = {
      pass: false,
      value: `Would show: "${fallback}"`,
      issue: `first_name=${user?.first_name || "NULL"}, last_name=${user?.last_name || "NULL"}`,
    };
  }

  // --- 2. TRAJECTORY (the hero text) ---
  const proofline = await db("agent_results")
    .where({ organization_id: c.orgId, agent_type: "proofline" })
    .orderBy("created_at", "desc")
    .select("agent_output")
    .first();

  if (proofline?.agent_output) {
    const out =
      typeof proofline.agent_output === "string"
        ? JSON.parse(proofline.agent_output)
        : proofline.agent_output;
    const traj = out.trajectory || out.results?.[0]?.trajectory || "";
    const hasHighlight = traj.includes("<hl>");
    const hasNumber = /\d/.test(traj);
    const isSpecific = hasHighlight && hasNumber && traj.length > 50;

    if (isSpecific) {
      result.trajectory = { pass: true, value: traj.substring(0, 100) + "..." };
      points++;
    } else if (traj.length > 20) {
      result.trajectory = {
        pass: false,
        value: traj.substring(0, 80),
        issue: `Missing: ${!hasHighlight ? "highlights " : ""}${!hasNumber ? "numbers " : ""}${traj.length <= 50 ? "too short" : ""}`,
      };
    } else {
      result.trajectory = { pass: false, value: "Empty or too short", issue: "No proofline trajectory generated" };
    }
  } else {
    result.trajectory = { pass: false, value: "No data", issue: "Proofline agent has not run for this org" };
  }

  // --- 3. RANKING (position in market) ---
  const rankings = await apiGet(`/api/practice-ranking/latest?googleAccountId=${c.orgId}`, token);
  if (rankings?.rankings?.length > 0) {
    const r = rankings.rankings[0];
    result.ranking = {
      pass: true,
      value: `#${r.rankPosition}/${r.totalCompetitors} ${r.specialty} in ${r.location || "market"}`,
    };
    points++;

    // --- 4. COMPETITORS NAMED ---
    const rawData = r.rawData || r.rankingFactors;
    const topCompetitorNamed =
      rawData &&
      JSON.stringify(rawData).match(/"name"\s*:\s*"[A-Z][^"]+"/);
    if (topCompetitorNamed) {
      result.competitors = { pass: true, value: "Competitor names in ranking data" };
      points++;
    } else {
      result.competitors = {
        pass: false,
        value: "Ranking exists but competitor names not surfaced",
        issue: "Customer sees position but not WHO is beating them",
      };
    }
  } else {
    result.ranking = { pass: false, value: "No rankings", issue: "practice_rankings empty or API error" };
    result.competitors = { pass: false, value: "N/A (no rankings)", issue: "Blocked by missing rankings" };
  }

  // --- 5 & 6. WINS and RISKS ---
  const summary = await db("agent_results")
    .where({ organization_id: c.orgId, agent_type: "summary" })
    .orderBy("created_at", "desc")
    .select("agent_output")
    .first();

  if (summary?.agent_output) {
    const out =
      typeof summary.agent_output === "string"
        ? JSON.parse(summary.agent_output)
        : summary.agent_output;
    const firstEntry = Array.isArray(out) ? out[0] : out;
    const wins = firstEntry?.wins || [];
    const risks = firstEntry?.risks || [];

    const firstWin = typeof wins[0] === "string" ? wins[0] : (wins[0]?.title || wins[0]?.description || JSON.stringify(wins[0]) || "");
    result.wins = wins.length > 0
      ? { pass: true, value: `${wins.length} wins. First: "${firstWin.substring(0, 80)}"` }
      : { pass: false, value: "No wins", issue: "Good News section would be empty" };
    if (wins.length > 0) points++;

    result.risks = risks.length > 0
      ? { pass: true, value: `${risks.length} risks identified` }
      : { pass: false, value: "No risks", issue: "Risks section would be empty (less concerning)" };
    if (risks.length > 0) points++;

    // --- 7. DOLLAR FIGURES ---
    const allText = JSON.stringify(out);
    const hasDollar = /\$\d/.test(allText) || /\d+%/.test(allText);
    result.dollarFigures = hasDollar
      ? { pass: true, value: "Dollar/percentage figures present" }
      : { pass: false, value: "No dollar figures", issue: "Findings lack economic consequence" };
    if (hasDollar) points++;
  } else {
    result.wins = { pass: false, value: "No summary data", issue: "Summary agent has not run" };
    result.risks = { pass: false, value: "No summary data", issue: "Summary agent has not run" };
    result.dollarFigures = { pass: false, value: "No summary data", issue: "Blocked by missing summary" };
  }

  // --- 8. TASKS (staff-executable?) ---
  const tasks = await db("tasks")
    .where({ organization_id: c.orgId, category: "USER", status: "pending" })
    .select("title", "description")
    .limit(5);

  if (tasks.length >= 3) {
    // Check if tasks have specific verbs (actionable) vs vague language
    const actionVerbs = /\b(call|email|contact|send|post|text|visit|check|verify|add|remove|update|ask|request|implement|create|schedule|respond|upload)\b/i;
    const actionable = tasks.filter((t) => actionVerbs.test(t.title || ""));
    const ratio = actionable.length / tasks.length;

    if (ratio >= 0.6) {
      result.tasks = { pass: true, value: `${tasks.length} tasks, ${Math.round(ratio * 100)}% actionable` };
      points++;
    } else {
      result.tasks = {
        pass: false,
        value: `${tasks.length} tasks but only ${Math.round(ratio * 100)}% actionable`,
        issue: `Tasks like "${(tasks[0]?.title || "").substring(0, 60)}" aren't staff-executable`,
      };
    }
  } else {
    result.tasks = {
      pass: false,
      value: `Only ${tasks.length} USER tasks`,
      issue: "Customer would see a sparse task list",
    };
  }

  // --- 9. VOCABULARY ---
  const vocab = await db("vocabulary_configs").where({ org_id: c.orgId }).first();
  if (vocab) {
    const overrides =
      typeof vocab.overrides === "string" ? JSON.parse(vocab.overrides) : vocab.overrides;
    const modeMatch =
      (c.intelligenceMode === "referral_based" && overrides?.intelligenceMode === "referral_based") ||
      (c.intelligenceMode === "hybrid" && overrides?.intelligenceMode === "hybrid") ||
      (c.intelligenceMode === "direct_acquisition" && overrides?.intelligenceMode === "direct_acquisition");

    result.vocabulary = modeMatch
      ? { pass: true, value: `${vocab.vertical} / ${overrides?.intelligenceMode}` }
      : { pass: false, value: `Mode mismatch: expected ${c.intelligenceMode}, got ${overrides?.intelligenceMode}` };
    if (modeMatch) points++;
  } else {
    result.vocabulary = { pass: false, value: "No vocabulary configured", issue: "Using universal fallback" };
  }

  // --- 10. SPECIFICITY (the Oz test) ---
  // Does ANY piece of content mention something only WE would know?
  const allContent = [
    proofline?.agent_output ? JSON.stringify(proofline.agent_output) : "",
    summary?.agent_output ? JSON.stringify(summary.agent_output) : "",
  ].join(" ");

  const hasReviewCount = /\d+ review/i.test(allContent);
  const hasPercentage = /\d+(\.\d+)?%/.test(allContent);
  const hasCompetitorName = /[A-Z][a-z]+ (Orthodontics|Endodontics|Dental|Dentist|Endo)/i.test(allContent);
  const hasDoctorName = /Dr\.\s+[A-Z][a-z]+/i.test(allContent);
  const specificityCount = [hasReviewCount, hasPercentage, hasCompetitorName, hasDoctorName].filter(Boolean).length;

  if (specificityCount >= 3) {
    result.specificity = { pass: true, value: `${specificityCount}/4 specificity markers (reviews, %, competitor, doctor)` };
    points++;
  } else if (specificityCount >= 1) {
    result.specificity = {
      pass: false,
      value: `Only ${specificityCount}/4 specificity markers`,
      issue: `Missing: ${!hasReviewCount ? "review counts " : ""}${!hasPercentage ? "percentages " : ""}${!hasCompetitorName ? "competitor names " : ""}${!hasDoctorName ? "doctor names " : ""}`.trim(),
    };
  } else {
    result.specificity = { pass: false, value: "No specific data", issue: "Content is generic, not personalized" };
  }

  // --- 11. MULTI-LOCATION (if applicable) ---
  if (c.locationCount > 1) {
    const locs = await db("locations")
      .where({ organization_id: c.orgId })
      .whereNotNull("place_id")
      .count("* as c")
      .first();

    const locCount = Number(locs?.c || 0);
    if (locCount === c.locationCount) {
      result.multiLocation = { pass: true, value: `${locCount} locations, all with place_ids` };
      points++;
    } else {
      result.multiLocation = {
        pass: false,
        value: `${locCount}/${c.locationCount} locations have place_ids`,
        issue: "Location switcher would show incomplete data",
      };
    }
  }

  // --- 12. THE OZ MOMENT (holistic) ---
  // This is the meta-check: taking everything above, would this person
  // see something that makes them say "how did they know that?"
  const hasPersonalGreeting = result.greeting.pass;
  const hasSpecificTrajectory = result.trajectory.pass;
  const hasRanking = result.ranking.pass;
  const hasWins = result.wins.pass;
  const hasDollars = result.dollarFigures.pass;
  const hasSpecificity = result.specificity.pass;

  const ozScore = [hasPersonalGreeting, hasSpecificTrajectory, hasRanking, hasWins, hasDollars, hasSpecificity]
    .filter(Boolean).length;

  if (ozScore >= 5) {
    result.ozMoment = { pass: true, value: `${ozScore}/6 Oz factors present. This would land.` };
    points++;
  } else if (ozScore >= 3) {
    result.ozMoment = {
      pass: false,
      value: `${ozScore}/6 Oz factors. Close but not undeniable.`,
      issue: "Customer would see real data but missing the 'how did they know that?' punch",
    };
  } else {
    result.ozMoment = {
      pass: false,
      value: `${ozScore}/6 Oz factors. Would feel like a beta.`,
      issue: "Not enough personalized, specific intelligence to create the moment",
    };
  }

  // --- FINAL SCORE ---
  result.score = Math.round((points / maxPoints) * 100);

  if (result.score >= 90) result.verdict = "UNDENIABLE";
  else if (result.score >= 70) result.verdict = "CLOSE";
  else if (result.score >= 40) result.verdict = "GAPS";
  else result.verdict = "BROKEN";

  return result;
}

// =====================================================================
// REPORT
// =====================================================================

function printResult(r: ExperienceScore): void {
  const color =
    r.verdict === "UNDENIABLE" ? "\x1b[32m" :
    r.verdict === "CLOSE" ? "\x1b[33m" :
    r.verdict === "GAPS" ? "\x1b[31m" : "\x1b[31m";

  console.log(`\n${color}[${"=".repeat(50)}]`);
  console.log(`  ${r.customer}: ${r.verdict} (${r.score}/100)`);
  console.log(`${"=".repeat(52)}\x1b[0m`);

  const checks = [
    ["Greeting", r.greeting],
    ["Trajectory", r.trajectory],
    ["Ranking", r.ranking],
    ["Competitors Named", r.competitors],
    ["Wins (Good News)", r.wins],
    ["Risks", r.risks],
    ["Dollar Figures", r.dollarFigures],
    ["Tasks (staff-ready)", r.tasks],
    ["Vocabulary", r.vocabulary],
    ["Specificity (Oz data)", r.specificity],
    ...(r.multiLocation ? [["Multi-Location", r.multiLocation]] : []),
    ["Oz Moment (holistic)", r.ozMoment],
  ] as [string, { pass: boolean; value: string; issue?: string }][];

  for (const [name, check] of checks) {
    const icon = check.pass ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
    console.log(`  ${icon} ${name}: ${check.value}`);
    if (check.issue) {
      console.log(`       \x1b[90m${check.issue}\x1b[0m`);
    }
  }
}

// =====================================================================
// MAIN
// =====================================================================

async function main(): Promise<void> {
  console.log("=".repeat(52));
  console.log("  CUSTOMER EXPERIENCE SIMULATION");
  console.log("  \"Would they say 'how did they know that?'\"");
  console.log("  " + new Date().toISOString());
  console.log("=".repeat(52));

  const results: ExperienceScore[] = [];

  for (const customer of CUSTOMERS) {
    const result = await simulateCustomer(customer);
    results.push(result);
    printResult(result);
  }

  // --- SUMMARY ---
  console.log("\n" + "=".repeat(52));
  console.log("  SUMMARY");
  console.log("=".repeat(52));

  const undeniable = results.filter((r) => r.verdict === "UNDENIABLE");
  const close = results.filter((r) => r.verdict === "CLOSE");
  const gaps = results.filter((r) => r.verdict === "GAPS");
  const broken = results.filter((r) => r.verdict === "BROKEN");

  if (undeniable.length > 0) console.log(`  \x1b[32mUNDENIABLE (${undeniable.length}):\x1b[0m ${undeniable.map((r) => r.customer).join(", ")}`);
  if (close.length > 0) console.log(`  \x1b[33mCLOSE (${close.length}):\x1b[0m ${close.map((r) => r.customer).join(", ")}`);
  if (gaps.length > 0) console.log(`  \x1b[31mGAPS (${gaps.length}):\x1b[0m ${gaps.map((r) => r.customer).join(", ")}`);
  if (broken.length > 0) console.log(`  \x1b[31mBROKEN (${broken.length}):\x1b[0m ${broken.map((r) => r.customer).join(", ")}`);

  const avgScore = Math.round(results.reduce((s, r) => s + r.score, 0) / results.length);
  console.log(`\n  Average Experience Score: ${avgScore}/100`);

  if (undeniable.length === results.length) {
    console.log(`\n  \x1b[32mALL CUSTOMERS UNDENIABLE.\x1b[0m Ship it.\n`);
  } else {
    // Collect all failing checks across all customers
    const allFails: string[] = [];
    for (const r of results) {
      const checks = [r.greeting, r.trajectory, r.ranking, r.competitors, r.wins, r.risks, r.dollarFigures, r.tasks, r.vocabulary, r.specificity, r.multiLocation, r.ozMoment];
      for (const check of checks) {
        if (check && !check.pass && check.issue) {
          allFails.push(`[${r.customer}] ${check.issue}`);
        }
      }
    }

    // Deduplicate by issue pattern
    const patterns: Record<string, string[]> = {};
    for (const f of allFails) {
      const issue = f.replace(/\[.*?\]\s*/, "");
      if (!patterns[issue]) patterns[issue] = [];
      patterns[issue].push(f.match(/\[(.*?)\]/)?.[1] || "?");
    }

    console.log(`\n  \x1b[33mBLOCKING ISSUES (deduplicated):\x1b[0m`);
    for (const [issue, orgs] of Object.entries(patterns)) {
      const isUniversal = orgs.length >= 3;
      const label = isUniversal ? `\x1b[31m[${orgs.length}/${results.length} UNIVERSAL]\x1b[0m` : `[${orgs.join(", ")}]`;
      console.log(`    ${label} ${issue}`);
    }
    console.log("");
  }

  await db.destroy();
  const allUndeniable = undeniable.length === results.length;
  process.exit(allUndeniable ? 0 : 1);
}

main().catch((err) => {
  console.error("Simulation error:", err.message);
  db.destroy();
  process.exit(1);
});
