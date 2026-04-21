import * as dotenv from "dotenv";
dotenv.config({ path: "/Users/rustinedave/Desktop/alloro/.env" });
import db from "../../src/database/connection";

const PROJECT_ID = "99fd9fdc-f53d-4602-8e4a-3c770d739bf5";

function norm(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") { try { const p = JSON.parse(raw); return Array.isArray(p) ? p : (p?.sections || []); } catch { return []; } }
  if (raw && typeof raw === "object") return (raw as any).sections || [];
  return [];
}

(async () => {
  const pages = await db("website_builder.pages")
    .where({ project_id: PROJECT_ID, path: "/" })
    .orderBy("updated_at", "desc")
    .select("id", "status", "sections", "template_page_id");
  const p = pages.find(x => x.status === "draft") || pages[0];
  const secs = norm(p.sections);
  const gallery = secs.find((s: any) => /gallery|studio|photos|inside/i.test(s.name || ""));
  console.log(`=== GENERATED ${gallery?.name} ===`);
  if (gallery) {
    console.log(gallery.content);
    const imgs = (gallery.content.match(/<img[^>]+>/g) || []);
    console.log(`\n<img> count: ${imgs.length}`);
    const placeholders = imgs.filter((i: string) => i.includes("placeholder.png")).length;
    console.log(`placeholder count: ${placeholders}`);
  }

  if (p.template_page_id) {
    const tp = await db("website_builder.template_pages")
      .where("id", p.template_page_id).select("sections").first();
    const tsecs = norm(tp.sections);
    const tgallery = tsecs.find((s: any) => /gallery|studio|photos|inside/i.test(s.name || ""));
    console.log(`\n\n=== TEMPLATE ${tgallery?.name} ===`);
    if (tgallery) {
      console.log(tgallery.content);
      const tImgs = (tgallery.content.match(/<img[^>]+>/g) || []);
      console.log(`\n<img> count in template: ${tImgs.length}`);
      const aiImages = (tgallery.content.match(/AI-IMAGE[^-]+/g) || []);
      console.log(`AI-IMAGE slots in template: ${aiImages.length}`);
    }
  }
  await db.destroy();
})().catch(e => { console.error(e); process.exit(1); });
