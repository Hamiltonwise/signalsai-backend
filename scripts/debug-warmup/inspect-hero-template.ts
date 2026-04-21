import * as dotenv from "dotenv";
dotenv.config({ path: "/Users/rustinedave/Desktop/alloro/.env" });
import db from "../../src/database/connection";

(async () => {
  const pages = await db("website_builder.pages")
    .where({ project_id: "99fd9fdc-f53d-4602-8e4a-3c770d739bf5", path: "/" })
    .select("id", "status", "generation_status", "template_page_id", "updated_at");
  console.log(`Found ${pages.length} homepage rows:`);
  for (const p of pages) {
    console.log(`  id=${p.id} status=${p.status} gen=${p.generation_status} tpl=${p.template_page_id} at=${p.updated_at}`);
  }
  console.log();

  // Fetch template hero from Alloro Dental template
  const tps = await db("website_builder.template_pages").select("id", "name", "template_id", "sections");
  for (const tp of tps) {
    const raw = tp.sections;
    const arr = Array.isArray(raw) ? raw : typeof raw === "string" ? JSON.parse(raw) : raw;
    const sections = Array.isArray(arr) ? arr : arr?.sections || [];
    const hero = sections.find((s: any) => String(s.name || "").includes("hero"));
    if (hero && tp.name === "Homepage") {
      console.log(`=== Template Page "${tp.name}" (${tp.id}) hero section ===`);
      console.log(`section name: ${hero.name}`);
      console.log(hero.content.slice(0, 3000));
      console.log("...");
      console.log();
    }
  }
  await db.destroy();
})().catch((e) => { console.error(e); process.exit(1); });
