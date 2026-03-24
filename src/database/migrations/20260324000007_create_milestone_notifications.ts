import type { Knex } from "knex";

/**
 * Milestone notifications — celebrates meaningful practice achievements.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("milestone_notifications", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.integer("organization_id").unsigned().notNullable()
      .references("id").inTable("organizations").onDelete("CASCADE");
    table.integer("location_id").unsigned().nullable()
      .references("id").inTable("locations").onDelete("SET NULL");
    table.string("milestone_type", 50).notNullable();
    // Types: rank_up, passed_competitor, review_count_milestone
    table.text("headline").notNullable();   // "You just passed Mountain View Endo"
    table.text("detail").nullable();         // "You're now tied for position 2."
    table.string("competitor_name", 200).nullable();
    table.integer("old_value").nullable();    // previous position/count
    table.integer("new_value").nullable();    // new position/count
    table.jsonb("metadata").defaultTo("{}"); // extra context
    table.boolean("seen").defaultTo(false);
    table.boolean("email_sent").defaultTo(false);
    table.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw("CREATE INDEX idx_milestone_org ON milestone_notifications(organization_id)");
  await knex.raw("CREATE INDEX idx_milestone_seen ON milestone_notifications(seen)");
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("milestone_notifications");
}
