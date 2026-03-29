/**
 * Safety Agent -- On-demand Service
 *
 * Called before Yellow/Red blast radius outputs ship.
 * Checks for PII, billing amounts, patient names, and competitor
 * names in client-facing context. Returns safety classification
 * and flags. If red: blocks output and creates a dream_team_task
 * for Corey review.
 *
 * Export: checkSafety() function, not a cron job.
 */

import { db } from "../../database/connection";

// -- Types ------------------------------------------------------------------

interface SafetyResult {
  safe: boolean;
  flags: string[];
  blastRadius: "green" | "yellow" | "red";
}

interface SafetyCheckOptions {
  text: string;
  context?: "client-facing" | "internal";
  orgId?: number;
}

// -- PII Patterns -----------------------------------------------------------

const PII_PATTERNS: { pattern: RegExp; label: string }[] = [
  {
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    label: "Possible SSN detected",
  },
  {
    pattern:
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    label: "Email address detected in output text",
  },
  {
    pattern: /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    label: "Phone number detected",
  },
  {
    pattern:
      /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g,
    label: "Possible credit card number detected",
  },
];

// Patient-related patterns (names adjacent to medical terms)
const PATIENT_INDICATORS = [
  /\bpatient\s+[A-Z][a-z]+\s+[A-Z][a-z]+/gi,
  /\bMr\.\s+[A-Z][a-z]+/g,
  /\bMrs\.\s+[A-Z][a-z]+/g,
  /\bMs\.\s+[A-Z][a-z]+/g,
];

// Billing/pricing keywords
const BILLING_PATTERNS: { pattern: RegExp; label: string }[] = [
  {
    pattern: /\$\d+[,.]?\d*\s*\/?\s*(?:mo|month|year|yr|annually)/gi,
    label: "Billing amount with period detected",
  },
  {
    pattern: /(?:price|pricing|cost|fee|charge|bill|invoice)\s*(?:is|of|:)\s*\$\d/gi,
    label: "Explicit pricing statement detected",
  },
  {
    pattern: /subscription\s+(?:of|at|for)\s+\$/gi,
    label: "Subscription pricing detected",
  },
];

// -- Core -------------------------------------------------------------------

/**
 * Check output text for safety issues.
 *
 * @param options - text to check, context (client-facing or internal), optional orgId
 * @returns SafetyResult with safe flag, issue flags, and blast radius classification
 */
export async function checkSafety(
  options: SafetyCheckOptions
): Promise<SafetyResult> {
  const { text, context = "client-facing", orgId } = options;
  const flags: string[] = [];
  let blastRadius: "green" | "yellow" | "red" = "green";

  // Check 1: PII detection
  for (const { pattern, label } of PII_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      flags.push(`PII: ${label}`);
      blastRadius = "red";
    }
  }

  // Check 2: Patient name detection
  for (const pattern of PATIENT_INDICATORS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      flags.push(
        "Patient name: possible patient name detected. Patient names must never appear in any output."
      );
      blastRadius = "red";
      break;
    }
  }

  // Check 3: Billing amounts
  for (const { pattern, label } of BILLING_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      flags.push(`Billing: ${label}`);
      if (blastRadius !== "red") blastRadius = "red";
    }
  }

  // Check 4: Competitor names in client-facing context
  if (context === "client-facing" && orgId) {
    const competitorFlag = await checkCompetitorNames(text, orgId);
    if (competitorFlag) {
      flags.push(competitorFlag);
      if (blastRadius === "green") blastRadius = "yellow";
    }
  }

  // Check 5: Unqualified dollar figures without "estimated" qualifier
  const dollarMatches = text.match(/\$\d[\d,]*(?:\.\d{2})?/g);
  if (dollarMatches && dollarMatches.length > 0) {
    const hasEstimated =
      /estimated|approximately|roughly|about/i.test(text);
    if (!hasEstimated) {
      flags.push(
        `Dollar figures (${dollarMatches.join(", ")}) without "estimated" qualifier. Add derivation or label as estimated.`
      );
      if (blastRadius === "green") blastRadius = "yellow";
    }
  }

  const safe = flags.length === 0;

  // If red, create a dream_team_task for Corey review
  if (blastRadius === "red") {
    await createEscalationTask(text, flags, orgId);
  }

  return { safe, flags, blastRadius };
}

// -- Helpers ----------------------------------------------------------------

/**
 * Check if competitor names from ranking data appear in the text.
 * Competitor names are internal only per agent trust protocol.
 */
async function checkCompetitorNames(
  text: string,
  orgId: number
): Promise<string | null> {
  try {
    const snapshots = await db("weekly_ranking_snapshots")
      .where({ org_id: orgId })
      .whereNotNull("competitor_name")
      .select("competitor_name")
      .groupBy("competitor_name")
      .limit(20);

    for (const row of snapshots) {
      const name = row.competitor_name as string;
      if (name && text.toLowerCase().includes(name.toLowerCase())) {
        return `Competitor name "${name}" found in client-facing output. Competitor names are internal only unless client explicitly requested a competitive analysis.`;
      }
    }
  } catch (err: any) {
    console.error(
      "[SafetyAgent] Failed to check competitor names:",
      err.message
    );
  }
  return null;
}

/**
 * Create a dream_team_task for Corey review when red blast radius is detected.
 */
async function createEscalationTask(
  text: string,
  flags: string[],
  orgId?: number
): Promise<void> {
  try {
    await db("dream_team_tasks").insert({
      title: "Safety Agent: Red blast radius output blocked",
      description: `The Safety Agent blocked an output with ${flags.length} flag(s):\n\n${flags.map((f) => `- ${f}`).join("\n")}\n\nFirst 200 chars of blocked output:\n${text.slice(0, 200)}`,
      assigned_to: "corey",
      status: "open",
      priority: "high",
      org_id: orgId || null,
      metadata: JSON.stringify({
        source: "safety_agent",
        flags,
        blast_radius: "red",
        blocked_at: new Date().toISOString(),
      }),
      created_at: new Date(),
      updated_at: new Date(),
    });
  } catch (err: any) {
    console.error(
      "[SafetyAgent] Failed to create escalation task:",
      err.message
    );
  }
}
