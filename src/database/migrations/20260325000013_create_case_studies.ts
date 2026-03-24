import type { Knex } from "knex";

/**
 * WO-ARTFUL-CASESTUDY: Case studies table + Artful Orthodontics seed.
 */
export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable("case_studies");
  if (!exists) {
    await knex.schema.createTable("case_studies", (t) => {
      t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      t.integer("org_id").references("id").inTable("organizations").onDelete("SET NULL");
      t.string("practice_name", 255).notNullable();
      t.string("specialty", 100).nullable();
      t.string("city", 100).nullable();
      t.string("state", 50).nullable();
      t.integer("starting_position").nullable();
      t.integer("ending_position").nullable();
      t.integer("starting_review_count").nullable();
      t.integer("ending_review_count").nullable();
      t.integer("timeframe_weeks").nullable();
      t.string("revenue_impact", 255).nullable();
      t.text("doctor_quote").nullable();
      t.boolean("is_published").defaultTo(false);
      t.boolean("is_anonymous").defaultTo(false);
      t.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
    });
  }

  // Seed: Artful Orthodontics -- only verified outcome story
  const artful = await knex("case_studies").where({ practice_name: "Artful Orthodontics" }).first();
  if (!artful) {
    await knex("case_studies").insert({
      practice_name: "Artful Orthodontics",
      specialty: "orthodontics",
      city: "Denver",
      state: "CO",
      starting_position: 5,
      ending_position: 2,
      is_published: false,
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("case_studies");
}
