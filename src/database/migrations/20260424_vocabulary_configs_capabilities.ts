/**
 * Migration: Vertical Capability Model on vocabulary_configs
 *
 * Adds a `capabilities` JSONB column to vocabulary_configs so each org can
 * declare what the product surfaces should and should not do for its vertical.
 *
 * Capabilities schema (every field defaults to true so healthcare verticals
 * keep their current behavior when the column is added):
 *
 *   referral_tracking (bool, default true)
 *     -- org tracks a professional referral network. When false, the Narrator
 *        suppresses gp.gone_dark / gp.drift_detected / referral.positive_signal
 *        and records a 'narrator.event_suppressed' behavioral_event instead of
 *        composing an owner-facing output.
 *
 *   gp_network (bool, default true)
 *     -- org receives cases from referring healthcare providers. UI surfaces
 *        that enumerate GPs (referral intelligence dashboard, Monday email
 *        referrer sections) respect this flag.
 *
 *   hipaa_mode (bool, default true)
 *     -- org operates under HIPAA. When true, every piece of published
 *        content must use first-name-only. When false, the copy rewrite
 *        service swaps the HIPAA instruction for a generic privacy
 *        instruction ("Use first name only for a personal touch. No full
 *        names in published content.") and strips HIPAA-specific wording
 *        from rendered prompts.
 */

import { Knex } from "knex";

const DEFAULT_CAPABILITIES = {
  referral_tracking: true,
  gp_network: true,
  hipaa_mode: true,
};

export async function up(knex: Knex): Promise<void> {
  await knex.raw(
    `ALTER TABLE vocabulary_configs
       ADD COLUMN IF NOT EXISTS capabilities JSONB NOT NULL
       DEFAULT '${JSON.stringify(DEFAULT_CAPABILITIES)}'::jsonb`
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE vocabulary_configs DROP COLUMN IF EXISTS capabilities`);
}
