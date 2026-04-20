/**
 * Show which template the Coastal project is using and whether the template
 * has layout_slots defined. Diagnoses "No layout slots defined for this template."
 */
import * as dotenv from "dotenv";
dotenv.config({ path: "/Users/rustinedave/Desktop/alloro/.env" });

import db from "../../src/database/connection";

const PROJECT_ID = "99fd9fdc-f53d-4602-8e4a-3c770d739bf5";

(async () => {
  const project = await db("website_builder.projects")
    .where("id", PROJECT_ID)
    .select("id", "display_name", "template_id")
    .first();

  if (!project) {
    console.log("project not found");
    await db.destroy();
    return;
  }

  console.log(`project:     ${project.display_name}`);
  console.log(`template_id: ${project.template_id || "(null)"}`);

  if (!project.template_id) {
    console.log("\n→ project has no template_id — Layouts tab has nothing to render.");
    await db.destroy();
    return;
  }

  const tpl = await db("website_builder.templates")
    .where("id", project.template_id)
    .select("id", "name", "slug", "layout_slots", "dynamic_slots")
    .first();

  if (!tpl) {
    console.log(`\n→ template_id ${project.template_id} does NOT exist in templates table.`);
    await db.destroy();
    return;
  }

  console.log(`\ntemplate.name:          ${tpl.name}`);
  console.log(`template.slug:          ${tpl.slug}`);
  const layoutSlots = tpl.layout_slots;
  const ls = Array.isArray(layoutSlots)
    ? layoutSlots
    : typeof layoutSlots === "string"
      ? (() => { try { return JSON.parse(layoutSlots); } catch { return null; } })()
      : layoutSlots;
  console.log(`layout_slots type:      ${typeof tpl.layout_slots}`);
  console.log(`layout_slots count:     ${Array.isArray(ls) ? ls.length : "(not an array)"}`);
  if (Array.isArray(ls)) {
    for (const s of ls) {
      console.log(`  - ${s.key || s.name || JSON.stringify(s)}`);
    }
  } else {
    console.log(`layout_slots raw:       ${JSON.stringify(layoutSlots).slice(0, 300)}`);
  }

  console.log(`\n--- other templates in DB ---`);
  const all = await db("website_builder.templates")
    .select("id", "name", "slug")
    .orderBy("name");
  for (const t of all) {
    const mark = t.id === project.template_id ? " ← current" : "";
    console.log(`  ${t.slug} (${t.id})${mark}`);
  }

  await db.destroy();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
