import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // PatientPath SEO Audits
  await knex.schema.createTable("patientpath_seo_audits", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.integer("organization_id").references("id").inTable("organizations").onDelete("CASCADE");
    t.integer("website_id").nullable();
    t.integer("seo_score").notNullable().defaultTo(0);
    t.jsonb("factors").defaultTo("{}"); // 9 SEO factors with pass/fail
    t.jsonb("previous_factors").nullable(); // last audit for delta
    t.integer("score_delta").nullable();
    t.timestamp("audited_at").defaultTo(knex.fn.now());
    t.timestamps(true, true);
  });
  await knex.schema.raw("CREATE INDEX idx_seo_audits_org ON patientpath_seo_audits(organization_id)");
  await knex.schema.raw("CREATE INDEX idx_seo_audits_date ON patientpath_seo_audits(audited_at)");

  // PatientPath FAQ Content (AEO)
  await knex.schema.createTable("patientpath_faq_content", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.integer("organization_id").references("id").inTable("organizations").onDelete("CASCADE");
    t.string("specialty", 100).notNullable();
    t.text("question").notNullable();
    t.text("answer").notNullable();
    t.string("status", 20).defaultTo("staged"); // staged, approved, published
    t.jsonb("schema_markup").defaultTo("{}");
    t.timestamps(true, true);
  });
  await knex.schema.raw("CREATE INDEX idx_faq_org ON patientpath_faq_content(organization_id)");
  await knex.schema.raw("CREATE INDEX idx_faq_status ON patientpath_faq_content(status)");

  // CRO Experiments
  await knex.schema.createTable("cro_experiments", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.integer("organization_id").references("id").inTable("organizations").onDelete("CASCADE");
    t.string("experiment_name", 200).notNullable();
    t.string("variant_a", 500).notNullable();
    t.string("variant_b", 500).notNullable();
    t.string("variant_c", 500).nullable();
    t.string("winning_variant", 10).nullable(); // a, b, c, or null
    t.integer("total_impressions").defaultTo(0);
    t.integer("variant_a_conversions").defaultTo(0);
    t.integer("variant_b_conversions").defaultTo(0);
    t.integer("variant_c_conversions").defaultTo(0);
    t.boolean("concluded").defaultTo(false);
    t.timestamp("concluded_at").nullable();
    t.timestamp("started_at").defaultTo(knex.fn.now());
    t.timestamps(true, true);
  });
  await knex.schema.raw("CREATE INDEX idx_cro_org ON cro_experiments(organization_id)");
  await knex.schema.raw("CREATE INDEX idx_cro_active ON cro_experiments(concluded)");

  // Keyword Tracking
  await knex.schema.createTable("patientpath_keywords", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.integer("organization_id").references("id").inTable("organizations").onDelete("CASCADE");
    t.string("keyword", 300).notNullable();
    t.integer("position").nullable();
    t.integer("previous_position").nullable();
    t.integer("position_delta").nullable();
    t.string("tracked_url", 500).nullable();
    t.timestamp("checked_at").defaultTo(knex.fn.now());
    t.timestamps(true, true);
  });
  await knex.schema.raw("CREATE INDEX idx_keywords_org ON patientpath_keywords(organization_id)");
  await knex.schema.raw("CREATE INDEX idx_keywords_checked ON patientpath_keywords(checked_at)");
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("patientpath_keywords");
  await knex.schema.dropTableIfExists("cro_experiments");
  await knex.schema.dropTableIfExists("patientpath_faq_content");
  await knex.schema.dropTableIfExists("patientpath_seo_audits");
}
