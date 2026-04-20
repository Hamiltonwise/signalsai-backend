/**
 * Dump the image manifest for the Coastal project so we can see what the
 * vision model classified and whether doctor headshots are linked to doctors.
 */
import * as dotenv from "dotenv";
dotenv.config({ path: "/Users/rustinedave/Desktop/alloro/.env" });

import db from "../../src/database/connection";

const PROJECT_ID = "99fd9fdc-f53d-4602-8e4a-3c770d739bf5";

(async () => {
  const row = await db("website_builder.projects")
    .where("id", PROJECT_ID)
    .select("project_identity")
    .first();
  const id = row?.project_identity as any;
  const images: any[] = id?.extracted_assets?.images || [];

  console.log(`total images: ${images.length}\n`);

  const byUseCase: Record<string, number> = {};
  const byRank: Record<string, number> = {};
  let logoCount = 0;

  for (const img of images) {
    const uc = img.use_case || "(none)";
    byUseCase[uc] = (byUseCase[uc] || 0) + 1;
    const r = img.usability_rank != null ? String(img.usability_rank) : "(none)";
    byRank[r] = (byRank[r] || 0) + 1;
    if (img.is_logo) logoCount++;
  }

  console.log("by use_case:");
  for (const [k, v] of Object.entries(byUseCase).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(20)} ${v}`);
  }

  console.log("\nby usability_rank:");
  for (const [k, v] of Object.entries(byRank).sort((a, b) => Number(b[0]) - Number(a[0]))) {
    console.log(`  ${k.padEnd(20)} ${v}`);
  }

  console.log(`\nis_logo=true: ${logoCount}`);

  // Show top-ranked team/headshot-ish images
  console.log("\n--- team/headshot use_case ---");
  const team = images.filter(
    (i) =>
      (i.use_case || "").toLowerCase().includes("team") ||
      (i.use_case || "").toLowerCase().includes("headshot") ||
      (i.use_case || "").toLowerCase().includes("doctor") ||
      (i.use_case || "").toLowerCase().includes("staff") ||
      (i.use_case || "").toLowerCase().includes("portrait"),
  );
  for (const t of team) {
    console.log(`  rank=${t.usability_rank} use_case=${t.use_case}`);
    console.log(`    desc: ${(t.description || "").slice(0, 140)}`);
    console.log(`    src:  ${t.source_url}`);
    console.log(`    s3:   ${t.s3_url}\n`);
  }

  // Show a sample of 5 highest-ranked images overall
  console.log("--- top 10 by usability_rank ---");
  const sorted = [...images].sort(
    (a, b) => (b.usability_rank ?? 0) - (a.usability_rank ?? 0),
  );
  for (const img of sorted.slice(0, 10)) {
    console.log(
      `  rank=${img.usability_rank} use_case=${img.use_case || "(none)"} logo=${img.is_logo ? "Y" : "N"}`,
    );
    console.log(`    desc: ${(img.description || "").slice(0, 140)}`);
    console.log(`    src:  ${img.source_url}\n`);
  }

  // Check whether doctor entries know about their headshots
  console.log("--- doctors ---");
  const doctors = id?.content_essentials?.doctors || [];
  for (const d of doctors) {
    console.log(`  ${d.name}`);
    console.log(`    keys: ${Object.keys(d).join(", ")}`);
    console.log(`    source_url:  ${d.source_url}`);
    console.log(`    short_blurb: ${d.short_blurb ? "yes" : "NO"}`);
    console.log(`    photo/image field: ${d.photo_url || d.image_url || d.headshot_url || d.headshot_s3_url || "(not stored)"}\n`);
  }

  await db.destroy();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
