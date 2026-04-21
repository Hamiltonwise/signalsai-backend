/**
 * Compare Coastal's generated hero section against the Alloro Dental
 * template's hero markup — figure out why the rendered hero has no
 * background image / photo.
 */
import * as dotenv from "dotenv";
dotenv.config({ path: "/Users/rustinedave/Desktop/alloro/.env" });

import db from "../../src/database/connection";

const PROJECT_ID = "99fd9fdc-f53d-4602-8e4a-3c770d739bf5";

function normalize(raw: unknown): Array<{ name: string; content: string }> {
  if (Array.isArray(raw)) return raw as any;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
      if (Array.isArray(parsed?.sections)) return parsed.sections;
    } catch {
      return [];
    }
  }
  if (raw && typeof raw === "object" && Array.isArray((raw as any).sections)) {
    return (raw as any).sections;
  }
  return [];
}

(async () => {
  const pages = await db("website_builder.pages")
    .where({ project_id: PROJECT_ID, path: "/" })
    .select("id", "sections", "template_page_id", "generation_status")
    .orderBy("updated_at", "desc")
    .limit(1);
  const page = pages[0];
  if (!page) {
    console.log("No homepage found for Coastal");
    await db.destroy();
    return;
  }
  console.log(`page id:        ${page.id}`);
  console.log(`status:         ${page.generation_status}`);
  console.log(`template_page:  ${page.template_page_id}\n`);

  const genSections = normalize(page.sections);
  const hero = genSections.find((s) => s.name.includes("hero"));
  console.log(`=== GENERATED HERO (${hero?.name || "NOT FOUND"}) ===\n`);
  if (hero) {
    console.log(hero.content);
    console.log("\n--- looking for image-related tokens ---");
    const imgs = hero.content.match(/<img[^>]+>/g) || [];
    console.log(`<img> tags:  ${imgs.length}`);
    for (const i of imgs) console.log(`  ${i.slice(0, 200)}`);
    const bgs = hero.content.match(/bg-\[[^\]]+\]|bg-\w+-\d+|background[^"';]+/g) || [];
    console.log(`bg-*/background hits (first 20):`);
    for (const b of bgs.slice(0, 20)) console.log(`  ${b}`);
  }

  if (page.template_page_id) {
    const tp = await db("website_builder.template_pages")
      .where("id", page.template_page_id)
      .select("name", "sections")
      .first();
    const tplSections = normalize(tp.sections);
    const tplHero = tplSections.find((s) => s.name.includes("hero"));
    console.log(`\n\n=== TEMPLATE HERO (${tplHero?.name || "NOT FOUND"}) ===\n`);
    if (tplHero) {
      console.log(tplHero.content);
      console.log("\n--- looking for image-related tokens ---");
      const imgs = tplHero.content.match(/<img[^>]+>/g) || [];
      console.log(`<img> tags:  ${imgs.length}`);
      for (const i of imgs) console.log(`  ${i.slice(0, 200)}`);
      const aiImage = tplHero.content.match(/AI-IMAGE[^>]+/g) || [];
      console.log(`AI-IMAGE markers: ${aiImage.length}`);
      for (const a of aiImage) console.log(`  ${a.slice(0, 200)}`);
    }
  }

  await db.destroy();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
