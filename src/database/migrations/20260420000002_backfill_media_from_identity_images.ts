import type { Knex } from "knex";

/**
 * Backfill `website_builder.media` from each project's
 * `project_identity.extracted_assets.images` JSONB array.
 *
 * Idempotent via per-row existence check (SELECT-then-INSERT) rather than
 * ON CONFLICT, because the sibling unique index is PARTIAL
 * (`WHERE s3_url IS NOT NULL`) and Postgres requires the ON CONFLICT target
 * to include the matching predicate — which Knex's `.onConflict().ignore()`
 * doesn't emit. Per-row checks sidestep the shape entirely.
 *
 * Iterates all projects with a non-null `project_identity`, pulls the
 * `extracted_assets.images` array, and inserts any missing media rows.
 * Logs totals at the end.
 *
 * See `plans/04202026-no-ticket-identity-modal-cleanup-and-crud/spec.md` T2.
 */

interface IdentityImage {
  s3_url?: unknown;
  description?: unknown;
}

function parseIdentityJson(value: unknown): any {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return null;
}

export async function up(knex: Knex): Promise<void> {
  const projects = await knex("website_builder.projects")
    .select("id", "project_identity")
    .whereNotNull("project_identity");

  let totalInserted = 0;
  let totalSkipped = 0;
  let projectsWithImages = 0;

  for (const p of projects) {
    const identity = parseIdentityJson(p.project_identity);
    const images: IdentityImage[] =
      identity?.extracted_assets?.images &&
      Array.isArray(identity.extracted_assets.images)
        ? identity.extracted_assets.images
        : [];

    if (images.length === 0) continue;

    const rows = images
      .filter(
        (img): img is IdentityImage & { s3_url: string } =>
          !!img &&
          typeof img.s3_url === "string" &&
          img.s3_url.length > 0,
      )
      .map((img) => {
        const description =
          typeof img.description === "string" ? img.description : null;
        const filename =
          img.s3_url.split("/").pop() || "unknown.jpg";
        return {
          project_id: p.id,
          filename,
          display_name: description ? description.slice(0, 255) : null,
          s3_key: null,
          s3_url: img.s3_url,
          file_size: 0,
          mime_type: "image/jpeg",
          alt_text: description,
          compressed: false,
          created_at: knex.fn.now(),
          updated_at: knex.fn.now(),
        };
      });

    if (rows.length === 0) continue;
    projectsWithImages += 1;

    // Fetch all existing s3_urls for this project in one query, diff, insert
    // the remainder. Avoids ON CONFLICT entirely so the partial unique index
    // predicate mismatch can't bite us.
    const existing = await knex("website_builder.media")
      .where("project_id", p.id)
      .select("s3_url");
    const existingSet = new Set(
      existing
        .map((r: { s3_url: string | null }) => r.s3_url)
        .filter((u: string | null): u is string => !!u),
    );

    const toInsert = rows.filter((r) => !existingSet.has(r.s3_url));
    if (toInsert.length === 0) {
      totalSkipped += rows.length;
      continue;
    }

    await knex("website_builder.media").insert(toInsert);

    totalInserted += toInsert.length;
    totalSkipped += rows.length - toInsert.length;
  }

  console.log(
    `[backfill_media_from_identity_images] projects=${projects.length} ` +
      `with_images=${projectsWithImages} inserted=${totalInserted} ` +
      `skipped=${totalSkipped}`,
  );
}

export async function down(_knex: Knex): Promise<void> {
  // Intentional no-op. We do not delete user data on rollback — operator
  // must manually prune media rows if a true rollback is needed.
}
