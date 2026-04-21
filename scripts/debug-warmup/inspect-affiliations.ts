import * as dotenv from "dotenv";
dotenv.config({ path: "/Users/rustinedave/Desktop/alloro/.env" });
import db from "../../src/database/connection";

const PROJECT_ID = "99fd9fdc-f53d-4602-8e4a-3c770d739bf5";

function norm(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p : (p?.sections || []); } catch { return []; }
  }
  if (raw && typeof raw === "object") return (raw as any).sections || [];
  return [];
}

(async () => {
  const pages = await db("website_builder.pages")
    .where({ project_id: PROJECT_ID, path: "/" })
    .orderBy("updated_at", "desc")
    .select("id", "status", "sections", "template_page_id");
  const draft = pages.find((p) => p.status === "draft") || pages[0];
  if (!draft) { console.log("no page"); await db.destroy(); return; }

  const secs = norm(draft.sections);
  const assoc = secs.find((s: any) => /association|affiliat|member|cert|trust/i.test(s.name || ""));
  console.log(`=== GENERATED ${assoc?.name} ===\n`);
  if (assoc) console.log(assoc.content);

  if (draft.template_page_id) {
    const tp = await db("website_builder.template_pages")
      .where("id", draft.template_page_id)
      .select("sections", "name")
      .first();
    const tsecs = norm(tp.sections);
    const tassoc = tsecs.find((s: any) => /association|affiliat|member|cert|trust/i.test(s.name || ""));
    console.log(`\n\n=== TEMPLATE ${tassoc?.name} ===\n`);
    if (tassoc) console.log(tassoc.content);
  }

  const proj = await db("website_builder.projects")
    .where("id", PROJECT_ID)
    .select("project_identity")
    .first();
  const identity = typeof proj.project_identity === "string" ? JSON.parse(proj.project_identity) : proj.project_identity;
  const imgs = identity?.extracted_assets?.images || [];
  console.log(`\n\n=== BADGE/CERT IMAGES in manifest ===\n`);
  const badges = imgs.filter((i: any) => /cert|trust|badge|logo|award|diplomat/i.test((i.use_case || "") + " " + (i.description || "")));
  console.log(`Found ${badges.length} badge-ish images:`);
  for (const b of badges.slice(0, 15)) {
    console.log(`  use_case: ${b.use_case}`);
    console.log(`  desc: ${(b.description || "").slice(0, 140)}`);
    console.log(`  s3: ${b.s3_url}\n`);
  }

  await db.destroy();
})().catch(e => { console.error(e); process.exit(1); });
