/**
 * Fix Gray Dot Nodes on Dream Team Board
 *
 * 24 org chart nodes had no agent_key, showing as gray dots.
 * - 4 are human nodes (Corey, Jo, Dave, Alloro Inc) -- correct, no agent_key needed
 * - 10 have real agent code backing them -- wire agent_key
 * - 10 are aspirational placeholders with no code -- deactivate (is_active = false)
 *
 * Also: wire agent_key in agent_identities for agents that were seeded with null.
 */

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // ── Step 1: Wire agent_key for nodes that have real code ──

  const agentKeyMappings: { role_title: string; agent_key: string }[] = [
    { role_title: "AEO Writer Agent", agent_key: "aeo_monitor" },
    { role_title: "Competitor Monitor Agent", agent_key: "competitive_scout" },
    { role_title: "Script Writer Agent", agent_key: "script_writer" },
    { role_title: "Website Copy Agent", agent_key: "website_copy" },
    { role_title: "PatientPath Research Agent", agent_key: "patientpath_research" },
    { role_title: "PatientPath Copy Agent", agent_key: "patientpath_copy" },
    { role_title: "Safety Agent", agent_key: "safety_agent" },
    { role_title: "Human Authenticity Agent", agent_key: "human_authenticity" },
    { role_title: "Finance Monitor Agent", agent_key: "cfo_agent" },
    { role_title: "Outreach Agent", agent_key: "outreach_engine" },
  ];

  for (const { role_title, agent_key } of agentKeyMappings) {
    await knex("dream_team_nodes")
      .where({ role_title })
      .whereNull("agent_key")
      .update({ agent_key, updated_at: new Date() });
  }

  // ── Step 2: Deactivate aspirational nodes with no code ──

  const aspirationalRoles = [
    "Distribution Agent",
    "Follow-Up Agent",
    "Onboarding Agent",
    "Retention Alert Agent",
    "Intelligence Director Agent",
    "Product Director Agent",
    "Spec Writer Agent",
    "Operations Director Agent",
    "IT Agent",
    "Video Script Agent",
  ];

  for (const role_title of aspirationalRoles) {
    await knex("dream_team_nodes")
      .where({ role_title })
      .whereNull("agent_key")
      .update({ is_active: false, updated_at: new Date() });
  }

  // ── Step 3: Wire agent_key in agent_identities for agents that were null ──

  const identityKeyMappings: { display_name: string; agent_key: string }[] = [
    { display_name: "AEO Monitor", agent_key: "aeo_monitor" },
    { display_name: "Competitive Scout", agent_key: "competitive_scout" },
    { display_name: "Ghost Writer", agent_key: "ghost_writer" },
    { display_name: "Programmatic SEO Agent", agent_key: "programmatic_seo" },
    { display_name: "Technology Horizon", agent_key: "technology_horizon" },
    { display_name: "Market Signal Scout", agent_key: "market_signal_scout" },
    { display_name: "Strategic Intelligence", agent_key: "strategic_intelligence" },
    { display_name: "System Conductor", agent_key: "system_conductor" },
    { display_name: "Trend Scout", agent_key: "trend_scout" },
    { display_name: "CFO Agent", agent_key: "cfo_agent" },
    { display_name: "CS Expander", agent_key: "cs_expander" },
    { display_name: "Morning Briefing", agent_key: "morning_briefing" },
    { display_name: "Learning Agent", agent_key: "learning_agent" },
    { display_name: "CMO Agent", agent_key: "cmo_agent" },
    { display_name: "Content Performance", agent_key: "content_performance" },
    { display_name: "Bug Triage", agent_key: "bug_triage" },
    { display_name: "Agent Auditor", agent_key: "agent_auditor" },
    { display_name: "Conversion Optimizer", agent_key: "conversion_optimizer" },
    { display_name: "Proofline Agent", agent_key: "proofline_agent" },
    { display_name: "Practice Ranking", agent_key: "practice_ranking" },
    { display_name: "Rankings Intelligence", agent_key: "rankings_intelligence" },
    { display_name: "CS Coach", agent_key: "cs_coach" },
    { display_name: "Week 1 Win", agent_key: "week1_win" },
    { display_name: "Feedback Loop", agent_key: "feedback_loop" },
    { display_name: "Vertical Readiness", agent_key: "vertical_readiness" },
    { display_name: "Human Deployment Scout", agent_key: "human_deployment_scout" },
    { display_name: "Podcast Scout", agent_key: "podcast_scout" },
    { display_name: "Real Estate Agent", agent_key: "real_estate_agent" },
    { display_name: "Weekly Digest", agent_key: "weekly_digest" },
    { display_name: "Foundation Operations", agent_key: "foundation_operations" },
    { display_name: "CLO Agent", agent_key: "clo_agent" },
    { display_name: "Corey's Personal Agent", agent_key: "corey_personal" },
    { display_name: "Jo's Personal Agent", agent_key: "jo_personal" },
    { display_name: "Dave's Personal Agent", agent_key: "dave_personal" },
    { display_name: "Nothing Gets Lost", agent_key: "nothing_gets_lost" },
  ];

  for (const { display_name, agent_key } of identityKeyMappings) {
    await knex("agent_identities")
      .where({ display_name })
      .whereNull("agent_key")
      .update({ agent_key });
  }
}

export async function down(knex: Knex): Promise<void> {
  // Re-activate aspirational nodes
  const aspirationalRoles = [
    "Distribution Agent", "Follow-Up Agent", "Onboarding Agent",
    "Retention Alert Agent", "Intelligence Director Agent",
    "Product Director Agent", "Spec Writer Agent",
    "Operations Director Agent", "IT Agent", "Video Script Agent",
  ];
  for (const role_title of aspirationalRoles) {
    await knex("dream_team_nodes")
      .where({ role_title })
      .update({ is_active: true, updated_at: new Date() });
  }

  // Clear wired agent_keys on dream_team_nodes
  const rolesToClear = [
    "AEO Writer Agent", "Competitor Monitor Agent", "Script Writer Agent",
    "Website Copy Agent", "PatientPath Research Agent", "PatientPath Copy Agent",
    "Safety Agent", "Human Authenticity Agent", "Finance Monitor Agent", "Outreach Agent",
  ];
  for (const role_title of rolesToClear) {
    await knex("dream_team_nodes")
      .where({ role_title })
      .update({ agent_key: null, updated_at: new Date() });
  }
}
