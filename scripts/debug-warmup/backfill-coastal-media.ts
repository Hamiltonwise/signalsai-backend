/**
 * One-off backfill: populate website_builder.media for the Coastal project
 * from project_identity.extracted_assets.images[].
 *
 * Idempotent via per-row existence check (works with or without the unique
 * index migration applied). Safe to re-run.
 */
import * as dotenv from "dotenv";
dotenv.config({ path: "/Users/rustinedave/Desktop/alloro/.env" });

import path from "path";
import db from "../../src/database/connection";

const PROJECT_ID = "99fd9fdc-f53d-4602-8e4a-3c770d739bf5";

(async () => {
  const project = await db("website_builder.projects")
    .where("id", PROJECT_ID)
    .select("id", "display_name", "project_identity")
    .first();

  if (!project) {
    console.error(`Project ${PROJECT_ID} not found`);
    await db.destroy();
    process.exit(1);
  }

  const images = project.project_identity?.extracted_assets?.images || [];
  console.log(`Project: ${project.display_name}`);
  console.log(`identity images: ${images.length}`);

  if (!Array.isArray(images) || images.length === 0) {
    console.log("nothing to backfill");
    await db.destroy();
    return;
  }

  let inserted = 0;
  let skipped = 0;
  let bad = 0;

  for (const img of images) {
    if (!img?.s3_url || typeof img.s3_url !== "string") {
      bad++;
      continue;
    }

    const existing = await db("website_builder.media")
      .where({ project_id: PROJECT_ID, s3_url: img.s3_url })
      .first();

    if (existing) {
      skipped++;
      continue;
    }

    const s3Key = img.s3_url.replace(/^https?:\/\/[^/]+\//, "");
    const filename = path.basename(s3Key) || "unknown.jpg";
    const description =
      typeof img.description === "string" ? img.description : null;

    await db("website_builder.media").insert({
      project_id: PROJECT_ID,
      filename,
      display_name: description ? description.slice(0, 255) : null,
      s3_key: s3Key,
      s3_url: img.s3_url,
      file_size: 0,
      mime_type: "image/jpeg",
      alt_text: description,
      width: null,
      height: null,
      thumbnail_s3_key: null,
      thumbnail_s3_url: null,
      original_mime_type: "image/jpeg",
      compressed: false,
    });

    inserted++;
  }

  console.log(
    `done — inserted=${inserted} skipped=${skipped} bad=${bad} total=${images.length}`,
  );

  await db.destroy();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
