import * as dotenv from "dotenv";
dotenv.config({ path: "/Users/rustinedave/Desktop/alloro/.env" });
import db from "../../src/database/connection";

(async () => {
  // For every project, find drafts with null template_page_id and copy from
  // the most-recent published sibling at the same path.
  const orphanDrafts = await db("website_builder.pages as draft")
    .leftJoin("website_builder.pages as pub", function() {
      this.on("pub.project_id", "=", "draft.project_id")
          .andOn("pub.path", "=", "draft.path")
          .andOn("pub.status", "=", db.raw("'published'"));
    })
    .where("draft.status", "draft")
    .whereNull("draft.template_page_id")
    .whereNotNull("pub.template_page_id")
    .select(
      "draft.id as draft_id",
      "draft.path",
      "draft.project_id",
      "pub.template_page_id as source_tpl",
    );
  console.log(`Found ${orphanDrafts.length} orphan drafts to fix`);
  for (const d of orphanDrafts) {
    console.log(`  draft ${d.draft_id} (path=${d.path}) -> tpl=${d.source_tpl}`);
    await db("website_builder.pages")
      .where("id", d.draft_id)
      .update({ template_page_id: d.source_tpl, updated_at: db.fn.now() });
  }
  console.log("done");
  await db.destroy();
})().catch(e => { console.error(e); process.exit(1); });
