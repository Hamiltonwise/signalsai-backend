/**
 * Agent Identity System -- database schema
 *
 * Two tables:
 * 1. agent_identities: The employee directory for AI agents
 * 2. agent_audit_log: Every action every agent takes, signed with identity
 *
 * "It's kind of like becoming roommates and not defining the rules."
 * This migration defines the rules.
 */

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Agent identities: the employee directory
  await knex.schema.createTable("agent_identities", (table) => {
    table.uuid("id").primary();
    table.string("slug").unique().notNullable().index();
    table.string("display_name").notNullable();
    table.string("agent_group").notNullable().index(); // intelligence, operations, client, etc.
    table.string("trust_level").notNullable().defaultTo("green"); // green, yellow, red, quarantined
    table.jsonb("scopes").notNullable(); // Array of DataScope strings
    table.integer("max_token_budget").notNullable().defaultTo(30000);
    table.string("schedule"); // Cron expression or null
    table.text("description");
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("last_run_at");
    table.integer("total_runs").notNullable().defaultTo(0);
    table.integer("total_violations").notNullable().defaultTo(0);
    table.timestamp("quarantined_at");
    table.text("quarantine_reason");
  });

  // Agent audit log: every action, signed with identity
  await knex.schema.createTable("agent_audit_log", (table) => {
    table.uuid("id").primary();
    table.uuid("agent_id").notNullable().references("id").inTable("agent_identities");
    table.uuid("run_id").notNullable().index();
    table.string("action").notNullable(); // run_start, run_end, scope_check, scope_violation
    table.string("scope").notNullable(); // The DataScope that was checked
    table.string("target").notNullable(); // Table name or API name
    table.integer("org_id"); // Which org was this for (null for system-wide)
    table.boolean("allowed").notNullable();
    table.text("detail");
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now()).index();
  });

  // Index for fast violation queries
  await knex.schema.raw(
    `CREATE INDEX idx_agent_audit_violations ON agent_audit_log (action, created_at DESC) WHERE action = 'scope_violation'`
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("agent_audit_log");
  await knex.schema.dropTableIfExists("agent_identities");
}
