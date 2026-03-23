/**
 * GBP Review Blocks Migration
 * Tables: website_builder.reviews, website_builder.review_blocks
 */

exports.up = async function (knex) {
  // reviews
  await knex.schema.withSchema("website_builder").createTable("reviews", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.integer("location_id").notNullable().references("id").inTable("locations").onDelete("CASCADE");
    t.text("google_review_name").notNullable();
    t.smallint("stars").notNullable();
    t.text("text");
    t.text("reviewer_name");
    t.text("reviewer_photo_url");
    t.boolean("is_anonymous").notNullable().defaultTo(false);
    t.timestamp("review_created_at", { useTz: true });
    t.boolean("has_reply").notNullable().defaultTo(false);
    t.text("reply_text");
    t.timestamp("reply_date", { useTz: true });
    t.timestamp("synced_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamps(true, true);

    t.unique(["google_review_name"]);
    t.index(["location_id", "stars"]);
    t.index(["location_id", "review_created_at"]);
  });

  // review_blocks
  await knex.schema.withSchema("website_builder").createTable("review_blocks", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("template_id").notNullable().references("id").inTable("website_builder.templates").onDelete("CASCADE");
    t.text("name").notNullable();
    t.text("slug").notNullable();
    t.text("description");
    t.jsonb("sections").notNullable().defaultTo("[]");
    t.timestamps(true, true);

    t.unique(["template_id", "slug"]);
  });
};

exports.down = async function (knex) {
  await knex.schema.withSchema("website_builder").dropTableIfExists("review_blocks");
  await knex.schema.withSchema("website_builder").dropTableIfExists("reviews");
};
