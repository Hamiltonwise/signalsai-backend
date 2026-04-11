/**
 * Kenji Eval -- Variable-by-variable simulation of the Monday email experience.
 *
 * Runs the same engines the Monday email calls, for all 5 paying clients.
 * No emails sent. No side effects. Pure read + evaluate.
 *
 * Tests each variable independently:
 * 1. Oz Moment -- does the headline name a competitor and use a real number?
 * 2. One Action Card -- which rule fires? Is it specific or generic?
 * 3. Readings -- do all readings have verify links?
 * 4. Target Competitor -- is it set? Does naming it change the output?
 * 5. DFY Drafts -- would the approval flow produce drafts for this org?
 *
 * Output: a scorecard per client, per variable. Pass/Fail/Weak with evidence.
 */

import { db } from "../database/connection";
import { getOzEngineResult } from "../services/ozEngine";
import { getOneActionCard } from "../services/oneActionCard";

// The 5 paying clients
const CLIENTS = [
  { orgId: 39, name: "One Endo (Saif)", tier: "$1,500" },
  { orgId: 5, name: "Garrison/Copeland", tier: "$2,000" },
  { orgId: 8, name: "Artful/Pawlak", tier: "$1,500" },
  { orgId: 25, name: "Caswell", tier: "$5,000" },
  { orgId: 68, name: "McPherson/Shawn", tier: "$0 beta" },
];

interface VariableScore {
  variable: string;
  score: "PASS" | "WEAK" | "FAIL";
  evidence: string;
}

interface ClientEval {
  orgId: number;
  name: string;
  tier: string;
  variables: VariableScore[];
  overallGrade: string;
}

async function evalOzMoment(orgId: number): Promise<VariableScore> {
  try {
    const oz = await getOzEngineResult(orgId);
    if (!oz) {
      return { variable: "Oz Moment", score: "FAIL", evidence: "Returns null. No signal detected." };
    }

    const hasCompetitorName = oz.headline.length > 0 && oz.signalType !== "clean_week";
    const hasNumber = /\d/.test(oz.headline) || /\d/.test(oz.context);
    const hasVerifyLink = !!oz.verifyUrl;
    const isGeneric = /your competitor|a competitor|the competition/i.test(oz.headline);

    if (isGeneric) {
      return {
        variable: "Oz Moment",
        score: "WEAK",
        evidence: `Generic language: "${oz.headline}" | Signal: ${oz.signalType} | Verify: ${hasVerifyLink}`,
      };
    }

    if (oz.signalType === "clean_week") {
      return {
        variable: "Oz Moment",
        score: "PASS",
        evidence: `Clean week (Known 9 gift): "${oz.headline}" | Status: ${oz.status}`,
      };
    }

    if (hasCompetitorName && hasNumber && hasVerifyLink) {
      return {
        variable: "Oz Moment",
        score: "PASS",
        evidence: `"${oz.headline}" | Signal: ${oz.signalType} | Surprise: ${oz.surprise}/10 | Verify: ${oz.verifyUrl?.slice(0, 60)}`,
      };
    }

    const issues = [];
    if (!hasNumber) issues.push("no specific number");
    if (!hasVerifyLink) issues.push("no verify link");
    return {
      variable: "Oz Moment",
      score: "WEAK",
      evidence: `"${oz.headline}" | Signal: ${oz.signalType} | Issues: ${issues.join(", ")}`,
    };
  } catch (err: any) {
    return { variable: "Oz Moment", score: "FAIL", evidence: `Error: ${err.message}` };
  }
}

async function evalOneActionCard(orgId: number): Promise<VariableScore> {
  try {
    const card = await getOneActionCard(orgId);
    if (!card) {
      return { variable: "One Action Card", score: "FAIL", evidence: "Returns null." };
    }

    const headline = card.headline || "";
    const body = card.body || "";
    const priority = card.priority_level;
    const isClear = card.clear === true;
    const hasSpecificName = /[A-Z][a-z]+/.test(headline); // Proper noun (competitor/GP name)
    const hasNumber = /\d/.test(headline) || /\d/.test(body);
    const isDefault = priority === 5; // new_account/insufficient data

    if (isClear) {
      return {
        variable: "One Action Card",
        score: "PASS",
        evidence: `Priority: 0 (clear) | "${headline}" | Clean state = Known 9 gift.`,
      };
    }

    if (isDefault && !hasSpecificName) {
      return {
        variable: "One Action Card",
        score: "WEAK",
        evidence: `Priority: ${priority} | "${headline}" | Falls to default without specific intel.`,
      };
    }

    if (hasSpecificName && hasNumber) {
      return {
        variable: "One Action Card",
        score: "PASS",
        evidence: `Priority: ${priority} | "${headline}" | Named + numbered.`,
      };
    }

    return {
      variable: "One Action Card",
      score: "WEAK",
      evidence: `Priority: ${priority} | "${headline}" | ${!hasSpecificName ? "No named entity" : "No number"}.`,
    };
  } catch (err: any) {
    return { variable: "One Action Card", score: "FAIL", evidence: `Error: ${err.message}` };
  }
}

