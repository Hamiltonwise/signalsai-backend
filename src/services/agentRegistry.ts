/**
 * Agent Registry
 *
 * Code-defined map of agent_key -> handler.
 * The scheduler worker looks up handlers here.
 * The admin API exposes available keys for the "create schedule" dropdown.
 */

import { executeProoflineAgent } from "../controllers/agents/feature-services/service.proofline-executor";
import { executeRankingAgent } from "../controllers/agents/feature-services/service.ranking-executor";
import { generateAllSnapshots } from "./rankingsIntelligence";
import { sendAllMondayEmails } from "../jobs/mondayEmail";
import { runDreamweaver } from "./agents/dreamweaver";
import { measurePendingOutcomes, aggregateHeuristicStats } from "./feedbackLoop";

// Dream team agent services
import { runClientMonitor } from "./agents/clientMonitor";
import { runCSAgentDaily } from "./agents/csAgent";
import { runCSCoach } from "./agents/csCoach";
import { runCSExpander } from "./agents/csExpander";
import { runMorningBriefing } from "./agents/morningBriefing";
import { runAEOMonitor } from "./agents/aeoMonitor";
import { runContentPerformance } from "./agents/contentPerformance";
import { runCompetitiveScoutForAll } from "./agents/competitiveScout";
import { runLearningCalibration } from "./agents/learningAgent";
import { runDailyScan as runNothingGetsLostScan } from "./agents/nothingGetsLost";
import { runBugTriage } from "./agents/bugTriageAgent";
import { runCMOAgent } from "./agents/cmoAgent";
import { runConversionAnalysis } from "./agents/conversionOptimizer";
import { runWeeklyDigest } from "./agents/weeklyDigest";
import { runIntelligenceForAll } from "./agents/intelligenceAgent";
import { runCFOMonthlyReport } from "./agents/cfoAgent";
import { runStrategicIntelligence } from "./agents/strategicIntelligence";
import { runTechnologyHorizon } from "./agents/technologyHorizon";
import { runTrendScout } from "./agents/trendScout";
import { runMarketSignalScout } from "./agents/marketSignalScout";
import { runWeeklyReport as runFoundationOpsWeekly } from "./agents/foundationOperations";
import { runVerticalReadinessScan } from "./agents/verticalReadiness";
import { runHumanDeploymentScan } from "./agents/humanDeploymentScout";
import { runPodcastScout } from "./agents/podcastScout";
import { runPropertyScan } from "./agents/realEstateAgent";
import { runTrademarkScan } from "./agents/cloAgent";
import { runGhostWriterDaily } from "./agents/ghostWriter";
import { runProgrammaticSEOAnalysis } from "./agents/programmaticSEOAgent";
import { generateDailyBrief as generateCoreyBrief } from "./personalAgents/coreyAgent";
import { generateDailyBrief as generateJoBrief } from "./personalAgents/joAgent";
import { generateDailyBrief as generateDaveBrief } from "./personalAgents/daveAgent";
import { runAgentAudit } from "./agents/agentAuditor";
import { runCollectiveIntelligence } from "./collectiveIntelligence";
import { trackAllCustomerOutcomes } from "./customerOutcomeTracker";
import { runBridgeTranslator } from "./agents/bridgeTranslator";
import { runReviewerClaudeOnArtifact } from "./agents/reviewerClaude";
import { db } from "../database/connection";
import { processWeek1Win } from "../workers/processors/week1Win.processor";

export interface AgentHandler {
  displayName: string;
  description: string;
  handler: () => Promise<{ summary: Record<string, unknown> }>;
}

