import type { Knex } from "knex";

/**
 * Manifest v2 Card 6 (Sales Agent Brick 1): prospects table.
 *
 * Backs the Sales Agent's prospectScanner + candidateFlagger pipeline.
 * Status lifecycle: candidate -> flagged -> reached_out -> engaged ->
 * qualified -> (converted_to_client | disqualified).
 *
 * Indexes target the two hot read paths: (a) flagger picks up candidates
 * by status, (b) scanner reschedules rescans by last_scanned_at and
 * filters by vertical.
 */
export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable("prospects");
  if (exists) return;

  await knex.schema.createTable("prospects", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.string("url", 500).notNullable();
    t.string("vertical", 40).notNullable();
    t.string("location", 200).nullable();
    t.string("status", 30).notNullable().defaultTo("candidate");
    t.jsonb("recognition_tri_score").nullable();
    t.jsonb("missing_examples").nullable();
    t.timestamp("identified_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("last_scanned_at", { useTz: true }).nullable();
    t.timestamp("flagged_at", { useTz: true }).nullable();
    t.string("disqualification_reason", 200).nullable();
    t.string("source", 30).notNullable().defaultTo("watcher_scan");
    t.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw("CREATE UNIQUE INDEX idx_prospects_url ON prospects(url)");
  await knex.raw("CREATE INDEX idx_prospects_status ON prospects(status)");
  await knex.raw("CREATE INDEX idx_prospects_vertical ON prospects(vertical)");
  await knex.raw("CREATE INDEX idx_prospects_last_scanned_at ON prospects(last_scanned_at)");
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP INDEX IF EXISTS idx_prospects_url");
  await knex.raw("DROP INDEX IF EXISTS idx_prospects_status");
  await knex.raw("DROP INDEX IF EXISTS idx_prospects_vertical");
  await knex.raw("DROP INDEX IF EXISTS idx_prospects_last_scanned_at");
  await knex.schema.dropTableIfExists("prospects");
}
