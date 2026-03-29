/**
 * Roadmap Engine -- self-correcting "Google Maps" for Alloro's unicorn route.
 *
 * Reads real data from the database and calculates where Alloro is RIGHT NOW,
 * what the next turn is, and whether we are on-track or need a course correction.
 */

import { db } from "../database/connection";

// ---- Tier pricing (matches VisionaryView constants) -------------------------

const TIER_PRICING: Record<string, number> = {
  DWY: 997,
  DFY: 2497,
};

// ---- Phase definitions ------------------------------------------------------

interface Phase {
  id: number;
  name: string;
  label: string;
  mrrMin: number;
  mrrMax: number;
  clientsMin: number;
  clientsMax: number;
}

const PHASES: Phase[] = [
  { id: 0, name: "Phase 0", label: "Pre-launch", mrrMin: 0, mrrMax: 15_000, clientsMin: 0, clientsMax: 10 },
  { id: 1, name: "Phase 1", label: "Validation", mrrMin: 15_000, mrrMax: 50_000, clientsMin: 10, clientsMax: 25 },
  { id: 2, name: "Phase 2", label: "Traction", mrrMin: 50_000, mrrMax: 200_000, clientsMin: 25, clientsMax: 100 },
  { id: 3, name: "Phase 3", label: "Growth", mrrMin: 200_000, mrrMax: 1_000_000, clientsMin: 100, clientsMax: 500 },
  { id: 4, name: "Phase 4", label: "Scale", mrrMin: 1_000_000, mrrMax: 5_000_000, clientsMin: 500, clientsMax: 2500 },
  { id: 5, name: "Phase 5", label: "Category", mrrMin: 5_000_000, mrrMax: Infinity, clientsMin: 2500, clientsMax: Infinity },
];

const PHASE_DESCRIPTIONS: Record<number, string> = {
  0: "Deploy and validate",
  1: "AAE + cold market proof",
  2: "Content flywheel + referral proof",
  3: "Multi-vertical + Alloro Labs",
  4: "Series A territory",
  5: "Unicorn path",
};

// ---- Public interface -------------------------------------------------------

export interface RoadmapMilestone {
  name: string;
  target: number;
  current: number;
  estimatedDate: string;
}

export interface RoadmapState {
  currentMRR: number;
  currentClients: number;
  checkupsCompleted: number;
  trialConversionRate: number;
  referralRate: number;
  monthlyGrowthRate: number;
  currentPhase: string;
  phaseIndex: number;
  phaseDescription: string;
  nextMilestone: RoadmapMilestone;
  courseCorrection: string | null;
  etaToUnicorn: string;
  phases: Array<{
    id: number;
    name: string;
    label: string;
    description: string;
    mrrTarget: string;
    clientTarget: string;
    status: "complete" | "current" | "upcoming";
  }>;
}

// ---- Engine -----------------------------------------------------------------

