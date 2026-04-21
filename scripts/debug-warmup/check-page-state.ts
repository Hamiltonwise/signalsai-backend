import * as dotenv from "dotenv";
dotenv.config({ path: "/Users/rustinedave/Desktop/alloro/.env" });
import db from "../../src/database/connection";

(async () => {
  const pages = await db("website_builder.pages")
    .where({ project_id: "99fd9fdc-f53d-4602-8e4a-3c770d739bf5", path: "/" })
    .select("id", "status", "generation_status", "generation_progress", "template_page_id", "updated_at")
    .orderBy("updated_at", "desc");
  for (const p of pages) {
    console.log(`id=${p.id}`);
    console.log(`  status=${p.status}  gen=${p.generation_status}  tpl=${p.template_page_id}`);
    console.log(`  updated_at=${p.updated_at}`);
    console.log(`  progress=${JSON.stringify(p.generation_progress)}`);
    console.log();
  }
  await db.destroy();
})().catch(e => { console.error(e); process.exit(1); });
