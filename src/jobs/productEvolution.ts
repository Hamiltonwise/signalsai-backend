/**
 * Product Evolution Engine -- The Self-Improving Product
 *
 * Schedule: Weekly, Sunday 11 PM PT (before the Monday email cycle)
 *
 * This is what nobody else has built. The product looks at its own
 * usage data, identifies where users struggle or disengage, reads
 * the relevant source code, and drafts a specific improvement for
 * Dave to review.
 *
 * The loop:
 *   1. MEASURE: Query behavioral_events for friction patterns
 *   2. IDENTIFY: Find the #1 engagement drop-off or churn signal
 *   3. READ: Load the relevant source code file
 *   4. HYPOTHESIZE: Claude analyzes the code + data and proposes a change
 *   5. DRAFT: Create a dream_team_task with the hypothesis, evidence, and suggestion
 *   6. TRACK: Log the proposal to behavioral_events so we can measure if it worked
 *
 * Safety:
 *   - Never modifies code directly. Always creates a task for human review.
 *   - Dave reviews and implements (or rejects) every suggestion.
 *   - Each proposal includes: what to change, why, expected impact, how to verify.
 *   - Proposals that get implemented are tracked for outcome measurement.
 *
 * This is the Dreamweaver applied to the product itself.
 */

import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";
import { db } from "../database/connection";

let anthropic: Anthropic | null = null;
function getClient(): Anthropic {
  if (!anthropic) anthropic = new Anthropic();
  return anthropic;
}

interface FrictionPattern {
  pattern: string;
  evidence: string;
  severity: number; // 1-10
  affectedOrgs: number;
  suggestedFile: string | null;
}

/**
 * Step 1: MEASURE -- Find friction patterns in behavioral data
 */
async function measureFriction(): Promise<FrictionPattern[]> {
  const patterns: FrictionPattern[] = [];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);

  const hasTable = await db.schema.hasTable("behavioral_events");
  if (!hasTable) return patterns;

  // Pattern 1: Checkup completions that never create accounts (funnel leak)
  const scansCompleted = await db("behavioral_events")
    .where("event_type", "checkup.scan_completed")
    .where("created_at", ">=", thirtyDaysAgo)
    .count("id as count").first();
  const accountsCreated = await db("behavioral_events")
    .where("event_type", "checkup.account_created")
    .where("created_at", ">=", thirtyDaysAgo)
    .count("id as count").first();

  const scanCount = Number(scansCompleted?.count || 0);
  const accountCount = Number(accountsCreated?.count || 0);
  if (scanCount > 5 && accountCount / scanCount < 0.3) {
    patterns.push({
      pattern: "checkup_to_account_drop",
      evidence: `${scanCount} scans completed, only ${accountCount} accounts created (${Math.round(accountCount / scanCount * 100)}% conversion). The email gate on ResultsScreen may be too aggressive.`,
      severity: 9,
      affectedOrgs: scanCount - accountCount,
      suggestedFile: "frontend/src/pages/checkup/ResultsScreen.tsx",
    });
  }

  // Pattern 2: Accounts that never reach TTFV
  const totalAccounts = await db("organizations")
    .where("created_at", ">=", thirtyDaysAgo)
    .count("id as count").first();
  const ttfvYes = await db("behavioral_events")
    .where("event_type", "ttfv.yes")
    .where("created_at", ">=", thirtyDaysAgo)
    .count("id as count").first();

  const totalCount = Number(totalAccounts?.count || 0);
  const ttfvCount = Number(ttfvYes?.count || 0);
  if (totalCount > 3 && ttfvCount / totalCount < 0.4) {
    patterns.push({
      pattern: "low_ttfv_rate",
      evidence: `${totalCount} new accounts, only ${ttfvCount} reached TTFV (${Math.round(ttfvCount / totalCount * 100)}%). The dashboard may not surface a surprising enough insight on first load.`,
      severity: 8,
      affectedOrgs: totalCount - ttfvCount,
      suggestedFile: "frontend/src/pages/DoctorDashboard.tsx",
    });
  }

  // Pattern 3: One Action Card ignored (same card 3+ weeks)
  const staleActions = await db("behavioral_events")
    .where("event_type", "one_action.completed")
    .where("created_at", ">=", thirtyDaysAgo)
    .count("id as count").first();
  const activeOrgs = await db("organizations")
    .whereIn("subscription_status", ["active", "trial"])
    .count("id as count").first();

  const actionCount = Number(staleActions?.count || 0);
  const orgCount = Number(activeOrgs?.count || 0);
  if (orgCount > 3 && actionCount / orgCount < 0.5) {
    patterns.push({
      pattern: "one_action_ignored",
      evidence: `${orgCount} active orgs but only ${actionCount} One Action completions in 30 days. Cards may not feel urgent or specific enough.`,
      severity: 7,
      affectedOrgs: orgCount - actionCount,
      suggestedFile: "src/services/oneActionCard.ts",
    });
  }

  // Pattern 4: Login frequency drop (average days between logins increasing)
  const recentLogins = await db("behavioral_events")
    .where("event_type", "dashboard.viewed")
    .where("created_at", ">=", thirtyDaysAgo)
    .select("organization_id")
    .groupBy("organization_id")
    .count("id as count");

  const lowEngagement = (recentLogins as any[]).filter((r: any) => Number(r.count) <= 2);
  if (lowEngagement.length > 2 && lowEngagement.length / recentLogins.length > 0.4) {
    patterns.push({
      pattern: "login_frequency_decline",
      evidence: `${lowEngagement.length} of ${recentLogins.length} active orgs logged in 2 or fewer times in 30 days (${Math.round(lowEngagement.length / recentLogins.length * 100)}%). The Monday email may not be compelling enough to drive dashboard visits.`,
      severity: 7,
      affectedOrgs: lowEngagement.length,
      suggestedFile: "src/jobs/mondayEmail.ts",
    });
  }

  // Pattern 5: Churn after specific event patterns
  const cancelledOrgs = await db("organizations")
    .where("subscription_status", "cancelled")
    .where("created_at", ">=", new Date(Date.now() - 90 * 86_400_000))
    .select("id", "name");

  if (cancelledOrgs.length >= 2) {
    // What was the LAST event before cancellation for each?
    const lastEvents: string[] = [];
    for (const org of cancelledOrgs.slice(0, 10)) {
      const lastEvent = await db("behavioral_events")
        .where("organization_id", org.id)
        .whereNot("event_type", "billing.cancel_reason")
        .whereNot("event_type", "billing.subscription_cancelled")
        .orderBy("created_at", "desc")
        .first("event_type");
      if (lastEvent) lastEvents.push(lastEvent.event_type);
    }

    if (lastEvents.length >= 2) {
      // Find the most common last event before churn
      const eventCounts: Record<string, number> = {};
      for (const e of lastEvents) {
        eventCounts[e] = (eventCounts[e] || 0) + 1;
      }
      const topEvent = Object.entries(eventCounts).sort((a, b) => b[1] - a[1])[0];
      if (topEvent && topEvent[1] >= 2) {
        patterns.push({
          pattern: "pre_churn_event_pattern",
          evidence: `${cancelledOrgs.length} cancellations in 90 days. The most common last event before cancellation is "${topEvent[0]}" (${topEvent[1]} times). This suggests friction at or after this touchpoint.`,
          severity: 8,
          affectedOrgs: cancelledOrgs.length,
          suggestedFile: null, // Claude will identify the file
        });
      }
    }
  }

  return patterns.sort((a, b) => b.severity - a.severity);
}