export async function calculateRoadmapState(): Promise<RoadmapState> {
  // 1. Query active/trial organizations
  const orgs = await db("organizations")
    .whereIn("subscription_status", ["active", "trial"])
    .select("id", "subscription_tier", "subscription_status", "created_at");

  const payingOrgs = orgs.filter(
    (o: any) => o.subscription_status === "active" && o.subscription_tier
  );
  const trialOrgs = orgs.filter(
    (o: any) => o.subscription_status === "trial"
  );

  const currentClients = payingOrgs.length;

  // 2. Calculate actual MRR from tier pricing
  const currentMRR = payingOrgs.reduce((sum: number, o: any) => {
    const tier = o.subscription_tier || "DWY";
    return sum + (TIER_PRICING[tier] ?? 0);
  }, 0);

  // 3. Query behavioral_events for checkup completions
  const checkupResult = await db("behavioral_events")
    .where("event_type", "checkup_complete")
    .count("id as count")
    .first();
  const checkupsCompleted = Number(checkupResult?.count ?? 0);

  // 4. Trial conversion rate: trials that became active / total trials ever
  const totalTrialsEver = await db("behavioral_events")
    .where("event_type", "trial_started")
    .count("id as count")
    .first();
  const totalTrials = Number(totalTrialsEver?.count ?? 0);

  const convertedTrials = await db("behavioral_events")
    .where("event_type", "trial_converted")
    .count("id as count")
    .first();
  const converted = Number(convertedTrials?.count ?? 0);

  const trialConversionRate =
    totalTrials > 0 ? Math.round((converted / totalTrials) * 100) : 0;

  // 5. Referral rate: referral events / total active clients
  const referralResult = await db("behavioral_events")
    .where("event_type", "referral_sent")
    .count("id as count")
    .first();
  const referrals = Number(referralResult?.count ?? 0);
  const referralRate =
    currentClients > 0 ? Math.round((referrals / currentClients) * 100) : 0;

  // 6. Month-over-month growth rate
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const lastMonthOrgs = await db("organizations")
    .whereIn("subscription_status", ["active"])
    .where("subscription_tier", "is not", null)
    .where("created_at", ">=", lastMonthStart.toISOString())
    .where("created_at", "<", thisMonthStart.toISOString())
    .count("id as count")
    .first();
  const lastMonthCount = Number(lastMonthOrgs?.count ?? 0);

  const thisMonthOrgs = await db("organizations")
    .whereIn("subscription_status", ["active"])
    .where("subscription_tier", "is not", null)
    .where("created_at", ">=", thisMonthStart.toISOString())
    .count("id as count")
    .first();
  const thisMonthCount = Number(thisMonthOrgs?.count ?? 0);

  const monthlyGrowthRate =
    lastMonthCount > 0
      ? Math.round(((thisMonthCount - lastMonthCount) / lastMonthCount) * 100)
      : 0;

  // 7. Determine current phase
  const phaseIndex = determinePhase(currentMRR, currentClients);
  const phase = PHASES[phaseIndex];
  const currentPhase = `${phase.name}: ${phase.label}`;
  const phaseDescription = PHASE_DESCRIPTIONS[phaseIndex];

  // 8. Next milestone
  const nextMilestone = calculateNextMilestone(phaseIndex, currentMRR, currentClients, monthlyGrowthRate);

  // 9. ETA to unicorn ($83M ARR = ~$6.9M MRR at 12x multiple, use $5M MRR as threshold)
  const unicornMRR = 5_000_000;
  const etaToUnicorn = projectETA(currentMRR, monthlyGrowthRate, unicornMRR);

  // 10. Course correction
  const courseCorrection = generateCourseCorrection(
    phaseIndex,
    currentMRR,
    currentClients,
    checkupsCompleted,
    trialConversionRate,
    referralRate,
    monthlyGrowthRate,
    trialOrgs.length
  );

  // 11. Build phase timeline
  const phases = PHASES.map((p) => ({
    id: p.id,
    name: p.name,
    label: p.label,
    description: PHASE_DESCRIPTIONS[p.id],
    mrrTarget: p.mrrMax === Infinity ? "$5M+" : `$${(p.mrrMax / 1000).toFixed(0)}K`,
    clientTarget: p.clientsMax === Infinity ? "2500+" : `${p.clientsMax}`,
    status: (p.id < phaseIndex ? "complete" : p.id === phaseIndex ? "current" : "upcoming") as "complete" | "current" | "upcoming",
  }));

  return {
    currentMRR,
    currentClients,
    checkupsCompleted,
    trialConversionRate,
    referralRate,
    monthlyGrowthRate,
    currentPhase,
    phaseIndex,
    phaseDescription,
    nextMilestone,
    courseCorrection,
    etaToUnicorn,
    phases,
  };
}

// ---- Internal helpers -------------------------------------------------------

function determinePhase(mrr: number, clients: number): number {
  // Use the higher signal: if MRR says Phase 2 but clients say Phase 1, use Phase 1
  // (conservative, prevents premature phase advancement)
  let mrrPhase = 0;
  for (let i = PHASES.length - 1; i >= 0; i--) {
    if (mrr >= PHASES[i].mrrMin) {
      mrrPhase = i;
      break;
    }
  }

  let clientPhase = 0;
  for (let i = PHASES.length - 1; i >= 0; i--) {
    if (clients >= PHASES[i].clientsMin) {
      clientPhase = i;
      break;
    }
  }

  return Math.min(mrrPhase, clientPhase);
}

