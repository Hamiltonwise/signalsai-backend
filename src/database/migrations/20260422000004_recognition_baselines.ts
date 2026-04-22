import type { Knex } from "knex";

/**
 * Card 5 Run 3 (Manifest v2): recognition_baselines table.
 *
 * Stores the initial Recognition Tri-Score seeded during factory activation.
 * Used for delta comparison in the weekly digest (first digest shows baseline).
 */
export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable("recognition_baselines");
  if (exists) return;

  await knex.schema.createTable("recognition_baselines", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.integer("org_id")
      .notNullable()
      .references("id")
      .inTable("organizations")
      .onDelete("CASCADE");
    t.float("seo_composite").nullable();
    t.float("aeo_composite").nullable();
    t.float("cro_composite").nullable();
    t.integer("review_count").notNullable().defaultTo(0);
    t.integer("missing_example_count").notNullable().defaultTo(0);
    t.string("rubric_version_id", 200).nullable();
    t.jsonb("result_json").nullable();
    t.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw(
    "CREATE INDEX idx_recognition_baselines_org_id ON recognition_baselines(org_id)"
  );
  await knex.raw(
    "CREATE INDEX idx_recognition_baselines_created_at ON recognition_baselines(created_at)"
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP INDEX IF EXISTS idx_recognition_baselines_org_id");
  await knex.raw("DROP INDEX IF EXISTS idx_recognition_baselines_created_at");
  await knex.schema.dropTableIfExists("recognition_baselines");
}
