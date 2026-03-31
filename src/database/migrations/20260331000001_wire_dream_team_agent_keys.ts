/**
 * Wire agent_key values to dream_team_nodes for health computation.
 * Maps known agent_type values from agent_results to the corresponding org chart nodes.
 */
import { Knex } from "knex";

const AGENT_MAPPING: Record<string, string> = {
  // agent_key -> role_title match in dream_team_nodes
  guardian: "QA Agent",
  referral_engine: "Prospect Research Agent",
  opportunity: "Market Scanner Agent",
  summary: "Weekly Brief Agent",
  governance_sentinel: "Compliance Agent",
  cro_optimizer: "Sales Director Agent",
};

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable("dream_team_nodes");
  if (!hasTable) return;

  // Proofline already has agent_key set, skip it
  for (const [agentKey, roleTitle] of Object.entries(AGENT_MAPPING)) {
    await knex("dream_team_nodes")
      .where({ role_title: roleTitle })
      .whereNull("agent_key")
      .update({ agent_key: agentKey });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable("dream_team_nodes");
  if (!hasTable) return;

  for (const agentKey of Object.values(AGENT_MAPPING)) {
    await knex("dream_team_nodes")
      .where({ agent_key: agentKey })
      .update({ agent_key: null });
  }
}
