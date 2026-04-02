/**
 * Agent Canon Governance Columns
 *
 * Adds Canon governance to agent_identities:
 * - canon_spec: what the agent does, constraints, expected behavior
 * - gold_questions: test questions with expected/actual answers
 * - gate_verdict: PASS/FAIL/PENDING (scheduler checks this)
 * - gate_date: when verdict was last set
 * - gate_expires: auto-expiry (gate_date + 90 days)
 * - agent_key: maps to schedules.agent_key for scheduler integration
 */

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("agent_identities", (table) => {
    table.jsonb("canon_spec").notNullable().defaultTo("{}");
    table.jsonb("gold_questions").notNullable().defaultTo("[]");
    table.string("gate_verdict", 10).notNullable().defaultTo("PENDING");
    table.timestamp("gate_date").nullable();
    table.timestamp("gate_expires").nullable();
    table.text("agent_key").nullable();
  });

  // CHECK constraint for gate_verdict values
  await knex.schema.raw(
    `ALTER TABLE agent_identities ADD CONSTRAINT chk_gate_verdict CHECK (gate_verdict IN ('PASS', 'FAIL', 'PENDING'))`
  );

  // Index on agent_key for scheduler lookups
  await knex.schema.raw(
    `CREATE INDEX idx_agent_identities_agent_key ON agent_identities (agent_key) WHERE agent_key IS NOT NULL`
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.raw(
    `ALTER TABLE agent_identities DROP CONSTRAINT IF EXISTS chk_gate_verdict`
  );
  await knex.schema.raw(
    `DROP INDEX IF EXISTS idx_agent_identities_agent_key`
  );
  await knex.schema.alterTable("agent_identities", (table) => {
    table.dropColumn("canon_spec");
    table.dropColumn("gold_questions");
    table.dropColumn("gate_verdict");
    table.dropColumn("gate_date");
    table.dropColumn("gate_expires");
    table.dropColumn("agent_key");
  });
}
