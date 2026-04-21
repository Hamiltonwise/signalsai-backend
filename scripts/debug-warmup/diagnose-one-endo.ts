import * as dotenv from "dotenv";
dotenv.config({ path: "/Users/rustinedave/Desktop/alloro/.env" });
import db from "../../src/database/connection";

const PROJECT_ID = "0dcad678-2845-4c20-a298-e9c62aed9ebc";
const DRAFT_PAGE_ID = "b55db71d-d1b5-4a42-8553-8e613d80efa6";

(async () => {
  const project = await db("website_builder.projects")
    .where("id", PROJECT_ID)
    .first();
  console.log("Project:", {
    id: project?.id,
    name: project?.name,
    template_id: project?.template_id,
    status: project?.status,
  });

  const pages = await db("website_builder.pages")
    .where("project_id", PROJECT_ID)
    .select(
      "id",
      "path",
      "version",
      "status",
      "template_page_id",
      "generation_status",
    )
    .orderBy("path")
    .orderBy("version");
  console.log("\nPages for this project:");
  for (const p of pages) {
    console.log(
      `  ${p.id} path=${p.path} v${p.version} ${p.status} tpl=${p.template_page_id} gen=${p.generation_status}`,
    );
  }

  if (project?.template_id) {
    const templatePages = await db("website_builder.template_pages")
      .where("template_id", project.template_id)
      .select("id", "name");
    console.log(`\nTemplate pages under template ${project.template_id}:`);
    for (const tp of templatePages) {
      console.log(`  ${tp.id} name="${tp.name}"`);
    }
  }

  const draft = pages.find((p) => p.id === DRAFT_PAGE_ID);
  console.log("\nTarget draft:", draft);

  await db.destroy();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