async function evalTargetCompetitor(orgId: number): Promise<VariableScore> {
  try {
    const org = await db("organizations")
      .where({ id: orgId })
      .select("target_competitor_name", "target_competitor_place_id")
      .first();

    if (!org) {
      return { variable: "Target Competitor", score: "FAIL", evidence: "Org not found." };
    }

    if (!org.target_competitor_name) {
      return {
        variable: "Target Competitor",
        score: "FAIL",
        evidence: "No target_competitor_name set. Falls back to generic top competitor.",
      };
    }

    if (!org.target_competitor_place_id) {
      return {
        variable: "Target Competitor",
        score: "WEAK",
        evidence: `Name set ("${org.target_competitor_name}") but no place_id. Limits verify links and fresh data pulls.`,
      };
    }

    // Check if we have snapshot data for this competitor
    const snapshots = await db("weekly_ranking_snapshots")
      .where({ org_id: orgId })
      .whereRaw("LOWER(competitor_name) = LOWER(?)", [org.target_competitor_name])
      .orderBy("week_start", "desc")
      .limit(1);

    if (snapshots.length === 0) {
      return {
        variable: "Target Competitor",
        score: "WEAK",
        evidence: `Target set ("${org.target_competitor_name}", place_id present) but zero snapshots. Engine will fall back to generic.`,
      };
    }

    const snap = snapshots[0];
    return {
      variable: "Target Competitor",
      score: "PASS",
      evidence: `"${org.target_competitor_name}" | ${snap.competitor_review_count} reviews | Rating: ${snap.competitor_rating} | Week: ${snap.week_start}`,
    };
  } catch (err: any) {
    return { variable: "Target Competitor", score: "FAIL", evidence: `Error: ${err.message}` };
  }
}

async function evalReadings(orgId: number): Promise<VariableScore> {
  try {
    const org = await db("organizations")
      .where({ id: orgId })
      .select("checkup_data", "google_place_id")
      .first();

    if (!org) {
      return { variable: "Readings", score: "FAIL", evidence: "Org not found." };
    }

    const cd = org.checkup_data
      ? (typeof org.checkup_data === "string" ? JSON.parse(org.checkup_data) : org.checkup_data)
      : null;

    if (!cd) {
      return { variable: "Readings", score: "FAIL", evidence: "No checkup_data. Readings will be empty." };
    }

    const issues = [];

    // Star rating
    const rating = cd.place?.rating || cd.rating;
    if (!rating) issues.push("no star rating");

    // Review count
    const reviews = cd.place?.reviewCount || cd.reviewCount;
    if (!reviews && reviews !== 0) issues.push("no review count");

    // Place ID for verify links
    if (!org.google_place_id && !cd.place?.placeId) {
      issues.push("no place_id (verify links will be broken)");
    }

    // Competitor data for comparison readings
    const topComp = cd.topCompetitor;
    if (!topComp) issues.push("no top competitor in checkup_data");

    if (issues.length === 0) {
      return {
        variable: "Readings",
        score: "PASS",
        evidence: `Rating: ${rating} | Reviews: ${reviews} | Place ID: present | Competitor: ${typeof topComp === "string" ? topComp : topComp?.name}`,
      };
    }

    if (issues.length <= 1) {
      return {
        variable: "Readings",
        score: "WEAK",
        evidence: `Issues: ${issues.join(", ")} | Rating: ${rating || "missing"} | Reviews: ${reviews || "missing"}`,
      };
    }

    return {
      variable: "Readings",
      score: "FAIL",
      evidence: `Multiple issues: ${issues.join(", ")}`,
    };
  } catch (err: any) {
    return { variable: "Readings", score: "FAIL", evidence: `Error: ${err.message}` };
  }
}

