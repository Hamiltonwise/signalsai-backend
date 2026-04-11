/**
 * Migration: Create pending_actions table
 *
 * The approval gate for DFY Engine. Every action Alloro wants to take
 * on behalf of a client goes here first as a draft. The owner sees it
 * in their Monday email and taps Approve or Reject.
 *
 * At 5 clients, auto-execute is fine. At 10,000, you need consent.
 * This is the consent layer.
 */

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("pending_actions", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.integer("org_id").notNullable().references("id").inTable("organizations").onDelete("CASCADE");

    // Action classification
    t.string("action_type", 50).notNullable(); // gbp_post, cro_title, cro_meta, competitor_gap
    t.string("status", 20).notNullable().defaultTo("draft"); // draft, approved, executed, rejected, expired

    // The actual work to be done (serialized)
    t.jsonb("payload").notNullable(); // Everything needed to execute the action

    // Human-readable preview for the email
    t.text("preview_title").notNullable(); // e.g. "GBP Post: Spring tips for..."
    t.text("preview_body").notNullable(); // The actual content the owner will see

    // One-tap approval token (no login required)
    t.string("approval_token", 64).notNullable().unique();

    // Lifecycle timestamps
    t.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
    t.timestamp("approved_at", { useTz: true });
    t.timestamp("executed_at", { useTz: true });
    t.timestamp("rejected_at", { useTz: true });
    t.timestamp("expires_at", { useTz: true }).notNullable(); // Default: 7 days from creation

    // Execution result tracking
    t.jsonb("execution_result"); // What happened when we executed (success/error details)
  });

  // Query patterns: org's pending actions, token lookup, cleanup expired
  await knex.raw("CREATE INDEX idx_pending_actions_org_status ON pending_actions(org_id, status)");
  await knex.raw("CREATE INDEX idx_pending_actions_token ON pending_actions(approval_token)");
  await knex.raw("CREATE INDEX idx_pending_actions_expires ON pending_actions(expires_at) WHERE status = 'draft'");

  console.log("[Migration] pending_actions table created");
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("pending_actions");
}
