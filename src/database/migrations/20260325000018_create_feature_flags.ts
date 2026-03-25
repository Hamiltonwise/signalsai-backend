import type { Knex } from "knex";

/**
 * WO-FEATURE-FLAGS: Feature flag table with initial seed.
 */
export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable("feature_flags");
  if (!exists) {
    await knex.schema.createTable("feature_flags", (t) => {
      t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      t.string("flag_name", 200).unique().notNullable();
      t.boolean("is_enabled").defaultTo(false);
      t.jsonb("enabled_for_orgs").defaultTo("[]");
      t.text("description").nullable();
      t.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
    });
  }

  // Seed initial flags
  const flags = [
    { flag_name: "patientpath_phase2", is_enabled: false, description: "PatientPath HTML build -- requires AWS" },
    { flag_name: "gbp_oauth", is_enabled: true, description: "GBP OAuth connection flow" },
    { flag_name: "tuesday_alerts", is_enabled: true, description: "Tuesday competitor disruption alerts" },
    { flag_name: "partner_portal", is_enabled: true, description: "Partner portal for Merideth and Jay" },
  ];

  for (const flag of flags) {
    const existing = await knex("feature_flags").where({ flag_name: flag.flag_name }).first();
    if (!existing) {
      await knex("feature_flags").insert(flag);
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("feature_flags");
}
