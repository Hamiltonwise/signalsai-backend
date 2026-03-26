import type { Knex } from "knex";

/**
 * WO18: Review Request System — post-appointment review generation.
 * Tracks review requests sent to patients via email, with click-through
 * and conversion tracking.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("review_requests", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table
      .integer("organization_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("organizations")
      .onDelete("CASCADE");
    table.integer("location_id").unsigned().nullable();
    table.string("place_id", 200).nullable();
    table.string("recipient_email", 320).notNullable();
    table.string("recipient_name", 200).nullable();
    table.text("google_review_url").notNullable();
    table
      .enum("status", ["sent", "clicked", "converted"], {
        useNative: true,
        enumName: "review_request_status",
      })
      .notNullable()
      .defaultTo("sent");
    table.timestamp("sent_at").defaultTo(knex.fn.now());
    table.timestamp("clicked_at").nullable();
    table.timestamp("converted_at").nullable();
    table.timestamps(true, true);

    table.index("organization_id");
    table.index("status");
    table.index("created_at");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("review_requests");
  await knex.raw("DROP TYPE IF EXISTS review_request_status");
}
