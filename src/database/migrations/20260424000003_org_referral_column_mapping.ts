/**
 * Migration: Referral Column Mapping + System Notifications on organizations
 *
 * Adds two JSONB columns to organizations:
 *
 *   referral_column_mapping (JSONB, nullable)
 *     -- The confirmed mapping from CSV header → canonical role
 *        (source, date, amount, count, patient, procedure, provider).
 *        Stored once per org on first upload. Includes a headersFingerprint
 *        so future uploads can detect when the structure changed and ask
 *        for re-confirmation instead of ingesting silently.
 *
 *   system_notifications (JSONB array, default [])
 *     -- One-time notifications surfaced to the practice. Items shape:
 *        { id, type, title, message, metadata, createdAt, dismissedAt }.
 *        Used by the retroactive cleanup job to inform a practice that
 *        bad referral source rows were removed from their data.
 */

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(
    `ALTER TABLE organizations
       ADD COLUMN IF NOT EXISTS referral_column_mapping JSONB`
  );
  await knex.raw(
    `ALTER TABLE organizations
       ADD COLUMN IF NOT EXISTS system_notifications JSONB NOT NULL DEFAULT '[]'::jsonb`
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE organizations DROP COLUMN IF EXISTS referral_column_mapping`);
  await knex.raw(`ALTER TABLE organizations DROP COLUMN IF EXISTS system_notifications`);
}
