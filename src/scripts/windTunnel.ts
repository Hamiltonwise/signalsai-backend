/**
 * Wind Tunnel Simulation -- Full-Week Agent System Stress Test
 *
 * Simulates an entire week of Alloro's 50-agent orchestration system.
 * Validates: service file existence, exports, circuit breaker wiring,
 * model router mappings, event_type consistency across handoffs,
 * concurrent execution conflicts, abort cascade behavior, and cost.
 *
 * DOES NOT call external APIs. Reads source files, checks imports/exports,
 * and traces data flow through the system statically.
 *
 * Usage:
 *   npx tsx src/scripts/windTunnel.ts
 */

import * as fs from "fs";
import * as path from "path";

// ── Result Types ──────────────────────────────────────────────────────

interface CheckResult {
  name: string;
  passed: boolean;
  severity: "P0" | "P1" | "P2" | "INFO";
  detail: string;
}

interface HandoffCheck {
  producer: string;
  consumer: string;
  eventType: string;
  producerWrites: boolean;
  consumerReads: boolean;
  fieldConsistency: boolean;
  emptyHandled: boolean;
  issues: string[];
}

interface ConcurrencyCheck {
  timeSlot: string;
  agents: string[];
  sharedResources: string[];
  conflict: boolean;
  detail: string;
}

interface AbortCheck {
  agent: string;
  hasAbortHandler: boolean;
  downstreamAgents: string[];
  gracefulDegradation: boolean;
  detail: string;
}

interface CostEstimate {
  agent: string;
  tier: string;
  costPerRun: number;
  runsPerWeek: number;
  weeklyPerClient: number;
}

// ── Constants ─────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, "../..");
const AGENTS_DIR = path.join(ROOT, "src/services/agents");
const SERVICES_DIR = path.join(ROOT, "src/services");

const results: CheckResult[] = [];
const handoffs: HandoffCheck[] = [];
const concurrencyChecks: ConcurrencyCheck[] = [];
const abortChecks: AbortCheck[] = [];
const costEstimates: CostEstimate[] = [];

// ── Schedule Definition ───────────────────────────────────────────────

interface ScheduledSlot {
  day: string;
  time: string;
  agents: string[];
}

const WEEKLY_SCHEDULE: ScheduledSlot[] = [
  // SUNDAY
  { day: "Sunday", time: "6:00pm PT", agents: ["trendScout", "contentPerformance"] },
  { day: "Sunday", time: "8:00pm PT", agents: ["csCoach", "weeklyDigest"] },
  { day: "Sunday", time: "9:00pm PT", agents: ["learningAgent"] },
  { day: "Sunday", time: "10:00pm ET", agents: ["weeklyScoreRecalc"] },

  // MONDAY
  { day: "Monday", time: "4:00am PT", agents: ["programmaticSEOAgent"] },
  { day: "Monday", time: "5:00am PT", agents: ["aeoMonitor", "intelligenceAgent"] },
  {
    day: "Monday",
    time: "6:00am PT",
    agents: [
      "clientMonitor",
      "marketSignalScout",
      "technologyHorizon",
      "conversionOptimizer",
      "cmoAgent",
    ],
  },
  { day: "Monday", time: "6:30am ET", agents: ["morningBriefing"] },
  { day: "Monday", time: "7:00am ET", agents: ["mondayChain"] },
  { day: "Monday", time: "7:15am PT", agents: ["dreamweaver", "nothingGetsLost"] },
  { day: "Monday", time: "7:30am PT", agents: ["csAgent"] },
  { day: "Monday", time: "8:00am PT", agents: ["ghostWriter"] },

  // TUESDAY
  { day: "Tuesday", time: "6:00am ET", agents: ["competitiveScout"] },

  // WEDNESDAY-SATURDAY (daily agents)
  { day: "Wednesday", time: "6:00am PT", agents: ["clientMonitor", "marketSignalScout"] },
  { day: "Wednesday", time: "6:05am PT", agents: ["technologyHorizon"] },
  { day: "Wednesday", time: "6:30am ET", agents: ["morningBriefing"] },
  { day: "Wednesday", time: "7:15am PT", agents: ["dreamweaver"] },

  { day: "Thursday", time: "6:00am PT", agents: ["clientMonitor", "marketSignalScout"] },
  { day: "Thursday", time: "6:05am PT", agents: ["technologyHorizon"] },
  { day: "Thursday", time: "6:30am ET", agents: ["morningBriefing"] },
  { day: "Thursday", time: "7:15am PT", agents: ["dreamweaver"] },

  { day: "Friday", time: "6:00am PT", agents: ["clientMonitor", "marketSignalScout"] },
  { day: "Friday", time: "6:05am PT", agents: ["technologyHorizon"] },
  { day: "Friday", time: "6:30am ET", agents: ["morningBriefing"] },
  { day: "Friday", time: "7:15am PT", agents: ["dreamweaver"] },

  { day: "Saturday", time: "6:00am PT", agents: ["clientMonitor", "marketSignalScout"] },
  { day: "Saturday", time: "6:05am PT", agents: ["technologyHorizon"] },
  { day: "Saturday", time: "6:30am ET", agents: ["morningBriefing"] },
  { day: "Saturday", time: "7:15am PT", agents: ["dreamweaver"] },
];

// Hourly agents (all week)
const HOURLY_AGENTS = ["bugTriageAgent"];

// ── Agent -> File Mapping ─────────────────────────────────────────────

interface AgentFileInfo {
  agentName: string;
  fileName: string;
  dir: string;
  expectedExport: string;
}

