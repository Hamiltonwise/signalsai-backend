import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // referral_submissions -- GP Discovery referral form submissions
  await knex.schema.createTable("referral_submissions", (t) => {
    t.increments("id").primary();
    t.integer("organization_id").notNullable().references("id").inTable("organizations");
    t.string("referring_doctor_name", 200).notNullable();
    t.string("referring_practice_name", 200).notNullable();
    t.string("patient_first_name", 100).notNullable(); // first name only -- PHI compliance
    t.string("case_type", 100).notNullable();
    t.string("urgency", 20).notNullable().defaultTo("Routine"); // Routine | Urgent | Emergency
    t.text("notes").nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
  });

  await knex.schema.raw(
    "CREATE INDEX idx_referral_submissions_org ON referral_submissions(organization_id)",
  );

  // review_page_slug on organizations -- used for alloro.site subdomain routing
  const hasSlug = await knex.schema.hasColumn("organizations", "review_page_slug");
  if (!hasSlug) {
    await knex.schema.alterTable("organizations", (t) => {
      t.string("review_page_slug", 100).nullable().unique();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("referral_submissions");
  const hasSlug = await knex.schema.hasColumn("organizations", "review_page_slug");
  if (hasSlug) {
    await knex.schema.alterTable("organizations", (t) => {
      t.dropColumn("review_page_slug");
    });
  }
}
