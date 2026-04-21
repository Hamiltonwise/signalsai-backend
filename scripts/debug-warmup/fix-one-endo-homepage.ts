import * as dotenv from "dotenv";
dotenv.config({ path: "/Users/rustinedave/Desktop/alloro/.env" });
import db from "../../src/database/connection";

const PROJECT_ID = "0dcad678-2845-4c20-a298-e9c62aed9ebc";
const TEMPLATE_PAGE_ID = "f17f0735-cff9-4508-b049-70492ac486a7"; // Homepage

(async () => {
  const updated = await db("website_builder.pages")
    .where({ project_id: PROJECT_ID, path: "/" })
    .whereNull("template_page_id")
    .update({ template_page_id: TEMPLATE_PAGE_ID, updated_at: db.fn.now() });
  console.log(`Linked ${updated} homepage versions to template_page ${TEMPLATE_PAGE_ID}`);
  await db.destroy();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