const AGENT_FILE_MAP: AgentFileInfo[] = [
  { agentName: "trendScout", fileName: "trendScout.ts", dir: AGENTS_DIR, expectedExport: "runTrendScout" },
  { agentName: "contentPerformance", fileName: "contentPerformance.ts", dir: AGENTS_DIR, expectedExport: "runContentPerformance" },
  { agentName: "csCoach", fileName: "csCoach.ts", dir: AGENTS_DIR, expectedExport: "runCSCoach" },
  { agentName: "weeklyDigest", fileName: "weeklyDigest.ts", dir: AGENTS_DIR, expectedExport: "runWeeklyDigest" },
  { agentName: "learningAgent", fileName: "learningAgent.ts", dir: AGENTS_DIR, expectedExport: "runLearningCalibration" },
  { agentName: "weeklyScoreRecalc", fileName: "weeklyScoreRecalc.ts", dir: SERVICES_DIR, expectedExport: "recalculateScore" },
  { agentName: "programmaticSEOAgent", fileName: "programmaticSEOAgent.ts", dir: AGENTS_DIR, expectedExport: "runProgrammaticSEOAnalysis" },
  { agentName: "aeoMonitor", fileName: "aeoMonitor.ts", dir: AGENTS_DIR, expectedExport: "runAEOMonitor" },
  { agentName: "intelligenceAgent", fileName: "intelligenceAgent.ts", dir: AGENTS_DIR, expectedExport: "runIntelligenceForOrg" },
  { agentName: "clientMonitor", fileName: "clientMonitor.ts", dir: AGENTS_DIR, expectedExport: "runClientMonitor" },
  { agentName: "marketSignalScout", fileName: "marketSignalScout.ts", dir: AGENTS_DIR, expectedExport: "runMarketSignalScout" },
  { agentName: "technologyHorizon", fileName: "technologyHorizon.ts", dir: AGENTS_DIR, expectedExport: "runTechnologyHorizon" },
  { agentName: "conversionOptimizer", fileName: "conversionOptimizer.ts", dir: AGENTS_DIR, expectedExport: "runConversionAnalysis" },
  { agentName: "cmoAgent", fileName: "cmoAgent.ts", dir: AGENTS_DIR, expectedExport: "runCMOAgent" },
  { agentName: "morningBriefing", fileName: "morningBriefing.ts", dir: AGENTS_DIR, expectedExport: "runMorningBriefing" },
  { agentName: "mondayChain", fileName: "mondayChain.ts", dir: AGENTS_DIR, expectedExport: "runMondayChain" },
  { agentName: "dreamweaver", fileName: "dreamweaver.ts", dir: AGENTS_DIR, expectedExport: "runDreamweaver" },
  { agentName: "nothingGetsLost", fileName: "nothingGetsLost.ts", dir: AGENTS_DIR, expectedExport: "runDailyScan" },
  { agentName: "csAgent", fileName: "csAgent.ts", dir: AGENTS_DIR, expectedExport: "runCSAgentDaily" },
  { agentName: "ghostWriter", fileName: "ghostWriter.ts", dir: AGENTS_DIR, expectedExport: "runGhostWriterDaily" },
  { agentName: "competitiveScout", fileName: "competitiveScout.ts", dir: AGENTS_DIR, expectedExport: "runCompetitiveScoutForOrg" },
  { agentName: "bugTriageAgent", fileName: "bugTriageAgent.ts", dir: AGENTS_DIR, expectedExport: "runBugTriage" },
  { agentName: "systemConductor", fileName: "systemConductor.ts", dir: AGENTS_DIR, expectedExport: "conductorGate" },
  { agentName: "contentAgent", fileName: "contentAgent.ts", dir: AGENTS_DIR, expectedExport: "generateContent" },
  { agentName: "cfoAgent", fileName: "cfoAgent.ts", dir: AGENTS_DIR, expectedExport: "runCFOMonthlyReport" },
  { agentName: "cloAgent", fileName: "cloAgent.ts", dir: AGENTS_DIR, expectedExport: "runTrademarkScan" },
  { agentName: "safetyAgent", fileName: "safetyAgent.ts", dir: AGENTS_DIR, expectedExport: "checkSafety" },
];

// ── Agent -> Model Tier (from modelRouter.ts) ─────────────────────────

const MODEL_TIER_MAP: Record<string, string> = {
  morningBriefing: "fast",
  contentPerformance: "fast",
  aeoMonitor: "fast",
  nothingGetsLost: "fast",
  bugTriage: "fast",
  marketSignalScout: "fast",
  technologyHorizon: "fast",
  weeklyDigest: "fast",
  intelligenceAgent: "standard",
  cmoAgent: "standard",
  competitiveScout: "standard",
  csAgent: "standard",
  conversionOptimizer: "standard",
  learningAgent: "standard",
  dreamweaver: "standard",
  clientMonitor: "standard",
  systemConductor: "judgment",
  cfoAgent: "judgment",
  cloAgent: "judgment",
  safetyAgent: "judgment",
  icpSimulation: "judgment",
};

const TIER_COST: Record<string, number> = {
  fast: 0.001,
  standard: 0.01,
  judgment: 0.05,
};

// ── Event Type Registry ───────────────────────────────────────────────
// Manually curated from reading every agent file

interface EventTypeInfo {
  eventType: string;
  producer: string;
  writtenTo: string;
  fields: string[];
}

const EVENT_REGISTRY: EventTypeInfo[] = [
  // Client Monitor
  { eventType: "client_health.scored", producer: "clientMonitor", writtenTo: "behavioral_events", fields: ["score", "classification", "event_count"] },
  { eventType: "client_monitor.amber_nudge", producer: "clientMonitor", writtenTo: "behavioral_events", fields: ["message", "org_name"] },

  // Competitive Scout
  { eventType: "competitor.reviews_surge", producer: "competitiveScout", writtenTo: "behavioral_events", fields: ["headline", "details", "severity", "competitorName"] },
  { eventType: "competitor.rating_changed", producer: "competitiveScout", writtenTo: "behavioral_events", fields: ["headline", "details", "severity", "competitorName"] },
  { eventType: "competitor.new_entrant", producer: "competitiveScout", writtenTo: "behavioral_events", fields: ["headline", "details", "severity", "competitorName"] },
  { eventType: "competitive_scout.movement", producer: "competitiveScout", writtenTo: "behavioral_events", fields: ["headline", "details", "severity"] },

  // Intelligence Agent
  { eventType: "intelligence.finding", producer: "intelligenceAgent", writtenTo: "behavioral_events", fields: ["headline", "detail", "humanNeed", "economicConsequence"] },

  // Morning Briefing
  { eventType: "morning_briefing.assembled", producer: "morningBriefing", writtenTo: "behavioral_events", fields: ["date", "total_events", "new_signups", "competitor_moves", "reviews_received", "milestones"] },

  // Monday Chain
  { eventType: "monday_chain.complete", producer: "mondayChain", writtenTo: "behavioral_events", fields: ["success", "email_sent", "score_updated", "findings_generated", "go_no_go_result", "competitor_movements", "aborts", "trace"] },

  // Learning Agent
  { eventType: "learning.weekly_calibration", producer: "learningAgent", writtenTo: "behavioral_events", fields: ["metrics", "overallCompoundRate", "calibratedAt"] },

  // CMO Agent
  { eventType: "cmo.content_brief", producer: "cmoAgent", writtenTo: "behavioral_events", fields: ["briefs", "mode", "generatedAt"] },

  // Content Performance
  { eventType: "content.performance_brief", producer: "contentPerformance", writtenTo: "behavioral_events", fields: ["topSources", "conversionBySource", "recommendation"] },

  // Trend Scout
  { eventType: "content.trend_detected", producer: "trendScout", writtenTo: "behavioral_events", fields: ["topic", "source", "relevanceScore", "suggestedAngle"] },

  // Dreamweaver
  { eventType: "dreamweaver.moment_created", producer: "dreamweaver", writtenTo: "behavioral_events", fields: ["orgId", "orgName", "eventType", "title", "message"] },

  // CS Coach
  { eventType: "cs_coach.pattern_update", producer: "csCoach", writtenTo: "behavioral_events", fields: ["totalInterventions", "patterns", "recommendations"] },

  // CS Agent (proactive)
  { eventType: "cs.proactive_intervention", producer: "csAgent", writtenTo: "behavioral_events", fields: ["orgId", "triggerType", "message", "humanNeed"] },

  // Conversion Optimizer
  { eventType: "conversion.funnel_analysis", producer: "conversionOptimizer", writtenTo: "behavioral_events", fields: ["stages", "weakestStage", "recommendation"] },

  // Programmatic SEO
  { eventType: "seo.page_analysis", producer: "programmaticSEOAgent", writtenTo: "behavioral_events", fields: ["pageId", "slug", "status", "recommendation"] },

  // AEO Monitor
  { eventType: "aeo.search_presence", producer: "aeoMonitor", writtenTo: "behavioral_events", fields: ["query", "present", "position", "competitorsMentioned"] },

  // Technology Horizon
  { eventType: "tech.horizon_signal", producer: "technologyHorizon", writtenTo: "behavioral_events", fields: ["source", "title", "category", "recommendation"] },

  // Market Signal Scout
  { eventType: "market.signal_detected", producer: "marketSignalScout", writtenTo: "behavioral_events", fields: ["source", "title", "relevanceScore", "tier"] },

  // Bug Triage
  { eventType: "ops.bug_detected", producer: "bugTriageAgent", writtenTo: "behavioral_events", fields: ["eventType", "count", "sampleProperties"] },

  // Nothing Gets Lost
  { eventType: "ops.orphan_detected", producer: "nothingGetsLost", writtenTo: "behavioral_events", fields: ["category", "description", "table", "recordId"] },

  // Ghost Writer
  { eventType: "content.ghost_writer_extract", producer: "ghostWriter", writtenTo: "behavioral_events", fields: ["transcriptsProcessed", "passagesTagged", "passages"] },

  // Weekly Score Recalc (via organizations table update, not behavioral_events directly)
  { eventType: "score.recalculated", producer: "weeklyScoreRecalc", writtenTo: "organizations", fields: ["previousScore", "newScore", "delta", "subScores"] },

  // Circuit Breaker
  { eventType: "circuit_breaker.state_change", producer: "circuitBreaker", writtenTo: "behavioral_events", fields: ["agent_name", "previous_state", "new_state", "reason"] },

  // Abort Handler
  { eventType: "abort_handler.triggered", producer: "abortHandler", writtenTo: "behavioral_events", fields: ["agent_name", "error", "action"] },

  // Weekly Digest
  { eventType: "digest.weekly_summary", producer: "weeklyDigest", writtenTo: "behavioral_events", fields: ["weekOf", "topMetric", "clients", "agents"] },

  // Milestones (from milestoneDetector)
  { eventType: "milestone.achieved", producer: "milestoneDetector", writtenTo: "behavioral_events", fields: ["type", "headline", "detail"] },
  { eventType: "milestone.detected", producer: "milestoneDetector", writtenTo: "behavioral_events", fields: ["type", "headline", "detail"] },
];

