import * as dotenv from "dotenv";
dotenv.config({ path: "/Users/rustinedave/Desktop/alloro/.env" });
import db from "../../src/database/connection";

(async () => {
  const pages = await db("website_builder.template_pages").select("id", "name");
  for (const p of pages) {
    const full = await db("website_builder.template_pages")
      .where("id", p.id)
      .select("sections")
      .first();
    const raw = full.sections;
    const arr = Array.isArray(raw)
      ? raw
      : typeof raw === "string"
        ? (() => { try { const j = JSON.parse(raw); return Array.isArray(j) ? j : (j?.sections || []); } catch { return []; } })()
        : (raw?.sections || []);
    console.log(`${p.name}: ${arr.length} sections`);
    for (const s of arr) {
      console.log(`  - ${s.name || "(unnamed)"}`);
    }
    console.log();
  }
  await db.destroy();
})().catch((e) => { console.error(e); process.exit(1); });
