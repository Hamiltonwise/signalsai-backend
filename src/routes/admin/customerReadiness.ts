/**
 * Customer Readiness API
 *
 * Runs the same checks as the CLI experience simulation but returns
 * JSON for the VisionaryView dashboard. Corey sees the undeniable
 * bar from his dashboard, not the terminal.
 */

import { Router, type Request, type Response } from "express";
import { db } from "../../database/connection";

const router = Router();

interface ReadinessCheck {
  name: string;
  pass: boolean;
  value: string;
  issue?: string;
}

interface CustomerReadiness {
  orgId: number;
  name: string;
  score: number;
  verdict: "UNDENIABLE" | "CLOSE" | "GAPS" | "BROKEN";
  checks: ReadinessCheck[];
}

const CUSTOMERS = [
  { id: 5, name: "Garrison Orthodontics", specialty: "orthodontist", locCount: 1 },
  { id: 8, name: "Artful Orthodontics", specialty: "orthodontist", locCount: 1 },
  { id: 21, name: "McPherson Endodontics", specialty: "endodontist", locCount: 1 },
  { id: 25, name: "Caswell Orthodontics", specialty: "orthodontist", locCount: 3 },
  { id: 39, name: "One Endodontics", specialty: "endodontist", locCount: 5 },
];

async function evaluateCustomer(c: typeof CUSTOMERS[0]): Promise<CustomerReadiness> {
  const checks: ReadinessCheck[] = [];
  let points = 0;
  const maxPoints = c.locCount > 1 ? 10 : 9;

  // 1. Greeting
  const orgUser = await db("organization_users").where({ organization_id: c.id, role: "admin" }).first();
  const user = orgUser ? await db("users").where({ id: orgUser.user_id }).select("first_name", "last_name").first() : null;
  if (user?.first_name) {
    checks.push({ name: "Greeting", pass: true, value: `"Good Morning, ${user.first_name}"` });
    points++;
  } else {
    checks.push({ name: "Greeting", pass: false, value: "Missing first name", issue: "User has no first_name set" });
  }

  // 2. Trajectory (proofline)
  const proofline = await db("agent_results").where({ organization_id: c.id, agent_type: "proofline" }).orderBy("created_at", "desc").first();
  const proofOut = proofline?.agent_output ? (typeof proofline.agent_output === "string" ? JSON.parse(proofline.agent_output) : proofline.agent_output) : null;
  const traj = proofOut?.trajectory || proofOut?.results?.[0]?.trajectory || "";
  if (traj.length > 50 && traj.includes("<hl>")) {
    checks.push({ name: "Trajectory", pass: true, value: traj.substring(0, 80) + "..." });
    points++;
  } else {
    checks.push({ name: "Trajectory", pass: !!(traj.length > 20), value: traj ? traj.substring(0, 60) : "No proofline data", issue: traj ? "Missing highlights or specifics" : "Proofline agent has not run" });
    if (traj.length > 20) points++;
  }

  // 3. Rankings
  const ranking = await db("practice_rankings").where({ organization_id: c.id, status: "completed" }).orderBy("created_at", "desc").first();
  if (ranking) {
    checks.push({ name: "Ranking", pass: true, value: `#${ranking.rank_position}/${ranking.total_competitors} ${ranking.specialty}` });
    points++;
  } else {
    checks.push({ name: "Ranking", pass: false, value: "No rankings", issue: "practice_rankings empty" });
  }

  // 4. Wins/Risks
  const summary = await db("agent_results").where({ organization_id: c.id, agent_type: "summary" }).orderBy("created_at", "desc").first();
  const sumOut = summary?.agent_output ? (typeof summary.agent_output === "string" ? JSON.parse(summary.agent_output) : summary.agent_output) : null;
  const entry = Array.isArray(sumOut) ? sumOut[0] : sumOut;
  const wins = entry?.wins || [];
  const risks = entry?.risks || [];
  if (wins.length > 0) {
    checks.push({ name: "Wins", pass: true, value: `${wins.length} wins` });
    points++;
  } else {
    checks.push({ name: "Wins", pass: false, value: "No wins data", issue: "Summary agent has not run" });
  }
  if (risks.length > 0) {
    checks.push({ name: "Risks", pass: true, value: `${risks.length} risks identified` });
    points++;
  } else {
    checks.push({ name: "Risks", pass: false, value: "No risks data" });
  }

  // 5. Dollar figures
  const hasDollar = sumOut ? /\$\d|\d+%/.test(JSON.stringify(sumOut)) : false;
  if (hasDollar) {
    checks.push({ name: "Dollar Figures", pass: true, value: "Present in findings" });
    points++;
  } else {
    checks.push({ name: "Dollar Figures", pass: false, value: "Missing", issue: "Findings lack economic consequence" });
  }

  // 6. Tasks (count + actionability)
  const userTasks = await db("tasks").where({ organization_id: c.id, category: "USER", status: "pending" }).select("title").limit(10);
  const tc = userTasks.length;
  const actionVerbs = /\b(call|email|contact|send|post|text|visit|check|verify|add|remove|update|ask|request|schedule|respond|upload)\b/i;
  const actionable = userTasks.filter((t) => actionVerbs.test(t.title || ""));
  const actionRatio = tc > 0 ? actionable.length / tc : 0;
  if (tc >= 3 && actionRatio >= 0.4) {
    checks.push({ name: "Tasks", pass: true, value: `${tc} tasks, ${Math.round(actionRatio * 100)}% actionable` });
    points++;
  } else if (tc >= 3) {
    checks.push({ name: "Tasks", pass: false, value: `${tc} tasks but only ${Math.round(actionRatio * 100)}% actionable`, issue: "Tasks need specific verbs (call, email, visit, check)" });
  } else {
    checks.push({ name: "Tasks", pass: false, value: `${tc} tasks`, issue: "Sparse task list" });
  }

  // 7. Vocabulary
  const vocab = await db("vocabulary_configs").where({ org_id: c.id }).first();
  if (vocab) {
    checks.push({ name: "Vocabulary", pass: true, value: vocab.vertical });
    points++;
  } else {
    checks.push({ name: "Vocabulary", pass: false, value: "Not configured" });
  }

  // 8. Clarity Score
  const org = await db("organizations").where({ id: c.id }).select("current_clarity_score").first();
  if (org?.current_clarity_score) {
    checks.push({ name: "Clarity Score", pass: true, value: `${org.current_clarity_score}/100` });
    points++;
  } else {
    checks.push({ name: "Clarity Score", pass: false, value: "Not computed" });
  }

  // 9. Multi-location (if applicable)
  if (c.locCount > 1) {
    const locs = await db("locations").where({ organization_id: c.id }).whereNotNull("place_id").count("* as c").first();
    const lc = Number(locs?.c || 0);
    if (lc === c.locCount) {
      checks.push({ name: "Multi-Location", pass: true, value: `${lc} locations connected` });
      points++;
    } else {
      checks.push({ name: "Multi-Location", pass: false, value: `${lc}/${c.locCount}`, issue: "Missing place_ids" });
    }
  }

  // 10. Specificity markers (the Oz data test)
  const allContent = [
    proofOut ? JSON.stringify(proofOut) : "",
    sumOut ? JSON.stringify(sumOut) : "",
  ].join(" ");
  const hasReviewCount = /\d+ review/i.test(allContent);
  const hasPercentage = /\d+(\.\d+)?%/.test(allContent);
  const hasCompetitorName = /[A-Z][a-z]+ (Orthodontics|Endodontics|Dental|Dentist|Endo|Ortho)/i.test(allContent);
  const hasDoctorName = /Dr\.\s+[A-Z][a-z]+/i.test(allContent);
  const specCount = [hasReviewCount, hasPercentage, hasCompetitorName, hasDoctorName].filter(Boolean).length;
  if (specCount >= 3) {
    checks.push({ name: "Specificity", pass: true, value: `${specCount}/4 markers (reviews, %, competitor, doctor)` });
    points++;
  } else {
    const missing = [
      !hasReviewCount && "review counts",
      !hasPercentage && "percentages",
      !hasCompetitorName && "competitor names",
      !hasDoctorName && "doctor names",
    ].filter(Boolean).join(", ");
    checks.push({ name: "Specificity", pass: false, value: `${specCount}/4 markers`, issue: `Missing: ${missing}` });
  }

  // 11. Oz Moment holistic (the meta-check)
  const ozFactors = [
    checks.find((ch) => ch.name === "Greeting")?.pass,
    checks.find((ch) => ch.name === "Trajectory")?.pass,
    checks.find((ch) => ch.name === "Ranking")?.pass,
    checks.find((ch) => ch.name === "Wins")?.pass,
    checks.find((ch) => ch.name === "Dollar Figures")?.pass,
    specCount >= 3,
  ].filter(Boolean).length;
  if (ozFactors >= 5) {
    checks.push({ name: "Oz Moment", pass: true, value: `${ozFactors}/6 factors. Would land.` });
    points++;
  } else {
    checks.push({ name: "Oz Moment", pass: false, value: `${ozFactors}/6 factors`, issue: ozFactors >= 3 ? "Close but not undeniable" : "Would feel like a beta" });
  }

  const maxWithStrict = maxPoints + 2; // added specificity + oz moment
  const score = Math.round((points / maxWithStrict) * 100);
  let verdict: CustomerReadiness["verdict"] = "BROKEN";
  if (score >= 90) verdict = "UNDENIABLE";
  else if (score >= 70) verdict = "CLOSE";
  else if (score >= 40) verdict = "GAPS";

  return { orgId: c.id, name: c.name, score, verdict, checks };
}

router.get("/", async (_req: Request, res: Response) => {
  try {
    const results = await Promise.all(CUSTOMERS.map(evaluateCustomer));
    const avgScore = Math.round(results.reduce((s, r) => s + r.score, 0) / results.length);
    const allUndeniable = results.every((r) => r.verdict === "UNDENIABLE");

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      averageScore: avgScore,
      allUndeniable,
      customers: results,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: message });
  }
});

export default router;
