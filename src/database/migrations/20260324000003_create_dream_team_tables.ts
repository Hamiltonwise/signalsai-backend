import type { Knex } from "knex";

/**
 * WO16: Dream Team org chart tables.
 * - dream_team_nodes: every role (human + AI) in the org tree
 * - dream_team_resume_entries: audit log / configuration history per node
 */
export async function up(knex: Knex): Promise<void> {
  // ── Nodes ──
  await knex.schema.createTable("dream_team_nodes", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("role_title", 100).notNullable();
    table.string("display_name", 100).nullable();
    table.string("node_type", 20).notNullable(); // 'human' or 'agent'
    table.string("department", 100).nullable();
    table.uuid("parent_id").nullable().references("id").inTable("dream_team_nodes").onDelete("SET NULL");
    table.string("agent_key", 100).nullable(); // links to schedules.agent_key
    table.jsonb("kpi_targets").defaultTo("[]");
    table.string("health_status", 10).defaultTo("gray");
    table.boolean("is_active").defaultTo(true);
    table.integer("sort_order").defaultTo(0);
    table.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).defaultTo(knex.fn.now());
  });

  // ── Resume entries ──
  await knex.schema.createTable("dream_team_resume_entries", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("node_id").notNullable().references("id").inTable("dream_team_nodes").onDelete("CASCADE");
    table.string("entry_type", 50).nullable();
    table.text("summary").notNullable();
    table.string("created_by", 100).nullable();
    table.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw("CREATE INDEX idx_dream_team_nodes_parent ON dream_team_nodes(parent_id)");
  await knex.raw("CREATE INDEX idx_dream_team_resume_node ON dream_team_resume_entries(node_id)");

  // ── Seed the org tree ──
  // Helper to insert a node and return its id
  async function node(
    role_title: string,
    display_name: string | null,
    node_type: "human" | "agent",
    department: string | null,
    parent_id: string | null,
    agent_key: string | null,
    kpis: { name: string; target: string; unit?: string }[],
    sort: number,
  ): Promise<string> {
    const [row] = await knex("dream_team_nodes")
      .insert({
        role_title,
        display_name,
        node_type,
        department,
        parent_id,
        agent_key,
        kpi_targets: JSON.stringify(kpis),
        health_status: "gray",
        is_active: true,
        sort_order: sort,
      })
      .returning("id");
    return row.id;
  }

  // Root
  const alloro = await node("Alloro Inc.", null, "human", null, null, null, [], 0);

  // Humans
  const corey = await node("Visionary / CEO", "Corey", "human", null, alloro, null, [], 1);
  const jo = await node("COO / Integrator", "Jo", "human", null, alloro, null, [], 2);
  const dave = await node("CTO", "Dave", "human", null, alloro, null, [], 3);

  // ── Content + AEO Department ──
  const cmo = await node("CMO Agent", null, "agent", "Content + AEO", dave, null, [
    { name: "Articles published per week", target: "3" },
    { name: "AEO citations gained", target: "5+" },
  ], 10);
  await node("AEO Writer Agent", null, "agent", "Content + AEO", cmo, null, [
    { name: "Articles drafted per week", target: "5" },
    { name: "Average quality score", target: "80%+" },
  ], 11);
  await node("Video Script Agent", null, "agent", "Content + AEO", cmo, null, [
    { name: "Scripts written per week", target: "2" },
  ], 12);
  await node("Distribution Agent", null, "agent", "Content + AEO", cmo, null, [
    { name: "Channels posted to per piece", target: "4+" },
  ], 13);

  // ── Sales Department ──
  const salesDir = await node("Sales Director Agent", null, "agent", "Sales", dave, null, [
    { name: "Pipeline value", target: "$50k+" },
    { name: "Meetings booked per week", target: "5" },
  ], 20);
  await node("Prospect Research Agent", null, "agent", "Sales", salesDir, null, [
    { name: "Prospects researched per week", target: "50" },
  ], 21);
  await node("Outreach Agent", null, "agent", "Sales", salesDir, null, [
    { name: "Outreach sequences active", target: "3+" },
    { name: "Response rate", target: "5%+" },
  ], 22);
  await node("Follow-Up Agent", null, "agent", "Sales", salesDir, null, [
    { name: "Follow-ups sent per week", target: "20" },
  ], 23);

  // ── Client Success Department ──
  const csCoach = await node("CS Coach Agent", null, "agent", "Client Success", dave, null, [
    { name: "Client satisfaction", target: "90%+" },
    { name: "Churn risk flags", target: "<2" },
  ], 30);
  await node("Onboarding Agent", null, "agent", "Client Success", csCoach, null, [
    { name: "Avg onboarding time", target: "<48h" },
  ], 31);
  await node("Proofline Agent", null, "agent", "Client Success", csCoach, "proofline", [
    { name: "Runs per week", target: "7" },
    { name: "Avg output quality score", target: "80%+" },
    { name: "Issues flagged per week", target: "1-5" },
    { name: "Orgs without recent run", target: "0" },
  ], 32);
  await node("Retention Alert Agent", null, "agent", "Client Success", csCoach, null, [
    { name: "Alerts sent per week", target: "as needed" },
  ], 33);

  // ── Intelligence Department ──
  const intelDir = await node("Intelligence Director Agent", null, "agent", "Intelligence", dave, null, [
    { name: "Signals captured per week", target: "50+" },
  ], 40);
  await node("Market Scanner Agent", null, "agent", "Intelligence", intelDir, null, [
    { name: "Markets scanned per week", target: "10+" },
  ], 41);
  await node("Competitor Monitor Agent", null, "agent", "Intelligence", intelDir, null, [
    { name: "Competitor changes detected", target: "daily" },
  ], 42);
  await node("Weekly Brief Agent", null, "agent", "Intelligence", intelDir, null, [
    { name: "Briefs delivered per week", target: "1" },
  ], 43);

  // ── Product Department ──
  const productDir = await node("Product Director Agent", null, "agent", "Product", dave, null, [
    { name: "Specs written per sprint", target: "2" },
  ], 50);
  await node("QA Agent", null, "agent", "Product", productDir, null, [
    { name: "Test coverage", target: "80%+" },
  ], 51);
  await node("Spec Writer Agent", null, "agent", "Product", productDir, null, [
    { name: "Specs delivered per week", target: "1" },
  ], 52);

  // ── Operations Department ──
  const opsDir = await node("Operations Director Agent", null, "agent", "Operations", dave, null, [
    { name: "Uptime", target: "99.9%" },
  ], 60);
  await node("IT Agent", null, "agent", "Operations", opsDir, null, [
    { name: "Incidents resolved per week", target: "<3" },
  ], 61);
  await node("Finance Monitor Agent", null, "agent", "Operations", opsDir, null, [
    { name: "Revenue tracked", target: "real-time" },
  ], 62);
  await node("Compliance Agent", null, "agent", "Operations", opsDir, null, [
    { name: "Audit checks per month", target: "4" },
  ], 63);

  // Seed initial resume entries for humans
  for (const [nodeId, name] of [[corey, "Corey"], [jo, "Jo"], [dave, "Dave"]] as const) {
    await knex("dream_team_resume_entries").insert({
      node_id: nodeId,
      entry_type: "configuration",
      summary: `${name} added to the org chart.`,
      created_by: "system",
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("dream_team_resume_entries");
  await knex.schema.dropTableIfExists("dream_team_nodes");
}
