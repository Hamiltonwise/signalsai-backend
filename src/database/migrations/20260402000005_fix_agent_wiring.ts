/**
 * Fix Agent System Wiring
 *
 * Three problems fixed:
 * 1. dream_team_nodes.agent_key uses camelCase, registry uses snake_case.
 *    Dashboard computeAgentHealth can't match them. All agents show "gray."
 * 2. Missing schedule rows for critical agents (monday_email, intelligence_agent,
 *    rankings_intelligence, feedback_loop, proofline already have schedules but
 *    some agents that SHOULD run have no cron row).
 * 3. agent_identities.agent_key not populated for most agents (Canon gate check
 *    needs this to bridge schedules.agent_key to identity slugs).
 */

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // ═══════════════════════════════════════════════════════════════════
  // 1. Fix dream_team_nodes agent_key: camelCase -> snake_case
  // ═══════════════════════════════════════════════════════════════════

  const hasNodes = await knex.schema.hasTable("dream_team_nodes");
  if (hasNodes) {
    const keyFixes: Record<string, string> = {
      // camelCase (current) -> snake_case (matches registry)
      "contentPerformance": "content_performance",
      "programmaticSEO": "programmatic_seo",
      "aeoMonitor": "aeo_monitor",
      "ghostWriter": "ghost_writer",
      "podcastScout": "podcast_scout",
      "conversionOptimizer": "conversion_optimizer",
      "competitiveScout": "competitive_scout",
      "marketSignalScout": "market_signal_scout",
      "clientMonitor": "client_monitor",
      "csExpander": "cs_expander",
      "csAgent": "cs_agent",
      "week1Win": "week1_win",
      "trialEmail": "trial_email",
      "intelligenceAgent": "intelligence_agent",
      "morningBriefing": "morning_briefing",
      "learningAgent": "learning_agent",
      "technologyHorizon": "technology_horizon",
      "strategicIntelligence": "strategic_intelligence",
      "bugTriage": "bug_triage",
      "nothingGetsLost": "nothing_gets_lost",
      "foundationOperations": "foundation_operations",
      "cfoAgent": "cfo_agent",
      "cloAgent": "clo_agent",
      "cpaPersonal": "cpa_personal",
      "financialAdvisor": "financial_advisor",
      "humanDeploymentScout": "human_deployment_scout",
      "verticalReadiness": "vertical_readiness",
      "trendScout": "trend_scout",
      "realEstateAgent": "real_estate_agent",
    };

    for (const [oldKey, newKey] of Object.entries(keyFixes)) {
      await knex("dream_team_nodes")
        .where({ agent_key: oldKey })
        .update({ agent_key: newKey });
    }

    // Also fix the Dreamweaver node which has null agent_key
    await knex("dream_team_nodes")
      .where({ role_title: "Dreamweaver Agent" })
      .whereNull("agent_key")
      .update({ agent_key: "dreamweaver" });

    // Fix CS Coach node (parent node, also needs agent_key)
    await knex("dream_team_nodes")
      .where({ role_title: "CS Coach Agent" })
      .whereNull("agent_key")
      .update({ agent_key: "cs_coach" });

    // Fix CMO Agent node
    await knex("dream_team_nodes")
      .where({ role_title: "CMO Agent" })
      .whereNull("agent_key")
      .update({ agent_key: "cmo_agent" });

    // Fix System Conductor node
    await knex("dream_team_nodes")
      .where({ role_title: "System Conductor Agent" })
      .whereNull("agent_key")
      .update({ agent_key: "system_conductor" });
  }

  // ═══════════════════════════════════════════════════════════════════
  // 2. Populate agent_identities.agent_key for all agents
  //    (bridges schedules.agent_key to identity.slug for Canon gate)
  // ═══════════════════════════════════════════════════════════════════

  const hasIdentities = await knex.schema.hasTable("agent_identities");
  if (hasIdentities) {
    // For most agents, agent_key = slug minus _agent suffix
    // But we need to match the ACTUAL registry keys
    const identityKeyMap: Record<string, string> = {
      "intelligence_agent": "intelligence_agent",
      "competitive_scout": "competitive_scout",
      "aeo_monitor": "aeo_monitor",
      "market_signal_scout": "market_signal_scout",
      "proofline_agent": "proofline",  // slug != registry key
      "cmo_agent": "cmo_agent",
      "content_performance": "content_performance",
      "ghost_writer": "ghost_writer",
      "programmatic_seo": "programmatic_seo",
      "nothing_gets_lost": "nothing_gets_lost",
      "bug_triage": "bug_triage",
      "technology_horizon": "technology_horizon",
      "client_monitor": "client_monitor",
      "cs_agent": "cs_agent",
      "cs_coach": "cs_coach",
      "dreamweaver": "dreamweaver",
      "monday_email": "monday_email",
      "conversion_optimizer": "conversion_optimizer",
      "learning_agent": "learning_agent",
      "cfo_agent": "cfo_agent",
      "system_conductor": "system_conductor",
      "clo_agent": "clo_agent",
      "morning_briefing": "morning_briefing",
      "corey_agent": "corey_agent",
      "jo_agent": "jo_agent",
      "dave_agent": "dave_agent",
      "agent_auditor": "agent_auditor",
    };

    for (const [slug, agentKey] of Object.entries(identityKeyMap)) {
      await knex("agent_identities")
        .where({ slug })
        .whereNull("agent_key")
        .update({ agent_key: agentKey });
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // 3. Add missing schedule rows for agents that have handlers
  //    but no cron entry (idempotent: check before insert)
  // ═══════════════════════════════════════════════════════════════════

  const hasSchedules = await knex.schema.hasTable("schedules");
  if (hasSchedules) {
    const missingSchedules = [
      { agent_key: "intelligence_agent", display_name: "Intelligence Agent", cron: "0 12 * * *", desc: "Daily market intelligence (3 findings per org)" },
      { agent_key: "cs_coach", display_name: "CS Coach", cron: "0 3 * * 0", desc: "Weekly CS pattern analysis and training" },
      { agent_key: "cs_expander", display_name: "CS Expander", cron: "30 7 * * *", desc: "Daily expansion opportunity detection" },
      { agent_key: "cmo_agent", display_name: "CMO Agent", cron: "0 5 * * 1", desc: "Weekly content briefs and topic recommendations" },
      { agent_key: "cfo_agent", display_name: "CFO Agent", cron: "0 4 * * 1", desc: "Monthly financial projections and cost analysis" },
      { agent_key: "weekly_digest", display_name: "Weekly Digest", cron: "0 14 * * 5", desc: "Friday summary of the week" },
      { agent_key: "strategic_intelligence", display_name: "Strategic Intelligence", cron: "0 5 * * 3", desc: "Weekly strategic signals" },
      { agent_key: "vertical_readiness", display_name: "Vertical Readiness", cron: "0 3 * * 3", desc: "Weekly vertical expansion readiness" },
      { agent_key: "human_deployment_scout", display_name: "Human Deployment Scout", cron: "0 3 * * 4", desc: "Weekly hiring signal detection" },
      { agent_key: "podcast_scout", display_name: "Podcast Scout", cron: "0 3 * * 5", desc: "Weekly podcast opportunity detection" },
      { agent_key: "trend_scout", display_name: "Trend Scout", cron: "0 5 * * 5", desc: "Weekly trend detection" },
      { agent_key: "real_estate_agent", display_name: "Real Estate Agent", cron: "0 3 * * 6", desc: "Weekly real estate market scan" },
      { agent_key: "foundation_operations", display_name: "Foundation Operations", cron: "0 3 * * 1", desc: "Weekly foundation ops check" },
      { agent_key: "agent_auditor", display_name: "Agent Auditor", cron: "0 23 * * *", desc: "Daily agent system health audit: broken, drifting, missing" },
    ];

    for (const sched of missingSchedules) {
      const exists = await knex("schedules")
        .where({ agent_key: sched.agent_key })
        .first();

      if (!exists) {
        await knex("schedules").insert({
          agent_key: sched.agent_key,
          display_name: sched.display_name,
          description: sched.desc,
          schedule_type: "cron",
          cron_expression: sched.cron,
          interval_days: null,
          timezone: "America/Los_Angeles",
          enabled: true,
          next_run_at: new Date(),
        });
      }
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  // Revert dream_team_nodes keys to camelCase
  const hasNodes = await knex.schema.hasTable("dream_team_nodes");
  if (hasNodes) {
    const keyReverts: Record<string, string> = {
      "content_performance": "contentPerformance",
      "programmatic_seo": "programmaticSEO",
      "aeo_monitor": "aeoMonitor",
      "ghost_writer": "ghostWriter",
      "podcast_scout": "podcastScout",
      "conversion_optimizer": "conversionOptimizer",
      "competitive_scout": "competitiveScout",
      "market_signal_scout": "marketSignalScout",
      "client_monitor": "clientMonitor",
      "cs_expander": "csExpander",
      "cs_agent": "csAgent",
      "week1_win": "week1Win",
      "trial_email": "trialEmail",
      "intelligence_agent": "intelligenceAgent",
      "morning_briefing": "morningBriefing",
      "learning_agent": "learningAgent",
      "technology_horizon": "technologyHorizon",
      "strategic_intelligence": "strategicIntelligence",
      "bug_triage": "bugTriage",
      "nothing_gets_lost": "nothingGetsLost",
      "foundation_operations": "foundationOperations",
      "cfo_agent": "cfoAgent",
      "clo_agent": "cloAgent",
      "cpa_personal": "cpaPersonal",
      "financial_advisor": "financialAdvisor",
      "human_deployment_scout": "humanDeploymentScout",
      "vertical_readiness": "verticalReadiness",
      "trend_scout": "trendScout",
      "real_estate_agent": "realEstateAgent",
    };

    for (const [newKey, oldKey] of Object.entries(keyReverts)) {
      await knex("dream_team_nodes")
        .where({ agent_key: newKey })
        .update({ agent_key: oldKey });
    }
  }

  // Remove added schedule rows
  const hasSchedules = await knex.schema.hasTable("schedules");
  if (hasSchedules) {
    const addedKeys = [
      "intelligence_agent", "cs_coach", "cs_expander", "cmo_agent",
      "cfo_agent", "weekly_digest", "strategic_intelligence",
      "vertical_readiness", "human_deployment_scout", "podcast_scout",
      "trend_scout", "real_estate_agent", "foundation_operations",
    ];
    await knex("schedules").whereIn("agent_key", addedKeys).del();
  }

  // Clear agent_key on agent_identities
  const hasIdentities = await knex.schema.hasTable("agent_identities");
  if (hasIdentities) {
    await knex("agent_identities")
      .whereNotNull("agent_key")
      .update({ agent_key: null });
  }
}
