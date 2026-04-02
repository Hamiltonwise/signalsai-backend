/**
 * Seed Operational Playbooks for All Dream Team Agents
 *
 * Every agent gets a complete process: what they produce, who it's for,
 * where it goes, what triggers them, how they know they succeeded, and
 * how their output feeds back into the system.
 *
 * Organized by department. This is the employee handbook.
 *
 * NOTE: Only updates canon_spec. Does NOT reset gate_verdict
 * (these are process docs, not spec changes that invalidate testing).
 */

import type { Knex } from "knex";

interface ProcessSpec {
  purpose: string;
  expectedBehavior: string;
  constraints: string[];
  owner: string;
  process: {
    steps: string[];
    deliversTo: string;
    deliversFormat: string;
    triggeredBy: string;
    feedbackLoop: string;
    successMetric: string;
  };
  citations: string[];
  lineage: string;
  freshness: string;
}

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable("agent_identities");
  if (!hasTable) return;

  // Only update canon_spec, do NOT reset gate_verdict
  async function setPlaybook(slug: string, spec: ProcessSpec) {
    const existing = await knex("agent_identities").where({ slug }).first("canon_spec", "gate_verdict");
    if (!existing) return;

    // Merge with existing spec (preserve gold questions verdict)
    const existingSpec = typeof existing.canon_spec === "string"
      ? JSON.parse(existing.canon_spec) : existing.canon_spec || {};

    const merged = { ...existingSpec, ...spec };

    await knex("agent_identities").where({ slug }).update({
      canon_spec: JSON.stringify(merged),
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // CLIENT SUCCESS DEPARTMENT
  // ═══════════════════════════════════════════════════════════════

  await setPlaybook("client_monitor", {
    purpose: "Daily health scoring for every active/trial org",
    expectedBehavior: "Every org gets a health classification. RED creates tasks. AMBER nudges. GREEN is silent.",
    constraints: ["Raw event count thresholds", "No self-referential inflation", "No dental-specific language"],
    owner: "Corey",
    process: {
      steps: [
        "1. Query all active/trial orgs from organizations table",
        "2. For each org, count behavioral_events in last 7 days",
        "3. Classify: >= 3 events = GREEN, 1-2 = AMBER, 0 = RED",
        "4. Write client_health.scored event to behavioral_events",
        "5. Update organizations.client_health_status",
        "6. RED: create dream_team_task if none exists for this org",
        "7. AMBER: write client_monitor.amber_nudge event",
      ],
      deliversTo: "Morning Briefing (daily synthesis), Dream Team task board (RED orgs), CS Agent (health status on org row)",
      deliversFormat: "client_health.scored event with {score, classification, event_count}. RED orgs also get a dream_team_task with priority 'urgent'.",
      triggeredBy: "Scheduler cron: daily at 6 AM PT. Runs before CS Agent and Dreamweaver so health data is fresh.",
      feedbackLoop: "Learning Agent tracks whether RED/AMBER classifications lead to client re-engagement within 7 days. If not, the threshold may need adjustment.",
      successMetric: "100% of active/trial orgs scored. Zero test orgs in results. RED tasks deduplicated correctly.",
    },
    citations: ["Governance Canon v1.0", "Specialist Sentiment Lattice (Retention phase)"],
    lineage: "client_monitor.playbook.2026-04-02.v1.0",
    freshness: "2026-04-02",
  });

  await setPlaybook("cs_agent", {
    purpose: "Daily proactive CS interventions across 4 trigger conditions",
    expectedBehavior: "Detects stalled onboarding, short sessions, feature non-adoption, billing friction. Writes intervention events.",
    constraints: ["Rate limit 1/org/7days", "Billing friction only for trial orgs", "Event type must match CS Coach filter"],
    owner: "Corey",
    process: {
      steps: [
        "1. Query all active/trial orgs",
        "2. Check rate limit: skip if recent CS contact (cs.chat_response or cs.intervention in last 24h)",
        "3. Run 4 trigger checks per org: stalled_onboarding (no GBP after 48h), short_sessions (<10s for 3 days), feature_non_adoption (has rankings, never viewed), billing_friction (trial expiring in 7d)",
        "4. For each triggered intervention, write cs.proactive_intervention event",
        "5. Record through agentRuntime for System Conductor quality gates",
        "6. Close loop with summary for Learning Agent",
      ],
      deliversTo: "CS Coach (weekly pattern analysis), Morning Briefing (daily synthesis), CS team dashboard (intervention cards)",
      deliversFormat: "cs.proactive_intervention event with {trigger_type, message, human_need, retention_value, org_name}. Each intervention includes the biological-economic context.",
      triggeredBy: "Scheduler cron: daily at 7:30 AM PT. Runs after Client Monitor so health data is current.",
      feedbackLoop: "CS Coach analyzes intervention outcomes weekly. If a trigger type consistently fails to drive re-engagement, the threshold or messaging is adjusted.",
      successMetric: "All orgs scanned. Interventions rate-limited correctly. CS Coach successfully reads cs.proactive_intervention events.",
    },
    citations: ["Governance Canon v1.0", "Specialist Sentiment Lattice (Activation/Retention)"],
    lineage: "cs_agent.playbook.2026-04-02.v1.0",
    freshness: "2026-04-02",
  });

  await setPlaybook("dreamweaver", {
    purpose: "Daily hospitality moments that make business owners feel seen",
    expectedBehavior: "Finds one personalized gesture per org from 6 priority-ordered detectors. Max 1 per org per 7 days.",
    constraints: ["Rate limited 1/org/7days", "Must run after Client Monitor", "Never fabricate details"],
    owner: "Corey",
    process: {
      steps: [
        "1. Query all active/trial orgs",
        "2. Check rate limit: skip if dreamweaver.moment_created in last 7 days for this org",
        "3. Run 6 detectors in priority order: milestone achieved, 5-star review, competitor gaining, welcome back, 90-day milestone, referral converted",
        "4. Take the first match (single best moment, don't stack)",
        "5. Adapt tone using toneEvolution based on account age",
        "6. Write to notifications table (user-visible) and behavioral_events (audit trail)",
        "7. Record through agentRuntime for System Conductor quality gates",
      ],
      deliversTo: "Client dashboard notification bell (the owner sees the moment), Morning Briefing (Corey sees what was delivered)",
      deliversFormat: "Notification with title and message, personalized to the specific milestone/review/event. Example: 'You just passed Dr. Peluso in your market. Position #5 to #4. That's momentum.'",
      triggeredBy: "Scheduler cron: daily at 7:15 AM PT. Runs after Client Monitor (needs fresh health data).",
      feedbackLoop: "Learning Agent tracks whether hospitality moments correlate with increased dashboard engagement in the following 7 days.",
      successMetric: "Moments delivered are specific (names the event, names the competitor). Rate limiting prevents fatigue. Tone matches account maturity.",
    },
    citations: ["Knowledge Lattice (Guidara/Unreasonable Hospitality)", "Specialist Sentiment Lattice"],
    lineage: "dreamweaver.playbook.2026-04-02.v1.0",
    freshness: "2026-04-02",
  });

  await setPlaybook("cs_coach", {
    purpose: "Weekly CS pattern analysis from intervention outcomes",
    expectedBehavior: "Analyzes cs.proactive_intervention events, identifies which triggers drive re-engagement, updates playbook.",
    constraints: ["Reads cs.% events (not cs_agent.%)", "Weekly cadence", "Patterns update forward only"],
    owner: "Corey",
    process: {
      steps: [
        "1. Query behavioral_events for cs.% events from last 7 days",
        "2. Group by trigger_type and count outcomes",
        "3. For each trigger type, check if the org re-engaged (new behavioral_events) within 7 days",
        "4. Calculate effectiveness rate per trigger type",
        "5. Write cs_coach.pattern_update event with findings",
        "6. If a trigger type has < 20% effectiveness, flag for review",
      ],
      deliversTo: "Morning Briefing (weekly pattern report), Learning Agent (heuristic calibration)",
      deliversFormat: "cs_coach.pattern_update event with effectiveness rates per trigger type. Example: 'stalled_onboarding: 45% re-engagement, billing_friction: 12% re-engagement (needs review)'",
      triggeredBy: "Scheduler cron: weekly Sunday 8 PM PT",
      feedbackLoop: "Learning Agent uses CS Coach patterns to calibrate CS Agent thresholds. Low-effectiveness triggers get adjusted messaging or timing.",
      successMetric: "Patterns based on real data (not empty because of event type mismatch). At least 3 trigger types analyzed per week.",
    },
    citations: ["Governance Canon v1.0"],
    lineage: "cs_coach.playbook.2026-04-02.v1.0",
    freshness: "2026-04-02",
  });

  // ═══════════════════════════════════════════════════════════════
  // INTELLIGENCE DEPARTMENT
  // ═══════════════════════════════════════════════════════════════

  await setPlaybook("intelligence_agent", {
    purpose: "Daily market intelligence: 3 findings per org using the biological-economic lens",
    expectedBehavior: "Every org with ranking data gets 3 intelligence.finding events naming real competitors, real sources, real dollar figures.",
    constraints: ["Must use biological-economic lens", "No em-dashes", "No fabricated names", "Template fallback when no API key"],
    owner: "Corey",
    process: {
      steps: [
        "1. Query weekly_ranking_snapshots for all orgs with >= 1 snapshot",
        "2. For each org, build context: ranking history, competitor data, referral sources from PMS, case value from vocabulary config",
        "3. If ANTHROPIC_API_KEY set: call Claude with context + heuristics, enforce bio-econ lens in prompt",
        "4. If no API key or Claude fails: generate template findings from ranking data",
        "5. Write 3 intelligence.finding events to behavioral_events per org",
        "6. Record through agentRuntime, close loop with finding count",
      ],
      deliversTo: "Monday Email (top finding becomes the email headline), Morning Briefing (finding summary), Go/No-Go poll (intelligence voter checks for recent findings)",
      deliversFormat: "intelligence.finding event with {headline, detail, humanNeed, economicConsequence}. Example: 'Dr. Peluso gained 12 reviews this month while your count held steady. At $3,200 per case, the referral gap represents $38,400 in annual revenue at risk.'",
      triggeredBy: "Scheduler cron: daily at 12 PM PT. Runs before Monday Email so findings are fresh.",
      feedbackLoop: "Feedback Loop agent measures whether Monday email actions (driven by intelligence findings) moved the needle 7 days later. Findings that drive action get reinforced in heuristics.",
      successMetric: "3 findings per org with ranking data. Each finding names a real competitor or source. Each finding includes humanNeed AND economicConsequence.",
    },
    citations: ["Governance Canon v1.0", "Knowledge Lattice", "Specialist Sentiment Lattice"],
    lineage: "intelligence_agent.playbook.2026-04-02.v1.0",
    freshness: "2026-04-02",
  });

  await setPlaybook("monday_email", {
    purpose: "Weekly intelligence brief delivered Monday morning to every eligible org",
    expectedBehavior: "One email per eligible org. First-week orgs get checkup findings. Normal orgs get ranking + finding + 5-minute fix. Steady-state gets fresh data. Failed deliveries get fallback notification.",
    constraints: ["Referral line only after TTFV", "No em-dashes", "Use vocabulary config terms", "Go/No-Go poll before every send"],
    owner: "Corey",
    process: {
      steps: [
        "1. Prepare agent context through runtime (conflict check, orchestrator)",
        "2. Query all eligible orgs (active, has checkup_score, or onboarding_completed)",
        "3. For each org, run Go/No-Go poll (4 voters: intelligence, score recalc, safety, orchestrator)",
        "4. If any voter says NO_GO, skip this org and log the hold",
        "5. Build email: score delta, top finding, ranking update, competitor note, 5-minute fix, referral line (if TTFV complete)",
        "6. Send via Mailgun. On failure, create fallback notification",
        "7. Record feedback loop outcome (action type, baseline metric)",
        "8. Record through agentRuntime for System Conductor quality gates",
        "9. Close loop with sent/held counts for Learning Agent",
      ],
      deliversTo: "Client inbox (the email itself), notifications table (fallback if email fails), Morning Briefing (send summary), Feedback Loop (outcome tracking)",
      deliversFormat: "HTML email with: score delta line, top finding headline with dollar figure, ranking position update, competitor note, 5-minute fix action, optional referral line, founder signature.",
      triggeredBy: "Scheduler cron: Monday 7 AM PT. Intelligence Agent must have run before this (findings need to be fresh).",
      feedbackLoop: "Feedback Loop agent measures 7 days later: did the recommended action (review requests, GBP optimization, etc.) move the ranking, review count, or score? Results calibrate which action types are most effective.",
      successMetric: "All eligible orgs get an email or a Go/No-Go hold with logged reason. No email contains em-dashes or 'practice'. Every email has a 5-minute fix. Referral line only appears after TTFV.",
    },
    citations: ["Governance Canon v1.0", "Knowledge Lattice (Hormozi/value delivery)", "Specialist Sentiment Lattice"],
    lineage: "monday_email.playbook.2026-04-02.v1.0",
    freshness: "2026-04-02",
  });

  await setPlaybook("morning_briefing", {
    purpose: "Daily synthesis of overnight agent activity for Corey",
    expectedBehavior: "One page summary: what happened, what needs attention, what decisions are pending.",
    constraints: ["Read-only aggregation", "No actions, only synthesis", "Include Agent Auditor findings"],
    owner: "Corey",
    process: {
      steps: [
        "1. Query behavioral_events from last 24 hours, grouped by event_type",
        "2. Synthesize: client health changes, intelligence findings produced, interventions triggered, moments delivered, emails sent/held",
        "3. Include Agent Auditor findings (critical/warning items)",
        "4. Include Canon status: expiring verdicts, failed simulations",
        "5. Include circuit breaker and kill switch status",
        "6. Compile into structured brief with sections: Overnight Activity, Needs Attention, Decisions Pending",
        "7. Write morning_briefing.delivered event",
      ],
      deliversTo: "Corey's VisionaryView dashboard (push notification), email (optional), Corey's Personal Agent (context for daily priorities)",
      deliversFormat: "Structured brief: '5 agents ran overnight. Client Monitor scored 33 orgs (2 RED). Intelligence Agent produced 9 findings. CS Agent generated 4 interventions. Agent Auditor found 1 warning: CS Coach Canon expiring in 12 days.'",
      triggeredBy: "Scheduler cron: daily at 6:30 AM PT. Runs after Client Monitor and Intelligence Agent so data is fresh.",
      feedbackLoop: "Track whether Corey acts on briefing items. Items that are consistently dismissed may indicate noise. Items consistently acted on indicate high-value signals.",
      successMetric: "Briefing delivered by 6:30 AM PT. All overnight agent activity summarized. Critical Auditor findings highlighted. No stale data (everything from last 24h).",
    },
    citations: ["Governance Canon v1.0"],
    lineage: "morning_briefing.playbook.2026-04-02.v1.0",
    freshness: "2026-04-02",
  });

  await setPlaybook("competitive_scout", {
    purpose: "Weekly competitor GBP scanning across all client markets",
    expectedBehavior: "Detects competitor changes (new reviews, rating shifts, photo additions, category changes) and writes competitor.movement events.",
    constraints: ["Internal only (competitor names never in client-facing output unless requested)", "Must use real GBP data"],
    owner: "Corey",
    process: {
      steps: [
        "1. Query all orgs with practice_rankings data",
        "2. For each org, pull latest competitor list from rankings",
        "3. Compare current GBP state against last known state (review count, rating, photos)",
        "4. Write competitor.movement event for each detected change",
        "5. Flag significant movements (competitor gained 10+ reviews, rating jumped 0.5+)",
      ],
      deliversTo: "Intelligence Agent (enriches findings with competitor context), Monday Email (competitor note section), Dreamweaver (competitor.movement with direction='client_gaining' triggers a moment)",
      deliversFormat: "competitor.movement event with {competitor_name, direction, metric, delta}. Example: 'Peluso Orthodontics gained 8 reviews (direction: competitor_gaining, metric: review_count, delta: 8)'",
      triggeredBy: "Scheduler cron: daily at 9 AM PT",
      feedbackLoop: "Intelligence Agent uses competitor data to produce more specific findings. If competitor data is stale, intelligence findings become generic.",
      successMetric: "All competitors tracked for all clients. Changes detected within 24 hours of occurring on GBP.",
    },
    citations: ["Governance Canon v1.0", "Agent Trust Protocol (competitor names internal only)"],
    lineage: "competitive_scout.playbook.2026-04-02.v1.0",
    freshness: "2026-04-02",
  });

  await setPlaybook("learning_agent", {
    purpose: "Weekly heuristic calibration from outcome data",
    expectedBehavior: "Measures which agent outputs drove real improvement. Updates heuristics for all agents.",
    constraints: ["Heuristic updates propagate forward only", "Never retroactively modify delivered outputs"],
    owner: "Corey",
    process: {
      steps: [
        "1. Query loop.closed events from last 7 days",
        "2. For each closed loop, check: did the expected outcome match the actual outcome?",
        "3. Query feedback_outcomes: which Monday email action types drove metric improvements?",
        "4. Aggregate compound rate: what percentage of agent actions led to measurable client improvement?",
        "5. Write learning.calibration event with updated heuristic weights",
        "6. Flag any agent with consistently failed loops for CS Coach review",
      ],
      deliversTo: "All agents via Knowledge Bridge (updated heuristics appear in prepareAgentContext), Morning Briefing (compound rate report), CS Coach (failed loop patterns)",
      deliversFormat: "learning.calibration event with {compound_rate, top_performing_actions, underperforming_actions, heuristic_updates}",
      triggeredBy: "Scheduler cron: weekly Sunday 11 PM PT. End-of-week synthesis.",
      feedbackLoop: "Self-referential: the Learning Agent's own calibrations are measured for accuracy. If a heuristic update leads to worse outcomes, the next calibration corrects it.",
      successMetric: "Compound rate trending upward week over week. At least 3 heuristic updates per cycle. No retroactive modifications to delivered outputs.",
    },
    citations: ["Governance Canon v1.0", "Agent Trust Protocol (heuristics propagate forward only)"],
    lineage: "learning_agent.playbook.2026-04-02.v1.0",
    freshness: "2026-04-02",
  });

  // ═══════════════════════════════════════════════════════════════
  // CONTENT + AEO DEPARTMENT
  // ═══════════════════════════════════════════════════════════════

  await setPlaybook("cmo_agent", {
    purpose: "Weekly content strategy: briefs, topics, messaging guidance for all client verticals",
    expectedBehavior: "Produces content briefs based on intelligence findings, competitor gaps, and seasonal trends.",
    constraints: ["Universal language (not dental-specific)", "Content must serve undeniable value north star"],
    owner: "Corey",
    process: {
      steps: [
        "1. Query intelligence.finding events from last 7 days across all orgs",
        "2. Identify common themes (competitors gaining reviews, referral drift, ranking changes)",
        "3. Cross-reference with Knowledge Lattice for content frameworks (Hormozi value equation, Guidara hospitality angles)",
        "4. Generate content briefs: topic, angle, target audience, keywords, distribution channels",
        "5. Write briefs to agent_results for dashboard visibility",
        "6. Flag high-priority topics that align with competitive gaps",
      ],
      deliversTo: "Ghost Writer (drafts content from briefs), Programmatic SEO Agent (identifies keyword gaps), Content Performance (measures brief-to-publish pipeline)",
      deliversFormat: "Content brief with {topic, angle, targetAudience, keywords, suggestedChannels, priority, rationale}. Example: 'Topic: Why Your Best Referral Sources Go Cold. Angle: Hormozi value equation applied to referral relationships. Priority: High (3 orgs showing referral drift this week).'",
      triggeredBy: "Scheduler cron: weekly Monday at 5 AM PT. Runs before Monday Email so content strategy is aligned with client intelligence.",
      feedbackLoop: "Content Performance agent measures which published content drives traffic, engagement, and conversions. High-performing topics inform next week's briefs.",
      successMetric: "At least 3 content briefs per week. Each brief tied to a real intelligence finding. Topics diversified across verticals (not all dental).",
    },
    citations: ["Knowledge Lattice (Hormozi, Guidara)", "Governance Canon v1.0"],
    lineage: "cmo_agent.playbook.2026-04-02.v1.0",
    freshness: "2026-04-02",
  });

  await setPlaybook("content_performance", {
    purpose: "Weekly content ROI tracking across all published content",
    expectedBehavior: "Measures which content drives traffic, engagement, and client acquisition. Reports attribution.",
    constraints: ["Data-driven only, no fabricated metrics", "Attribution must be traceable"],
    owner: "Corey",
    process: {
      steps: [
        "1. Query GA4 data for all published content pages (traffic, time on page, bounce rate)",
        "2. Query GSC data for search impressions and clicks per content URL",
        "3. Cross-reference with conversion events (checkup starts, signups) for attribution",
        "4. Calculate ROI per content piece: cost (LLM tokens) vs value (attributed signups * LTV)",
        "5. Write content_performance.report event with top/bottom performers",
        "6. Feed results back to CMO Agent for next week's briefs",
      ],
      deliversTo: "CMO Agent (which topics work), Morning Briefing (content ROI summary), VisionaryView (content pipeline health)",
      deliversFormat: "content_performance.report with {topPerformers, underperformers, totalTraffic, attributedConversions, roi}",
      triggeredBy: "Scheduler cron: weekly Sunday at 8:30 AM PT",
      feedbackLoop: "CMO Agent uses performance data to prioritize next week's topics. Underperforming content types get deprioritized.",
      successMetric: "All published content measured. Attribution traceable to signup events. ROI calculated per piece.",
    },
    citations: ["Governance Canon v1.0"],
    lineage: "content_performance.playbook.2026-04-02.v1.0",
    freshness: "2026-04-02",
  });

  await setPlaybook("aeo_monitor", {
    purpose: "Weekly AI search presence monitoring across ChatGPT, Grok, Claude",
    expectedBehavior: "Tracks how AI engines reference client businesses. Flags citation gaps.",
    constraints: ["Must use real AI search queries, not fabricated results"],
    owner: "Corey",
    process: {
      steps: [
        "1. For each org, query AI search engines with relevant queries (e.g., 'best endodontist in [city]')",
        "2. Check if client business is mentioned in AI responses",
        "3. Compare against competitors mentioned in same responses",
        "4. Flag gaps: competitors mentioned but client is not",
        "5. Write findings to agent_results and behavioral_events",
      ],
      deliversTo: "CMO Agent (content gaps to fill for AI visibility), Intelligence Agent (AI presence as a ranking factor), Monday Email (AEO citation as a finding when relevant)",
      deliversFormat: "AEO report with {queriesTested, clientMentions, competitorMentions, gapsIdentified}",
      triggeredBy: "Scheduler cron: daily at 8 AM PT",
      feedbackLoop: "Track whether content published in response to AEO gaps leads to increased AI citations in subsequent weeks.",
      successMetric: "All client markets scanned. Citation gaps identified with specific queries. No fabricated search results.",
    },
    citations: ["Governance Canon v1.0"],
    lineage: "aeo_monitor.playbook.2026-04-02.v1.0",
    freshness: "2026-04-02",
  });

  // ═══════════════════════════════════════════════════════════════
  // OPERATIONS + GOVERNANCE
  // ═══════════════════════════════════════════════════════════════

  await setPlaybook("nothing_gets_lost", {
    purpose: "Daily orphan scan for unreferenced documents, stale data, broken links",
    expectedBehavior: "Finds things that fell through the cracks. Creates cleanup tasks.",
    constraints: ["Append-only access logs", "Cannot delete documents, only flag them"],
    owner: "Corey",
    process: {
      steps: [
        "1. Scan agent_results for outputs older than 90 days with no downstream reference",
        "2. Scan behavioral_events for event_types that no agent consumes (using EVENT_CONSUMERS registry)",
        "3. Scan dream_team_tasks for overdue items with no status update in 14+ days",
        "4. Check knowledge_access_events for Canon documents not accessed in 90 days",
        "5. Write findings to behavioral_events and create cleanup tasks if critical",
      ],
      deliversTo: "Morning Briefing (orphan count), Dream Team task board (cleanup tasks), Agent Auditor (data integrity signal)",
      deliversFormat: "Orphan report with {orphanDocuments, staleEvents, overdueTasks, unusedCanonPages}",
      triggeredBy: "Scheduler cron: daily at 10 PM PT (end of day cleanup)",
      feedbackLoop: "Track whether flagged orphans get resolved. Persistent orphans indicate a systemic gap in the agent pipeline.",
      successMetric: "All data sources scanned. Orphans flagged within 24 hours of creation. Zero false positives (real orphans only).",
    },
    citations: ["Governance Canon v1.0", "Knowledge Graph Protocol"],
    lineage: "nothing_gets_lost.playbook.2026-04-02.v1.0",
    freshness: "2026-04-02",
  });

  await setPlaybook("bug_triage", {
    purpose: "Daily error log analysis and automated task creation for critical bugs",
    expectedBehavior: "Scans error logs, classifies severity, creates tasks for P0/P1, groups related errors.",
    constraints: ["P0 response time < 1 hour", "Never auto-close bugs"],
    owner: "Dave",
    process: {
      steps: [
        "1. Query application error logs from last 24 hours",
        "2. Group errors by stack trace signature (deduplicate)",
        "3. Classify severity: P0 (client-facing, data loss), P1 (client-facing, degraded), P2 (internal), P3 (cosmetic)",
        "4. P0/P1: create dream_team_task with priority 'urgent', assigned to Dave",
        "5. P2/P3: create dream_team_task with priority 'normal'",
        "6. Write bug_triage findings to behavioral_events",
      ],
      deliversTo: "Dream Team task board (bug tasks), Dave's Personal Agent (P0 alerts), Morning Briefing (error count summary)",
      deliversFormat: "Bug task with {severity, errorSignature, occurrenceCount, affectedEndpoint, suggestedFix}",
      triggeredBy: "Scheduler cron: daily at 10 AM PT",
      feedbackLoop: "Track time-to-resolution per severity level. If P0s consistently take > 24h, escalate to Corey.",
      successMetric: "All errors triaged within 24h. P0s create tasks immediately. No duplicate bug tasks for same error signature.",
    },
    citations: ["Governance Canon v1.0"],
    lineage: "bug_triage.playbook.2026-04-02.v1.0",
    freshness: "2026-04-02",
  });

  await setPlaybook("agent_auditor", {
    purpose: "Daily system health audit of all agents",
    expectedBehavior: "Checks broken (event mismatches, quarantined agents), drifting (Canon expiry, stale schedules), missing (no handler, no Canon). Every finding includes how to fix it.",
    constraints: ["Every finding must include a fix instruction", "Severity: critical/warning/info"],
    owner: "Corey",
    process: {
      steps: [
        "1. CHECK BROKEN: scan event types for unknown/orphan events, check circuit breakers, check quarantined agents",
        "2. CHECK DRIFTING: find Canon verdicts expiring within 14 days, find agents that haven't run in 48h+, measure System Conductor hold rate",
        "3. CHECK MISSING: identity defs with no handler, schedule rows with no handler, dream team nodes with no code, agents with no Canon governance",
        "4. Write each finding to behavioral_events with severity, title, detail, and fix instruction",
        "5. Record through agentRuntime for dashboard visibility",
      ],
      deliversTo: "Morning Briefing (critical findings highlighted), Canon Banner (governance status), Agent Identity panel (quarantine alerts)",
      deliversFormat: "agent_auditor.finding event with {check, severity, title, detail, fix, affected_agent}. Every finding tells you what's wrong, why it matters, and exactly how to fix it.",
      triggeredBy: "Scheduler cron: daily at 11 PM PT. Runs last so it can audit the full day's activity.",
      feedbackLoop: "Track whether audit findings get resolved. Persistent findings indicate systemic issues. Resolved findings validate the fix instructions.",
      successMetric: "All agents audited. Zero false-positive critical findings. Every finding has an actionable fix instruction.",
    },
    citations: ["Governance Canon v1.0", "Agent Build Playbook v1.0"],
    lineage: "agent_auditor.playbook.2026-04-02.v1.0",
    freshness: "2026-04-02",
  });

  // ═══════════════════════════════════════════════════════════════
  // FINANCIAL + GROWTH
  // ═══════════════════════════════════════════════════════════════

  await setPlaybook("cfo_agent", {
    purpose: "Monthly financial projections, cost analysis, and revenue health scoring",
    expectedBehavior: "Produces financial report with MRR trends, burn rate, runway, and per-client economics.",
    constraints: ["All dollar figures require CFO review before delivery", "Use editable config values, never hardcoded"],
    owner: "Corey",
    process: {
      steps: [
        "1. Query organizations for active subscribers and their subscription tiers",
        "2. Calculate MRR from live Stripe data or subscription records",
        "3. Pull burn rate and tier pricing from business_config (editable, not hardcoded)",
        "4. Calculate per-client metrics: ARPU, LTV, CAC ratio",
        "5. Project runway at current burn rate",
        "6. Write financial report to agent_results",
      ],
      deliversTo: "VisionaryView (MRR and burn rate cards), Morning Briefing (monthly financial summary), Corey's Personal Agent (financial health context)",
      deliversFormat: "Financial report with {mrr, burn_rate, runway_months, arpu, ltv, clientCount, projections_30_90_365}",
      triggeredBy: "Scheduler cron: weekly Monday at 4 AM PT (financial health check), monthly deep analysis on 1st",
      feedbackLoop: "Compare projections against actuals monthly. Adjust projection models based on variance.",
      successMetric: "MRR matches Stripe actuals. Burn rate pulled from config (not hardcoded). Projections within 10% of actuals.",
    },
    citations: ["Governance Canon v1.0", "Agent Trust Protocol (CFO review required)"],
    lineage: "cfo_agent.playbook.2026-04-02.v1.0",
    freshness: "2026-04-02",
  });

  await setPlaybook("conversion_optimizer", {
    purpose: "Weekly funnel analysis: where prospects drop off, what converts, what to test",
    expectedBehavior: "Analyzes checkup-to-signup funnel, identifies drop-off points, proposes A/B tests.",
    constraints: ["Data-driven only", "A/B test proposals require Corey approval"],
    owner: "Corey",
    process: {
      steps: [
        "1. Query checkup funnel events: page views, scan starts, score reveals, account creations",
        "2. Calculate conversion rate at each step",
        "3. Identify biggest drop-off point",
        "4. Compare against historical baselines",
        "5. Generate A/B test proposals for the weakest funnel step",
        "6. Write analysis to agent_results and behavioral_events",
      ],
      deliversTo: "VisionaryView (funnel health), Morning Briefing (conversion summary), Experiment Lab (A/B test proposals)",
      deliversFormat: "Funnel report with {stepConversionRates, biggestDropOff, weekOverWeekChange, proposedTests}",
      triggeredBy: "Scheduler cron: weekly Tuesday at 5 AM PT",
      feedbackLoop: "Track A/B test results. Winning variants become the default. Losing variants inform the next hypothesis.",
      successMetric: "All funnel steps measured. Drop-off point identified with specific percentage. At least 1 A/B test proposal per week.",
    },
    citations: ["Governance Canon v1.0"],
    lineage: "conversion_optimizer.playbook.2026-04-02.v1.0",
    freshness: "2026-04-02",
  });

  // ═══════════════════════════════════════════════════════════════
  // PERSONAL AGENTS
  // ═══════════════════════════════════════════════════════════════

  await setPlaybook("corey_agent", {
    purpose: "Daily brief for Corey: revenue, decisions, priorities, client pulse",
    expectedBehavior: "One-page daily brief synthesized from all agent outputs, focused on what Corey needs to decide or act on.",
    constraints: ["Never tell Corey to rest", "Lead with decisions, not data", "Include Sophie-test filter"],
    owner: "Corey",
    process: {
      steps: [
        "1. Pull Morning Briefing synthesis (agent activity, client health, audit findings)",
        "2. Pull CFO Agent financials (MRR, burn, runway)",
        "3. Pull Client Monitor RED orgs (churn risk)",
        "4. Pull pending decisions from dream_team_tasks assigned to Corey",
        "5. Prioritize: revenue-impacting items first, then client health, then strategic",
        "6. Format as actionable brief: 'Decide X. Review Y. FYI Z.'",
      ],
      deliversTo: "Corey's inbox or dashboard push notification. The product comes to him.",
      deliversFormat: "Structured brief: 'MRR: $13,500 (+$997 Artful). 2 RED orgs need attention. Canon: CS Agent expiring in 12 days. Decision needed: approve A/B test on checkup funnel.'",
      triggeredBy: "Scheduler cron: daily at 6 AM PT",
      feedbackLoop: "Track which brief items Corey acts on vs dismisses. Deprioritize consistently dismissed categories.",
      successMetric: "Brief delivered by 6 AM. All revenue-impacting items included. No surprises (everything flagged before Corey discovers it himself).",
    },
    citations: ["Governance Canon v1.0"],
    lineage: "corey_agent.playbook.2026-04-02.v1.0",
    freshness: "2026-04-02",
  });

  await setPlaybook("jo_agent", {
    purpose: "Daily brief for Jo: client health, ops tasks, flags that need her attention",
    expectedBehavior: "One-glance status board: all green = back to baby. Red flags = here's what needs you.",
    constraints: ["Status boards not paragraphs", "All green means nothing needs attention", "Due October 9"],
    owner: "Jo",
    process: {
      steps: [
        "1. Pull Client Monitor health statuses (count by GREEN/AMBER/RED)",
        "2. Pull dream_team_tasks assigned to Jo or System (open, in_progress, overdue)",
        "3. Pull flagged issues from bug_triage (client-facing P0/P1)",
        "4. Format as status board: counts, not details. Expand only what's RED.",
        "5. Deliver as dashboard card or notification",
      ],
      deliversTo: "IntegratorView dashboard. One glance, all green, back to baby.",
      deliversFormat: "Status board: 'Clients: 28 GREEN, 3 AMBER, 2 RED. Tasks: 4 open, 1 overdue. Bugs: 0 P0, 1 P1. Flags: CS Agent Canon expiring.'",
      triggeredBy: "Scheduler cron: daily at 6 AM PT",
      feedbackLoop: "Track which flags Jo acts on. Items she consistently handles could be automated.",
      successMetric: "Jo can assess all-clear in < 10 seconds. RED items have specific org names and actions.",
    },
    citations: ["Governance Canon v1.0"],
    lineage: "jo_agent.playbook.2026-04-02.v1.0",
    freshness: "2026-04-02",
  });

  await setPlaybook("dave_agent", {
    purpose: "Daily brief for Dave: deploy status, errors, infrastructure task queue",
    expectedBehavior: "One page with exact commands and status. Async-first. No rough ideas.",
    constraints: ["One page always accurate always final", "Exact commands not rough ideas", "Async-first"],
    owner: "Dave",
    process: {
      steps: [
        "1. Check CI/CD pipeline status (last deploy, success/failure)",
        "2. Pull bug_triage P0/P1 tasks assigned to Dave",
        "3. Pull dream_team_tasks assigned to Dave (open, in_progress)",
        "4. Check infrastructure health: Redis, PostgreSQL, BullMQ, Sentry",
        "5. Format as command list: 'Run X. Check Y. Deploy Z.'",
      ],
      deliversTo: "Dave's task page in Notion (single source of truth). One page. Always current.",
      deliversFormat: "Task list: '1. Run knex migrate:latest on sandbox (3 pending). 2. Check Redis memory usage (approaching limit). 3. Review PR #47 (CS Coach event type fix).'",
      triggeredBy: "Scheduler cron: daily at 6 AM PT (Dave's timezone: Philippines, 9 PM)",
      feedbackLoop: "Track task completion rate. If Dave consistently has > 5 open tasks, flag capacity issue to Corey.",
      successMetric: "All infrastructure issues surfaced. Exact commands provided. No rough ideas or half-baked proposals.",
    },
    citations: ["Governance Canon v1.0"],
    lineage: "dave_agent.playbook.2026-04-02.v1.0",
    freshness: "2026-04-02",
  });
}

export async function down(knex: Knex): Promise<void> {
  // No destructive rollback: playbooks are additive to canon_spec
  // Rolling back would require restoring the previous canon_spec for each agent
  // which is not practical. The playbook fields are harmless if unused.
}