// ── Handoff Definitions ───────────────────────────────────────────────

interface HandoffDef {
  producer: string;
  consumer: string;
  eventTypes: string[];
  description: string;
  /** The consumer reads this field from the producer's event properties */
  expectedFields: string[];
  /** Consumer should handle empty/missing data gracefully */
  emptyHandling: "required" | "optional";
}

const HANDOFF_DEFS: HandoffDef[] = [
  {
    producer: "weeklyScoreRecalc",
    consumer: "mondayChain",
    eventTypes: ["score.recalculated"],
    description: "Score Recalc -> Monday Email (score delta)",
    expectedFields: ["previousScore", "newScore", "delta"],
    emptyHandling: "optional",
  },
  {
    producer: "competitiveScout",
    consumer: "mondayChain",
    eventTypes: ["competitor.reviews_surge", "competitor.rating_changed", "competitor.new_entrant", "competitive_scout.movement"],
    description: "Competitive Scout -> Monday Email (competitor note)",
    expectedFields: ["headline", "details", "severity"],
    emptyHandling: "optional",
  },
  {
    producer: "competitiveScout",
    consumer: "intelligenceAgent",
    eventTypes: ["competitor.reviews_surge", "competitor.rating_changed", "competitor.new_entrant"],
    description: "Competitive Scout -> Intelligence Agent (movement data)",
    expectedFields: ["headline", "severity", "competitorName"],
    emptyHandling: "optional",
  },
  {
    producer: "intelligenceAgent",
    consumer: "mondayChain",
    eventTypes: ["intelligence.finding"],
    description: "Intelligence Agent -> Monday Email (findings)",
    expectedFields: ["headline", "detail", "humanNeed", "economicConsequence"],
    emptyHandling: "optional",
  },
  {
    producer: "clientMonitor",
    consumer: "dreamweaver",
    eventTypes: ["client_health.scored"],
    description: "Client Monitor -> Dreamweaver (health classification gates moments)",
    expectedFields: ["score", "classification"],
    emptyHandling: "required",
  },
  {
    producer: "clientMonitor",
    consumer: "morningBriefing",
    eventTypes: ["client_health.scored"],
    description: "Client Monitor -> Morning Briefing (health summary)",
    expectedFields: ["score", "classification"],
    emptyHandling: "optional",
  },
  {
    producer: "contentPerformance",
    consumer: "cmoAgent",
    eventTypes: ["content.performance_brief"],
    description: "Content Performance -> CMO Agent (what converts)",
    expectedFields: ["topSources", "conversionBySource", "recommendation"],
    emptyHandling: "optional",
  },
  {
    producer: "learningAgent",
    consumer: "ALL",
    eventTypes: ["learning.weekly_calibration"],
    description: "Learning Agent -> all agents (heuristic updates)",
    expectedFields: ["metrics", "overallCompoundRate"],
    emptyHandling: "optional",
  },
  {
    producer: "cmoAgent",
    consumer: "contentAgent",
    eventTypes: ["cmo.content_brief"],
    description: "CMO Agent -> Content Agent (briefs to drafts)",
    expectedFields: ["briefs", "mode"],
    emptyHandling: "required",
  },
  {
    producer: "ALL",
    consumer: "morningBriefing",
    eventTypes: [
      "client_health.scored",
      "competitor.reviews_surge",
      "competitor.rating_changed",
      "competitor.new_entrant",
      "competitive_scout.movement",
      "intelligence.finding",
      "dreamweaver.moment_created",
      "cs.proactive_intervention",
      "conversion.funnel_analysis",
      "market.signal_detected",
      "tech.horizon_signal",
      "ops.bug_detected",
      "ops.orphan_detected",
      "milestone.achieved",
      "milestone.detected",
    ],
    description: "All agents -> Morning Briefing (overnight signals)",
    expectedFields: [],
    emptyHandling: "optional",
  },
  {
    producer: "ALL",
    consumer: "systemConductor",
    eventTypes: [],
    description: "System Conductor -> all client-facing output (quality gate)",
    expectedFields: ["agentName", "orgId", "outputType", "headline", "body"],
    emptyHandling: "required",
  },
];

// ── Abort Cascade Definitions ─────────────────────────────────────────

interface AbortCascadeDef {
  failingAgent: string;
  downstream: string[];
  abortHandlerKey: string | null;
  gracefulAction: string;
}

