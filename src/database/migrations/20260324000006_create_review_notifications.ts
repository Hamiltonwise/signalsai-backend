import type { Knex } from "knex";

/**
 * Review notifications — new Google reviews detected + AI-generated responses.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("review_notifications", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.integer("organization_id").unsigned().notNullable()
      .references("id").inTable("organizations").onDelete("CASCADE");
    table.integer("location_id").unsigned().nullable()
      .references("id").inTable("locations").onDelete("SET NULL");
    table.string("place_id", 200).nullable();
    table.string("reviewer_name", 200).nullable();
    table.integer("star_rating").nullable(); // 1-5
    table.text("review_text").nullable();
    table.text("ai_response").nullable(); // Claude-generated suggested response
    table.string("status", 20).defaultTo("new"); // new, responded, dismissed
    table.string("review_google_id", 300).nullable(); // dedup key
    table.timestamp("review_published_at", { useTz: true }).nullable();
    table.boolean("slack_notified").defaultTo(false);
    table.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw("CREATE INDEX idx_review_notif_org ON review_notifications(organization_id)");
  await knex.raw("CREATE INDEX idx_review_notif_status ON review_notifications(status)");
  await knex.raw("CREATE UNIQUE INDEX idx_review_notif_dedup ON review_notifications(review_google_id) WHERE review_google_id IS NOT NULL");
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("review_notifications");
}
