import type { Knex } from "knex";

/**
 * WO19: PatientPath Build Pipeline fields on organizations.
 */
export async function up(knex: Knex): Promise<void> {
  const cols = {
    patientpath_status: "patientpath_status",
    patientpath_build_data: "patientpath_build_data",
    research_brief: "research_brief",
  };

  for (const [col, name] of Object.entries(cols)) {
    const has = await knex.schema.hasColumn("organizations", name);
    if (has) continue;

    await knex.schema.alterTable("organizations", (t) => {
      if (col === "patientpath_status") {
        t.string("patientpath_status", 30).defaultTo("pending");
      } else if (col === "patientpath_build_data") {
        t.jsonb("patientpath_build_data").nullable();
      } else if (col === "research_brief") {
        t.jsonb("research_brief").nullable();
      }
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const col of ["patientpath_status", "patientpath_build_data", "research_brief"]) {
    const has = await knex.schema.hasColumn("organizations", col);
    if (has) {
      await knex.schema.alterTable("organizations", (t) => t.dropColumn(col));
    }
  }
}
