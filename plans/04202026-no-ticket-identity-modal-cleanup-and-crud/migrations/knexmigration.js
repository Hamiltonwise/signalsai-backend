// T2 — two Knex migrations (unique index + backfill).
// Destination filenames at execution:
//   src/database/migrations/{ts}_add_unique_project_s3url_to_media.ts
//   src/database/migrations/{ts+1}_backfill_media_from_identity_images.ts

// ---------------------------------------------------------------------------
// Migration 1 — unique index
// ---------------------------------------------------------------------------
exports.up_index = async function (knex) {
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_media_project_s3url
      ON website_builder.media (project_id, s3_url)
      WHERE s3_url IS NOT NULL
  `);
};

exports.down_index = async function (knex) {
  await knex.raw(`DROP INDEX IF EXISTS website_builder.idx_media_project_s3url`);
};

// ---------------------------------------------------------------------------
// Migration 2 — backfill from identity.extracted_assets.images
// ---------------------------------------------------------------------------
exports.up_backfill = async function (knex) {
  // Stream projects so we don't load everything at once.
  const projects = await knex("website_builder.projects")
    .select("id", "project_identity")
    .whereNotNull("project_identity");

  let totalInserted = 0;
  let totalSkipped = 0;

  for (const p of projects) {
    const images = p.project_identity?.extracted_assets?.images || [];
    if (!Array.isArray(images) || images.length === 0) continue;

    const rows = images
      .filter((img) => img?.s3_url && typeof img.s3_url === "string")
      .map((img) => ({
        project_id: p.id,
        filename: img.s3_url.split("/").pop() || "unknown.jpg",
        display_name: (img.description || "").slice(0, 255) || null,
        s3_key: null,
        s3_url: img.s3_url,
        file_size: 0,
        mime_type: "image/jpeg",
        alt_text: img.description || null,
        compressed: false,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      }));

    if (rows.length === 0) continue;

    // ON CONFLICT DO NOTHING requires the unique index from migration 1.
    const result = await knex("website_builder.media")
      .insert(rows)
      .onConflict(["project_id", "s3_url"])
      .ignore()
      .returning("id");

    totalInserted += result.length;
    totalSkipped += rows.length - result.length;
  }

  console.log(
    `[backfill_media] projects=${projects.length} inserted=${totalInserted} skipped=${totalSkipped}`,
  );
};

exports.down_backfill = async function (knex) {
  // Intentional no-op — we don't delete user data on rollback.
  // If a rollback is truly needed, operator can DELETE by matching s3_urls
  // that exist only in media (not in identity JSONB) — too risky to automate.
};