function calculateNextMilestone(
  phaseIndex: number,
  currentMRR: number,
  currentClients: number,
  growthRate: number
): RoadmapMilestone {
  const nextPhase = PHASES[Math.min(phaseIndex + 1, PHASES.length - 1)];

  // Which constraint is tighter: MRR or clients?
  const mrrGap = nextPhase.mrrMin - currentMRR;
  const clientGap = nextPhase.clientsMin - currentClients;

  const name = `${nextPhase.name}: ${nextPhase.label}`;
  const target = nextPhase.mrrMin;
  const current = currentMRR;

  // Estimate date based on growth rate
  let estimatedDate = "Not enough data";
  if (growthRate > 0 && currentMRR > 0) {
    const monthsNeeded = Math.ceil(
      Math.log(nextPhase.mrrMin / currentMRR) / Math.log(1 + growthRate / 100)
    );
    const eta = new Date();
    eta.setMonth(eta.getMonth() + monthsNeeded);
    estimatedDate = eta.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  } else if (currentMRR === 0) {
    estimatedDate = "Awaiting first revenue";
  }

  return { name, target, current, estimatedDate };
}

function projectETA(currentMRR: number, growthRate: number, targetMRR: number): string {
  if (currentMRR <= 0) {
    return "Pre-revenue. First milestone: deploy to production and close first cold-market clients.";
  }
  if (growthRate <= 0) {
    return "Not enough data. Need sustained month-over-month growth to project.";
  }

  const monthsNeeded = Math.ceil(
    Math.log(targetMRR / currentMRR) / Math.log(1 + growthRate / 100)
  );

  if (monthsNeeded > 120) {
    return `At ${growthRate}% monthly growth: ${Math.round(monthsNeeded / 12)} years. Need to accelerate.`;
  }

  const eta = new Date();
  eta.setMonth(eta.getMonth() + monthsNeeded);
  const years = Math.round(monthsNeeded / 12 * 10) / 10;
  return `At ${growthRate}% monthly growth: ${eta.toLocaleDateString("en-US", { month: "long", year: "numeric" })} (~${years} years). To hit 3-year target: need ${calculateRequiredGrowthRate(currentMRR, targetMRR, 36).toFixed(1)}% monthly growth.`;
}

function calculateRequiredGrowthRate(currentMRR: number, targetMRR: number, months: number): number {
  if (currentMRR <= 0) return 0;
  return (Math.pow(targetMRR / currentMRR, 1 / months) - 1) * 100;
}

function generateCourseCorrection(
  phaseIndex: number,
  mrr: number,
  clients: number,
  checkups: number,
  trialConversion: number,
  referralRate: number,
  growthRate: number,
  activeTrials: number
): string | null {
  const corrections: string[] = [];

  // Phase 0 specific
  if (phaseIndex === 0) {
    if (checkups === 0) {
      corrections.push("Zero cold-market checkups completed. First priority: deploy to production and run checkups at AAE.");
    }
    if (clients < 10 && growthRate <= 0) {
      corrections.push("Growth rate is flat. Need to activate outbound channels: AAE conference, cold email, partner referrals.");
    }
    if (activeTrials === 0 && clients < 5) {
      corrections.push("No active trials. The free checkup funnel needs to be live and generating trial signups.");
    }
  }

  // Phase 1 specific
  if (phaseIndex === 1) {
    if (trialConversion < 30) {
      corrections.push(`Trial conversion at ${trialConversion}%. Target is 40%+. Review onboarding flow and time-to-first-value.`);
    }
    if (referralRate < 10) {
      corrections.push(`Referral rate at ${referralRate}%. Target is 20%+. Activate referral reward program and champion program.`);
    }
  }

  // Universal checks
  if (phaseIndex >= 2 && growthRate < 15) {
    corrections.push(`Monthly growth at ${growthRate}%. Need 15%+ to stay on unicorn trajectory. Consider content flywheel, partnerships, or new vertical.`);
  }

  if (corrections.length === 0) return null;
  return corrections.join(" | ");
}
