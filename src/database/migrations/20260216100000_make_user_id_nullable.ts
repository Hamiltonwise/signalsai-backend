import type { Knex } from "knex";

/**
 * Migration: Make user_id nullable in projects table
 *
 * Context: DFY projects are organization-owned (not user-owned).
 * The tier upgrade auto-creates projects with organization_id but no user_id.
 * This migration removes the NOT NULL constraint to allow NULL user_id.
 */

export async function up(knex: Knex): Promise<void> {
  // Explicitly make user_id nullable
  await knex.raw(`
    ALTER TABLE website_builder.projects
    ALTER COLUMN user_id DROP NOT NULL;
  `);

  console.log("[Migration] ✓ user_id is now nullable in website_builder.projects");
}

export async function down(knex: Knex): Promise<void> {
  // Revert to NOT NULL
  // WARNING: This will fail if any rows have NULL user_id
  await knex.raw(`
    ALTER TABLE website_builder.projects
    ALTER COLUMN user_id SET NOT NULL;
  `);

  console.log("[Migration] ✗ Reverted: user_id is now NOT NULL in website_builder.projects");
}
