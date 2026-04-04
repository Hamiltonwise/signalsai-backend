/**
 * Add timezone to organizations.
 * Stores the business's IANA timezone (e.g., "America/New_York")
 * from Google Places utcOffsetMinutes. Used for timezone-aware
 * Monday email delivery (7 AM their time, not ours).
 */
import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("organizations", (t) => {
    t.string("timezone", 50).nullable(); // IANA timezone or UTC offset minutes
    t.integer("utc_offset_minutes").nullable(); // From Google Places API
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("organizations", (t) => {
    t.dropColumn("timezone");
    t.dropColumn("utc_offset_minutes");
  });
}
