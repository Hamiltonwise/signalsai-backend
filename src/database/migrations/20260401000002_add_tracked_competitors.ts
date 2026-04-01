/**
 * Migration: Add tracked_competitors JSONB column to organizations.
 *
 * Stores up to 3 competitor profiles tracked by the business owner.
 * Format: Array<{ placeId, name, rating, reviewCount, photoCount, lastUpdated }>
 */
import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn("organizations", "tracked_competitors");
  if (!hasColumn) {
    await knex.schema.alterTable("organizations", (table) => {
      table.jsonb("tracked_competitors").nullable().defaultTo("[]");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn("organizations", "tracked_competitors");
  if (hasColumn) {
    await knex.schema.alterTable("organizations", (table) => {
      table.dropColumn("tracked_competitors");
    });
  }
}