const ABORT_CASCADES: AbortCascadeDef[] = [
  {
    failingAgent: "weeklyScoreRecalc",
    downstream: ["mondayChain"],
    abortHandlerKey: "score_recalc",
    gracefulAction: "fallback to previous score",
  },
  {
    failingAgent: "competitiveScout",
    downstream: ["mondayChain", "intelligenceAgent"],
    abortHandlerKey: "competitive_scout",
    gracefulAction: "skip competitor note",
  },
  {
    failingAgent: "intelligenceAgent",
    downstream: ["mondayChain"],
    abortHandlerKey: "intelligence_agent",
    gracefulAction: "fallback to checkup-based findings",
  },
  {
    failingAgent: "systemConductor",
    downstream: ["mondayChain", "dreamweaver", "csAgent"],
    abortHandlerKey: "system_conductor",
    gracefulAction: "escalate, hold all output",
  },
  {
    failingAgent: "clientMonitor",
    downstream: ["dreamweaver", "morningBriefing"],
    abortHandlerKey: null,
    gracefulAction: "dreamweaver skips (no health data), briefing shows empty health",
  },
  {
    failingAgent: "morningBriefing",
    downstream: [],
    abortHandlerKey: null,
    gracefulAction: "no downstream, admin dashboard shows stale data",
  },
  {
    failingAgent: "learningAgent",
    downstream: ["ALL"],
    abortHandlerKey: null,
    gracefulAction: "all agents use previous heuristics (stale but functional)",
  },
  {
    failingAgent: "cmoAgent",
    downstream: ["contentAgent"],
    abortHandlerKey: null,
    gracefulAction: "content agent has no new briefs to work from",
  },
  {
    failingAgent: "contentPerformance",
    downstream: ["cmoAgent"],
    abortHandlerKey: null,
    gracefulAction: "CMO uses template briefs (no performance data)",
  },
  {
    failingAgent: "mondayChain",
    downstream: [],
    abortHandlerKey: "monday_email",
    gracefulAction: "task created for Dave, no email sent",
  },
];

// ── Abort Handler Registry (from abortHandler.ts) ─────────────────────

const ABORT_HANDLER_AGENTS = [
  "score_recalc",
  "weeklyScoreRecalc",
  "competitive_scout",
  "competitiveScout",
  "intelligence_agent",
  "intelligenceAgent",
  "system_conductor",
  "systemConductor",
  "monday_email",
  "mondayEmail",
];

// ── Helpers ───────────────────────────────────────────────────────────

