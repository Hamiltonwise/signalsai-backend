import * as dotenv from "dotenv";
dotenv.config({ path: "/Users/rustinedave/Desktop/alloro/.env" });
import db from "../../src/database/connection";

(async () => {
  // For every page with null template_page_id, borrow the template_page_id
  // from any sibling at the same project+path (any status, any version).
  // This unblocks regenerate for ancient pages where only v0 retained the
  // link and every subsequent revision dropped it.
  const orphans = await db("website_builder.pages as p")
    .whereNull("p.template_page_id")
    .select("p.id", "p.project_id", "p.path", "p.status", "p.version");
  console.log(`Scanning ${orphans.length} pages with null template_page_id`);

  let fixed = 0;
  for (const o of orphans) {
    const donor = await db("website_builder.pages")
      .where({ project_id: o.project_id, path: o.path })
      .whereNotNull("template_page_id")
      .orderBy("version", "asc")
      .first();

    if (!donor) continue;

    await db("website_builder.pages")
      .where("id", o.id)
      .update({ template_page_id: donor.template_page_id, updated_at: db.fn.now() });

    console.log(
      `  ${o.id} (${o.status} v${o.version} path=${o.path}) <- ${donor.template_page_id} (from v${donor.version})`,
    );
    fixed++;
  }
  console.log(`done — fixed ${fixed}`);
  await db.destroy();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
