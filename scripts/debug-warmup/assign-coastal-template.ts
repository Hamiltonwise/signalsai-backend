/**
 * One-off: assign Alloro Dental Template to the Coastal project so its Layouts
 * tab has layout_slots to render.
 */
import * as dotenv from "dotenv";
dotenv.config({ path: "/Users/rustinedave/Desktop/alloro/.env" });

import db from "../../src/database/connection";

const PROJECT_ID = "99fd9fdc-f53d-4602-8e4a-3c770d739bf5";
const TEMPLATE_ID = "2d325d15-bcdb-4157-b983-3d7b21f72b82"; // Alloro Dental Template

(async () => {
  const before = await db("website_builder.projects")
    .where("id", PROJECT_ID)
    .select("template_id")
    .first();

  console.log(`before: template_id=${before?.template_id ?? "(null)"}`);

  const updated = await db("website_builder.projects")
    .where("id", PROJECT_ID)
    .update({ template_id: TEMPLATE_ID, updated_at: db.fn.now() });

  const after = await db("website_builder.projects")
    .where("id", PROJECT_ID)
    .select("template_id")
    .first();

  console.log(`updated rows: ${updated}`);
  console.log(`after:  template_id=${after?.template_id}`);

  await db.destroy();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