function readFileContent(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

function checkExportInFile(content: string, exportName: string): boolean {
  // Check for named export patterns
  const patterns = [
    new RegExp(`export\\s+(async\\s+)?function\\s+${exportName}\\b`),
    new RegExp(`export\\s+const\\s+${exportName}\\b`),
    new RegExp(`export\\s+\\{[^}]*\\b${exportName}\\b`),
  ];
  return patterns.some((p) => p.test(content));
}

function checkEventTypeInFile(content: string, eventType: string): boolean {
  // Check if the file references this event type string
  return content.includes(`"${eventType}"`) || content.includes(`'${eventType}'`);
}

// ── Section 1: Schedule Validation ────────────────────────────────────

function validateSchedule(): void {
  console.log("\n--- SECTION 1: Schedule Validation ---\n");

  const allScheduledAgents = new Set<string>();
  for (const slot of WEEKLY_SCHEDULE) {
    for (const agent of slot.agents) {
      allScheduledAgents.add(agent);
    }
  }
  for (const agent of HOURLY_AGENTS) {
    allScheduledAgents.add(agent);
  }

  // Check each agent file exists and exports the expected function
  for (const info of AGENT_FILE_MAP) {
    const filePath = path.join(info.dir, info.fileName);
    const exists = fileExists(filePath);

    if (!exists) {
      results.push({
        name: `File: ${info.agentName}`,
        passed: false,
        severity: "P0",
        detail: `Service file missing: ${filePath}`,
      });
      continue;
    }

    const content = readFileContent(filePath);
    if (!content) {
      results.push({
        name: `File: ${info.agentName}`,
        passed: false,
        severity: "P0",
        detail: `Could not read: ${filePath}`,
      });
      continue;
    }

    const hasExport = checkExportInFile(content, info.expectedExport);
    results.push({
      name: `Export: ${info.agentName}.${info.expectedExport}`,
      passed: hasExport,
      severity: hasExport ? "INFO" : "P0",
      detail: hasExport
        ? `Found export ${info.expectedExport} in ${info.fileName}`
        : `Missing export "${info.expectedExport}" in ${info.fileName}`,
    });

    // Check if it's in the schedule
    if (!allScheduledAgents.has(info.agentName)) {
      results.push({
        name: `Schedule: ${info.agentName}`,
        passed: true,
        severity: "INFO",
        detail: `${info.agentName} is not on the weekly schedule (on-demand agent)`,
      });
    }
  }

  // Check that every scheduled agent has a file mapping
  for (const agent of allScheduledAgents) {
    const hasMapping = AGENT_FILE_MAP.some((m) => m.agentName === agent);
    if (!hasMapping) {
      results.push({
        name: `Mapping: ${agent}`,
        passed: false,
        severity: "P1",
        detail: `Scheduled agent "${agent}" has no file mapping in wind tunnel registry`,
      });
    }
  }
}

// ── Section 2: Model Router Validation ────────────────────────────────

function validateModelRouter(): void {
  console.log("--- SECTION 2: Model Router Validation ---\n");

  const routerPath = path.join(AGENTS_DIR, "modelRouter.ts");
  const content = readFileContent(routerPath);
  if (!content) {
    results.push({
      name: "ModelRouter: file",
      passed: false,
      severity: "P0",
      detail: "modelRouter.ts not found or unreadable",
    });
    return;
  }

  // Extract the AGENT_MODEL_MAP from the file
  const mapMatch = content.match(/AGENT_MODEL_MAP[^{]*\{([^}]+)\}/s);
  const registeredAgents = new Set<string>();
  if (mapMatch) {
    const entries = mapMatch[1].matchAll(/(\w+)\s*:\s*"(fast|standard|judgment)"/g);
    for (const entry of entries) {
      registeredAgents.add(entry[1]);
    }
  }

  // Check each scheduled agent is in the model router
  const allScheduledAgents = new Set<string>();
  for (const slot of WEEKLY_SCHEDULE) {
    for (const agent of slot.agents) {
      allScheduledAgents.add(agent);
    }
  }
  for (const agent of HOURLY_AGENTS) {
    allScheduledAgents.add(agent);
  }

  for (const agent of allScheduledAgents) {
    // Some agents map with slightly different names
    const routerName = agent === "bugTriageAgent" ? "bugTriage" : agent;
    const isRegistered = registeredAgents.has(routerName);

    if (!isRegistered) {
      results.push({
        name: `ModelRouter: ${agent}`,
        passed: false,
        severity: "P1",
        detail: `Agent "${agent}" runs on the schedule but is NOT registered in modelRouter.ts. Will default to "standard" tier.`,
      });
    } else {
      results.push({
        name: `ModelRouter: ${agent}`,
        passed: true,
        severity: "INFO",
        detail: `Mapped to tier: ${MODEL_TIER_MAP[routerName] || "standard"}`,
      });
    }
  }

  // Check for agents in the router but not on the schedule
  for (const registered of registeredAgents) {
    if (!allScheduledAgents.has(registered) && registered !== "bugTriage" && registered !== "icpSimulation") {
      results.push({
        name: `ModelRouter orphan: ${registered}`,
        passed: true,
        severity: "INFO",
        detail: `"${registered}" is in modelRouter but not on weekly schedule (may be on-demand)`,
      });
    }
  }
}

// ── Section 3: Circuit Breaker Validation ─────────────────────────────

function validateCircuitBreaker(): void {
  console.log("--- SECTION 3: Circuit Breaker Validation ---\n");

  const cbPath = path.join(AGENTS_DIR, "circuitBreaker.ts");
  const content = readFileContent(cbPath);
  if (!content) {
    results.push({
      name: "CircuitBreaker: file",
      passed: false,
      severity: "P0",
      detail: "circuitBreaker.ts not found",
    });
    return;
  }

  // Check that checkCircuit, recordSuccess, recordFailure are exported
  for (const fn of ["checkCircuit", "recordSuccess", "recordFailure", "resetCircuit"]) {
    const hasExport = checkExportInFile(content, fn);
    results.push({
      name: `CircuitBreaker: ${fn}`,
      passed: hasExport,
      severity: hasExport ? "INFO" : "P0",
      detail: hasExport ? `Export found` : `Missing export: ${fn}`,
    });
  }

  // Check which agents actually USE the circuit breaker
  const agentsUsingCB: string[] = [];
  for (const info of AGENT_FILE_MAP) {
    const filePath = path.join(info.dir, info.fileName);
    const agentContent = readFileContent(filePath);
    if (agentContent && (agentContent.includes("checkCircuit") || agentContent.includes("circuitBreaker"))) {
      agentsUsingCB.push(info.agentName);
    }
  }

  // The mondayChain uses circuit breaker for score_recalc and intelligence_agent
  const chainPath = path.join(AGENTS_DIR, "mondayChain.ts");
  const chainContent = readFileContent(chainPath);
  if (chainContent) {
    const cbImport = chainContent.includes("checkCircuit");
    results.push({
      name: "CircuitBreaker: mondayChain integration",
      passed: cbImport,
      severity: cbImport ? "INFO" : "P1",
      detail: cbImport
        ? "Monday chain imports circuit breaker for score_recalc + intelligence_agent"
        : "Monday chain does NOT import circuit breaker",
    });
  }

  // Flag agents that run on schedule but have no circuit breaker protection
  const allScheduledAgents = new Set<string>();
  for (const slot of WEEKLY_SCHEDULE) {
    for (const agent of slot.agents) {
      allScheduledAgents.add(agent);
    }
  }

  for (const agent of allScheduledAgents) {
    if (!agentsUsingCB.includes(agent) && agent !== "mondayChain") {
      results.push({
        name: `CircuitBreaker gap: ${agent}`,
        passed: true,
        severity: "P2",
        detail: `"${agent}" runs on schedule but does not directly use circuit breaker (relies on orchestrator/runtime)`,
      });
    }
  }
}

// ── Section 4: Handoff Validation ─────────────────────────────────────

function validateHandoffs(): void {
  console.log("--- SECTION 4: Handoff Validation ---\n");

  for (const handoff of HANDOFF_DEFS) {
    const check: HandoffCheck = {
      producer: handoff.producer,
      consumer: handoff.consumer,
      eventType: handoff.eventTypes.join(", "),
      producerWrites: false,
      consumerReads: false,
      fieldConsistency: true,
      emptyHandled: false,
      issues: [],
    };

    // Skip ALL->X handoffs (meta-level)
    if (handoff.producer === "ALL" || handoff.consumer === "ALL") {
      // For Morning Briefing aggregation, check it reads the event types
      if (handoff.consumer === "morningBriefing") {
        const mbPath = path.join(AGENTS_DIR, "morningBriefing.ts");
        const mbContent = readFileContent(mbPath);
        if (mbContent) {
          const missingEvents: string[] = [];
          for (const et of handoff.eventTypes) {
            if (!checkEventTypeInFile(mbContent, et)) {
              missingEvents.push(et);
            }
          }
          check.consumerReads = true;
          if (missingEvents.length > 0) {
            check.issues.push(
              `Morning Briefing does not reference these event types: ${missingEvents.join(", ")}`
            );
          }
        }
      }

      if (handoff.consumer === "systemConductor") {
        const scPath = path.join(AGENTS_DIR, "systemConductor.ts");
        const scContent = readFileContent(scPath);
        if (scContent) {
          check.consumerReads = checkExportInFile(scContent, "conductorGate");
        }
      }

      handoffs.push(check);
      continue;
    }

    // Check producer writes the event type
    const producerInfo = AGENT_FILE_MAP.find((m) => m.agentName === handoff.producer);
    if (producerInfo) {
      const producerPath = path.join(producerInfo.dir, producerInfo.fileName);
      const producerContent = readFileContent(producerPath);
      if (producerContent) {
        for (const et of handoff.eventTypes) {
          if (checkEventTypeInFile(producerContent, et)) {
            check.producerWrites = true;
            break;
          }
        }
        if (!check.producerWrites) {
          // Check if the event type is written via a different mechanism
          // e.g., weeklyScoreRecalc writes to organizations table, not behavioral_events
          if (handoff.producer === "weeklyScoreRecalc") {
            check.producerWrites = true; // Writes to organizations.current_clarity_score
            check.issues.push("Score recalc writes to organizations table, not behavioral_events. Monday chain reads from organizations directly.");
          } else {
            check.issues.push(
              `Producer "${handoff.producer}" does not write any of: ${handoff.eventTypes.join(", ")}`
            );
          }
        }

        // Check field names in producer
        for (const field of handoff.expectedFields) {
          // Check both snake_case and camelCase
          const snakeField = field.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
          if (
            producerContent &&
            !producerContent.includes(field) &&
            !producerContent.includes(snakeField) &&
            !producerContent.includes(`"${field}"`) &&
            !producerContent.includes(`"${snakeField}"`)
          ) {
            check.fieldConsistency = false;
            check.issues.push(
              `Producer "${handoff.producer}" may not write field "${field}" (also checked "${snakeField}")`
            );
          }
        }
      }
    } else if (handoff.producer !== "ALL") {
      check.issues.push(`No file mapping for producer "${handoff.producer}"`);
    }

    // Check consumer reads the event type
    const consumerInfo = AGENT_FILE_MAP.find((m) => m.agentName === handoff.consumer);
    if (consumerInfo) {
      const consumerPath = path.join(consumerInfo.dir, consumerInfo.fileName);
      const consumerContent = readFileContent(consumerPath);
      if (consumerContent) {
        for (const et of handoff.eventTypes) {
          if (checkEventTypeInFile(consumerContent, et)) {
            check.consumerReads = true;
            break;
          }
        }

        // Special case: mondayChain reads competitor events via LIKE query
        if (handoff.consumer === "mondayChain" && handoff.producer === "competitiveScout") {
          if (consumerContent.includes("competitor.%") || consumerContent.includes("competitor.")) {
            check.consumerReads = true;
          }
        }

        if (!check.consumerReads) {
          // Check if consumer reads via behavioral_events query broadly
          if (consumerContent.includes("behavioral_events") && consumerContent.includes("event_type")) {
            check.consumerReads = true;
            check.issues.push(
              `Consumer "${handoff.consumer}" queries behavioral_events but may not filter for specific event types: ${handoff.eventTypes.join(", ")}`
            );
          } else {
            check.issues.push(
              `Consumer "${handoff.consumer}" does not appear to read event types: ${handoff.eventTypes.join(", ")}`
            );
          }
        }

        // Check empty/missing data handling
        if (handoff.emptyHandling === "required") {
          // Required handoffs should have null checks or fallback logic
          const hasNullCheck =
            consumerContent.includes("?? ") ||
            consumerContent.includes("|| ") ||
            consumerContent.includes("if (!") ||
            consumerContent.includes("if (!");
          check.emptyHandled = hasNullCheck;
          if (!hasNullCheck) {
            check.issues.push(
              `Consumer "${handoff.consumer}" may not handle empty data from "${handoff.producer}"`
            );
          }
        } else {
          check.emptyHandled = true; // Optional handoffs are inherently handled
        }
      }
    } else if (handoff.consumer !== "ALL") {
      check.issues.push(`No file mapping for consumer "${handoff.consumer}"`);
    }

    handoffs.push(check);
  }
}

// ── Section 5: Concurrency Conflict Detection ─────────────────────────

function validateConcurrency(): void {
  console.log("--- SECTION 5: Concurrency Conflict Detection ---\n");

  // Group schedule by time slot
  const slotGroups: Record<string, string[]> = {};
  for (const slot of WEEKLY_SCHEDULE) {
    const key = `${slot.day} ${slot.time}`;
    if (!slotGroups[key]) slotGroups[key] = [];
    slotGroups[key].push(...slot.agents);
  }

  // Tables each agent writes to
  const agentWriteTables: Record<string, string[]> = {
    clientMonitor: ["behavioral_events", "organizations", "dream_team_tasks"],
    marketSignalScout: ["behavioral_events"],
    technologyHorizon: ["behavioral_events"],
    conversionOptimizer: ["behavioral_events"],
    cmoAgent: ["behavioral_events"],
    morningBriefing: ["behavioral_events", "morning_briefings"],
    dreamweaver: ["behavioral_events", "notifications"],
    nothingGetsLost: ["behavioral_events"],
    csAgent: ["behavioral_events"],
    competitiveScout: ["behavioral_events", "notifications"],
    intelligenceAgent: ["behavioral_events"],
    aeoMonitor: ["behavioral_events"],
    programmaticSEOAgent: ["behavioral_events"],
    ghostWriter: ["behavioral_events", "dream_team_tasks"],
    bugTriageAgent: ["behavioral_events", "dream_team_tasks"],
    learningAgent: ["behavioral_events"],
    weeklyScoreRecalc: ["organizations", "behavioral_events"],
    weeklyDigest: ["behavioral_events"],
    csCoach: ["behavioral_events"],
    trendScout: ["behavioral_events"],
    contentPerformance: ["behavioral_events"],
    mondayChain: ["behavioral_events", "dream_team_tasks"],
  };

  for (const [timeSlot, agents] of Object.entries(slotGroups)) {
    if (agents.length <= 1) continue;

    // Find shared write tables
    const tableUsage: Record<string, string[]> = {};
    for (const agent of agents) {
      const tables = agentWriteTables[agent] || ["behavioral_events"];
      for (const t of tables) {
        if (!tableUsage[t]) tableUsage[t] = [];
        tableUsage[t].push(agent);
      }
    }

    const sharedTables = Object.entries(tableUsage)
      .filter(([, writers]) => writers.length > 1)
      .map(([table, writers]) => `${table} (${writers.join(", ")})`);

    // behavioral_events is append-only so concurrent writes are safe
    // organizations table concurrent updates are risky
    const hasOrgConflict = Object.entries(tableUsage)
      .filter(([table]) => table === "organizations")
      .some(([, writers]) => writers.length > 1);

    const hasDreamTeamConflict = Object.entries(tableUsage)
      .filter(([table]) => table === "dream_team_tasks")
      .some(([, writers]) => writers.length > 1);

    const conflict = hasOrgConflict || hasDreamTeamConflict;

    concurrencyChecks.push({
      timeSlot,
      agents,
      sharedResources: sharedTables,
      conflict,
      detail: conflict
        ? `Concurrent writes to non-append-only table detected. ${hasOrgConflict ? "organizations table" : "dream_team_tasks table"} at risk.`
        : `All concurrent agents write to behavioral_events (append-only). Safe.`,
    });
  }
}

// ── Section 6: Abort Cascade Validation ───────────────────────────────

function validateAbortCascades(): void {
  console.log("--- SECTION 6: Abort Cascade Validation ---\n");

  const abortHandlerPath = path.join(AGENTS_DIR, "abortHandler.ts");
  const abortContent = readFileContent(abortHandlerPath);

  for (const cascade of ABORT_CASCADES) {
    const hasHandler = cascade.abortHandlerKey
      ? ABORT_HANDLER_AGENTS.includes(cascade.abortHandlerKey)
      : false;

    // Check if the abort handler file actually has a case for this agent
    let handlerImplemented = false;
    if (abortContent && cascade.abortHandlerKey) {
      handlerImplemented =
        abortContent.includes(`"${cascade.abortHandlerKey}"`) ||
        abortContent.includes(`'${cascade.abortHandlerKey}'`);
    }

    const graceful = hasHandler && handlerImplemented;

    abortChecks.push({
      agent: cascade.failingAgent,
      hasAbortHandler: handlerImplemented,
      downstreamAgents: cascade.downstream,
      gracefulDegradation: graceful,
      detail: graceful
        ? `Abort handler implemented: ${cascade.gracefulAction}`
        : cascade.abortHandlerKey
          ? `Abort handler key "${cascade.abortHandlerKey}" ${handlerImplemented ? "exists" : "NOT FOUND"} in abortHandler.ts`
          : `No abort handler defined. Downstream behavior: ${cascade.gracefulAction}`,
    });
  }
}

// ── Section 7: Cost Estimation ────────────────────────────────────────

function estimateCosts(): void {
  console.log("--- SECTION 7: Cost Estimation ---\n");

  // Count runs per week for each agent
  const runsPerWeek: Record<string, number> = {};

  for (const slot of WEEKLY_SCHEDULE) {
    for (const agent of slot.agents) {
      runsPerWeek[agent] = (runsPerWeek[agent] || 0) + 1;
    }
  }

  // Bug triage runs hourly: 24 * 7 = 168
  runsPerWeek["bugTriageAgent"] = 168;

  // Per-client agents (run once per client per week)
  const perClientAgents = new Set([
    "weeklyScoreRecalc",
    "intelligenceAgent",
    "competitiveScout",
    "clientMonitor",
    "dreamweaver",
    "csAgent",
    "mondayChain",
  ]);

  for (const [agent, runs] of Object.entries(runsPerWeek)) {
    const routerName = agent === "bugTriageAgent" ? "bugTriage" : agent;
    const tier = MODEL_TIER_MAP[routerName] || "standard";
    const costPerRun = TIER_COST[tier] || 0.01;

    costEstimates.push({
      agent,
      tier,
      costPerRun,
      runsPerWeek: runs,
      weeklyPerClient: perClientAgents.has(agent) ? costPerRun * runs : 0,
    });
  }
}

// ── Section 8: Event Type Consistency ─────────────────────────────────

function validateEventTypeConsistency(): void {
  console.log("--- SECTION 8: Event Type Consistency Scan ---\n");

  // Scan all agent files for event_type strings and cross-reference
  const writtenEventTypes: Map<string, string[]> = new Map();
  const readEventTypes: Map<string, string[]> = new Map();

  for (const info of AGENT_FILE_MAP) {
    const filePath = path.join(info.dir, info.fileName);
    const content = readFileContent(filePath);
    if (!content) continue;

    // Find all event_type string literals
    const writeMatches = content.matchAll(/event_type:\s*["']([^"']+)["']/g);
    for (const match of writeMatches) {
      const et = match[1];
      if (!writtenEventTypes.has(et)) writtenEventTypes.set(et, []);
      writtenEventTypes.get(et)!.push(info.agentName);
    }

    // Find event types used in queries (WHERE clauses, includes checks, etc.)
    const readMatches = content.matchAll(/["']([a-z_]+\.[a-z_]+)["']/g);
    for (const match of readMatches) {
      const et = match[1];
      // Filter out things that aren't event types (e.g., table.column)
      if (et.includes("behavioral") || et.includes("organizations") || et.includes("dream_team")) continue;
      if (!readEventTypes.has(et)) readEventTypes.set(et, []);
      readEventTypes.get(et)!.push(info.agentName);
    }
  }

  // Find event types that are written but never read
  for (const [et, writers] of writtenEventTypes) {
    const readers = readEventTypes.get(et) || [];
    // Exclude events read by Morning Briefing via array constants
    const mbPath = path.join(AGENTS_DIR, "morningBriefing.ts");
    const mbContent = readFileContent(mbPath);
    const readByMB = mbContent ? mbContent.includes(et) : false;

    if (readers.length === 0 && !readByMB) {
      results.push({
        name: `EventType orphan: ${et}`,
        passed: true,
        severity: "P2",
        detail: `"${et}" is written by ${writers.join(", ")} but no agent reads it directly (may be read via dashboard/API)`,
      });
    }
  }
}

// ── Morning Briefing Missing Event Coverage ───────────────────────────

function validateMorningBriefingCoverage(): void {
  console.log("--- SECTION 9: Morning Briefing Coverage ---\n");

  const mbPath = path.join(AGENTS_DIR, "morningBriefing.ts");
  const mbContent = readFileContent(mbPath);
  if (!mbContent) {
    results.push({
      name: "MorningBriefing: file",
      passed: false,
      severity: "P0",
      detail: "morningBriefing.ts not found",
    });
    return;
  }

  // Extract the event type arrays from morning briefing
  const eventArrays = [
    { name: "SIGNUP_EVENTS", events: ["account.created", "checkup.submitted"] },
    { name: "COMPETITOR_EVENTS", events: ["competitor.reviews_surge", "competitor.rating_changed", "competitor.new_entrant", "competitive_scout.movement"] },
    { name: "REVIEW_EVENTS", events: ["review_request.sent", "review.received", "review_sync.completed"] },
    { name: "HEALTH_EVENTS", events: ["client_health.scored"] },
    { name: "MILESTONE_EVENTS", events: ["milestone.achieved", "milestone.detected", "week1_win.generated"] },
  ];

  // Check what overnight agent events are NOT covered by morning briefing
  const coveredEvents = new Set<string>();
  for (const arr of eventArrays) {
    for (const e of arr.events) {
      coveredEvents.add(e);
    }
  }

  const overnightProducers = [
    "intelligence.finding",
    "dreamweaver.moment_created",
    "cs.proactive_intervention",
    "conversion.funnel_analysis",
    "market.signal_detected",
    "tech.horizon_signal",
    "ops.bug_detected",
    "ops.orphan_detected",
    "cmo.content_brief",
    "content.performance_brief",
    "content.trend_detected",
    "cs_coach.pattern_update",
    "learning.weekly_calibration",
    "seo.page_analysis",
    "aeo.search_presence",
    "content.ghost_writer_extract",
  ];

  const notCoveredByBriefing: string[] = [];
  for (const et of overnightProducers) {
    if (!coveredEvents.has(et) && !mbContent.includes(et)) {
      notCoveredByBriefing.push(et);
    }
  }

  if (notCoveredByBriefing.length > 0) {
    results.push({
      name: "MorningBriefing: coverage gaps",
      passed: false,
      severity: "P1",
      detail: `Morning Briefing does not aggregate these overnight event types: ${notCoveredByBriefing.join(", ")}. These signals will be invisible in the admin daily summary.`,
    });
  } else {
    results.push({
      name: "MorningBriefing: coverage",
      passed: true,
      severity: "INFO",
      detail: "All overnight agent events are covered by Morning Briefing aggregation",
    });
  }
}

// ── Scheduling Agents Missing From Model Router ───────────────────────

function validateUnregisteredAgents(): void {
  console.log("--- SECTION 10: Unregistered Agents ---\n");

  // Agents on the schedule that have no entry in modelRouter AGENT_MODEL_MAP
  const unregistered = [
    "trendScout",
    "csCoach",
    "weeklyScoreRecalc",
    "programmaticSEOAgent",
    "mondayChain",
    "csAgent",
    "ghostWriter",
    "contentAgent",
  ];

  for (const agent of unregistered) {
    const routerName = agent;
    if (!MODEL_TIER_MAP[routerName]) {
      results.push({
        name: `Unregistered: ${agent}`,
        passed: false,
        severity: "P2",
        detail: `"${agent}" is not in modelRouter.ts AGENT_MODEL_MAP. It will default to "standard" tier (Sonnet). Verify this is intentional.`,
      });
    }
  }
}

// ── Report Generator ──────────────────────────────────────────────────

function generateReport(): void {
  console.log("\n");
  console.log("=".repeat(60));
  console.log("  WIND TUNNEL SIMULATION REPORT");
  console.log("  Full-week agent orchestration stress test");
  console.log("=".repeat(60));

  // Schedule summary
  const uniqueAgents = new Set<string>();
  for (const slot of WEEKLY_SCHEDULE) {
    for (const a of slot.agents) uniqueAgents.add(a);
  }
  for (const a of HOURLY_AGENTS) uniqueAgents.add(a);

  console.log(`\nSCHEDULE: ${uniqueAgents.size} agents across ${WEEKLY_SCHEDULE.length} time slots + ${HOURLY_AGENTS.length} hourly`);

  // Handoff summary
  const handoffVerified = handoffs.filter((h) => h.producerWrites && h.consumerReads && h.issues.length === 0).length;
  const handoffBroken = handoffs.filter((h) => h.issues.length > 0).length;
  const handoffUntested = handoffs.length - handoffVerified - handoffBroken;
  console.log(`HANDOFFS: ${handoffVerified} verified, ${handoffBroken} with issues, ${handoffUntested} partial`);

  // Concurrency summary
  const conflictsFound = concurrencyChecks.filter((c) => c.conflict).length;
  console.log(`CONFLICTS: ${conflictsFound} potential concurrent conflicts found out of ${concurrencyChecks.length} time slots`);

  // Abort summary
  const graceful = abortChecks.filter((a) => a.gracefulDegradation).length;
  const wouldCrash = abortChecks.filter((a) => !a.gracefulDegradation && a.downstreamAgents.length > 0).length;
  const noDownstream = abortChecks.filter((a) => a.downstreamAgents.length === 0).length;
  console.log(`ABORTS: ${graceful} graceful, ${wouldCrash} no handler (downstream impacted), ${noDownstream} no downstream`);

  // Cost summary
  const weeklyPlatformCost = costEstimates.reduce((sum, c) => sum + c.costPerRun * c.runsPerWeek, 0);
  const weeklyPerClientCost = costEstimates.reduce((sum, c) => sum + c.weeklyPerClient, 0);
  const monthlyPerClient = weeklyPerClientCost * 4.33;
  const monthlyAt100 = (weeklyPlatformCost + weeklyPerClientCost * 100) * 4.33;
  const monthlyAt1000 = (weeklyPlatformCost + weeklyPerClientCost * 1000) * 4.33;

  console.log(`\nESTIMATED COST:`);
  console.log(`  Platform (shared agents): $${weeklyPlatformCost.toFixed(3)}/week`);
  console.log(`  Per-client agents: $${weeklyPerClientCost.toFixed(3)}/client/week ($${monthlyPerClient.toFixed(2)}/client/month)`);
  console.log(`  At 100 clients: $${monthlyAt100.toFixed(2)}/month`);
  console.log(`  At 1,000 clients: $${monthlyAt1000.toFixed(2)}/month`);

  // Issues by severity
  const p0Issues = results.filter((r) => !r.passed && r.severity === "P0");
  const p1Issues = results.filter((r) => !r.passed && r.severity === "P1");
  const p2Issues = results.filter((r) => !r.passed && r.severity === "P2");

  // Handoff issues
  const handoffIssues = handoffs.filter((h) => h.issues.length > 0);

  console.log(`\n${"=".repeat(60)}`);
  console.log("  ISSUES FOUND");
  console.log("=".repeat(60));

  if (p0Issues.length === 0 && p1Issues.length === 0 && p2Issues.length === 0 && handoffIssues.length === 0) {
    console.log("\n  No issues found. All checks passed.\n");
  }

  for (const issue of p0Issues) {
    console.log(`\n  [P0] ${issue.name}`);
    console.log(`       ${issue.detail}`);
  }

  for (const issue of p1Issues) {
    console.log(`\n  [P1] ${issue.name}`);
    console.log(`       ${issue.detail}`);
  }

  for (const issue of p2Issues) {
    console.log(`\n  [P2] ${issue.name}`);
    console.log(`       ${issue.detail}`);
  }

  // Handoff issues
  for (const h of handoffIssues) {
    const severity = h.producerWrites && h.consumerReads ? "P2" : "P1";
    console.log(`\n  [${severity}] Handoff: ${h.producer} -> ${h.consumer}`);
    for (const issue of h.issues) {
      console.log(`       ${issue}`);
    }
  }

  // Concurrency conflicts
  for (const c of concurrencyChecks.filter((c) => c.conflict)) {
    console.log(`\n  [P1] Concurrency: ${c.timeSlot}`);
    console.log(`       Agents: ${c.agents.join(", ")}`);
    console.log(`       ${c.detail}`);
  }

  // Abort issues
  for (const a of abortChecks.filter((a) => !a.gracefulDegradation && a.downstreamAgents.length > 0)) {
    console.log(`\n  [P2] Abort gap: ${a.agent}`);
    console.log(`       Downstream: ${a.downstreamAgents.join(", ")}`);
    console.log(`       ${a.detail}`);
  }

  // Final score
  const totalChecks = results.length + handoffs.length + concurrencyChecks.length + abortChecks.length;
  const passedChecks =
    results.filter((r) => r.passed).length +
    handoffs.filter((h) => h.issues.length === 0).length +
    concurrencyChecks.filter((c) => !c.conflict).length +
    abortChecks.filter((a) => a.gracefulDegradation || a.downstreamAgents.length === 0).length;

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  PASS/FAIL: ${passedChecks} of ${totalChecks} checks passed`);
  console.log(`  P0: ${p0Issues.length}  P1: ${p1Issues.length}  P2: ${p2Issues.length}`);
  console.log("=".repeat(60));

  // Detailed cost breakdown
  console.log(`\n${"=".repeat(60)}`);
  console.log("  COST BREAKDOWN BY AGENT");
  console.log("=".repeat(60));
  console.log(`\n  ${"Agent".padEnd(28)} ${"Tier".padEnd(12)} ${"$/run".padEnd(10)} ${"Runs/wk".padEnd(10)} $/wk`);
  console.log(`  ${"-".repeat(28)} ${"-".repeat(12)} ${"-".repeat(10)} ${"-".repeat(10)} ${"-".repeat(10)}`);

  const sorted = [...costEstimates].sort((a, b) => b.costPerRun * b.runsPerWeek - a.costPerRun * a.runsPerWeek);
  for (const c of sorted) {
    const weeklyTotal = c.costPerRun * c.runsPerWeek;
    console.log(
      `  ${c.agent.padEnd(28)} ${c.tier.padEnd(12)} $${c.costPerRun.toFixed(3).padEnd(9)} ${String(c.runsPerWeek).padEnd(10)} $${weeklyTotal.toFixed(3)}`
    );
  }

  // Chronological week walkthrough
  console.log(`\n${"=".repeat(60)}`);
  console.log("  CHRONOLOGICAL WEEK WALKTHROUGH");
  console.log("=".repeat(60));

  for (const slot of WEEKLY_SCHEDULE) {
    const agentList = slot.agents
      .map((a) => {
        const tier = MODEL_TIER_MAP[a === "bugTriageAgent" ? "bugTriage" : a] || "standard";
        return `${a} (${tier})`;
      })
      .join(", ");
    console.log(`\n  ${slot.day} ${slot.time}: ${agentList}`);

    // Show handoffs that happen at this stage
    for (const h of HANDOFF_DEFS) {
      if (slot.agents.includes(h.consumer) && h.producer !== "ALL") {
        const status = h.eventTypes.length > 0
          ? handoffs.find((hc) => hc.producer === h.producer && hc.consumer === h.consumer)
          : null;
        const icon = status && status.issues.length === 0 ? "OK" : "!!";
        console.log(`    [${icon}] Reads from: ${h.producer} (${h.description})`);
      }
    }
  }

  console.log(`\n  HOURLY: ${HOURLY_AGENTS.join(", ")} (168 runs/week)`);

  // Exit code
  if (p0Issues.length > 0) {
    console.log("\n  RESULT: FAIL (P0 issues found)\n");
    process.exit(1);
  } else {
    console.log("\n  RESULT: PASS (no P0 issues)\n");
    process.exit(0);
  }
}

// ── Main ──────────────────────────────────────────────────────────────

function main(): void {
  console.log("Wind Tunnel Simulation -- Alloro Agent System");
  console.log(`Scanning: ${ROOT}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log("=".repeat(60));

  validateSchedule();
  validateModelRouter();
  validateCircuitBreaker();
  validateHandoffs();
  validateConcurrency();
  validateAbortCascades();
  estimateCosts();
  validateEventTypeConsistency();
  validateMorningBriefingCoverage();
  validateUnregisteredAgents();
  generateReport();
}

main();
