/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
  // -- ai_command_batches --
  await knex.schema.withSchema("website_builder").createTable("ai_command_batches", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("project_id").notNullable().references("id").inTable("website_builder.projects").onDelete("CASCADE");
    t.text("prompt").notNullable();
    t.jsonb("targets").notNullable().defaultTo("{}");
    t.text("status").notNullable().defaultTo("analyzing");
    t.text("summary");
    t.jsonb("stats").notNullable().defaultTo('{"total":0,"pending":0,"approved":0,"rejected":0,"executed":0,"failed":0}');
    t.uuid("created_by");
    t.timestamps(true, true);
  });

  // -- ai_command_recommendations --
  await knex.schema.withSchema("website_builder").createTable("ai_command_recommendations", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("batch_id").notNullable().references("id").inTable("website_builder.ai_command_batches").onDelete("CASCADE");
    t.text("target_type").notNullable();
    t.uuid("target_id").notNullable();
    t.text("target_label").notNullable();
    t.jsonb("target_meta").notNullable().defaultTo("{}");
    t.text("recommendation").notNullable();
    t.text("instruction").notNullable();
    t.text("current_html").notNullable();
    t.text("status").notNullable().defaultTo("pending");
    t.jsonb("execution_result");
    t.integer("sort_order").notNullable().defaultTo(0);
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // -- Indexes --
  await knex.schema.withSchema("website_builder").alterTable("ai_command_recommendations", (t) => {
    t.index("batch_id", "idx_ai_cmd_rec_batch");
    t.index(["batch_id", "status"], "idx_ai_cmd_rec_batch_status");
    t.index(["target_type", "target_id"], "idx_ai_cmd_rec_target");
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
  await knex.schema.withSchema("website_builder").dropTableIfExists("ai_command_recommendations");
  await knex.schema.withSchema("website_builder").dropTableIfExists("ai_command_batches");
};