async function evalDFYDrafts(orgId: number): Promise<VariableScore> {
  try {
    // Check if GBP connection exists (required for post drafting)
    const gbpConnection = await db("google_connections")
      .where({ organization_id: orgId })
      .whereNotNull("refresh_token")
      .first();

    // Check if PatientPath site exists (required for CRO drafting)
    let hasPatientPath = false;
    try {
      const project = await db("website_builder.projects")
        .where({ organization_id: orgId })
        .whereIn("status", ["published", "live"])
        .first();
      hasPatientPath = !!project;
    } catch {
      // website_builder schema may not exist
    }

    // Check pending_actions table exists and has any drafts
    let existingDrafts = 0;
    try {
      const hasTable = await db.schema.hasTable("pending_actions");
      if (hasTable) {
        const count = await db("pending_actions")
          .where({ org_id: orgId, status: "draft" })
          .count("id as cnt")
          .first();
        existingDrafts = parseInt(String(count?.cnt || 0), 10);
      }
    } catch {
      // Table may not exist yet
    }

    const capabilities = [];
    const gaps = [];

    if (gbpConnection) {
      capabilities.push("GBP connected (can draft posts)");
    } else {
      gaps.push("No GBP connection (cannot draft posts)");
    }

    if (hasPatientPath) {
      capabilities.push("PatientPath site exists (can draft CRO)");
    } else {
      gaps.push("No PatientPath site (cannot draft CRO)");
    }

    if (capabilities.length === 0) {
      return {
        variable: "DFY Drafts",
        score: "FAIL",
        evidence: `No DFY capability. ${gaps.join(". ")}.`,
      };
    }

    if (gaps.length > 0) {
      return {
        variable: "DFY Drafts",
        score: "WEAK",
        evidence: `Partial: ${capabilities.join(", ")}. Missing: ${gaps.join(", ")}. Existing drafts: ${existingDrafts}.`,
      };
    }

    return {
      variable: "DFY Drafts",
      score: "PASS",
      evidence: `Full capability: ${capabilities.join(", ")}. Existing drafts: ${existingDrafts}.`,
    };
  } catch (err: any) {
    return { variable: "DFY Drafts", score: "FAIL", evidence: `Error: ${err.message}` };
  }
}

function gradeClient(variables: VariableScore[]): string {
  const passes = variables.filter(v => v.score === "PASS").length;
  const fails = variables.filter(v => v.score === "FAIL").length;
  const total = variables.length;

  if (fails >= 3) return "D -- Multiple critical gaps";
  if (fails >= 2) return "C -- Two or more variables broken";
  if (passes >= 4 && fails === 0) return "A -- Tribal-ready";
  if (passes >= 3) return "B -- Solid but has weak spots";
  return "C -- Needs work";
}

async function runEval(): Promise<void> {
  console.log("=".repeat(80));
  console.log("KENJI EVAL: Variable-by-Variable Monday Email Simulation");
  console.log("=".repeat(80));
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(`Clients: ${CLIENTS.length}`);
  console.log("");

  const results: ClientEval[] = [];

  for (const client of CLIENTS) {
    console.log("-".repeat(80));
    console.log(`${client.name} (org ${client.orgId}) -- ${client.tier}`);
    console.log("-".repeat(80));

    const variables: VariableScore[] = [];

    // Run all 5 variable tests
    const [oz, card, target, readings, dfy] = await Promise.all([
      evalOzMoment(client.orgId),
      evalOneActionCard(client.orgId),
      evalTargetCompetitor(client.orgId),
      evalReadings(client.orgId),
      evalDFYDrafts(client.orgId),
    ]);

    variables.push(oz, card, target, readings, dfy);

    for (const v of variables) {
      const icon = v.score === "PASS" ? "OK" : v.score === "WEAK" ? "~~" : "XX";
      console.log(`  [${icon}] ${v.variable}: ${v.score}`);
      console.log(`       ${v.evidence}`);
    }

    const grade = gradeClient(variables);
    console.log(`  GRADE: ${grade}`);
    console.log("");

    results.push({
      orgId: client.orgId,
      name: client.name,
      tier: client.tier,
      variables,
      overallGrade: grade,
    });
  }

  // Summary
  console.log("=".repeat(80));
  console.log("SUMMARY: Variable Heatmap");
  console.log("=".repeat(80));

  const variableNames = ["Oz Moment", "One Action Card", "Target Competitor", "Readings", "DFY Drafts"];
  for (const varName of variableNames) {
    const scores = results.map(r => {
      const v = r.variables.find(v => v.variable === varName);
      return v?.score || "?";
    });
    const passRate = scores.filter(s => s === "PASS").length;
    const failRate = scores.filter(s => s === "FAIL").length;
    console.log(`  ${varName.padEnd(20)} ${scores.map(s => s.padEnd(6)).join(" ")} (${passRate}/5 pass, ${failRate}/5 fail)`);
  }

  console.log("");
  console.log("Grades:");
  for (const r of results) {
    console.log(`  ${r.name.padEnd(25)} ${r.overallGrade}`);
  }

  // Identify weakest variable (highest fail rate)
  console.log("");
  console.log("=".repeat(80));
  console.log("WEAKEST VARIABLE (highest fail rate -- fix this first):");
  let worstVar = "";
  let worstFailRate = -1;
  for (const varName of variableNames) {
    const failCount = results.filter(r => {
      const v = r.variables.find(v => v.variable === varName);
      return v?.score === "FAIL";
    }).length;
    if (failCount > worstFailRate) {
      worstFailRate = failCount;
      worstVar = varName;
    }
  }
  console.log(`  ${worstVar} (${worstFailRate}/5 clients failing)`);
  console.log("=".repeat(80));

  await db.destroy();
}

runEval().catch((err) => {
  console.error("Eval failed:", err.message);
  process.exit(1);
});
