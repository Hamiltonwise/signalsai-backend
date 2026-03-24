/**
 * Migration: Create Dream Team tables + seed org chart (WO16)
 */

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // dream_team_nodes
  await knex.schema.createTable("dream_team_nodes", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.string("role_title", 100).notNullable();
    t.string("display_name", 100);
    t.string("node_type", 20).notNullable(); // 'human' or 'agent'
    t.string("department", 100);
    t.uuid("parent_id").references("id").inTable("dream_team_nodes");
    t.string("agent_id", 100); // links to existing agent/mind
    t.jsonb("kpi_targets").defaultTo("[]");
    t.string("health_status", 10).defaultTo("gray");
    t.boolean("is_active").defaultTo(true);
    t.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).defaultTo(knex.fn.now());
  });

  // dream_team_resume_entries
  await knex.schema.createTable("dream_team_resume_entries", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("node_id").references("id").inTable("dream_team_nodes").onDelete("CASCADE");
    t.string("entry_type", 50);
    t.text("summary").notNullable();
    t.string("created_by", 100);
    t.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
  });

  // --- Seed the org chart ---
  const insert = async (
    role_title: string,
    display_name: string | null,
    node_type: string,
    department: string | null,
    parent_id: string | null,
    agent_id: string | null,
  ): Promise<string> => {
    const [row] = await knex("dream_team_nodes")
      .insert({
        role_title,
        display_name,
        node_type,
        department,
        parent_id,
        agent_id,
        kpi_targets: JSON.stringify([]),
        health_status: "gray",
      })
      .returning("id");
    return row.id;
  };

  // Root
  const coreyId = await insert("Visionary / CEO", "Corey", "human", null, null, null);
  const joId = await insert("COO / Integrator", "Jo", "human", null, null, null);
  const daveId = await insert("CTO", "Dave", "human", null, null, null);

  // Content + AEO
  const cmoId = await insert("CMO Agent", null, "agent", "Content + AEO", daveId, null);
  await insert("AEO Writer Agent", null, "agent", "Content + AEO", cmoId, null);
  await insert("Video Script Agent", null, "agent", "Content + AEO", cmoId, null);
  await insert("Distribution Agent", null, "agent", "Content + AEO", cmoId, null);

  // Sales
  const salesDirId = await insert("Sales Director Agent", null, "agent", "Sales", daveId, null);
  await insert("Prospect Research Agent", null, "agent", "Sales", salesDirId, null);
  await insert("Outreach Agent", null, "agent", "Sales", salesDirId, null);
  await insert("Follow-Up Agent", null, "agent", "Sales", salesDirId, null);

  // Client Success
  const csCoachId = await insert("CS Coach Agent", null, "agent", "Client Success", daveId, null);
  await insert("Onboarding Agent", null, "agent", "Client Success", csCoachId, null);
  const prooflineId = await insert("Proofline Agent", null, "agent", "Client Success", csCoachId, "proofline");
  await insert("Retention Alert Agent", null, "agent", "Client Success", csCoachId, null);

  // Intelligence
  const intelDirId = await insert("Intelligence Director Agent", null, "agent", "Intelligence", daveId, null);
  await insert("Market Scanner Agent", null, "agent", "Intelligence", intelDirId, null);
  await insert("Competitor Monitor Agent", null, "agent", "Intelligence", intelDirId, null);
  await insert("Weekly Brief Agent", null, "agent", "Intelligence", intelDirId, null);

  // Product
  const productDirId = await insert("Product Director Agent", null, "agent", "Product", daveId, null);
  await insert("QA Agent", null, "agent", "Product", productDirId, null);
  await insert("Spec Writer Agent", null, "agent", "Product", productDirId, null);

  // Operations
  const opsDirId = await insert("Operations Director Agent", null, "agent", "Operations", daveId, null);
  await insert("IT Agent", null, "agent", "Operations", opsDirId, null);
  await insert("Finance Monitor Agent", null, "agent", "Operations", opsDirId, null);
  await insert("Compliance Agent", null, "agent", "Operations", opsDirId, null);

  // Add initial resume entries for seed nodes
  const seedResume = async (nodeId: string, summary: string) => {
    await knex("dream_team_resume_entries").insert({
      node_id: nodeId,
      entry_type: "configuration",
      summary,
      created_by: "system",
    });
  };

  await seedResume(coreyId, "Initial configuration — Visionary / CEO role created");
  await seedResume(joId, "Initial configuration — COO / Integrator role created");
  await seedResume(daveId, "Initial configuration — CTO role created");
  await seedResume(prooflineId, "Connected to existing Proofline Agent schedule");
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("dream_team_resume_entries");
  await knex.schema.dropTableIfExists("dream_team_nodes");
}