const registry: Record<string, AgentHandler> = {
  // ─── Existing agents ───────────────────────────────────────────
  proofline: {
    displayName: "Proofline Agent",
    description: "Daily proofline analysis. Generates Win/Risk data points from GBP and website analytics for all onboarded locations.",
    handler: async () => {
      const result = await executeProoflineAgent();
      return { summary: result.summary as unknown as Record<string, unknown> };
    },
  },
  ranking: {
    displayName: "Practice Ranking",
    description: "Competitive ranking analysis. Discovers competitors, scores, and generates LLM analysis for all onboarded locations.",
    handler: async () => {
      const result = await executeRankingAgent();
      return { summary: result.summary as unknown as Record<string, unknown> };
    },
  },
  rankings_intelligence: {
    displayName: "Rankings Intelligence",
    description: "Weekly snapshot. Queries current ranking for each org, generates 3 plain-English bullets, stores to weekly_ranking_snapshots. Runs Sunday 11PM UTC.",
    handler: async () => {
      const result = await generateAllSnapshots();
      return { summary: result as unknown as Record<string, unknown> };
    },
  },
  monday_email: {
    displayName: "Monday Email",
    description: "Weekly intelligence brief to each practice owner. Reads from weekly_ranking_snapshots, sends via n8n webhook. Monday 2PM UTC (7AM PT).",
    handler: async () => {
      const result = await sendAllMondayEmails();
      return { summary: result as unknown as Record<string, unknown> };
    },
  },
  dreamweaver: {
    displayName: "Dreamweaver",
    description: "Hospitality moments agent. Scans behavioral_events for personalized gestures (milestones, 5-star reviews, competitor wins, welcome back, 90-day mark, referral conversions). Daily 2:15PM UTC (7:15AM PT), after Client Monitor.",
    handler: async () => {
      const result = await runDreamweaver();
      return { summary: result as unknown as Record<string, unknown> };
    },
  },
  feedback_loop: {
    displayName: "Feedback Loop",
    description: "Self-improving heuristics engine. Measures Monday email outcomes after 7 days, aggregates which action types drive the most improvement. Tuesday 3PM UTC (8AM PT), 24h after Monday email.",
    handler: async () => {
      const outcomes = await measurePendingOutcomes();
      const stats = await aggregateHeuristicStats();
      return {
        summary: {
          measured: outcomes.measured,
          errors: outcomes.errors,
          heuristic_stats: stats,
        } as unknown as Record<string, unknown>,
      };
    },
  },

  collective_intelligence: {
    displayName: "Collective Intelligence",
    description: "Weekly network-level analysis. Cross-client patterns: which actions move rankings, which review language correlates with growth, churn patterns. Sunday 8PM UTC (1PM PT), before Product Evolution.",
    handler: async () => {
      const result = await runCollectiveIntelligence();
      return { summary: result as unknown as Record<string, unknown> };
    },
  },

  // ─── Daily agents ──────────────────────────────────────────────
  client_monitor: {
    displayName: "Client Monitor",
    description: "Daily client health scoring. Classifies each org as GREEN/AMBER/RED based on behavioral_events from the last 7 days.",
    handler: async () => {
      const result = await runClientMonitor();
      return { summary: result as unknown as Record<string, unknown> };
    },
  },
  cs_agent: {
    displayName: "CS Agent",
    description: "Daily proactive CS interventions. Detects behavioral triggers across all active orgs and generates response suggestions.",
    handler: async () => {
      const result = await runCSAgentDaily();
      return { summary: result as unknown as Record<string, unknown> };
    },
  },
  cs_coach: {
    displayName: "CS Coach",
    description: "Daily CS coaching suggestions. Analyzes support interactions and recommends improvements.",
    handler: async () => {
      const result = await runCSCoach();
      return { summary: result as unknown as Record<string, unknown> };
    },
  },
  cs_expander: {
    displayName: "CS Expander",
    description: "Daily expansion opportunity detection. Identifies upsell and cross-sell signals from client behavior.",
    handler: async () => {
      const result = await runCSExpander();
      return { summary: result as unknown as Record<string, unknown> };
    },
  },
  morning_briefing: {
    displayName: "Morning Briefing",
    description: "Daily synthesis of overnight events, agent outputs, and priority actions. 6am PT before Monday email.",
    handler: async () => {
      const result = await runMorningBriefing();
      return { summary: result as unknown as Record<string, unknown> };
    },
  },
  aeo_monitor: {
    displayName: "AEO Monitor",
    description: "Daily AI search citation monitoring. Tracks how AI engines reference client businesses.",
    handler: async () => {
      const result = await runAEOMonitor();
      return { summary: result as unknown as Record<string, unknown> };
    },
  },
  content_performance: {
    displayName: "Content Performance",
    description: "Daily content ROI tracking. Measures performance of published content across platforms.",
    handler: async () => {
      const result = await runContentPerformance();
      return { summary: result as unknown as Record<string, unknown> };
    },
  },
  competitive_scout: {
    displayName: "Competitive Scout",
    description: "Daily competitor activity scan. Detects competitor moves across all client markets.",
    handler: async () => {
      const result = await runCompetitiveScoutForAll();
      return { summary: result as unknown as Record<string, unknown> };
    },
  },
  learning_agent: {
    displayName: "Learning Agent",
    description: "Daily heuristic calibration. End-of-day analysis of which agent outputs drove real improvement.",
    handler: async () => {
      const result = await runLearningCalibration();
      return { summary: result as unknown as Record<string, unknown> };
    },
  },
  nothing_gets_lost: {
    displayName: "Nothing Gets Lost",
    description: "Daily orphan document scan. Finds unreferenced knowledge docs, stale Canon pages, and broken links.",
    handler: async () => {
      const result = await runNothingGetsLostScan();
      return { summary: result as unknown as Record<string, unknown> };
    },
  },
  bug_triage: {
    displayName: "Bug Triage",
    description: "Daily auto-triage of open bugs. Classifies severity, assigns to queues, escalates P0s.",
    handler: async () => {
      const result = await runBugTriage();
      return { summary: result as unknown as Record<string, unknown> };
    },
  },
  week1_win: {
    displayName: "Week 1 Win",
    description: "Daily check for new accounts in their first week. Generates the single most valuable quick win from GBP completeness, NAP consistency, or site speed.",
    handler: async () => {
      // Find orgs created in the last 7 days without a week1 win yet
      const newOrgs = await db("organizations")
        .whereNull("week1_win_headline")
        .where("created_at", ">=", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
        .select("id");

      let processed = 0;
      for (const org of newOrgs) {
        try {
          await processWeek1Win({ data: { orgId: org.id } } as any);
          processed++;
        } catch (err: any) {
          console.error(`[Week1Win] Failed for org ${org.id}:`, err.message);
        }
      }
      return { summary: { processed, total: newOrgs.length } };
    },
  },

  // ─── Weekly agents ─────────────────────────────────────────────
  cmo_agent: {
    displayName: "CMO Agent",
    description: "Weekly content strategy. Generates content briefs, topic recommendations, and messaging guidance.",
    handler: async () => {
      const result = await runCMOAgent();
      return { summary: result as unknown as Record<string, unknown> };
    },
  },
  conversion_optimizer: {
    displayName: "Conversion Optimizer",
    description: "Weekly funnel analysis. Identifies drop-off points, A/B test proposals, and conversion improvements.",
    handler: async () => {
      const result = await runConversionAnalysis();
      return { summary: result as unknown as Record<string, unknown> };
    },
  },
  weekly_digest: {
    displayName: "Weekly Digest",
    description: "Friday summary of the week's behavioral_events, agent outputs, client health, and competitive moves.",
    handler: async () => {
      const result = await runWeeklyDigest();
      return { summary: result as unknown as Record<string, unknown> };
    },
  },
  intelligence_agent: {
    displayName: "Intelligence Agent",
    description: "Weekly market intelligence. Deep analysis of market data, ranking trends, and competitive positioning.",
    handler: async () => {
      const result = await runIntelligenceForAll();
      return { summary: result as unknown as Record<string, unknown> };
    },
  },
  cfo_agent: {
    displayName: "CFO Agent",
    description: "Weekly financial review. Revenue projections, cost analysis, and financial health scoring.",
    handler: async () => {
      const result = await runCFOMonthlyReport();
      return { summary: result as unknown as Record<string, unknown> };
    },
  },
  strategic_intelligence: {
    displayName: "Strategic Intelligence",
    description: "Weekly strategic signals. Identifies macro trends, partnership opportunities, and market shifts.",
    handler: async () => {
      const result = await runStrategicIntelligence();
      return { summary: result as unknown as Record<string, unknown> };
    },
  },
  technology_horizon: {
    displayName: "Technology Horizon",
    description: "Weekly tech landscape scan. Evaluates new models, tools, and capabilities relevant to the platform.",
    handler: async () => {
      const result = await runTechnologyHorizon();
      return { summary: result as unknown as Record<string, unknown> };
    },
  },
  trend_scout: {
    displayName: "Trend Scout",
    description: "Weekly trend detection. Identifies emerging patterns in client industries and adjacent markets.",
    handler: async () => {
      const result = await runTrendScout();
      return { summary: result as unknown as Record<string, unknown> };
    },
  },
  market_signal_scout: {
    displayName: "Market Signal Scout",
    description: "Weekly market signal aggregation. Collects and scores signals from news, social, and industry sources.",
    handler: async () => {
      const result = await runMarketSignalScout();
      return { summary: result as unknown as Record<string, unknown> };
    },
  },
  foundation_operations: {
    displayName: "Foundation Operations",
    description: "Weekly Heroes & Founders Foundation ops check. RISE Program status, grant pipeline, sponsor outreach.",
    handler: async () => {
      const result = await runFoundationOpsWeekly();
      return { summary: result as unknown as Record<string, unknown> };
    },
  },
  vertical_readiness: {
    displayName: "Vertical Readiness",
    description: "Weekly vertical expansion readiness assessment. Scores new verticals on TAM, fit, and effort.",
    handler: async () => {
      const result = await runVerticalReadinessScan();
      return { summary: result as unknown as Record<string, unknown> };
    },
  },
  human_deployment_scout: {
    displayName: "Human Deployment Scout",
    description: "Weekly hiring and scaling signal detection. Identifies when to hire, what roles, and cost impact.",
    handler: async () => {
      const result = await runHumanDeploymentScan();
      return { summary: result as unknown as Record<string, unknown> };
    },
  },
  podcast_scout: {
    displayName: "Podcast Scout",
    description: "Weekly podcast opportunity detection. Identifies relevant shows, pitch angles, and booking windows.",
    handler: async () => {
      const result = await runPodcastScout();
      return { summary: result as unknown as Record<string, unknown> };
    },
  },
  real_estate_agent: {
    displayName: "Real Estate Agent",
    description: "Weekly real estate market signal scan. Tracks commercial real estate trends relevant to client expansion.",
    handler: async () => {
      const result = await runPropertyScan();
      return { summary: result as unknown as Record<string, unknown> };
    },
  },

  // ─── Newly wired agents (previously identity-only) ────────────
  clo_agent: {
    displayName: "CLO Agent",
    description: "Weekly legal/IP monitoring. Trademark alerts, compliance flags, HIPAA checks.",
    handler: async () => {
      const result = await runTrademarkScan();
      return { summary: result as unknown as Record<string, unknown> };
    },
  },
  ghost_writer: {
    displayName: "Ghost Writer",
    description: "Daily content extraction. Pulls draft-worthy content from behavioral_events and ranking data.",
    handler: async () => {
      const result = await runGhostWriterDaily();
      return { summary: result as unknown as Record<string, unknown> };
    },
  },
  programmatic_seo: {
    displayName: "Programmatic SEO Agent",
    description: "Weekly location-specific SEO page generation and gap analysis.",
    handler: async () => {
      const result = await runProgrammaticSEOAnalysis();
      return { summary: result as unknown as Record<string, unknown> };
    },
  },
  corey_agent: {
    displayName: "Corey's Personal Agent",
    description: "Daily brief for Corey: revenue, decisions, priorities, client pulse.",
    handler: async () => {
      // Corey's user ID from the system
      const coreyUser = await db("users").where({ email: "corey@getalloro.com" }).first("id");
      const result = await generateCoreyBrief(coreyUser?.id || 1);
      return { summary: result as unknown as Record<string, unknown> };
    },
  },
  jo_agent: {
    displayName: "Jo's Personal Agent",
    description: "Daily brief for Jo: client health, ops tasks, flags.",
    handler: async () => {
      const joUser = await db("users").where({ email: "jo@getalloro.com" }).first("id");
      const result = await generateJoBrief(joUser?.id || 2);
      return { summary: result as unknown as Record<string, unknown> };
    },
  },
  agent_auditor: {
    displayName: "Agent Auditor",
    description: "Daily system health check. Audits all agents for broken contracts, drift signals, missing wiring, and Canon compliance gaps.",
    handler: async () => {
      const result = await runAgentAudit();
      return { summary: result as unknown as Record<string, unknown> };
    },
  },
  dave_agent: {
    displayName: "Dave's Personal Agent",
    description: "Daily brief for Dave: deploy status, errors, task queue.",
    handler: async () => {
      const daveUser = await db("users").where({ email: "dave@getalloro.com" }).first("id");
      const result = await generateDaveBrief(daveUser?.id || 3);
      return { summary: result as unknown as Record<string, unknown> };
    },
  },
  customer_outcomes: {
    displayName: "Customer Outcome Tracker",
    description: "Tracks real customer results: rating deltas, review velocity, ranking movement, competitor gap. Creates tasks on regression, stores wins for Monday email. Runs after rankings_intelligence (Sunday 11:30PM UTC).",
    handler: async () => {
      const result = await trackAllCustomerOutcomes();
      return { summary: result as unknown as Record<string, unknown> };
    },
  },
  bridge_translator: {
    displayName: "Bridge Translator",
    description: "Weekly Migration Manifest delta generator. Reads sandbox commits since the last manifest, groups by functional area, generates Dave-Ready cards with verification tests + pattern audit. Runs Friday 19:00 PT (Saturday 02:00 UTC). Defaults to shadow mode -- Cole reviews output before authorizing active mode.",
    handler: async () => {
      const envMode = process.env.BRIDGE_TRANSLATOR_MODE;
      const mode =
        envMode === "active" ? "active"
          : envMode === "session" ? "session"
            : "shadow";
      const result = await runBridgeTranslator({ mode });
      return {
        summary: {
          mode,
          card_count: result.delta.cards.length,
          orphan_count: result.delta.orphans.length,
          anchor: result.delta.anchorCommit,
          head: result.delta.headCommit,
          manifest_path: result.manifestPath,
          self_check: result.delta.selfCheck,
          session_outcomes: result.sessionOutcomes.length,
        } as Record<string, unknown>,
      };
    },
  },
  reviewer_claude_gate: {
    displayName: "Reviewer Claude Gate (Build A)",
    description: "Adversarial review of a Dave-bound artifact via fresh Claude Opus 4.7 session with the verbatim 8-check Reviewer Claude prompt + Check 2 extension. Writes verdict to Reviewer Gate Audit Log Notion DB, auto-promotes PASS to Sandbox Card Inbox, posts to Slack on every verdict. Manual invocation only -- handler runs against env REVIEWER_GATE_ARTIFACT_PATH (or skips with warning).",
    handler: async () => {
      const artifactPath = process.env.REVIEWER_GATE_ARTIFACT_PATH;
      if (!artifactPath) {
        console.warn(
          "[reviewer_claude_gate] REVIEWER_GATE_ARTIFACT_PATH not set; nothing to review.",
        );
        return { summary: { skipped: true, reason: "no artifact path" } };
      }
      const result = await runReviewerClaudeOnArtifact({
        artifactPath,
        artifactSource: process.env.REVIEWER_GATE_ARTIFACT_SOURCE,
        linkedArtifactUrl: process.env.REVIEWER_GATE_LINKED_URL,
      });
      return {
        summary: {
          verdict: result.verdict,
          blockers: result.blockers.length,
          concerns: result.concerns.length,
          notes: result.notes.length,
          auto_promoted: result.autoPromoted,
          audit_log_page_id: result.auditLogPageId,
        } as Record<string, unknown>,
      };
    },
  },
};

export function getAgentHandler(agentKey: string): AgentHandler | undefined {
  return registry[agentKey];
}

export function getRegisteredAgents(): Array<{ key: string; displayName: string; description: string }> {
  return Object.entries(registry).map(([key, { displayName, description }]) => ({
    key,
    displayName,
    description,
  }));
}