/**
 * Step 2-5: IDENTIFY, READ, HYPOTHESIZE, DRAFT
 * Claude analyzes the top friction pattern with source code context
 */
async function generateEvolutionProposal(
  pattern: FrictionPattern,
): Promise<{ hypothesis: string; suggestion: string; expectedImpact: string; verification: string } | null> {
  // Read the suggested source file (if it exists)
  let sourceCode = "";
  if (pattern.suggestedFile) {
    const filePath = path.join(__dirname, "../../", pattern.suggestedFile);
    try {
      if (fs.existsSync(filePath)) {
        const full = fs.readFileSync(filePath, "utf-8");
        // Take first 200 lines to stay within context limits
        sourceCode = full.split("\n").slice(0, 200).join("\n");
      }
    } catch {}
  }

  try {
    const client = getClient();
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      messages: [{
        role: "user",
        content: `You are a product engineer analyzing usage data for a SaaS product called Alloro (business intelligence for service businesses).

FRICTION PATTERN DETECTED:
Pattern: ${pattern.pattern}
Evidence: ${pattern.evidence}
Severity: ${pattern.severity}/10
Affected accounts: ${pattern.affectedOrgs}
${pattern.suggestedFile ? `Suggested file: ${pattern.suggestedFile}` : ""}

${sourceCode ? `SOURCE CODE (first 200 lines of ${pattern.suggestedFile}):\n\`\`\`typescript\n${sourceCode}\n\`\`\`` : "No source code available."}

Based on this data and code, propose ONE specific, testable improvement.

Respond in exactly this JSON format:
{
  "hypothesis": "One sentence: what you think is causing the friction and why",
  "suggestion": "2-3 sentences: the specific code change or UX change to make. Reference line numbers or component names if you have the source code.",
  "expectedImpact": "One sentence: what metric should improve and by how much",
  "verification": "One sentence: how to measure if this worked after implementation"
}

Rules:
- Be specific. "Improve the UX" is not a suggestion. "Move the email gate below the Oz moments so users see the jaw-drop before the ask" is.
- Ground the hypothesis in the data. Not speculation.
- The suggestion must be implementable by a developer in under 2 hours.
- Never use em-dashes.`,
      }],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    return JSON.parse(jsonMatch[0]);
  } catch (err: any) {
    console.error("[ProductEvolution] Claude analysis failed:", err.message);
    return null;
  }
}

/**
 * Main: Run the Product Evolution Engine
 */
export async function runProductEvolution(): Promise<{ proposals: number }> {
  console.log("[ProductEvolution] Starting weekly analysis...");

  // Step 1: Measure friction
  const patterns = await measureFriction();
  if (patterns.length === 0) {
    console.log("[ProductEvolution] No friction patterns detected. Product is running clean.");
    return { proposals: 0 };
  }

  console.log(`[ProductEvolution] Found ${patterns.length} friction patterns. Top: ${patterns[0].pattern} (severity ${patterns[0].severity}/10)`);

  // Step 2-5: Generate proposal for the top pattern
  const topPattern = patterns[0];
  const proposal = await generateEvolutionProposal(topPattern);

  if (!proposal) {
    console.log("[ProductEvolution] Could not generate proposal for top pattern.");
    return { proposals: 0 };
  }

  // Step 5: Create dream_team_task for Dave
  try {
    await db("dream_team_tasks").insert({
      owner_name: "Dave",
      title: `Product Evolution: ${topPattern.pattern.replace(/_/g, " ")}`,
      description: [
        `EVIDENCE: ${topPattern.evidence}`,
        `SEVERITY: ${topPattern.severity}/10 (${topPattern.affectedOrgs} accounts affected)`,
        topPattern.suggestedFile ? `FILE: ${topPattern.suggestedFile}` : "",
        "",
        `HYPOTHESIS: ${proposal.hypothesis}`,
        "",
        `SUGGESTION: ${proposal.suggestion}`,
        "",
        `EXPECTED IMPACT: ${proposal.expectedImpact}`,
        "",
        `VERIFICATION: ${proposal.verification}`,
        "",
        "This proposal was generated by the Product Evolution Engine from real usage data.",
        "Review the evidence and hypothesis. Implement if it makes sense. Reject if it doesn't.",
        "Either way, mark this task as done so the engine knows the outcome.",
      ].filter(Boolean).join("\n"),
      status: "open",
      priority: topPattern.severity >= 8 ? "high" : "normal",
      source_type: "product_evolution",
    });
    console.log(`[ProductEvolution] Created task for Dave: ${topPattern.pattern}`);
  } catch (err: any) {
    console.error("[ProductEvolution] Failed to create task:", err.message);
  }

  // Step 6: Log the proposal
  const hasTable = await db.schema.hasTable("behavioral_events");
  if (hasTable) {
    await db("behavioral_events").insert({
      event_type: "product_evolution.proposal",
      metadata: JSON.stringify({
        pattern: topPattern.pattern,
        severity: topPattern.severity,
        affected_orgs: topPattern.affectedOrgs,
        hypothesis: proposal.hypothesis,
        suggestion: proposal.suggestion,
        expected_impact: proposal.expectedImpact,
        file: topPattern.suggestedFile,
      }),
    }).catch(() => {});
  }

  // Also generate proposals for secondary patterns (if severity >= 7)
  let additionalProposals = 0;
  for (const pattern of patterns.slice(1, 3)) {
    if (pattern.severity < 7) continue;

    const secondaryProposal = await generateEvolutionProposal(pattern);
    if (secondaryProposal) {
      await db("dream_team_tasks").insert({
        owner_name: "Dave",
        title: `Product Evolution: ${pattern.pattern.replace(/_/g, " ")}`,
        description: [
          `EVIDENCE: ${pattern.evidence}`,
          `SEVERITY: ${pattern.severity}/10`,
          pattern.suggestedFile ? `FILE: ${pattern.suggestedFile}` : "",
          "",
          `HYPOTHESIS: ${secondaryProposal.hypothesis}`,
          `SUGGESTION: ${secondaryProposal.suggestion}`,
          `EXPECTED IMPACT: ${secondaryProposal.expectedImpact}`,
          `VERIFICATION: ${secondaryProposal.verification}`,
        ].filter(Boolean).join("\n"),
        status: "open",
        priority: "normal",
        source_type: "product_evolution",
      }).catch(() => {});
      additionalProposals++;
    }
  }

  const total = 1 + additionalProposals;
  console.log(`[ProductEvolution] Complete. ${total} proposal${total !== 1 ? "s" : ""} created for Dave's review.`);
  return { proposals: total };
}
